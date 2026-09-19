/* =========================================================
   SKIN STUDIO — 저장 · 공개 상태 한 줄 (DIRECT-UX-1 §14)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §14

   Save 버튼 바로 앞에 지금 상태를 짧게 적는다.

     저장됨                          저장한 draft 가 공개된 것과 같다
     저장하지 않은 변경사항          isStudioDirty
     저장됐지만 아직 공개되지 않음   draft id ≠ published id
     저장 중… / 공개 중…             Save / Publish 요청이 가는 중
     저장 실패 / 공개 실패           마지막 시도가 실패했고 그 상태가 그대로

   ★ 새 상태 시스템이 아니다
     값은 전부 studio/studio-preview.js 가 이미 들고 있는 것
     (isStudioDirty · isStudioSavePending · isStudioPublishPending ·
     currentDraftVersionId · currentPublishedVersionId)에서 **읽기만**
     한다. 이 파일이 따로 기억하는 것은 "마지막 시도가 실패했는가"
     하나뿐이고, 그것도 그 파일의 catch 가 알려 준다
     (noteStudioSaveStatusFailure). 다시 계산하는 때는 Save/Publish
     버튼을 다시 그리는 때와 같다(updateStudioPublishButtonState).

   ★ 색에만 기대지 않는다 — 점 모양과 함께 **문구**가 상태를 말한다.
     바가 좁으면(좁은 화면 · AI 패널을 연 1000px 이하 바) 짧은 문구를
     쓰고 긴 문구는 title / aria-label 에 남긴다.
========================================================== */


const STUDIO_SAVE_STATUS_TEXT = {
  saved: ["저장됨", "저장됨"],
  dirty: ["저장하지 않은 변경사항", "저장 안 됨"],
  unpublished: ["저장됐지만 아직 공개되지 않음", "공개 전"],
  saving: ["저장 중…", "저장 중…"],
  publishing: ["공개 중…", "공개 중…"],
  saveFailed: ["저장 실패", "저장 실패"],
  publishFailed: ["공개 실패", "공개 실패"]
};


let studioSaveStatusElement = null;

let studioSaveStatusFailure = "";


function ensureStudioSaveStatusElement() {

  if (studioSaveStatusElement) {
    return studioSaveStatusElement;
  }

  const saveButton =
    document.getElementById("studioSaveButton");

  if (!saveButton || !saveButton.parentElement) {
    return null;
  }

  studioSaveStatusElement =
    document.createElement("span");

  studioSaveStatusElement.className =
    "studio-save-status";

  studioSaveStatusElement.id =
    "studioSaveStatus";

  studioSaveStatusElement.setAttribute("role", "status");

  studioSaveStatusElement.setAttribute("aria-live", "polite");

  studioSaveStatusElement.hidden =
    true;

  const dot =
    document.createElement("span");

  dot.className = "studio-save-status-dot";
  dot.setAttribute("aria-hidden", "true");

  const long =
    document.createElement("span");

  long.className = "studio-save-status-long";

  const short =
    document.createElement("span");

  short.className = "studio-save-status-short";
  short.setAttribute("aria-hidden", "true");

  studioSaveStatusElement.appendChild(dot);
  studioSaveStatusElement.appendChild(long);
  studioSaveStatusElement.appendChild(short);

  saveButton.parentElement.insertBefore(studioSaveStatusElement, saveButton);

  return studioSaveStatusElement;

}


function studioSaveStatusKey() {

  if (typeof currentWorkingSkin === "undefined" || !currentWorkingSkin) {
    return "";
  }

  if (isStudioSavePending) {
    return "saving";
  }

  if (isStudioPublishPending) {
    return "publishing";
  }

  const hasUnpublishedDraft =
    !!currentDraftVersionId && currentDraftVersionId !== currentPublishedVersionId;

  if (studioSaveStatusFailure === "save" && isStudioDirty) {
    return "saveFailed";
  }

  if (studioSaveStatusFailure === "publish" && !isStudioDirty && hasUnpublishedDraft) {
    return "publishFailed";
  }

  if (isStudioDirty) {
    return "dirty";
  }

  return hasUnpublishedDraft ? "unpublished" : "saved";

}


function updateStudioSaveStatus() {

  const element =
    ensureStudioSaveStatusElement();

  if (!element) {
    return;
  }

  const key =
    studioSaveStatusKey();

  if (!key) {
    element.hidden = true;
    element.removeAttribute("data-state");
    return;
  }

  const [longText, shortText] =
    STUDIO_SAVE_STATUS_TEXT[key];

  element.dataset.state = key;

  element.querySelector(".studio-save-status-long").textContent = longText;
  element.querySelector(".studio-save-status-short").textContent = shortText;

  element.title = longText;
  element.setAttribute("aria-label", longText);

  element.hidden = false;

}


/* studio-preview.js 의 Save / Publish 가 부른다.
     "save" | "publish"  그 시도가 실패했다
     ""                  새 시도가 시작됐거나 성공했다 */
function noteStudioSaveStatusFailure(kind) {

  studioSaveStatusFailure =
    kind === "save" || kind === "publish" ? kind : "";

  updateStudioSaveStatus();

}


if (typeof window !== "undefined") {

  window.updateStudioSaveStatus = updateStudioSaveStatus;
  window.noteStudioSaveStatusFailure = noteStudioSaveStatusFailure;

  /* 테스트용 읽기 창구 */
  window.getStudioSaveStatus = function () {
    return {
      state: studioSaveStatusKey(),
      text: studioSaveStatusElement && !studioSaveStatusElement.hidden
        ? studioSaveStatusElement.getAttribute("aria-label")
        : ""
    };
  };

}
