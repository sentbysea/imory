/* =========================================================
   QUOTE - PREVIEW 렌더 / 페이지 이동 / 표시 배율 / 비율 버튼

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   ★ 이 화면은 더 이상 자기만의 렌더링을 갖지 않는다.

     예전에는 폼 입력칸을 읽어 static 마크업(.quote-preview-title
     /-text/-source)에 직접 스타일을 박았다. 그래서 글쓰기 화면의
     PREVIEW와 본문 폭·문단 간격·줄바꿈·출처 자리·페이지 나눔이
     계속 갈라졌다(IMORY_QUOTE_PRESET_RENDER_AUDIT.md §2).

     지금은 폼 값을 collectQuoteSettings()로 모아(=저장될 바로 그
     객체) 글쓰기 화면과 **같은 공용 코드**에 넘긴다.

       posts/style/posts-body-layout.js   정규화 · 본문 스타일 · 문단 간격
       posts/style/posts-style-dialogue.js 지문/대사
       posts/preview/posts-page-layout.js  페이지 한 장 · 페이지 나누기

     이 파일에 남은 화면 고유 코드는 (1) 프리셋 전용 샘플 문법을
     본문 DOM으로 바꾸는 얇은 입력 어댑터, (2) 표시 배율(화면에
     맞추는 축소), (3) 페이지 이동과 비율 버튼뿐이다.

     에디터의 전역 상태(postStyleSettings, preview* 오버라이드)는
     읽지도 쓰지도 않는다 — 이 화면은 관리 패널이고 그 전역들은
     여기 존재하지도 않는다.
========================================================== */


/* =========================================================
   샘플 문법 → 본문 DOM (얇은 입력 어댑터)

   프리셋 미리보기에만 있는 표기:

     ==text==   형광펜  → .post-inline-highlight
     ^text^     강조색  → .post-inline-color

   *지문* 과 "대사" 는 **실제 글 본문과 같은 표기**라 따로
   바꾸지 않는다 — 공용 applyActionDialogueStyles()가 본문에서
   하는 것과 똑같이 처리한다.

   줄바꿈은 실제 에디터가 만드는 모양 그대로 <br>로 둔다.
   빈 줄(= <br> 두 개)이 문단 경계가 되고, 그 간격은 공용
   applyPostParagraphSpacing()이 paragraphSpacing 값대로 넣는다.
========================================================== */

function appendQuoteSampleLine(
  parent,
  line,
  settings
) {

  const pattern =
    /(==[^=\n]+==|\^[^^\n]+\^)/g;


  let lastIndex =
    0;


  let match;


  while (
    (
      match =
        pattern.exec(
          line
        )
    ) !== null
  ) {

    if (
      match.index >
      lastIndex
    ) {

      parent.appendChild(
        document.createTextNode(
          line.slice(
            lastIndex,
            match.index
          )
        )
      );

    }


    const raw =
      match[0];


    const span =
      document.createElement(
        "span"
      );


    if (
      raw.startsWith("==")
    ) {

      span.className =
        "post-inline-highlight";


      span.dataset.highlight =
        settings.highlightColor;


      span.style.backgroundColor =
        settings.highlightColor;


      span.textContent =
        raw.slice(
          2,
          -2
        );

    }

    else {

      span.className =
        "post-inline-color";


      span.dataset.pointColor =
        settings.pointColor;


      span.style.color =
        settings.pointColor;


      span.textContent =
        raw.slice(
          1,
          -1
        );

    }


    parent.appendChild(
      span
    );


    lastIndex =
      pattern.lastIndex;

  }


  if (
    lastIndex <
    line.length
  ) {

    parent.appendChild(
      document.createTextNode(
        line.slice(
          lastIndex
        )
      )
    );

  }

}


function buildQuoteSampleSource(
  settings
) {

  const resolved =
    normalizePostStyleSettings(
      settings
    );


  const source =
    document.createElement(
      "div"
    );


  const lines =
    String(
      quoteTestBody?.value ||
      ""
    )
      .split(
        /\r?\n/
      );


  lines.forEach(
    (
      line,
      index
    ) => {

      appendQuoteSampleLine(
        source,
        line,
        resolved
      );


      if (
        index <
        lines.length - 1
      ) {

        source.appendChild(
          document.createElement(
            "br"
          )
        );

      }

    }
  );


  /*
    여기부터는 발행 본문·에디터 PREVIEW와 완전히 같은 순서다
    (posts/style/posts-style-render.js의
    renderStyledPostContentInto 참고) — 본문 스타일 → 문단
    간격 → 지문/대사.
  */

  applyPostBodyStyles(
    source,
    resolved
  );


  applyPostParagraphSpacing(
    source,
    resolved
  );


  applyActionDialogueStyles(
    source,
    resolved
  );


  return source;

}



/* =========================================================
   UPDATE PREVIEW
========================================================== */

let quotePreviewPages =
  [];

let quotePreviewPageIndex =
  0;


function updateQuotePreview() {

  if (!quotePreviewCanvas) {
    return;
  }


  /*
    저장될 바로 그 객체를 그대로 그린다 — 폼과 미리보기와
    (저장 뒤의) 발행 본문이 서로 다른 값을 볼 자리가 없다.
  */

  const settings =
    normalizePostStyleSettings(
      collectQuoteSettings()
    );


  const ratio =
    getQuoteRatio();


  const source =
    buildQuoteSampleSource(
      settings
    );


  quotePreviewPages =
    paginatePostPages(
      {
        host:
          quotePreviewCanvas,

        settings,

        source,

        view:
          {
            ratio,

            titleText:
              quoteTestTitle?.value ||
              ""
          }
      }
    );


  showQuotePreviewPage(
    quotePreviewPageIndex
  );


  updateQuotePreviewSizeLabel(
    settings,
    ratio
  );


  applyQuotePreviewScale();

}


/*
  내보내기 픽셀 크기 표시. 레이아웃은 항상 520px 폭이고
  exportWidth는 그 위에 곱해지는 배율일 뿐이다 — 표시 배율
  (applyQuotePreviewScale)과는 아무 관계가 없다.

  ★ 여기 쓰이는 비율/너비가 곧 저장되는 출력 조건이다.
  글쓰기 화면의 Preview는 비율만 그 글의 편집 세션 안에서
  잠깐 바꿔볼 수 있고 가로 픽셀은 이 값을 그대로 쓴다 —
  admin-quote-ratio-parser.js 머리말 참고.
*/

function updateQuotePreviewSizeLabel(
  settings,
  ratio
) {

  if (!quotePreviewSize) {
    return;
  }


  const exportWidth =
    getQuoteExportWidth(
      settings
    );


  const visiblePage =
    quotePreviewPages[
      quotePreviewPageIndex
    ];


  const layoutHeight =
    ratio.auto
      ? (
          visiblePage?.offsetHeight ||
          0
        )
      : POST_PAGE_LAYOUT_WIDTH *
        (
          ratio.height /
          ratio.width
        );


  quotePreviewSize.textContent =
    `${exportWidth} × ${
      resolveExportPixelHeight(
        exportWidth,
        layoutHeight
      )
    }`;

}


/* =========================================================
   PAGE NAVIGATION

   샘플이 한 장을 넘치면 조용히 잘라내는 대신 다음 장으로
   넘어간다(공용 paginatePostPages가 글쓰기 화면과 같은
   "실제 넘침" 기준으로 나눈다). 만들어진 장을 실제로 넘겨볼
   수 있어야 하므로 이동 버튼을 둔다.
========================================================== */

function showQuotePreviewPage(
  index
) {

  if (
    quotePreviewPages.length === 0
  ) {

    quotePreviewPageIndex =
      0;


    if (quotePreviewPagination) {

      quotePreviewPagination.hidden =
        true;

    }


    return;

  }


  quotePreviewPageIndex =
    Math.max(
      0,
      Math.min(
        index,
        quotePreviewPages.length - 1
      )
    );


  quotePreviewPages.forEach(
    (
      page,
      pageIndex
    ) => {

      page.hidden =
        pageIndex !==
        quotePreviewPageIndex;

    }
  );


  if (
    quotePreviewPageIndicator
  ) {

    quotePreviewPageIndicator.textContent =
      `${
        quotePreviewPageIndex + 1
      } / ${
        quotePreviewPages.length
      }`;

  }


  if (quotePreviewPrev) {

    quotePreviewPrev.disabled =
      quotePreviewPageIndex === 0;

  }


  if (quotePreviewNext) {

    quotePreviewNext.disabled =
      quotePreviewPageIndex ===
      quotePreviewPages.length - 1;

  }


  if (quotePreviewPagination) {

    quotePreviewPagination.hidden =
      quotePreviewPages.length <= 1;

  }

}


function moveQuotePreviewPage(
  step
) {

  showQuotePreviewPage(
    quotePreviewPageIndex +
    step
  );


  /*
    AUTO 비율은 장마다 높이가 달라서 표시 배율과 크기 표시를
    다시 계산해야 한다.
  */

  updateQuotePreviewSizeLabel(
    normalizePostStyleSettings(
      collectQuoteSettings()
    ),
    getQuoteRatio()
  );


  applyQuotePreviewScale();

}


quotePreviewPrev
  ?.addEventListener(
    "click",
    () => {

      moveQuotePreviewPage(
        -1
      );

    }
  );


quotePreviewNext
  ?.addEventListener(
    "click",
    () => {

      moveQuotePreviewPage(
        1
      );

    }
  );


/* =========================================================
   PREVIEW SCALE / ZOOM

   화면 표시 전용 축소·확대. 실제 출력 픽셀 계산
   (updateQuotePreviewSizeLabel)과 완전히 분리되어 있고 서로
   참조하지 않는다 — 여기서 하는 일은 host에 transform:
   scale()을 거는 것뿐이다.

   캔버스는 항상 520px 고정폭으로 레이아웃한다(글쓰기 화면의
   applyEditorPreviewScale과 동일한 방식 — 좁을 때 줄바꿈만
   바뀌는 게 아니라 글자 자체가 같이 작아져야 두 화면의
   결과가 같아 보인다).

   FIT 모드: stage(프리뷰가 담기는 상자)의 width/height를 모두
   고려해서 캔버스 전체가 항상 안에 들어오도록 자동으로 배율을
   계산한다(= object-fit: contain과 동일한 개념) — 비율을
   왜곡하거나 세로를 잘라내지 않는다.

   MANUAL 모드: 핀치로 직접 배율을 바꾼 상태
   (admin-quote-preview-gesture.js). 10%~200% 범위에서
   유지되고, 더블탭해야 다시 FIT으로 돌아간다.
========================================================== */

const QUOTE_PREVIEW_MIN_ZOOM =
  0.1;

const QUOTE_PREVIEW_MAX_ZOOM =
  2;


let quotePreviewZoomMode =
  "fit";

let quotePreviewFitScale =
  1;

let quotePreviewManualScale =
  1;


/*
  핀치 확대/축소(admin-quote-preview-gesture.js) 중 중심을
  맞추려고 같이 움직이는 캔버스 이동량 — 화면 픽셀 단위.
  fitQuotePreview(더블탭)를 실행해야 0,0으로 되돌아간다.
*/

let quotePreviewPanX =
  0;

let quotePreviewPanY =
  0;


function calculateQuotePreviewFitScale() {

  if (
    !quotePreviewCanvas ||
    !quotePreviewStage
  ) {
    return 1;
  }


  const availableWidth =
    quotePreviewStage.clientWidth;

  const availableHeight =
    quotePreviewStage.clientHeight;


  /*
    ★ 고정 비율일 때는 실제 렌더 높이를 재는 대신 비율값으로
    직접 계산한다 — 비율이 막 바뀐 틱에는 아직 이전 높이가
    잡힐 수 있기 때문이다. 콘텐츠 높이로 정해지는 AUTO만
    지금 보이는 페이지의 실제 높이를 잰다.
  */

  const ratio =
    typeof getQuoteRatio ===
      "function"
      ? getQuoteRatio()
      : null;


  const visiblePage =
    quotePreviewPages[
      quotePreviewPageIndex
    ];


  const naturalHeight =
    ratio &&
    !ratio.auto &&
    ratio.width > 0
      ? POST_PAGE_LAYOUT_WIDTH *
        ratio.height /
        ratio.width
      : (
          visiblePage?.offsetHeight ||
          quotePreviewCanvas.offsetHeight
        );


  const widthScale =
    availableWidth /
    POST_PAGE_LAYOUT_WIDTH;

  const heightScale =
    availableHeight > 0 &&
    naturalHeight > 0
      ? availableHeight / naturalHeight
      : widthScale;


  /*
    글쓰기 화면의 프리뷰와 마찬가지로 자동 fit은 100%를
    넘지 않는다(= 화면 표시가 실제 픽셀보다 커 보이지
    않게). 더 크게 보고 싶으면 핀치로 확대한다.
  */

  return Math.min(
    widthScale,
    heightScale,
    1
  );

}


function getCurrentQuotePreviewScale() {

  return quotePreviewZoomMode ===
    "manual"
    ? quotePreviewManualScale
    : quotePreviewFitScale;

}


function applyQuotePreviewScale() {

  if (
    !quotePreviewCanvas ||
    !quotePreviewStage
  ) {
    return;
  }


  /*
    transform은 레이아웃 크기(offsetHeight 등)에 영향을 주지
    않지만, 만에 하나 이전 프레임 값이 측정에 섞이는 걸
    막기 위해 매번 초기화하고 다시 잰다.
  */

  quotePreviewCanvas.style.transform =
    "none";


  quotePreviewCanvas.style.transformOrigin =
    "center center";


  quotePreviewFitScale =
    calculateQuotePreviewFitScale();


  const scale =
    getCurrentQuotePreviewScale();


  quotePreviewCanvas.style.transform =
    `translate(${quotePreviewPanX}px, ${quotePreviewPanY}px) scale(${scale})`;

}


/*
  핀치 확대/축소 중에는 배율과 이동량이 한 프레임 안에서
  같이 바뀐다 — 둘을 한 번에 반영해야 중간 프레임에서 잠깐
  어긋난 상태로 그려지는 걸 막을 수 있다.
*/

function setQuotePreviewZoomAndPan(
  scale,
  panX,
  panY
) {

  quotePreviewZoomMode =
    "manual";

  quotePreviewManualScale =
    Math.min(
      QUOTE_PREVIEW_MAX_ZOOM,
      Math.max(
        QUOTE_PREVIEW_MIN_ZOOM,
        scale
      )
    );

  quotePreviewPanX =
    panX;

  quotePreviewPanY =
    panY;


  applyQuotePreviewScale();

}


/*
  버튼 없이(툴바를 없앴으므로) admin-quote-preview-gesture.js의
  더블탭에서 호출해서 "전체 보기"로 되돌리는 용도로 씀.
*/

function fitQuotePreview() {

  quotePreviewZoomMode =
    "fit";

  quotePreviewPanX =
    0;

  quotePreviewPanY =
    0;


  applyQuotePreviewScale();


  quotePreviewHelp
    ?.classList
    .remove(
      "is-dimmed"
    );

}


window.addEventListener(
  "resize",
  applyQuotePreviewScale
);


/* =========================================================
   RATIO BUTTONS
========================================================== */

quoteRatioButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        currentQuoteRatio =
          button.dataset.ratio;


        quoteRatioButtons.forEach(
          item => {

            item.classList.remove(
              "active"
            );

          }
        );


        button.classList.add(
          "active"
        );


        if (
          quoteCustomRatioFields
        ) {

          quoteCustomRatioFields.hidden =
            currentQuoteRatio !==
            "custom";

        }


        updateQuotePreview();

      }
    );

  }
);
