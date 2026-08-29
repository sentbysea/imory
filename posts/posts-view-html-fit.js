/* =========================================================
   POSTS - HTML POST CONTENT FIT

   posts-view.js에서 분리됨.
   HTML 모드 글(카톡 대화창 재현 등 폭이 고정된 마크업일 수
   있음)이 화면보다 넓으면 postDetailContent 전체를
   축소(scale)해서 화면 안에 들어오게 한다.

   postDetailContent / postDetailContentWrap DOM 요소는
   posts.js에 있음(같은 페이지에서 함께 로드).
========================================================== */

function resetHtmlPostContentFit() {

  if (
    postDetailContent
  ) {

    postDetailContent.style.transform =
      "";


    postDetailContent.style.width =
      "";

  }


  if (
    postDetailContentWrap
  ) {

    postDetailContentWrap.style.height =
      "";

  }

}


function fitHtmlPostContentToViewport() {

  if (
    !postDetailContent ||
    !postDetailContentWrap ||
    !postDetailContent.classList.contains(
      "is-html-content"
    )
  ) {
    return;
  }


  /*
    실제로 필요한 폭을 재보기 위해
    먼저 축소 상태를 원상태로 되돌린다.
  */

  postDetailContent.style.transform =
    "none";


  postDetailContent.style.width =
    "max-content";


  const naturalWidth =
    postDetailContent.scrollWidth;

  const naturalHeight =
    postDetailContent.scrollHeight;

  const availableWidth =
    postDetailContentWrap.clientWidth;


  if (
    !naturalWidth ||
    !availableWidth ||
    naturalWidth <=
      availableWidth
  ) {

    /*
      화면보다 넓지 않으면
      축소할 필요가 없다.
    */

    postDetailContent.style.transform =
      "none";

    postDetailContent.style.width =
      "";

    postDetailContentWrap.style.height =
      "";

    return;

  }


  const scale =
    availableWidth /
    naturalWidth;


  postDetailContent.style.width =
    `${naturalWidth}px`;


  postDetailContent.style.transform =
    `scale(${scale})`;


  /*
    transform: scale()은 실제 레이아웃 공간을 줄여주지
    않으므로, wrap의 높이를 축소된 실제 높이로 직접
    지정해서 아래에 빈 공간이 남지 않게 한다.
  */

  postDetailContentWrap.style.height =
    `${
      Math.ceil(
        naturalHeight *
        scale
      )
    }px`;

}


/*
  화면 회전/창 크기 변경 시 다시 계산.
  is-html-content가 아닌 상태에서는
  fitHtmlPostContentToViewport 자체가 바로 리턴하므로 안전.
*/

window.addEventListener(
  "resize",
  () => {

    fitHtmlPostContentToViewport();

  }
);
