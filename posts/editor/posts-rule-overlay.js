/* =========================================================
   POSTS - EDITOR: 강조선 표시 레이어

   기준 문서: posts/style/posts-body-decor.js §3

   ★ 왜 편집창 안에 진짜 상자를 만들지 않는가

     발췌/발행 본문에서는 문단을 블록 상자(.post-para-rule-box)로
     감싸서 왼쪽에 테두리를 그린다. 그런데 이 에디터의 문단은
     **연속된 <br> 두 개**로만 나뉜다 — 편집창 안에서 문단을 블록으로
     감싸는 순간 그 <br><br>이 상자 바깥에 남아 빈 줄이 하나 더
     생기고, 저장되는 HTML의 문단 구조도 달라진다.

     그래서 편집창에서는 본문 DOM을 전혀 건드리지 않고,
     contenteditable **바깥**의 레이어에 선만 그린다 — 본문 사진의
     '대표' 버튼(postEditorImageControl)이 쓰는 것과 같은 방식이다.
     저장되는 HTML에는 문단 맨 앞의 마커 span 하나만 들어간다.

   ★ 알려진 차이 (의도한 것)

     편집창의 선은 글자 **왼쪽 여백**에 그려지고 글자를 밀지
     않는다. 실제 발췌/발행 본문에서는 선과 글자 사이에 여백
     (POST_RULE_GAP)이 들어가 문단이 그만큼 들여쓰기된다. 편집
     중에 줄바꿈 위치가 흔들리지 않게 하려는 선택이고, 최종 모양은
     바로 아래 발췌 PREVIEW에서 확인한다.

   classic script. posts/editor/posts-refs.js ·
   posts/style/posts-body-decor.js보다 나중에 로드돼야 한다.
========================================================== */


/* 선을 그리는 세로 위치(편집창 왼쪽 안쪽 여백 안) */

const EDITOR_RULE_OVERLAY_LEFT =
  6;


let editorRuleOverlay =
  null;


function ensureEditorRuleOverlay() {

  if (editorRuleOverlay) {

    return editorRuleOverlay;

  }


  if (!postEditorContent) {

    return null;

  }


  const parent =
    postEditorContent.parentElement;


  if (!parent) {

    return null;

  }


  parent.classList.add(
    "post-editor-rule-host"
  );


  editorRuleOverlay =
    document.createElement(
      "div"
    );


  editorRuleOverlay.className =
    "post-editor-rule-overlay";


  editorRuleOverlay.setAttribute(
    "aria-hidden",
    "true"
  );


  parent.insertBefore(
    editorRuleOverlay,
    postEditorContent.nextSibling
  );


  return editorRuleOverlay;

}


/*
  문단 하나가 차지하는 화면 세로 범위.
  노드마다 rect를 재서 합친다(텍스트 노드는 Range로).
*/

function editorRuleRunBounds(
  run
) {

  let top =
    Infinity;

  let bottom =
    -Infinity;


  run.forEach(
    node => {

      let rect =
        null;


      if (
        node.nodeType ===
        Node.ELEMENT_NODE
      ) {

        rect =
          node.getBoundingClientRect();

      }

      else if (
        node.nodeType ===
        Node.TEXT_NODE
      ) {

        const range =
          document.createRange();


        range.selectNodeContents(
          node
        );


        rect =
          range.getBoundingClientRect();

      }


      if (
        !rect ||
        (
          rect.height === 0 &&
          rect.width === 0
        )
      ) {

        return;

      }


      top =
        Math.min(
          top,
          rect.top
        );


      bottom =
        Math.max(
          bottom,
          rect.bottom
        );

    }
  );


  if (
    top === Infinity ||
    bottom <= top
  ) {

    return null;

  }


  return {
    top,
    bottom
  };

}


/*
  지금 본문에서 선이 그려져야 하는 문단과 그 색을 모은다.
  판정 규칙은 렌더링 쪽(resolvePostRuleForRun)과 같다.
*/

function collectEditorRuleBars() {

  if (
    typeof collectEditorParagraphRuns !== "function"
  ) {

    return [];

  }


  const settings =
    typeof normalizePostStyleSettings === "function"
      ? normalizePostStyleSettings(
          postStyleSettings ||
          {}
        )
      : {};


  const bars =
    [];


  collectEditorParagraphRuns()
    .forEach(
      run => {

        const mark =
          findEditorRuleMark(
            run
          );


        let color =
          null;


        if (mark) {

          if (
            mark.dataset.rule === "off"
          ) {

            return;

          }


          color =
            mark.dataset.ruleColor ||
            settings.bodyRuleColor;

        }

        else if (
          settings.dialogueRuleEnabled &&
          editorRunIsDialogue(
            run
          )
        ) {

          /*
            ★ 대사 자동 강조선도 BODY의 색을 쓴다 (요구사항 3).
            판정 규칙은 렌더링 쪽(resolvePostRuleForRun)과 같아야
            하므로 그쪽과 함께 바꿨다.
          */

          color =
            settings.bodyRuleColor;

        }


        if (!color) {
          return;
        }


        const hasContent =
          run.some(
            node =>
              (
                node.textContent ||
                ""
              ).trim() !== ""
          );


        if (!hasContent) {
          return;
        }


        const bounds =
          editorRuleRunBounds(
            run
          );


        if (!bounds) {
          return;
        }


        bars.push(
          {
            color,

            /* 굵기도 수동·자동 구분 없이 BODY 하나를 따른다 */

            width:
              typeof normalizePostRuleWidth === "function"
                ? normalizePostRuleWidth(
                    settings.bodyRuleWidth,
                    3
                  )
                : 3,

            top: bounds.top,

            bottom: bounds.bottom
          }
        );

      }
    );


  return bars;

}


let editorRuleOverlaySyncScheduled =
  false;


function syncEditorRuleOverlay() {

  const overlay =
    ensureEditorRuleOverlay();


  if (
    !overlay ||
    !postEditorContent
  ) {
    return;
  }


  /*
    편집창이 숨겨져 있으면(읽기 화면 등) 잴 것이 없다.
  */

  if (
    postEditorContent.offsetParent === null &&
    postEditorContent.getClientRects().length === 0
  ) {

    overlay.replaceChildren();


    return;

  }


  const editorRect =
    postEditorContent.getBoundingClientRect();


  overlay.style.top =
    `${postEditorContent.offsetTop}px`;


  overlay.style.left =
    `${postEditorContent.offsetLeft}px`;


  overlay.style.width =
    `${postEditorContent.offsetWidth}px`;


  overlay.style.height =
    `${postEditorContent.offsetHeight}px`;


  overlay.replaceChildren();


  collectEditorRuleBars()
    .forEach(
      bar => {

        /*
          편집창은 자기 안에서 스크롤되는 상자다 — 위아래로 밀려
          안 보이는 부분은 잘라낸다(레이어 자체도 overflow:hidden).
        */

        const top =
          Math.max(
            bar.top,
            editorRect.top
          );


        const bottom =
          Math.min(
            bar.bottom,
            editorRect.bottom
          );


        if (
          bottom <= top
        ) {

          return;

        }


        const element =
          document.createElement(
            "span"
          );


        element.className =
          "post-editor-rule-bar";


        element.style.left =
          `${EDITOR_RULE_OVERLAY_LEFT}px`;


        element.style.top =
          `${top - editorRect.top}px`;


        element.style.height =
          `${bottom - top}px`;


        element.style.width =
          `${bar.width}px`;


        element.style.backgroundColor =
          bar.color;


        overlay.appendChild(
          element
        );

      }
    );

}


function scheduleEditorRuleOverlaySync() {

  if (
    editorRuleOverlaySyncScheduled
  ) {
    return;
  }


  editorRuleOverlaySyncScheduled =
    true;


  requestAnimationFrame(
    () => {

      editorRuleOverlaySyncScheduled =
        false;


      syncEditorRuleOverlay();

    }
  );

}


postEditorContent
  ?.addEventListener(
    "input",
    scheduleEditorRuleOverlaySync
  );


postEditorContent
  ?.addEventListener(
    "scroll",
    scheduleEditorRuleOverlaySync,
    {
      passive: true
    }
  );


window.addEventListener(
  "resize",
  scheduleEditorRuleOverlaySync
);
