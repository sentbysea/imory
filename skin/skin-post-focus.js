/* =========================================================
   SKIN POST FOCUS (PHASE 1H 2절) — POST 읽기 모드 전환 지원

   좁은 화면에서 글을 열면 프로필·메뉴가 위로 접히고 제목·본문이
   올라오게 하고 싶다. **최종 배치는 스킨 CSS가 정한다** — 플랫폼은
   "지금이 읽기 모드다"라는 상태 하나와, 그 상태로 넘어가는 시점만
   알려준다. 스킨이 그 상태를 무시하면 지금까지와 완전히 같은 화면이
   나온다(효과를 쓰지 않을 자유).

   계약(스킨이 쓰는 것은 이 한 줄이 전부다)

     POST 스킨 루트에 data-imory-post-focus 속성이 붙는다.
       "off" — 아직 펼쳐진 상태(전환 시작 지점)
       "on"  — 읽기 모드

     스킨 CSS는 :root[data-imory-post-focus="on"] 으로 받는다.
     (:root는 skin-css-validate.js가 그 스킨 인스턴스의 scope class로
      바꿔 준다 — 스킨 CSS가 루트 자신의 상태를 표현하는 유일한 방법이다.)

   전환 시점

   - 목록/HOME에서 글을 눌러 들어오면 "off"로 mount한 뒤 다음 프레임에
     "on"으로 바꾼다 → 스킨이 선언한 transition이 실제로 재생된다.
   - 직접 접속·새로고침·뒤로가기(updateUrl:false)는 처음부터 "on"으로
     mount한다 → 새로 삽입된 엘리먼트에는 transition이 걸리지 않으므로
     애니메이션 없이 최종 상태로 나타난다.
   - POST → POST 이동도 처음부터 "on"이다(다시 펼쳤다 접지 않는다).
   - prefers-reduced-motion: reduce 이면 항상 처음부터 "on"이다.

   목록 스크롤 기억

   글을 열 때 그 목록 화면의 #postArea.scrollTop을 기억해 두고, 그
   목록으로 돌아왔을 때 되돌린다. posts-view-transition.js의
   rememberPlatformScreenReturn()(에디터/관리 화면 왕복용)과는 목적도
   생명주기도 달라서 섞지 않는다 — 이쪽은 "읽던 목록의 위치"만 한 칸
   들고 있다가 다음 목록 렌더에서 소비하고 비운다.

   의존: 없음(DOM과 window만 쓴다). classic script.
========================================================== */

const SKIN_POST_FOCUS_ATTR =
  "data-imory-post-focus";


function skinPostFocusPrefersReducedMotion() {

  try {

    return window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

  } catch (err) {

    return false;

  }

}


/* =========================================================
   applySkinPostFocus(root, { animate })

   root는 renderSkin()이 만든 스킨 루트(.imory-skin-root). 아직 화면에
   붙이기 전의 detached 상태에서 불러도 된다 — animate일 때 실제 상태
   변경은 두 프레임 뒤에 일어나고, 그 사이에 호출자가 root를 화면에
   옮긴다(그래야 브라우저가 시작 상태를 한 번 레이아웃해서 transition이
   재생된다).

   늦은 응답 보호와 충돌하지 않는다: 더 새로운 글이 먼저 그려져서 이
   root가 버려졌다면 여기서 속성을 바꿔도 화면에 아무 영향이 없다
   (detached 노드).
========================================================== */

function applySkinPostFocus(
  root,
  options = {}
) {

  const {
    animate = false
  } = options;


  if (
    !root ||
    typeof root.setAttribute !== "function"
  ) {

    return;

  }


  if (
    !animate ||
    skinPostFocusPrefersReducedMotion()
  ) {

    root.setAttribute(
      SKIN_POST_FOCUS_ATTR,
      "on"
    );


    return;

  }


  root.setAttribute(
    SKIN_POST_FOCUS_ATTR,
    "off"
  );


  /*
    두 번 기다린다 — 첫 프레임에 호출자가 옮긴 DOM이 실제로 레이아웃
    되고, 두 번째 프레임에서 속성을 바꿔야 브라우저가 "바뀐 값"으로
    인식해 transition을 재생한다. 한 프레임만 기다리면 같은 프레임의
    스타일 계산에 묶여 전환 없이 최종 상태로 튀는 경우가 있다.
  */

  requestAnimationFrame(
    () => {

      requestAnimationFrame(
        () => {

          root.setAttribute(
            SKIN_POST_FOCUS_ATTR,
            "on"
          );

        }
      );

    }
  );

}


/* =========================================================
   목록 스크롤 기억 — 한 칸짜리 메모

   키는 호출자가 만든 화면 식별 문자열이다(예: "category:12").
   takeSkinListScroll()은 키가 맞든 아니든 항상 메모를 비운다 —
   다른 화면을 한 번이라도 거치면 낡은 위치가 남지 않는다.
========================================================== */

let skinListScrollMemo =
  null;


function rememberSkinListScroll(
  key,
  top
) {

  if (
    !key ||
    typeof top !== "number" ||
    !isFinite(top) ||
    top <= 0
  ) {

    return;

  }


  skinListScrollMemo = {
    key,
    top
  };

}


function takeSkinListScroll(
  key
) {

  const memo =
    skinListScrollMemo;


  skinListScrollMemo =
    null;


  if (
    !memo ||
    memo.key !== key
  ) {

    return null;

  }


  return memo.top;

}


/* =========================================================
   applySkinScrollTop(element, top)

   방금 내용을 갈아끼운 스크롤 컨테이너는 그 프레임에 아직 새 높이를
   갖지 못해서 scrollTop 대입이 0으로 눌린다(posts-view-transition.js의
   restorePlatformScreenScroll()이 같은 이유로 프레임을 한 번 기다린다).
   여기서도 즉시 한 번 시도하고, 다음 프레임에 한 번 더 확정한다.
========================================================== */

function applySkinScrollTop(
  element,
  top
) {

  if (
    !element ||
    typeof top !== "number"
  ) {

    return;

  }


  element.scrollTop =
    top;


  requestAnimationFrame(
    () => {

      element.scrollTop =
        top;

    }
  );

}
