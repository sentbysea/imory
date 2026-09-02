/* =========================================================
   QUOTE - PREVIEW 핀치 줌 / 더블탭 리셋

   admin-quote.js 분할본. DOM 참조는 admin-quote-refs.js,
   스케일/이동 상태(quotePreviewPanX 등)와 setQuotePreviewZoomAndPan /
   fitQuotePreview는 admin-quote-preview-update.js에 있음
   (둘 다 먼저 로드돼야 함).

   대지(.quote-preview-panel)와 설정창(.quote-controls) 사이를
   위아래로 드래그해서 나누던 이전 방식(예전 admin-quote-resize.js)은
   손잡이를 끌 때 대지가 화면 대부분을 잃어서 캔버스가 잘려
   보이는 문제가 있었다 — 구획은 이제 CSS로 고정하고, 대신
   #quotePreviewStage 안에서 두 손가락 핀치로 확대/축소한다.
   한 손가락 드래그 이동도 처음엔 같이 넣었지만 실제로 쓸 일이
   거의 없어서 뺐다 — 대신 두 번 빠르게 탭하면 fitQuotePreview()로
   전체 보기로 돌아간다(−/+/FIT 툴바도 캔버스를 가려서 없앴음).

   PINCH 공식: 두 손가락 중심(F)이 확대/축소 중에도 화면상 같은
   자리에 머물도록, 제스처 시작 시점의 캔버스 중심(C0,
   getBoundingClientRect 기준)과 그 시점의 pan/scale(pan0, s0)을
   기준으로 매 프레임 절대값으로 계산한다(이전 프레임 값을
   누적하지 않으므로 프레임을 아무리 거쳐도 오차가 안 쌓임):

     pan = pan0 + (F − C0) × (1 − scale / s0)
========================================================== */

(function () {

  if (
    !quotePreviewStage ||
    !quotePreviewCanvas
  ) {
    return;
  }


  const pointers = new Map();

  let mode = null;

  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchCenter = { x: 0, y: 0 };
  let pinchStartPan = { x: 0, y: 0 };


  /*
    더블탭 리셋 — 이 터치가 핀치를 거치지 않고(hadMultiTouch)
    작은 움직임(TAP_MAX_MOVEMENT)과 짧은 시간(TAP_MAX_DURATION)
    안에 끝나면 "탭"으로 보고, 직전 탭과 가깝고(DOUBLE_TAP_MAX_DISTANCE)
    빠르면(DOUBLE_TAP_MAX_GAP) 더블탭으로 판정해 FIT으로 되돌린다.
  */

  const TAP_MAX_MOVEMENT = 10;
  const TAP_MAX_DURATION = 400;
  const DOUBLE_TAP_MAX_GAP = 350;
  const DOUBLE_TAP_MAX_DISTANCE = 40;

  let hadMultiTouch = false;
  let tapDownPoint = { x: 0, y: 0 };
  let tapDownTime = 0;

  let lastTapTime = 0;
  let lastTapPoint = null;


  function points() {

    return Array.from(
      pointers.values()
    );

  }


  function distance(a, b) {

    return Math.hypot(
      a.x - b.x,
      a.y - b.y
    );

  }


  function midpoint(a, b) {

    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };

  }


  function beginPinch() {

    mode = "pinch";

    /*
      핀치를 시작했다는 건 이미 확대/축소 제스처를 아는
      상태이므로, 우측 상단 안내 문구를 더 이상 보여줄
      필요가 없다 — 서서히 페이드아웃(admin-quote.css의
      .quote-preview-help.is-dimmed). 더블탭으로 전체 보기로
      돌아가면(fitQuotePreview, admin-quote-preview-update.js)
      다시 페이드인.
    */

    quotePreviewHelp
      ?.classList
      .add(
        "is-dimmed"
      );


    const [a, b] = points();

    pinchStartDist = distance(a, b);

    pinchStartScale =
      getCurrentQuotePreviewScale();

    pinchStartPan = {
      x: quotePreviewPanX,
      y: quotePreviewPanY,
    };


    const rect =
      quotePreviewCanvas.getBoundingClientRect();

    pinchCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

  }


  function onPointerDown(event) {

    quotePreviewStage.setPointerCapture?.(
      event.pointerId
    );

    pointers.set(
      event.pointerId,
      {
        x: event.clientX,
        y: event.clientY,
      }
    );


    if (pointers.size === 1) {

      mode = null;

      hadMultiTouch = false;

      tapDownPoint = {
        x: event.clientX,
        y: event.clientY,
      };

      tapDownTime = Date.now();

    } else if (pointers.size === 2) {

      beginPinch();

      hadMultiTouch = true;

    }

  }


  function onPointerMove(event) {

    if (!pointers.has(event.pointerId)) {
      return;
    }


    pointers.set(
      event.pointerId,
      {
        x: event.clientX,
        y: event.clientY,
      }
    );


    if (
      mode === "pinch" &&
      pointers.size === 2
    ) {

      event.preventDefault();

      const [a, b] = points();

      const dist = distance(a, b);

      const ratio =
        pinchStartDist > 0
          ? dist / pinchStartDist
          : 1;

      const nextScale =
        pinchStartScale * ratio;

      const center = midpoint(a, b);

      const factor =
        1 - nextScale / pinchStartScale;

      setQuotePreviewZoomAndPan(
        nextScale,
        pinchStartPan.x +
          (center.x - pinchCenter.x) * factor,
        pinchStartPan.y +
          (center.y - pinchCenter.y) * factor
      );

    }

  }


  function endPointer(event) {

    if (!pointers.has(event.pointerId)) {
      return;
    }


    pointers.delete(
      event.pointerId
    );


    if (
      quotePreviewStage.hasPointerCapture?.(
        event.pointerId
      )
    ) {

      quotePreviewStage.releasePointerCapture(
        event.pointerId
      );

    }


    if (pointers.size === 0) {

      mode = null;


      const isTap =
        !hadMultiTouch &&
        Date.now() - tapDownTime <=
          TAP_MAX_DURATION &&
        distance(
          tapDownPoint,
          { x: event.clientX, y: event.clientY }
        ) <= TAP_MAX_MOVEMENT;


      if (isTap) {

        const now = Date.now();

        const isDoubleTap =
          lastTapPoint &&
          now - lastTapTime <=
            DOUBLE_TAP_MAX_GAP &&
          distance(
            lastTapPoint,
            tapDownPoint
          ) <= DOUBLE_TAP_MAX_DISTANCE;


        if (isDoubleTap) {

          fitQuotePreview();

          lastTapPoint = null;
          lastTapTime = 0;

        } else {

          lastTapPoint = tapDownPoint;
          lastTapTime = now;

        }

      } else {

        lastTapPoint = null;
        lastTapTime = 0;

      }

    }

  }


  quotePreviewStage.addEventListener(
    "pointerdown",
    onPointerDown
  );

  quotePreviewStage.addEventListener(
    "pointermove",
    onPointerMove
  );

  quotePreviewStage.addEventListener(
    "pointerup",
    endPointer
  );

  quotePreviewStage.addEventListener(
    "pointercancel",
    endPointer
  );

})();
