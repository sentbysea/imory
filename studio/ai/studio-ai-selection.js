/* =========================================================
   SKIN STUDIO — SELECTED ELEMENT ↔ AI ASSISTANT (PHASE AI-6B)

   Element Inspector에서 고른 요소 하나를 AI Assistant의 요청에
   연결한다. 이 파일이 하는 일은 셋뿐이다:

     1. AI 패널 안의 **선택 chip** — "선택됨: HOME · 제목" 한 줄과
        선택 해제(×) 버튼
     2. selectionContext 만들기 — 서버로 보낼 최소 shape
     3. 요청용 SkinPackage 만들기 — 고른 요소에 data-imory-edit-id
        하나를 **심어서** 보내는 사본

   ★ Inspector가 source of truth다 (요구사항 10절)
   이 파일은 선택 상태를 따로 들고 있지 않는다. Inspector가
   "studio-inspector-selection" 이벤트를 쏘면 chip을 다시 그리고,
   실제 값이 필요할 때마다 window.getStudioInspectorSelection()을
   다시 부른다. chip의 ×는 window.clearStudioInspectorSelection()을
   부를 뿐이고, chip이 사라지는 것은 그 결과로 Inspector가 다시
   쏘는 이벤트 때문이다 — 상태 복사본이 두 벌 생기지 않는다.

   ★ 왜 요청 SkinPackage에 id를 심는가 (3번)
   Inspector의 편집 식별자는 **임시**다. Preview로 나가는 사본에만
   찍히고 SkinPackage에는 남지 않는다(studio/inspector/
   studio-inspector-model.js stampInspectorEditIds / commitInspectorEditId
   주석 참고). 그래서 editId만 보내면 모델이 받은 SkinPackage 안에는
   그런 속성이 없어 타깃을 찾을 수 없다. 요청에 싣는 사본에서만
   그 요소 하나에 id를 심고 — Direct Edit이 저장 시점에 하는 것과
   똑같은 방식이다 — 나머지 임시 id는 전부 걷어낸다.

   working draft는 이 시점에 바뀌지 않는다. AI 응답을 실제로 적용할
   때 그 id가 함께 들어오고(모델에게 유지하라고 계약으로 못박았다),
   그래서 재렌더 뒤에도 같은 요소가 선택된 채로 남는다(요구사항
   12절). 적용하지 않고 실패/취소하면 스킨은 한 글자도 바뀌지 않는다.

   ★ 하지 않는 것
   - OpenAI 호출 (studio/ai/studio-ai-panel.js가 한다)
   - 선택 상태 소유 (studio/inspector/studio-inspector.js가 한다)
   - partial patch — 요청은 지금까지처럼 SkinPackage 전체다(20절)

   classic script. 런타임 의존:
   studio/inspector/studio-inspector-model.js(stampInspectorEditIds /
   commitInspectorEditId / isValidInspectorEditId),
   studio/inspector/studio-inspector.js(getStudioInspectorSelection /
   clearStudioInspectorSelection), studio/studio-preview.js
   (resolveCodeEditorSource). 전부 호출 시점에만 필요하다.
========================================================== */


const STUDIO_AI_SELECTION_PAGE_LABELS = {
  home: "HOME",
  category: "CATEGORY",
  post: "POST",
  banner: "BANNER",
  folder: "FOLDER"
};


/* =========================================================
   사람이 읽는 이름

   chip과 프롬프트에 들어가는 라벨이다. "div" / "e0-2-1" /
   "[data-imory-edit-id=…]" 같은 개발자용 값은 여기서 절대 나오지
   않는다(요구사항 2절) — 그런 값이 필요한 곳은 selectionContext
   자체이고, 그건 사용자에게 보여주지 않는다.

   Inspector 팝오버의 제목(studioInspectorLabelFor)과 일부러 다른
   함수다. 저쪽은 "무엇을 직접 수정할 수 있는가"를 설명하느라
   태그 이름을 보여주는 자리이고, 여기는 "무엇을 골랐는가"만
   한 줄로 말하는 자리다.
========================================================== */

const STUDIO_AI_SELECTION_HEADING_TAGS =
  ["h1", "h2", "h3", "h4", "h5", "h6"];

const STUDIO_AI_SELECTION_LIST_TAGS =
  ["ul", "ol", "dl"];

const STUDIO_AI_SELECTION_HINT_MAX_LENGTH = 16;


function studioAiSelectionRoleLabel(selection) {

  if (selection.kind === "image") {
    return "이미지";
  }

  if (selection.kind === "link") {

    /* viewer.* 바인딩은 소유자 전용 진입점이다(WRITE/ADMIN/EDIT) —
       "그냥 링크"와 구분해서 보여주는 편이 안전하다. */
    if (selection.isViewerBinding) {
      return "관리 링크";
    }

    return "링크";

  }

  if (selection.kind === "text") {

    if (STUDIO_AI_SELECTION_HEADING_TAGS.indexOf(selection.tagName) !== -1) {
      return "제목";
    }

    return "텍스트";

  }

  if (selection.repeatPath) {
    return "반복 항목";
  }

  if (STUDIO_AI_SELECTION_LIST_TAGS.indexOf(selection.tagName) !== -1) {
    return "목록";
  }

  return "영역";

}


function studioAiSelectionHint(selection) {

  const raw =
    (selection.text || "").trim();

  if (!raw) {
    return "";
  }

  return raw.length > STUDIO_AI_SELECTION_HINT_MAX_LENGTH
    ? raw.slice(0, STUDIO_AI_SELECTION_HINT_MAX_LENGTH) + "…"
    : raw;

}


function buildStudioAiSelectionLabel(selection) {

  if (!selection) {
    return "";
  }

  const parts = [
    STUDIO_AI_SELECTION_PAGE_LABELS[selection.pageType] || "PAGE",
    studioAiSelectionRoleLabel(selection)
  ];

  const hint =
    studioAiSelectionHint(selection);

  if (hint) {
    parts.push(hint);
  }

  return parts.join(" · ");

}


/* =========================================================
   selectionContext — 서버로 보낼 최소 shape (요구사항 3절)

   여기 없는 것: DOM node, rendered HTML, computed style, 주변
   게시글 데이터, 클래스 목록. 모델은 SkinPackage 전체를 이미
   받으므로 "그 안에서 어느 요소인가"만 있으면 된다.

   classNames를 뺀 이유가 특히 중요하다 — 클래스 이름을 보여주면
   모델이 그 공용 클래스를 고쳐서 같은 클래스를 쓰는 요소가 전부
   함께 바뀌기 쉽다(요구사항 7절이 막으려는 바로 그것).

   서버(functions/api/skin-ai.js validateSkinAiSelectionContext)가
   이 모양을 다시 전부 검증한다. 여기서 만든 값이라고 믿지 않는다.
========================================================== */

function buildStudioAiSelectionContext(selection) {

  if (!selection || !selection.editId || !selection.pageType) {
    return null;
  }

  return {
    template: selection.pageType,
    editId: selection.editId,
    elementType: selection.kind,
    tagName: selection.tagName,
    label: buildStudioAiSelectionLabel(selection),
    binding: selection.bindPath || null,
    imageSlot: selection.imageSlot || null,
    hrefBinding: selection.hrefPath || null,
    region: selection.region || null,
    repeat: selection.repeatPath || null,
    insideRepeat: selection.isInsideRepeat === true,
    capabilities:
      Object.keys(selection.capabilities || {})
        .filter((name) => selection.capabilities[name] === true)
  };

}


function getStudioAiSelectionContext() {

  if (typeof window.getStudioInspectorSelection !== "function") {
    return null;
  }

  return buildStudioAiSelectionContext(window.getStudioInspectorSelection());

}


/* =========================================================
   요청용 SkinPackage — 고른 요소에 식별자 하나만 심는다

   buildStudioAiSelectionPackage(skinPackage, selectionContext)
     -> 새 SkinPackage | null(그 요소를 찾지 못함)

   원본 객체를 바꾸지 않는다. 바뀌는 것은 selectionContext.template
   하나의 html뿐이고, 다른 template과 css/imageSlots/metadata는
   같은 참조를 그대로 넘긴다.

   ★ templates.* 안에 없는 페이지는 지원하지 않는다
   templates 없이 top-level html만 있는 예전 HOME-only SkinPackage는
   서버가 templates를 {}로 정리해 보내므로(normalizeSkinAiInputPackage)
   심어 봤자 모델에게 도달하지 않는다. 그래서 null을 돌려주고,
   호출자가 "선택 요소 AI 수정을 쓸 수 없다"고 알린다 — 전체 스킨
   수정으로 몰래 바꿔치기하지 않는다(요구사항 6절 8번).
========================================================== */

function buildStudioAiSelectionPackage(skinPackage, selectionContext) {

  if (!skinPackage || !selectionContext) {
    return null;
  }

  const pageType =
    selectionContext.template;

  const template =
    skinPackage.templates ? skinPackage.templates[pageType] : null;

  if (!template || typeof template.html !== "string") {
    return null;
  }

  if (
    typeof window.stampInspectorEditIds !== "function" ||
    typeof window.commitInspectorEditId !== "function"
  ) {
    return null;
  }

  const stamped =
    window.stampInspectorEditIds(template.html);

  const element =
    stamped.doc.body.querySelector(
      `[data-imory-edit-id="${selectionContext.editId}"]`
    );

  if (!element) {
    return null;
  }

  /* 고른 요소의 id 하나만 남기고 나머지 임시 id는 전부 걷는다 —
     Direct Edit의 저장 경로와 같은 함수, 같은 규칙이다. */
  const html =
    window.commitInspectorEditId(stamped, selectionContext.editId);

  return {
    ...skinPackage,
    templates: {
      ...skinPackage.templates,
      [pageType]: {
        ...template,
        html
      }
    }
  };

}


/* =========================================================
   reconcileStudioAiSelection(selectionContext)

   AI 결과를 **적용한 직후** 한 번 부른다. 고른 요소가 아직 있으면
   아무 것도 하지 않고, 사라졌으면 선택을 조용히 푼다(요구사항 12절
   — 오류가 아니라 정상 fallback).

   ★ 왜 "id가 남아 있는가"를 여기서 따로 봐야 하는가
   Preview 쪽은 선택을 id로 되살린다(preview-bridge.js
   inspectorReviveSelection). 그런데 Inspector의 임시 id는 **구조상
   위치**로 만들어진다("e0-0" = body의 첫 자식의 첫 자식,
   studio-inspector-model.js stampInspectorEditIds). 그래서 AI가
   그 요소를 지우면, 다음 렌더에서 **뒤 요소가 같은 위치로 밀려와
   같은 id를 물려받는다** — 되살리기는 성공하지만 엉뚱한 요소가
   선택된 채로 남는다.

   선택 요소 AI 요청은 그 요소에 id를 심어서 보냈고(위
   buildStudioAiSelectionPackage), 모델에게 그 id를 유지하라고
   계약으로 요구했다. 그러니 응답 SkinPackage의 html에 그 id가
   **글자로** 남아 있는지만 보면 된다. 남아 있으면 그 id는 그
   요소의 것이고(임시 id는 이미 쓰인 값을 피해 간다), 없으면 그
   요소는 사라졌거나 식별자를 잃은 것이다.

   되돌리기(Undo) 뒤에는 부르지 않는다 — 복원된 SkinPackage에는
   애초에 심은 id가 없고(심은 사본은 요청에만 실렸다), 구조가
   요청 전과 완전히 같으므로 임시 id가 같은 요소에 다시 찍힌다.
========================================================== */

function skinPackageHasEditId(skinPackage, template, editId) {

  const entry =
    (skinPackage && skinPackage.templates)
      ? skinPackage.templates[template]
      : null;

  const html =
    (entry && typeof entry.html === "string") ? entry.html : "";

  return html.indexOf(`data-imory-edit-id="${editId}"`) !== -1;

}


function reconcileStudioAiSelection(selectionContext) {

  if (!selectionContext) {
    return;
  }

  if (typeof window.getStudioAiWorkingState !== "function") {
    return;
  }

  const state =
    window.getStudioAiWorkingState({ includePackage: true });

  if (!state.skinPackage) {
    return;
  }

  if (
    skinPackageHasEditId(
      state.skinPackage,
      selectionContext.template,
      selectionContext.editId
    )
  ) {
    return;
  }

  if (typeof window.clearStudioInspectorSelection === "function") {
    window.clearStudioInspectorSelection();
  }

}


/* =========================================================
   선택 chip

   AI 패널 본문(#studioAiPanelBody) 맨 위 한 줄. 만들기는 처음
   필요할 때 한 번만 하고, 이후에는 문구와 hidden만 바꾼다.
========================================================== */

let studioAiSelectionChip = null;

let studioAiSelectionChipLabel = null;


function ensureStudioAiSelectionChip() {

  if (studioAiSelectionChip) {
    return studioAiSelectionChip;
  }

  const body =
    document.getElementById("studioAiPanelBody");

  if (!body) {
    return null;
  }

  studioAiSelectionChip =
    document.createElement("div");

  studioAiSelectionChip.className =
    "studio-ai-selection-chip";

  studioAiSelectionChip.id =
    "studioAiSelectionChip";

  studioAiSelectionChip.hidden =
    true;

  studioAiSelectionChipLabel =
    document.createElement("span");

  studioAiSelectionChipLabel.className =
    "studio-ai-selection-chip-label";

  studioAiSelectionChipLabel.id =
    "studioAiSelectionChipLabel";

  const clearButton =
    document.createElement("button");

  clearButton.type =
    "button";

  clearButton.className =
    "studio-ai-selection-chip-clear";

  clearButton.id =
    "studioAiSelectionChipClear";

  clearButton.textContent =
    "×";

  clearButton.setAttribute(
    "aria-label",
    "선택 해제"
  );

  clearButton.addEventListener(
    "click",
    () => {

      /* 상태를 여기서 지우지 않는다 — Inspector에게 해제를
         부탁하고, chip은 그 결과로 오는 이벤트에 반응한다. */
      if (typeof window.clearStudioInspectorSelection === "function") {
        window.clearStudioInspectorSelection();
      }

    }
  );

  studioAiSelectionChip.appendChild(studioAiSelectionChipLabel);
  studioAiSelectionChip.appendChild(clearButton);

  body.insertBefore(studioAiSelectionChip, body.firstChild);

  return studioAiSelectionChip;

}


function renderStudioAiSelectionChip() {

  const chip =
    ensureStudioAiSelectionChip();

  if (!chip) {
    return;
  }

  const selection =
    (typeof window.getStudioInspectorSelection === "function")
      ? window.getStudioInspectorSelection()
      : null;

  if (!selection) {

    chip.hidden = true;

    studioAiSelectionChipLabel.textContent = "";

    return;

  }

  chip.hidden =
    false;

  studioAiSelectionChipLabel.textContent =
    "선택됨: " + buildStudioAiSelectionLabel(selection);

}


/*
  Inspector가 선택을 잡거나 놓을 때마다 온다 — 재렌더 뒤 선택이
  살아남은 경우/사라진 경우도 같은 이벤트로 온다(요구사항 12절).
*/
window.addEventListener(
  "studio-inspector-selection",
  renderStudioAiSelectionChip
);


if (typeof window !== "undefined") {

  window.getStudioAiSelectionContext =
    getStudioAiSelectionContext;

  window.buildStudioAiSelectionPackage =
    buildStudioAiSelectionPackage;

  window.buildStudioAiSelectionLabel =
    buildStudioAiSelectionLabel;

  window.reconcileStudioAiSelection =
    reconcileStudioAiSelection;

  /* =========================================================
     S1/S2 진단 (PHASE AI-6B.1)

     "선택은 잡혔는가 / 그 식별자가 요청 package에 정말 심겼는가"를
     **네트워크를 타지 않고** 확인하는 창구다. 요구사항 4절이 묻는
     값들을 그대로 돌려준다.

     반환에 스킨 html이나 글 본문을 넣지 않는다 — 개수와 위치만
     돌려준다(sourcePath는 요소의 조상 태그/클래스 경로일 뿐이다).
  ========================================================== */
  window.inspectStudioAiSelectionPipeline =
    function () {

      const selection =
        (typeof window.getStudioInspectorSelection === "function")
          ? window.getStudioInspectorSelection()
          : null;

      if (!selection) {
        return { stage: "S1", ok: false, reason: "no-selection" };
      }

      const context =
        buildStudioAiSelectionContext(selection);

      if (!context) {
        return { stage: "S1", ok: false, reason: "context-build-failed" };
      }

      const working =
        (typeof window.getStudioAiWorkingState === "function")
          ? window.getStudioAiWorkingState({ includePackage: true })
          : null;

      if (!working || !working.skinPackage) {
        return { stage: "S2", ok: false, reason: "no-working-skin", context };
      }

      const requestPackage =
        buildStudioAiSelectionPackage(working.skinPackage, context);

      if (!requestPackage) {

        return {
          stage: "S2",
          ok: false,
          reason:
            (working.skinPackage.templates &&
             working.skinPackage.templates[context.template])
              ? "element-not-found-in-template"
              : "template-not-in-templates",
          context
        };

      }

      const html =
        requestPackage.templates[context.template].html;

      const marker =
        `data-imory-edit-id="${context.editId}"`;

      /* 그 요소가 소스 트리의 어디에 찍혔는지 — 태그/클래스만 */
      const doc =
        new DOMParser().parseFromString(html, "text/html");

      const element =
        doc.body.querySelector(`[${"data-imory-edit-id"}="${context.editId}"]`);

      const sourcePath = [];

      let cursor = element;

      while (cursor && cursor !== doc.body) {

        sourcePath.unshift(
          cursor.tagName.toLowerCase() +
          (cursor.getAttribute("class") ? "." + cursor.getAttribute("class").split(/\s+/).join(".") : "") +
          (cursor.hasAttribute("data-imory-repeat")
            ? `[repeat=${cursor.getAttribute("data-imory-repeat")}]`
            : "")
        );

        cursor = cursor.parentElement;

      }

      return {
        stage: "S2",
        ok: true,
        context,
        editIdOccurrencesInRequestTemplate:
          html.split(marker).length - 1,
        totalEditIdAttributesInRequestTemplate:
          (html.match(/data-imory-edit-id=/g) || []).length,
        sourcePath,
        sourceHasRepeatAncestor:
          sourcePath.some((step) => step.indexOf("[repeat=") !== -1)
      };

    };

  /* AI 수정 버튼이 패널을 연 직후 chip을 즉시 그리기 위한 창구.
     이벤트로도 오지만, 패널이 그 순간 처음 열려 body가 막 보이게
     된 경우까지 확실히 맞춘다. */
  window.renderStudioAiSelectionChip =
    renderStudioAiSelectionChip;

}
