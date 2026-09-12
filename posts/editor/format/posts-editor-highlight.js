/* =========================================================
   POSTS - RICH EDITOR: HIGHLIGHT / POINT COLOR / 강조선 /
   툴바 상태 / CONTENT

   posts-editor.js 분할본 중 마지막. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음, selectWrappedContent/
   closestRichStyle 등은 posts-editor.js에 있음(둘 다
   이 파일보다 먼저 로드돼야 함).

   ★ 이번 라운드에 바뀐 것

     1. 형광펜/강조색이 **겹쳐 쌓이지 않는다**(요구사항 2).

        예전에는 "선택 전체가 이미 하나의 span 안"일 때만 색을
        바꾸고, 그 밖에는 무조건 새 span으로 감쌌다. 그래서
        칠해진 구간의 일부만 다시 칠하면 span 안에 span이 생겨
        두 배경이 겹쳐 보였다.

        지금은 선택 범위를 **꺼냈다가**(extractContents) 그 안의
        같은 종류 span을 전부 벗기고 새 span 하나로 감싼 뒤 다시
        넣는다. 부분 선택이면 브라우저가 알아서 원래 span을
        쪼개 주므로 선택하지 않은 양옆은 예전 색 그대로 남는다.
        넣은 자리가 또 다른 span 안이면
        flattenNestedPostHighlights가 그 바깥을 쪼갠다.

        b/i/u · 글자색 · 글꼴은 건드리지 않는다.

     2. 컬러피커가 **드래그하는 내내 열려 있고**, 그동안의 색
        변화는 undo에 쌓이지 않는다(요구사항 1). 확정 한 번이
        undo 한 칸이다 — applyEditorInlineColor의 live 인자.

     3. 강조선(문단 왼쪽 세로선)을 걸고 푸는 자리가 생겼다
        (요구사항 5). 저장되는 것은 문단 맨 앞의 마커 하나뿐이고
        실제 선은 렌더링 단계에서 그린다
        (posts/style/posts-body-decor.js).
========================================================== */


/* =========================================================
   공용 — 선택 범위에 인라인 색 서식 입히기
========================================================== */

/*
  ★ live 모드

    컬러피커를 드래그하는 동안에는 undo 스냅샷을 찍지 않는다.
    처음 한 번만 호출부(posts-highlight-toolbar.js)가 찍어두고,
    취소하면 그 스냅샷으로 되돌린다.
*/

function applyEditorInlineColor(
  options
) {

  const {
    className,
    dataKey,
    styleProperty,
    color,
    live
  } =
    options;


  const range =
    getEditorRange();


  if (!range) {
    return false;
  }


  if (!live) {

    pushEditorUndoSnapshot(
      true
    );

  }


  /*
    선택 범위를 통째로 꺼낸다. 부분적으로 걸친 span은 여기서
    자동으로 쪼개지고, 꺼낸 조각 안에는 그 span의 복제본이
    들어온다.
  */

  const fragment =
    range.extractContents();


  /*
    꺼낸 조각 안의 같은 종류 span을 전부 벗긴다 — 선택 범위
    안에서는 새 색 하나만 남는다.
  */

  Array.from(
    fragment.querySelectorAll(
      `.${className}`
    )
  )
    .reverse()
    .forEach(
      node => {

        const parent =
          node.parentNode;


        if (!parent) {
          return;
        }


        while (
          node.firstChild
        ) {

          parent.insertBefore(
            node.firstChild,
            node
          );

        }


        node.remove();

      }
    );


  const wrapper =
    document.createElement(
      "span"
    );


  wrapper.className =
    className;


  wrapper.dataset[dataKey] =
    color;


  wrapper.style[styleProperty] =
    color;


  wrapper.appendChild(
    fragment
  );


  range.insertNode(
    wrapper
  );


  /*
    넣은 자리가 같은 종류 span 안이었으면(선택이 기존 구간의
    가운데였던 경우) 바깥을 쪼개서 겹침을 없앤다. 안쪽 = 방금
    고른 색이 이긴다.
  */

  if (
    className === "post-inline-highlight" &&
    typeof flattenNestedPostHighlights === "function"
  ) {

    flattenNestedPostHighlights(
      postEditorContent
    );

  }

  else {

    unnestEditorInlineSpans(
      className
    );

  }


  if (
    typeof removeEmptyPostHighlights === "function"
  ) {

    removeEmptyPostHighlights(
      postEditorContent
    );

  }


  /*
    형광펜은 프리셋이 정한 높이로 칠한다 — 편집창에서도 발췌와
    같은 모양으로 보여야 한다.
  */

  if (
    className === "post-inline-highlight" &&
    typeof applyPostHighlightHeight === "function"
  ) {

    applyPostHighlightHeight(
      postEditorContent,
      postStyleSettings ||
      {}
    );

  }


  selectWrappedContent(
    wrapper
  );


  updateEditorPreview();

  updateEditorToolbarState();


  /*
    ★ 컬러피커(특히 pointerdown 즉시 적용) 이후에는
    selectionchange가 늦게 뜰 수 있어서, 방금 적용한 위치를
    기준으로 직접 한 번 더 계산해 둔다 — 안 그러면 메뉴가 예전
    선택 위치에 멀리 남아있는 것처럼 보일 수 있다.
  */

  if (
    typeof syncEditorFloatingMenu ===
      "function"
  ) {

    syncEditorFloatingMenu();

  }


  return true;

}


/*
  같은 종류 span의 중첩 풀기(강조색용). 형광펜은 배경이 겹쳐
  보이므로 바깥을 쪼개야 하지만(flattenNestedPostHighlights),
  글자색은 안쪽이 이기므로 **바깥 껍데기만** 남기고 안쪽을
  그대로 두면 충분하다 — 다만 span이 계속 늘어나지 않게
  안쪽이 바깥을 완전히 덮는 경우는 바깥을 벗긴다.
*/

function unnestEditorInlineSpans(
  className
) {

  if (!postEditorContent) {
    return;
  }


  let guard =
    0;


  while (
    guard < 200
  ) {

    guard += 1;


    const nested =
      postEditorContent.querySelector(
        `.${className} .${className}`
      );


    if (!nested) {
      break;
    }


    const outer =
      nested.parentElement
        ?.closest(
          `.${className}`
        );


    if (!outer) {
      break;
    }


    if (
      outer.textContent ===
      nested.textContent
    ) {

      unwrapElement(
        outer
      );


      continue;

    }


    /*
      부분적으로만 겹친다 — 바깥을 안쪽 기준으로 쪼갠다.
      형광펜과 같은 규칙을 쓴다.
    */

    if (
      typeof splitPostHighlightAround === "function"
    ) {

      splitPostHighlightAround(
        outer,
        nested
      );

    }

    else {

      break;

    }

  }

}


/*
  선택 범위에서 한 종류의 인라인 서식만 걷어낸다(전체 서식
  지우기 clearEditorStyle와 달리 b/i/u·다른 색은 남는다).
*/

function removeEditorInlineColor(
  className,
  live
) {

  const range =
    getEditorRange();


  if (!range) {
    return false;
  }


  if (!live) {

    pushEditorUndoSnapshot(
      true
    );

  }


  const fragment =
    range.extractContents();


  Array.from(
    fragment.querySelectorAll(
      `.${className}`
    )
  )
    .reverse()
    .forEach(
      node => {

        const parent =
          node.parentNode;


        if (!parent) {
          return;
        }


        while (
          node.firstChild
        ) {

          parent.insertBefore(
            node.firstChild,
            node
          );

        }


        node.remove();

      }
    );


  /*
    꺼낸 조각을 임시 껍데기에 담아 넣고, 그 껍데기가 기존 span
    **안**이면 바깥을 쪼갠 뒤 껍데기를 벗긴다 — 그래야 가운데
    구간만 색이 빠지고 양옆은 남는다.
  */

  const shell =
    document.createElement(
      "span"
    );


  shell.className =
    "post-inline-unwrap-shell";


  shell.appendChild(
    fragment
  );


  range.insertNode(
    shell
  );


  const outer =
    shell.parentElement
      ?.closest(
        `.${className}`
      );


  if (
    outer &&
    typeof splitPostHighlightAround === "function"
  ) {

    splitPostHighlightAround(
      outer,
      shell
    );

  }


  unwrapElement(
    shell
  );


  /*
    선택이 기존 span의 맨 앞/맨 끝에 닿아 있었으면 글자 없는
    껍데기가 남을 수 있다 — 여기서 걷어낸다.
  */

  if (
    typeof removeEmptyPostHighlights === "function"
  ) {

    removeEmptyPostHighlights(
      postEditorContent
    );

  }


  savedEditorRange =
    null;


  postEditorContent.focus();


  updateEditorPreview();

  updateEditorToolbarState();


  if (
    typeof syncEditorFloatingMenu ===
      "function"
  ) {

    syncEditorFloatingMenu();

  }


  return true;

}



/* =========================================================
   HIGHLIGHT
========================================================== */

function applyEditorHighlight(
  color,
  live
) {

  return applyEditorInlineColor(
    {
      className: "post-inline-highlight",
      dataKey: "highlight",
      styleProperty: "backgroundColor",
      color:
        getSafeHighlightColor(
          color
        ),
      live
    }
  );

}


function removeEditorHighlight() {

  return removeEditorInlineColor(
    "post-inline-highlight",
    false
  );

}



/* =========================================================
   POINT COLOR
   (HIGHLIGHT과 동일한 구조 — 배경색 대신 글자색)
========================================================== */

function applyEditorPointColor(
  color,
  live
) {

  return applyEditorInlineColor(
    {
      className: "post-inline-color",
      dataKey: "pointColor",
      styleProperty: "color",
      color:
        getSafePointColor(
          color
        ),
      live
    }
  );

}


function removeEditorPointColor() {

  return removeEditorInlineColor(
    "post-inline-color",
    false
  );

}



/* =========================================================
   강조선 (문단 왼쪽 세로선)

   기준 문서: posts/style/posts-body-decor.js §3

   ★ 문단이란

     이 에디터는 Enter를 눌러도 <div>/<p>를 만들지 않는다. 문단
     경계는 본문 흐름 최상위의 **연속된 <br> 두 개**와 수동 PAGE
     break다. 렌더링 단계에서 그 <br><br>이 간격 블록 하나로
     바뀌므로(applyPostParagraphSpacing), 편집창과 발췌가 같은
     자리에서 문단을 끊는다.

   ★ 문단 일부만 선택해도 문단 전체에 걸린다 — 선택 범위가
     걸치는 문단을 전부 찾아 각 문단 맨 앞에 마커를 둔다.
========================================================== */

function collectEditorParagraphRuns() {

  if (!postEditorContent) {

    return [];

  }


  const runs =
    [];


  let run =
    [];


  const children =
    Array.from(
      postEditorContent.childNodes
    );


  let index =
    0;


  while (
    index < children.length
  ) {

    const node =
      children[index];


    if (
      isPostPageBreakNode(
        node
      )
    ) {

      if (run.length) {

        runs.push(run);

      }


      run =
        [];


      index += 1;


      continue;

    }


    if (
      node.nodeName !== "BR"
    ) {

      run.push(
        node
      );


      index += 1;


      continue;

    }


    /* 연속된 <br>의 길이를 센다 */

    let end =
      index;


    while (
      end + 1 < children.length &&
      children[end + 1].nodeName === "BR"
    ) {

      end += 1;

    }


    if (
      end - index + 1 >= 2
    ) {

      /* 문단 경계 */

      if (run.length) {

        runs.push(run);

      }


      run =
        [];

    }

    else {

      /* 그냥 줄바꿈 — 같은 문단 안이다 */

      run.push(
        node
      );

    }


    index =
      end + 1;

  }


  if (run.length) {

    runs.push(run);

  }


  return runs;

}


function editorParagraphRunsInSelection() {

  const runs =
    collectEditorParagraphRuns();


  if (!runs.length) {

    return [];

  }


  restoreEditorSelection();


  const selection =
    window.getSelection();


  if (
    !selection ||
    selection.rangeCount === 0
  ) {

    return [];

  }


  const range =
    selection.getRangeAt(0);


  if (
    !nodeIsInsideEditor(
      range.commonAncestorContainer
    )
  ) {

    return [];

  }


  const hit =
    runs.filter(
      run =>
        run.some(
          node => {

            try {

              return range.intersectsNode(
                node
              );

            }

            catch (error) {

              return false;

            }

          }
        )
    );


  /*
    캐럿만 있고(선택 없음) 어떤 문단에도 안 걸리는 경우가
    있다 — 그럴 때는 캐럿이 들어 있는 문단을 찾는다.
  */

  if (hit.length) {

    return hit;

  }


  const container =
    range.startContainer;


  return runs.filter(
    run =>
      run.some(
        node =>
          node === container ||
          (
            node.nodeType === Node.ELEMENT_NODE &&
            node.contains(container)
          )
      )
  );

}


function findEditorRuleMark(
  run
) {

  for (
    const node of run
  ) {

    if (
      isPostRuleMarkNode(
        node
      )
    ) {

      return node;

    }


    if (
      node.nodeType ===
      Node.ELEMENT_NODE
    ) {

      const nested =
        node.querySelector(
          ".post-para-rule"
        );


      if (nested) {

        return nested;

      }

    }

  }


  return null;

}


function editorRunIsDialogue(
  run
) {

  return POST_RULE_DIALOGUE_PATTERN.test(
    run
      .map(
        node =>
          node.textContent ||
          ""
      )
      .join("")
  );

}


function editorRunHasActiveRule(
  run
) {

  const mark =
    findEditorRuleMark(
      run
    );


  if (mark) {

    return mark.dataset.rule !==
      "off";

  }


  return (
    Boolean(
      postStyleSettings
        ?.dialogueRuleEnabled
    ) &&
    editorRunIsDialogue(
      run
    )
  );

}


/*
  선택된 문단들에 강조선을 건다.

    color  null이면 프리셋 BODY 기본색을 따른다(개별 지정 없음).
    live   컬러피커 드래그 중 — undo 스냅샷을 찍지 않는다.
*/

function applyEditorParagraphRule(
  color,
  live
) {

  const runs =
    editorParagraphRunsInSelection();


  if (!runs.length) {

    showPostEditorMessage(
      "강조선을 넣을 문단에 커서를 두세요."
    );


    return false;

  }


  if (!live) {

    pushEditorUndoSnapshot(
      true
    );

  }


  runs.forEach(
    run => {

      const existing =
        findEditorRuleMark(
          run
        );


      if (existing) {

        existing.dataset.rule =
          "on";


        if (color) {

          existing.dataset.ruleColor =
            color;

        }

        else {

          delete existing.dataset.ruleColor;

        }


        return;

      }


      postEditorContent.insertBefore(
        createPostRuleMark(
          "on",
          color
        ),
        run[0]
      );

    }
  );


  syncEditorRuleOverlay();


  updateEditorPreview();

  updateEditorToolbarState();


  return true;

}


function removeEditorParagraphRule(
  live
) {

  const runs =
    editorParagraphRunsInSelection();


  if (!runs.length) {

    return false;

  }


  if (!live) {

    pushEditorUndoSnapshot(
      true
    );

  }


  runs.forEach(
    run => {

      const existing =
        findEditorRuleMark(
          run
        );


      /*
        ★ 대사 문단은 "해제했음"을 남겨야 한다.

        마커를 그냥 지우면 상속 상태로 돌아가서, 대사 자동
        강조선이 켜져 있는 한 다음 렌더에서 선이 다시 생긴다
        (요구사항 5). 대사가 아닌 문단은 되살아날 자리가
        없으므로 마커째 지운다.
      */

      if (
        editorRunIsDialogue(
          run
        )
      ) {

        if (existing) {

          existing.dataset.rule =
            "off";


          delete existing.dataset.ruleColor;

        }

        else {

          postEditorContent.insertBefore(
            createPostRuleMark(
              "off",
              null
            ),
            run[0]
          );

        }


        return;

      }


      existing?.remove();

    }
  );


  syncEditorRuleOverlay();


  updateEditorPreview();

  updateEditorToolbarState();


  return true;

}


function toggleEditorParagraphRule() {

  const runs =
    editorParagraphRunsInSelection();


  if (!runs.length) {

    showPostEditorMessage(
      "강조선을 넣을 문단에 커서를 두세요."
    );


    return;

  }


  const allActive =
    runs.every(
      editorRunHasActiveRule
    );


  if (allActive) {

    removeEditorParagraphRule(
      false
    );

  }

  else {

    applyEditorParagraphRule(
      null,
      false
    );

  }

}


/*
  지금 선택에 걸린 문단의 강조선 색(개별 지정이 있으면 그 색,
  없으면 프리셋 기본값). 컬러피커의 시작 색으로 쓴다.
*/

function currentEditorParagraphRuleColor() {

  const runs =
    editorParagraphRunsInSelection();


  for (
    const run of runs
  ) {

    const mark =
      findEditorRuleMark(
        run
      );


    if (
      mark?.dataset?.ruleColor
    ) {

      return mark.dataset.ruleColor;

    }

  }


  return getPresetRuleColor();

}



/* =========================================================
   CLEAR STYLE
========================================================== */

function stripRichStylesFromFragment(
  fragment
) {

  const wrappers =
    Array.from(
      fragment.querySelectorAll(
        ".post-inline-font, .post-inline-highlight, .post-inline-color, b, strong, i, em, u"
      )
    );


  wrappers.reverse();


  wrappers.forEach(
    wrapper => {

      unwrapElement(
        wrapper
      );

    }
  );


  return fragment;

}


function clearEditorStyle() {

  const range =
    getEditorRange();


  if (!range) {
    return;
  }


  pushEditorUndoSnapshot(
    true
  );


  /*
    선택영역 안쪽 스타일 제거
  */

  const fragment =
    range.extractContents();


  stripRichStylesFromFragment(
    fragment
  );


  const marker =
    document.createElement(
      "span"
    );


  marker.appendChild(
    fragment
  );


  range.insertNode(
    marker
  );


  /*
    선택영역 바깥을 감싸고 있던
    font/highlight도 선택 전체에 해당하면 제거.
  */

  const parentFont =
    closestRichStyle(
      marker,
      "post-inline-font"
    );


  const parentHighlight =
    closestRichStyle(
      marker,
      "post-inline-highlight"
    );


  const parentPointColor =
    closestRichStyle(
      marker,
      "post-inline-color"
    );


  if (parentFont) {

    unwrapElement(
      parentFont
    );

  }


  if (parentHighlight) {

    unwrapElement(
      parentHighlight
    );

  }


  if (parentPointColor) {

    unwrapElement(
      parentPointColor
    );

  }


  /*
    임시 marker 제거
  */

  const markerParent =
    marker.parentNode;


  const selectionRange =
    document.createRange();


  selectionRange.selectNodeContents(
    marker
  );


  while (
    marker.firstChild
  ) {

    markerParent.insertBefore(
      marker.firstChild,
      marker
    );

  }


  marker.remove();


  markerParent.normalize();


  savedEditorRange =
    null;


  postEditorContent.focus();


  updateEditorPreview();

  updateEditorToolbarState();


  if (
    typeof syncEditorFloatingMenu ===
      "function"
  ) {

    syncEditorFloatingMenu();

  }

}



/* =========================================================
   TOOLBAR STATE
========================================================== */

function updateEditorToolbarState() {

  if (!postEditorContent) {
    return;
  }


  let fontActive =
    false;


  if (savedEditorRange) {

    const start =
      savedEditorRange
        .startContainer;


    const font =
      closestRichStyle(
        start,
        "post-inline-font"
      );


    fontActive =
      Boolean(
        font
      );

  }


  if (
    postEditorFontToggle
  ) {

    postEditorFontToggle
      .classList
      .toggle(
        "active",
        fontActive
      );


    postEditorFontToggle
      .setAttribute(
        "aria-pressed",
        fontActive
          ? "true"
          : "false"
      );

  }


  const toggleStates =
    [
      [
        postEditorBoldToggle,
        [
          "STRONG",
          "B"
        ]
      ],
      [
        postEditorItalicToggle,
        [
          "EM",
          "I"
        ]
      ],
      [
        postEditorUnderlineToggle,
        [
          "U"
        ]
      ]
    ];


  toggleStates.forEach(
    ([
      button,
      tagNames
    ]) => {

      if (!button) {
        return;
      }


      const active =
        Boolean(
          savedEditorRange &&
          closestRichTag(
            savedEditorRange.startContainer,
            tagNames
          )
        );


      button.classList.toggle(
        "active",
        active
      );


      button.setAttribute(
        "aria-pressed",
        active
          ? "true"
          : "false"
      );

    }
  );


  syncEditorRuleToggleState();

}


function syncEditorRuleToggleState() {

  if (!postEditorRuleToggle) {
    return;
  }


  const runs =
    savedEditorRange
      ? editorParagraphRunsInSelection()
      : [];


  const active =
    runs.length > 0 &&
    runs.every(
      editorRunHasActiveRule
    );


  postEditorRuleToggle
    .classList
    .toggle(
      "active",
      active
    );


  postEditorRuleToggle
    .setAttribute(
      "aria-pressed",
      active
        ? "true"
        : "false"
    );

}



/* =========================================================
   EDITOR CONTENT
========================================================== */

function clearRichEditor() {

  if (!postEditorContent) {
    return;
  }


  postEditorContent.replaceChildren();


  savedEditorRange =
    null;


  resetEditorUndoHistory();


  syncEditorRuleOverlay();

}


function setRichEditorContent(
  content
) {

  if (!postEditorContent) {
    return;
  }


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


  postEditorContent.replaceChildren();


  while (
    temp.firstChild
  ) {

    postEditorContent.appendChild(
      temp.firstChild
    );

  }


  savedEditorRange =
    null;


  /*
    ★ 예전 글에 중첩된 형광펜이 남아 있을 수 있다 — 여는
    순간 한 번 편다(저장된 데이터를 일괄로 고치는 것이 아니라,
    이 글을 실제로 편집·저장할 때만 정리된다).
  */

  if (
    typeof flattenNestedPostHighlights === "function"
  ) {

    flattenNestedPostHighlights(
      postEditorContent
    );

  }


  syncEditorHighlightHeight();


  syncEditorRuleOverlay();

}


/*
  편집창의 형광펜도 프리셋이 정한 높이로 보여준다. 프리셋을
  바꿔 끼우거나 글을 새로 열 때 호출한다.
*/

function syncEditorHighlightHeight() {

  if (
    !postEditorContent ||
    typeof applyPostHighlightHeight !== "function"
  ) {
    return;
  }


  applyPostHighlightHeight(
    postEditorContent,
    postStyleSettings ||
    {}
  );

}


function getRichEditorHTML() {

  if (!postEditorContent) {
    return "";
  }


  return sanitizeRichHTML(
    postEditorContent.innerHTML
  );

}


function getRichEditorPlainText() {

  if (!postEditorContent) {
    return "";
  }


  /*
    PAGE BREAK는 편집용 구조물이라
    실제 본문 텍스트로 세지 않음.
  */

  const clone =
    postEditorContent.cloneNode(
      true
    );


  clone
    .querySelectorAll(
      ".post-editor-page-break"
    )
    .forEach(
      marker => {

        marker.remove();

      }
    );


  return (
    clone.innerText ||
    clone.textContent ||
    ""
  );

}
