/* =========================================================
   SKIN STUDIO — HOME 단 구성 패널 (EDITORIAL-RESPONSIVE-HOME-1)

   기준 문서: IMORY_SIDES_DESIGN.md §6

   왼쪽 패널(Select · Images · Dock 과 같은 자리)의 "Layout" 내용.
   HOME 에 좌우 영역을 몇 개 둘지(1단 · 2단 · 3단)만 고른다.

     1단  가운데 HOME 만
     2단  가운데 + 오른쪽
     3단  왼쪽 + 가운데 + 오른쪽

   ★ 고르는 순간 적용된다(Undo 한 칸 · dirty). 적용/취소 단계가 없다 —
     값이 셋뿐이라 되돌리기는 상단 ↶ 하나로 충분하다
     (IMORY_STUDIO_SHELL_DESIGN.md 의 "되돌리는 곳은 하나").
   ★ 영역의 모양·폭·움직임은 여기서 고치지 않는다. 스킨(Code · AI)의
     몫이다. 모바일 패널을 열고 닫는 것은 Preview 안 버튼으로 한다 —
     그것은 저장되지 않는 화면 상태다.
   ★ 개발자 낱말(regions · data-imory-sides …)을 화면에 쓰지 않는다.

   의존(호출 시점): getStudioHomeSides / setStudioHomeSides
   (studio/studio-preview.js), skinSidesSettingForCount
   (skin/skin-sides.js), handleStudioLeftPanelContentClosed
   (studio/studio-shell.js).
========================================================== */

(function () {

  const section =
    document.getElementById("studioLeftPanelLayout");

  if (!section) {
    return;
  }

  const OPTIONS = [
    { count: 1, name: "1단", desc: "가운데 HOME 만" },
    { count: 2, name: "2단", desc: "가운데 + 오른쪽 영역" },
    { count: 3, name: "3단", desc: "왼쪽 + 가운데 + 오른쪽 영역" }
  ];

  let built = false;

  let optionButtons = [];

  let statusEl = null;


  function build() {

    if (built) {
      return;
    }

    built = true;

    const wrap = document.createElement("div");
    wrap.className = "studio-sides-panel";

    const lead = document.createElement("p");
    lead.className = "studio-sides-lead";
    lead.textContent = "HOME 을 몇 단으로 보여 줄지 고릅니다.";
    wrap.appendChild(lead);

    const group = document.createElement("div");
    group.className = "studio-sides-options";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "HOME 단 구성");

    optionButtons = OPTIONS.map((option) => {

      const button = document.createElement("button");
      button.type = "button";
      button.className = "studio-sides-option";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");
      button.dataset.count = String(option.count);

      const diagram = document.createElement("span");
      diagram.className = "studio-sides-diagram";
      diagram.setAttribute("aria-hidden", "true");
      diagram.dataset.count = String(option.count);

      ["left", "main", "right"].forEach((part) => {
        const cell = document.createElement("span");
        cell.className = `studio-sides-cell studio-sides-cell--${part}`;
        diagram.appendChild(cell);
      });

      const name = document.createElement("span");
      name.className = "studio-sides-name";
      name.textContent = option.name;

      const desc = document.createElement("span");
      desc.className = "studio-sides-desc";
      desc.textContent = option.desc;

      button.append(diagram, name, desc);

      button.addEventListener("click", () => choose(option.count));

      button.addEventListener("keydown", onOptionKeydown);

      group.appendChild(button);

      return button;

    });

    wrap.appendChild(group);

    const help = document.createElement("p");
    help.className = "studio-sides-help";
    help.textContent =
      "데스크톱에서는 HOME 옆 칼럼으로 보이고, 모바일에서는 위쪽 버튼을 눌러 여는 패널이 됩니다.";
    wrap.appendChild(help);

    statusEl = document.createElement("p");
    statusEl.className = "studio-sides-status";
    statusEl.setAttribute("role", "status");
    wrap.appendChild(statusEl);

    section.appendChild(wrap);

  }


  function onOptionKeydown(event) {

    const keys = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"];

    if (keys.indexOf(event.key) === -1) {
      return;
    }

    event.preventDefault();

    const enabled = optionButtons.filter((button) => !button.disabled);

    const at = enabled.indexOf(event.currentTarget);

    const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;

    const next = enabled[(at + step + enabled.length) % enabled.length];

    if (next) {
      next.focus();
      next.click();
    }

  }


  function choose(count) {

    if (typeof window.setStudioHomeSides !== "function" ||
        typeof window.skinSidesSettingForCount !== "function") {
      return;
    }

    const result =
      window.setStudioHomeSides(window.skinSidesSettingForCount(count));

    if (!result || !result.ok) {
      if (statusEl) {
        statusEl.textContent = (result && result.message) || "바꾸지 못했어요.";
      }
      return;
    }

    sync();

  }


  function sync() {

    if (!built) {
      return;
    }

    const state =
      typeof window.getStudioHomeSides === "function"
        ? window.getStudioHomeSides()
        : null;

    const markup = state ? state.markup : { frame: false, left: false, right: false };

    const available = {
      1: !!markup.frame,
      2: !!(markup.frame && markup.right),
      3: !!(markup.frame && markup.left && markup.right)
    };

    /* 왼쪽만 켠 설정은 1·2·3 어디에도 해당하지 않는다(JSON 으로만 생긴다) */
    const checked =
      state && !(state.left && !state.right) ? state.count : 0;

    optionButtons.forEach((button) => {

      const count = Number(button.dataset.count);

      button.disabled = !available[count];

      button.setAttribute("aria-checked", String(count === checked));

      button.tabIndex = count === checked || (!checked && count === 1) ? 0 : -1;

    });

    let message = "";

    if (!state) {
      message = "편집 중인 스킨이 없어요.";
    } else if (!markup.frame) {
      message = "이 스킨의 HOME 에는 좌우 영역을 둘 자리가 없어서 고를 수 없어요.";
    } else if (!available[3] || !available[2]) {
      message = "이 스킨이 그려 둔 영역까지만 고를 수 있어요.";
    } else if (state.left && !state.right) {
      message = "지금은 왼쪽 영역만 켜져 있어요.";
    }

    if (statusEl) {
      statusEl.textContent = message;
    }

  }


  function open() {

    build();

    sync();

    /* 같은 패널 아래쪽 — 모바일 · HOME 사진 · 색 · D-day
       (studio/sides/home-settings-panel.js, 이 파일 뒤에 로드) */
    if (typeof window.openSkinHomeSettingsPanel === "function") {
      window.openSkinHomeSettingsPanel();
    }

  }


  window.openSkinSidesPanel = open;

  window.syncSkinSidesPanel = sync;

}());
