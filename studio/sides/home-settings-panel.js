/* =========================================================
   SKIN STUDIO — HOME 설정 (EDITORIAL-DEFAULT-SKIN-2)

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md §7

   Layout 패널(studio/sides/sides-panel.js 의 1·2·3단) **아래에** 붙는
   주인의 스킨 설정 다섯.

     모바일      좌우 영역을 모바일에서도 버튼으로 열까
     HOME 사진   자동 · 사진 없이 · 한 장 · 두 장 · 세 장
     HOME 제목   글자 제목 · 로고 이미지(EDITORIAL-CUSTOMIZATION-1)
     색          배경 · 글자 · 포인트 1 · 포인트 2 (+ 스킨 기본색으로)
     D-day      켜기 · 날짜 · 이름

   ★ 값 하나를 확정할 때마다 적용된다(Undo 한 칸 · dirty). 색은 고르는
     창을 닫을 때(change) 한 번 — 끄는 동안의 input 마다 기록하지 않는다.
   ★ 스킨이 그 설정을 읽지 않으면(사진 묶음 · 색 변수 · D-day 자리가
     없으면) 그 칸은 잠기고 이유가 나온다.
   ★ 개발자 낱말(regions · data-imory … · custom property)을 쓰지 않는다.

   의존(호출 시점): getStudioHomeSettings / setStudioHomeSetting
   (studio/studio-preview.js), skinColorContrast (skin/skin-settings.js).
========================================================== */

(function () {

  const section =
    document.getElementById("studioLeftPanelLayout");

  if (!section) {
    return;
  }

  const PHOTO_OPTIONS = [
    { value: "auto", name: "자동", desc: "채운 사진 수대로" },
    { value: "empty", name: "사진 없이", desc: "글자와 선만" },
    { value: "hero", name: "한 장", desc: "세로 사진 하나" },
    { value: "pair", name: "두 장", desc: "위아래 두 장" },
    { value: "triptych", name: "세 장", desc: "가운데가 큰 세 장" }
  ];

  const LAYOUT_NAMES = { empty: "사진 없이", hero: "한 장", pair: "두 장", triptych: "세 장" };

  const COLOR_ROLES = [
    { role: "background", name: "배경" },
    { role: "text", name: "글자" },
    { role: "accent", name: "포인트 1", desc: "제목 · 선택 표시 · 별" },
    { role: "accent2", name: "포인트 2", desc: "선 · 옅은 장식" }
  ];

  let built = false;

  const ui = {};


  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }


  function block(title, lead) {
    const wrap = el("section", "studio-home-setting");
    const head = el("h3", "studio-home-setting-title", title);
    wrap.appendChild(head);
    if (lead) {
      wrap.appendChild(el("p", "studio-sides-help", lead));
    }
    return wrap;
  }


  function apply(kind, value) {

    if (typeof window.setStudioHomeSetting !== "function") {
      return;
    }

    const result = window.setStudioHomeSetting(kind, value);

    if (!result || !result.ok) {
      ui.status.textContent = (result && result.message) || "바꾸지 못했어요.";
      return;
    }

    ui.status.textContent = "";

    sync();

  }


  function build() {

    if (built) {
      return;
    }

    built = true;

    const wrap = el("div", "studio-sides-panel studio-home-settings");


    /* --- 스킨 업데이트 (EDITORIAL-EXISTING-UPGRADE-1) ----- */

    /* 이미 만들어 둔 아이모리 기본 스킨에 나중에 생긴 기능을 넣어
       준다. 전체를 갈아끼우는 Import 가 아니라 모자란 구조만 채우고,
       한 번 누르면 채울 것이 없어져 칸 자체가 사라진다(= 두 번 눌러
       중복되지 않는다). 되돌리기는 상단 ↶ 한 칸이다. */

    const upgrade = block("스킨 업데이트");

    ui.upgrade = upgrade;

    ui.upgradeNote = el("p", "studio-sides-help studio-home-upgrade-note");
    ui.upgradeNote.setAttribute("aria-live", "polite");
    upgrade.appendChild(ui.upgradeNote);

    ui.upgradeButton = el("button", "studio-home-upgrade-button", "이 스킨 업데이트");
    ui.upgradeButton.type = "button";
    ui.upgradeButton.addEventListener("click", () => runUpgrade());
    upgrade.appendChild(ui.upgradeButton);

    wrap.appendChild(upgrade);


    /* --- 모바일 ------------------------------------------ */

    const mobile = block("모바일");

    const mobileRow = el("label", "studio-home-check");
    ui.mobile = el("input");
    ui.mobile.type = "checkbox";
    ui.mobile.className = "studio-home-mobile";
    ui.mobile.addEventListener("change", () => apply("mobile", ui.mobile.checked));
    mobileRow.append(ui.mobile, el("span", "", "좌우 영역을 모바일에서도 버튼으로 열기"));
    mobile.appendChild(mobileRow);

    ui.mobileNote = el("p", "studio-sides-help");
    mobile.appendChild(ui.mobileNote);

    wrap.appendChild(mobile);


    /* --- HOME 사진 --------------------------------------- */

    const photos = block("HOME 사진");

    const group = el("div", "studio-home-photo-options");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "HOME 사진 구성");

    ui.photoButtons = PHOTO_OPTIONS.map((option) => {

      const button = el("button", "studio-home-photo-option");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");
      button.dataset.value = option.value;
      button.append(el("span", "studio-home-photo-name", option.name), el("span", "studio-sides-desc", option.desc));
      button.addEventListener("click", () => apply("photos", option.value));
      button.addEventListener("keydown", (event) => {
        const keys = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"];
        if (keys.indexOf(event.key) === -1) return;
        event.preventDefault();
        const enabled = ui.photoButtons.filter((b) => !b.disabled);
        const at = enabled.indexOf(button);
        const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const target = enabled[(at + step + enabled.length) % enabled.length];
        if (target) {
          target.focus();
          target.click();
        }
      });
      group.appendChild(button);
      return button;

    });

    photos.appendChild(group);

    ui.photoNote = el("p", "studio-sides-help studio-home-photo-note");
    ui.photoNote.setAttribute("aria-live", "polite");
    photos.appendChild(ui.photoNote);

    wrap.appendChild(photos);


    /* --- HOME 제목 --------------------------------------- */

    const title = block("HOME 제목");

    ui.titleNote = el("p", "studio-sides-help");
    ui.titleNote.setAttribute("aria-live", "polite");
    title.appendChild(ui.titleNote);

    const titleRow = el("div", "studio-home-buttons");

    ui.titlePick = el("button", "studio-home-link", "로고 고르기");
    ui.titlePick.type = "button";
    ui.titlePick.addEventListener("click", () => openTitleLogoImages());

    ui.titleClear = el("button", "studio-home-link", "로고 지우기");
    ui.titleClear.type = "button";
    ui.titleClear.addEventListener("click", () => clearTitleLogo());

    titleRow.append(ui.titlePick, ui.titleClear);
    title.appendChild(titleRow);

    wrap.appendChild(title);


    /* --- 색 ---------------------------------------------- */

    const colors = block("색", "옅은 선과 흐린 글자는 이 네 색에서 저절로 만들어집니다.");

    ui.colorInputs = {};

    COLOR_ROLES.forEach((spec) => {

      const row = el("label", "studio-home-color");
      const input = el("input");
      input.type = "color";
      input.className = "studio-home-color-input";
      input.dataset.role = spec.role;
      input.addEventListener("change", () => commitColors());

      const text = el("span", "studio-home-color-text");
      text.append(el("span", "studio-home-color-name", spec.name));
      if (spec.desc) {
        text.append(el("span", "studio-sides-desc", spec.desc));
      }

      const hex = el("span", "studio-home-color-hex");

      row.append(input, text, hex);
      colors.appendChild(row);

      ui.colorInputs[spec.role] = { input, hex };

    });

    ui.contrast = el("p", "studio-home-warning");
    ui.contrast.setAttribute("role", "status");
    colors.appendChild(ui.contrast);

    ui.colorReset = el("button", "studio-home-link studio-home-color-reset", "스킨 기본색으로");
    ui.colorReset.type = "button";
    ui.colorReset.addEventListener("click", () => apply("colors", null));
    colors.appendChild(ui.colorReset);

    wrap.appendChild(colors);


    /* --- D-day ------------------------------------------- */

    const dday = block("D-day", "날짜를 넣으면 오른쪽 영역에 지난 날 수가 나옵니다(당일이 1일).");

    const ddayRow = el("label", "studio-home-check");
    ui.ddayOn = el("input");
    ui.ddayOn.type = "checkbox";
    ui.ddayOn.className = "studio-home-dday-on";
    ui.ddayOn.addEventListener("change", () => commitDday());
    ddayRow.append(ui.ddayOn, el("span", "", "D-day 보이기"));
    dday.appendChild(ddayRow);

    const dateRow = el("label", "studio-home-field");
    dateRow.append(el("span", "studio-home-field-name", "날짜"));
    ui.ddayDate = el("input");
    ui.ddayDate.type = "date";
    ui.ddayDate.className = "studio-home-dday-date";
    ui.ddayDate.addEventListener("change", () => commitDday({ turnOn: true }));
    dateRow.appendChild(ui.ddayDate);
    dday.appendChild(dateRow);

    const labelRow = el("label", "studio-home-field");
    labelRow.append(el("span", "studio-home-field-name", "이름"));
    ui.ddayLabel = el("input");
    ui.ddayLabel.type = "text";
    ui.ddayLabel.maxLength = 40;
    ui.ddayLabel.placeholder = "예: since we met";
    ui.ddayLabel.className = "studio-home-dday-label";
    ui.ddayLabel.addEventListener("change", () => commitDday());
    labelRow.appendChild(ui.ddayLabel);
    dday.appendChild(labelRow);

    ui.ddayNote = el("p", "studio-sides-help");
    dday.appendChild(ui.ddayNote);

    wrap.appendChild(dday);


    ui.status = el("p", "studio-sides-status studio-home-status");
    ui.status.setAttribute("role", "status");
    wrap.appendChild(ui.status);

    section.appendChild(wrap);

  }


  /* =========================================================
     스킨 업데이트 (EDITORIAL-EXISTING-UPGRADE-1)

     "무엇을 채울 수 있는가"는 Studio 가 판단하지 않는다 — 순수
     함수 하나가 답하고(describeImoryEditorialUpgrade) 여기는 그
     결과를 사람 말로 옮길 뿐이다. 적용도 한 함수를 부르는 것이
     전부라, 이 패널이 스킨의 HTML/CSS 를 직접 만지는 일이 없다.
  ========================================================== */

  function upgradePlan() {

    return typeof window.getStudioEditorialUpgrade === "function"
      ? window.getStudioEditorialUpgrade()
      : null;

  }


  function runUpgrade() {

    if (typeof window.applyStudioEditorialUpgrade !== "function") {
      return;
    }

    const result =
      window.applyStudioEditorialUpgrade();

    if (!result || !result.ok) {
      ui.status.textContent = (result && result.message) || "업데이트하지 못했어요.";
      return;
    }

    ui.status.textContent =
      `${result.steps.join(" · ")}을(를) 넣었어요. 되돌리려면 위쪽 되돌리기를 한 번 누르세요.`;

    sync();

  }


  function syncUpgrade() {

    const plan =
      upgradePlan();

    /* 아이모리 기본 스킨이 아니면 칸 자체를 두지 않는다 — 남의
       스킨에 "업데이트" 버튼이 서 있으면 안 된다. */
    ui.upgrade.hidden =
      !plan || !plan.isEditorial || (!plan.applicable && plan.upToDate);

    if (ui.upgrade.hidden) {
      ui.upgradeButton.hidden = true;
      ui.upgradeNote.textContent = "";
      return;
    }

    ui.upgradeButton.hidden = !plan.applicable;
    ui.upgradeButton.disabled = !plan.applicable;

    ui.upgradeNote.textContent =
      plan.applicable
        ? `이 스킨에는 아직 ${plan.steps.map((step) => step.name).join(" · ")}이(가) 없어요. ` +
          "지금 사진 · 색 · D-day · 단 구성과 직접 고친 부분은 그대로 두고 그 기능만 넣습니다."
        : plan.reason;

  }


  /* =========================================================
     HOME 제목 — 글자 제목과 로고 (EDITORIAL-CUSTOMIZATION-1)

     따로 저장하는 "모드"가 없다. 슬롯이 비어 있으면 글자 제목이고
     채우면 로고다 — 그래서 "이미지 모드인데 이미지가 없어 깨진
     아이콘이 뜬다"가 생길 수 없고, 로고를 지우면 글자 제목이 곧바로
     돌아온다. 로고를 넣고 빼는 일은 여느 이미지 슬롯과 똑같이
     Images 패널이 하고(= 업로드 · 되돌리기 계약도 그대로), 여기는
     지금 어느 쪽인지 말해 주고 그 슬롯으로 보내 주는 자리다.
  ========================================================== */

  function titleLogoState() {

    const state =
      typeof window.getStudioHomeSettings === "function"
        ? window.getStudioHomeSettings()
        : null;

    return (state && state.titleLogo) || null;

  }


  function openTitleLogoImages() {

    const logo = titleLogoState();

    if (!logo || !logo.available) {
      return;
    }

    if (typeof window.setSkinImagesPanelSlot === "function") {
      window.setSkinImagesPanelSlot(logo.slot);
    }

    if (typeof window.showStudioLeftPanelMode === "function") {
      window.showStudioLeftPanelMode("images");
    }

  }


  function clearTitleLogo() {

    const logo = titleLogoState();

    if (!logo || !logo.filled || typeof window.setStudioImageSlot !== "function") {
      return;
    }

    if (!window.setStudioImageSlot(logo.slot, null)) {
      ui.status.textContent = "로고를 지우지 못했어요.";
      return;
    }

    ui.status.textContent = "";

    sync();

  }


  function currentColorValues(state) {

    const values = {};

    COLOR_ROLES.forEach(({ role }) => {
      values[role] =
        (state.colors && state.colors[role]) ||
        state.colorDefaults[role] ||
        "#000000";
    });

    return values;

  }


  function commitColors() {

    const colors = {};

    COLOR_ROLES.forEach(({ role }) => {
      colors[role] = ui.colorInputs[role].input.value;
    });

    apply("colors", colors);

  }


  function commitDday(options) {

    const date = ui.ddayDate.value;

    const turnOn = options && options.turnOn && !!date;

    if (turnOn) {
      ui.ddayOn.checked = true;
    }

    if (ui.ddayOn.checked && !date) {
      ui.status.textContent = "날짜를 먼저 골라 주세요.";
      ui.ddayOn.checked = false;
      return;
    }

    apply("dday", {
      enabled: ui.ddayOn.checked,
      date,
      label: ui.ddayLabel.value
    });

  }


  function sync() {

    if (!built) {
      return;
    }

    const state =
      typeof window.getStudioHomeSettings === "function"
        ? window.getStudioHomeSettings()
        : null;

    const lock = !state;


    /* 스킨 업데이트 */
    syncUpgrade();


    /* 모바일 */
    ui.mobile.disabled = lock || !state.hasSidesFrame;
    ui.mobile.checked = !!(state && state.mobilePanels);
    ui.mobileNote.textContent =
      !state ? "편집 중인 스킨이 없어요."
        : !state.hasSidesFrame ? "이 스킨의 HOME 에는 좌우 영역이 없어요."
          : !state.sidesOn ? "지금은 1단이라 좌우 영역이 없어요. 2단 · 3단을 고르면 적용됩니다."
            : state.mobilePanels ? "모바일에서는 위쪽 버튼을 눌러 좌우 영역을 엽니다."
              : "모바일에서는 좌우 영역을 두지 않고 가운데 HOME 만 보여 줍니다.";


    /* HOME 사진 */
    const photoLocked = lock || !state.hasPhotoSet;

    ui.photoButtons.forEach((button) => {
      const checked = !!state && button.dataset.value === state.photos;
      button.disabled = photoLocked;
      button.setAttribute("aria-checked", String(checked));
      button.tabIndex = checked ? 0 : -1;
    });

    if (!state) {
      ui.photoNote.textContent = "";
    } else if (!state.hasPhotoSet) {
      ui.photoNote.textContent = "이 스킨의 HOME 에는 사진 구성 자리가 없어요.";
    } else {
      const decided =
        typeof decideSkinHomePhotosLayout === "function"
          ? decideSkinHomePhotosLayout(state.photos, state.filledPhotos).layout
          : "";
      ui.photoNote.textContent =
        `채운 사진 ${state.filledPhotos}장 · 지금 보이는 모양: ${LAYOUT_NAMES[decided] || "-"}. ` +
        "사진은 Images 에서 넣고 바꿉니다.";
    }


    /* HOME 제목 */
    const logo = state ? state.titleLogo : null;

    ui.titlePick.disabled = !logo || !logo.available;
    ui.titleClear.disabled = !logo || !logo.available || !logo.filled;
    ui.titlePick.textContent = logo && logo.filled ? "로고 바꾸기" : "로고 고르기";

    ui.titleNote.textContent =
      !state ? ""
        : !logo || !logo.available ? "이 스킨의 HOME 제목은 글자로만 되어 있어요."
          : logo.filled ? "지금은 올린 로고 이미지가 제목 자리에 있어요. 지우면 블로그 이름 글자로 돌아갑니다."
            : "지금은 블로그 이름이 글자로 나옵니다. 투명 PNG 로고를 올리면 그 자리에 로고가 섭니다.";


    /* 색 */
    const colorLocked = lock || !state.usesColors;

    const values = state ? currentColorValues(state) : {};

    COLOR_ROLES.forEach(({ role }) => {
      const { input, hex } = ui.colorInputs[role];
      input.disabled = colorLocked;
      if (state) {
        input.value = values[role];
      }
      hex.textContent = state ? values[role].toUpperCase() : "";
    });

    ui.colorReset.disabled = colorLocked || !(state && state.colors);

    let warning = "";

    if (state && !state.usesColors) {
      warning = "이 스킨은 색 설정을 읽지 않아요. 색은 Code 나 AI 로 바꿉니다.";
    } else if (state && typeof skinColorContrast === "function") {
      const ratio = skinColorContrast(values.text, values.background);
      if (ratio !== null && ratio < 4.5) {
        warning = `글자와 배경의 대비가 낮아 읽기 어려울 수 있어요 (${ratio.toFixed(1)} : 1).`;
      }
    }

    ui.contrast.textContent = warning;


    /* D-day */
    const ddayLocked = lock || !state.usesDday;

    ui.ddayOn.disabled = ddayLocked;
    ui.ddayDate.disabled = ddayLocked;
    ui.ddayLabel.disabled = ddayLocked;

    if (state) {
      ui.ddayOn.checked = !!state.dday.enabled;
      if (document.activeElement !== ui.ddayDate) {
        ui.ddayDate.value = state.dday.date || "";
      }
      if (document.activeElement !== ui.ddayLabel) {
        ui.ddayLabel.value = state.dday.label || "";
      }
    }

    ui.ddayNote.textContent =
      state && !state.usesDday ? "이 스킨에는 D-day 자리가 없어요." : "";

  }


  function open() {

    build();

    sync();

  }


  window.openSkinHomeSettingsPanel = open;

  window.syncSkinHomeSettingsPanel = sync;

}());
