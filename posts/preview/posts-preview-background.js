/* =========================================================
   POSTS - PREVIEW: 배경 사진 · 출처 강조선 (이번 발췌 전용)

   기준 문서: posts/style/posts-canvas-background.js

   ★ 프리셋을 고치지 않는다 (요구사항 7)

     여기서 바꾸는 값은 전부 **이 글을 쓰는 동안만** 사는 세션
     오버라이드다. 프리뷰의 정렬/비율 오버라이드
     (posts-preview-css-vars.js)와 완전히 같은 규칙이다.

       null        아직 안 골랐다 → 프리셋 값을 그대로 따른다
       값이 있음   이번 발췌만 이 값을 쓴다

     글 하나를 열 때 resetPreviewVisibilityOverrides()가 전부
     null로 되돌린다.

   ★ Editor가 다룰 수 있는 것은 셋뿐이다 (요구사항 8)

       change image   이미지 교체
       move           위치 조정 모드(이 모드에서만 드래그가 배경을 움직인다)
       reset          프리셋 기본 이미지·위치로 복원

     세 버튼은 설정의 마지막 줄에 **바로** 있다 — 예전의
     "background" 여닫기 버튼과 그 아래 패널은 없앴다. 프리뷰
     위에 겹쳐 뜨는 버튼도 없다.

   ★ 사진을 바꿔도 프리셋의 배경 설정은 그대로다 (요구사항 8)

     이 파일이 건드리는 값은 **사진의 주소와 구도**뿐이다
     (url · focusX · focusY · pages). 덮개 색/농도 · 흐림 ·
     확대 · 이미지 크기 고정은 view에 넣지 않으므로,
     resolvePostBackgroundView()가 언제나 프리셋 값을 읽는다
     (posts/style/posts-canvas-background.js).

     구도만 가운데로 되돌리는 이유는 새 사진에서 옛 중심이 전혀
     다른 자리를 가리키기 때문이다 — 그건 이미지에 딸린 값이라
     같이 초기화하는 것이 맞고, 크기 정책은 이미지에 딸린 값이
     아니라 프리셋의 것이라 건드리지 않는다.

   ★ 여러 장일 때 (요구사항 7)

       1쪽에서 끈 것    기본 구도가 바뀐다 → 개별 보정이 없는
                        모든 장에 그대로 적용된다.
       2쪽 이후에서 끈 것  그 장만의 보정으로 저장된다.

     본문이 바뀌어 페이지가 다시 나뉘면, 장 수보다 뒤에 있는
     보정은 버린다(현재 페이지 식별 구조가 "몇 번째 장"뿐이라
     그 이상으로 따라갈 근거가 없다 — 남겨두면 엉뚱한 장에
     붙는다).

   classic script. posts/preview/posts-preview-css-vars.js ·
   posts/style/posts-canvas-background.js보다 나중에 로드돼야
   한다.
========================================================== */


/* =========================================================
   세션 오버라이드
========================================================== */

/* null이면 프리셋의 backgroundImageUrl을 따른다. ""는 "배경 없음" */

let previewBackgroundUrl =
  null;

let previewBackgroundFocusX =
  null;

let previewBackgroundFocusY =
  null;


/* { "<장 번호>": { focusX, focusY } } */

let previewBackgroundPageFocus =
  {};


/* 출처 강조선 — null이면 프리셋 값 */

let previewSourceRuleEnabled =
  null;

let previewSourceRuleColor =
  null;


let previewBackgroundMoveMode =
  false;


function resetPreviewBackgroundOverrides() {

  previewBackgroundUrl =
    null;

  previewBackgroundFocusX =
    null;

  previewBackgroundFocusY =
    null;

  previewBackgroundPageFocus =
    {};

  previewSourceRuleEnabled =
    null;

  previewSourceRuleColor =
    null;


  setPreviewBackgroundMoveMode(
    false
  );


  syncPreviewBackgroundControls();

}


/*
  공용 레이아웃에 넘길 background 조각. 아무 것도 안 골랐으면
  null을 줘서 프리셋 값이 그대로 쓰이게 한다.
*/

function resolvePreviewBackgroundView() {

  const background =
    {};


  let touched =
    false;


  if (
    previewBackgroundUrl !== null
  ) {

    background.url =
      previewBackgroundUrl;


    touched =
      true;

  }


  if (
    previewBackgroundFocusX !== null
  ) {

    background.focusX =
      previewBackgroundFocusX;


    touched =
      true;

  }


  if (
    previewBackgroundFocusY !== null
  ) {

    background.focusY =
      previewBackgroundFocusY;


    touched =
      true;

  }


  if (
    Object.keys(
      previewBackgroundPageFocus
    ).length > 0
  ) {

    background.pages =
      previewBackgroundPageFocus;


    touched =
      true;

  }


  return touched
    ? background
    : null;

}


/*
  지금 쓰이는 배경(프리셋 + 오버라이드)을 합쳐서 돌려준다 —
  드래그 계산과 버튼 활성/비활성에 쓴다.
*/

function currentPreviewBackground() {

  return resolvePostBackgroundView(
    postStyleSettings ||
    {},
    {
      background:
        resolvePreviewBackgroundView()
    }
  );

}



/* =========================================================
   버튼 상태
========================================================== */

function syncPreviewBackgroundControls() {

  const background =
    currentPreviewBackground();


  const hasImage =
    Boolean(
      background.url
    );


  if (
    postEditorPreviewBackgroundMove
  ) {

    postEditorPreviewBackgroundMove.disabled =
      !hasImage;


    postEditorPreviewBackgroundMove
      .setAttribute(
        "aria-pressed",
        String(
          previewBackgroundMoveMode
        )
      );

  }


  if (
    postEditorPreviewBackgroundReset
  ) {

    /*
      프리셋 기본값으로 되돌릴 것이 있을 때만 누를 수 있다.
    */

    postEditorPreviewBackgroundReset.disabled =
      previewBackgroundUrl === null &&
      previewBackgroundFocusX === null &&
      previewBackgroundFocusY === null &&
      Object.keys(
        previewBackgroundPageFocus
      ).length === 0;

  }


  if (
    postEditorPreviewSourceRuleToggle
  ) {

    const resolved =
      normalizePostStyleSettings(
        postStyleSettings ||
        {}
      );


    const enabled =
      previewSourceRuleEnabled ??
      resolved.sourceRuleEnabled;


    postEditorPreviewSourceRuleToggle
      .setAttribute(
        "aria-pressed",
        String(
          Boolean(
            enabled
          )
        )
      );

  }


}


function showPreviewBackgroundMessage(
  message
) {

  if (
    !postEditorPreviewBackgroundMessage
  ) {
    return;
  }


  postEditorPreviewBackgroundMessage.textContent =
    message ||
    "";

}


/* =========================================================
   이미지 교체

   ★ 여닫는 패널이 없다 (요구사항 8) — 버튼 셋이 설정의 마지막
   줄에 바로 있다. 그래서 "패널을 닫을 때 조정 모드도 끈다"는
   장치도 필요 없어졌다. 조정 모드는 move 버튼 자체로만 켜고
   끄며, 그 상태가 버튼의 aria-pressed와 대지의 클래스에
   그대로 드러난다(setPreviewBackgroundMoveMode).
========================================================== */

postEditorPreviewBackgroundPick
  ?.addEventListener(
    "click",
    () => {

      postEditorPreviewBackgroundFile
        ?.click();

    }
  );


postEditorPreviewBackgroundFile
  ?.addEventListener(
    "change",
    async () => {

      const file =
        postEditorPreviewBackgroundFile
          .files?.[0];


      /*
        같은 파일을 다시 골라도 change가 뜨도록 값을 비운다.
      */

      postEditorPreviewBackgroundFile.value =
        "";


      if (!file) {
        return;
      }


      showPreviewBackgroundMessage(
        "올리는 중…"
      );


      const result =
        await uploadImoryQuoteBackground(
          file
        );


      if (!result.ok) {

        showPreviewBackgroundMessage(
          result.message
        );


        return;

      }


      /*
        ★ 이미지를 바꾸면 구도는 처음부터 시작한다 (요구사항 7).

        이전 사진 기준으로 정한 중심은 새 사진에서 전혀 다른
        자리를 가리킨다 — 무리하게 재사용하지 않고 가운데로
        되돌린다.
      */

      previewBackgroundUrl =
        result.url;


      previewBackgroundFocusX =
        0.5;


      previewBackgroundFocusY =
        0.5;


      previewBackgroundPageFocus =
        {};


      showPreviewBackgroundMessage(
        "바꿨습니다."
      );


      syncPreviewBackgroundControls();


      updateEditorPreview();

    }
  );



/* =========================================================
   프리셋 기본값으로 복원
========================================================== */

postEditorPreviewBackgroundReset
  ?.addEventListener(
    "click",
    () => {

      previewBackgroundUrl =
        null;

      previewBackgroundFocusX =
        null;

      previewBackgroundFocusY =
        null;

      previewBackgroundPageFocus =
        {};


      setPreviewBackgroundMoveMode(
        false
      );


      showPreviewBackgroundMessage(
        "프리셋 기본값으로 되돌렸습니다."
      );


      syncPreviewBackgroundControls();


      updateEditorPreview();

    }
  );



/* =========================================================
   위치 조정 모드

   ★ 이 모드에서만 드래그가 배경을 움직인다. 평소에는 프리뷰의
   기존 제스처(모바일 핀치/스크롤, 본문 선택)를 전혀 건드리지
   않는다(요구사항 8).
========================================================== */

function setPreviewBackgroundMoveMode(
  next
) {

  previewBackgroundMoveMode =
    Boolean(
      next
    );


  postEditorPreviewStage
    ?.classList
    .toggle(
      "is-background-move",
      previewBackgroundMoveMode
    );


  postEditorPreviewBackgroundMove
    ?.setAttribute(
      "aria-pressed",
      String(
        previewBackgroundMoveMode
      )
    );


  showPreviewBackgroundMessage(
    previewBackgroundMoveMode
      ? "드래그해서 사진 위치를 옮기세요. 다시 누르면 끝납니다."
      : ""
  );

}


postEditorPreviewBackgroundMove
  ?.addEventListener(
    "click",
    () => {

      setPreviewBackgroundMoveMode(
        !previewBackgroundMoveMode
      );

    }
  );


/*
  Escape로도 조정 모드를 끝낸다.
*/

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape" &&
      previewBackgroundMoveMode
    ) {

      setPreviewBackgroundMoveMode(
        false
      );

    }

  }
);


let previewBackgroundDrag =
  null;


function previewBackgroundPageAt(
  target
) {

  const page =
    target
      ?.closest?.(
        ".post-editor-preview-page"
      );


  if (
    !page ||
    !page.querySelector(
      `.${POST_BACKGROUND_WRAPPER_CLASS}`
    )
  ) {

    return null;

  }


  return page;

}


postEditorPreviewPages
  ?.addEventListener(
    "pointerdown",
    event => {

      if (!previewBackgroundMoveMode) {
        return;
      }


      const page =
        previewBackgroundPageAt(
          event.target
        );


      if (!page) {
        return;
      }


      const wrapper =
        page.querySelector(
          `.${POST_BACKGROUND_WRAPPER_CLASS}`
        );


      const drawnWidth =
        Number(
          wrapper.dataset.drawnWidth
        ) ||
        0;


      const drawnHeight =
        Number(
          wrapper.dataset.drawnHeight
        ) ||
        0;


      if (
        drawnWidth <= 0 ||
        drawnHeight <= 0
      ) {
        return;
      }


      /*
        화면에 보이는 배율. 페이지 폭은 레이아웃상 항상 정수
        (520px)이므로 rect.width / offsetWidth가 지금 걸려 있는
        배율이다(posts-page-layout.js의 같은 계산과 동일한 근거).
      */

      const rect =
        page.getBoundingClientRect();


      const scale =
        page.offsetWidth > 0
          ? rect.width / page.offsetWidth
          : 1;


      const background =
        currentPreviewBackground();


      const index =
        Number(
          page.dataset.pageIndex
        ) ||
        0;


      const perPage =
        previewBackgroundPageFocus[
          String(index)
        ];


      previewBackgroundDrag =
        {

          pointerId:
            event.pointerId,

          index,

          scale:
            scale || 1,

          drawnWidth,

          drawnHeight,

          startX:
            event.clientX,

          startY:
            event.clientY,

          focusX:
            perPage?.focusX ??
            background.focusX,

          focusY:
            perPage?.focusY ??
            background.focusY

        };


      /*
        포인터 붙잡기는 있으면 좋고 없어도 되는 장치다 — 브라우저에
        따라(또는 합성 이벤트에서) "그런 포인터 없음"으로 던질 수
        있는데, 그 예외 때문에 끌기 자체가 멈추면 안 된다.
      */

      try {

        postEditorPreviewPages.setPointerCapture?.(
          event.pointerId
        );

      }

      catch (captureError) {

        /* 붙잡지 못해도 pointermove는 계속 온다 */

      }


      event.preventDefault();

      event.stopPropagation();

    }
  );


postEditorPreviewPages
  ?.addEventListener(
    "pointermove",
    event => {

      if (
        !previewBackgroundDrag ||
        event.pointerId !==
          previewBackgroundDrag.pointerId
      ) {
        return;
      }


      const drag =
        previewBackgroundDrag;


      /*
        손가락이 옮긴 화면 거리를 레이아웃 픽셀로 되돌리고
        (표시 배율로 나눔), 그만큼 이미지가 따라오도록 중심을
        반대로 민다 — 포인터와 그림이 1:1로 움직인다.
      */

      const dx =
        (
          event.clientX -
          drag.startX
        ) / drag.scale;


      const dy =
        (
          event.clientY -
          drag.startY
        ) / drag.scale;


      const focusX =
        drag.focusX -
        dx / drag.drawnWidth;


      const focusY =
        drag.focusY -
        dy / drag.drawnHeight;


      /*
        1쪽은 기본 구도, 2쪽 이후는 그 장만의 보정.
      */

      if (
        drag.index === 0
      ) {

        previewBackgroundFocusX =
          focusX;


        previewBackgroundFocusY =
          focusY;

      }

      else {

        previewBackgroundPageFocus[
          String(drag.index)
        ] =
          {
            focusX,
            focusY
          };

      }


      renderEditorPreviewPages(
        {
          preserveView: true
        }
      );


      event.preventDefault();

    }
  );


[
  "pointerup",
  "pointercancel"
].forEach(
  type => {

    postEditorPreviewPages
      ?.addEventListener(
        type,
        event => {

          if (
            !previewBackgroundDrag ||
            event.pointerId !==
              previewBackgroundDrag.pointerId
          ) {
            return;
          }


          previewBackgroundDrag =
            null;


          syncPreviewBackgroundControls();

        }
      );

  }
);


/*
  본문이 바뀌어 장 수가 줄면, 없어진 장의 보정은 버린다.
  renderEditorPreviewPages가 페이지를 다 만든 뒤에 부른다.
*/

function prunePreviewBackgroundPageFocus(
  pageCount
) {

  Object.keys(
    previewBackgroundPageFocus
  )
    .forEach(
      key => {

        if (
          Number(key) >=
          pageCount
        ) {

          delete previewBackgroundPageFocus[key];

        }

      }
    );

}



/* =========================================================
   출처 강조선 (세션 한정)
========================================================== */

postEditorPreviewSourceRuleToggle
  ?.addEventListener(
    "click",
    () => {

      const resolved =
        normalizePostStyleSettings(
          postStyleSettings ||
          {}
        );


      const current =
        previewSourceRuleEnabled ??
        resolved.sourceRuleEnabled;


      previewSourceRuleEnabled =
        !current;


      syncPreviewBackgroundControls();


      updateEditorPreview();

    }
  );


/*
  ★ 출처 강조선의 색 팝오버는 없앴다 (요구사항 7).

  이 발췌 설정에서는 강조선을 켜고 끄기만 하고, 색은 Quote
  Preset의 SOURCE 값을 그대로 따른다 — 같은 색을 두 자리에서
  고칠 수 있으면 어느 쪽이 이겼는지 알기 어렵다.

  previewSourceRuleColor 변수 자체는 남겨 둔다: null이면 "프리셋
  색을 따른다"는 뜻이고, resolveEditorPreviewView가 그 규칙으로
  읽는다(posts/preview/posts-preview.js).

  ★ 본문 툴바의 H/P/L 색 견본은 그대로다 — 다른 컨트롤이다
  (posts/editor/posts-highlight-toolbar.js).
*/
