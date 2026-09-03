/* =========================================================
   POSTS - SAFE HTML

   posts.js에서 분리됨.
   getSafeHighlightColor()는 posts.js에 있음
   (같은 페이지에서 함께 로드되어야 함).
========================================================== */

/* =========================================================
   SAFE HTML
========================================================== */

/*
  DB에는 리치텍스트 HTML이 들어가지만,
  허용하는 건 아래뿐.

  - div
  - p
  - br
  - span.post-inline-font
  - span.post-inline-highlight
  - span.post-inline-color
*/


function sanitizeRichNode(
  node,
  target
) {

  if (
    node.nodeType ===
    Node.TEXT_NODE
  ) {

    target.appendChild(
      document.createTextNode(
        node.textContent || ""
      )
    );

    return;

  }


  if (
    node.nodeType !==
    Node.ELEMENT_NODE
  ) {

    return;

  }


  const tag =
    node.tagName
      .toLowerCase();


  /*
    줄바꿈
  */

  if (
    tag === "br"
  ) {

    target.appendChild(
      document.createElement(
        "br"
      )
    );

    return;

  }

    /*
    수동 PAGE BREAK

    DB에는 이 마커를 저장하지만
    일반 게시글 화면에서는 숨김.
  */

  if (
    tag === "div" &&
    node.classList.contains(
      "post-editor-page-break"
    )
  ) {

    const pageBreak =
      document.createElement(
        "div"
      );


    pageBreak.className =
      "post-editor-page-break";


    pageBreak.dataset.pageBreak =
      "true";


    pageBreak.setAttribute(
      "contenteditable",
      "false"
    );


    pageBreak.textContent =
      "PAGE BREAK";


    target.appendChild(
      pageBreak
    );


    return;

  }

  /*
    문단
  */

  if (
    tag === "div" ||
    tag === "p"
  ) {

    const element =
      document.createElement(
        tag
      );


    Array.from(
      node.childNodes
    ).forEach(
      child => {

        sanitizeRichNode(
          child,
          element
        );

      }
    );


    target.appendChild(
      element
    );

    return;

  }


  /*
    볼드/이탤릭/밑줄

    Ctrl+B/I/U는 별도 JS 없이 브라우저 기본 contenteditable
    동작으로 처리되는데(execCommand 없이도 대부분의 브라우저가
    <b>/<i>/<u>를 직접 삽입함), 화이트리스트에 없어서 저장/
    프리뷰 시점에 통째로 벗겨지고 있었다. 태그 자체를 그대로
    허용해서 프리뷰/발췌/저장된 글 모두에 반영되게 한다.
  */

  if (
    tag === "b" ||
    tag === "strong" ||
    tag === "i" ||
    tag === "em" ||
    tag === "u"
  ) {

    const element =
      document.createElement(
        tag
      );


    Array.from(
      node.childNodes
    ).forEach(
      child => {

        sanitizeRichNode(
          child,
          element
        );

      }
    );


    target.appendChild(
      element
    );

    return;

  }


  /*
    허용된 inline span
  */

  if (
    tag === "span"
  ) {

    const hasFont =
      node.classList.contains(
        "post-inline-font"
      );


    const hasHighlight =
      node.classList.contains(
        "post-inline-highlight"
      );


    const hasPointColor =
      node.classList.contains(
        "post-inline-color"
      );


    if (
      hasFont ||
      hasHighlight ||
      hasPointColor
    ) {

      const span =
        document.createElement(
          "span"
        );


      if (hasFont) {

        span.classList.add(
          "post-inline-font"
        );

      }


      if (hasHighlight) {

        span.classList.add(
          "post-inline-highlight"
        );


        const color =
          getSafeHighlightColor(
            node.dataset.highlight
            ||
            node.style.backgroundColor
          );


        span.dataset.highlight =
          color;


        span.style.backgroundColor =
          color;

      }


      if (hasPointColor) {

        span.classList.add(
          "post-inline-color"
        );


        const color =
          getSafePointColor(
            node.dataset.pointColor
            ||
            node.style.color
          );


        span.dataset.pointColor =
          color;


        span.style.color =
          color;

      }


      Array.from(
        node.childNodes
      ).forEach(
        child => {

          sanitizeRichNode(
            child,
            span
          );

        }
      );


      target.appendChild(
        span
      );

      return;

    }

  }


  /*
    나머지 태그는 껍데기만 버리고
    안쪽 텍스트/허용 노드만 살림.
  */

  Array.from(
    node.childNodes
  ).forEach(
    child => {

      sanitizeRichNode(
        child,
        target
      );

    }
  );

}


function sanitizeRichHTML(
  html
) {

  const source =
    document.createElement(
      "div"
    );


  source.innerHTML =
    String(
      html || ""
    );


  const clean =
    document.createElement(
      "div"
    );


  Array.from(
    source.childNodes
  ).forEach(
    child => {

      sanitizeRichNode(
        child,
        clean
      );

    }
  );


  return clean.innerHTML;

}



function legacyMarkupToRichHTML(
  text
) {

  const source =
    String(
      text || ""
    );


  const container =
    document.createElement(
      "div"
    );


  const pattern =
    /(\[font\]|\[\/font\]|\[hl=#[0-9a-fA-F]{6}\]|\[\/hl\]|\[pc=#[0-9a-fA-F]{6}\]|\[\/pc\])/g;


  let lastIndex =
    0;

  let match;


  const stack =
    [container];


  while (
    (
      match =
        pattern.exec(source)
    )
  ) {

    const current =
      stack[
        stack.length - 1
      ];


    if (
      match.index >
      lastIndex
    ) {

      current.appendChild(
        document.createTextNode(
          source.slice(
            lastIndex,
            match.index
          )
        )
      );

    }


    const token =
      match[0];


    if (
      token === "[font]"
    ) {

      const span =
        document.createElement(
          "span"
        );


      span.className =
        "post-inline-font";


      current.appendChild(
        span
      );


      stack.push(
        span
      );

    }


    else if (
      token === "[/font]"
    ) {

      if (
        stack.length > 1
      ) {

        stack.pop();

      }

    }


    else if (
      token.startsWith(
        "[hl="
      )
    ) {

      const color =
        getSafeHighlightColor(
          token.slice(
            4,
            -1
          )
        );


      const span =
        document.createElement(
          "span"
        );


      span.className =
        "post-inline-highlight";


      span.dataset.highlight =
        color;


      span.style.backgroundColor =
        color;


      current.appendChild(
        span
      );


      stack.push(
        span
      );

    }


    else if (
      token === "[/hl]"
    ) {

      if (
        stack.length > 1
      ) {

        stack.pop();

      }

    }


    else if (
      token.startsWith(
        "[pc="
      )
    ) {

      const color =
        getSafePointColor(
          token.slice(
            4,
            -1
          )
        );


      const span =
        document.createElement(
          "span"
        );


      span.className =
        "post-inline-color";


      span.dataset.pointColor =
        color;


      span.style.color =
        color;


      current.appendChild(
        span
      );


      stack.push(
        span
      );

    }


    else if (
      token === "[/pc]"
    ) {

      if (
        stack.length > 1
      ) {

        stack.pop();

      }

    }


    lastIndex =
      pattern.lastIndex;

  }


  if (
    lastIndex <
    source.length
  ) {

    stack[
      stack.length - 1
    ].appendChild(
      document.createTextNode(
        source.slice(
          lastIndex
        )
      )
    );

  }


  /*
    기존 평문 글의 줄바꿈을
    실제 <br>로 변환
  */

  const walker =
    document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT
    );


  const textNodes =
    [];


  while (
    walker.nextNode()
  ) {

    textNodes.push(
      walker.currentNode
    );

  }


  textNodes.forEach(
    node => {

      const value =
        node.nodeValue || "";


      if (
        !value.includes("\n")
      ) {

        return;

      }


      const fragment =
        document.createDocumentFragment();


      const lines =
        value.split(/\r?\n/);


      lines.forEach(
        (line, index) => {

          fragment.appendChild(
            document.createTextNode(
              line
            )
          );


          if (
            index <
            lines.length - 1
          ) {

            fragment.appendChild(
              document.createElement(
                "br"
              )
            );

          }

        }
      );


      node.replaceWith(
        fragment
      );

    }
  );


  return sanitizeRichHTML(
    container.innerHTML
  );

}


/* =========================================================
   CONTENT FORMAT CHECK
========================================================== */

/*
  ★ b/strong/i/em/u도 검사 대상에 포함해야 한다 — 글 전체가
  줄바꿈 하나 없이 볼드/이탤릭/밑줄 서식만 있는 경우(div/p/br/span이
  하나도 없음) 이 태그들을 못 찾으면 legacyMarkupToRichHTML로
  잘못 빠져서, 실제 HTML 태그가 서식으로 해석되지 않고 꺾쇠
  괄호가 그대로 텍스트로 보이는(예: "Hello <strong>world</strong>"가
  글자 그대로 노출) 문제가 있었다 — 볼드/이탤릭/밑줄을 추가했는데
  프리뷰/뷰어에 반영이 안 되던 원인.
*/

function isRichPostContent(
  content
) {

  return (
    /<\s*(?:div|p|br|span|b|strong|i|em|u)\b/i
      .test(
        String(
          content || ""
        )
      )
  );

}


function getPostContentAsSafeHTML(
  content
) {

  const value =
    String(
      content || ""
    );


  if (
    isRichPostContent(
      value
    )
  ) {

    return sanitizeRichHTML(
      value
    );

  }


  return legacyMarkupToRichHTML(
    value
  );

}
