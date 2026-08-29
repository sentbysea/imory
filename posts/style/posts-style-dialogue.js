/* =========================================================
   POSTS - STYLE: ACTION / DIALOGUE

   posts-style.js 분할본. postStyleSettings 등은
   posts/editor/posts-refs.js에 있음(반드시 먼저
   로드돼야 함).

   내용: 액션/대사 표기(*이런 식*, "이런 식")를 실제
   스타일로 바꿔주는 파서 및 스타일 적용.
========================================================== */


/* =========================================================
   ACTION / DIALOGUE
========================================================== */

/*
  텍스트 노드가 이미 point color(post-inline-color) span
  안에 있으면 그 색을 돌려준다 — 액션/대사 처리가 새 span을
  끼워 넣으면서 자기 색을 하드코딩해버리면, 안쪽 텍스트 노드
  기준으로는 그 새 span이 더 가까운 조상이 되어 point color가
  가려진다(같은 color 속성이라도 자기 자신에 직접 지정된 값이
  상속보다 우선하기 때문). weight/자간은 그대로 preset 값을
  쓰고 색만 point color로 덮어써서 이 문제를 피한다.
*/

function findAncestorPointColor(
  textNode
) {

  const pointColorEl =
    textNode.parentElement
      ?.closest(
        ".post-inline-color"
      );


  if (!pointColorEl) {
    return null;
  }


  return (
    pointColorEl.dataset.pointColor ||
    pointColorEl.style.color ||
    null
  );

}


function replaceActionDialogueTextNode(
  textNode,
  settings = {}
) {

  const text =
    textNode.nodeValue ||
    "";


  const pattern =
    /(\*[^*\n]+\*|"[^"\n]+"|“[^”\n]+”)/g;


  if (
    !pattern.test(
      text
    )
  ) {

    return;

  }


  pattern.lastIndex =
    0;


  const pointColor =
    findAncestorPointColor(
      textNode
    );


  const fragment =
    document.createDocumentFragment();


  let lastIndex =
    0;

  let match;


  while (
    (
      match =
        pattern.exec(
          text
        )
    )
  ) {

    if (
      match.index >
      lastIndex
    ) {

      fragment.appendChild(
        document.createTextNode(
          text.slice(
            lastIndex,
            match.index
          )
        )
      );

    }


    const value =
      match[0];


    const span =
      document.createElement(
        "span"
      );


    if (
      value.startsWith("*") &&
      value.endsWith("*")
    ) {

      span.className =
        "post-action";


      span.textContent =
        value.slice(
          1,
          -1
        );


      span.style.color =
        pointColor ||
        settings.actionColor ||
        "#888888";


      span.style.fontWeight =
        settings.actionWeight ||
        "400";

    }


    else {

      span.className =
        "post-dialogue";


      span.textContent =
        value;


      span.style.color =
        pointColor ||
        settings.dialogueColor ||
        settings.bodyColor ||
        "#555555";


      span.style.fontWeight =
        settings.dialogueWeight ||
        settings.bodyWeight ||
        "400";

    }


    fragment.appendChild(
      span
    );


    lastIndex =
      pattern.lastIndex;

  }


  if (
    lastIndex <
    text.length
  ) {

    fragment.appendChild(
      document.createTextNode(
        text.slice(
          lastIndex
        )
      )
    );

  }


  textNode.replaceWith(
    fragment
  );

}


function applyActionDialogueStyles(
  container,
  settings = {}
) {

  if (!container) {
    return;
  }


  /*
    =========================================
    1. 여러 inline 요소에 걸친 ACTION 처리
       예:
       *텍스트 <span>하이라이트</span> 텍스트*
    =========================================
  */

  function getFirstTextNode(
    node
  ) {

    if (
      node.nodeType ===
      Node.TEXT_NODE
    ) {

      return node;

    }


    for (
      const child of
      node.childNodes
    ) {

      const found =
        getFirstTextNode(
          child
        );


      if (found) {
        return found;
      }

    }


    return null;

  }


  function getLastTextNode(
    node
  ) {

    if (
      node.nodeType ===
      Node.TEXT_NODE
    ) {

      return node;

    }


    for (
      let index =
        node.childNodes.length - 1;

      index >= 0;

      index -= 1
    ) {

      const found =
        getLastTextNode(
          node.childNodes[index]
        );


      if (found) {
        return found;
      }

    }


    return null;

  }


  function wrapActionNodes(
    nodes
  ) {

    if (
      !nodes ||
      nodes.length === 0
    ) {
      return;
    }


    const text =
      nodes
        .map(
          node =>
            node.textContent || ""
        )
        .join("");


    const trimmed =
      text.trim();


    /*
      줄 전체가 * ... *인 경우만 ACTION.
    */

    if (
      !trimmed.startsWith("*") ||
      !trimmed.endsWith("*") ||
      trimmed.length < 2
    ) {

      return;

    }


    const firstText =
      getFirstTextNode(
        nodes[0]
      );


    const lastText =
      getLastTextNode(
        nodes[
          nodes.length - 1
        ]
      );


    if (
      !firstText ||
      !lastText
    ) {
      return;
    }


    /*
      앞쪽 * 제거
    */

    firstText.nodeValue =
      firstText.nodeValue
        .replace(
          "*",
          ""
        );


    /*
      뒤쪽 * 제거
    */

    const lastValue =
      lastText.nodeValue ||
      "";


    const lastStarIndex =
      lastValue
        .lastIndexOf(
          "*"
        );


    if (
      lastStarIndex !== -1
    ) {

      lastText.nodeValue =
        lastValue.slice(
          0,
          lastStarIndex
        )
        +
        lastValue.slice(
          lastStarIndex + 1
        );

    }


    /*
      ACTION wrapper 생성.
      기존 highlight span은 안쪽에 그대로 유지됨.
    */

    const action =
      document.createElement(
        "span"
      );


    action.className =
      "post-action";


    action.style.color =
      settings.actionColor ||
      "#888888";


    action.style.fontWeight =
      settings.actionWeight ||
      "400";


    const first =
      nodes[0];


    first.parentNode.insertBefore(
      action,
      first
    );


    nodes.forEach(
      node => {

        action.appendChild(
          node
        );

      }
    );

  }


  /*
    root 안의 한 줄을 <br> 기준으로 모음.
  */

  let lineNodes =
    [];


  Array.from(
    container.childNodes
  ).forEach(
    node => {

      if (
        node.nodeType ===
          Node.ELEMENT_NODE
        &&
        node.tagName ===
          "BR"
      ) {

        wrapActionNodes(
          lineNodes
        );


        lineNodes =
          [];


        return;

      }


      /*
        div / p는 그 자체를 한 문단으로 검사.
      */

      if (
        node.nodeType ===
          Node.ELEMENT_NODE
        &&
        (
          node.tagName === "DIV" ||
          node.tagName === "P"
        )
      ) {

        wrapActionNodes(
          [node]
        );


        return;

      }


      lineNodes.push(
        node
      );

    }
  );


  /*
    마지막 줄
  */

  wrapActionNodes(
    lineNodes
  );



  /*
    =========================================
    2. 기존 ACTION / DIALOGUE 처리

    이미 .post-action 안에 들어간 텍스트는
    다시 정규식 처리하지 않음.
    =========================================
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

    const node =
      walker.currentNode;


    const parent =
      node.parentElement;


    /*
      중요:
      immediate parent만 보지 않고
      위쪽 조상까지 확인.
      highlight span 안에 있어도
      post-action 내부라면 건너뜀.
    */

    if (
      parent?.closest(
        ".post-action, .post-dialogue"
      )
    ) {

      continue;

    }


    textNodes.push(
      node
    );

  }


  textNodes.forEach(
    node => {

      replaceActionDialogueTextNode(
        node,
        settings
      );

    }
  );

}


