/* =========================================================
   QUOTE - 미리보기의 출력 조건 (호환)

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   ★ 역할 분리 (IMORY_QUOTE_PRESET_RENDER_AUDIT.md §6 단계 2)

     Quote Preset = **본문 서식**
       배경 · 여백 · 글꼴 · 문단 간격 · 제목/출처 서식.
       이 값들은 화면의 입력칸에서 오고, 저장되고, 발행 본문
       에까지 그대로 쓰인다.

     출력 조건 = **어떤 캔버스에 그릴지**
       비율(uniform/auto/custom) · 출력 너비. 고르는 자리는
       글쓰기 화면의 PREVIEW다
       (posts/preview/posts-preview-settings.js).

   그런데 이 화면도 미리보기를 그리려면 캔버스가 하나 있어야
   한다. 그래서 프리셋에 이미 저장돼 있는 canvas 값을
   **호환용 출력 조건**으로만 읽는다 — 아래 함수가 그 유일한
   통로이고, 본문 서식 계산(normalizePostStyleSettings /
   applyPostBodyStyles / paginatePostPages의 settings)과는
   섞이지 않는다. 입력칸은 화면에서 감췄지만 폼에는 남아 있어
   저장값을 그대로 들고 다닌다(admin-quote-panel.html 주석).
========================================================== */


/* =========================================================
   RATIO (호환용 출력 조건)
========================================================== */

function getQuoteRatio() {

  /*
    ★ AUTO: 고정 비율이 아니라 콘텐츠 높이를 그대로 쓰라는
    신호. width/height는 안전한 기본값일 뿐이고, 실제로는
    auto 플래그를 보고 분기한다(admin-quote-preview-update.js
    참고).
  */

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


  if (
    currentQuoteRatio ===
    "custom"
  ) {

    return {

      width:
        Number(
          quoteRatioWidth?.value
        ) || 1,

      height:
        Number(
          quoteRatioHeight?.value
        ) || 1

    };

  }


  const [
    width,
    height
  ] =
    String(
      currentQuoteRatio ||
      "1:1"
    )
      .split(":")
      .map(Number);


  return {

    width:
      Math.max(
        1,
        Number(
          width
        ) || 1
      ),

    height:
      Math.max(
        1,
        Number(
          height
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

   출력 조건(getQuoteRatio)만 이 화면의 (감춰진) 입력칸을
   읽으므로 위에 그대로 남아 있다.
========================================================== */


/* =========================================================
   EXPORT WIDTH (호환용 출력 조건)

   크기 표시("1080 × 1350")에만 쓴다. 저장된 값이 없으면
   공용 기본값(posts/style/posts-body-layout.js).
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
