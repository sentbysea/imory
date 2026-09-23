/* =========================================================
   SKIN STUDIO - IMAGES PANEL (Skin Image Library v0.1)

   SKIN_IMAGE_LIBRARY_PLAN.md 5절. DOM은 처음 열 때 한 번만 만들고
   이후 재사용한다.

   STUDIO-SHELL-1 — 예전에는 화면 전체를 덮는 modal 이었다. 이제
   Studio 왼쪽 패널의 Images 자리(#studioLeftPanelImages)에 들어가는
   **패널 내용**이다 — Preview 를 가리지 않는다. 여닫기는
   studio/studio-shell.js 가 정하고, 이 파일의 "닫기"·Escape 는
   셸에게 알려 패널을 접게 한다(handleStudioLeftPanelContentClosed).
   자리가 없는 문서에서만 예전처럼 body 의 modal 로 뜬다.
   바깥 루트의 클래스 이름(.images-panel-overlay)과 hidden 여닫기
   표식은 그대로 두었다 — 모양은 studio-shell.css 가 바꾼다.

   화면 구성(왼쪽/오른쪽 2열):
     - 왼쪽 SLOTS: 지금 Skin이 선언한 imageSlots 목록. 각 슬롯의
       현재 연결 썸네일 + "비우기". 슬롯을 고르면 오른쪽에서 고른
       이미지가 그 슬롯에 연결된다.
     - 오른쪽 MY IMAGES: 업로드 영역(파일 선택 + 클립보드 붙여넣기)
       + 내 이미지 그리드. 각 이미지 카드에서 "연결"(선택된 슬롯으로)
       / "삭제".

   ★ STUDIO-LAYERS-MEDIA-1 — 대개는 **자리 하나**로 열린다

   상단 Images 버튼이 없어지고, 이 화면은 "어느 사진을 바꾸는가"를
   이미 아는 세 입구에서만 열린다(Layers 의 사진 행 · Select 의
   "이미지 변경" · Layout 의 제목 로고). 그래서 슬롯 이름이 함께
   오면 **그 자리 하나**를 머리에 크게 보여 주고 왼쪽 목록은 접는다
   — 사용자가 `canvas_photo_2` 같은 기술 이름 사이에서 자기 사진을
   다시 찾을 일이 없다. 목록 화면은 슬롯 없이 열렸을 때의 폴백으로
   남는다.

   기술 이름은 어느 화면에도 적지 않는다(사람이 읽는 label 만).

   맨 위의 ← 는 온 자리로 돌아간다 — 어디로 돌아갈지는 셸이 안다
   (studio/studio-shell.js getStudioImagesPanelReturn).

   업로드 영역은 tabindex=0인 포커스 가능한 영역이다 — 거기에만
   paste 리스너를 건다(document이 아니다). 그래서 Code/Import
   modal이나 AI 입력창의 붙여넣기는 이 코드를 아예 지나가지 않는다.

   이 파일은 DB/Storage를 직접 만지지 않는다 — 전부
   window.skinImageLibrary(studio/images/skin-image-library.js)를
   거친다. 슬롯 연결도 직접 쓰지 않고 studio-preview.js의
   setStudioImageSlot()만 부른다(그쪽이 working draft/dirty/Preview
   재렌더의 주인). 그래서 이 패널은 "DB를 바꾸는" 어떤 경로도 갖지
   않는다 — 업로드/삭제만 즉시 반영되고, 슬롯 연결은 Save 전까지
   메모리에만 있다.

   migration이 아직 적용되지 않은 배포에서는 슬롯/그리드 대신 준비
   안내만 보여준다(계획 문서 8절) — 버튼 자체를 숨기지 않는 이유는
   "왜 없지?"보다 "아직 준비 중이구나"가 사용자에게 더 정확하기
   때문이다.

   classic script — window.openSkinImagesPanel로 노출된다.
   의존(이 파일보다 먼저 로드되어야 함): window.skinImageLibrary
   (studio/images/skin-image-library.js). getStudioImageSlotState/
   setStudioImageSlot(studio/studio-preview.js)은 패널을 여는
   시점에만 있으면 된다.
========================================================== */

let imagesPanelOverlay = null;
let imagesPanelBackButton = null;
let imagesPanelTitle = null;
let imagesPanelSlotsColumn = null;
let imagesPanelFocusHead = null;
let imagesPanelFocusThumb = null;
let imagesPanelFocusLabel = null;
let imagesPanelFocusClear = null;
let imagesPanelSlotList = null;
let imagesPanelGrid = null;
let imagesPanelMessage = null;
let imagesPanelNotice = null;
let imagesPanelFileInput = null;
let imagesPanelUploadButton = null;
let imagesPanelPasteZone = null;
let imagesPanelPasteZonePick = null;
let imagesPanelBody = null;

let imagesPanelIsOpen = false;
let imagesPanelSelectedSlot = null;

/* STUDIO-LAYERS-MEDIA-1 — "자리 하나" 화면인가. 슬롯 이름과 함께
   열렸으면 참이고, 슬롯 없이 열리면 거짓(목록 폴백)이다. */
let imagesPanelFocusMode = false;
let imagesPanelImages = [];
let imagesPanelIsBusy = false;

/* drag & drop — dragenter/dragleave는 자식 요소를 지날 때마다 쌍으로
   발생하므로 깊이를 세어야 "정말 영역 밖으로 나갔는가"를 안다. */
let imagesPanelDragDepth = 0;

/* STUDIO-LAYERS-MEDIA-1 — DB 에서는 지워졌는데 Storage 파일만 남은
   경로. 화면 상태다(다시 열면 사라진다) — 사용자가 "파일 다시
   지우기"를 누를 동안만 산다. */
let imagesPanelPendingObject = null;

let imagesPanelRetryButton = null;


function setImagesPanelMessage(text, isError) {

  if (!imagesPanelMessage) {
    return;
  }

  imagesPanelMessage.textContent =
    text || "";

  imagesPanelMessage.classList.toggle(
    "images-panel-message--error",
    !!isError
  );

}


function setImagesPanelBusy(busy) {

  imagesPanelIsBusy = busy;

  if (imagesPanelUploadButton) {
    imagesPanelUploadButton.disabled = busy;
  }

  if (imagesPanelPasteZonePick) {
    imagesPanelPasteZonePick.disabled = busy;
  }

  if (imagesPanelPasteZone) {
    imagesPanelPasteZone.classList.toggle("images-panel-pastezone--busy", busy);
  }

  if (imagesPanelOverlay) {
    imagesPanelOverlay.classList.toggle("images-panel-overlay--busy", busy);
  }

}


/* STUDIO-LAYERS-MEDIA-1 — "파일 다시 지우기" 를 보일까 */
function syncImagesPanelRetry() {

  if (imagesPanelRetryButton) {
    imagesPanelRetryButton.hidden = !imagesPanelPendingObject;
  }

}


function formatImageSize(bytes) {

  if (!bytes && bytes !== 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;

}


/* =========================================================
   DOM
========================================================== */

function buildImagesPanelDom() {

  const overlay =
    document.createElement("div");

  overlay.className = "images-panel-overlay";
  overlay.hidden = true;

  const modal =
    document.createElement("div");

  modal.className = "images-panel-modal";
  overlay.appendChild(modal);

  const header =
    document.createElement("div");

  header.className = "images-panel-header";

  /* STUDIO-LAYERS-MEDIA-1 — 온 자리로 돌아가는 ← */
  const backButton =
    document.createElement("button");

  backButton.type = "button";
  backButton.className = "images-panel-back";
  backButton.id = "skinImagesPanelBack";
  backButton.hidden = true;
  header.appendChild(backButton);

  const title =
    document.createElement("h2");

  title.className = "images-panel-title";
  title.textContent = "IMAGES";
  header.appendChild(title);

  const closeButton =
    document.createElement("button");

  closeButton.type = "button";
  closeButton.className = "images-panel-close";
  closeButton.setAttribute("aria-label", "닫기");
  closeButton.textContent = "✕";
  header.appendChild(closeButton);

  modal.appendChild(header);

  /* 준비 안내(migration 미적용 등) */

  const notice =
    document.createElement("p");

  notice.className = "images-panel-notice";
  notice.hidden = true;
  modal.appendChild(notice);

  /* 본문 2열 */

  const body =
    document.createElement("div");

  body.className = "images-panel-body";

  /* =====================================================
     STUDIO-LAYERS-MEDIA-1 — 자리 하나 화면의 머리

     지금 그 자리에 무엇이 들어 있는지(작은 미리보기)와 "비우기"
     하나다. 새 저장 경로를 만들지 않는다 — 비우기는 지금까지와
     같은 setStudioImageSlot(slot, null) 이고 Undo 한 칸이다.
  ====================================================== */

  const focusHead =
    document.createElement("div");

  focusHead.className = "images-panel-focus";
  focusHead.id = "skinImagesPanelFocus";
  focusHead.hidden = true;

  const focusThumb =
    document.createElement("span");

  focusThumb.className = "images-panel-focus-thumb";
  focusHead.appendChild(focusThumb);

  const focusMeta =
    document.createElement("div");

  focusMeta.className = "images-panel-focus-meta";

  const focusLabel =
    document.createElement("p");

  focusLabel.className = "images-panel-focus-label";
  focusMeta.appendChild(focusLabel);

  const focusClear =
    document.createElement("button");

  focusClear.type = "button";
  focusClear.className = "images-panel-focus-clear";
  focusClear.id = "skinImagesPanelFocusClear";
  focusClear.textContent = "비우기";
  focusMeta.appendChild(focusClear);

  focusHead.appendChild(focusMeta);

  modal.appendChild(focusHead);

  const slotsColumn =
    document.createElement("section");

  slotsColumn.className = "images-panel-column";

  const slotsHeading =
    document.createElement("p");

  slotsHeading.className = "images-panel-column-heading";
  slotsHeading.textContent = "SLOTS";
  slotsColumn.appendChild(slotsHeading);

  const slotList =
    document.createElement("ul");

  slotList.className = "images-panel-slot-list";
  slotsColumn.appendChild(slotList);

  body.appendChild(slotsColumn);

  const libraryColumn =
    document.createElement("section");

  libraryColumn.className = "images-panel-column";

  const libraryHeading =
    document.createElement("div");

  libraryHeading.className = "images-panel-column-heading images-panel-column-heading--row";

  const libraryHeadingText =
    document.createElement("span");

  libraryHeadingText.textContent = "MY IMAGES";
  libraryHeading.appendChild(libraryHeadingText);

  const uploadButton =
    document.createElement("button");

  uploadButton.type = "button";
  uploadButton.className = "images-panel-upload-button";
  uploadButton.textContent = "+ 업로드";
  libraryHeading.appendChild(uploadButton);

  libraryColumn.appendChild(libraryHeading);

  const fileInput =
    document.createElement("input");

  fileInput.type = "file";
  fileInput.accept = window.skinImageLibrary.ALLOWED_MIME.join(",");
  fileInput.hidden = true;
  libraryColumn.appendChild(fileInput);

  /*
    업로드 영역 — 클릭하면 포커스를 받고, 그 상태에서 Ctrl+V /
    ⌘V로 클립보드의 이미지를 그대로 올릴 수 있다. 영역 전체를
    파일 대화상자 열기로 쓰지 않는 이유: 클릭이 곧 대화상자면
    "클릭 후 붙여넣기"가 불가능해진다. 그래서 파일 선택은 안쪽
    버튼(과 헤더의 + 업로드)이 맡는다.
  */

  const pasteZone =
    document.createElement("div");

  pasteZone.className = "images-panel-pastezone";
  pasteZone.tabIndex = 0;
  pasteZone.setAttribute(
    "aria-label",
    "이미지 업로드 영역 — 파일 선택 또는 이미지 붙여넣기 (Ctrl+V / ⌘V)"
  );

  const pasteZonePick =
    document.createElement("button");

  pasteZonePick.type = "button";
  pasteZonePick.className = "images-panel-pastezone-pick";
  pasteZonePick.textContent = "파일 선택";
  pasteZone.appendChild(pasteZonePick);

  const pasteZoneHint =
    document.createElement("span");

  pasteZoneHint.className = "images-panel-pastezone-hint";
  pasteZoneHint.textContent = " 또는 이미지 붙여넣기 (Ctrl+V / ⌘V)";
  pasteZone.appendChild(pasteZoneHint);

  libraryColumn.appendChild(pasteZone);

  const grid =
    document.createElement("div");

  grid.className = "images-panel-grid";
  libraryColumn.appendChild(grid);

  body.appendChild(libraryColumn);

  modal.appendChild(body);

  const message =
    document.createElement("p");

  message.className = "images-panel-message";
  modal.appendChild(message);

  const footer =
    document.createElement("div");

  footer.className = "images-panel-footer";

  const hint =
    document.createElement("span");

  hint.className = "images-panel-hint";
  hint.textContent =
    "슬롯 연결은 Save를 눌러야 저장되고, Publish해야 공개 화면에 반영돼요.";
  footer.appendChild(hint);

  /* STUDIO-LAYERS-MEDIA-1 — 파일만 남았을 때의 재시도.
     평소에는 없다(지울 파일이 없으면 보여 줄 이유가 없다). */
  const retryButton =
    document.createElement("button");

  retryButton.type = "button";
  retryButton.className = "images-panel-retry-button";
  retryButton.id = "skinImagesPanelRetry";
  retryButton.textContent = "파일 다시 지우기";
  retryButton.hidden = true;
  retryButton.addEventListener("click", retryImagesPanelObjectDelete);
  footer.appendChild(retryButton);

  const doneButton =
    document.createElement("button");

  doneButton.type = "button";
  doneButton.className = "images-panel-done-button";
  doneButton.textContent = "닫기";
  footer.appendChild(doneButton);

  modal.appendChild(footer);

  const host =
    document.getElementById("studioLeftPanelImages");

  (host || document.body).appendChild(overlay);

  imagesPanelOverlay = overlay;
  imagesPanelBackButton = backButton;
  imagesPanelTitle = title;
  imagesPanelSlotsColumn = slotsColumn;
  imagesPanelFocusHead = focusHead;
  imagesPanelFocusThumb = focusThumb;
  imagesPanelFocusLabel = focusLabel;
  imagesPanelFocusClear = focusClear;
  imagesPanelSlotList = slotList;
  imagesPanelGrid = grid;
  imagesPanelMessage = message;
  imagesPanelNotice = notice;
  imagesPanelFileInput = fileInput;
  imagesPanelUploadButton = uploadButton;
  imagesPanelPasteZone = pasteZone;
  imagesPanelPasteZonePick = pasteZonePick;
  imagesPanelRetryButton = retryButton;
  imagesPanelBody = body;

  closeButton.addEventListener("click", closeSkinImagesPanel);
  doneButton.addEventListener("click", closeSkinImagesPanel);

  /* ← 와 "비우기"(STUDIO-LAYERS-MEDIA-1) */

  backButton.addEventListener("click", () => {

    if (typeof window.returnFromStudioImagesPanel === "function") {
      window.returnFromStudioImagesPanel();
      return;
    }

    closeSkinImagesPanel();

  });

  focusClear.addEventListener("click", () => {

    const slot =
      focusedImagesPanelSlot();

    if (!slot || !slot.binding) {
      return;
    }

    window.setStudioImageSlot(slot.name, null);

    setImagesPanelMessage(`"${slot.label}"을(를) 비웠어요. Save를 눌러 저장하세요.`);

    renderImagesPanelSlots();
    renderImagesPanelGrid();

  });

  /* 바깥(어두운 배경)을 눌러 닫기 — modal 로 뜰 때만 의미가 있다.
     왼쪽 패널 안에서는 바깥이 Preview 이고, 거기를 누르는 것은
     닫으라는 뜻이 아니다. */
  if (!host) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeSkinImagesPanel();
      }
    });
  }

  uploadButton.addEventListener("click", () => {
    if (!imagesPanelIsBusy) {
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", handleImagesPanelFileChange);

  pasteZonePick.addEventListener("click", () => {
    if (!imagesPanelIsBusy) {
      fileInput.click();
    }
  });

  /*
    영역의 빈 곳을 클릭하면 포커스를 준다 — tabindex가 있는 div는
    브라우저에 따라 클릭만으로 포커스를 받지 않기도 해서 명시한다.
    안쪽 버튼 클릭은 그 버튼이 처리한다.
  */
  pasteZone.addEventListener("click", (event) => {
    if (event.target !== pasteZonePick) {
      pasteZone.focus();
    }
  });

  /* 키보드 사용자: 포커스된 영역에서 Enter/Space = 파일 선택 */
  pasteZone.addEventListener("keydown", (event) => {

    if (event.target !== pasteZone) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!imagesPanelIsBusy) {
        fileInput.click();
      }
    }

  });

  pasteZone.addEventListener("paste", handleImagesPanelPaste);

  /*
    drag & drop(Skin Studio 파일 UX) — 업로드 영역이 dropzone이다.
    놓인 파일은 붙여넣기/파일 선택과 **같은** uploadImagesPanelFile()
    로 들어간다(검증·업로드·목록 갱신 전부 그 한 곳). overlay
    전체에서는 기본 동작만 막아, 영역 밖에 잘못 놓아도 브라우저가
    그 이미지를 열어 Studio를 떠나는 일이 없게 한다.
  */

  overlay.addEventListener("dragover", (event) => {
    if (imagesPanelDragHasFiles(event.dataTransfer)) {
      event.preventDefault();
    }
  });

  overlay.addEventListener("drop", (event) => {
    if (imagesPanelDragHasFiles(event.dataTransfer)) {
      event.preventDefault();
    }
  });

  pasteZone.addEventListener("dragenter", (event) => {

    if (!imagesPanelDragHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();

    imagesPanelDragDepth += 1;

    pasteZone.classList.add("images-panel-pastezone--dragover");

  });

  pasteZone.addEventListener("dragover", (event) => {

    if (!imagesPanelDragHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();

    try {
      event.dataTransfer.dropEffect = imagesPanelIsBusy ? "none" : "copy";
    } catch (err) {
      /* 읽기 전용인 브라우저 — 무시 */
    }

  });

  pasteZone.addEventListener("dragleave", () => {

    imagesPanelDragDepth =
      Math.max(0, imagesPanelDragDepth - 1);

    if (imagesPanelDragDepth === 0) {
      pasteZone.classList.remove("images-panel-pastezone--dragover");
    }

  });

  pasteZone.addEventListener("drop", handleImagesPanelDrop);

  /* Escape — 패널이 지금 이 내용을 **보여 주고 있을 때만**. Select
     나 Dock 을 보고 있을 때의 Escape 는 그쪽 몫이다(고른 요소 해제 등). */
  document.addEventListener("keydown", (event) => {

    if (event.key !== "Escape" || !imagesPanelIsOpen) {
      return;
    }

    if (
      typeof window.isStudioLeftPanelShowing === "function" &&
      host &&
      !window.isStudioLeftPanelShowing("images")
    ) {
      return;
    }

    closeSkinImagesPanel();

  });

}


/* =========================================================
   슬롯 목록 렌더
========================================================== */

/* 지금 고른 자리의 상태(label · binding) — 없으면 null */
function focusedImagesPanelSlot() {

  if (typeof window.getStudioImageSlotState !== "function") {
    return null;
  }

  const state =
    window.getStudioImageSlotState();

  if (!state || !Array.isArray(state.slots)) {
    return null;
  }

  return state.slots.find((slot) => slot.name === imagesPanelSelectedSlot) || null;

}


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 머리(← · 제목 · 자리 하나 미리보기)

   제목은 focus 화면에서 **그 자리의 사람이 읽는 이름**이다. 슬롯
   없이 열린 목록 화면에서만 예전 "IMAGES" 로 돌아간다.
========================================================== */

function syncImagesPanelHead() {

  if (!imagesPanelOverlay) {
    return;
  }

  const back =
    (typeof window.getStudioImagesPanelReturn === "function")
      ? window.getStudioImagesPanelReturn()
      : null;

  if (imagesPanelBackButton) {

    imagesPanelBackButton.hidden = !back;

    if (back) {
      imagesPanelBackButton.textContent = `← ${back.label}`;
      imagesPanelBackButton.setAttribute("aria-label", `${back.label}(으)로 돌아가기`);
    }

  }

  const slot =
    imagesPanelFocusMode ? focusedImagesPanelSlot() : null;

  if (imagesPanelTitle) {
    imagesPanelTitle.textContent = slot ? slot.label : "IMAGES";
  }

  /* 목록 열은 focus 화면에서 접는다 — 같은 정보를 두 번 보여 주지
     않고, 기술 이름이 늘어선 목록을 첫 화면으로 두지 않는다. */
  if (imagesPanelSlotsColumn) {
    imagesPanelSlotsColumn.hidden = !!slot;
  }

  if (!imagesPanelFocusHead) {
    return;
  }

  imagesPanelFocusHead.hidden = !slot;

  if (!slot) {
    return;
  }

  imagesPanelFocusThumb.innerHTML = "";

  imagesPanelFocusThumb.classList.toggle(
    "images-panel-focus-thumb--empty",
    !slot.binding
  );

  if (slot.binding) {

    const img =
      document.createElement("img");

    img.src = slot.binding.imageUrl;
    img.alt = "";
    imagesPanelFocusThumb.appendChild(img);

  } else {
    imagesPanelFocusThumb.textContent = "비어 있음";
  }

  imagesPanelFocusLabel.textContent =
    slot.binding
      ? "지금 이 자리에 있는 사진이에요."
      : "아직 사진이 없는 자리예요.";

  imagesPanelFocusClear.disabled = !slot.binding;

}


function renderImagesPanelSlots() {

  const state =
    window.getStudioImageSlotState();

  syncImagesPanelHead();

  imagesPanelSlotList.innerHTML = "";

  if (!state.slots.length) {

    const empty =
      document.createElement("li");

    empty.className = "images-panel-slot-empty";
    empty.textContent =
      "이 스킨에는 이미지 슬롯이 선언되어 있지 않아요.";
    imagesPanelSlotList.appendChild(empty);

    imagesPanelSelectedSlot = null;

    return;

  }

  /* 선택된 슬롯이 사라졌으면(Import 등) 첫 슬롯으로 되돌린다 */
  if (
    !imagesPanelSelectedSlot ||
    !state.slots.some((slot) => slot.name === imagesPanelSelectedSlot)
  ) {
    imagesPanelSelectedSlot = state.slots[0].name;
  }

  state.slots.forEach((slot) => {

    const item =
      document.createElement("li");

    item.className = "images-panel-slot";

    if (slot.name === imagesPanelSelectedSlot) {
      item.classList.add("images-panel-slot--selected");
    }

    const pickButton =
      document.createElement("button");

    pickButton.type = "button";
    pickButton.className = "images-panel-slot-pick";
    pickButton.setAttribute("aria-pressed", String(slot.name === imagesPanelSelectedSlot));

    const thumb =
      document.createElement("span");

    thumb.className = "images-panel-slot-thumb";

    if (slot.binding) {

      const img =
        document.createElement("img");

      img.src = slot.binding.imageUrl;
      img.alt = "";
      thumb.appendChild(img);

    } else {

      thumb.textContent = "비어 있음";
      thumb.classList.add("images-panel-slot-thumb--empty");

    }

    pickButton.appendChild(thumb);

    const meta =
      document.createElement("span");

    meta.className = "images-panel-slot-meta";

    const label =
      document.createElement("span");

    label.className = "images-panel-slot-label";
    label.textContent = slot.label;
    meta.appendChild(label);

    const sub =
      document.createElement("span");

    /* STUDIO-LAYERS-MEDIA-1 — slot.name(기술 이름)은 적지 않는다.
       사용자에게 뜻이 없고, 같은 이름이 화면마다 달라 보일 이유도
       없다. 사람이 읽는 label 은 바로 위 줄에 이미 있다. */
    sub.className = "images-panel-slot-sub";
    sub.textContent =
      [
        slot.required ? "필수" : null,
        slot.aspectRatioHint
      ]
        .filter(Boolean)
        .join(" · ");
    meta.appendChild(sub);

    pickButton.appendChild(meta);

    pickButton.addEventListener("click", () => {
      imagesPanelSelectedSlot = slot.name;
      renderImagesPanelSlots();
      renderImagesPanelGrid();
    });

    item.appendChild(pickButton);

    const clearButton =
      document.createElement("button");

    clearButton.type = "button";
    clearButton.className = "images-panel-slot-clear";
    clearButton.textContent = "비우기";
    clearButton.disabled = !slot.binding;

    clearButton.addEventListener("click", () => {

      window.setStudioImageSlot(slot.name, null);

      setImagesPanelMessage(`"${slot.label}"을(를) 비웠어요. Save를 눌러 저장하세요.`);

      renderImagesPanelSlots();
      renderImagesPanelGrid();

    });

    item.appendChild(clearButton);

    imagesPanelSlotList.appendChild(item);

  });

}


/* =========================================================
   내 이미지 그리드 렌더
========================================================== */

function renderImagesPanelGrid() {

  imagesPanelGrid.innerHTML = "";

  if (!imagesPanelImages.length) {

    const empty =
      document.createElement("p");

    empty.className = "images-panel-grid-empty";
    empty.textContent =
      "아직 올린 이미지가 없어요. 위에서 파일을 고르거나 이미지를 붙여넣어 보세요.";
    imagesPanelGrid.appendChild(empty);

    return;

  }

  const state =
    window.getStudioImageSlotState();

  const usedImageIds =
    new Set(
      state.slots
        .filter((slot) => slot.binding)
        .map((slot) => slot.binding.imageId)
    );

  imagesPanelImages.forEach((image) => {

    const card =
      document.createElement("figure");

    card.className = "images-panel-card";

    const img =
      document.createElement("img");

    img.className = "images-panel-card-image";
    img.src = image.public_url;
    img.alt = image.original_name || "";
    img.loading = "lazy";
    card.appendChild(img);

    const caption =
      document.createElement("figcaption");

    caption.className = "images-panel-card-caption";
    caption.textContent =
      [image.original_name, formatImageSize(image.byte_size)]
        .filter(Boolean)
        .join(" · ");
    card.appendChild(caption);

    const actions =
      document.createElement("div");

    actions.className = "images-panel-card-actions";

    const attachButton =
      document.createElement("button");

    attachButton.type = "button";
    attachButton.className = "images-panel-card-attach";
    /* STUDIO-LAYERS-MEDIA-1 — 자리 하나 화면에서는 "이 자리에 넣기".
       목록 화면에서는 예전 문구 그대로다. */
    attachButton.textContent =
      imagesPanelSelectedSlot
        ? (imagesPanelFocusMode ? "이 자리에 넣기" : "이 슬롯에 연결")
        : "연결";
    attachButton.disabled = !imagesPanelSelectedSlot;

    attachButton.addEventListener("click", () => {

      if (!imagesPanelSelectedSlot) {
        return;
      }

      const applied =
        window.setStudioImageSlot(imagesPanelSelectedSlot, image);

      if (!applied) {
        setImagesPanelMessage("이 자리에는 넣을 수 없어요.", true);
        return;
      }

      /* 사람이 읽는 이름으로만 말한다(기술 이름을 적지 않는다) */
      const named =
        focusedImagesPanelSlot();

      setImagesPanelMessage(
        `"${named ? named.label : "고른 자리"}"에 넣었어요. Save를 눌러 저장하세요.`
      );

      renderImagesPanelSlots();
      renderImagesPanelGrid();

      /* MOBILE-SHEET-1 — 좁은 화면에서 Select 의 "이미지 변경"으로 왔다면
         고른 요소로 돌아간다(셸이 정한다 — 넓은 화면은 그대로 둔다). */
      if (typeof window.handleStudioImageAttached === "function") {
        window.handleStudioImageAttached();
      }

    });

    actions.appendChild(attachButton);

    const deleteButton =
      document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className = "images-panel-card-delete";
    deleteButton.textContent = "삭제";

    /*
      STUDIO-LAYERS-MEDIA-1 — **막지 않는다**.

      예전에는 "지금 편집 중인 draft 가 쓰는 이미지"면 버튼을
      disabled 로 두고, 저장/발행된 버전이 쓰는 이미지는
      delete_skin_image() RPC 가 거절하게 두었다. 그래서 한 번이라도
      Save 한 이미지는 화면에서 비워도 **영영 지울 수 없었고** 용량도
      돌려받지 못했다.

      이제는 누르면 어디서 쓰는지 세어 보여 주고, 사용자가 확인하면
      사용처에서 떼고 지운다(handleImagesPanelDelete). "지금 쓰는
      중"이라는 사실은 버튼을 막는 대신 표식으로만 남긴다.
    */
    if (usedImageIds.has(image.id)) {
      deleteButton.title = "지금 이 스킨에서 쓰고 있는 사진이에요.";
      card.classList.add("images-panel-card--in-use");
    }

    deleteButton.addEventListener("click", () => {
      handleImagesPanelDelete(image);
    });

    actions.appendChild(deleteButton);

    card.appendChild(actions);

    imagesPanelGrid.appendChild(card);

  });

}


/* =========================================================
   업로드 / 삭제
========================================================== */

/*
  파일 선택과 클립보드 붙여넣기가 공유하는 단 하나의 업로드 경로.
  검증(형식·용량)도, 개수 초과 등 서버가 돌려주는 오류 표시도 여기
  한 곳에서만 일어난다 — 두 입구가 서로 다른 규칙을 갖는 일이
  생기지 않게 한다.

  ★ 여기서 하지 않는 일: 슬롯 연결, Save, Publish. 업로드는
  라이브러리에 등록하는 것까지다(슬롯 연결은 사용자가 카드의
  "이 슬롯에 연결"을 눌러야, 저장은 Save를 눌러야 일어난다).
*/

async function uploadImagesPanelFile(file) {

  if (!file) {
    return;
  }

  if (imagesPanelIsBusy) {
    setImagesPanelMessage("먼저 진행 중인 업로드가 끝난 뒤에 올려주세요.", true);
    return;
  }

  const validation =
    window.skinImageLibrary.validateFile(file);

  if (!validation.ok) {
    setImagesPanelMessage(validation.message, true);
    return;
  }

  setImagesPanelBusy(true);
  setImagesPanelMessage("업로드 중...");

  try {

    const uploaded =
      await window.skinImageLibrary.upload(file);

    imagesPanelImages =
      [uploaded, ...imagesPanelImages];

    setImagesPanelMessage(
      imagesPanelSelectedSlot
        ? (
            imagesPanelFocusMode
              ? "업로드했어요. 카드의 \"이 자리에 넣기\"를 누르세요."
              : "업로드했어요. 카드의 \"이 슬롯에 연결\"을 눌러 연결하세요."
          )
        : "업로드했어요."
    );

    renderImagesPanelGrid();

  } catch (err) {

    console.error("[images-panel] upload failed", err);

    setImagesPanelMessage(
      err && err.message
        ? `업로드하지 못했어요: ${err.message}`
        : "업로드하지 못했어요. 다시 시도해주세요.",
      true
    );

  } finally {

    setImagesPanelBusy(false);

  }

}


function handleImagesPanelFileChange(event) {

  const file =
    event.target.files && event.target.files[0];

  /* 같은 파일을 다시 골라도 change가 뜨도록 즉시 비운다 */
  event.target.value = "";

  uploadImagesPanelFile(file);

}


/* =========================================================
   클립보드 붙여넣기

   ★ 파일 데이터만 본다(clipboardData.files / items의 kind ===
   "file"). text/html이나 text/uri-list가 함께 와도 무시한다 —
   그 안의 <img src>나 URL을 우리가 대신 내려받으면 사용자가
   고르지도 않은 외부 요청이 생기고, 남의 서버 이미지를 내
   라이브러리로 복사하는 경로가 된다. 붙여넣기 업로드는
   "클립보드에 이미지 비트가 실제로 있을 때"만이다.

   getAsFile()은 반드시 paste 핸들러 안에서 동기로 불러야 한다 —
   await 뒤에서는 clipboardData가 이미 비워져 있을 수 있다.
========================================================== */

function extractPastedImageFile(clipboardData) {

  if (!clipboardData) {
    return null;
  }

  const files =
    clipboardData.files
      ? Array.prototype.slice.call(clipboardData.files)
      : [];

  const pastedFile =
    files.find(
      (file) =>
        file &&
        typeof file.type === "string" &&
        file.type.indexOf("image/") === 0
    );

  if (pastedFile) {
    return pastedFile;
  }

  const items =
    clipboardData.items
      ? Array.prototype.slice.call(clipboardData.items)
      : [];

  for (let i = 0; i < items.length; i += 1) {

    const item = items[i];

    if (!item || item.kind !== "file") {
      continue;
    }

    if (typeof item.type !== "string" || item.type.indexOf("image/") !== 0) {
      continue;
    }

    const file = item.getAsFile();

    if (file) {
      return file;
    }

  }

  return null;

}


/*
  화면 캡처를 붙여넣으면 브라우저가 이름 없는 파일이나 "image.png"
  같은 뻔한 이름을 준다 — 그리드 캡션에서 서로 구분되지 않으므로
  붙여넣은 시각을 이름에 담는다. 이름만 바꿀 뿐 MIME/바이트는
  그대로다(검증도, 저장 경로 생성도 원래 규칙 그대로 돌아간다).
*/

const IMAGES_PANEL_GENERIC_PASTE_NAME = /^image[.](png|jpe?g|webp|gif)$/i;

function nameImagesPanelPastedFile(file) {

  if (file.name && !IMAGES_PANEL_GENERIC_PASTE_NAME.test(file.name)) {
    return file;
  }

  const subtype =
    String(file.type || "").slice("image/".length);

  const extension =
    subtype === "jpeg" ? "jpg" : (subtype || "png");

  const stamp =
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  try {
    return new File([file], `pasted-${stamp}.${extension}`, { type: file.type });
  } catch (err) {
    /* File 생성자를 못 쓰는 환경 — 이름만 포기하고 그대로 올린다 */
    console.warn("[images-panel] pasted file rename failed", err);
    return file;
  }

}


function handleImagesPanelPaste(event) {

  const file =
    extractPastedImageFile(event.clipboardData);

  if (!file) {
    /*
      이미지 비트가 없으면 아무것도 하지 않는다 — preventDefault도
      부르지 않아서 텍스트/URL/HTML 붙여넣기는 브라우저 기본
      동작에 그대로 맡겨진다.
    */
    return;
  }

  event.preventDefault();

  uploadImagesPanelFile(nameImagesPanelPastedFile(file));

}


/* =========================================================
   drag & drop (Skin Studio 파일 UX)

   DataTransfer는 clipboardData와 같은 모양(files / items)이라
   extractPastedImageFile()을 그대로 재사용한다 — "첫 번째 이미지
   파일 하나"를 고르는 규칙이 두 입구에서 갈리지 않는다. 이미지가
   아닌 파일(또는 텍스트만 있는 drag)은 메시지로만 알리고 아무것도
   올리지 않는다.
========================================================== */

function imagesPanelDragHasFiles(dataTransfer) {

  if (!dataTransfer) {
    return false;
  }

  const types =
    dataTransfer.types
      ? Array.prototype.slice.call(dataTransfer.types)
      : [];

  return types.indexOf("Files") !== -1;

}


function handleImagesPanelDrop(event) {

  const hadFiles =
    imagesPanelDragHasFiles(event.dataTransfer);

  imagesPanelDragDepth = 0;

  if (imagesPanelPasteZone) {
    imagesPanelPasteZone.classList.remove("images-panel-pastezone--dragover");
  }

  if (!hadFiles) {
    /* 텍스트/URL drag — 가로채지 않는다(붙여넣기와 같은 원칙) */
    return;
  }

  event.preventDefault();

  const file =
    extractPastedImageFile(event.dataTransfer);

  if (!file) {
    setImagesPanelMessage("PNG · JPG · WEBP · GIF 이미지 파일만 놓을 수 있어요.", true);
    return;
  }

  uploadImagesPanelFile(file);

}


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 삭제

   세 갈래다.

     쓰지 않는 사진   한 번 확인하고 지운다(예전과 같은 RPC).
     쓰는 사진        어디서 몇 곳에서 쓰는지 보여 주고, 사용자가
                      확인하면 **사용처에서 떼고** 지운다.
     준비 안 된 배포  새 RPC 가 없는 배포에서는 예전처럼 "사용 중이라
                      지울 수 없다"로 남는다(fail closed).

   ★ 어디를 세는가 — 두 곳이다

     지금 편집 중인 화면   메모리의 working draft
                           (getStudioImageSlotState — 아직 저장 안 됨)
     저장된 버전들         skin_version_image_slots
                           (공개 중 · 마지막 저장본 · 지난 저장본)

   ★ 되돌릴 수 없다

   Studio 의 ↶ 는 메모리 기록이라 지워진 파일을 되살리지 못한다.
   그래서 확인 문구에 그 말을 적고, 성공 메시지에도 "되돌릴 수 없다"를
   남긴다. 사용처에서 뗀 것(=슬롯 비우기)은 Save 전이면 ↶ 로 되돌릴
   수 있지만 **파일은 이미 없다** — 되살아나는 것처럼 보이지 않도록
   working draft 의 그 자리도 함께 비운다.

   ★ 순서 — 참조 → DB row → 파일

   파일부터 지우면 "URL 은 남았는데 그림이 없는" 화면이 된다. 그래서
   언제나 참조를 먼저 떼고(RPC 한 트랜잭션), 성공한 뒤에만 파일을
   지운다. 파일 삭제만 실패하면 그 사실을 분명히 말하고 다시 시도할
   수 있게 한다(아래 재시도 줄).
========================================================== */

/* 지금 편집 중인 화면에서 이 사진을 쓰는 자리들 */
function imagesPanelWorkingUses(imageId) {

  if (typeof window.getStudioImageSlotState !== "function") {
    return [];
  }

  const state =
    window.getStudioImageSlotState();

  if (!state || !Array.isArray(state.slots)) {
    return [];
  }

  return state.slots.filter(
    (slot) => slot.binding && slot.binding.imageId === imageId
  );

}


function describeImagesPanelUsage(working, usage) {

  const lines = [];

  if (working.length) {
    lines.push(
      `지금 편집 중인 화면 ${working.length}곳(${working.map((slot) => slot.label).join(" · ")})`
    );
  }

  if (usage.published) {
    lines.push(`공개 중인 스킨 ${usage.published}곳`);
  }

  if (usage.draft) {
    lines.push(`저장된 편집본 ${usage.draft}곳`);
  }

  if (usage.past) {
    lines.push(`지난 저장본 ${usage.past}곳`);
  }

  return lines;

}


/* 새 RPC 가 아직 없는 배포인가(migration 미적용) */
function imagesPanelMissingRpc(err) {

  const code =
    err && err.code ? String(err.code) : "";

  const message =
    err && err.message ? String(err.message) : "";

  return code === "PGRST202" ||
    code === "404" ||
    message.includes("delete_skin_image_everywhere");

}


async function runImagesPanelDelete(image, everywhere, working) {

  setImagesPanelBusy(true);
  setImagesPanelMessage("삭제 중...");

  try {

    let storageFailed =
      null;

    if (everywhere) {

      const result =
        await window.skinImageLibrary.removeEverywhere(image.id);

      if (!result.storageRemoved) {
        storageFailed = result.storagePath;
      }

      /*
        참조를 뗀 것은 저장된 버전들이다. 지금 편집 중인 화면의 그
        자리도 함께 비운다 — 파일이 없는 URL 을 Preview 가 계속
        가리키지 않게(그리고 다음 Save 가 없는 이미지를 다시 적지
        않게). 이것은 평소의 "비우기"와 같은 경로라 ↶ 한 칸이다.
      */
      working.forEach((slot) => {
        window.setStudioImageSlot(slot.name, null);
      });

    } else {

      await window.skinImageLibrary.remove(image.id);

    }

    imagesPanelImages =
      imagesPanelImages.filter((item) => item.id !== image.id);

    imagesPanelPendingObject =
      storageFailed || null;

    syncImagesPanelRetry();

    if (storageFailed) {

      setImagesPanelMessage(
        "사용처에서는 뺐지만 파일을 지우지 못했어요. 아래 \"파일 다시 지우기\"를 눌러 주세요.",
        true
      );

    } else {

      setImagesPanelMessage(
        everywhere
          ? "사용처에서 빼고 삭제했어요. 되돌릴 수 없어요."
          : "삭제했어요. 되돌릴 수 없어요."
      );

    }

    renderImagesPanelSlots();
    renderImagesPanelGrid();

  } catch (err) {

    console.error("[images-panel] delete failed", err);

    if (everywhere && imagesPanelMissingRpc(err)) {

      /* fail closed — 지울 수 없다는 사실을 분명히 말한다 */
      setImagesPanelMessage(
        "이 배포에서는 사용 중인 사진을 지울 수 없어요. " +
        "Supabase migration(20260923100000_delete_skin_image_everywhere.sql)이 " +
        "적용되면 사용할 수 있어요.",
        true
      );

    } else {

      setImagesPanelMessage(
        err && err.message
          ? `삭제하지 못했어요: ${err.message}`
          : "삭제하지 못했어요.",
        true
      );

    }

  } finally {

    setImagesPanelBusy(false);

  }

}


async function handleImagesPanelDelete(image) {

  const working =
    imagesPanelWorkingUses(image.id);

  let usage =
    { total: 0, published: 0, draft: 0, past: 0, versions: [] };

  setImagesPanelBusy(true);
  setImagesPanelMessage("사용처를 확인하는 중...");

  try {

    usage =
      await window.skinImageLibrary.usage(image.id);

  } catch (err) {

    console.error("[images-panel] usage lookup failed", err);

    setImagesPanelBusy(false);

    setImagesPanelMessage(
      "어디에서 쓰는지 확인하지 못해 삭제를 멈췄어요. 잠시 뒤 다시 시도해 주세요.",
      true
    );

    return;

  }

  setImagesPanelBusy(false);
  setImagesPanelMessage("");

  const count =
    working.length + usage.total;

  if (typeof window.openStudioConfirmDialog !== "function") {
    /* dialog 를 못 여는 문서 — 확인 없이 지우지 않는다 */
    setImagesPanelMessage("삭제 확인 창을 열 수 없어요.", true);
    return;
  }

  if (!count) {

    window.openStudioConfirmDialog({
      message:
        "이 사진을 삭제할까요? 파일이 완전히 지워지고 되돌릴 수 없어요.",
      confirmLabel: "삭제",
      cancelLabel: "취소",
      onConfirm: () => runImagesPanelDelete(image, false, working)
    });

    return;

  }

  const lines =
    describeImagesPanelUsage(working, usage);

  window.openStudioConfirmDialog({
    message:
      `이 이미지는 스킨의 ${count}곳에서 사용 중입니다.\n` +
      `${lines.join("\n")}\n\n` +
      "사용처에서 이미지를 비우고 파일을 삭제할까요?\n" +
      "공개 중인 화면의 그 자리는 비어 보이게 되고, 되돌릴 수 없어요.",
    confirmLabel: "사용처에서 제거하고 삭제",
    cancelLabel: "취소",
    onConfirm: () => runImagesPanelDelete(image, true, working)
  });

}


/* 파일만 남았을 때의 재시도 대상(storage_path) — 화면 상태다 */
async function retryImagesPanelObjectDelete() {

  const path =
    imagesPanelPendingObject;

  if (!path) {
    return;
  }

  setImagesPanelBusy(true);
  setImagesPanelMessage("파일을 지우는 중...");

  try {

    await window.skinImageLibrary.removeObject(path);

    imagesPanelPendingObject = null;

    setImagesPanelMessage("파일까지 지웠어요.");

  } catch (err) {

    console.error("[images-panel] storage retry failed", err);

    setImagesPanelMessage(
      err && err.message
        ? `파일을 지우지 못했어요: ${err.message}`
        : "파일을 지우지 못했어요.",
      true
    );

  } finally {

    setImagesPanelBusy(false);

    syncImagesPanelRetry();

  }

}

/* =========================================================
   열기 / 닫기
========================================================== */

async function openSkinImagesPanel() {

  if (!imagesPanelOverlay) {
    buildImagesPanelDom();
  }

  imagesPanelIsOpen = true;
  imagesPanelOverlay.hidden = false;

  setImagesPanelMessage("");

  /* STUDIO-LAYERS-MEDIA-1 — 안내만 보여 주는 두 경우에도 ← 는
     보여야 한다(돌아갈 길이 없는 화면에 갇히지 않게). */
  syncImagesPanelHead();

  const state =
    window.getStudioImageSlotState();

  if (!state.hasWorkingSkin) {

    imagesPanelNotice.hidden = false;
    imagesPanelNotice.textContent =
      "Skin을 먼저 불러온 뒤에 사용할 수 있어요.";
    imagesPanelBody.hidden = true;
    imagesPanelFocusHead.hidden = true;

    return;

  }

  if (!state.available) {

    imagesPanelNotice.hidden = false;
    imagesPanelNotice.textContent =
      "이미지 라이브러리가 아직 준비되지 않았어요. " +
      "Supabase migration(20260907100000_create_skin_image_library.sql)이 " +
      "적용되면 사용할 수 있어요.";
    imagesPanelBody.hidden = true;
    imagesPanelFocusHead.hidden = true;

    return;

  }

  imagesPanelNotice.hidden = true;
  imagesPanelBody.hidden = false;

  renderImagesPanelSlots();

  /*
    열자마자 Ctrl+V가 통하도록 업로드 영역에 포커스를 준다 —
    "클릭 후 붙여넣기"도 물론 그대로 동작한다. Escape는 document
    리스너가 받으므로 여기 포커스가 있어도 닫힌다.
  */
  imagesPanelPasteZone.focus();

  imagesPanelGrid.innerHTML = "";

  setImagesPanelBusy(true);

  try {

    imagesPanelImages =
      await window.skinImageLibrary.list();

  } catch (err) {

    console.error("[images-panel] list failed", err);

    imagesPanelImages = [];

    setImagesPanelMessage("내 이미지를 불러오지 못했어요.", true);

  } finally {

    setImagesPanelBusy(false);

  }

  renderImagesPanelGrid();

}


function closeSkinImagesPanel() {

  imagesPanelIsOpen = false;

  /* STUDIO-LAYERS-MEDIA-1 — "자리 하나" 는 **이번 방문에만** 산다.
     다음에 이름 없이 열리면 목록 폴백이어야지, 지난번에 보던 남의
     자리를 머리에 크게 달고 뜨면 안 된다. 어느 자리인지 아는
     입구들은 열기 직전에 다시 알려 준다(setSkinImagesPanelSlot). */
  imagesPanelFocusMode = false;

  imagesPanelPendingObject = null;

  syncImagesPanelRetry();

  if (imagesPanelOverlay) {
    imagesPanelOverlay.hidden = true;
  }

  /* STUDIO-SHELL-1 — 왼쪽 패널이 이 내용을 보여 주고 있었다면 접는다 */
  if (typeof window.handleStudioLeftPanelContentClosed === "function") {
    window.handleStudioLeftPanelContentClosed("images");
  }

}


/* =========================================================
   DIRECT-UX-1 — Select 에서 이미지를 고르고 "이미지 변경"을 누르면
   그 이미지의 슬롯을 고른 채로 패널이 열린다. 여기서는 어느 슬롯을
   고를지만 적어 두고, 실제로 여는 것은 셸이다(showStudioLeftPanelMode).
   이미 열려 있으면 목록을 다시 그린다. 연결은 지금처럼 사용자가
   "이 슬롯에 연결"을 눌러야 일어난다(setStudioImageSlot = ↶ 한 칸).

   ★ STUDIO-LAYERS-MEDIA-1 — 이름이 오면 **자리 하나 화면**이다.

   이 창구를 부르는 곳은 전부 "어느 자리인가"를 알고 있다(Layers 의
   사진 행 · Select 의 "이미지 변경" · Layout 의 제목 로고 · Layers
   아래의 스킨 이미지 구역). 그래서 이름이 오면 focus 로 켠다.
   목록 화면으로 돌아가고 싶으면 `{ focus: false }` 다.
========================================================== */

function setSkinImagesPanelSlot(slotName, options) {

  if (typeof slotName !== "string" || !slotName) {
    return;
  }

  imagesPanelFocusMode =
    !(options && options.focus === false);

  imagesPanelSelectedSlot =
    slotName;

  if (imagesPanelIsOpen && imagesPanelSlotList && imagesPanelGrid) {
    renderImagesPanelSlots();
    renderImagesPanelGrid();
  }

}


if (typeof window !== "undefined") {

  window.openSkinImagesPanel = openSkinImagesPanel;
  window.closeSkinImagesPanel = closeSkinImagesPanel;
  window.setSkinImagesPanelSlot = setSkinImagesPanelSlot;

}
