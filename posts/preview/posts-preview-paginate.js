/* =========================================================
   POSTS - PREVIEW: BUILD PAGED PREVIEW / UPDATE

   posts-preview.js에서 분리됨(파일이 너무 커져서 나눔).
   editorPreviewPages 등 상태와 postEditorPreview* DOM
   요소는 posts/editor/posts-refs.js에 있음, 페이지 한 장
   만들기/타이틀·본문 스타일 적용 등은 posts-preview.js에
   있음(둘 다 이 파일보다 먼저 로드돼야 함).

   내용: 본문을 실제로 여러 페이지로 나눠서 그리는 알고리즘
   (renderEditorPreviewPages)과, 프리셋이 바뀌었을 때
   전체를 다시 그리는 진입점(updateEditorPreview).

   본문 사진은 posts-preview-images.js가 미리 정지 raster로
   굳혀 두고(발췌 전용), 여기서는 그 크기만 페이지에 맞춘다 —
   이미지 로딩을 기다리는 자리가 이 안에 없어야 페이지 나누기가
   도중에 어긋나지 않는다.
========================================================== */


/*
  ★ 렌더 세대

  updateEditorPreview()는 폰트와 사진 준비를 기다린다. 그
  기다리는 동안 사용자가 글을 더 치거나 프리셋을 바꾸면 새
  updateEditorPreview()가 시작되는데, 먼저 시작한 쪽이 늦게
  깨어나 최신 화면을 덮어쓰면 안 된다(요구사항 4절). 자기
  세대 번호가 아직 최신인지 확인하고 나서만 그린다.
*/

let editorPreviewRenderVersion = 0;


/* =========================================================
   BUILD PAGED PREVIEW
========================================================== */

function renderEditorPreviewPages(
  options = {}
) {

  const preserveView =
    options.preserveView ===
    true;


  if (
    !postEditorPreviewPages
  ) {
    return;
  }


  const settings =
    postStyleSettings ||
    {};


  applyPostPreviewPresetVariables(
    settings
  );


  /*
    먼저 전체 본문을
    QUOTE 스타일대로 가상 렌더링.
  */

  const source =
    document.createElement(
      "div"
    );


  /*
    본문 사진도 글과 **같은 순서로** 그린다. 여기 들어오는 것은
    이미 굳혀 둔 정지 raster(data: URL)뿐이다 —
    preparePostBodyImagesForPreview()가 updateEditorPreview()에서
    먼저 끝났으므로, 이 안에서는 이미지 로딩을 기다릴 일이 없고
    높이도 나중에 바뀌지 않는다(posts-preview-images.js).

    options.html은 그 준비가 대상으로 삼았던 바로 그 본문이다.
    없으면(직접 호출) 지금 본문을 읽는다.
  */

  const sourceHTML =
    typeof options.html === "string"
      ? options.html
      : getRichEditorHTML();


  renderStyledPostContentInto(
    source,
    sourceHTML,
    settings,
    {
      keepPageBreaks:
        true
    }
  );


  preparePostBodyImageNodesForPreview(
    source,
    settings
  );


  const imageGap =
    postPreviewImageGap(
      settings
    );


  postEditorPreviewPages
    .replaceChildren();


  editorPreviewPages =
    [];


 let current =
  createEditorPreviewPage(
    settings,
    {
      showTitle: true
    }
  );

  postEditorPreviewPages
    .appendChild(
      current.page
    );


  editorPreviewPages.push(
    current.page
  );


  /*
    새로운 페이지 생성
  */

  function startNewPage() {

    current =
  createEditorPreviewPage(
    settings,
    {
      showTitle: false
    }
  );


    postEditorPreviewPages
      .appendChild(
        current.page
      );


    editorPreviewPages.push(
      current.page
    );


    onContinuationPage =
      true;

  }


  /*
    ★ 새 페이지가 <br>(빈 줄) 한가운데서 시작되는 것 방지.

    페이지가 넘어가는 지점이 하필 문단 사이 빈 줄(연속
    <br> 등)이면, 그 <br>이 그대로 새 페이지의 첫 내용으로
    옮겨져서 새 페이지가 빈 줄로 시작해버린다. 새 페이지
    맨 위(최상위 컨테이너가 아직 비어 있을 때)에 놓일
    <br>/공백은 실제 내용이 나오기 전까지 건너뛴다.
    (수동 페이지 나누기로 시작한 페이지에도 동일하게 적용 —
    일관성을 위해 첫 페이지에는 적용하지 않는다.)
  */

  let onContinuationPage =
    false;


  function isLeadingBlankAtPageStart() {

    return (
      onContinuationPage &&
      openChain.length === 0 &&
      current.content.childNodes.length === 0
    );

  }


  /*
    현재 열려 있는 span/div 체인(중첩 가능).
    페이지가 바뀔 때 이 체인을 빈 껍데기로만 새 페이지에
    다시 만들어서 이어붙인다. 예: 긴 인용구 span 중간에서
    페이지가 넘어가도, 같은 span이 다음 페이지에서 다시
    열려서 스타일이 이어진다.
  */

  let openChain = [];


  function currentContainer() {

    if (openChain.length === 0) {
      return current.content;
    }

    return openChain[
      openChain.length - 1
    ].shell;

  }


  function rebuildOpenChain() {

    let parent = current.content;

    openChain.forEach(
      entry => {

        const shell =
          entry.original.cloneNode(
            false
          );

        parent.appendChild(shell);

        entry.shell = shell;

        parent = shell;

      }
    );

  }


  /*
    텍스트 노드는 단어 단위로 넣어서
    캔버스를 넘는 순간 다음 페이지로 넘김.
    (어떤 깊이의 span 안에서든 동일하게 동작)
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
          previewCurrentPageIsOverflowing(
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


  /*
    ★ 사진 한 장 넣기

    사진은 글자와 달리 쪼갤 수 없다 — 한 장을 두 페이지에 나눠
    자르지 않는다(요구사항 4절). 그래서 순서는 이렇다.

      1. 본문 너비에 맞춘 크기로 지금 페이지에 넣어 본다.
      2. 넘치면 통째로 다음 페이지로 옮긴다. (단, 지금 페이지가
         아직 비어 있으면 옮겨도 같은 상황이므로 빈 페이지를
         만들지 않고 바로 3으로 간다.)
      3. 새 페이지에도 안 들어가면 비율을 지켜 줄인다. 줄일 폭은
         "실제로 넘치는지"를 재서 찾으므로, 여백·제목·출처·페이지
         번호가 차지하는 자리가 자동으로 빠진다.

    AUTO 높이 프리셋에서는 페이지가 콘텐츠만큼 늘어나 애초에
    넘치지 않는다 — 그래서 2·3이 일어나지 않고 사진이 그대로
    이어진다(고정 높이 규칙을 AUTO에 적용하지 않는다).
  */

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


    /* 이분 탐색 — 넘치지 않는 가장 큰 너비. 반복 횟수를 못박아
       두므로 어떤 경우에도 무한히 돌지 않는다. */

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
        previewCurrentPageIsOverflowing(
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
      postPreviewPageBodyWidth(
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


    /* 페이지 맨 위에서는 위 간격을 주지 않는다 — 새 페이지가
       빈 줄로 시작하지 않게 하는 규칙과 같은 이유다. */

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
      !previewCurrentPageIsOverflowing(
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
        !previewCurrentPageIsOverflowing(
          current
        )
      ) {

        return;

      }

    }


    shrinkPreviewImageToFit(
      clone,
      postPreviewPageBodyWidth(
        current.content,
        settings
      ),
      ratio
    );

  }


  /*
    노드를 재귀적으로 삽입.
    텍스트는 단어 단위 분할, 자식이 있는 요소(인용구/강조
    span 등)는 빈 껍데기만 새로 만들고 그 안에 자식을
    재귀적으로 이어붙인다 — 긴 인용구 span도 이렇게 하면
    통째로 넘치는 대신 단어 단위로 쪼개져서 페이지 경계를
    올바르게 넘어간다. <br>처럼 자식이 없는 요소만 기존처럼
    통째로 한 번 검사한다.
  */

  function appendNode(
    node
  ) {

    /*
      ★ 수동 PAGE BREAK

      남은 공간이 있어도
      강제로 새 페이지 시작.
    */

    if (
      isEditorPageBreakNode(
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
      사진(과 못 읽은 사진의 자리표시자)은 쪼개지 않는 한 덩어리다.
      아래 일반 경로는 넘칠 때 "다음 페이지로 옮기기"까지만 하므로
      새 페이지에도 안 들어가는 긴 사진을 처리할 수 없다.
    */

    if (
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
      node.childNodes.length >
        0;


    if (!canRecurse) {

      /*
        <br>나 빈 요소는 통째로 넣고
        한 번만 넘침 검사(이미 충분히 작음).
      */

      if (
        node.nodeName ===
          "BR" &&
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
        previewCurrentPageIsOverflowing(
          current
        )
      ) {

        clone.remove();


        startNewPage();
        rebuildOpenChain();


        if (
          node.nodeName ===
            "BR" &&
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


    /*
      자식이 있는 span/div 등은 빈 껍데기만 새로 만들고
      그 안에 자식을 재귀적으로 이어붙인다.
    */

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


  /*
    원본의 최상위 노드를 순서대로 삽입.
  */

  Array.from(
    source.childNodes
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
    editorPreviewPages.length > 1
    &&
    current.content.childNodes.length ===
      0
  ) {

    current.page.remove();


    editorPreviewPages.pop();

  }


  /*
    data-page-index
  */

  editorPreviewPages.forEach(
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


  showEditorPreviewPage(
    Math.min(
      editorPreviewPageIndex,
      editorPreviewPages.length - 1
    ),
    {
      resetZoom:
        !preserveView
    }
  );

  applyEditorPreviewScale();

}



/* =========================================================
   UPDATE PREVIEW
========================================================== */

async function updateEditorPreview(
  options = {}
) {

  if (
    !postEditorPreviewPages
  ) {
    return;
  }


  /*
    ★ 폰트(Pretendard/Nanum Myeongjo)가 아직 로딩 중일 때
    페이지 분할을 계산하면 대체 폰트 기준으로 잰 줄바꿈/
    문단 높이를 그대로 써버린다 — 데스크톱은 폰트가 보통
    이미 캐시돼 있어 티가 안 나지만, 모바일(특히 에디터에
    들어가자마자 바로 프리뷰부터 여는 경우)은 아직 폰트
    요청이 끝나기 전이라 실제 완성된 폰트로 다시 그려질 때와
    다른 분량으로 쪼개지거나, "고정" source가 밀어내야 할
    본문 높이 자체가 잘못 계산돼 있었을 수 있다(export
    쪽엔 이미 같은 이유로 적용돼 있던 처리). 이미 로드됐으면
    즉시 resolve되니 재렌더링 쪽에는 비용이 거의 없다.
  */

  editorPreviewRenderVersion += 1;


  const version =
    editorPreviewRenderVersion;


  if (
    document.fonts?.ready
  ) {

    await document.fonts.ready;

  }


  if (
    version !== editorPreviewRenderVersion
  ) {

    return;

  }


  /*
    ★ 본문 사진도 폰트와 같은 이유로 먼저 준비한다 — 크기를 모르는
    이미지를 페이지에 넣으면 높이가 나중에 바뀌어 이미 나눈 페이지가
    어긋난다. 여기서 굳혀 두면 renderEditorPreviewPages()는 동기
    계산만 한다(posts-preview-images.js).

    준비가 끝난 뒤 세대를 다시 확인한다 — 사진을 읽는 동안 본문이나
    프리셋이 바뀌었으면 그 사이에 시작된 새 렌더가 최신이다.
  */

  const html =
    getRichEditorHTML();


  const prepared =
    await preparePostBodyImagesForPreview(
      html
    );


  if (
    version !== editorPreviewRenderVersion
  ) {

    return;

  }


  renderEditorPreviewPages(
    {
      ...options,
      html
    }
  );


  reportPostPreviewImageFailure(
    prepared.failed
  );

}
