/* =========================================================
   SKIN STUDIO — AI 빠른 제안 (DIRECT-UX-1 §13)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §13

   AI Assistant 가 열려 있고 요소를 하나 골라 두었으면, 그 요소에
   어울리는 짧은 제안 버튼을 **최대 넷** 보여 준다(선택 chip 바로 밑).

   ★ 버튼은 입력칸에 문구를 **넣기만** 한다
     전송하지 않는다 — 사용자가 문장을 고치거나 덧붙인 뒤 직접
     보낸다. 입력칸에 이미 쓰던 글이 있으면 지우지 않고 뒤에 붙인다.
     OpenAI 호출은 지금처럼 studio/ai/studio-ai-panel.js 의 Send 하나다.

   ★ 무엇에 어울리는가는 Inspector 가 붙인 **이름과 종류**로 정한다
     (window.getStudioInspectorSelection().name / .kind —
     studio/inspector/studio-inspector-names.js). 종류를 알 수 없으면
     제안 줄을 숨긴다.

   의존(호출 시점): studio/inspector/studio-inspector.js
   (getStudioInspectorSelection), studio/ai/studio-ai-panel-layout.js
   (isStudioAiPanelOpen).
========================================================== */


const STUDIO_AI_SUGGESTIONS = {
  image: ["원형으로 만들기", "배경처럼 크게", "테두리 넣기", "천천히 나타나게"],
  menu: ["가로 메뉴로", "폴더처럼", "2열로 정리", "더 작게"],
  background: ["그라데이션 적용", "파티클 추가", "조금 어둡게", "질감 추가"],
  list: ["2열로 정리", "카드 모양으로", "간격 넓히기", "천천히 나타나게"],
  text: ["더 크게", "굵게 강조", "글씨체 바꾸기", "천천히 나타나게"],
  button: ["둥근 버튼으로", "색 바꾸기", "올리면 강조", "더 크게"],
  container: ["그림자 넣기", "모서리 둥글게", "여백 넓히기", "배경색 바꾸기"]
};


let studioAiSuggestionRow = null;


function studioAiSuggestionFamily(selection) {

  if (!selection) {
    return null;
  }

  const name =
    typeof selection.name === "string" ? selection.name : "";

  if (selection.kind === "image") {
    return "image";
  }

  if (name === "배경") {
    return "background";
  }

  if (/카테고리 메뉴|메뉴$/.test(name) && selection.kind !== "text") {
    return "menu";
  }

  if (/목록|Gallery|Highlight|Banner|카드|Bottom Dock/.test(name) && selection.kind === "container") {
    return "list";
  }

  if (selection.kind === "text") {
    return "text";
  }

  if (selection.kind === "link") {
    return "button";
  }

  if (selection.kind === "container") {
    return "container";
  }

  return null;

}


function ensureStudioAiSuggestionRow() {

  if (studioAiSuggestionRow) {
    return studioAiSuggestionRow;
  }

  const body =
    document.getElementById("studioAiPanelBody");

  if (!body) {
    return null;
  }

  studioAiSuggestionRow =
    document.createElement("div");

  studioAiSuggestionRow.className =
    "studio-ai-suggestions";

  studioAiSuggestionRow.id =
    "studioAiSuggestions";

  studioAiSuggestionRow.setAttribute("role", "group");

  studioAiSuggestionRow.setAttribute("aria-label", "빠른 제안");

  studioAiSuggestionRow.hidden =
    true;

  const chip =
    document.getElementById("studioAiSelectionChip");

  if (chip && chip.parentElement === body) {
    body.insertBefore(studioAiSuggestionRow, chip.nextSibling);
  } else {
    body.insertBefore(studioAiSuggestionRow, body.firstChild);
  }

  return studioAiSuggestionRow;

}


/* 입력칸에 넣기만 한다 — 전송하지 않는다 */
function insertStudioAiSuggestion(text) {

  const input =
    document.getElementById("studioAiDrawerInput");

  if (!input || input.disabled) {
    return;
  }

  const current =
    input.value.replace(/\s+$/, "");

  input.value =
    current ? `${current} ${text}` : text;

  input.dispatchEvent(new Event("input", { bubbles: true }));

  input.focus();

  const end = input.value.length;

  try {
    input.setSelectionRange(end, end);
  } catch (err) {
    /* textarea 가 아니면 건너뛴다 */
  }

}


function renderStudioAiSuggestions() {

  const row =
    ensureStudioAiSuggestionRow();

  if (!row) {
    return;
  }

  const panelOpen =
    typeof window.isStudioAiPanelOpen === "function" ? window.isStudioAiPanelOpen() : true;

  const selection =
    typeof window.getStudioInspectorSelection === "function"
      ? window.getStudioInspectorSelection()
      : null;

  const family =
    panelOpen ? studioAiSuggestionFamily(selection) : null;

  const items =
    family ? STUDIO_AI_SUGGESTIONS[family].slice(0, 4) : [];

  row.innerHTML = "";

  if (!items.length) {
    row.hidden = true;
    row.removeAttribute("data-family");
    return;
  }

  row.dataset.family = family;

  items.forEach((text) => {

    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "studio-ai-suggestion";
    button.textContent = text;
    button.title = "입력칸에 넣기 (보내지는 않아요)";

    button.addEventListener("click", () => insertStudioAiSuggestion(text));

    row.appendChild(button);

  });

  row.hidden = false;

}


window.addEventListener("studio-inspector-selection", renderStudioAiSuggestions);

window.addEventListener("studio-ai-panel-toggle", renderStudioAiSuggestions);


if (typeof window !== "undefined") {

  window.renderStudioAiSuggestions = renderStudioAiSuggestions;

}
