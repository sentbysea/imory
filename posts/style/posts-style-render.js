/* =========================================================
   POSTS - STYLE: BODY / RENDER POST

   posts-style.js 분할본 중 마지막. postStyleSettings 등은
   posts/editor/posts-refs.js에 있음(반드시 먼저
   로드돼야 함).

   내용: 본문 폰트/색/줄간격 등 적용(applyPostBodyStyles),
   실제 글 본문을 컨테이너에 렌더링
   (renderStyledPostContentInto/renderStyledPostContent).
========================================================== */


/* =========================================================
   BODY STYLE
========================================================== */

function applyPostBodyStyles(
  container,
  settings = {}
) {

  if (!container) {
    return;
  }


  /*
    본문 폰트 선택(admin-quote BODY 섹션의 FONT). 항상
    인라인으로 직접 지정 — html2canvas 캡처(발췌 export)
    때 상속만 되어 있으면 못 읽고 시스템 명조체로 깨지는
    문제가 있었음.
  */

  container.style.fontFamily =
    settings.bodyFont ===
    "nanummyeongjo"
      ? '"Nanum Myeongjo", serif'
      : '"Pretendard", sans-serif';


  container.style.color =
    settings.bodyColor ||
    "#555555";


  /*
    ★ 예전에는 최소 13px로 강제했었는데, 그러면 사용자가
    admin-quote에서 일부러 작게(예: 9px) 설정해도 무시되고
    항상 13px로 나왔다 — admin-quote 프리뷰 쪽엔 이런 강제
    최소값이 없어서 두 프리뷰가 서로 다르게 보이던 원인 중
    하나. 설정값을 그대로 쓰도록 제거.
  */

  container.style.fontSize =
    `${
      Number(
        settings.bodySize
      ) || 16
    }px`;


  container.style.fontWeight =
    settings.bodyWeight ||
    "400";


  container.style.lineHeight =
    settings.lineHeight ||
    1.9;


  container.style.letterSpacing =
    `${
      Number(
        settings.letterSpacing
      ) || 0
    }px`;


  container.style.textAlign =
    settings.bodyAlign ||
    "left";

}



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
    settings
  );


  /*
    QUOTE의 문단 간격도 적용
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
          : `${
              Number(
                settings.paragraphSpacing
              ) || 0
            }px`;


      block.style.textIndent =
        `${
          Number(
            settings.indent
          ) || 0
        }px`;

    }
  );


  /*
    ★ 위 blocks(:scope > div, :scope > p)는 예전 legacy
    콘텐츠에만 있고, 이 에디터는 Enter를 눌러도 <div>/<p>가
    아니라 <br>만 생긴다(posts.js 참고) — 그래서 실제로
    작성한 글에는 paragraphSpacing/indent가 적용될 대상
    자체가 없어서 admin-quote 미리보기와 달리 문단 간격이
    통째로 사라져 보였다.

    연속된 <br> 두 개(=Enter 두 번, 즉 빈 줄로 문단을
    나눈 지점)를 문단 경계로 보고 그 자리에 paragraphSpacing
    만큼 여백을 준다. <br>은 인라인 요소라 margin/height가
    안 먹으므로 display:block으로 바꿔서 적용한다.
  */

  const paragraphSpacing =
    Number(
      settings.paragraphSpacing
    ) || 0;


  if (
    paragraphSpacing > 0
  ) {

    const childNodes =
      Array.from(
        container.childNodes
      );


    childNodes.forEach(
      (
        node,
        index
      ) => {

        const previous =
          childNodes[
            index - 1
          ];

        if (
          node.nodeType ===
            Node.ELEMENT_NODE &&
          node.nodeName ===
            "BR" &&
          previous?.nodeName ===
            "BR"
        ) {

          node.style.display =
            "block";

          node.style.height =
            `${paragraphSpacing}px`;

        }

      }
    );

  }


  applyActionDialogueStyles(
    container,
    settings
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
