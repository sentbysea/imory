/* =========================================================
   POSTS - SAFE HTML

   posts.js에서 분리됨.
   getSafeHighlightColor()는 posts.js에 있음
   (같은 페이지에서 함께 로드되어야 함).
========================================================== */


/* =========================================================
   본문 사진 (BODY IMAGE)

   기준 문서: IMORY_POST_BODY_IMAGE_DESIGN.md

   본문에 들어가는 사진은 **식별자 하나**로만 표현된다.

     <img src="/api/post-cover?image=<uuid>"
          alt="..."
          data-imory-image="<uuid>">

   ★ 왜 주소가 아니라 식별자인가
     파일은 비공개 버킷에 있고 공개 주소가 없다. 화면에 들어가는
     주소는 우리 도메인 경로뿐이고, 그 요청마다 서버가 글의 현재
     공개 상태와 요청자를 다시 확인한다(functions/api/post-cover.js).
     그래서 본문에 저장되는 것은 "어느 사진인가"뿐이고, 주소는
     여기서 **매번 다시 만든다**. 저장된 HTML에 남은 주소를 그대로
     믿지 않는다는 뜻이다 — 남이 만든 HTML(HTML 모드로 쓴 글,
     예전 글)이 외부 주소를 본문 이미지로 끼워 넣을 수 없다.

   ★ 대표 사진 표시는 여기에 없다
     "이 글의 대표 사진"은 post_gallery_images.is_primary 행이
     갖는다. 본문 HTML에는 그 표시도, 편집용 컨트롤도 들어가지
     않는다(요구사항 2절) — 그래서 공개 본문/발췌에 편집 흔적이
     새어나갈 자리가 구조적으로 없다.
========================================================== */

const POST_BODY_IMAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function buildPostBodyImageUrl(
  imageId
) {

  return `/api/post-cover?image=${encodeURIComponent(imageId)}`;

}


/*
  -> uuid | null

  data-imory-image를 먼저 본다. 없으면 src의 ?image= 값을 읽는다 —
  GALLERY-1이 자동 생성해 저장해 둔 예전 갤러리 본문
  (<p><img src="/api/post-cover?image=..."></p>)이 그 모양이라,
  이 한 줄로 예전 글이 공통 에디터에서 그대로 열린다.
*/

function getPostBodyImageId(
  node
) {

  const fromData =
    node &&
    typeof node.getAttribute === "function"
      ? node.getAttribute("data-imory-image")
      : null;


  if (
    fromData &&
    POST_BODY_IMAGE_ID_PATTERN.test(fromData)
  ) {

    return fromData;

  }


  const src =
    node &&
    typeof node.getAttribute === "function"
      ? node.getAttribute("src") || ""
      : "";


  const match =
    /[?&]image=([^&"'\s]+)/.exec(src);


  const candidate =
    match
      ? decodeURIComponent(match[1])
      : "";


  return POST_BODY_IMAGE_ID_PATTERN.test(candidate)
    ? candidate
    : null;

}


/*
  본문에 실제로 들어 있는 사진 식별자를 **나온 순서대로** 돌려준다.
  저장이 position을 이 순서로 매기고(요구사항 4절 "텍스트와 사진의
  배치 순서를 저장"), 발췌도 같은 순서로 사진을 준비한다
  (posts/preview/posts-preview-images.js).

  ★ 예전에 여기 있던 stripPostBodyImages()는 없어졌다. 발췌가
  사진을 걷어내던 시절의 함수였고, 이제 발췌는 글과 사진을 같은
  순서로 함께 그린다(기준 문서 IMORY_POST_BODY_IMAGE_DESIGN.md §7).
*/

function listPostBodyImageIds(
  root
) {

  if (!root) {

    return [];

  }


  const ids =
    [];


  root
    .querySelectorAll(
      "img"
    )
    .forEach(
      image => {

        const id =
          getPostBodyImageId(
            image
          );


        if (
          id &&
          !ids.includes(id)
        ) {

          ids.push(id);

        }

      }
    );


  return ids;

}


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
  - span.post-para-rule (강조선 마커 — 내용 없는 표시 하나)
  - img (본문 사진 — 식별자 하나로만, 위 주석 참고)
*/


/*
  복사 상자 · 메모의 안쪽 — **글자와 <br>만** 남긴다.

  ★ 왜 여기만 다른가 (요구사항 5·8)

    본문의 나머지는 형광펜·굵게 같은 인라인 서식을 허용한다.
    이 두 상자는 반대다 — 상자에 넣는 것은 "그대로 보여주고
    그대로 복사할 글자"이고, 붙여넣기나 옛 글에서 들어온 태그가
    살아나면 복사되는 글자와 화면이 달라진다.

    그래서 어떤 태그든 껍데기는 버리고 글자만 살린다. 줄바꿈만
    <br>로 유지한다 — 화면의 줄 수와 복사되는 줄 수가 같아야
    하기 때문이다. 편집 중 브라우저가 만들어 넣는 <div> 묶음도
    여기서 <br> 하나로 평평해진다.
*/

function sanitizeBlockTextInto(
  node,
  target
) {

  Array.from(
    node.childNodes
  ).forEach(
    child => {

      if (
        child.nodeType ===
        Node.TEXT_NODE
      ) {

        target.appendChild(
          document.createTextNode(
            child.textContent ||
            ""
          )
        );


        return;

      }


      if (
        child.nodeType !==
        Node.ELEMENT_NODE
      ) {

        return;

      }


      /* 조작 UI와 공개 화면의 복사 버튼은 글자가 아니다 */

      if (
        isPostBlockToolNode(
          child
        ) ||
        child.classList.contains(
          POST_COPY_BOX_COPY_CLASS
        )
      ) {

        return;

      }


      if (
        child.tagName === "BR"
      ) {

        target.appendChild(
          document.createElement(
            "br"
          )
        );


        return;

      }


      const isBlock =
        child.tagName === "DIV" ||
        child.tagName === "P";


      /*
        블록은 자기 줄을 차지한다 — 앞뒤 **양쪽**에서 줄을 바꾼다.

        뒤쪽을 빠뜨리면 블록 다음에 오는 글자가 같은 줄에 붙어서,
        화면에 보이는 줄 수와 복사되는 줄 수가 달라진다.

        단, 맨 앞이거나 이미 <br>로 끝난 자리에서는 빈 줄을 하나
        더 만들지 않는다.
      */

      const breakHere =
        () => {

          const last =
            target.lastChild;


          if (
            last &&
            last.nodeName !== "BR"
          ) {

            target.appendChild(
              document.createElement(
                "br"
              )
            );

          }

        };


      if (isBlock) {

        breakHere();

      }


      sanitizeBlockTextInto(
        child,
        target
      );


      if (isBlock) {

        breakHere();

      }

    }
  );

}


/*
  복사 상자 · 메모를 통째로 다시 만든다. 바깥 class와 두 칸의
  class만 우리가 정하고, 안쪽은 위 규칙대로 글자만 옮긴다.
  칸이 없는 옛/망가진 마크업이면 빈 칸을 만들어 구조를 맞춘다.
*/

function sanitizeRichTextBlock(
  node,
  blockClass,
  titleClass,
  bodyClass
) {

  const block =
    document.createElement(
      "div"
    );


  block.className =
    blockClass;


  [
    titleClass,
    bodyClass
  ].forEach(
    partClass => {

      const part =
        document.createElement(
          "div"
        );


      part.className =
        partClass;


      const source =
        node.querySelector(
          `.${partClass}`
        );


      if (source) {

        sanitizeBlockTextInto(
          source,
          part
        );

      }


      block.appendChild(
        part
      );

    }
  );


  return block;

}


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
    본문 사진

    식별자를 읽어내지 못하면 **통째로 버린다** — 외부 주소나
    data: URL이 본문에 들어올 자리가 없다. 살아남는 경우에도
    src는 남아 있던 값이 아니라 식별자로 다시 만든 우리 도메인
    경로다(위 buildPostBodyImageUrl 주석).

    편집 중에는 아직 올리지 않은 파일의 blob: 미리보기가 src에
    들어 있는데, 그 상태에서 저장을 눌러도 여기서 정식 주소로
    바뀌므로 blob: 주소가 DB에 들어갈 수 없다.
  */

  if (
    tag === "img"
  ) {

    const imageId =
      getPostBodyImageId(
        node
      );


    if (!imageId) {

      return;

    }


    const image =
      document.createElement(
        "img"
      );


    image.setAttribute(
      "src",
      buildPostBodyImageUrl(
        imageId
      )
    );


    image.setAttribute(
      "alt",
      String(
        node.getAttribute("alt") || ""
      ).slice(0, 200)
    );


    image.setAttribute(
      "data-imory-image",
      imageId
    );


    image.setAttribute(
      "loading",
      "lazy"
    );


    target.appendChild(
      image
    );

    return;

  }

  /*
    편집창 전용 조작 UI (삭제 버튼 · 구분선 종류 드롭다운)

    ★ 통째로 버린다 — 안쪽 글자도 살리지 않는다 (요구사항 8).

    저장되는 HTML · 공개 본문 · 발췌 이미지 어디에도 조작
    아이콘이 들어갈 자리가 없어야 한다. 화이트리스트에 없는
    일반 span/div는 아래 기본 경로에서 "껍데기만 벗기고 안쪽
    글자는 살리는데", 이 UI는 그 반대여야 하므로 여기서 먼저
    끊는다(posts/style/posts-body-blocks.js).
  */

  if (
    isPostBlockToolNode(
      node
    )
  ) {

    return;

  }


  /*
    복사 상자 · 메모 (요구사항 5·6)

    바깥 상자와 제목/내용 두 칸만 다시 만든다. 안쪽은
    sanitizeBlockTextInto가 **글자와 <br>만** 남기므로,
    사용자가 써넣은 HTML 코드가 태그로 살아나지 않고 글자
    그대로 보이고 그대로 복사된다.
  */

  if (
    isPostCopyBoxNode(
      node
    )
  ) {

    target.appendChild(
      sanitizeRichTextBlock(
        node,
        POST_COPY_BOX_CLASS,
        POST_COPY_BOX_TITLE_CLASS,
        POST_COPY_BOX_BODY_CLASS
      )
    );

    return;

  }


  if (
    isPostMemoNode(
      node
    )
  ) {

    target.appendChild(
      sanitizeRichTextBlock(
        node,
        POST_MEMO_CLASS,
        POST_MEMO_TITLE_CLASS,
        POST_MEMO_BODY_CLASS
      )
    );

    return;

  }


  /*
    구분선 (요구사항 7) — 종류 하나만 남는다.
    알 수 없는 값은 실선으로 읽힌다.
  */

  if (
    isPostDividerNode(
      node
    )
  ) {

    target.appendChild(
      createPostDivider(
        node.dataset.divider
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
    볼드/이탤릭/밑줄/취소선

    Ctrl+B/I/U는 별도 JS 없이 브라우저 기본 contenteditable
    동작으로 처리되는데(execCommand 없이도 대부분의 브라우저가
    <b>/<i>/<u>를 직접 삽입함), 화이트리스트에 없어서 저장/
    프리뷰 시점에 통째로 벗겨지고 있었다. 태그 자체를 그대로
    허용해서 프리뷰/발췌/저장된 글 모두에 반영되게 한다.

    ★ 취소선은 <s>로 모은다 — 툴바가 넣는 것도 <s>지만, 붙여넣기나
    옛 글에서 <strike>/<del>이 들어올 수 있다. 셋을 다 허용하되
    저장되는 태그는 하나로 통일해서, 툴바의 해제 판정과 뷰어의
    렌더가 갈리지 않게 한다.
  */

  if (
    tag === "b" ||
    tag === "strong" ||
    tag === "i" ||
    tag === "em" ||
    tag === "u" ||
    tag === "s" ||
    tag === "strike" ||
    tag === "del"
  ) {

    const element =
      document.createElement(
        tag === "strike" ||
        tag === "del"
          ? "s"
          : tag
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


    /*
      강조선 마커 (기준 문서: posts/style/posts-body-decor.js §3)

      저장되는 것은 "이 문단에 선을 걸었다/걸지 않았다"는 표시
      하나뿐이다. 실제로 선을 그리는 상자(.post-para-rule-box)는
      렌더링 단계에서 만들고 저장하지 않는다 — 여기서 그 상자를
      따로 막을 필요는 없다. 화이트리스트에 없는 span이라 아래
      기본 경로에서 껍데기가 벗겨지고 안쪽 내용만 살아남는다.

      ★ 마커는 언제나 **비운 채로** 내보낸다. contenteditable에서
      사용자가 문단 맨 앞에 글자를 치면 그 글자가 마커 안으로
      들어갈 수 있는데, 그대로 두면 그 글자까지 마커로 다뤄진다.
      내용은 마커 **뒤로** 꺼내서 본문에 그대로 남긴다.
    */

    if (
      node.classList.contains(
        "post-para-rule"
      )
    ) {

      const mark =
        document.createElement(
          "span"
        );


      mark.className =
        "post-para-rule";


      mark.dataset.rule =
        node.dataset.rule === "off"
          ? "off"
          : "on";


      const ruleColor =
        String(
          node.dataset.ruleColor ||
          ""
        );


      if (
        /^#[0-9a-fA-F]{6}$/.test(
          ruleColor
        )
      ) {

        mark.dataset.ruleColor =
          ruleColor;

      }


      target.appendChild(
        mark
      );


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


      return;

    }


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


  /*
    ★ 중첩된 형광펜을 여기서 한 번 편다 (요구사항 2).

    형광펜 안에 형광펜이 있으면 두 배경이 겹쳐 보인다. 안쪽이
    사용자가 나중에 고른 색이므로 안쪽이 이기고, 겹치지 않는
    양옆은 바깥 색 그대로 남는다(posts/style/posts-body-decor.js의
    flattenNestedPostHighlights).

    저장된 데이터를 일괄로 훑어 고치는 마이그레이션은 없다 —
    이 함수를 지나는 경로(에디터가 저장할 HTML을 읽을 때, 글을
    화면에 그릴 때)에서만 정리된다.
  */

  if (
    typeof flattenNestedPostHighlights === "function"
  ) {

    flattenNestedPostHighlights(
      clean
    );

  }


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
  ★ b/strong/i/em/u/s도 검사 대상에 포함해야 한다 — 글 전체가
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
    /<\s*(?:div|p|br|span|b|strong|i|em|u|s|strike|del|img)\b/i
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
