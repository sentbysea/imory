/* =========================================================
   QUOTE - 슬라이더 동기화 + CANVAS 배경 사진

   admin-quote.js 분할본. DOM 참조/상태는 admin-quote-refs.js에
   있음(반드시 먼저 로드돼야 함).

   내용
     1. .imory-range 슬라이더의 "채워진 구간"과 값 표시
     2. 배경 사진 올리기/지우기
     3. 미리보기를 끌어서 구도(정규화 중심) 정하기

   기준 문서: posts/style/posts-canvas-background.js
========================================================== */


/* =========================================================
   1. 슬라이더

   core/components/range.css는 채워진 구간을 CSS 변수
   --imory-range-fill로 그린다(WebKit에 ::-moz-range-progress
   같은 것이 없어서 트랙 배경을 직접 그리기 때문). 값이 바뀔
   때마다 여기서 넣어 준다.
========================================================== */

/*
  ★ 남은 슬라이더는 둘뿐이다 — 확대와 흐림.

  형광펜 높이 · 강조선 굵기 · 덮개 농도는 네모 숫자 칸으로
  바뀌었다(요구사항 1·3): 좁은 화면에서 슬라이더가 라벨 아래로
  떨어져 줄이 두 배로 늘어나는 것을 피하고, 값을 직접 칠 수 있게
  하기 위해서다. 남긴 둘은 눈으로 훑으며 맞추는 값이라 슬라이더가
  맞고, 대신 [라벨][슬라이더][값]이 **가로 한 줄**에 온다
  (.quote-setting-row--slider).
*/

const QUOTE_RANGE_BINDINGS =
  [
    [
      () => quoteBackgroundScale,
      () => quoteBackgroundScaleValue,
      value => `${value}%`
    ],
    [
      () => quoteBackgroundBlur,
      () => quoteBackgroundBlurValue,
      value => `${value}px`
    ]
  ];


function syncQuoteRangeInput(
  input,
  valueElement,
  format
) {

  if (!input) {
    return;
  }


  const min =
    Number(
      input.min
    ) ||
    0;


  const max =
    Number(
      input.max
    ) ||
    100;


  const value =
    Number(
      input.value
    ) ||
    0;


  const ratio =
    max > min
      ? (value - min) / (max - min)
      : 0;


  input.style.setProperty(
    "--imory-range-fill",
    `${Math.round(ratio * 100)}%`
  );


  if (valueElement) {

    valueElement.textContent =
      format
        ? format(value)
        : String(value);

  }

}


function syncAllQuoteRangeInputs() {

  QUOTE_RANGE_BINDINGS.forEach(
    ([
      getInput,
      getValue,
      format
    ]) => {

      syncQuoteRangeInput(
        getInput(),
        getValue(),
        format
      );

    }
  );

}


QUOTE_RANGE_BINDINGS.forEach(
  ([
    getInput,
    getValue,
    format
  ]) => {

    const input =
      getInput();


    if (!input) {
      return;
    }


    input.addEventListener(
      "input",
      () => {

        syncQuoteRangeInput(
          input,
          getValue(),
          format
        );

      }
    );

  }
);


syncAllQuoteRangeInputs();



/* =========================================================
   2. 배경 사진 올리기 / 지우기
========================================================== */

function showQuoteBackgroundMessage(
  message
) {

  if (!quoteBackgroundMessage) {
    return;
  }


  quoteBackgroundMessage.textContent =
    message ||
    "";

}


function syncQuoteBackgroundControls() {

  const hasImage =
    Boolean(
      quoteBackgroundImageUrl
    );


  if (quoteBackgroundSettings) {

    quoteBackgroundSettings.hidden =
      !hasImage;

  }


  if (quoteBackgroundRemove) {

    quoteBackgroundRemove.disabled =
      !hasImage;

  }


  showQuoteBackgroundMessage(
    hasImage
      ? ""
      : "배경 사진 없음"
  );

}


quoteBackgroundPick
  ?.addEventListener(
    "click",
    () => {

      quoteBackgroundFile
        ?.click();

    }
  );


quoteBackgroundFile
  ?.addEventListener(
    "change",
    async () => {

      const file =
        quoteBackgroundFile
          .files?.[0];


      /* 같은 파일을 다시 골라도 change가 뜨도록 */

      quoteBackgroundFile.value =
        "";


      if (!file) {
        return;
      }


      showQuoteBackgroundMessage(
        "올리는 중…"
      );


      const result =
        await uploadImoryQuoteBackground(
          file
        );


      if (!result.ok) {

        showQuoteBackgroundMessage(
          result.message
        );


        return;

      }


      /*
        ★ 사진을 바꾸면 구도는 가운데에서 새로 시작한다
        (요구사항 7) — 이전 사진 기준의 중심은 새 사진에서
        전혀 다른 자리를 가리킨다.
      */

      quoteBackgroundImageUrl =
        result.url;


      quoteBackgroundFocusX =
        0.5;


      quoteBackgroundFocusY =
        0.5;


      syncQuoteBackgroundControls();


      updateQuotePreview();

    }
  );


quoteBackgroundRemove
  ?.addEventListener(
    "click",
    () => {

      /*
        프리셋에서 주소만 지운다 — 올라간 파일 자체는 다른
        프리셋이 같은 주소를 쓰고 있을 수 있어서 지우지 않는다
        (경로를 매번 새로 만들기 때문에 덮어쓰기 사고는 없다).
      */

      quoteBackgroundImageUrl =
        "";


      quoteBackgroundFocusX =
        0.5;


      quoteBackgroundFocusY =
        0.5;


      syncQuoteBackgroundControls();


      updateQuotePreview();

    }
  );


/* =========================================================
   2-1. 이미지 크기 고정

   ★ 켜는 순간 "지금 보이는 크기"를 그대로 기준으로 잡는다
     (요구사항 2). 그렇게 하지 않으면 체크 한 번에 사진이
     껑충 뛰어서, 사용자는 방금 맞춰 둔 구도를 처음부터 다시
     잡아야 한다.

     저장하는 값은 픽셀이 아니라 **캔버스 너비에 대한 비율**
     이고, 확대 배율은 따로 곱해지므로 여기서 나눠 둔다 —
     그래야 확대 슬라이더가 두 모드에서 같은 뜻을 유지한다
     (posts/style/posts-canvas-background.js).

   ★ 재 볼 사진이 아직 없으면(로드 전) 비율을 건드리지 않는다.
     저장된 값이 있으면 그 값이 맞고, 없으면 1(= 캔버스 너비)
     에서 시작한다.
========================================================== */

/*
  고정을 켤 때 쓸 기준 비율 — "고정이 아니었다면 지금 그려졌을
  너비" ÷ 캔버스 너비다.

  ★ 그려진 <img>를 재지 않고 **계산으로** 구한다.

    재는 방식은 두 군데서 어긋난다. (1) 배경 그림의 원본 크기는
    비동기로 도착하므로 렌더 직후에는 style.width가 아직 비어
    있을 수 있고, (2) 체크박스를 누르는 순간에는 같은 change에
    걸린 다른 리스너(quoteLiveInputs)가 먼저 프리뷰를 다시 그려서
    이미 "고정된 뒤의 크기"가 그려져 있다.

    cover 배율은 상자와 원본 크기만으로 정해지므로 계산이 곧
    정답이고 타이밍을 타지 않는다(computePostBackgroundGeometry의
    coverFactor와 같은 식이다). 확대 배율은 고정일 때도 따로
    곱해지므로 여기서는 빼 둔다 — 그래야 확대 슬라이더가 두
    모드에서 같은 뜻을 유지한다.

  -> 비율, 또는 아직 알 수 없으면 null
*/

function quoteLooseBackgroundWidthRatio() {

  const url =
    quoteBackgroundImageUrl;


  if (!url) {
    return null;
  }


  const natural =
    postBackgroundNaturalSize(
      url
    );


  if (!natural) {
    return null;
  }


  const page =
    quotePreviewCanvas
      ?.querySelector(
        ".post-editor-preview-page:not([hidden])"
      ) ||
    quotePreviewCanvas
      ?.querySelector(
        ".post-editor-preview-page"
      );


  const boxWidth =
    page?.offsetWidth ||
    0;

  const boxHeight =
    page?.offsetHeight ||
    0;


  if (
    boxWidth <= 0 ||
    boxHeight <= 0
  ) {

    return null;

  }


  const coverFactor =
    Math.max(
      boxWidth / natural.width,
      boxHeight / natural.height
    );


  return (
    natural.width *
    coverFactor /
    boxWidth
  );

}


quoteBackgroundFixedSize
  ?.addEventListener(
    "change",
    () => {

      if (
        quoteBackgroundFixedSize.checked
      ) {

        const measured =
          quoteLooseBackgroundWidthRatio();


        if (
          measured !== null
        ) {

          quoteBackgroundWidthRatio =
            measured;

        }

      }


      updateQuotePreview();

    }
  );


syncQuoteBackgroundControls();



/* =========================================================
   3. 미리보기를 끌어서 구도 정하기

   ★ 기존 핀치 제스처와 부딪히지 않는다

     admin-quote-preview-gesture.js는 포인터가 **둘일 때만**
     동작한다(핀치)와 더블탭뿐이다. 여기서는 포인터가 하나일
     때만 배경을 끌고, 두 번째 손가락이 닿는 순간 즉시 손을
     뗀다 — 핀치가 그대로 살아난다.

     그 파일이 quotePreviewStage에 setPointerCapture를 걸기
     때문에, 이쪽 리스너도 **같은 요소**에 건다(캡처된 뒤에는
     그 요소로만 이벤트가 간다).
========================================================== */

let quoteBackgroundDrag =
  null;


let quoteBackgroundActivePointers =
  0;


function quoteBackgroundPageAt(
  target
) {

  const page =
    target
      ?.closest?.(
        ".post-editor-preview-page"
      );


  if (
    !page ||
    !page.querySelector(
      `.${POST_BACKGROUND_WRAPPER_CLASS}`
    )
  ) {

    return null;

  }


  return page;

}


quotePreviewStage
  ?.addEventListener(
    "pointerdown",
    event => {

      quoteBackgroundActivePointers += 1;


      /*
        두 번째 손가락 — 핀치다. 배경 끌기는 즉시 그만둔다.
      */

      if (
        quoteBackgroundActivePointers > 1
      ) {

        quoteBackgroundDrag =
          null;


        return;

      }


      if (!quoteBackgroundImageUrl) {
        return;
      }


      const page =
        quoteBackgroundPageAt(
          event.target
        );


      if (!page) {
        return;
      }


      const wrapper =
        page.querySelector(
          `.${POST_BACKGROUND_WRAPPER_CLASS}`
        );


      const drawnWidth =
        Number(
          wrapper.dataset.drawnWidth
        ) ||
        0;


      const drawnHeight =
        Number(
          wrapper.dataset.drawnHeight
        ) ||
        0;


      if (
        drawnWidth <= 0 ||
        drawnHeight <= 0
      ) {
        return;
      }


      const rect =
        page.getBoundingClientRect();


      quoteBackgroundDrag =
        {

          pointerId:
            event.pointerId,

          scale:
            page.offsetWidth > 0
              ? rect.width / page.offsetWidth
              : 1,

          drawnWidth,

          drawnHeight,

          startX:
            event.clientX,

          startY:
            event.clientY,

          focusX:
            quoteBackgroundFocusX,

          focusY:
            quoteBackgroundFocusY

        };

    }
  );


quotePreviewStage
  ?.addEventListener(
    "pointermove",
    event => {

      if (
        !quoteBackgroundDrag ||
        event.pointerId !==
          quoteBackgroundDrag.pointerId
      ) {
        return;
      }


      const drag =
        quoteBackgroundDrag;


      const dx =
        (
          event.clientX -
          drag.startX
        ) / (drag.scale || 1);


      const dy =
        (
          event.clientY -
          drag.startY
        ) / (drag.scale || 1);


      /*
        포인터가 옮긴 만큼 그림도 같이 움직인다 — 중심을 반대
        방향으로 밀면 된다. 범위를 벗어난 값은 구도 계산 쪽에서
        잘라내므로(clampPostBackgroundFocus) 빈 공간이 드러나지
        않는다.
      */

      quoteBackgroundFocusX =
        drag.focusX -
        dx / drag.drawnWidth;


      quoteBackgroundFocusY =
        drag.focusY -
        dy / drag.drawnHeight;


      updateQuotePreview();


      event.preventDefault();

    }
  );


[
  "pointerup",
  "pointercancel"
].forEach(
  type => {

    quotePreviewStage
      ?.addEventListener(
        type,
        event => {

          quoteBackgroundActivePointers =
            Math.max(
              0,
              quoteBackgroundActivePointers - 1
            );


          if (
            quoteBackgroundDrag &&
            event.pointerId ===
              quoteBackgroundDrag.pointerId
          ) {

            /*
              끌기가 끝나면 화면이 실제로 쓴 값(자른 뒤의 중심)을
              다시 읽어와 저장값으로 삼는다 — 그래야 다음 끌기가
              지금 보이는 자리에서 이어진다.
            */

            const page =
              quotePreviewPages?.[
                quotePreviewPageIndex
              ];


            const wrapper =
              page?.querySelector(
                `.${POST_BACKGROUND_WRAPPER_CLASS}`
              );


            if (wrapper) {

              const clamped =
                clampPostBackgroundFocus(
                  {
                    focusX: quoteBackgroundFocusX,
                    focusY: quoteBackgroundFocusY,
                    boxWidth: page.offsetWidth,
                    boxHeight: page.offsetHeight,
                    width:
                      Number(
                        wrapper.dataset.drawnWidth
                      ) || 0,
                    height:
                      Number(
                        wrapper.dataset.drawnHeight
                      ) || 0
                  }
                );


              quoteBackgroundFocusX =
                clamped.focusX;


              quoteBackgroundFocusY =
                clamped.focusY;

            }


            quoteBackgroundDrag =
              null;

          }

        }
      );

  }
);
