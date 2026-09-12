/* =========================================================
   QUOTE - 출력 조건 (비율 · 캔버스 가로 픽셀)

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   ★ 역할 분리 (IMORY_QUOTE_PRESET_RENDER_AUDIT.md §6 단계 2)

     Quote Preset = **본문 서식**
       배경 · 여백 · 글꼴 · 문단 간격 · 제목/출처 서식.
       이 값들은 화면의 입력칸에서 오고, 저장되고, 발행 본문
       에까지 그대로 쓰인다.

     출력 조건 = **어떤 캔버스에 그릴지**
       비율(uniform/auto/custom) · 캔버스 가로 픽셀.
       **고쳐서 저장하는 자리는 이 화면 하나뿐이다.**
       글쓰기 화면의 Preview는 비율만 그 글의 편집 세션
       안에서 잠깐 바꿔볼 수 있고, 가로 픽셀은 아예 고를 수
       없다 — 프리셋 값을 그대로 쓴다
       (posts/preview/posts-preview-settings.js).

   아래 함수들이 폼(비율 버튼 · 가로 비/세로 비 입력칸)과
   저장값 사이의 유일한 통로이고, 본문 서식 계산
   (normalizePostStyleSettings / applyPostBodyStyles /
   paginatePostPages의 settings)과는 섞이지 않는다.
========================================================== */


/* =========================================================
   저장값 → 비율 모드 / 비율 값

   저장되는 ratio는 이제 "uniform" · "auto" · "custom" 셋
   중 하나다. 그 전 프리셋에는 "1:1" · "4:5" · "9:16" 같은
   고정 비율 문자열이 들어 있는데, 그 값은 **custom + 가로
   비/세로 비**로 손실 없이 들어온다.

   Preview 쪽의 getPresetPreviewRatioMode /
   getPresetPreviewRatioParts(posts/preview/
   posts-preview-settings.js)와 **같은 규칙**이어야 한다 —
   두 화면이 같은 프리셋에서 다른 캔버스를 그리면 안 된다.
========================================================== */

const QUOTE_RATIO_MODES =
  [
    "uniform",
    "auto",
    "custom"
  ];


function quoteRatioModeFromSettings(
  settings = {}
) {

  const ratio =
    String(
      settings.ratio ||
      ""
    );


  return QUOTE_RATIO_MODES.includes(ratio)
    ? ratio
    : "custom";

}


function quoteRatioPartsFromSettings(
  settings = {}
) {

  const ratio =
    String(
      settings.ratio ||
      ""
    );


  /*
    옛 고정 비율("4:5")이면 그 숫자가 곧 custom의 값이다.
    uniform/auto/custom이면 저장된 ratioWidth/ratioHeight를
    쓴다(그 값도 늘 함께 저장된다).
  */

  const match =
    ratio.match(
      /^([0-9.]+):([0-9.]+)$/
    );


  if (match) {

    return {

      width:
        Math.max(
          1,
          Number(
            match[1]
          ) || 1
        ),

      height:
        Math.max(
          1,
          Number(
            match[2]
          ) || 1
        )

    };

  }


  return {

    width:
      Math.max(
        1,
        Number(
          settings.ratioWidth
        ) || 1
      ),

    height:
      Math.max(
        1,
        Number(
          settings.ratioHeight
        ) || 1
      )

  };

}


/* =========================================================
   RATIO — 지금 폼에 떠 있는 출력 조건
========================================================== */

function getQuoteRatio() {

  /*
    ★ AUTO · UNIFORM: 고정 비율이 아니라 콘텐츠 높이를 쓰라는
    신호. width/height는 안전한 기본값일 뿐이고, 실제로는
    auto/uniform 플래그를 보고 분기한다(공용
    posts/preview/posts-page-layout.js의 createPostPageCanvas ·
    applyDefinitePostPageHeights).

    uniform은 나누는 동안에는 auto와 똑같이 굴고(auto: true),
    다 나눈 뒤에만 모든 페이지의 높이를 통일한다 — 그래서 두
    플래그를 같이 켠다(Preview의 getPostPreviewRatio와 같은
    반환 계약).
  */

  if (
    currentQuoteRatio ===
    "uniform"
  ) {

    return {
      width: 1,
      height: 1,
      auto: true,
      uniform: true
    };

  }


  if (
    currentQuoteRatio ===
    "auto"
  ) {

    return {
      width: 1,
      height: 1,
      auto: true
    };

  }


  /*
    custom — 그리고 폼이 아직 옛 고정 비율 문자열을 들고 있는
    경우까지 같은 자리에서 받는다.
  */

  const legacy =
    String(
      currentQuoteRatio ||
      ""
    )
      .match(
        /^([0-9.]+):([0-9.]+)$/
      );


  if (legacy) {

    return {

      width:
        Math.max(
          1,
          Number(
            legacy[1]
          ) || 1
        ),

      height:
        Math.max(
          1,
          Number(
            legacy[2]
          ) || 1
        )

    };

  }


  return {

    width:
      Math.max(
        1,
        Number(
          quoteRatioWidth?.value
        ) || 1
      ),

    height:
      Math.max(
        1,
        Number(
          quoteRatioHeight?.value
        ) || 1
      )

  };

}


/* =========================================================
   ★ 여기 있던 프리뷰 전용 렌더 코드는 전부 없어졌다.

     renderStyledQuoteText / applySpecialQuoteStyles /
     renderQuoteBody / applyLineBreakMode /
     applyVerticalAlignment / applyCanvasPadding

   이 화면만의 계산이었기 때문에 글쓰기 화면의 PREVIEW와
   결과가 계속 갈라졌다(IMORY_QUOTE_PRESET_RENDER_AUDIT.md
   §2). 지금은 같은 일을 공용 코드가 한다.

     샘플 문법 → 본문 DOM   admin-quote-preview-update.js
                            (buildQuoteSampleSource — 얇은 어댑터)
     본문 서식 · 문단 간격  posts/style/posts-body-layout.js
     지문 · 대사            posts/style/posts-style-dialogue.js
     여백 · 정렬 · 출처     posts/preview/posts-page-layout.js
                            (createPostPageCanvas)

   출력 조건(getQuoteRatio)만 이 화면의 입력칸을 읽으므로
   위에 그대로 남아 있다.
========================================================== */


/* =========================================================
   EXPORT WIDTH — 캔버스 가로 픽셀

   이 화면의 크기 표시("1080 × 1350")와, 저장된 뒤에는
   글쓰기 화면의 export/copy 해상도가 되는 값. 저장된 값이
   없으면 공용 기본값(posts/style/posts-body-layout.js).
========================================================== */

function getQuoteExportWidth(
  settings = {}
) {

  return Math.max(
    1,
    Math.round(
      postStyleNumber(
        settings.exportWidth,
        POST_STYLE_DEFAULTS.exportWidth
      )
    )
  );

}
