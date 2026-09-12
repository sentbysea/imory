/* =========================================================
   POSTS - STYLE: BODY / RENDER POST

   posts-style.js 분할본 중 마지막. postStyleSettings 등은
   posts/editor/posts-refs.js에 있음(반드시 먼저
   로드돼야 함).

   내용: 실제 글 본문을 컨테이너에 렌더링
   (renderStyledPostContentInto/renderStyledPostContent).

   ★ 본문 글꼴/색/행간/줄바꿈(applyPostBodyStyles)과 문단
   간격(applyPostParagraphSpacing), 설정 정규화는
   posts/style/posts-body-layout.js로 옮겼다 — Quote Preset
   미리보기(admin)와 에디터 PREVIEW(index)가 같은 계산을
   쓰기 위해서다. 그 파일이 이 파일보다 먼저 로드돼야 한다.
========================================================== */


/* =========================================================
   RENDER POST
========================================================== */

function renderStyledPostContentInto(
  container,
  content,
  settings = {},
  options = {}
) {

  if (!container) {
    return;
  }


  const resolved =
    normalizePostStyleSettings(
      settings
    );


  container.replaceChildren();


  const safeHTML =
    getPostContentAsSafeHTML(
      content
    );


  const temp =
    document.createElement(
      "div"
    );


  temp.innerHTML =
    safeHTML;


  while (
    temp.firstChild
  ) {

    container.appendChild(
      temp.firstChild
    );

  }

  /*
    일반 게시글에서는
    PAGE BREAK 마커를 보여주지 않음.

    PREVIEW 페이지 계산할 때만 유지.
  */

  if (
    !options.keepPageBreaks
  ) {

    container
      .querySelectorAll(
        ".post-editor-page-break"
      )
      .forEach(
        marker => {

          marker.remove();

        }
      );

  }

  applyPostBodyStyles(
    container,
    resolved
  );


  /*
    QUOTE의 문단 간격 — 옛 legacy 콘텐츠에만 있는
    <div>/<p> 문단.

    ★ 이 에디터는 Enter를 눌러도 <div>/<p>가 아니라 <br>만
    만들기 때문에, 실제로 작성한 글에는 아래 blocks가 하나도
    없다. <br> 기반 문단 경계는 applyPostParagraphSpacing가
    처리한다(posts-body-layout.js).
  */

  const blocks =
    container.querySelectorAll(
      ":scope > div, :scope > p"
    );


  blocks.forEach(
    (
      block,
      index
    ) => {

      block.style.marginTop =
        "0";


      block.style.marginBottom =
        index ===
        blocks.length - 1
          ? "0"
          : `${resolved.paragraphSpacing}px`;


      block.style.textIndent =
        `${resolved.indent}px`;

    }
  );


  applyPostParagraphSpacing(
    container,
    resolved
  );


  /*
    ★ 장식 세 가지의 순서가 중요하다(posts/style/posts-body-decor.js).

      1. 중첩 형광펜 정리   겹쳐 칠해진 옛 본문을 먼저 펴야
                            높이 계산이 한 겹에만 걸린다.
      2. 형광펜 높이        색은 그대로 두고 칠하는 높이만 정한다.
      3. 문단 강조선        문단 경계는 바로 위에서 만든 간격
                            블록이므로 applyPostParagraphSpacing
                            **뒤**여야 한다. 지문/대사 파싱보다는
                            앞이다 — 감싸는 상자가 생겨도 파싱은
                            모든 깊이를 훑으므로 결과가 같고,
                            대사 판별을 위해 문단 원문이 필요하다.
  */

  flattenNestedPostHighlights(
    container
  );


  applyPostHighlightHeight(
    container,
    resolved
  );


  applyPostParagraphRules(
    container,
    resolved
  );


  applyActionDialogueStyles(
    container,
    resolved
  );

}


function renderStyledPostContent(
  content,
  settings = {}
) {

  renderStyledPostContentInto(
    postDetailContent,
    content,
    settings
  );

}
