/* =========================================================
   POSTS - STYLE: 본문 장식 공용 계산 (형광펜 높이 · 강조선)

   기준 문서: IMORY_QUOTE_PRESET_RENDER_AUDIT.md

   posts-body-layout.js와 같은 성격의 파일이다 — 전부 인자로만
   동작하고 전역 상태를 읽지 않는다. Quote Preset 미리보기
   (admin) · 에디터 PREVIEW · export · 발행된 글 본문 네 화면이
   **같은 값에서 같은 모양**이 되도록 이 파일 하나를 공유한다.

   내용:
     1. 형광펜 높이(applyPostHighlightHeight)
     2. 중첩된 형광펜 정리(flattenNestedPostHighlights)
     3. 문단 강조선(applyPostParagraphRules) · 출처 강조선
        (applyPostSourceRule)

   classic script. posts/style/posts-body-layout.js가 먼저
   로드돼야 한다(normalizePostStyleSettings · 문단 간격 블록
   판정을 쓴다).
========================================================== */


/* =========================================================
   1. 형광펜 높이

   ★ 무엇을 기준으로 한 비율인가

     인라인 상자(글자가 실제로 차지하는 content area)의 높이를
     100%로 본다. 그 높이는 font-size에 비례하고 line-height와는
     무관하다 — 그래서 높이를 바꿔도 **줄 간격·줄바꿈·글자 위치가
     전혀 변하지 않는다**(배경만 다르게 칠할 뿐 박스 크기를
     건드리지 않기 때문).

   ★ 왜 background-color가 아니라 gradient인가

     background-color는 인라인 상자를 통째로 칠한다(= 항상 100%).
     "아래쪽 N%만" 칠하려면 배경 **이미지**가 필요하다. 세로
     gradient의 퍼센트는 칠할 영역(= 인라인 상자)의 높이 기준이라
     정확히 원하는 비율이 나온다.

     100%일 때는 gradient를 쓰지 않고 예전처럼 background-color만
     쓴다 — 지금 발행된 글과 **완전히 같은 픽셀**이어야 하고,
     html2canvas 경로도 예전 그대로 지나가게 하기 위해서다.

   ★ 모서리

     직각으로 통일한다(요구사항 3). border-radius는 CSS에서 0으로
     맞췄고, gradient 자체도 둥근 모서리를 만들지 않는다.

   ★ 여러 줄

     .post-inline-highlight에는 이미 box-decoration-break: clone이
     걸려 있다 — 줄마다 자기 배경 상자를 따로 그리므로 gradient도
     줄마다 다시 그려진다(줄 하나에 걸쳐 늘어나지 않는다).
========================================================== */

const POST_HIGHLIGHT_MIN_HEIGHT =
  30;

const POST_HIGHLIGHT_MAX_HEIGHT =
  100;


function resolvePostHighlightHeight(
  settings = {}
) {

  const raw =
    postStyleNumber(
      normalizePostStyleSettings(
        settings
      ).highlightHeight,
      POST_HIGHLIGHT_MAX_HEIGHT
    );


  return Math.min(
    POST_HIGHLIGHT_MAX_HEIGHT,
    Math.max(
      POST_HIGHLIGHT_MIN_HEIGHT,
      raw
    )
  );

}


/*
  span 하나에 색과 높이를 입힌다.

  ★ 색의 출처는 언제나 dataset.highlight다.

    높이를 줄이면 backgroundColor가 "transparent"가 되므로,
    다음 번에 다시 이 함수를 돌릴 때 style.backgroundColor에서
    색을 읽으면 색을 잃는다. 처음 한 번만 style에서 읽어
    dataset에 적어두고, 그 뒤로는 dataset만 믿는다.
*/

function applyPostHighlightBackground(
  span,
  heightPercent
) {

  if (!span) {
    return;
  }


  if (
    !span.dataset.highlight &&
    span.style.backgroundColor
  ) {

    span.dataset.highlight =
      span.style.backgroundColor;

  }


  const color =
    span.dataset.highlight;


  if (!color) {
    return;
  }


  if (
    heightPercent >=
    POST_HIGHLIGHT_MAX_HEIGHT
  ) {

    span.style.backgroundImage =
      "";

    span.style.backgroundRepeat =
      "";

    span.style.backgroundSize =
      "";

    span.style.backgroundPosition =
      "";

    span.style.backgroundColor =
      color;


    return;

  }


  /*
    아래에서 위로 heightPercent까지만 색, 그 위는 투명.
    background-color는 반드시 비운다 — 남아 있으면 투명한
    윗부분으로 그 색이 그대로 비쳐서 높이가 안 줄어든 것처럼
    보인다.
  */

  const stop =
    `${100 - heightPercent}%`;


  span.style.backgroundColor =
    "transparent";

  span.style.backgroundImage =
    `linear-gradient(to bottom, rgba(0,0,0,0) 0, rgba(0,0,0,0) ${stop}, ${color} ${stop}, ${color} 100%)`;

  span.style.backgroundRepeat =
    "no-repeat";

  span.style.backgroundSize =
    "100% 100%";

  span.style.backgroundPosition =
    "0 0";

}


function applyPostHighlightHeight(
  container,
  settings = {}
) {

  if (!container) {
    return;
  }


  const heightPercent =
    resolvePostHighlightHeight(
      settings
    );


  container
    .querySelectorAll(
      ".post-inline-highlight"
    )
    .forEach(
      span => {

        applyPostHighlightBackground(
          span,
          heightPercent
        );

      }
    );

}



/* =========================================================
   2. 중첩된 형광펜 정리

   ★ 왜 필요한가

     예전 applyEditorHighlight는 "선택 전체가 하나의 highlight
     안"일 때만 색을 바꾸고, 그 밖에는 무조건 새 span으로 감쌌다.
     그래서 이미 칠해진 구간의 **일부만** 다시 칠하면 highlight
     안에 highlight가 생겼다 — 두 배경이 겹쳐 보이는 원인
     (요구사항 2).

   ★ 무엇을 하는가

     highlight 안의 highlight를 없애고 **안쪽 색이 이기게** 한다.
     안쪽이 사용자가 나중에 고른 색이기 때문이다. 겹친 구간의
     양옆(바깥 span에만 속한 부분)은 바깥 색 그대로 남는다.

     b/i/u · 글자색 · 글꼴 같은 다른 서식은 건드리지 않는다 —
     구조를 바꾸는 대상은 highlight span뿐이다.

   ★ 저장된 데이터를 일괄 덮어쓰지 않는다

     이 함수는 **렌더링/편집 중인 DOM**에서만 돈다. DB의 본문
     HTML을 찾아다니며 고치는 마이그레이션은 없다. 이미 중첩된
     채로 저장된 옛 글은 열릴 때(setRichEditorContent) · 그려질
     때(renderStyledPostContentInto) 이 함수를 지나 정상으로
     보이고, 사용자가 그 글을 저장하는 순간에만 정리된 모양으로
     다시 저장된다.
========================================================== */

/*
  글자도 요소도 없는 형광펜 껍데기를 걷어낸다.

  선택 범위를 꺼냈다 넣는 과정에서 span의 맨 앞/맨 끝이 비면
  이런 껍데기가 생길 수 있다 — 화면에는 안 보이지만 남겨 두면
  다음 편집에서 엉뚱하게 자라난다.
*/

function removeEmptyPostHighlights(
  root
) {

  if (!root) {
    return;
  }


  root
    .querySelectorAll(
      ".post-inline-highlight, .post-inline-color"
    )
    .forEach(
      node => {

        if (
          !node.textContent &&
          !node.querySelector("*")
        ) {

          node.remove();

        }

      }
    );

}


function flattenNestedPostHighlights(
  root
) {

  if (!root) {
    return;
  }


  removeEmptyPostHighlights(
    root
  );


  /*
    바깥에서 안쪽 순서로 훑는다. 안쪽 span을 만나면 그 위의
    가장 가까운 highlight 조상을 찾아, **그 조상을 안쪽 구간
    기준으로 쪼갠다**.

    구현은 더 단순한 길을 쓴다: 중첩된 안쪽 span에 바깥 색이
    비치지 않게, 안쪽 span의 조상 highlight가 안쪽 구간 위에
    배경을 그리지 않도록 안쪽 span을 조상 밖으로 끌어내는 대신
    — 조상의 배경이 안쪽에서 보이지 않게 하려면 결국 쪼개야
    한다. splitHighlightAround()가 그 일을 한다.
  */

  let guard =
    0;


  while (
    guard < 200
  ) {

    guard += 1;


    const nested =
      root.querySelector(
        ".post-inline-highlight .post-inline-highlight"
      );


    if (!nested) {
      break;
    }


    const outer =
      nested.parentElement
        ?.closest(
          ".post-inline-highlight"
        );


    if (
      !outer ||
      outer === nested
    ) {

      break;

    }


    splitPostHighlightAround(
      outer,
      nested
    );

  }


  removeEmptyPostHighlights(
    root
  );

}


/*
  outer(형광펜 span)를 inner 기준으로 셋으로 나눈다.

    [outer 앞부분] [inner] [outer 뒷부분]

  앞/뒷부분은 outer와 같은 색의 새 span으로, inner는 outer
  **밖으로** 나와 자기 색을 그대로 유지한다. 비어 있는 조각은
  만들지 않는다.
*/

function splitPostHighlightAround(
  outer,
  inner
) {

  const parent =
    outer.parentNode;


  if (!parent) {
    return;
  }


  const doc =
    outer.ownerDocument ||
    document;


  const beforeRange =
    doc.createRange();


  beforeRange.setStartBefore(
    outer.firstChild ||
    outer
  );


  beforeRange.setEndBefore(
    inner
  );


  const afterRange =
    doc.createRange();


  afterRange.setStartAfter(
    inner
  );


  afterRange.setEndAfter(
    outer.lastChild ||
    outer
  );


  const beforeFragment =
    outer.firstChild
      ? beforeRange.extractContents()
      : doc.createDocumentFragment();


  const afterFragment =
    outer.firstChild
      ? afterRange.extractContents()
      : doc.createDocumentFragment();


  const makeShell =
    fragment => {

      /*
        ★ "비어 있다"의 기준은 글자와 요소다.

        빈 텍스트 노드만 들어 있는 조각(선택이 span의 맨 앞/맨
        끝에 닿았을 때 생긴다)을 childNodes.length로만 판정하면
        **글자 없는 형광펜 껍데기**가 남는다 — 화면에는 아무 것도
        안 보이지만 span 수를 세는 쪽에서는 그대로 잡힌다.
      */

      const hasElement =
        typeof fragment.querySelector === "function"
          ? Boolean(
              fragment.querySelector("*")
            )
          : false;


      if (
        !fragment.textContent &&
        !hasElement
      ) {

        return null;

      }


      const shell =
        outer.cloneNode(
          false
        );


      shell.appendChild(
        fragment
      );


      return shell;

    };


  const beforeShell =
    makeShell(
      beforeFragment
    );


  const afterShell =
    makeShell(
      afterFragment
    );


  if (beforeShell) {

    parent.insertBefore(
      beforeShell,
      outer
    );

  }


  parent.insertBefore(
    inner,
    outer
  );


  if (afterShell) {

    parent.insertBefore(
      afterShell,
      outer
    );

  }


  outer.remove();

}



/* =========================================================
   3. 강조선 (문단 왼쪽 세로선)

   기준 이미지의 분홍 세로선. 밑줄이 아니라 **문단 전체 왼쪽에
   붙는 선**이고, 여러 줄인 문단에서도 끊기지 않고 이어진다.

   ★ 저장되는 것은 "표시"뿐이다

     본문 HTML에는 문단 맨 앞의 빈 마커 span 하나만 들어간다.

       <span class="post-para-rule" data-rule="on"
             data-rule-color="#ee9fbd"></span>

     실제로 선을 그리는 상자(.post-para-rule-box)는 **그릴 때마다
     새로 만들고 저장하지 않는다**(문단 간격 블록과 같은 방식 —
     posts-body-layout.js의 applyPostParagraphSpacing 주석 참고).
     그래서 문단을 나누는 규칙이나 굵기 기본값이 나중에 바뀌어도
     이미 저장된 글이 따라온다.

   ★ 상태가 셋이다 (요구사항 5의 "기본값 상속과 개별 적용·해제
     상태를 구분")

       마커 없음        상속 — 대사 자동 강조선 옵션이 켜져 있고
                        이 문단이 대사면 자동으로 붙는다.
       data-rule="on"   개별 적용 — 대사가 아니어도 붙는다.
       data-rule="off"  개별 해제 — 대사여도 붙지 않는다. 자동
                        강조선을 지운 문단이 다음 렌더에서 다시
                        생기지 않는 이유가 이것이다.

   ★ 선은 문단마다 하나뿐이다

     문단 하나를 상자 하나로 감싸는 구조라, 수동과 자동이 겹쳐도
     상자가 둘 생길 자리가 없다.
========================================================== */

const POST_RULE_MARK_CLASS =
  "post-para-rule";

const POST_RULE_BOX_CLASS =
  "post-para-rule-box";


/*
  선과 글자 사이 거리(px)의 **기본값**.

  예전에는 옵션이 없어서 이 상수 하나가 곧 값이었다. 지금은
  BODY/DIALOGUE/SOURCE가 각각 자기 값을 갖고(bodyRuleGap 등),
  값이 없는 옛 프리셋만 이 12로 읽힌다 — 그래서 옵션이 생겨도
  이미 발행된 글의 모양은 그대로다.
*/

const POST_RULE_GAP =
  12;


const POST_RULE_MIN_GAP =
  0;

const POST_RULE_MAX_GAP =
  80;


function normalizePostRuleGap(
  value,
  fallback
) {

  const gap =
    Math.round(
      postStyleNumber(
        value,
        fallback === undefined
          ? POST_RULE_GAP
          : fallback
      )
    );


  if (
    !Number.isFinite(
      gap
    )
  ) {

    return POST_RULE_GAP;

  }


  return Math.min(
    POST_RULE_MAX_GAP,
    Math.max(
      POST_RULE_MIN_GAP,
      gap
    )
  );

}


const POST_RULE_MIN_WIDTH =
  1;

const POST_RULE_MAX_WIDTH =
  12;


/*
  대사 판별 — posts/style/posts-style-dialogue.js의
  replaceDialogueTextNode가 쓰는 바로 그 패턴이다. 판별 기준을
  두 벌 만들지 않기 위해 같은 정규식을 쓴다(요구사항 5의 "기존
  대사 판별 기준에 해당하는 문단").
*/

const POST_RULE_DIALOGUE_PATTERN =
  /("[^"\n]+"|“[^”\n]+”)/;


function isPostRuleMarkNode(
  node
) {

  return (
    node?.nodeType ===
      Node.ELEMENT_NODE &&
    node.classList
      ?.contains(
        POST_RULE_MARK_CLASS
      ) ===
      true
  );

}


function isPostRuleBoxNode(
  node
) {

  return (
    node?.nodeType ===
      Node.ELEMENT_NODE &&
    node.classList
      ?.contains(
        POST_RULE_BOX_CLASS
      ) ===
      true
  );

}


function normalizePostRuleWidth(
  value,
  fallback
) {

  const width =
    Math.round(
      postStyleNumber(
        value,
        fallback
      )
    );


  return Math.min(
    POST_RULE_MAX_WIDTH,
    Math.max(
      POST_RULE_MIN_WIDTH,
      width
    )
  );

}


function isPostRuleColor(
  value
) {

  return /^#[0-9a-fA-F]{6}$/.test(
    String(
      value ||
      ""
    )
  );

}


function createPostRuleMark(
  state,
  color
) {

  const mark =
    document.createElement(
      "span"
    );


  mark.className =
    POST_RULE_MARK_CLASS;


  mark.dataset.rule =
    state === "off"
      ? "off"
      : "on";


  if (
    isPostRuleColor(
      color
    )
  ) {

    mark.dataset.ruleColor =
      color;

  }


  return mark;

}


/*
  문단 경계 — 문단 간격 블록(연속 <br> 두 개에서 만들어짐)과
  수동 PAGE break. 이 둘은 어느 문단에도 속하지 않는다.
*/

function isPostRuleBoundaryNode(
  node
) {

  if (
    isPostParagraphGapNode(
      node
    )
  ) {

    return true;

  }


  return (
    node?.nodeType ===
      Node.ELEMENT_NODE &&
    node.classList
      ?.contains(
        "post-editor-page-break"
      ) ===
      true
  );

}


/*
  컨테이너의 최상위 자식을 문단 단위로 끊는다.

  ★ 왜 최상위만 보는가

    이 에디터는 Enter를 눌러도 <div>/<p>를 만들지 않는다. 문단
    경계는 언제나 본문 흐름의 최상위에 놓인 <br><br>(→ 간격
    블록)이다. 인라인 서식 span 안쪽에서 문단이 갈리는 경우는
    applyPostParagraphSpacing이 이미 그 자리에 간격 블록을 넣지만,
    그런 span은 통째로 한 문단 안에 있는 것으로 본다 — 서식 span을
    쪼개면서까지 선을 그리지는 않는다.
*/

function collectPostRuleParagraphs(
  container
) {

  const paragraphs =
    [];


  let run =
    [];


  Array.from(
    container.childNodes
  ).forEach(
    node => {

      if (
        isPostRuleBoundaryNode(
          node
        )
      ) {

        if (run.length) {

          paragraphs.push(
            run
          );

        }


        run =
          [];


        return;

      }


      run.push(
        node
      );

    }
  );


  if (run.length) {

    paragraphs.push(
      run
    );

  }


  return paragraphs;

}


function findPostRuleMarkInRun(
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
          `.${POST_RULE_MARK_CLASS}`
        );


      if (nested) {

        return nested;

      }

    }

  }


  return null;

}


function postRuleRunText(
  run
) {

  return run
    .map(
      node =>
        node.textContent ||
        ""
    )
    .join(
      ""
    );

}


/*
  이 문단에 그릴 선을 정한다.

  -> { color, width } | null
*/

function resolvePostRuleForRun(
  run,
  settings
) {

  const mark =
    findPostRuleMarkInRun(
      run
    );


  if (mark) {

    if (
      mark.dataset.rule ===
      "off"
    ) {

      return null;

    }


    return {

      color:
        isPostRuleColor(
          mark.dataset.ruleColor
        )
          ? mark.dataset.ruleColor
          : settings.bodyRuleColor,

      width:
        normalizePostRuleWidth(
          settings.bodyRuleWidth,
          POST_STYLE_DEFAULTS.bodyRuleWidth
        ),

      gap:
        normalizePostRuleGap(
          settings.bodyRuleGap,
          POST_STYLE_DEFAULTS.bodyRuleGap
        )

    };

  }


  if (
    !settings.dialogueRuleEnabled
  ) {

    return null;

  }


  if (
    !POST_RULE_DIALOGUE_PATTERN.test(
      postRuleRunText(
        run
      )
    )
  ) {

    return null;

  }


  return {

    color:
      settings.dialogueRuleColor,

    width:
      normalizePostRuleWidth(
        settings.dialogueRuleWidth,
        POST_STYLE_DEFAULTS.dialogueRuleWidth
      ),

    gap:
      normalizePostRuleGap(
        settings.dialogueRuleGap,
        POST_STYLE_DEFAULTS.dialogueRuleGap
      )

  };

}


function applyPostRuleBoxStyle(
  box,
  rule
) {

  /*
    ★ 블록이어야 한다. 인라인 요소의 border-left는 "첫 줄 앞"에만
    한 번 그려지고 줄마다 이어지지 않는다.
  */

  box.style.display =
    "block";


  box.style.borderLeftStyle =
    "solid";


  box.style.borderLeftWidth =
    `${rule.width}px`;


  box.style.borderLeftColor =
    rule.color;


  box.style.paddingLeft =
    `${
      normalizePostRuleGap(
        rule.gap,
        POST_RULE_GAP
      )
    }px`;

}


function unwrapPostRuleBoxes(
  container
) {

  container
    .querySelectorAll(
      `.${POST_RULE_BOX_CLASS}`
    )
    .forEach(
      box => {

        const parent =
          box.parentNode;


        if (!parent) {
          return;
        }


        while (
          box.firstChild
        ) {

          parent.insertBefore(
            box.firstChild,
            box
          );

        }


        box.remove();

      }
    );

}


function applyPostParagraphRules(
  container,
  settings = {}
) {

  if (!container) {
    return;
  }


  const resolved =
    normalizePostStyleSettings(
      settings
    );


  /*
    같은 컨테이너를 여러 번 그리는 경로가 있다 — 먼저 지난번
    상자를 전부 풀고 처음부터 다시 만든다(문단 간격 블록과
    같은 규칙).
  */

  unwrapPostRuleBoxes(
    container
  );


  collectPostRuleParagraphs(
    container
  )
    .forEach(
      run => {

        const rule =
          resolvePostRuleForRun(
            run,
            resolved
          );


        if (!rule) {
          return;
        }


        /*
          내용이 하나도 없는 자리(빈 줄만 남은 구간)에는 선을
          그리지 않는다 — 허공에 선만 떠 보인다.
        */

        const hasContent =
          run.some(
            node =>
              (
                node.textContent ||
                ""
              ).trim() !== ""
              ||
              node.nodeName === "IMG"
              ||
              (
                node.nodeType === Node.ELEMENT_NODE &&
                node.querySelector?.("img")
              )
          );


        if (!hasContent) {
          return;
        }


        const box =
          document.createElement(
            "span"
          );


        box.className =
          POST_RULE_BOX_CLASS;


        applyPostRuleBoxStyle(
          box,
          rule
        );


        container.insertBefore(
          box,
          run[0]
        );


        run.forEach(
          node => {

            box.appendChild(
              node
            );

          }
        );

      }
    );

}


/* =========================================================
   출처 강조선

   ★ 선은 출처 **글자 바로 왼쪽**에 붙는다 (요구사항 4)

     예전에는 출처 요소(블록) 자체에 border-left를 걸었다. 그
     블록은 캔버스 폭을 다 차지하므로, 출처가 오른쪽 정렬이면
     글자는 오른쪽 끝에 있는데 선만 본문 왼쪽 끝에 덩그러니
     남았다.

     그래서 글자를 inline-block 상자 하나로 감싸고 그 상자에
     선을 건다. 상자는 글자 폭만큼만 차지하므로 선이 글자를
     따라가고, 바깥 블록의 text-align이 왼쪽/가운데/오른쪽
     정렬을 그대로 결정한다 — 선을 절대좌표로 옮기는 것이
     아니라 **글자 묶음의 실제 크기와 정렬을 따르는** 구조다.

     출처가 여러 줄이 되어도 상자가 그만큼 높아질 뿐이라 선이
     떨어지거나 글자와 겹치지 않는다. 오른쪽 정렬이어도 선은
     글자 왼쪽에 남는다(요구사항 4).

   ★ 상자는 필요할 때만 만든다

     선이 꺼져 있으면 예전과 완전히 같은 DOM(글자만 든 블록)으로
     되돌린다 — 껐다 켰다를 반복해도 상자가 겹쳐 쌓이지 않는다.
========================================================== */

const POST_SOURCE_RULE_BOX_CLASS =
  "post-source-rule-box";


function postSourceRuleBox(
  source
) {

  return source.querySelector(
    `:scope > .${POST_SOURCE_RULE_BOX_CLASS}`
  );

}


function unwrapPostSourceRuleBox(
  source
) {

  const box =
    postSourceRuleBox(
      source
    );


  if (!box) {
    return;
  }


  while (box.firstChild) {

    source.insertBefore(
      box.firstChild,
      box
    );

  }


  box.remove();

}


function applyPostSourceRule(
  source,
  settings = {},
  view = {}
) {

  if (!source) {
    return;
  }


  const resolved =
    normalizePostStyleSettings(
      settings
    );


  const enabled =
    view.sourceRuleEnabled ??
    resolved.sourceRuleEnabled;


  if (!enabled) {

    unwrapPostSourceRuleBox(
      source
    );


    source.style.borderLeftStyle =
      "";

    source.style.borderLeftWidth =
      "";

    source.style.borderLeftColor =
      "";

    source.style.paddingLeft =
      "";


    return;

  }


  /*
    예전 방식으로 요소 자체에 걸려 있던 선은 걷어낸다 — 같은
    요소에 두 번 그려지지 않게.
  */

  source.style.borderLeftStyle =
    "";

  source.style.borderLeftWidth =
    "";

  source.style.borderLeftColor =
    "";

  source.style.paddingLeft =
    "";


  const color =
    isPostRuleColor(
      view.sourceRuleColor
    )
      ? view.sourceRuleColor
      : resolved.sourceRuleColor;


  let box =
    postSourceRuleBox(
      source
    );


  if (!box) {

    box =
      document.createElement(
        "span"
      );


    box.className =
      POST_SOURCE_RULE_BOX_CLASS;


    while (source.firstChild) {

      box.appendChild(
        source.firstChild
      );

    }


    source.appendChild(
      box
    );

  }


  /*
    ★ inline-block이어야 한다.

      block이면 다시 폭을 다 차지해서 예전 문제로 돌아가고,
      순수 inline이면 border-left가 첫 줄 앞에만 한 번 그려져
      여러 줄에서 이어지지 않는다.
  */

  box.style.display =
    "inline-block";


  box.style.maxWidth =
    "100%";


  /*
    글자 묶음 안쪽의 줄맞춤은 출처 정렬을 그대로 따른다 —
    여러 줄이 됐을 때 바깥 정렬과 어긋나 보이지 않게.
  */

  box.style.textAlign =
    resolved.sourceAlign;


  box.style.borderLeftStyle =
    "solid";


  box.style.borderLeftWidth =
    `${
      normalizePostRuleWidth(
        resolved.sourceRuleWidth,
        POST_STYLE_DEFAULTS.sourceRuleWidth
      )
    }px`;


  box.style.borderLeftColor =
    color;


  box.style.paddingLeft =
    `${
      normalizePostRuleGap(
        resolved.sourceRuleGap,
        POST_STYLE_DEFAULTS.sourceRuleGap
      )
    }px`;

}
