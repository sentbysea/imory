/* =========================================================
   POSTS - HIGHLIGHT / TOOLBAR / MOBILE FLOATING MENU

   posts.js 분할본. DOM 참조/상태는 posts-refs.js에 있음
   (반드시 먼저 로드돼야 함).

   내용: 글꼴 토글 버튼, 페이지 나누기 버튼, 프리뷰 페이지
   이동, 프리셋/커스텀 하이라이트, 모바일에서 텍스트
   선택 시 뜨는 플로팅 하이라이트 메뉴(위치 계산 포함).
========================================================== */


/* =========================================================
   FONT BUTTON
========================================================== */

postEditorFontToggle
  ?.addEventListener(
    "click",
    () => {

      toggleEditorFont();

    }
  );

/* =========================================================
   BOLD / ITALIC / UNDERLINE / STRIKETHROUGH
========================================================== */

postEditorBoldToggle
  ?.addEventListener(
    "click",
    () => {

      toggleEditorBold();

    }
  );


postEditorItalicToggle
  ?.addEventListener(
    "click",
    () => {

      toggleEditorItalic();

    }
  );


postEditorUnderlineToggle
  ?.addEventListener(
    "click",
    () => {

      toggleEditorUnderline();

    }
  );


postEditorStrikeToggle
  ?.addEventListener(
    "click",
    () => {

      toggleEditorStrike();

    }
  );

/* =========================================================
   PAGE BREAK
========================================================== */

bindImoryTapButton(
  postEditorPageBreak,
  {

    onDown:
      () => {

        captureEditorCaretBeforeToolbar();

      },

    onFire:
      () => {

        insertEditorPageBreak();

      }

  }
);

  /* =========================================================
   PREVIEW PAGE NAV
========================================================== */

postEditorPreviewPrev
  ?.addEventListener(
    "click",
    () => {

      showEditorPreviewPage(
        editorPreviewPageIndex - 1,
        {
          resetZoom: false
        }
      );

    }
  );


postEditorPreviewNext
  ?.addEventListener(
    "click",
    () => {

      showEditorPreviewPage(
        editorPreviewPageIndex + 1,
        {
          resetZoom: false
        }
      );

    }
  );

/* =========================================================
   색 컨트롤 (HIGHLIGHT · POINT COLOR · 강조선)

   ★ 세 컨트롤이 **완전히 같은 방식**으로 동작한다(요구사항 1).

     1. pointerdown에서 기본 동작을 막고 지금 선택을 붙잡는다.
        버튼이 포커스를 훔치지 않으므로 본문 선택이 그대로 남는다.
     2. click에서 우리가 그리는 컬러피커 팝오버를 연다
        (posts/editor/posts-color-picker.js).
     3. 팝오버가 열리는 순간 undo 스냅샷을 **한 번만** 찍는다.
        드래그하는 동안의 색 변화는 전부 live 모드라 스냅샷을
        더 쌓지 않는다 — 확정 한 번이 undo 한 칸이다.
     4. Apply  지금 색으로 확정.
        Cancel / 바깥 클릭 / Escape  → 열기 전 상태로 되돌린다
        (방금 찍은 스냅샷을 되감고 그 칸도 없앤다 — undo 기록에
        흔적이 남지 않는다).
        remove  선택 범위에서 그 서식만 걷어낸다(다른 서식은
        그대로). 이건 되돌릴 수 있는 변경이라 스냅샷을 남긴다.
========================================================== */

/*
  스냅샷 하나를 되감고 그 칸도 없앤다 — "취소"는 undo 기록에
  아무 흔적을 남기지 않아야 한다.
*/

function revertEditorToLastSnapshot() {

  if (
    !postEditorContent ||
    editorUndoStack.length === 0
  ) {
    return;
  }


  postEditorContent.innerHTML =
    editorUndoStack.pop();


  /*
    본문을 통째로 갈아끼웠다 — 진행 중이던 조정이 기억해 둔
    span/마커는 전부 버려진 노드다. 세션을 비워서 다음 색이
    안전한 전체 경로로 가게 한다.
  */

  if (
    typeof endEditorInlineColorSession === "function"
  ) {

    endEditorInlineColorSession();

  }


  if (
    typeof endEditorParagraphRuleSession === "function"
  ) {

    endEditorParagraphRuleSession();

  }


  savedEditorRange =
    null;


  syncEditorUndoButtonState();


  if (
    typeof syncEditorHighlightHeight === "function"
  ) {

    syncEditorHighlightHeight();

  }


  if (
    typeof syncEditorRuleOverlay === "function"
  ) {

    syncEditorRuleOverlay();

  }


  updateEditorPreview();

  updateEditorToolbarState();

}


/*
  컬러피커 하나를 여는 공통 경로.

    apply(color, live)   색을 실제로 바르는 함수
    remove()             그 서식만 걷어내는 함수(없으면 remove 버튼 숨김)
    current()            지금 색
    preset()             프리셋 기본값(스와치 맨 앞에 고정)
    remember(color)      확정된 색을 툴바 스와치에 반영
    requireSelection     텍스트 선택이 반드시 있어야 하는가
*/

function openEditorFormatColorPicker(
  anchor,
  options
) {

  if (!postEditorContent) {
    return;
  }


  if (
    options.requireSelection &&
    (
      !savedEditorRange ||
      savedEditorRange.collapsed
    )
  ) {

    showPostEditorMessage(
      "스타일을 적용할 텍스트를 선택해주세요."
    );


    return;

  }


  pushEditorUndoSnapshot(
    true
  );


  /*
    여기부터 창이 닫힐 때까지가 **한 번의 조정**이다. 첫 색만
    본문 구조를 바꾸고, 그 뒤로는 만들어 둔 자리의 색만 갈아끼운다
    (posts/editor/format/posts-editor-highlight.js §live).
  */

  beginEditorInlineColorSession();


  /*
    강조선 쪽 세션도 여기서 비운다 — 지난번에 조정하던 문단의
    마커가 남아 있으면 이번에 고른 문단이 아니라 그 문단의 색이
    바뀐다.
  */

  endEditorParagraphRuleSession();


  const finishColorSession =
    () => {

      endEditorInlineColorSession();


      endEditorParagraphRuleSession();

    };


  /*
    ★ 기본(OS) 색상 선택기 경로

    손가락이 주 입력인 기기에서는 아이폰이 띄우는 기본 피커를
    쓴다(posts/editor/posts-color-picker.js). 창이 열리면 포커스와
    선택이 그쪽으로 가므로, **아직 선택이 살아 있는 지금** 지금
    색을 한 번 발라 자리를 만들어 둔다. 그 뒤의 색 변화는 그
    자리의 색만 바꾸므로 본문도 선택도 건드리지 않는다.

    기본 피커에는 Cancel이 없다 — 되돌리는 길은 Undo 한 번이고,
    방금 찍은 스냅샷 하나가 정확히 그 한 칸이다.
  */

  if (
    typeof imoryColorPickerMode === "function" &&
    imoryColorPickerMode() === "native"
  ) {

    const startColor =
      options.current();


    options.remember?.(
      startColor
    );


    const seeded =
      options.apply(
        startColor,
        true
      );


    /*
      바를 자리가 없으면(강조선인데 문단을 못 찾는 등) 스냅샷을
      도로 걷어내고 아무 일도 없던 것으로 둔다.
    */

    if (seeded === false) {

      editorUndoStack.pop();


      syncEditorUndoButtonState();


      finishColorSession();


      return;

    }


    const opened =
      openImoryNativeColorPicker(
        {

          anchor,

          color:
            startColor,

          onPreview:
            color => {

              options.remember?.(
                color
              );


              options.apply(
                color,
                true
              );

            },

          onApply:
            color => {

              options.remember?.(
                color
              );


              options.apply(
                color,
                true
              );


              finishColorSession();

            }

        }
      );


    if (opened) {

      return;

    }


    /*
      기본 피커를 열지 못했으면 커스텀 팝오버로 이어간다 —
      씨앗은 이미 발라 뒀으므로 아래 세션이 그 자리를 그대로
      이어받는다.
    */

  }


  openImoryColorPicker(
    {

      anchor,

      color:
        options.current(),

      presetColor:
        options.preset(),

      removeLabel:
        options.removeLabel,

      onPreview:
        color => {

          options.remember?.(
            color
          );


          options.apply(
            color,
            true
          );

        },

      onApply:
        color => {

          options.remember?.(
            color
          );


          options.apply(
            color,
            true
          );


          finishColorSession();

        },

      onCancel:
        () => {

          revertEditorToLastSnapshot();


          finishColorSession();

        },

      onRemove:
        options.remove
          ? () => {

              finishColorSession();


              options.remove();

            }
          : null

    }
  );

}


/*
  pointerdown에서 기본 동작을 막아 본문 선택을 지킨다.
*/

function bindEditorColorControl(
  control,
  options
) {

  /*
    ★ pointerdown에서 preventDefault를 걸어 본문 선택을 지키되,
    실행은 pointerup으로 한다 — WebKit은 터치에서 그
    preventDefault 뒤에 click을 만들지 않는다(공용 헬퍼의 머리말에
    실측표가 있다: posts/editor/posts-color-picker.js).
  */

  bindImoryTapButton(
    control,
    {

      onDown:
        () => {

          if (
            options.requireSelection
          ) {

            captureEditorSelectionBeforeToolbar();

          }

          else {

            captureEditorCaretBeforeToolbar();

          }

        },

      onFire:
        () => {

          openEditorFormatColorPicker(
            control,
            options
          );

        }

    }
  );

}


const EDITOR_HIGHLIGHT_PICKER_OPTIONS =
  {

    requireSelection: true,

    current:
      () =>
        getEditorHighlightColor(),

    preset:
      () =>
        getPresetHighlightColor(),

    remember:
      color => {

        setEditorHighlightColor(
          color
        );

      },

    apply:
      (color, live) => {

        applyEditorHighlight(
          color,
          live
        );

      },

    remove:
      () => {

        removeEditorInlineColor(
          "post-inline-highlight",
          true
        );

      },

    removeLabel:
      "clear"

  };


const EDITOR_POINT_PICKER_OPTIONS =
  {

    requireSelection: true,

    current:
      () =>
        getEditorPointColor(),

    preset:
      () =>
        getPresetPointColor(),

    remember:
      color => {

        setEditorPointColor(
          color
        );

      },

    apply:
      (color, live) => {

        applyEditorPointColor(
          color,
          live
        );

      },

    remove:
      () => {

        removeEditorInlineColor(
          "post-inline-color",
          true
        );

      },

    removeLabel:
      "clear"

  };


/*
  ★ 강조선은 문단 단위라 텍스트 선택이 없어도(캐럿만 있어도)
  동작한다 — requireSelection이 false인 이유.
*/

const EDITOR_RULE_PICKER_OPTIONS =
  {

    requireSelection: false,

    current:
      () =>
        currentEditorParagraphRuleColor(),

    preset:
      () =>
        getPresetRuleColor(),

    remember:
      () => {

        updateEditorRuleSwatch();

      },

    apply:
      (color, live) => {

        applyEditorParagraphRule(
          color,
          live
        );

      },

    remove:
      () => {

        removeEditorParagraphRule(
          true
        );

      },

    removeLabel:
      "remove"

  };


bindEditorColorControl(
  postEditorCustomControl,
  EDITOR_HIGHLIGHT_PICKER_OPTIONS
);


bindEditorColorControl(
  postEditorCustomPointControl,
  EDITOR_POINT_PICKER_OPTIONS
);


bindEditorColorControl(
  postEditorRuleControl,
  EDITOR_RULE_PICKER_OPTIONS
);


/* =========================================================
   RULE 켜고 끄기 (색 팝오버 없이 바로)
========================================================== */

bindImoryTapButton(
  postEditorRuleToggle,
  {

    onDown:
      () => {

        captureEditorCaretBeforeToolbar();

      },

    onFire:
      () => {

        toggleEditorParagraphRule();

      }

  }
);



/* =========================================================
   FLOATING HIGHLIGHT / POINT COLOR 메뉴

   본문에서 텍스트를 선택하면(데스크톱 드래그, 모바일
   롱프레스 둘 다) 위에 있는 고정 툴바까지 갈 필요 없이
   선택 영역 바로 옆에 하이라이트/포인트 컬러 버튼이 뜨게
   한다. 고정 툴바는 그대로 유지(둘 다 사용 가능) — 트위터
   등에서 텍스트 선택 시 뜨는 볼드/이탤릭 팝업과 같은 패턴.
========================================================== */

/*
  ★ 이전 수정(scroll → rAF로 묶어서 재계산)만으로는 iOS
  Safari에서 여전히 어긋났다 — iOS는 손가락을 뗀 뒤 관성으로
  미끄러지는 동안(momentum scroll)에는 'scroll' 이벤트 자체를
  거의 안 보내거나 스크롤이 다 끝난 뒤에야 몰아서 보낸다.
  즉 "이벤트가 오면 rAF로 한 번 계산" 방식은 애초에 그 이벤트가
  안 오는 구간에서는 아무것도 안 하니 메뉴가 그 자리에 멈춰
  있다가 스크롤이 끝나야 툭 하고 따라잡는 것처럼 보인다.

  그래서 메뉴가 "떠 있는 동안"만은 scroll 이벤트를 기다리지
  않고 매 프레임(rAF)마다 직접 위치를 다시 잰다 — 이벤트가
  오든 안 오든 화면에 보이는 한 항상 최신 좌표를 따라간다.
  메뉴가 꺼지면(hideEditorFloatingMenu) 루프도 같이 멈춰서
  안 보일 때 매 프레임 계산하는 낭비는 없다.
*/

let editorFloatingMenuTracking =
  false;


function stopEditorFloatingMenuTracking() {

  editorFloatingMenuTracking =
    false;

}


function trackEditorFloatingMenuFrame() {

  if (
    !editorFloatingMenuTracking
  ) {
    return;
  }


  syncEditorFloatingMenu();


  if (
    editorFloatingMenuTracking
  ) {

    requestAnimationFrame(
      trackEditorFloatingMenuFrame
    );

  }

}


function startEditorFloatingMenuTracking() {

  if (
    editorFloatingMenuTracking
  ) {
    return;
  }


  editorFloatingMenuTracking =
    true;


  requestAnimationFrame(
    trackEditorFloatingMenuFrame
  );

}


function hideEditorFloatingMenu() {

  stopEditorFloatingMenuTracking();


  if (postEditorFloatingMenu) {

    postEditorFloatingMenu.hidden =
      true;

  }

}


function positionEditorFloatingMenu(
  rect
) {

  if (!postEditorFloatingMenu) {
    return;
  }


  postEditorFloatingMenu.hidden =
    false;


  startEditorFloatingMenuTracking();


  const menuRect =
    postEditorFloatingMenu.getBoundingClientRect();


  const gap =
    8;


  /*
    모바일(iPhone Safari 등)에서는 텍스트를 선택하면 브라우저
    자체 복사/붙여넣기 팝업이 선택 영역 "위"에 뜬다. 우리
    하이라이트 메뉴도 위에 띄우면 그 팝업이랑 겹쳐서 손가락이
    닿기도 힘들고 두 메뉴가 서로 가려버림 — 그래서 모바일은
    커서(선택 영역) 아래쪽을 우선으로 하고, 화면 아래로
    넘칠 때만 위로 뒤집는다. 데스크톱은 기존처럼 위가 기본.
  */

  const preferBelow =
    isMobilePostEditor();


  let top =
    preferBelow
      ? rect.bottom +
        gap
      : rect.top -
        menuRect.height -
        gap;


  const overflowsBottom =
    top +
      menuRect.height >
    window.innerHeight -
      gap;


  const overflowsTop =
    top < gap;


  if (
    preferBelow &&
    overflowsBottom
  ) {

    top =
      rect.top -
      menuRect.height -
      gap;

  }

  else if (
    !preferBelow &&
    overflowsTop
  ) {

    top =
      rect.bottom +
      gap;

  }


  let left =
    rect.left +
    rect.width / 2 -
    menuRect.width / 2;


  left =
    Math.max(
      gap,
      Math.min(
        left,
        window.innerWidth -
          menuRect.width -
          gap
      )
    );


  /*
    ★ iOS Safari에서 키보드가 떠 있는 동안 position:fixed
    요소는 레이아웃 뷰포트(주소창/키보드까지 포함한, 실제로는
    안 보이는 영역까지 포함한 전체 기준) 좌표로 그려지는데,
    getBoundingClientRect()/window.innerWidth/Height는 시각
    뷰포트(실제로 화면에 보이는 영역) 기준이라 서로 어긋난다.
    평소엔 둘이 거의 같아서 안 보이던 오차가, 스크롤/키보드
    상태가 바뀔 때마다 visualViewport의 offset이 달라지면서
    메뉴가 화면 위에서 위치를 못 잡고 흔들리듯 움직이는
    것처럼 보였다. offsetLeft/offsetTop만큼 보정해주면
    시각 뷰포트 기준으로 맞아떨어진다.
  */

  const viewport =
    window.visualViewport;


  const viewportOffsetLeft =
    viewport?.offsetLeft ||
    0;


  const viewportOffsetTop =
    viewport?.offsetTop ||
    0;


  postEditorFloatingMenu.style.top =
    `${top + viewportOffsetTop}px`;


  postEditorFloatingMenu.style.left =
    `${left + viewportOffsetLeft}px`;

}


function syncEditorFloatingMenu() {

  if (
    !postEditorFloatingMenu
  ) {

    hideEditorFloatingMenu();

    return;

  }


  const selection =
    window.getSelection();


  if (
    !selection ||
    selection.isCollapsed ||
    selection.rangeCount === 0
  ) {

    hideEditorFloatingMenu();

    return;

  }


  const range =
    selection.getRangeAt(0);


  if (
    !nodeIsInsideEditor(
      range.commonAncestorContainer
    )
  ) {

    hideEditorFloatingMenu();

    return;

  }


  const rect =
    range.getBoundingClientRect();


  if (
    rect.width === 0 &&
    rect.height === 0
  ) {

    hideEditorFloatingMenu();

    return;

  }


  /*
    ★ postEditorContent는 자기 안에서 스크롤되는 상자
    (overflow-y:auto)라, 선택 영역이 그 상자의 스크롤로
    안 보이게 밀려 올라가도(overflow로 잘렸을 뿐) getBoundingClientRect
    는 여전히 "원래 있어야 할" 화면 좌표를 그대로 돌려준다
    — 그대로 두면 메뉴가 상자 바깥(예: 위쪽 CATEGORY 영역)에
    뜬금없이 떠서 지금 화면에 보이는 글자와 상관없어 보인다.
    선택 영역이 상자의 실제로 보이는 세로 범위를 벗어났으면
    숨긴다.
  */

  if (postEditorContent) {

    const editorRect =
      postEditorContent.getBoundingClientRect();


    const rectMiddle =
      (
        rect.top +
        rect.bottom
      ) / 2;


    if (
      rectMiddle <
        editorRect.top ||
      rectMiddle >
        editorRect.bottom
    ) {

      hideEditorFloatingMenu();

      return;

    }

  }


  positionEditorFloatingMenu(
    rect
  );

}


/*
  ★ iOS Safari는 스크롤 중 화면 이동을 컴포지터(별도 스레드)가
  담당하고, position:fixed 메뉴의 top/left를 다시 쓰는 이 JS는
  메인 스레드에서 돈다 — scroll 이벤트가 뜰 때마다 매번 동기적으로
  getBoundingClientRect()를 여러 번 읽고 style을 즉시 고쳐 쓰면,
  한 프레임 안에 여러 번 실행되면서(레이아웃 스래싱) 메인
  스레드가 밀려 컴포지터가 이미 옮겨놓은 화면과 메뉴 위치가
  한두 프레임씩 어긋나 보인다(스크롤 중 메뉴가 선택 영역을
  따라오지 못하고 겉도는 것처럼 보이는 원인).

  그래서 scroll/visualViewport/resize처럼 짧은 시간에 여러 번
  뜰 수 있는 이벤트는 즉시 계산하지 않고 rAF 한 틱에 한 번만
  묶어서(다음 페인트 직전에) 재계산한다. selectionchange도
  같은 스케줄러를 타게 해서, 같은 프레임에 여러 이벤트가
  겹쳐도 레이아웃 계산이 한 번만 일어나게 한다.
*/

let editorFloatingMenuSyncScheduled =
  false;


function scheduleEditorFloatingMenuSync() {

  if (
    editorFloatingMenuSyncScheduled
  ) {
    return;
  }


  editorFloatingMenuSyncScheduled =
    true;


  requestAnimationFrame(
    () => {

      editorFloatingMenuSyncScheduled =
        false;

      syncEditorFloatingMenu();

    }
  );

}


document.addEventListener(
  "selectionchange",
  scheduleEditorFloatingMenuSync
);


/*
  ★ 스크롤해도 그냥 숨기지 않고 다시 위치를 계산한다.
  전에는 스크롤하면 메뉴를 숨기기만 했는데, 선택 자체는
  그대로 유지되니(selectionchange가 다시 안 뜸) 메뉴가
  스크롤 전 화면 좌표에 그대로 남아 있다가 — 아래로
  스크롤할수록 실제 선택 영역과는 점점 멀어져 보였다.

  scroll 이벤트는 버블링은 안 해도 캡처링은 하기 때문에,
  window에 capture:true로 하나만 걸어두면 postEditorContent
  내부 스크롤이든 postArea든 페이지 자체 스크롤이든 전부
  여기서 다 잡혀서 선택 영역을 계속 따라다니게 된다. passive:true는
  이 리스너가 스크롤 자체를 막지 않는다는 걸 브라우저에 미리
  알려서, 스크롤 중 메인 스레드 대기를 줄여준다.
*/

window.addEventListener(
  "scroll",
  scheduleEditorFloatingMenuSync,
  {
    capture: true,
    passive: true
  }
);


/*
  ★ 온스크린 키보드가 열리고 닫힐 때(모바일 iOS Safari)는
  일반 scroll 이벤트가 안 뜨고 visualViewport의 크기/오프셋만
  바뀐다 — 이것도 같이 들어야 메뉴가 키보드가 뜨는 순간에도
  바로 올바른 위치로 다시 계산된다.
*/

window.visualViewport
  ?.addEventListener(
    "resize",
    scheduleEditorFloatingMenuSync
  );


window.visualViewport
  ?.addEventListener(
    "scroll",
    scheduleEditorFloatingMenuSync
  );


/*
  ★ 화면 회전/데스크톱 창 크기 변경도 선택 영역의 화면 좌표를
  바꾼다. visualViewport resize가 대부분의 모바일 케이스를
  잡아주지만, visualViewport를 지원하지 않는 환경 대비로
  window resize도 같이 건다.
*/

window.addEventListener(
  "resize",
  scheduleEditorFloatingMenuSync
);


/*
  모바일 플로팅 메뉴도 위 툴바와 **같은 컨트롤**을 쓴다 —
  같은 팝오버, 같은 undo 규칙.
*/

bindEditorColorControl(
  postEditorFloatingCustomControl,
  EDITOR_HIGHLIGHT_PICKER_OPTIONS
);


bindEditorColorControl(
  postEditorFloatingCustomPointControl,
  EDITOR_POINT_PICKER_OPTIONS
);


bindEditorColorControl(
  postEditorFloatingRuleControl,
  EDITOR_RULE_PICKER_OPTIONS
);



