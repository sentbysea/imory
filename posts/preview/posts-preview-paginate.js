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
========================================================== */


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


  renderStyledPostContentInto(
    source,
    getRichEditorHTML(),
    settings,
    {
      keepPageBreaks:
        true
    }
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

  if (
    document.fonts?.ready
  ) {

    await document.fonts.ready;

  }


  renderEditorPreviewPages(
    options
  );

}
