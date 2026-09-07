/* =========================================================
   SKIN STUDIO - IMAGES PANEL (Skin Image Library v0.1)

   SKIN_IMAGE_LIBRARY_PLAN.md 5절. studio/editor/import-editor.js와
   같은 형태의 별도 modal이다 — DOM은 처음 열 때 한 번만 만들고
   이후 재사용한다.

   화면 구성(왼쪽/오른쪽 2열):
     - 왼쪽 SLOTS: 지금 Skin이 선언한 imageSlots 목록. 각 슬롯의
       현재 연결 썸네일 + "비우기". 슬롯을 고르면 오른쪽에서 고른
       이미지가 그 슬롯에 연결된다.
     - 오른쪽 MY IMAGES: 업로드 영역(파일 선택 + 클립보드 붙여넣기)
       + 내 이미지 그리드. 각 이미지 카드에서 "연결"(선택된 슬롯으로)
       / "삭제".

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
let imagesPanelImages = [];
let imagesPanelIsBusy = false;


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

  const doneButton =
    document.createElement("button");

  doneButton.type = "button";
  doneButton.className = "images-panel-done-button";
  doneButton.textContent = "닫기";
  footer.appendChild(doneButton);

  modal.appendChild(footer);

  document.body.appendChild(overlay);

  imagesPanelOverlay = overlay;
  imagesPanelSlotList = slotList;
  imagesPanelGrid = grid;
  imagesPanelMessage = message;
  imagesPanelNotice = notice;
  imagesPanelFileInput = fileInput;
  imagesPanelUploadButton = uploadButton;
  imagesPanelPasteZone = pasteZone;
  imagesPanelPasteZonePick = pasteZonePick;
  imagesPanelBody = body;

  closeButton.addEventListener("click", closeSkinImagesPanel);
  doneButton.addEventListener("click", closeSkinImagesPanel);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeSkinImagesPanel();
    }
  });

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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && imagesPanelIsOpen) {
      closeSkinImagesPanel();
    }
  });

}


/* =========================================================
   슬롯 목록 렌더
========================================================== */

function renderImagesPanelSlots() {

  const state =
    window.getStudioImageSlotState();

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

    sub.className = "images-panel-slot-sub";
    sub.textContent =
      [
        slot.name,
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

      setImagesPanelMessage(`"${slot.label}" 슬롯을 비웠어요. Save를 눌러 저장하세요.`);

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
    attachButton.textContent =
      imagesPanelSelectedSlot ? "이 슬롯에 연결" : "연결";
    attachButton.disabled = !imagesPanelSelectedSlot;

    attachButton.addEventListener("click", () => {

      if (!imagesPanelSelectedSlot) {
        return;
      }

      const applied =
        window.setStudioImageSlot(imagesPanelSelectedSlot, image);

      if (!applied) {
        setImagesPanelMessage("이 슬롯에는 연결할 수 없어요.", true);
        return;
      }

      setImagesPanelMessage(
        `"${imagesPanelSelectedSlot}" 슬롯에 연결했어요. Save를 눌러 저장하세요.`
      );

      renderImagesPanelSlots();
      renderImagesPanelGrid();

    });

    actions.appendChild(attachButton);

    const deleteButton =
      document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className = "images-panel-card-delete";
    deleteButton.textContent = "삭제";

    /*
      "지금 편집 중인 draft가 쓰고 있는 이미지"는 버튼 자체를 막아
      실수를 줄인다. 그 밖에 "과거에 저장/발행된 버전이 쓰는
      이미지"는 여기서 알 수 없으므로, 최종 판정은 delete_skin_image()
      RPC가 하고(참조가 하나라도 있으면 거절) 그 메시지를 그대로
      보여준다.
    */
    if (usedImageIds.has(image.id)) {
      deleteButton.disabled = true;
      deleteButton.title = "지금 슬롯에 연결되어 있어요. 먼저 비워주세요.";
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
        ? "업로드했어요. 카드의 \"이 슬롯에 연결\"을 눌러 연결하세요."
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


async function handleImagesPanelDelete(image) {

  setImagesPanelBusy(true);
  setImagesPanelMessage("삭제 중...");

  try {

    await window.skinImageLibrary.remove(image.id);

    imagesPanelImages =
      imagesPanelImages.filter((item) => item.id !== image.id);

    setImagesPanelMessage("삭제했어요.");

    renderImagesPanelGrid();

  } catch (err) {

    console.error("[images-panel] delete failed", err);

    setImagesPanelMessage(
      err && err.message
        ? `삭제하지 못했어요: ${err.message}`
        : "삭제하지 못했어요.",
      true
    );

  } finally {

    setImagesPanelBusy(false);

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

  const state =
    window.getStudioImageSlotState();

  if (!state.hasWorkingSkin) {

    imagesPanelNotice.hidden = false;
    imagesPanelNotice.textContent =
      "Skin을 먼저 불러온 뒤에 사용할 수 있어요.";
    imagesPanelBody.hidden = true;

    return;

  }

  if (!state.available) {

    imagesPanelNotice.hidden = false;
    imagesPanelNotice.textContent =
      "이미지 라이브러리가 아직 준비되지 않았어요. " +
      "Supabase migration(20260907100000_create_skin_image_library.sql)이 " +
      "적용되면 사용할 수 있어요.";
    imagesPanelBody.hidden = true;

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

  if (imagesPanelOverlay) {
    imagesPanelOverlay.hidden = true;
  }

}


if (typeof window !== "undefined") {

  window.openSkinImagesPanel = openSkinImagesPanel;
  window.closeSkinImagesPanel = closeSkinImagesPanel;

}
