/* =========================================================
   POSTS - READER FONT SCALE

   실제 발행된 글 제목 옆의 -/+ 버튼. 방문자가 본문 글자
   크기를 직접 조절할 수 있게 함(프리셋이 정한 기준 크기에
   비율을 곱하는 방식이라 프리셋 자체는 그대로 유지됨).
   선택한 비율은 이 브라우저에 localStorage로 저장되어
   다음 방문에도 유지된다.

   HTML 모드 글은 프리셋 기준 크기가 없어서(원본 마크업을
   그대로 출력) 대상에서 제외 — posts-view.js의
   renderPostDetailBody가 richtext일 때만 이 파일의 함수를
   불러준다.

   postDetailContent 등 DOM 요소는 posts.js에 있음
   (같은 페이지에서 함께 로드되어야 함).
========================================================== */

const READER_FONT_SCALE_KEY =
  "vibeme-reader-font-scale";

const READER_FONT_SCALE_MIN =
  0.85;

const READER_FONT_SCALE_MAX =
  1.35;

const READER_FONT_SCALE_STEP =
  0.1;


/*
  현재 글의 "프리셋이 정한 원래 크기"(px, 스케일 곱하기 전).
  글이 바뀔 때마다 renderPostDetailBody가 다시 설정해준다.
*/

let postDetailContentBaseFontSize =
  null;


/* =========================================================
   HIGHLIGHT-1 — 크기를 적용할 그릇

   예전에는 legacy #postDetailContent 하나뿐이었다. 지금은 published
   Skin의 post-body region에도 같은 조절이 걸려야 한다(도구 메뉴의
   "글자 크기", posts/view/posts-view-tools-menu.js) — 스킨 화면에서도
   방문자가 글자를 키울 수 있어야 하기 때문이다.

   바꾸는 것은 **이번 읽기 화면의 인라인 font-size 하나**뿐이다.
   저장된 본문도, Quote Preset도, 스킨 저장값도 건드리지 않는다
   (요구사항 3). 다음 글을 그리면 그릇이 통째로 다시 만들어지므로
   따로 되돌릴 것도 없다.
========================================================== */

let postReaderFontScaleTarget =
  null;


function setReaderFontScaleTarget(
  target
) {

  postReaderFontScaleTarget =
    target ||
    null;

}


function getReaderFontScaleTarget() {

  return (
    postReaderFontScaleTarget ||
    (
      typeof postDetailContent !== "undefined"
        ? postDetailContent
        : null
    )
  );

}


/* 도구 메뉴가 "글자 크기" 줄을 그릴지 판단할 때 쓴다 */

function readerFontScaleAdjustable() {

  return Boolean(
    postDetailContentBaseFontSize &&
    getReaderFontScaleTarget()
  );

}



/* =========================================================
   READ / WRITE 저장된 비율
========================================================== */

function getReaderFontScale() {

  let stored =
    null;


  try {

    stored =
      window.localStorage.getItem(
        READER_FONT_SCALE_KEY
      );

  }

  catch (error) {

    stored =
      null;

  }


  const parsed =
    Number(
      stored
    );


  if (
    !stored ||
    Number.isNaN(
      parsed
    )
  ) {

    return 1;

  }


  return Math.min(
    READER_FONT_SCALE_MAX,
    Math.max(
      READER_FONT_SCALE_MIN,
      parsed
    )
  );

}


function setReaderFontScale(
  scale
) {

  const clamped =
    Math.min(
      READER_FONT_SCALE_MAX,
      Math.max(
        READER_FONT_SCALE_MIN,
        Math.round(
          scale *
          100
        ) /
          100
      )
    );


  try {

    window.localStorage.setItem(
      READER_FONT_SCALE_KEY,
      String(
        clamped
      )
    );

  }

  catch (error) {

    /*
      프라이빗 브라우징 등에서 막혀도 이번 열람 동안은
      화면에 반영은 되니 그냥 무시.
    */

  }


  applyReaderFontScale(
    clamped
  );

}



/* =========================================================
   본문에 실제로 적용
========================================================== */

function applyReaderFontScale(
  scale =
    getReaderFontScale()
) {

  const target =
    getReaderFontScaleTarget();


  if (
    !target ||
    !postDetailContentBaseFontSize
  ) {

    return;

  }


  target.style.fontSize =
    `${
      postDetailContentBaseFontSize *
      scale
    }px`;


  updateReaderFontScaleButtons(
    scale
  );

}


function updateReaderFontScaleButtons(
  scale =
    getReaderFontScale()
) {

  if (
    postDetailFontScaleDown
  ) {

    postDetailFontScaleDown.disabled =
      scale <=
      READER_FONT_SCALE_MIN +
        0.001;

  }


  if (
    postDetailFontScaleUp
  ) {

    postDetailFontScaleUp.disabled =
      scale >=
      READER_FONT_SCALE_MAX -
        0.001;

  }

}



/* =========================================================
   글이 새로 렌더링될 때(posts-view.js) 호출

   렌더링 직후 실제 계산된 font-size(px)를 "기준값"으로
   붙잡아두고, 저장된 비율을 곱해서 적용한다.
========================================================== */

function initReaderFontScaleForCurrentPost(
  target
) {

  if (target !== undefined) {

    setReaderFontScaleTarget(target);

  }


  const host =
    getReaderFontScaleTarget();


  if (
    !host
  ) {

    return;

  }


  /*
    기준값은 "이 그릇이 아무 조절도 없을 때 가질 크기"다 — 이미
    인라인으로 조절해 둔 값을 다시 기준으로 삼으면 글을 열 때마다
    배율이 누적된다. 그래서 재기 전에 인라인 값을 지운다.
  */

  host.style.removeProperty(
    "font-size"
  );


  postDetailContentBaseFontSize =
    parseFloat(
      window
        .getComputedStyle(
          host
        )
        .fontSize
    ) ||
    null;


  if (
    postDetailFontScale
  ) {

    postDetailFontScale.hidden =
      !postDetailContentBaseFontSize;

  }


  if (
    !postDetailContentBaseFontSize
  ) {

    return;

  }


  applyReaderFontScale();

}


function hideReaderFontScaleControl() {

  postDetailContentBaseFontSize =
    null;


  postReaderFontScaleTarget =
    null;


  if (
    postDetailFontScale
  ) {

    postDetailFontScale.hidden =
      true;

  }

}
