/* =========================================================
   POSTS VIEW - 플랫폼 소유자 도구의 자리

   책임 하나뿐이다: 스킨이 그린 화면 위에서 플랫폼의 소유자 도구
   (.post-header 안의 ＋ / edit)를 **어디에 놓을지** 정한다.
   무엇을 보일지(hidden)와 누가 볼 수 있는지(권한)는 지금까지처럼
   각 렌더러와 RLS가 정한다 — 이 파일은 좌표만 만진다.

   ── 왜 필요한가 ────────────────────────────────────────
   PHASE 1E 이후 이 도구는 표시 공간(#postArea)의 오른쪽 위 12px에
   절대배치돼 있었다(posts/posts-base.css). 스킨은 자기 상단에 장식
   띠(브라우저 창 모양 헤더 등)를 그리는 경우가 많아, 그 자리에 놓인
   edit은 스킨의 어떤 줄과도 맞지 않고 장식 위에 "떠 있는" 것처럼
   보였다. 스킨이 바뀔 때마다 픽셀을 손보는 것은 특정 스킨에 의존하는
   제품 코드가 되므로(SKIN_SURFACE_AND_TRANSITION_CONTRACT.md 0절)
   할 수 없다.

   ── 두 단계 규칙 ───────────────────────────────────────
   1) 스킨이 자리를 지정했으면 그 자리에 맞춘다 — 렌더된 DOM 안의
      [data-imory-region="owner-tools"]를 찾아 그 요소의 오른쪽 끝,
      그 요소가 놓인 줄의 세로 가운데에 앉힌다. 이 region은 post-body와
      같은 성격의 고정 식별자이고 새니타이저가 허용한다
      (skin/skin-sanitize.js). 스킨이 EDIT/WRITE 링크를 자기 손으로
      그린 경우에는 애초에 플랫폼 도구가 숨겨지므로
      (skin/skin-owner-entry.js) 여기까지 오지 않는다.

   2) 지정하지 않았으면 **재서 맞춘다**. 스킨의 본문 블록을 찾아
      그 블록의 콘텐츠 상자(테두리/padding 안쪽) 왼쪽 위 모서리
      높이에, 오른쪽 끝에 맞춰 앉힌다 — 그게 곧 스킨이 정한 글
      기둥이고, 대부분의 스킨에서 그 첫 줄이 장식 띠 아래 첫
      콘텐츠 줄(브레드크럼/구역 제목)이다. 본문 블록은 POST/FOLDER
      에서는 플랫폼 표식(post-body region)으로 정확히 알 수 있고,
      표식이 없는 화면에서는 가장 높은 블록으로 본다. 어떤 스킨
      이름도 클래스도 보지 않는다. 잴 수 없으면 지금까지의 기본
      자리를 그대로 쓴다.

   정확한 자리를 원하는 스킨은 1)을 쓰면 되고, 아무것도 하지 않은
   스킨도 2) 덕분에 "떠 있는" 모양은 면한다.

   ── 왜 슬롯 안으로 DOM을 옮기지 않는가 ──────────────────
   .post-header를 스킨 DOM 안으로 실제로 옮기면 줄맞춤은 공짜로
   얻지만, 스킨 컨테이너를 비우는 지점(#postList / #postSkinContainer의
   innerHTML 교체)이 여러 렌더 경로에 흩어져 있어서 한 군데만 복원을
   빠뜨려도 ＋/edit 버튼이 문서에서 영영 사라진다. 그래서 DOM은 원래
   자리에 그대로 두고 **좌표만** 슬롯에 맞춘다 — 스킨을 다시 그리든
   비우든 이 파일이 복원할 상태가 CSS 변수 두 개와 클래스 하나뿐이다.

   의존(classic script, 이 파일보다 먼저 로드돼야 함):
   posts/editor/posts-refs.js(postContainer / postArea).
========================================================== */


/* 스킨이 지정할 수 있는 유일한 자리 이름 */
const PLATFORM_OWNER_TOOLS_REGION =
  "owner-tools";


/* 지금 재서 맞춘 스킨 루트(다시 재야 할 때 쓴다) */
let platformOwnerToolsMeasuredRoot =
  null;


let platformOwnerToolsResizeObserver =
  null;


/*
  실제 자리 잡기는 다음 프레임에 한다 — 부르는 쪽(각 렌더러)이 스킨
  DOM을 완성하기 전에 불러도, 두 번 불러도 마지막 것만 남는다.
  복원은 이 번호를 올려서 예약된 작업을 무효로 만든다.
*/

let platformOwnerToolsFrameSeq =
  0;


function getPlatformOwnerToolsHeader() {

  return (
    postContainer
      ?.querySelector(
        ".post-header"
      ) ||
    null
  );

}


/* =========================================================
   MOUNT

   skinRoot: 스킨이 실제로 렌더된 컨테이너(#postList /
   #postSkinContainer). null이면 복원만 한다.

   각 렌더러가 postAddButton/edit 토글의 hidden과
   .post-container--owner-tools를 확정한 **직후**에 부른다 —
   보일지 말지가 정해진 뒤라야 잰 값이 의미가 있다.
========================================================== */

function mountPlatformOwnerTools(
  skinRoot
) {

  restorePlatformOwnerTools();


  if (!skinRoot) {

    return;

  }


  const token =
    ++platformOwnerToolsFrameSeq;


  requestAnimationFrame(
    () => {

      if (
        token !==
        platformOwnerToolsFrameSeq
      ) {

        return;

      }


      placePlatformOwnerTools(
        skinRoot
      );


      observePlatformOwnerTools(
        skinRoot
      );

    }
  );

}


/* =========================================================
   RESTORE

   재서 넣어 둔 값과 관찰자를 전부 거둔다. 도구는 기본 자리
   (posts/posts-base.css)로 돌아간다. 여러 번 불러도 안전하다.
========================================================== */

function restorePlatformOwnerTools() {

  platformOwnerToolsFrameSeq += 1;


  if (postContainer) {

    postContainer.classList.remove(
      "post-container--tools-anchored"
    );

    postContainer.style.removeProperty(
      "--imory-owner-tools-top"
    );

    postContainer.style.removeProperty(
      "--imory-owner-tools-right"
    );

  }


  platformOwnerToolsMeasuredRoot =
    null;


  if (platformOwnerToolsResizeObserver) {

    platformOwnerToolsResizeObserver.disconnect();


    platformOwnerToolsResizeObserver =
      null;

  }

}


/* =========================================================
   측정
========================================================== */

function placePlatformOwnerTools(
  skinRoot
) {

  const header =
    getPlatformOwnerToolsHeader();


  if (
    !header ||
    !postArea ||
    !postContainer ||
    !(
      postContainer.classList.contains(
        "post-container--owner-tools"
      ) ||
      /*
        HIGHLIGHT-1: 글 상세의 도구 메뉴(⋮)는 방문자에게도 뜬다 —
        자리를 재는 규칙은 소유자 도구와 완전히 같다.
      */
      postContainer.classList.contains(
        "post-container--viewer-tools"
      )
    ) ||
    !skinRoot.isConnected
  ) {

    return;

  }


  const anchor =
    resolvePlatformOwnerToolsAnchor(
      skinRoot
    );


  if (!anchor) {

    return;

  }


  const areaRect =
    postArea.getBoundingClientRect();


  const headerHeight =
    header.getBoundingClientRect().height;


  /*
    슬롯은 줄 안에 놓인 자리 표시라 그 줄의 세로 가운데에 맞춘다.
    잰 첫 콘텐츠 줄(fallback)은 블록이라 윗변에 맞춘다 — 그래야
    그 줄의 글자와 같은 높이에서 시작한다.
  */

  const top =
    (
      anchor.center
        ? anchor.rect.top +
          (anchor.rect.height - headerHeight) / 2
        : anchor.rect.top
    ) -
    areaRect.top +
    postArea.scrollTop;


  let right =
    areaRect.right -
    anchor.rect.right;


  /*
    .music-button(home/bgm.css)은 뷰포트 오른쪽 위 16px에 고정이다.
    잰 자리가 그 띠 안(표시 공간 위에서 56px 이내)에 들어오면 기존
    규칙대로 그 자리를 비켜 앉는다 — 아래로 내려온 경우에는 비킬
    이유가 없다.
  */

  if (
    anchor.rect.top -
      areaRect.top <
    56
  ) {

    right =
      Math.max(
        right,
        56
      );

  }


  if (
    !Number.isFinite(top) ||
    !Number.isFinite(right) ||
    top < 0 ||
    right < 0
  ) {

    return;

  }


  postContainer.style.setProperty(
    "--imory-owner-tools-top",
    `${Math.round(top)}px`
  );

  postContainer.style.setProperty(
    "--imory-owner-tools-right",
    `${Math.round(right)}px`
  );


  postContainer.classList.add(
    "post-container--tools-anchored"
  );


  platformOwnerToolsMeasuredRoot =
    skinRoot;

}


/*
  맞출 기준 사각형을 정한다.

  { rect, center } — center가 true면 그 사각형의 세로 가운데에,
  false면 윗변에 맞춘다.
*/

function resolvePlatformOwnerToolsAnchor(
  skinRoot
) {

  const slot =
    skinRoot.querySelector(
      `[data-imory-region="${PLATFORM_OWNER_TOOLS_REGION}"]`
    );


  if (slot) {

    const slotRect =
      slot.getBoundingClientRect();


    /*
      빈 인라인 요소는 높이가 0으로 잡힌다 — 그 자체로는 세로 기준이
      되지 못하므로 그 줄(부모)의 높이를 쓰고, 가로 위치만 슬롯의
      오른쪽 끝을 그대로 쓴다. 스킨이 슬롯에 크기를 준 경우에는
      슬롯 자신이 기준이다.
    */

    if (slotRect.height >= 1) {

      return {
        rect: slotRect,
        center: true
      };

    }


    const lineRect =
      slot.parentElement
        ?.getBoundingClientRect();


    if (
      lineRect &&
      lineRect.height >= 1
    ) {

      return {
        rect: {
          top: lineRect.top,
          height: lineRect.height,
          right: slotRect.right
        },

        center: true
      };

    }

  }


  const block =
    findSkinContentBlock(
      skinRoot
    );


  if (!block) {

    return null;

  }


  const rect =
    contentBoxRect(
      block
    );


  if (
    !rect ||
    rect.height < 1
  ) {

    return null;

  }


  return {
    rect,
    center: false
  };

}


/*
  요소의 **콘텐츠 상자**(테두리와 padding을 뺀 안쪽)를 잰다.

  왜 border box가 아닌가 — 여기서 필요한 값은 "그 블록 안의 글이
  시작하는 윗변"과 "그 글이 끝나는 오른쪽 끝"이다. 그게 곧 스킨이
  정한 글 기둥이고, 도구를 그 기둥에 맞춰야 첫 줄과 나란해 보인다.
  블록의 첫 자식 요소를 재는 방법도 있지만, 그 자식이 내용만큼만
  넓은 요소(브레드크럼 같은)면 오른쪽 끝이 기둥 한가운데로 들어온다.
*/

function contentBoxRect(
  element
) {

  const rect =
    element.getBoundingClientRect();


  const style =
    window.getComputedStyle(
      element
    );


  const top =
    rect.top +
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.paddingTop) || 0);


  const bottom =
    rect.bottom -
    (parseFloat(style.borderBottomWidth) || 0) -
    (parseFloat(style.paddingBottom) || 0);


  const right =
    rect.right -
    (parseFloat(style.borderRightWidth) || 0) -
    (parseFloat(style.paddingRight) || 0);


  return {
    top,
    right,
    height:
      bottom - top
  };

}


/*
  스킨의 "본문 블록"을 찾는다 — 장식 띠(브라우저 창 모양 헤더,
  프로필 띠)가 아니라 실제 글이 들어 있는 칸이다.

  1) 스킨 루트가 프레임 하나만 감싸고 있는 흔한 모양
     (<div class="skin-frame"> 하나)에서는 그 안으로 내려가 실제
     블록들이 나오는 지점(frame)을 찾는다.
  2) frame의 자식 중 본문 블록을 고른다.
     - POST/FOLDER에는 플랫폼이 정한 표식이 있다
       ([data-imory-region="post-body"]) — 그 region을 품고 있는
       블록이 곧 본문 블록이다. 추측할 필요가 없다.
     - CATEGORY/BANNER처럼 표식이 없는 화면에서는 가장 높은 블록을
       본문으로 본다(장식 띠보다 목록이 크다는 것 외에는 아무것도
       가정하지 않는다).
*/

function findSkinContentBlock(
  skinRoot
) {

  const frame =
    findSkinBlockParent(
      skinRoot
    );


  if (!frame) {

    return null;

  }


  const blocks =
    visibleChildBlocks(
      frame
    );


  const region =
    frame.querySelector(
      '[data-imory-region="post-body"]'
    );


  if (region) {

    let node =
      region;


    while (
      node &&
      node.parentElement !== frame
    ) {

      node =
        node.parentElement;

    }


    if (
      node &&
      blocks.includes(node)
    ) {

      return narrowToTextColumn(
        node,
        region
      );

    }

  }


  if (!blocks.length) {

    return null;

  }


  let main =
    blocks[0];


  for (const block of blocks) {

    if (
      block.getBoundingClientRect().height >
      main.getBoundingClientRect().height
    ) {

      main = block;

    }

  }


  return main;

}


/*
  본문 블록 안에서 **글 기둥**까지 한 단계 더 좁힌다.

  왜 필요한가 — 사이드바가 있는 스킨에서는 본문 블록이 "사이드바 +
  글"을 함께 담은 가로 배치라, 그 블록의 오른쪽 끝은 글이 끝나는
  자리가 아니다. region의 조상 사슬을 따라 내려가되, 두 경우에만
  한 단계 내려간다.

  - 그 자식이 부모의 콘텐츠보다 **좁을 때**(오른쪽 끝을 당길 때).
    사이드바 옆의 본문 칸이든, 사이드바가 위로 접힌 모바일에서
    아래로 내려온 본문 칸이든 여기에 걸린다 — 그 자식이 곧 글 기둥이다.
  - 그 자식이 부모의 콘텐츠가 **시작되는 바로 그 줄에서 시작할 때**.
    폭은 같아도 가로로 나뉜 한 칸일 수 있다.

  둘 다 아니면 그 자식은 이미 첫 줄 밑으로 쌓인 본문 자체이므로
  멈춘다 — 거기까지 내려가면 도구가 제목 아래로 밀린다.

  자식은 바깥 변(border box), 부모는 안쪽 변(content box)을 비교한다 —
  그래야 부모의 padding을 사이에 두고도 "같은 줄에서 시작"이 성립한다.
*/

function narrowToTextColumn(
  block,
  region
) {

  let node =
    block;


  for (let depth = 0; depth < 5; depth += 1) {

    const child =
      Array.from(
        node.children ||
        []
      ).find(
        (candidate) =>
          candidate !== region &&
          candidate.contains(region)
      );


    if (!child) {

      return node;

    }


    const nodeBox =
      contentBoxRect(
        node
      );

    const childBox =
      contentBoxRect(
        child
      );


    const startsOnSameLine =
      Math.abs(
        child.getBoundingClientRect().top -
        nodeBox.top
      ) <= 2;


    const narrowsColumn =
      childBox.right <
      nodeBox.right - 0.5;


    if (
      !nodeBox ||
      !childBox ||
      (
        !startsOnSameLine &&
        !narrowsColumn
      )
    ) {

      return node;

    }


    node =
      child;

  }


  return node;

}


/*
  자식이 하나뿐인 껍데기를 지나 실제 블록들이 늘어선 부모를 찾는다.
  끝까지 내려가 버리지 않도록, 자식이 둘 이상이 되는 순간 멈춘다.
*/

function findSkinBlockParent(
  skinRoot
) {

  if (
    !skinRoot ||
    typeof skinRoot.getBoundingClientRect !==
      "function"
  ) {

    return null;

  }


  let node =
    skinRoot;


  for (let depth = 0; depth < 5; depth += 1) {

    const blocks =
      visibleChildBlocks(
        node
      );


    if (blocks.length !== 1) {

      return (
        blocks.length
          ? node
          : null
      );

    }


    node =
      blocks[0];

  }


  return node;

}


function visibleChildBlocks(
  element
) {

  return Array.from(
    element.children ||
    []
  ).filter(
    (child) =>
      child.getBoundingClientRect &&
      child.getBoundingClientRect().height > 0
  );

}


/*
  스킨 안의 사진이 늦게 로드되거나 화면이 회전하면 그 줄의 자리가
  바뀐다 — 그때마다 다시 잰다. ResizeObserver가 없는 환경에서는
  아래 resize 리스너만으로 움직인다.
*/

function observePlatformOwnerTools(
  skinRoot
) {

  if (
    typeof ResizeObserver !==
      "function" ||
    platformOwnerToolsMeasuredRoot !==
      skinRoot
  ) {

    return;

  }


  platformOwnerToolsResizeObserver =
    new ResizeObserver(
      () => {

        if (
          platformOwnerToolsMeasuredRoot ===
          skinRoot
        ) {

          placePlatformOwnerTools(
            skinRoot
          );

        }

      }
    );


  platformOwnerToolsResizeObserver.observe(
    skinRoot
  );

}


window.addEventListener(
  "resize",
  () => {

    if (platformOwnerToolsMeasuredRoot) {

      placePlatformOwnerTools(
        platformOwnerToolsMeasuredRoot
      );

    }

  }
);
