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


   ★ 사진이 캔버스보다 작아도 된다 (예전 규칙을 철회함)

     예전에는 배율 1 = cover가 **최소**여서 사진이 늘 캔버스를
     빈틈없이 덮었다. 지금은 0.5까지 줄일 수 있고, 줄여서 드러난
     둘레는 캔버스 배경색이 그대로 보인다. 원본 비율은 어느
     쪽으로도 유지된다(두 축에 같은 수를 곱한다).

     중심(focus)은 여전히 유효 범위로 자르지만 그 범위의 뜻이
     크기에 따라 뒤집힌다(clampPostBackgroundFocus):

       사진 ≥ 캔버스   캔버스 밖으로 빈틈이 생기지 않는 범위
       사진 < 캔버스   사진이 캔버스 밖으로 삐져나가지 않는 범위

     두 경우 모두 "0.5(가운데)를 품는 구간"이라 한 식으로 쓴다.


   ★ 이미지 크기 고정 (backgroundImageFixedSize)

     cover는 캔버스 **높이**에 따라 사진 크기가 달라진다 — 같은
     발췌라도 페이지가 길면 사진 속 사물이 커진다. 고정을 켜면
     표시 너비를 **캔버스 너비에 대한 비율**로 잡아서, 높이가
     달라져도 사물 크기가 같고 늘어난 만큼 바탕만 넓어진다.
     첫 페이지 높이 같은 것을 기준으로 삼지 않으므로, 첫 장의
     글 길이가 바뀌어도 사진 크기는 그대로다.


   ★ 흐림이 사진 크기를 바꾸지 않는다

     filter: blur()는 요소의 가장자리에서 바깥의 "없음"과 섞여
     투명해진다. 사진이 캔버스를 덮고 있을 때는 그 흐려진 테두리가
     눈에 들어오면 안 되므로, 이미지를 blur의 3배만큼 크게 그리고
     (overhang) 감싸는 상자가 초과분을 잘라낸다.

     ★ 그 여유는 "사진이 어차피 캔버스를 덮는" 경우에만 준다.
     크기를 고정했거나 사용자가 사진을 캔버스보다 작게 줄인
     경우에는 여유를 주지 않는다 — 흐림 때문에 사용자가 정한
     크기가 멋대로 커지면 안 되고, 그 경우 흐려진 가장자리는
     배경색으로 자연스럽게 잦아드는 편이 맞다.


   classic script. posts/style/posts-body-layout.js가 먼저
   로드돼야 한다.
========================================================== */


const POST_BACKGROUND_WRAPPER_CLASS =
  "post-page-background";

const POST_BACKGROUND_IMAGE_CLASS =
  "post-page-background-image";

const POST_BACKGROUND_OVERLAY_CLASS =
  "post-page-background-overlay";


/*
  저장/렌더가 받아들이는 범위. 폼의 슬라이더(50~150%)보다 넓다 —
  이 범위를 좁히면 예전 슬라이더(100~300%)로 저장해둔 프리셋이
  **열기만 해도** 깎여 나가기 때문이다. 폼 쪽 호환 처리는
  admin/quote/admin-quote-apply-preset.js에 있다.
*/

const POST_BACKGROUND_MIN_SCALE =
  0.5;

const POST_BACKGROUND_MAX_SCALE =
  3;


/* 폼 슬라이더가 기본으로 보여주는 구간(%) */

const POST_BACKGROUND_UI_MIN_SCALE =
  50;

const POST_BACKGROUND_UI_MAX_SCALE =
  150;

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

    /*
      크기 정책은 프리셋에만 있다 — 발췌(view)는 사진과 구도만
      바꿔 낀다. 그래서 사진을 교체해도 고정 여부·비율·흐림·
      덮개는 프리셋 값 그대로 남는다(요구사항 8).
    */

    fixedSize:
      resolved.backgroundImageFixedSize === true,

    widthRatio:
      clampPostBackgroundWidthRatio(
        resolved.backgroundImageWidthRatio
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


/*
  고정 크기의 "캔버스 너비 대비 표시 너비". 0.05~4로만 자른다 —
  범위를 좁게 잡으면 아주 작은 장식 사진이나 일부러 넘치게 둔
  구도를 표현할 수 없다.
*/

const POST_BACKGROUND_MIN_WIDTH_RATIO =
  0.05;

const POST_BACKGROUND_MAX_WIDTH_RATIO =
  4;


function clampPostBackgroundWidthRatio(
  value
) {

  const ratio =
    postStyleNumber(
      value,
      1
    );


  if (
    !Number.isFinite(
      ratio
    ) ||
    ratio <= 0
  ) {

    return 1;

  }


  return Math.min(
    POST_BACKGROUND_MAX_WIDTH_RATIO,
    Math.max(
      POST_BACKGROUND_MIN_WIDTH_RATIO,
      ratio
    )
  );

}



/* =========================================================
   1. 구도 계산

   boxWidth/boxHeight   그려 넣을 상자(= 캔버스, 또는 캔버스 +
                        흐림 여유)
   naturalWidth/Height  원본 이미지 픽셀 크기
   scale                1 = cover(고정 아님) 또는 지정 비율 그대로
                        (고정), 0.5~3
   fixedWidthRatio      주면 "너비 = 캔버스 너비 × 이 값"으로 잡는다
                        (상자 높이를 보지 않는다 — 페이지가 길어져도
                        사진 크기가 그대로인 이유)
   sizeBoxWidth         고정 크기의 기준이 되는 **캔버스** 너비.
                        흐림 여유가 붙기 전 값이라, 여유가 붙어도
                        사진 크기가 커지지 않는다.
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
    ★ 두 가지 기준 배율 중 하나를 고른다. 어느 쪽이든 두 축에
    같은 수를 곱하므로 원본 비율은 그대로다.

      고정 아님  cover — 가로/세로 중 더 많이 키워야 하는 쪽에
                 맞춘다. 상자 **높이**가 들어가므로 페이지가
                 길어지면 사진도 커진다.
      고정       캔버스 너비 × 지정 비율 ÷ 원본 너비. 높이가
                 식에 없어서, 같은 너비라면 페이지가 아무리
                 길어져도 사진 속 사물 크기가 같다.
  */

  const fixedWidthRatio =
    Number.isFinite(
      options.fixedWidthRatio
    ) &&
    options.fixedWidthRatio > 0
      ? options.fixedWidthRatio
      : 0;


  const sizeBoxWidth =
    Math.max(
      1,
      options.sizeBoxWidth ||
      boxWidth
    );


  const baseFactor =
    fixedWidthRatio > 0
      ? (
          sizeBoxWidth *
          fixedWidthRatio
        ) / naturalWidth
      : Math.max(
          boxWidth / naturalWidth,
          boxHeight / naturalHeight
        );


  const width =
    naturalWidth *
    baseFactor *
    scale;


  const height =
    naturalHeight *
    baseFactor *
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
  중심을 유효 범위로 자른다. left = box/2 - focus*drawn 이고,
  경계 두 개(왼쪽 끝 0, 오른쪽 끝 box)를 focus로 옮기면

    left = 0    → focus = box / (2 * drawn)          … m
    left+drawn = box → focus = 1 - box / (2 * drawn) … 1 - m

  이 둘 사이가 곧 유효 구간인데, 사진이 상자보다 **큰지 작은지**에
  따라 두 값의 대소가 뒤집힌다.

    사진 ≥ 상자 (m ≤ 0.5)  [m, 1-m]     — 빈틈이 생기지 않는 범위
    사진 < 상자 (m > 0.5)  [1-m, m]     — 사진이 삐져나가지 않는 범위

  그래서 min/max를 0.5에 붙박지 않고 두 값에서 직접 고른다. 예전
  코드는 후자에서 [0.5, 0.5]로 눌러버려서, 사진을 줄이면 드래그가
  아예 먹지 않았다(그때는 줄일 수도 없었으므로 드러나지 않던 자리).
  어느 쪽이든 구간은 0.5를 품으므로 기본값은 늘 가운데다.
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
          margin,
          1 - margin
        );


      const max =
        Math.max(
          margin,
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


  /*
    ★ 흐림 여유(overhang)를 줄지 말지 — 사용자가 정한 크기를
    흐림이 키우면 안 된다(요구사항 2).

    여유를 주면 상자가 커지고, cover는 그 커진 상자에 맞춰
    사진을 더 키운다. 사진이 어차피 캔버스를 가득 덮는
    경우에는 그래야 흐려진 테두리가 안 보이지만,

      - 크기를 고정했거나
      - 사용자가 사진을 캔버스보다 작게 줄였으면

    사진이 커지는 쪽이 오히려 틀렸다. 그래서 먼저 여유 없이
    재보고, "덮고 있다"가 확인될 때만 여유를 넣어 다시 잰다.
  */

  const plain =
    computePostBackgroundGeometry(
      {
        boxWidth,
        boxHeight,

        naturalWidth:
          natural.width,

        naturalHeight:
          natural.height,

        scale:
          background.scale,

        fixedWidthRatio:
          background.fixedSize
            ? background.widthRatio
            : 0,

        sizeBoxWidth:
          boxWidth,

        focusX:
          background.focusX,

        focusY:
          background.focusY
      }
    );


  const covers =
    plain.width >= boxWidth - 0.5 &&
    plain.height >= boxHeight - 0.5;


  const overhang =
    covers
      ? postBackgroundOverhang(
          background.blur
        )
      : 0;


  const geometry =
    overhang === 0
      ? plain
      : computePostBackgroundGeometry(
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

            fixedWidthRatio:
              background.fixedSize
                ? background.widthRatio
                : 0,

            /*
              고정 크기의 기준은 늘 **캔버스** 너비다 — 여유가
              붙은 상자 너비를 쓰면 흐림이 사진을 키우게 된다.
            */

            sizeBoxWidth:
              boxWidth,

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


  /*
    ★ 덮개는 **사진 위에만** 깔린다.

    사진이 캔버스를 다 덮던 시절에는 상자 전체(inset:0)와 사진이
    같은 자리라 구분할 일이 없었다. 이제 사진을 작게 줄일 수
    있으므로, 덮개가 상자 전체를 덮으면 "드러난 자리는 지정한
    배경색"이라는 규칙이 깨진다(요구사항 2). 사진과 같은 사각형에
    맞추면 두 경우가 모두 맞는다 — 덮고 있을 때는 결과가 예전과
    같고(상자를 넘는 부분은 wrapper가 잘라낸다), 줄였을 때는
    바탕이 배경색 그대로 남는다.
  */

  if (overlay) {

    overlay.style.right =
      "auto";

    overlay.style.bottom =
      "auto";


    overlay.style.left =
      `${geometry.left - overhang}px`;


    overlay.style.top =
      `${geometry.top - overhang}px`;


    overlay.style.width =
      `${geometry.width}px`;


    overlay.style.height =
      `${geometry.height}px`;

  }


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

     캔버스 2D의 ctx.filter가 있으면 그걸 쓴다(브라우저가 직접
     그리므로 가장 빠르다). ctx.filter가 없는 환경 — Playwright
     WebKit 실측: 값을 넣어도 읽으면 undefined — 에서는 픽셀을
     직접 흐리는 폴백으로 간다(아래 5절). 어느 쪽이든 저장되는
     PNG에는 화면과 같은 흐림이 들어간다.

     ★ 배경 <img> 하나만 다룬다. 글·덮개·사진의 자리와 크기는
     건드리지 않는다 — 이 함수가 바꾸는 것은 그 <img>의 src와
     style.filter뿐이고, 구운 그림은 원래 그림과 **같은 픽셀
     크기 비율**이라 레이아웃이 움직이지 않는다.

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


    if (!context) {

      return noop;

    }


    /*
      ★ 판정은 반드시 **대입하기 전에** 한다.

      WebKit(Safari 26 실측)에는 ctx.filter가 아예 없다 — 읽으면
      undefined다. 그런데 대입은 조용히 받는다. 인터페이스에 없는
      이름이라 그냥 평범한 JS 프로퍼티가 하나 붙는 것뿐이고, 그
      뒤에 읽으면 방금 넣은 문자열이 그대로 나온다. 그리기에는
      아무 영향이 없다. 그래서 "넣고 읽어서 확인"하면 **지원한다고
      잘못 판정한다**(실제로 이렇게 틀렸다). 대입 전 typeof가
      유일하게 믿을 수 있는 신호다.
    */

    const radius =
      blur * scale;


    let nativeFilter =
      typeof context.filter === "string";


    if (nativeFilter) {

      try {

        context.filter =
          `blur(${radius}px)`;


        nativeFilter =
          typeof context.filter === "string" &&
          context.filter.indexOf("blur") === 0;

      }

      catch (filterError) {

        nativeFilter =
          false;

      }

    }


    if (!nativeFilter) {

      try {

        context.filter =
          "none";

      }

      catch (resetError) {

        /* filter 자체가 없는 환경 — 대입 실패는 무시한다 */

      }

    }


    context.drawImage(
      image,
      0,
      0,
      width,
      height
    );


    if (!nativeFilter) {

      /*
        ctx.filter가 없다 — 픽셀을 직접 흐린다(5절). 실패하면
        false를 돌려주고, 그 경우에만 예전처럼 원본 그대로 둔다.
      */

      const blurred =
        blurCanvasPixelsInPlace(
          canvas,
          context,
          radius
        );


      if (!blurred) {

        return noop;

      }

    }


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



/* =========================================================
   5. 흐림 폴백 — ctx.filter가 없는 환경(WebKit)

   ★ 왜 필요한가

     흐림을 PNG에 굽는 길이 ctx.filter 하나뿐이면, 그게 없는
     브라우저에서는 "화면은 흐린데 저장본만 또렷한" 결과가 나온다.
     export가 성공해도 미리보기와 저장 결과가 다르면 이 기능은
     완성이 아니다. 그래서 브라우저의 필터에 기대지 않고 **픽셀을
     직접** 흐리는 길을 둔다.

   ★ 무엇과 같아야 하나 — CSS filter: blur(N px)

     CSS의 blur(N)은 표준편차 N의 가우시안이다. 여기서는 박스
     블러 3회로 그 가우시안을 근사한다(Wells 1986의 폭 계산 —
     3회면 오차가 눈으로 구분되지 않는다). 박스 블러는 누적합을
     쓰므로 반지름이 커져도 픽셀당 비용이 일정하다.

   ★ 가장자리 처리도 CSS와 같아야 한다

     CSS blur는 요소 **바깥**을 "없음"(투명)으로 보고 섞는다 —
     그래서 가장자리가 투명하게 잦아든다. ctx.filter로 그린
     경우도 똑같다. 그래서 여기서도 창 밖을 0으로 둔다(누적합에
     범위 밖을 더하지 않는다). 가장자리를 복제(clamp)하면 화면과
     다른 그림이 된다.

     알파가 섞이므로 **미리 곱한(premultiplied)** 상태로 흐린
     뒤에 되돌린다. 안 그러면 투명한 가장자리의 색이 안쪽으로
     번져 테두리가 생긴다.

   ★ 모바일의 큰 사진 — 줄여서 흐리고 다시 늘린다

     흐린 그림은 정의상 저주파라, 반지름에 비해 충분히 작은
     축소는 눈에 보이는 차이를 만들지 않는다. 픽셀 수가 예산을
     넘고 반지름이 충분히 크면 1/2~1/4로 줄여서 흐린 뒤 되돌린다
     (반지름도 같은 비율로 줄인다). 줄인 뒤에도 반지름이 2px
     아래로 내려가지 않는 선까지만 줄인다 — 그 아래로 가면
     근사가 눈에 띄기 시작한다.

     축소하지 않을 때의 비용은 픽셀당 (3회 × 가로/세로 2방향 ×
     4채널)의 덧셈 두 번이다.

   -> true면 canvas 안의 그림이 흐려졌다.
      false면 아무 것도 하지 못했다(호출부가 원본 그대로 둔다).
========================================================== */

/*
  전체 픽셀 예산. 이 수를 넘으면 줄여서 흐린다.
  1.2M px ≈ 1100×1100.
*/

const POST_BLUR_PIXEL_BUDGET =
  1200 * 1000;


/* 줄인 뒤에도 이 반지름 아래로는 내려가지 않는다 */

const POST_BLUR_MIN_DOWNSCALED_RADIUS =
  2;


/* 줄이는 최대 배수 */

const POST_BLUR_MAX_DOWNSCALE =
  4;


function blurCanvasPixelsInPlace(
  canvas,
  context,
  radius
) {

  const width =
    canvas.width;

  const height =
    canvas.height;


  if (
    !(radius > 0.5) ||
    width < 1 ||
    height < 1
  ) {

    return false;

  }


  try {

    const step =
      choosePostBlurDownscale(
        width,
        height,
        radius
      );


    if (step > 1) {

      return blurCanvasPixelsDownscaled(
        canvas,
        context,
        radius,
        step
      );

    }


    const imageData =
      context.getImageData(
        0,
        0,
        width,
        height
      );


    blurImageDataInPlace(
      imageData,
      radius
    );


    context.putImageData(
      imageData,
      0,
      0
    );


    return true;

  }

  catch (error) {

    console.warn(
      "[posts-canvas-background] 픽셀 흐림 실패",
      error
    );


    return false;

  }

}


function choosePostBlurDownscale(
  width,
  height,
  radius
) {

  const pixels =
    width * height;


  if (
    pixels <= POST_BLUR_PIXEL_BUDGET
  ) {

    return 1;

  }


  /* 예산에 맞추려면 몇 배로 줄여야 하는가 */

  const byBudget =
    Math.ceil(
      Math.sqrt(
        pixels /
        POST_BLUR_PIXEL_BUDGET
      )
    );


  /* 반지름이 허락하는 최대 배수 */

  const byRadius =
    Math.floor(
      radius /
      POST_BLUR_MIN_DOWNSCALED_RADIUS
    );


  return Math.max(
    1,
    Math.min(
      POST_BLUR_MAX_DOWNSCALE,
      byBudget,
      byRadius
    )
  );

}


function blurCanvasPixelsDownscaled(
  canvas,
  context,
  radius,
  step
) {

  const width =
    canvas.width;

  const height =
    canvas.height;


  const smallWidth =
    Math.max(
      1,
      Math.round(
        width / step
      )
    );

  const smallHeight =
    Math.max(
      1,
      Math.round(
        height / step
      )
    );


  const small =
    document.createElement(
      "canvas"
    );


  small.width =
    smallWidth;

  small.height =
    smallHeight;


  const smallContext =
    small.getContext(
      "2d"
    );


  if (!smallContext) {

    return false;

  }


  smallContext.imageSmoothingEnabled =
    true;


  smallContext.drawImage(
    canvas,
    0,
    0,
    smallWidth,
    smallHeight
  );


  const imageData =
    smallContext.getImageData(
      0,
      0,
      smallWidth,
      smallHeight
    );


  /*
    실제 축소 배수는 반올림 때문에 step과 미세하게 다를 수 있다 —
    반지름은 그 실제 비율로 줄인다.
  */

  blurImageDataInPlace(
    imageData,
    radius *
    (
      (
        smallWidth / width +
        smallHeight / height
      ) / 2
    )
  );


  smallContext.putImageData(
    imageData,
    0,
    0
  );


  /*
    되돌릴 때 캔버스를 먼저 비운다 — 확대한 그림의 투명한
    가장자리 아래로 원본의 또렷한 테두리가 비치면 안 된다.
  */

  context.clearRect(
    0,
    0,
    width,
    height
  );


  context.imageSmoothingEnabled =
    true;


  context.drawImage(
    small,
    0,
    0,
    width,
    height
  );


  return true;

}


/* =========================================================
   ImageData 하나를 제자리에서 흐린다 (premultiplied · zero pad)
========================================================== */

function blurImageDataInPlace(
  imageData,
  radius
) {

  const width =
    imageData.width;

  const height =
    imageData.height;


  const data =
    imageData.data;


  const sizes =
    postBlurBoxSizes(
      radius
    );


  if (!sizes.length) {

    return;

  }


  const count =
    width * height;


  const plane =
    new Float32Array(
      count
    );

  const scratch =
    new Float32Array(
      count
    );


  /* R·G·B는 알파를 곱한 채로 흐린다 */

  for (
    let channel = 0;
    channel < 4;
    channel += 1
  ) {

    for (
      let index = 0;
      index < count;
      index += 1
    ) {

      const base =
        index * 4;


      plane[index] =
        channel === 3
          ? data[base + 3]
          : (
              data[base + channel] *
              data[base + 3]
            ) / 255;

    }


    for (
      let pass = 0;
      pass < sizes.length;
      pass += 1
    ) {

      const r =
        (
          sizes[pass] - 1
        ) / 2;


      if (r < 1) {

        continue;

      }


      postBlurBoxHorizontal(
        plane,
        scratch,
        width,
        height,
        r
      );


      postBlurBoxVertical(
        scratch,
        plane,
        width,
        height,
        r
      );

    }


    for (
      let index = 0;
      index < count;
      index += 1
    ) {

      const value =
        plane[index];


      data[index * 4 + channel] =
        value < 0
          ? 0
          : value > 255
            ? 255
            : value;

    }

  }


  /* 곱해 둔 알파를 되돌린다 */

  for (
    let index = 0;
    index < count;
    index += 1
  ) {

    const base =
      index * 4;


    const alpha =
      data[base + 3];


    if (alpha === 0) {

      data[base] = 0;
      data[base + 1] = 0;
      data[base + 2] = 0;


      continue;

    }


    if (alpha === 255) {

      continue;

    }


    for (
      let channel = 0;
      channel < 3;
      channel += 1
    ) {

      const value =
        (
          data[base + channel] * 255
        ) / alpha;


      data[base + channel] =
        value > 255
          ? 255
          : value;

    }

  }

}


/* =========================================================
   가우시안 σ를 박스 블러 3회의 폭으로 (Wells 1986)
========================================================== */

function postBlurBoxSizes(
  sigma
) {

  const passes =
    3;


  const ideal =
    Math.sqrt(
      (
        12 * sigma * sigma /
        passes
      ) + 1
    );


  let lower =
    Math.floor(
      ideal
    );


  if (lower % 2 === 0) {

    lower -= 1;

  }


  if (lower < 1) {

    lower = 1;

  }


  const upper =
    lower + 2;


  const split =
    Math.round(
      (
        12 * sigma * sigma -
        passes * lower * lower -
        4 * passes * lower -
        3 * passes
      ) /
      (
        -4 * lower - 4
      )
    );


  const sizes =
    [];


  for (
    let index = 0;
    index < passes;
    index += 1
  ) {

    sizes.push(
      index < split
        ? lower
        : upper
    );

  }


  return sizes;

}


/* =========================================================
   박스 블러 한 방향 — 누적합, 창 밖은 0

   범위 밖을 더하지 않으므로 가장자리가 투명하게 잦아든다
   (CSS blur와 같은 처리). 반지름이 커져도 픽셀당 비용은 같다.
========================================================== */

function postBlurBoxHorizontal(
  source,
  target,
  width,
  height,
  radius
) {

  const norm =
    1 / (
      2 * radius + 1
    );


  for (
    let y = 0;
    y < height;
    y += 1
  ) {

    const row =
      y * width;


    let sum =
      0;


    const first =
      Math.min(
        radius,
        width - 1
      );


    for (
      let x = 0;
      x <= first;
      x += 1
    ) {

      sum += source[row + x];

    }


    for (
      let x = 0;
      x < width;
      x += 1
    ) {

      target[row + x] =
        sum * norm;


      const add =
        x + radius + 1;

      const drop =
        x - radius;


      if (add < width) {

        sum += source[row + add];

      }


      if (drop >= 0) {

        sum -= source[row + drop];

      }

    }

  }

}


function postBlurBoxVertical(
  source,
  target,
  width,
  height,
  radius
) {

  const norm =
    1 / (
      2 * radius + 1
    );


  for (
    let x = 0;
    x < width;
    x += 1
  ) {

    let sum =
      0;


    const first =
      Math.min(
        radius,
        height - 1
      );


    for (
      let y = 0;
      y <= first;
      y += 1
    ) {

      sum += source[y * width + x];

    }


    for (
      let y = 0;
      y < height;
      y += 1
    ) {

      target[y * width + x] =
        sum * norm;


      const add =
        y + radius + 1;

      const drop =
        y - radius;


      if (add < height) {

        sum += source[add * width + x];

      }


      if (drop >= 0) {

        sum -= source[drop * width + x];

      }

    }

  }

}
