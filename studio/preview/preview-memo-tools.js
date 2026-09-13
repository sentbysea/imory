/* =========================================================
   STUDIO PREVIEW — 메모 카드 도구 (HIGHLIGHT-1 후속)

   Preview의 메모 화면에서 카드의 ⋮ 를 **실제로 열리게** 한다.

   ── 왜 바꿨나 ───────────────────────────────────────────
   지금까지 Preview의 memo-tools region은 빈 자리였다(§11-6). 편집자
   입장에서는 자기 스킨에서 그 메뉴와 메모 팝업이 어떤 크기로, 카드의
   어느 자리에, 어떤 색으로 뜨는지 확인할 방법이 없었다 — 자리만
   차지하고 아무것도 열리지 않는 상태였다.

   ── 무엇을 보장하나 ─────────────────────────────────────
   1) 모양과 조작은 공개 화면과 **같은 코드**다
      (posts/view/posts-view-memo-card-tools.js를 이 문서도 읽는다).
      Preview용으로 비슷한 UI를 따로 만들지 않는다 — 그러면 둘이
      서서히 어긋난다.
   2) **아무것도 저장하지 않는다.** 여기서 넘기는 handlers는 supabase를
      전혀 부르지 않고, 화면의 카드 객체만 그 자리에서 고친다. 그리고
      매번 "미리보기에서는 저장되지 않습니다"라고 말한다 — 편집자가
      자기 실제 메모를 지웠다고 오해하지 않도록.
   3) 주인장/방문자 차이를 눈으로 볼 수 있다. Studio는 언제나 소유자
      세션이라 그 차이가 화면에 나타나지 않았는데, Preview 전용 칩
      하나로 전환한다. 방문자 상태에서는 그 자리가 **빈 채로** 남는다
      — 공개 화면에서 방문자가 보는 것과 같다.

   칩과 ⋮ 는 스킨 DOM 바깥/자리 안에만 들어가고, 스킨 마크업이나
   저장되는 SkinPackage에는 한 글자도 남지 않는다.

   의존(classic script, 이 파일보다 먼저 로드돼야 함):
   posts/view/posts-view-popover.js ·
   posts/view/posts-view-memo-card-tools.js.
========================================================== */


const PREVIEW_MEMO_VIEWER_CHIP_ID =
  "previewMemoViewerChip";


/* "owner" | "visitor" — 이 Preview 세션 동안만 유지된다 */

let previewMemoViewerMode =
  "owner";


let previewMemoLastMount =
  null;


const PREVIEW_MEMO_NOTICE =
  "미리보기에서는 저장되지 않습니다";


/* =========================================================
   mountPreviewMemoTools({ instance, context })

   preview-bridge가 렌더 직후 매번 부른다. 메모 화면이 아니면
   칩을 걷고 아무것도 하지 않는다.
========================================================== */

function mountPreviewMemoTools(
  options = {}
) {

  const context =
    options.context ||
    null;


  const isMemos =
    context?.page?.isMemos === true;


  if (
    !isMemos ||
    !options.instance
  ) {

    previewMemoLastMount =
      null;


    removePreviewMemoViewerChip();


    return;

  }


  previewMemoLastMount =
    {
      instance:
        options.instance,

      context
    };


  renderPreviewMemoViewerChip();


  applyPreviewMemoTools();

}


function applyPreviewMemoTools() {

  if (
    !previewMemoLastMount ||
    typeof mountMemoCardTools !== "function"
  ) {

    return;

  }


  const {
    instance,
    context
  } =
    previewMemoLastMount;


  const cards =
    new Map(
      (context?.memos?.cards || []).map(
        (card) =>
          [String(card.id), card]
      )
    );


  const regions =
    typeof instance.getRegions === "function"
      ? instance.getRegions("memo-tools")
      : [];


  mountMemoCardTools({
    regions,

    cards,

    /*
      공개 화면에서는 memos.canManage(=주인장인가)가 정한다.
      Preview는 언제나 소유자 세션이므로 그 값이 항상 true다 —
      그래서 여기서는 칩이 고른 상태를 함께 본다.
    */

    canManage:
      context?.memos?.canManage !== false &&
      previewMemoViewerMode === "owner",

    handlers:
      {
        /*
          전부 화면 안에서만 끝난다. supabase도, RPC도, 저장 이벤트도
          없다 — Preview의 조작이 실제 데이터에 닿는 경로가 아예
          존재하지 않는다.
        */

        saveNote:
          async (card, text) => {

            card.note =
              text.trim();

            card.hasNote =
              Boolean(card.note);


            return {
              ok: true,

              notice:
                PREVIEW_MEMO_NOTICE
            };

          },

        deleteNote:
          async (card) => {

            card.note =
              "";

            card.hasNote =
              false;


            return {
              ok: true,

              notice:
                PREVIEW_MEMO_NOTICE
            };

          },

        deleteHighlight:
          async () => {

            return {
              ok: true,

              notice:
                PREVIEW_MEMO_NOTICE
            };

          },

        notice:
          PREVIEW_MEMO_NOTICE
      }
  });

}


/* =========================================================
   주인장 / 방문자 칩

   Preview에만 있는 chrome이다. 스킨이 그린 것이 아니라는 게 보이도록
   "미리보기"라고 먼저 적는다.
========================================================== */

function renderPreviewMemoViewerChip() {

  let chip =
    document.getElementById(
      PREVIEW_MEMO_VIEWER_CHIP_ID
    );


  if (!chip) {

    chip =
      document.createElement("div");


    chip.id =
      PREVIEW_MEMO_VIEWER_CHIP_ID;


    chip.className =
      "preview-memo-viewer-chip";


    document.body.appendChild(chip);

  }


  chip.replaceChildren();


  const label =
    document.createElement("span");


  label.className =
    "preview-memo-viewer-chip-label";


  label.textContent =
    "미리보기";


  chip.appendChild(label);


  [
    {
      mode: "owner",
      text: "주인장"
    },
    {
      mode: "visitor",
      text: "방문자"
    }
  ].forEach(
    (spec) => {

      const button =
        document.createElement("button");


      button.type =
        "button";


      button.className =
        "preview-memo-viewer-chip-option";


      button.textContent =
        spec.text;


      button.setAttribute(
        "aria-pressed",
        previewMemoViewerMode === spec.mode
          ? "true"
          : "false"
      );


      if (previewMemoViewerMode === spec.mode) {

        button.classList.add(
          "is-active"
        );

      }


      button.addEventListener(
        "click",
        () => {

          if (previewMemoViewerMode === spec.mode) {

            return;

          }


          previewMemoViewerMode =
            spec.mode;


          /* 열려 있던 메뉴/팝업은 상태가 바뀌었으니 닫는다 */

          if (typeof closeImoryPopover === "function") {

            closeImoryPopover({
              silent: true
            });

          }


          if (typeof closePostMemoPopup === "function") {

            closePostMemoPopup({
              silent: true
            });

          }


          renderPreviewMemoViewerChip();


          applyPreviewMemoTools();

        }
      );


      chip.appendChild(button);

    }
  );

}


function removePreviewMemoViewerChip() {

  document
    .getElementById(
      PREVIEW_MEMO_VIEWER_CHIP_ID
    )
    ?.remove();

}
