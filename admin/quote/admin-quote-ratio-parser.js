/* =========================================================
   QUOTE - RATIO / DIALOGUE PARSER / BODY RENDER

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 비율 계산, 액션/대사 파서 및 스타일, 테스트 본문
   렌더링, 줄바꿈 모드, 세로 정렬, 캔버스 패딩.
========================================================== */


/* =========================================================
   RATIO
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
    currentQuoteRatio
      .split(":")
      .map(Number);


  return {
    width,
    height
  };

}


/* =========================================================
   ACTION / DIALOGUE / HIGHLIGHT / POINT COLOR PARSER

   테스트 프리뷰 전용 문법(실제 글 콘텐츠와는 무관):
   *text*   → action
   "text"   → dialogue
   ==text== → highlight (quoteHighlightColor 배경색)
   ^text^   → point color (quotePointColor 글자색)
========================================================== */

function renderStyledQuoteText(
  container,
  text
) {

  const pattern =
    /(\*[^*\n]+\*|"[^"\n]+"|“[^”\n]+”|==[^=\n]+==|\^[^^\n]+\^)/g;


  let lastIndex =
    0;


  let match;


  while (
    (
      match =
        pattern.exec(
          text
        )
    ) !== null
  ) {

    if (
      match.index >
      lastIndex
    ) {

      container.appendChild(
        document.createTextNode(
          text.slice(
            lastIndex,
            match.index
          )
        )
      );

    }


    const rawText =
      match[0];


    const span =
      document.createElement(
        "span"
      );


    if (
      rawText.startsWith("*")
    ) {

      span.className =
        "quote-action-text";


      span.textContent =
        rawText.slice(
          1,
          -1
        );

    } else if (
      rawText.startsWith("==")
    ) {

      span.className =
        "quote-highlight-text";


      span.textContent =
        rawText.slice(
          2,
          -2
        );

    } else if (
      rawText.startsWith("^")
    ) {

      span.className =
        "quote-point-text";


      span.textContent =
        rawText.slice(
          1,
          -1
        );

    } else {

      span.className =
        "quote-dialogue-text";


      span.textContent =
        rawText;

    }


    container.appendChild(
      span
    );


    lastIndex =
      pattern.lastIndex;

  }


  if (
    lastIndex <
    text.length
  ) {

    container.appendChild(
      document.createTextNode(
        text.slice(
          lastIndex
        )
      )
    );

  }

}


/* =========================================================
   ACTION / DIALOGUE STYLE
========================================================== */

function applySpecialQuoteStyles() {

  if (!quotePreviewText) {
    return;
  }


  quotePreviewText
    .querySelectorAll(
      ".quote-action-text"
    )
    .forEach(
      element => {

        element.style.color =
          quoteActionColor?.value ||
          "#888888";


        element.style.fontWeight =
          quoteActionWeight?.value ||
          "400";


        element.style.fontStyle =
          quoteActionItalic?.checked
            ? "italic"
            : "normal";

      }
    );


  quotePreviewText
    .querySelectorAll(
      ".quote-dialogue-text"
    )
    .forEach(
      element => {

        element.style.color =
          quoteDialogueColor?.value ||
          "#333333";


        element.style.fontWeight =
          quoteDialogueWeight?.value ||
          "500";


        element.style.fontStyle =
          quoteDialogueItalic?.checked
            ? "italic"
            : "normal";

      }
    );


  quotePreviewText
    .querySelectorAll(
      ".quote-highlight-text"
    )
    .forEach(
      element => {

        element.style.backgroundColor =
          quoteHighlightColor?.value ||
          "#f4dce6";

      }
    );


  quotePreviewText
    .querySelectorAll(
      ".quote-point-text"
    )
    .forEach(
      element => {

        element.style.color =
          quotePointColor?.value ||
          "#5c7cfa";

      }
    );

}


/* =========================================================
   BODY RENDER
========================================================== */

function renderQuoteBody() {

  if (
    !quoteTestBody ||
    !quotePreviewText
  ) {
    return;
  }


  const text =
    quoteTestBody.value;


  quotePreviewText.innerHTML =
    "";


  const paragraphs =
    text.split(
      /\n\s*\n/
    );


  paragraphs.forEach(
    paragraphText => {

      const paragraph =
        document.createElement(
          "p"
        );


      paragraph.style.whiteSpace =
        "pre-wrap";


      renderStyledQuoteText(
        paragraph,
        paragraphText
      );


      quotePreviewText.appendChild(
        paragraph
      );

    }
  );


  applySpecialQuoteStyles();

}


/* =========================================================
   LINE BREAK
========================================================== */

function applyLineBreakMode() {

  if (!quotePreviewText) {
    return;
  }


  const mode =
    quoteLineBreak?.value ||
    "keep";


  if (mode === "char") {

    quotePreviewText.style.wordBreak =
      "break-all";


    quotePreviewText.style.overflowWrap =
      "anywhere";

  }


  else if (
    mode === "word"
  ) {

    quotePreviewText.style.wordBreak =
      "normal";


    quotePreviewText.style.overflowWrap =
      "break-word";

  }


  else {

    quotePreviewText.style.wordBreak =
      "keep-all";


    quotePreviewText.style.overflowWrap =
      "break-word";

  }

}


/* =========================================================
   VERTICAL ALIGN
========================================================== */

function applyVerticalAlignment() {

  if (!quotePreviewCanvas) {
    return;
  }


  const align =
    quoteVerticalAlign?.value ||
    "top";


  if (align === "center") {

    quotePreviewCanvas.style.justifyContent =
      "center";

  }


  else if (
    align === "bottom"
  ) {

    quotePreviewCanvas.style.justifyContent =
      "flex-end";

  }


  else {

    quotePreviewCanvas.style.justifyContent =
      "flex-start";

  }

}


/* =========================================================
   CANVAS PADDING
========================================================== */

function applyCanvasPadding() {

  if (!quotePreviewCanvas) {
    return;
  }


  const base =
    Math.max(
      0,
      Number(
        quotePadding?.value
      ) || 0
    );


  const vertical =
    Math.max(
      0,
      Number(
        quoteVerticalPadding?.value
      ) || 0
    );


  const horizontal =
    Math.max(
      0,
      Number(
        quoteHorizontalPadding?.value
      ) || 0
    );


  quotePreviewCanvas.style.padding =
    `${base + vertical}px ${base + horizontal}px`;

}


