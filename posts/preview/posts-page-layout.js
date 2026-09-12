/* =========================================================
   POSTS - PREVIEW: 페이지 한 장 만들기 + 페이지 나누기 (공용)

   기준 문서: IMORY_QUOTE_PRESET_RENDER_AUDIT.md

   ★ 이 파일은 전역 상태를 읽지 않는다.

     settings(프리셋 값) · source(이미 그려 둔 본문 DOM) ·
     view(출력 조건: 비율 / 제목·출처 표시 / 정렬 / 출처 여백)를
     **전부 인자로** 받아서, host 안에 페이지 엘리먼트를 만들어
     넣고 그 목록을 돌려준다.

     그래서 두 화면이 같은 코드를 쓴다.

       에디터 PREVIEW   posts/preview/posts-preview-paginate.js
                        (전역 postStyleSettings + 세션 오버라이드를
                         읽어 view를 만든 뒤 여기로 넘긴다)
       Quote Preset     admin/quote/admin-quote-preview-render.js
                        (폼 입력칸을 읽어 view를 만든 뒤 여기로
                         넘긴다. 에디터 전역 상태를 건드리지 않는다)

   ★ 본문 사진

     사진 관련 함수(posts/preview/posts-preview-images.js)는
     **있으면 쓰고 없으면 건너뛴다**. 관리 패널은 그 파일을
     로드하지 않아도 되고(샘플 본문에는 사진이 없다), 글쓰기
     화면에서는 지금까지와 똑같이 동작한다.

   classic script. 최상위 선언이 같은 전역 렉시컬 환경을
   공유한다. posts/style/posts-body-layout.js가 먼저 로드돼야
   한다.
========================================================== */


/* =========================================================
   본문 가용 너비

   ★ 예전에는 여기서 테두리 몫 2px을 빼고 있었다. 지금은
   페이지의 장식 테두리가 outline(레이아웃에 영향 없음)이라
   뺄 몫이 없다 — 두 미리보기의 본문 폭이 400/398로 갈리던
   원인(감사 §4 (A))이 이 규칙과 CSS 양쪽에서 사라졌다.
========================================================== */

function postPageBodyWidth(
  content,
  settings = {}
) {

  const measured =
    content?.clientWidth ||
    0;


  if (
    measured > 0
  ) {

    return measured;

  }


  const resolved =
    normalizePostStyleSettings(
      settings
    );


  const basePadding =
    Math.max(
      0,
      resolved.padding
    );


  const horizontalPadding =
    Math.max(
      0,
      resolved.horizontalPadding
    );


  return Math.max(
    1,
    POST_PAGE_LAYOUT_WIDTH -
    (
      basePadding +
      horizontalPadding
    ) * 2
  );

}


/* =========================================================
   출력 픽셀 크기

   레이아웃은 언제나 520px 폭이고, exportWidth는 그 위에
   곱해지는 배율일 뿐이다(레이아웃 계산과 표시/출력 배율의
   분리). 두 곳이 이 계산을 함께 쓴다.

     - Quote Preset의 "1200 × 1500" 크기 표시
     - 실제 캡처(posts/export/posts-preview-export-capture.js)

   ★ 왜 따로 계산하는가

     html2canvas는 캔버스 크기를 floor(길이 × scale)로 잡는다.
     scale = 1200/520 = 2.307692…처럼 나누어떨어지지 않으면
     650 × 2.307692… = 1499.9999999999998 이 되어 **1px이
     모자란 PNG**가 나왔다(감사 §4 (H) — 1200×1499). 여기서
     정수 픽셀을 먼저 정하고 캡처 결과를 그 크기에 맞춘다.
========================================================== */

function resolveExportPixelScale(
  exportWidth,
  layoutWidth = POST_PAGE_LAYOUT_WIDTH
) {

  const width =
    Math.max(
      1,
      Math.round(
        postStyleNumber(
          exportWidth,
          layoutWidth
        )
      )
    );


  return width / layoutWidth;

}


function resolveExportPixelWidth(
  exportWidth,
  layoutWidth = POST_PAGE_LAYOUT_WIDTH
) {

  return Math.max(
    1,
    Math.round(
      layoutWidth *
      resolveExportPixelScale(
        exportWidth,
        layoutWidth
      )
    )
  );

}


function resolveExportPixelHeight(
  exportWidth,
  layoutHeight,
  layoutWidth = POST_PAGE_LAYOUT_WIDTH
) {

  return Math.max(
    1,
    Math.round(
      layoutHeight *
      resolveExportPixelScale(
        exportWidth,
        layoutWidth
      )
    )
  );

}


/* =========================================================
   출력 조건(view) 기본값

   호출부가 빠뜨린 값은 프리셋 값을 그대로 쓴다.
========================================================== */

function resolvePostPageView(
  settings,
  view = {}
) {

  const resolved =
    normalizePostStyleSettings(
      settings
    );


  const ratio =
    view.ratio ||
    {
      width: 1,
      height: 1
    };


  return {

    ratio,

    showTitle:
      view.showTitle !==
      false,

    titleVisible:
      view.titleVisible ??
      resolved.titleEnabled,

    titleText:
      typeof view.titleText === "string"
        ? view.titleText
        : "",

    sourceVisible:
      view.sourceVisible ??
      resolved.sourceEnabled,

    sourceText:
      typeof view.sourceText === "string"
        ? view.sourceText
        : resolved.sourceText,

    verticalAlign:
      view.verticalAlign ||
      resolved.verticalAlign,

    bodyAlign:
      view.bodyAlign ||
      resolved.bodyAlign,

    sourceSpacing:
      postStyleNumber(
        view.sourceSpacing,
        resolved.sourceSpacing
      ),

    sourceBottomOffset:
      postStyleNumber(
        view.sourceBottomOffset,
        resolved.sourceBottomOffset
      )

  };

}


/* =========================================================
   PAGE TITLE
========================================================== */

function applyPostPageTitleStyle(
  title,
  settings,
  view
) {

  if (!title) {
    return;
  }


  const resolved =
    normalizePostStyleSettings(
      settings
    );


  title.hidden =
    !view.titleVisible;


  /*
    ★ GENERAL의 폰트를 body와 동일하게 그대로 따름. 인라인으로
    직접 지정하는 이유: html2canvas로 캡처(발췌 export)할 때
    조상 요소로부터 상속만 되어 있으면 가끔 못 읽어서 시스템
    명조체로 깨져 나오는 문제가 있었음.
  */

  title.style.fontFamily =
    resolved.bodyFont ===
    "nanummyeongjo"
      ? '"Nanum Myeongjo", serif'
      : '"Pretendard", sans-serif';


  title.style.color =
    resolved.titleColor;


  title.style.fontSize =
    `${resolved.titleSize}px`;


  title.style.fontWeight =
    String(
      resolved.titleWeight
    );


  title.style.textAlign =
    resolved.titleAlign;


  title.style.letterSpacing =
    `${resolved.titleLetterSpacing}px`;


  title.style.marginBottom =
    `${resolved.titleSpacing}px`;

}



/* =========================================================
   PAGE SOURCE
========================================================== */

function createPostPageSource(
  settings,
  view
) {

  const resolved =
    normalizePostStyleSettings(
      settings
    );


  const source =
    document.createElement(
      "div"
    );


  source.className =
    "post-editor-preview-source";


  source.textContent =
    view.sourceText;


  source.hidden =
    !view.sourceVisible;


  source.style.fontFamily =
    resolved.bodyFont ===
    "nanummyeongjo"
      ? '"Nanum Myeongjo", serif'
      : '"Pretendard", sans-serif';


  source.style.color =
    resolved.sourceColor;


  source.style.fontSize =
    `${resolved.sourceSize}px`;


  source.style.fontWeight =
    String(
      resolved.sourceWeight
    );


  source.style.textAlign =
    resolved.sourceAlign;


  /*
    "fixed" 모드(본문이 짧아도 캔버스 맨 아래에 고정)는
    source 자체를 건드리지 않고 createPostPageCanvas에서
    title/body를 flex:1 1 auto 그룹으로 묶는 방식으로
    구현한다 — source는 그냥 marginTop만 가진 평범한 flow
    요소로 남는다.

    ★ 원래는 두 가지를 다 시도해봤는데 둘 다 html2canvas에서
    깨졌다: (1) flex 마지막 자식에 margin-top:auto — 실제
    브라우저 미리보기는 멀쩡한데 내보낸 PNG에서만 source가
    안 보임. (2) position:absolute + bottom — 여전히 PNG에서
    안 보임. 그래서 "빈 공간을 채우는" 역할을 평범한 flex
    아이템(그룹)에 맡기고, source는 끝까지 순수 flow 요소로
    남겨서 두 문제를 모두 피한다.
  */

  source.style.marginTop =
    `${view.sourceSpacing}px`;


  /*
    캔버스 맨 아래로부터 추가로 띄울 여백(QUOTE PRESET의
    BOTTOM MARGIN).
  */

  source.style.marginBottom =
    `${
      Math.max(
        0,
        view.sourceBottomOffset
      )
    }px`;


  return source;

}



/* =========================================================
   PAGE 한 장
========================================================== */

function createPostPageCanvas(
  settings,
  view = {}
) {

  const resolved =
    normalizePostStyleSettings(
      settings
    );


  const resolvedView =
    resolvePostPageView(
      resolved,
      view
    );


  const pageRatio =
    resolvedView.ratio;


  /*
    ★ 높이를 콘텐츠에 맡기는 모드

      auto      페이지마다 자기 높이 그대로.
      uniform   분할은 auto와 **완전히 같은 방법**으로 하고,
                다 나눈 뒤에 가장 높은 페이지의 높이를 모든
                페이지에 입힌다(applyUniformPostPageHeights).
                그러려면 나누는 동안에는 auto와 똑같이
                "넘칠 자리가 없는" 상태여야 한다 — 그래서 여기
                페이지 한 장을 만드는 단계에서는 둘을 구분하지
                않는다.
  */

  const flexibleHeight =
    Boolean(
      pageRatio.auto ||
      pageRatio.uniform
    );


  const page =
    document.createElement(
      "article"
    );


  page.className =
    "post-editor-preview post-editor-preview-page";


  page.style.backgroundColor =
    resolved.background;


  /*
    ★ 안쪽 여백은 CSS 변수가 아니라 페이지 자신에게 직접
    건다. 예전에는 부모(.post-editor-preview-pages)에 CSS
    변수를 얹고 페이지가 var()로 읽었는데, 그러면 Quote Preset
    쪽 host에도 같은 변수를 심어야 하고 html2canvas가 var()를
    못 읽는 문제까지 따라온다(캡처 직전 임시 인라인화는
    posts-preview-export-capture.js에 그대로 남겨 둔다 —
    이전 배포로 그려진 DOM이나 title-gap 경로를 위해서).
  */

  const basePadding =
    Math.max(
      0,
      resolved.padding
    );


  page.style.paddingTop =
    `${basePadding + Math.max(0, resolved.verticalPadding)}px`;


  page.style.paddingBottom =
    page.style.paddingTop;


  page.style.paddingLeft =
    `${basePadding + Math.max(0, resolved.horizontalPadding)}px`;


  page.style.paddingRight =
    page.style.paddingLeft;


  /*
    ★ 높이를 CSS aspect-ratio에만 맡기지 않고 픽셀로 직접 고정.

    aspect-ratio는 "콘텐츠가 넘쳐도 박스 자체는 커지면 안 된다"는
    규칙에 의존하는데, 이게 일부 모바일 브라우저에서 완전히
    지켜지지 않으면(박스가 콘텐츠 따라 같이 늘어나면) overflow
    감지(scrollHeight > clientHeight)가 아예 걸리지 않아서
    본문이 하단 padding/출처 자리를 침범하게 된다.
  */

  page.style.width =
    `${POST_PAGE_LAYOUT_WIDTH}px`;


  const pageHeight =
    flexibleHeight
      ? null
      : Math.round(
          POST_PAGE_LAYOUT_WIDTH *
          (
            pageRatio.height /
            pageRatio.width
          )
        );


  page.style.height =
    flexibleHeight
      ? "auto"
      : `${pageHeight}px`;


  /*
    ★ aspect-ratio도 인라인으로 못박는다.

    CSS의 aspect-ratio는 var(--post-preview-aspect, 4 / 5)라
    그 변수를 심어주지 않는 host(관리 패널)에서는 기본값 4/5가
    남는다. 고정 비율일 때는 width/height가 둘 다 definite라
    무시되지만, AUTO는 height가 auto라 이 기본값이 그대로
    먹어서 "콘텐츠 높이"가 아니라 4:5 높이가 돼버린다.
  */

  page.style.aspectRatio =
    flexibleHeight
      ? "auto"
      : `${pageRatio.width} / ${pageRatio.height}`;


  page.style.display =
    "flex";


  page.style.flexDirection =
    "column";


  /*
    ★ 세로 정렬은 세 모드가 같은 값을 쓴다.

      고정 비율  예전 그대로.
      uniform    모든 페이지가 "가장 높은 페이지"의 높이로
                 늘어나므로 짧은 장에는 실제로 남는 공간이
                 생긴다 — 그 공간을 위/가운데/아래 중 어디로
                 밀지가 여기서 정해진다(예전에는 center로
                 못박혀 있어 고를 수 없었다).
      auto       페이지 높이 = 콘텐츠 높이라 남는 공간이 0이다.
                 무엇을 골라도 그려지는 결과가 같다(그래서
                 Preview는 auto에서만 이 컨트롤을 숨긴다 —
                 posts-preview-css-vars.js).
  */

  const verticalAlign =
    resolvedView.verticalAlign;


  const justifyContentValue =
    verticalAlign === "center"
      ? "center"
      : verticalAlign === "bottom"
        ? "flex-end"
        : "flex-start";


  /*
    source는 항상 캔버스 맨 아래에 고정된다. title/body를
    별도 그룹(.post-editor-preview-content-group)으로 묶어
    그 그룹에 justifyContent를 걸고, 그룹 자체를 flex:1 1 auto로
    둬서 남는 세로 공간을 전부 차지하게 한다 — 그룹이
    "스페이서 역할"까지 겸하므로 source는 캔버스 맨 아래
    (=패딩 경계)에 고정되면서, 그 안의 title/body는 원하는
    정렬대로 보인다. ratio가 AUTO면 밀어낼 여유 공간 자체가
    없으므로 이 그룹을 안 만든다.
  */

  const useFixedSourceGroup =
    !flexibleHeight &&
    resolvedView.sourceVisible;


  if (!useFixedSourceGroup) {

    page.style.justifyContent =
      justifyContentValue;

  }


  const title =
    document.createElement(
      "div"
    );


  title.className =
    "post-editor-preview-title";


  title.textContent =
    resolvedView.titleText;


  applyPostPageTitleStyle(
    title,
    resolved,
    resolvedView
  );


  const content =
    document.createElement(
      "div"
    );


  content.className =
    "post-editor-preview-content";


  applyPostBodyStyles(
    content,
    resolved
  );


  content.style.textAlign =
    resolvedView.bodyAlign;


  const source =
    createPostPageSource(
      resolved,
      resolvedView
    );


  let contentGroup =
    null;


  let bodyArea =
    null;


  if (useFixedSourceGroup) {

    contentGroup =
      document.createElement(
        "div"
      );


    contentGroup.className =
      "post-editor-preview-content-group";


    contentGroup.style.display =
      "flex";


    contentGroup.style.flexDirection =
      "column";


    contentGroup.style.flex =
      "1 1 auto";


    contentGroup.style.minHeight =
      "0";


    /*
      ★ contentGroup은 flex-shrink로 자기 자연 높이보다
      작게 찌그러질 수 있는데(minHeight:0), overflow가
      기본값(visible)이면 title+content가 찌그러진 박스보다
      커도 그냥 아래로 흘러넘쳐서 source 자리를 침범해버린다
      — page 자체의 scrollHeight/clientHeight는 여전히
      똑같아서 page 기준 체크로는 이 침범을 못 잡는다.
      overflow:hidden을 줘서 contentGroup의 scrollHeight가
      "실제 필요한 높이"를 정직하게 보고하게 만든다.
    */

    contentGroup.style.overflow =
      "hidden";


    contentGroup.style.justifyContent =
      justifyContentValue;


    if (
      resolvedView.showTitle
    ) {

      contentGroup.appendChild(
        title
      );

    }


    contentGroup.appendChild(
      content
    );


    page.appendChild(
      contentGroup
    );


    page.appendChild(
      source
    );

  }

  else {

    if (
      resolvedView.showTitle
    ) {

      page.appendChild(
        title
      );

    }


    /*
      ★ 본문 묶음(bodyArea)

      제목과 출처 사이에 남는 세로 공간을 전부 차지하고, 그
      안에서 본문(사진 포함)을 세로 가운데에 둔다. content
      자체를 flex 컨테이너로 만들면 글자 노드 하나하나가 flex
      아이템이 되어 줄바꿈이 깨지므로, 한 겹 감싸는 방식이어야
      한다.

        auto      페이지 높이 = 콘텐츠 높이라 남는 공간이 0이다.
                  → 이 묶음은 아무 것도 바꾸지 않는다(불필요한
                    여분 높이를 만들지 않는다).
        uniform   나중에 페이지 높이가 "가장 높은 페이지"로
                  늘어나면, 늘어난 만큼을 이 묶음이 흡수해서
                  본문이 고른 정렬(위/가운데/아래)대로 놓이고
                  출처는 맨 아래에 남는다. 제목이 차지하는
                  자리는 묶음 바깥이라 정렬 계산에서 자동으로
                  빠진다.
    */

    bodyArea =
      document.createElement(
        "div"
      );


    bodyArea.className =
      "post-editor-preview-body-area";


    bodyArea.style.display =
      "flex";


    bodyArea.style.flexDirection =
      "column";


    bodyArea.style.flex =
      "1 1 auto";


    bodyArea.style.minHeight =
      "0";


    bodyArea.style.justifyContent =
      justifyContentValue;


    bodyArea.appendChild(
      content
    );


    page.appendChild(
      bodyArea
    );


    page.appendChild(
      source
    );

  }


  return {
    page,
    title,
    content,
    source,
    contentGroup,
    bodyArea
  };

}



/* =========================================================
   AUTO · UNIFORM — 페이지 높이를 정수 CSS 픽셀로 확정

   ★ 왜 확정해야 하는가 (감사 §12)

     콘텐츠 높이는 줄 상자 때문에 거의 항상 소수다(실측:
     278.1875px). 그 소수를 그대로 두면 **같은 페이지를 재는
     두 사람이 다른 정수를 답한다**:

       offsetHeight              반올림  → 278   (우리가 기대값을
                                                  계산하던 값)
       html2canvas 1.4.1         올림    → 279   (options.height를
                                                  주지 않으면
                                                  Math.ceil(bounds.height))

     그리고 캔버스는 floor(높이 × 배율)이라 이 1px이 2배 출력에서
     2px로 벌어졌다 — auto 3장 export가 328 / **558** / 328 (기대
     328 / 556 / 328)이던 원인이다.

     클론이 라이브와 다르게 레이아웃돼서가 아니다. 실측에서 클론은
     글자·줄바꿈 위치(18줄 전부)·본문 높이·출처 자리가 라이브와
     **완전히 같았다**(감사 §12.1). 순수한 반올림 규칙 충돌이다.

   ★ 어떻게 확정하는가

     나누기가 전부 끝난 뒤 자연 높이를 재서 **올림한 정수**를
     페이지에 박는다. 그러면 offsetHeight도 getBoundingClientRect()
     도 html2canvas의 Math.ceil도 전부 같은 정수를 본다.

       올림인 이유    내림/반올림은 실제로 그려진 박스의 아래쪽
                      일부(마지막 줄의 소수 부분)를 덜어낸다.
                      올림은 여백이 1px 미만 늘 뿐, 그려진 것을
                      절대 깎지 않는다.

       auto      min-height로 박는다. 값이 자연 높이 이상이라
                 화면에서는 자연 높이와 같지만, **상한이 아니라서**
                 html2canvas 클론이 라이브보다 더 필요로 하면
                 그만큼 늘어난다(실기기 사파리에서 확인됐던
                 잘림 방지 — 아래 캡처 주석과 같은 이유).
       uniform   가장 높은 페이지의 값을 height로 박는다(예전과
                 같다). 모든 페이지가 같은 높이여야 하므로
                 여기서는 상한이기도 하다.

     auto와 uniform이 **같은 측정·같은 올림**을 쓰므로, 한 장뿐인
     글에서 두 모드의 높이가 갈리지 않는다(§5).

   ★ 분할 결과는 절대 바꾸지 않는다.

     페이지를 나누는 일은 이미 끝났고(auto와 완전히 같은 방법),
     여기서는 **이미 만들어진 DOM의 높이만** 바꾼다. 본문을
     다시 배치하거나 페이지 사이로 옮기지 않는다.

   ★ 자연 높이부터 다시 잰다.

     이전 계산에서 입혀 둔 높이가 남아 있으면 최대값이 영영
     줄어들지 않는다("모든 페이지가 짧아져도 높이가 그대로"
     버그). 그래서 재기 전에 height와 min-height를 반드시 먼저
     비운다. 숨겨진 페이지는 높이가 0이므로 재는 동안만 보이게
     한다.
========================================================== */

/*
  소수 높이 → 정수 CSS 픽셀(올림).

  레이아웃 값은 1/64px 단위라 "정수인데 부동소수 오차로 조금 큰"
  경우가 생길 수 있다. 그대로 올리면 164가 165가 되므로 아주 작은
  여유를 빼고 올린다.
*/

const POST_PAGE_HEIGHT_EPSILON = 1 / 128;


/*
  ★ 소수 높이를 재려면 rect가 필요하다 — 그런데 rect는 조상의
  transform을 그대로 반영한다.

  두 미리보기 모두 캔버스를 통째로 scale()해서 보여준다
  (applyEditorPreviewScale · calculateQuotePreviewFitScale). 그
  상태에서 getBoundingClientRect().height를 그냥 쓰면 **화면에
  보이는 크기**를 재게 되어(실측: 278.1875 대신 264.3) 엉뚱한
  높이가 박힌다. offsetHeight는 transform의 영향을 안 받지만
  정수로 반올림돼서 소수 부분을 잃는다.

  그래서 같은 rect에서 배율을 역산해 되돌린다 — 페이지 폭은
  레이아웃상 항상 정수(520px)이므로 rect.width / offsetWidth가
  지금 걸려 있는 배율이다. 배율을 못 믿을 상황(폭 0 = 조상이
  display:none)에서는 offsetHeight로 물러난다.
*/

function measurePostPageNaturalHeight(
  page
) {

  const rect =
    page.getBoundingClientRect();


  const layoutWidth =
    page.offsetWidth;


  const scale =
    layoutWidth > 0 &&
    rect.width > 0
      ? rect.width / layoutWidth
      : 0;


  const height =
    scale > 0.01 &&
    scale < 100
      ? rect.height / scale
      : page.offsetHeight;


  return Math.max(
    1,
    Math.ceil(
      height -
      POST_PAGE_HEIGHT_EPSILON
    )
  );

}


function applyDefinitePostPageHeights(
  pages,
  options = {}
) {

  const uniform =
    options.uniform ===
    true;


  const list =
    Array.from(
      pages ||
      []
    );


  if (
    list.length === 0
  ) {

    return 0;

  }


  const wasHidden =
    list.map(
      page => page.hidden
    );


  list.forEach(
    page => {

      page.hidden =
        false;


      /* 이전에 박아 둔 높이 제거 — 자연 높이부터 */

      page.style.height =
        "auto";


      page.style.removeProperty(
        "min-height"
      );


      delete page.dataset
        .uniformHeight;


      delete page.dataset
        .definiteHeight;

    }
  );


  const naturalHeights =
    list.map(
      measurePostPageNaturalHeight
    );


  const uniformHeight =
    Math.max(
      1,
      ...naturalHeights
    );


  list.forEach(
    (
      page,
      index
    ) => {

      const height =
        uniform
          ? uniformHeight
          : naturalHeights[index];


      if (uniform) {

        page.style.height =
          `${height}px`;


        page.dataset.uniformHeight =
          String(
            height
          );

      }


      else {

        /*
          상한이 아니라 하한이다 — 위 주석 참고.
        */

        page.style.minHeight =
          `${height}px`;

      }


      page.dataset.definiteHeight =
        String(
          height
        );


      page.hidden =
        wasHidden[index];

    }
  );


  return uniform
    ? uniformHeight
    : naturalHeights[0];

}


/*
  예전 이름. uniform 전용 호출부가 남아 있어 얇은 별칭으로 둔다.
*/

function applyUniformPostPageHeights(
  pages
) {

  return applyDefinitePostPageHeights(
    pages,
    {
      uniform: true
    }
  );

}



/* =========================================================
   PAGE OVERFLOW
========================================================== */

function postPageIsOverflowing(
  page
) {

  if (!page) {
    return false;
  }


  return (
    page.scrollHeight >
    page.clientHeight + 1
  );

}


function postPageCurrentIsOverflowing(
  current
) {

  if (!current) {
    return false;
  }


  return (
    postPageIsOverflowing(
      current.page
    )
    ||
    postPageIsOverflowing(
      current.contentGroup
    )
  );

}



/* =========================================================
   MANUAL BREAK CHECK
========================================================== */

function isPostPageBreakNode(
  node
) {

  return (
    node?.nodeType ===
      Node.ELEMENT_NODE
    &&
    node.classList
      ?.contains(
        "post-editor-page-break"
      )
  );

}



/* =========================================================
   PAGINATION

   ★ 분할 기준은 "실제 넘침"과 수동 PAGE break 둘뿐이다.
   글자 수·문단 수로 나누지 않는다(사진이 섞이면 글자 수로
   나눌 수 없다). AUTO 비율은 페이지 높이가 콘텐츠 높이라
   넘칠 자리가 없으므로 **수동 PAGE break로만** 나뉜다 —
   이번 라운드에서 새 분할 제한을 넣지 않았다.

   ★ uniform도 여기서는 auto와 완전히 같은 코드를 지난다.
   높이를 통일하는 일은 나누기가 다 끝난 마지막 단계
   (applyUniformPostPageHeights)에서만 일어나므로, 두 모드의
   페이지 수와 각 장의 내용이 같다는 것이 구조적으로 보장된다.
========================================================== */

function paginatePostPages(
  options = {}
) {

  const host =
    options.host;


  if (!host) {

    return [];

  }


  const settings =
    normalizePostStyleSettings(
      options.settings
    );


  const view =
    resolvePostPageView(
      settings,
      options.view
    );


  const source =
    options.source;


  const pages =
    [];


  const imageGap =
    typeof postPreviewImageGap === "function"
      ? postPreviewImageGap(
          settings
        )
      : 0;


  host.replaceChildren();


  let current =
    createPostPageCanvas(
      settings,
      {
        ...view,
        showTitle: true
      }
    );


  host.appendChild(
    current.page
  );


  pages.push(
    current.page
  );


  let onContinuationPage =
    false;


  let openChain =
    [];


  function startNewPage() {

    current =
      createPostPageCanvas(
        settings,
        {
          ...view,
          showTitle: false
        }
      );


    host.appendChild(
      current.page
    );


    pages.push(
      current.page
    );


    onContinuationPage =
      true;

  }


  /*
    ★ 새 페이지가 빈 줄/문단 간격 한가운데서 시작되는 것 방지.

    페이지가 넘어가는 지점이 하필 문단 사이(빈 <br>이나
    문단 간격 블록)면 그게 그대로 새 페이지의 첫 내용으로
    옮겨져서 새 페이지가 빈 줄로 시작해버린다. 새 페이지
    맨 위에 놓일 <br>/간격 블록/공백은 실제 내용이 나오기
    전까지 건너뛴다. (수동 페이지 나누기로 시작한 페이지에도
    동일하게 적용 — 일관성을 위해 첫 페이지에는 적용하지
    않는다.)
  */

  function isLeadingBlankAtPageStart() {

    return (
      onContinuationPage &&
      openChain.length === 0 &&
      current.content.childNodes.length === 0
    );

  }


  function currentContainer() {

    if (
      openChain.length === 0
    ) {

      return current.content;

    }


    return openChain[
      openChain.length - 1
    ].shell;

  }


  function rebuildOpenChain() {

    let parent =
      current.content;


    openChain.forEach(
      entry => {

        const shell =
          entry.original.cloneNode(
            false
          );


        parent.appendChild(
          shell
        );


        entry.shell =
          shell;


        parent =
          shell;

      }
    );

  }


  /*
    텍스트 노드는 단어 단위로 넣어서 캔버스를 넘는 순간
    다음 페이지로 넘김(어떤 깊이의 span 안에서든 동일).
  */

  function appendTextNode(
    node
  ) {

    const value =
      node.nodeValue ||
      "";


    const parts =
      value.match(
        /\S+\s*|\s+/g
      ) || [];


    parts.forEach(
      part => {

        if (
          /^\s+$/.test(
            part
          ) &&
          isLeadingBlankAtPageStart()
        ) {

          return;

        }


        const textNode =
          document.createTextNode(
            part
          );


        currentContainer().appendChild(
          textNode
        );


        if (
          postPageCurrentIsOverflowing(
            current
          )
        ) {

          textNode.remove();


          startNewPage();
          rebuildOpenChain();


          currentContainer().appendChild(
            textNode
          );

        }

      }
    );

  }


  function pageHasRenderedContent() {

    if (
      !current?.content
    ) {

      return false;

    }


    if (
      (
        current.content.textContent ||
        ""
      ).trim() !== ""
    ) {

      return true;

    }


    return Boolean(
      current.content.querySelector(
        "img, br, .post-editor-preview-image-missing"
      )
    );

  }


  /*
    ★ 사진 한 장 넣기

    사진은 글자와 달리 쪼갤 수 없다 — 한 장을 두 페이지에
    나눠 자르지 않는다.

      1. 본문 너비에 맞춘 크기로 지금 페이지에 넣어 본다.
      2. 넘치면 통째로 다음 페이지로 옮긴다.
      3. 새 페이지에도 안 들어가면 비율을 지켜 줄인다.

    AUTO 높이에서는 페이지가 콘텐츠만큼 늘어나 애초에
    넘치지 않으므로 2·3이 일어나지 않는다.
  */

  function shrinkPreviewImageToFit(
    node,
    maxWidth,
    ratio
  ) {

    let low =
      POST_PREVIEW_IMAGE_MIN_WIDTH;


    let high =
      Math.max(
        POST_PREVIEW_IMAGE_MIN_WIDTH,
        Math.round(
          maxWidth
        )
      );


    let best =
      0;


    /* 이분 탐색 — 넘치지 않는 가장 큰 너비 */

    while (
      high - low > 1
    ) {

      const middle =
        Math.floor(
          (
            low +
            high
          ) / 2
        );


      applyPostPreviewImageSize(
        node,
        middle,
        ratio
      );


      if (
        postPageCurrentIsOverflowing(
          current
        )
      ) {

        high =
          middle;

      }

      else {

        best =
          middle;

        low =
          middle;

      }

    }


    applyPostPreviewImageSize(
      node,
      best ||
      POST_PREVIEW_IMAGE_MIN_WIDTH,
      ratio
    );

  }


  function appendPreviewImageNode(
    node
  ) {

    const clone =
      node.cloneNode(
        true
      );


    const ratio =
      getPostPreviewImageRatio(
        clone
      );


    const maxWidth =
      postPageBodyWidth(
        current.content,
        settings
      );


    const hadContent =
      pageHasRenderedContent();


    applyPostPreviewImageSize(
      clone,
      maxWidth,
      ratio
    );


    /* 페이지 맨 위에서는 위 간격을 주지 않는다 */

    clone.style.marginTop =
      hadContent
        ? `${imageGap}px`
        : "0px";


    clone.style.marginBottom =
      `${imageGap}px`;


    currentContainer().appendChild(
      clone
    );


    if (
      !postPageCurrentIsOverflowing(
        current
      )
    ) {

      return;

    }


    if (hadContent) {

      clone.remove();


      startNewPage();
      rebuildOpenChain();


      clone.style.marginTop =
        "0px";


      currentContainer().appendChild(
        clone
      );


      if (
        !postPageCurrentIsOverflowing(
          current
        )
      ) {

        return;

      }

    }


    shrinkPreviewImageToFit(
      clone,
      postPageBodyWidth(
        current.content,
        settings
      ),
      ratio
    );

  }


  function isBlankFlowNode(
    node
  ) {

    return (
      node.nodeName === "BR" ||
      isPostParagraphGapNode(
        node
      )
    );

  }


  /*
    노드를 재귀적으로 삽입. 텍스트는 단어 단위 분할, 자식이
    있는 요소(인용구/강조 span 등)는 빈 껍데기만 새로 만들고
    그 안에 자식을 재귀적으로 이어붙인다 — 긴 span도 이렇게
    하면 통째로 넘치는 대신 단어 단위로 쪼개져서 페이지
    경계를 올바르게 넘어간다.
  */

  function appendNode(
    node
  ) {

    /*
      ★ 수동 PAGE BREAK — 남은 공간이 있어도 강제로 새 페이지.
    */

    if (
      isPostPageBreakNode(
        node
      )
    ) {

      /*
        첫 페이지가 완전히 비어 있을 때는
        빈 페이지 하나를 만들지 않음.
      */

      if (
        current.content.childNodes.length >
        0
      ) {

        startNewPage();

        openChain = [];

      }


      return;

    }


    if (
      node.nodeType ===
      Node.TEXT_NODE
    ) {

      appendTextNode(
        node
      );


      return;

    }


    if (
      node.nodeType !==
      Node.ELEMENT_NODE
    ) {

      return;

    }


    /*
      사진(과 못 읽은 사진의 자리표시자)은 쪼개지 않는 한
      덩어리다. 아래 일반 경로는 넘칠 때 "다음 페이지로
      옮기기"까지만 하므로 새 페이지에도 안 들어가는 긴
      사진을 처리할 수 없다.
    */

    if (
      typeof isPostPreviewImageNode === "function" &&
      isPostPreviewImageNode(
        node
      )
    ) {

      appendPreviewImageNode(
        node
      );


      return;

    }


    const canRecurse =
      node.nodeName !==
        "BR"
      &&
      !isPostParagraphGapNode(
        node
      )
      &&
      node.childNodes.length >
        0;


    if (!canRecurse) {

      /*
        <br>/문단 간격 블록/빈 요소는 통째로 넣고
        한 번만 넘침 검사(이미 충분히 작음).
      */

      if (
        isBlankFlowNode(
          node
        ) &&
        isLeadingBlankAtPageStart()
      ) {

        return;

      }


      const clone =
        node.cloneNode(
          true
        );


      currentContainer().appendChild(
        clone
      );


      if (
        postPageCurrentIsOverflowing(
          current
        )
      ) {

        clone.remove();


        startNewPage();
        rebuildOpenChain();


        if (
          isBlankFlowNode(
            node
          ) &&
          isLeadingBlankAtPageStart()
        ) {

          return;

        }


        currentContainer().appendChild(
          clone
        );

      }


      return;

    }


    const shell =
      node.cloneNode(
        false
      );


    currentContainer().appendChild(
      shell
    );


    openChain.push(
      {
        original: node,
        shell
      }
    );


    Array.from(
      node.childNodes
    ).forEach(
      child => {

        appendNode(
          child
        );

      }
    );


    openChain.pop();

  }


  Array.from(
    source?.childNodes ||
    []
  ).forEach(
    node => {

      appendNode(
        node
      );

    }
  );


  /*
    완전히 빈 마지막 페이지 방지.
  */

  if (
    pages.length > 1 &&
    current.content.childNodes.length ===
      0
  ) {

    current.page.remove();


    pages.pop();

  }


  pages.forEach(
    (
      page,
      index
    ) => {

      page.dataset.pageIndex =
        String(
          index
        );

    }
  );


  /*
    ★ 높이는 "나누기가 전부 끝난 뒤"에만 건드린다.
    여기까지 오는 동안 auto와 uniform은 완전히 똑같이 동작했으므로
    페이지 수와 각 장의 내용이 서로 같다.

    auto·uniform 둘 다 자연 높이를 정수로 확정한다(위
    applyDefinitePostPageHeights 주석) — 그래야 화면에서 재는 값과
    export가 쓰는 값이 갈리지 않는다. 고정 비율(custom)은 비율에서
    이미 확정된 높이가 나오므로 건드리지 않는다.
  */

  if (
    view.ratio?.auto ||
    view.ratio?.uniform
  ) {

    applyDefinitePostPageHeights(
      pages,
      {
        uniform:
          Boolean(
            view.ratio?.uniform
          )
      }
    );

  }


  return pages;

}
