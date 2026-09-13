/* =========================================================
   POSTS VIEW — 메모 카드 도구 (⋮ · 메뉴 · 메모 팝업 · 토스트)

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §6

   한 벌의 UI를 **두 곳**이 쓴다.

     공개 화면   posts/view/posts-view-memos.js (메모 카테고리)
                 posts/view/posts-view-highlight-mode.js (말풍선의 메모)
     Studio      studio/preview/preview-memo-tools.js (메모 화면 미리보기)

   Studio Preview에서 카드의 ⋮가 자리만 차지하고 아무것도 열리지
   않으면, 편집자는 자기가 만든 스킨에서 그 메뉴와 메모 팝업이 실제로
   어떻게 보이는지 확인할 수 없다. 그렇다고 같은 화면을 Preview용으로
   한 벌 더 만들면 둘이 서서히 어긋난다 — 그래서 **모양을 만드는 쪽**을
   여기 한 파일로 모으고, **데이터를 건드리는 쪽**만 주입받는다.

   ── 주입받는 것 (handlers) ──────────────────────────────
     saveNote(card, text)     -> { ok, notice? }
     deleteNote(card)         -> { ok, notice? }
     deleteHighlight(card)    -> { ok, notice? }

   notice를 돌려주면 그 문구를 대신 띄운다 — Preview가 "미리보기에서는
   저장되지 않습니다"라고 말할 수 있는 자리이고, 공개 화면은 아무것도
   돌려주지 않아 기본 문구가 나간다. 어느 쪽이든 **실패를 성공처럼
   보여주지 않는다**: ok가 false면 실패 문구가 나가고 메모 팝업은
   쓴 내용을 그대로 남긴 채 닫히지 않는다(요구사항 5).

   ── 의존 ────────────────────────────────────────────────
   posts/view/posts-view-popover.js (openImoryPopover /
   renderImoryPopoverMenu / imoryPopoverRectOf / closeImoryPopover)
   하나뿐이다. supabase도, 이 사이트의 라우팅도 쓰지 않는다 —
   그래야 Studio Preview 문서(iframe)에 그대로 실을 수 있다.

   classic script.
========================================================== */


/* 색을 못 받았을 때의 기본값(본문 강조 서식과 같은 계열) */

const MEMO_CARD_DEFAULT_COLOR =
  "#f6e0c8";



/* =========================================================
   토스트 — 성공/실패를 구분해 알린다

   예전에는 posts-view-tools-menu.js에 있었다. 그 파일은 글 뷰어의
   ⋮ 버튼(전역 const)과 라우팅에 묶여 있어 Preview에 실을 수 없는데,
   토스트 자체는 의존이 하나도 없다 — 그래서 이쪽으로 옮겼다.

   action = { label, onSelect } 을 주면 문구 오른쪽에 버튼 하나가
   붙는다("다시 시도"처럼 실패를 되돌릴 방법이 있을 때만). 버튼이
   있으면 더 오래 남는다 — 읽고 누를 시간이 필요하다.
========================================================== */

let postViewerToastTimer =
  0;


function showPostViewerToast(
  message,
  tone,
  action
) {

  let toast =
    document.getElementById(
      "postViewerToast"
    );


  if (!toast) {

    toast =
      document.createElement("div");


    toast.id =
      "postViewerToast";


    toast.className =
      "post-viewer-toast";


    toast.setAttribute(
      "role",
      "status"
    );


    toast.setAttribute(
      "data-post-hl-ui",
      "1"
    );


    document.body.appendChild(toast);

  }


  toast.textContent =
    message;


  toast.removeAttribute(
    "data-has-action"
  );


  if (
    action &&
    action.label &&
    typeof action.onSelect === "function"
  ) {

    toast.setAttribute(
      "data-has-action",
      "1"
    );


    const button =
      document.createElement("button");


    button.type =
      "button";


    button.className =
      "post-viewer-toast-action";


    button.textContent =
      action.label;


    button.addEventListener(
      "click",
      () => {

        toast.classList.remove(
          "is-visible"
        );


        action.onSelect();

      }
    );


    toast.appendChild(button);

  }


  toast.setAttribute(
    "data-tone",
    tone ||
    "ok"
  );


  toast.classList.add(
    "is-visible"
  );


  window.clearTimeout(
    postViewerToastTimer
  );


  postViewerToastTimer =
    window.setTimeout(
      () => {

        toast.classList.remove(
          "is-visible"
        );

      },
      action
        ? 6000
        : 2200
    );

}



/* =========================================================
   메모 작성 팝업 (요구사항 6)

     위쪽  선택한 발췌문
     아래쪽 메모 입력 textarea
     오른쪽 아래 SAVE

   기존 메모가 있으면 그 내용을 불러온다. 저장에 실패하면 쓴 내용을
   그대로 남긴다 — 팝업을 닫지 않는다.

   options
     onSave(item, text) -> { ok, notice? }   필수(없으면 SAVE가 없다)
     onSaved(text)                           저장이 끝난 뒤
     notice                                  패널 위에 항상 띄울 한 줄
========================================================== */

let postMemoPopupRoot =
  null;


let postMemoPopupSession =
  null;


function openPostMemoPopup(
  item,
  options = {}
) {

  closeImoryPopover({
    silent: true
  });


  closePostMemoPopup({
    silent: true
  });


  const overlay =
    document.createElement("div");


  overlay.className =
    "post-memo-popup";


  overlay.setAttribute(
    "data-post-hl-ui",
    "1"
  );


  const panel =
    document.createElement("div");


  panel.className =
    "post-memo-popup-panel";


  panel.setAttribute(
    "role",
    "dialog"
  );


  panel.setAttribute(
    "aria-label",
    "메모"
  );


  /*
    Preview처럼 "이 화면의 조작은 저장되지 않는다"를 미리 말해 둬야
    하는 경우에만 붙는 줄. 공개 화면에서는 없다.
  */

  if (options.notice) {

    const notice =
      document.createElement("p");


    notice.className =
      "post-memo-popup-notice";


    notice.textContent =
      options.notice;


    panel.appendChild(notice);

  }


  const excerpt =
    document.createElement("blockquote");


  excerpt.className =
    "post-memo-popup-excerpt";


  excerpt.style.borderLeftColor =
    item.color ||
    MEMO_CARD_DEFAULT_COLOR;


  excerpt.textContent =
    item.excerpt;


  const field =
    document.createElement("textarea");


  field.className =
    "post-memo-popup-field";


  field.placeholder =
    "메모";


  field.value =
    item.note ||
    "";


  field.setAttribute(
    "data-popover-focus",
    "1"
  );


  const footer =
    document.createElement("div");


  footer.className =
    "post-memo-popup-footer";


  const status =
    document.createElement("span");


  status.className =
    "post-memo-popup-status";


  const cancel =
    document.createElement("button");


  cancel.type =
    "button";


  cancel.className =
    "post-memo-popup-cancel";


  cancel.textContent =
    "취소";


  const save =
    document.createElement("button");


  save.type =
    "button";


  save.className =
    "post-memo-popup-save";


  save.textContent =
    "SAVE";


  footer.appendChild(status);

  footer.appendChild(cancel);

  footer.appendChild(save);


  panel.appendChild(excerpt);

  panel.appendChild(field);

  panel.appendChild(footer);


  overlay.appendChild(panel);


  document.body.appendChild(overlay);


  postMemoPopupRoot =
    overlay;


  postMemoPopupSession =
    {
      id:
        item.id,

      onSaved:
        options.onSaved ||
        null
    };


  cancel.addEventListener(
    "click",
    () => {

      closePostMemoPopup();

    }
  );


  overlay.addEventListener(
    "pointerdown",
    (event) => {

      if (event.target === overlay) {

        closePostMemoPopup();

      }

    }
  );


  overlay.addEventListener(
    "keydown",
    (event) => {

      if (event.key === "Escape") {

        event.preventDefault();


        closePostMemoPopup();

      }

    }
  );


  /*
    모바일 키보드가 올라와도 입력창과 SAVE에 닿아야 한다(요구사항 6).
    키보드가 열리면 visualViewport가 줄어드는데, 그때 패널을 화면 안으로
    다시 끌어온다.
  */

  field.addEventListener(
    "focus",
    () => {

      window.setTimeout(
        () => {

          try {

            panel.scrollIntoView({
              block: "nearest",

              behavior: "smooth"
            });

          }

          catch (err) {

            /* 무시 */

          }

        },
        200
      );

    }
  );


  save.addEventListener(
    "click",
    async () => {

      if (
        save.disabled ||
        typeof options.onSave !== "function"
      ) {

        return;

      }


      save.disabled =
        true;


      status.textContent =
        "저장 중...";


      status.setAttribute(
        "data-tone",
        "pending"
      );


      const result =
        await options.onSave(
          item,
          field.value
        );


      if (
        !result ||
        result.ok !== true
      ) {

        /* 쓴 내용을 그대로 남긴다 — 팝업을 닫지 않는다 */

        status.textContent =
          "저장하지 못했습니다";


        status.setAttribute(
          "data-tone",
          "error"
        );


        save.disabled =
          false;


        return;

      }


      const note =
        field.value.trim();


      item.note =
        note;


      postMemoPopupSession?.onSaved?.(note);


      closePostMemoPopup();


      showPostViewerToast(
        result.notice ||
        (
          note
            ? "메모를 저장했습니다"
            : "메모를 지웠습니다"
        ),
        "ok"
      );

    }
  );


  window.setTimeout(
    () => {

      try {

        field.focus({
          preventScroll: true
        });

      }

      catch (err) {

        field.focus();

      }

    },
    0
  );

}


function closePostMemoPopup(
  options = {}
) {

  if (postMemoPopupRoot) {

    postMemoPopupRoot.remove();


    postMemoPopupRoot =
      null;

  }


  postMemoPopupSession =
    null;


  void options;

}



/* =========================================================
   카드의 ⋮ 메뉴 (요구사항 6)

     메모 없음 → 메모 추가
     메모 있음 → 메모 수정 · 메모 삭제
     항상        하이라이트 삭제

   "메모 삭제"는 메모 글자만 지우고 하이라이트와 카드는 남긴다.
   "하이라이트 삭제"는 하이라이트와 카드를 함께 지운다 — 지우는
   범위를 확인 대화상자에서 분명히 알린다.
========================================================== */

function openMemoCardMenu(
  button,
  card,
  handlers = {}
) {

  if (isImoryPopoverOpen("memo-card")) {

    closeImoryPopover();


    return;

  }


  openImoryPopover({
    name:
      "memo-card",

    className:
      "imory-popover--menu",

    anchorRect:
      imoryPopoverRectOf(button),

    returnFocus:
      button,

    render:
      (body) => {

        const items =
          [];


        items.push({
          label:
            card.hasNote
              ? "메모 수정"
              : "메모 추가",

          onSelect:
            () => {

              openPostMemoPopup(
                {
                  id:
                    card.id,

                  excerpt:
                    card.excerpt,

                  note:
                    card.note,

                  color:
                    card.color
                },
                {
                  notice:
                    handlers.notice ||
                    "",

                  onSave:
                    (item, text) =>
                      handlers.saveNote?.(
                        card,
                        text
                      ) ??
                      {
                        ok: false
                      }
                }
              );

            }
        });


        if (card.hasNote) {

          items.push({
            label:
              "메모 삭제",

            hint:
              "카드는 남습니다",

            onSelect:
              async () => {

                const result =
                  await handlers.deleteNote?.(
                    card
                  );


                if (
                  !result ||
                  result.ok !== true
                ) {

                  showPostViewerToast(
                    "메모를 지우지 못했습니다",
                    "error"
                  );


                  return;

                }


                showPostViewerToast(
                  result.notice ||
                  "메모를 지웠습니다",
                  "ok"
                );

              }
          });

        }


        items.push(null);


        items.push({
          label:
            "하이라이트 삭제",

          danger:
            true,

          hint:
            card.hasNote
              ? "메모도 함께"
              : "",

          onSelect:
            async () => {

              const message =
                card.hasNote
                  ? "이 하이라이트와 메모 카드를 함께 지웁니다. 계속할까요?"
                  : "이 하이라이트를 지웁니다. 계속할까요?";


              if (!window.confirm(message)) {

                return;

              }


              const result =
                await handlers.deleteHighlight?.(
                  card
                );


              if (
                !result ||
                result.ok !== true
              ) {

                showPostViewerToast(
                  "삭제하지 못했습니다",
                  "error"
                );


                return;

              }


              showPostViewerToast(
                result.notice ||
                "지웠습니다",
                "ok"
              );

            }
        });


        renderImoryPopoverMenu(
          body,
          items
        );

      }
  });

}



/* =========================================================
   mountMemoCardTools({ regions, cards, canManage, handlers })

   스킨 HTML에는 <button>이 들어갈 수 없다(새니타이저가 지운다).
   그래서 주인장의 ⋮ 는 카드마다 하나씩 있는
   [data-imory-region="memo-tools"] 자리에 플랫폼이 넣는다. 그 자리는
   repeat 안에 있어 렌더러가 카드 id를 키로 찍어 두므로 DOM 순서가
   아니라 **키로** 카드와 짝지어진다.

   canManage가 false면 그 자리를 **비운다** — 방문자 화면과 같은
   상태다(빈 자리도 스킨이 그린 그대로 남는다).

     regions   renderSkin 인스턴스의 getRegions("memo-tools") 결과
     cards     Map<cardId, card>
========================================================== */

function mountMemoCardTools(
  options = {}
) {

  const regions =
    Array.isArray(options.regions)
      ? options.regions
      : [];


  const cards =
    options.cards instanceof Map
      ? options.cards
      : new Map();


  regions.forEach(
    (region) => {

      if (!region || !region.element) {

        return;

      }


      if (!options.canManage) {

        region.element.replaceChildren();


        return;

      }


      const card =
        cards.get(
          String(region.key)
        );


      if (!card) {

        return;

      }


      const button =
        document.createElement("button");


      button.type =
        "button";


      button.className =
        "memo-card-menu";


      button.textContent =
        "⋮";


      button.setAttribute(
        "aria-label",
        "메모 카드 도구"
      );


      button.setAttribute(
        "aria-haspopup",
        "menu"
      );


      button.addEventListener(
        "click",
        () => {

          openMemoCardMenu(
            button,
            card,
            options.handlers || {}
          );

        }
      );


      region.element.replaceChildren(button);

    }
  );

}
