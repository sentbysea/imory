/* =========================================================
   POSTS - STYLE: ACTION / DIALOGUE

   posts-style.js 분할본. postStyleSettings 등은
   posts/editor/posts-refs.js에 있음(반드시 먼저
   로드돼야 함).

   내용: 액션/대사 표기(*이런 식*, "이런 식")를 실제
   스타일로 바꿔주는 파서 및 스타일 적용.

   이 파일은 preview(posts-preview-paginate.js)와 실제
   viewer(posts-view-detail.js)가 공통으로 쓰는
   renderStyledPostContentInto(posts-style-render.js)에서
   호출된다 — 여기서 만든 파싱 결과가 그대로 양쪽에 반영됨.
========================================================== */


/* =========================================================
   POINT COLOR 상속

   텍스트 노드(또는 opaque 취급하는 요소)가 이미 point color
   (post-inline-color) span 안에 있으면 그 색을 돌려준다 —
   액션/대사 처리가 새 span을 끼워 넣으면서 자기 색을
   하드코딩해버리면, 안쪽 텍스트 노드 기준으로는 그 새 span이
   더 가까운 조상이 되어 point color가 가려진다(같은 color
   속성이라도 자기 자신에 직접 지정된 값이 상속보다 우선하기
   때문). weight/자간은 그대로 preset 값을 쓰고 색만 point
   color로 덮어써서 이 문제를 피한다.
========================================================== */

function getPointColorForNode(
  node
) {

  const element =
    node.nodeType ===
    Node.TEXT_NODE
      ? node.parentElement
      : node;


  const pointColorEl =
    element
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


/* =========================================================
   BOLD/ITALIC 상속

   액션/대사 span은 항상 자기 font-weight/font-style을
   인라인으로 하드코딩해왔는데, 그 값이 조상 <strong>/<em>
   (사용자가 직접 건 볼드/이탤릭)보다 자기 자신에 더 가깝게
   붙어있어서(같은 속성이라도 상속보다 자기 자신에 직접 지정된
   값이 항상 이긴다) 안쪽 텍스트의 볼드/이탤릭을 통째로
   덮어써버렸다 — 밑줄(<u>)은 이 span들이 text-decoration을
   전혀 건드리지 않아서 안 가려지고 그대로 보였던 것과 대비됨.
   조상에 <strong>/<b>(또는 <em>/<i>)가 있으면 그 방향의
   인라인 스타일 지정 자체를 생략해서 자연스럽게 상속되게 한다.
========================================================== */

function hasAncestorTag(
  node,
  container,
  tagNames
) {

  let element =
    node?.nodeType ===
    Node.ELEMENT_NODE
      ? node
      : node?.parentElement;


  while (
    element &&
    element !== container
  ) {

    if (
      tagNames.includes(
        element.tagName
      )
    ) {

      return true;

    }


    element =
      element.parentElement;

  }


  return false;

}


/* =========================================================
   1. DIALOGUE ("...", "...")

   한 텍스트 노드 안에서만 판단(줄바꿈을 넘어가지 않음).
   ACTION(*...*) 범위 판단과는 독립적으로 먼저 처리하고,
   이렇게 만들어진 .post-dialogue span은 ACTION 범위 계산
   때 통째로(opaque) 다뤄서 안쪽 대사 서식이 그대로 유지된다.
========================================================== */

function replaceDialogueTextNode(
  textNode,
  settings = {},
  container
) {

  const text =
    textNode.nodeValue ||
    "";


  const pattern =
    /("[^"\n]+"|“[^”\n]+”)/g;


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
    getPointColorForNode(
      textNode
    );


  const isBold =
    hasAncestorTag(
      textNode,
      container,
      ["STRONG", "B"]
    );


  const isItalic =
    hasAncestorTag(
      textNode,
      container,
      ["EM", "I"]
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


    span.className =
      "post-dialogue";


    span.textContent =
      value;


    span.style.color =
      pointColor ||
      settings.dialogueColor ||
      settings.bodyColor ||
      "#555555";


    if (!isBold) {

      span.style.fontWeight =
        settings.dialogueWeight ||
        settings.bodyWeight ||
        "400";

    }


    if (!isItalic) {

      span.style.fontStyle =
        settings.dialogueItalic
          ? "italic"
          : "normal";

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


/* =========================================================
   2. ACTION (*...*)

   문단/빈 줄/PAGE BREAK를 모두 지나서 이어질 수 있으므로,
   컨테이너 전체를 하나의 문서로 보고 열린/닫힌 * 상태를
   순서대로 추적한다(문단 단위 파싱 아님).
========================================================== */

/*
  본문을 순서대로 훑으면서 "원자(atom)" 목록을 만든다.

  - text: 실제 서식 판단 대상(별표를 찾음)
  - br: 줄바꿈. 상태를 바꾸지 않고 그대로 통과.
  - opaque: PAGE BREAK 마커, 이미 만들어진 .post-dialogue span.
    내부 텍스트는 건드리지 않고, 현재 상태가 "열림"이면
    통째로 ACTION으로 감싼다.

  post-inline-font/highlight/color, b/strong/i/em/u 같은
  나머지 인라인 요소는 opaque로 보지 않고 재귀적으로
  들어가서 그 안의 텍스트 노드까지 개별적으로 처리한다 —
  그래야 강조/하이라이트 안에 걸친 *...*도 그 서식은 유지한
  채로 ACTION 색이 입혀진다.
*/

function isOpaqueActionAtom(
  node
) {

  if (
    node.nodeType !==
    Node.ELEMENT_NODE
  ) {

    return false;

  }


  /*
    ★ 복사 상자 · 메모는 통째로 불투명하다 (요구사항 8).

    안에 든 별표(*)가 지문 범위를 열거나 닫는 데 관여하면,
    코드 한 줄에 우연히 들어 있던 기호 때문에 그 뒤 본문 전체가
    지문 색으로 바뀐다. 상자 안은 파싱하지 않고 넘어간다.
  */

  if (
    typeof isPostBlockNode === "function" &&
    isPostBlockNode(
      node
    )
  ) {

    return true;

  }


  return (
    node.classList.contains(
      "post-editor-page-break"
    )
    ||
    node.classList.contains(
      "post-dialogue"
    )
  );

}


function collectActionAtoms(
  container
) {

  const atoms =
    [];


  function walk(
    node
  ) {

    if (
      node.nodeType ===
      Node.TEXT_NODE
    ) {

      atoms.push(
        {
          type: "text",
          node
        }
      );

      return;

    }


    if (
      node.nodeType !==
      Node.ELEMENT_NODE
    ) {

      return;

    }


    if (
      node.tagName ===
      "BR"
    ) {

      atoms.push(
        {
          type: "br",
          node
        }
      );

      return;

    }


    if (
      isOpaqueActionAtom(
        node
      )
    ) {

      atoms.push(
        {
          type: "opaque",
          node
        }
      );

      return;

    }


    Array.from(
      node.childNodes
    ).forEach(
      walk
    );

  }


  Array.from(
    container.childNodes
  ).forEach(
    walk
  );


  return atoms;

}


function countStarsInAtoms(
  atoms
) {

  let total =
    0;


  atoms.forEach(
    atom => {

      if (
        atom.type !==
        "text"
      ) {

        return;

      }


      const text =
        atom.node.nodeValue ||
        "";


      for (
        let index = 0;
        index < text.length;
        index += 1
      ) {

        if (
          text[index] ===
          "*"
        ) {

          total += 1;

        }

      }

    }
  );


  return total;

}


/*
  텍스트 하나를 *로 나눠서 [{text, active}] 목록으로 만든다.
  state.open은 atom을 넘나들며 계속 이어지는 전역 상태.

  전체 문서에서 *의 총 개수가 홀수면 마지막 *는 짝이 없는
  것이므로(닫는 *가 없음) 서식 구분자로 쓰지 않고 일반 문자로
  그대로 남긴다 — 그 뒤 내용을 임의로 다 ACTION 처리하거나
  다른 별표까지 지우지 않기 위함.
*/

function scanTextForActionSegments(
  text,
  state
) {

  const segments =
    [];

  let buffer =
    "";

  let bufferActive =
    state.open;


  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {

    const ch =
      text[index];


    if (
      ch !== "*"
    ) {

      buffer +=
        ch;

      continue;

    }


    state.starIndex +=
      1;


    const isUnmatchedTrailingStar =
      state.totalStars % 2 === 1
      &&
      state.starIndex ===
        state.totalStars;


    if (
      isUnmatchedTrailingStar
    ) {

      buffer +=
        ch;

      continue;

    }


    segments.push(
      {
        text: buffer,
        active: bufferActive
      }
    );


    buffer =
      "";


    state.open =
      !state.open;


    bufferActive =
      state.open;

  }


  segments.push(
    {
      text: buffer,
      active: bufferActive
    }
  );


  return segments;

}


function makeActionSpan(
  text,
  settings,
  pointColor,
  isBold,
  isItalic
) {

  const span =
    document.createElement(
      "span"
    );


  span.className =
    "post-action";


  span.style.color =
    pointColor ||
    settings.actionColor ||
    "#888888";


  if (!isBold) {

    span.style.fontWeight =
      settings.actionWeight ||
      "400";

  }


  if (!isItalic) {

    span.style.fontStyle =
      settings.actionItalic
        ? "italic"
        : "normal";

  }


  span.textContent =
    text;


  return span;

}


function wrapOpaqueNodeAsAction(
  node,
  settings,
  isBold,
  isItalic
) {

  const span =
    document.createElement(
      "span"
    );


  span.className =
    "post-action";


  span.style.color =
    settings.actionColor ||
    "#888888";


  if (!isBold) {

    span.style.fontWeight =
      settings.actionWeight ||
      "400";

  }


  if (!isItalic) {

    span.style.fontStyle =
      settings.actionItalic
        ? "italic"
        : "normal";

  }


  node.replaceWith(
    span
  );


  span.appendChild(
    node
  );

}


function applyActionRangesAcrossDocument(
  container,
  settings
) {

  const atoms =
    collectActionAtoms(
      container
    );


  const totalStars =
    countStarsInAtoms(
      atoms
    );


  const state =
    {
      open: false,
      starIndex: 0,
      totalStars
    };


  atoms.forEach(
    atom => {

      if (
        atom.type ===
        "br"
      ) {

        return;

      }


      if (
        atom.type ===
        "opaque"
      ) {

        if (
          state.open
        ) {

          wrapOpaqueNodeAsAction(
            atom.node,
            settings,
            hasAncestorTag(
              atom.node,
              container,
              ["STRONG", "B"]
            ),
            hasAncestorTag(
              atom.node,
              container,
              ["EM", "I"]
            )
          );

        }

        return;

      }


      const textNode =
        atom.node;

      const text =
        textNode.nodeValue ||
        "";


      const isBold =
        hasAncestorTag(
          textNode,
          container,
          ["STRONG", "B"]
        );


      const isItalic =
        hasAncestorTag(
          textNode,
          container,
          ["EM", "I"]
        );


      if (
        !text.includes(
          "*"
        )
      ) {

        if (
          state.open
        ) {

          const span =
            makeActionSpan(
              text,
              settings,
              getPointColorForNode(
                textNode
              ),
              isBold,
              isItalic
            );


          textNode.replaceWith(
            span
          );

        }

        return;

      }


      const pointColor =
        getPointColorForNode(
          textNode
        );


      const segments =
        scanTextForActionSegments(
          text,
          state
        );


      const changed =
        segments.length > 1
        ||
        segments[0].active;


      if (!changed) {
        return;
      }


      const fragment =
        document.createDocumentFragment();


      segments.forEach(
        segment => {

          if (
            !segment.text
          ) {

            return;

          }


          if (
            segment.active
          ) {

            fragment.appendChild(
              makeActionSpan(
                segment.text,
                settings,
                pointColor,
                isBold,
                isItalic
              )
            );

          }

          else {

            fragment.appendChild(
              document.createTextNode(
                segment.text
              )
            );

          }

        }
      );


      textNode.replaceWith(
        fragment
      );

    }
  );

}


/* =========================================================
   진입점
========================================================== */

function applyActionDialogueStyles(
  container,
  settings = {}
) {

  if (!container) {
    return;
  }


  /*
    1. 대사("...") 먼저 처리 — 줄 단위, ACTION 범위와 무관.
  */

  const dialogueWalker =
    document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT
    );


  const dialogueTextNodes =
    [];


  while (
    dialogueWalker.nextNode()
  ) {

    /*
      ★ 복사 상자 · 메모 안의 글자는 대사로 보지 않는다
      (요구사항 8). 코드나 메모에 들어 있는 따옴표가 대사 색으로
      칠해지면, 복사되는 글자와 화면이 어긋나 보인다.
    */

    if (
      typeof postNodeIsInsidePostBlock === "function" &&
      postNodeIsInsidePostBlock(
        dialogueWalker.currentNode
      )
    ) {

      continue;

    }


    dialogueTextNodes.push(
      dialogueWalker.currentNode
    );

  }


  dialogueTextNodes.forEach(
    node => {

      replaceDialogueTextNode(
        node,
        settings,
        container
      );

    }
  );


  /*
    2. 액션(*...*) — 본문 전체를 한 문서로 보고 처리.
  */

  applyActionRangesAcrossDocument(
    container,
    settings
  );

}
