/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: Quick Bar · 겹친 요소 메뉴 ·
   hover 이름표 · 숨기기 · 앞으로/뒤로 (DIRECT-UX-1)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §3 · §4 · §6 · §8

   Preview 위에 남는 것은 여전히 테두리 · 이름표 · 핸들이다. 이 파일이
   더하는 것은 **작은** 것 셋이다:

     Quick Bar       선택 테두리 옆의 버튼 줄 — 이미지 변경 · 앞으로 ·
                     뒤로 · 숨기기/보이기 · AI로 수정. 상세 폼이 아니다.
                     좁은 화면(720px 이하)에서는 요소 위에 띄우지 않고
                     아래 시트(Select 패널) 맨 위에 들어간다.
     겹친 요소 메뉴  "무엇을 선택할까요?" — 한 자리에 서로를 담지 않는
                     후보가 여럿일 때만(preview-inspect-direct.js).
                     좁은 화면에서는 아래 시트 모양.
     hover 이름표    포인터가 올라간 요소의 이름.

   ★ 새 편집 경로를 만들지 않는다
     숨기기는 이 요소 규칙의 display 한 줄, 앞으로/뒤로는 자유 배치의
     겹침 순서(data-imory-item-z) 또는 형제 순서 — 전부 이미 있던
     applyStudioInspectorPatch / commitStudioInspectorLayoutItemParam /
     moveStudioInspectorLayoutChild 를 지난다. 그래서 한 번 누르면
     상단 ↶ 한 칸이다.

   ★ 삭제 · 복제 버튼은 없다(지원하지 않는 기능은 만들지 않는다).

   의존(호출 시점): studio-inspector-state.js · -overlay.js
   (studioInspectorMapRect / studioInspectorFrameGeometry /
   studioInspectorLabelTopBound) · -edit.js · -layout.js · -names.js,
   studio-preview.js(postInspectorChooseToFrame /
   postInspectorParentToFrame / showStudioToast).
========================================================== */


let studioInspectorQuickBar = null;

let studioInspectorQuickBarButtons = {};

let studioInspectorHoverLabel = null;

let studioInspectorPickMenu = null;

let studioInspectorPickList = null;

/* 겹친 요소 메뉴가 떠 있는 동안의 후보(프레임이 보낸 좌표 · 식별자) */
let studioInspectorPickCandidates = [];

const studioInspectorNarrowQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 720px)")
    : null;


function studioInspectorIsNarrow() {
  return !!(studioInspectorNarrowQuery && studioInspectorNarrowQuery.matches);
}


/* =========================================================
   DOM — buildStudioInspectorLayer() 가 한 번 부른다
========================================================== */

function buildStudioInspectorQuickBar(layer) {

  if (studioInspectorQuickBar) {
    return;
  }

  studioInspectorQuickBar =
    document.createElement("div");

  studioInspectorQuickBar.className =
    "studio-inspector-quickbar";

  studioInspectorQuickBar.id =
    "studioInspectorQuickBar";

  studioInspectorQuickBar.setAttribute("role", "toolbar");

  studioInspectorQuickBar.setAttribute("aria-label", "선택한 요소");

  studioInspectorQuickBar.hidden =
    true;

  const make = (key, id, glyph, label, handler) => {

    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "studio-inspector-quick";
    button.id = id;
    button.dataset.inspectorQuick = key;
    button.title = label;
    button.setAttribute("aria-label", label);

    const icon =
      document.createElement("span");

    icon.className = "studio-inspector-quick-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = glyph;

    const text =
      document.createElement("span");

    text.className = "studio-inspector-quick-text";
    text.textContent = label;

    button.appendChild(icon);
    button.appendChild(text);

    button.addEventListener("click", handler);

    studioInspectorQuickBar.appendChild(button);

    studioInspectorQuickBarButtons[key] = button;

    return button;

  };

  make("image", "studioInspectorQuickImage", "▣", "이미지 변경", openStudioInspectorImageChange);
  make("forward", "studioInspectorQuickForward", "↑", "앞으로", () => commitStudioInspectorOrder(1));
  make("backward", "studioInspectorQuickBackward", "↓", "뒤로", () => commitStudioInspectorOrder(-1));
  make("hide", "studioInspectorQuickHide", "◌", "숨기기", toggleStudioInspectorHidden);

  /* id 는 예전 "✦ AI 수정" 버튼의 것을 그대로 잇는다 — 하는 일도 같다
     (선택을 유지한 채 AI Assistant 를 연다, 전송하지 않는다). */
  make("ai", "studioInspectorAiButton", "✦", "AI로 수정", handleStudioInspectorAiRequest);

  buildStudioInspectorQuickOverflow();

  layer.appendChild(studioInspectorQuickBar);

  studioInspectorHoverLabel =
    document.createElement("div");

  studioInspectorHoverLabel.className =
    "studio-inspector-hover-label";

  studioInspectorHoverLabel.id =
    "studioInspectorHoverLabel";

  studioInspectorHoverLabel.setAttribute("aria-hidden", "true");

  studioInspectorHoverLabel.hidden =
    true;

  layer.insertBefore(studioInspectorHoverLabel, layer.firstChild);

  buildStudioInspectorPickMenu();

}


function buildStudioInspectorPickMenu() {

  studioInspectorPickMenu =
    document.createElement("div");

  studioInspectorPickMenu.className =
    "studio-inspector-pick";

  studioInspectorPickMenu.id =
    "studioInspectorPickMenu";

  studioInspectorPickMenu.setAttribute("role", "dialog");

  studioInspectorPickMenu.setAttribute("aria-labelledby", "studioInspectorPickTitle");

  studioInspectorPickMenu.hidden =
    true;

  const title =
    document.createElement("p");

  title.className = "studio-inspector-pick-title";
  title.id = "studioInspectorPickTitle";
  title.textContent = "무엇을 선택할까요?";

  studioInspectorPickList =
    document.createElement("div");

  studioInspectorPickList.className =
    "studio-inspector-pick-list";

  studioInspectorPickList.setAttribute("role", "menu");

  studioInspectorPickMenu.appendChild(title);
  studioInspectorPickMenu.appendChild(studioInspectorPickList);

  /* 레이어가 아니라 셸에 붙인다 — 좁은 화면에서 아래 시트(z 8)
     위에 떠야 하는데 레이어는 z 7 이다. */
  (studioInspectorShell || document.body).appendChild(studioInspectorPickMenu);

}


/* =========================================================
   겹친 요소 메뉴
========================================================== */

function hideStudioInspectorPickMenu() {

  studioInspectorPickCandidates = [];

  if (studioInspectorPickMenu) {
    studioInspectorPickMenu.hidden = true;
  }

  if (studioInspectorHoverBox) {

    /* sandbox 프레임은 hover 테두리를 프레임 안에서 그린다 — 메뉴가
       잠깐 비춘 자리만 걷는다 */
    if (studioInspectorRemoteOverlay) {
      studioInspectorHoverBox.hidden = true;
    } else {
      paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);
    }

  }

}


function isStudioInspectorPickMenuOpen() {
  return !!studioInspectorPickMenu && !studioInspectorPickMenu.hidden;
}


function showStudioInspectorPickMenu(data) {

  if (!studioInspectorPickMenu || !Array.isArray(data.candidates) || !data.candidates.length) {
    return;
  }

  /* 프레임이 보낸 식별자는 draft 에 실제로 있는 것만 받는다 —
     이름을 붙일 수 없는 후보는 칸을 만들지 않는다. */
  const entries =
    data.candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate && window.isValidInspectorEditId(candidate.editId))
      .map(({ candidate, index }) => {

        const described =
          studioInspectorDescribeEditId(candidate.editId);

        return described
          ? {
              index,
              candidate,
              name: candidate.outer ? `바깥 영역 · ${described.name}` : described.name,
              hint: studioInspectorNameIsGeneric(described.name) ? described.text : ""
            }
          : null;

      })
      .filter(Boolean);

  if (entries.length < 2) {

    /* 이름을 붙일 수 있는 후보가 하나뿐이면 묻지 않고 그것을 고른다 */
    if (entries.length === 1) {
      window.postInspectorChooseToFrame(entries[0].index);
    }

    return;

  }

  studioInspectorPickCandidates = entries;

  studioInspectorPickList.innerHTML = "";

  entries.forEach((entry) => {

    const item =
      document.createElement("button");

    item.type = "button";
    item.className = "studio-inspector-pick-item";
    item.setAttribute("role", "menuitem");
    item.dataset.inspectorPickIndex = String(entry.index);

    if (entry.candidate.outer) {
      item.classList.add("is-outer");
    }

    const name =
      document.createElement("span");

    name.className = "studio-inspector-pick-name";
    name.textContent = entry.name;

    item.appendChild(name);

    if (entry.hint) {

      const hint =
        document.createElement("span");

      hint.className = "studio-inspector-pick-hint";
      hint.textContent = entry.hint;

      item.appendChild(hint);

    }

    if (entry.candidate.current) {

      const current =
        document.createElement("span");

      current.className = "studio-inspector-pick-current";
      current.textContent = "선택됨";

      item.appendChild(current);

      item.setAttribute("aria-current", "true");

    }

    /* 칸 위에 올리면 그 후보의 자리를 Preview 에 비춘다. sandbox 에서도
       같다 — 메뉴는 이 문서의 것이고 후보 좌표는 이미 이 문서의 것으로
       옮겨져 왔다(메뉴가 닫히면 걷는다). */
    const preview = () => {
      paintStudioInspectorBox(
        studioInspectorHoverBox,
        entry.candidate.visibleRect || entry.candidate.rect
      );
    };

    item.addEventListener("pointerenter", preview);
    item.addEventListener("focus", preview);

    item.addEventListener("click", () => {

      hideStudioInspectorPickMenu();

      window.postInspectorChooseToFrame(entry.index);

    });

    studioInspectorPickList.appendChild(item);

  });

  studioInspectorPickMenu.hidden = false;

  positionStudioInspectorPickMenu(data.point);

  const first =
    studioInspectorPickList.querySelector(".studio-inspector-pick-item");

  if (first) {
    first.focus({ preventScroll: true });
  }

}


function positionStudioInspectorPickMenu(point) {

  const menu =
    studioInspectorPickMenu;

  if (studioInspectorIsNarrow()) {

    /* 아래 시트 — 자리는 CSS 가 정한다 */
    menu.classList.add("is-sheet");
    menu.style.removeProperty("left");
    menu.style.removeProperty("top");

    return;

  }

  menu.classList.remove("is-sheet");

  const mapped =
    point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? studioInspectorMapRectRaw({ left: point.x, top: point.y, width: 0, height: 0 })
      : null;

  const shell =
    (studioInspectorShell || document.body).getBoundingClientRect();

  const width =
    menu.offsetWidth || 220;

  const height =
    menu.offsetHeight || 160;

  let left =
    mapped ? mapped.left + 8 : shell.left + 24;

  let top =
    mapped ? mapped.top + 8 : shell.top + 80;

  left = Math.min(left, shell.right - width - 8);
  top = Math.min(top, shell.bottom - height - 8);

  left = Math.max(shell.left + 8, left);
  top = Math.max(shell.top + 8, top);

  menu.style.left = `${Math.round(left - shell.left)}px`;
  menu.style.top = `${Math.round(top - shell.top)}px`;

}


/* 메뉴 밖을 누르면 닫는다. Preview(iframe) 를 누르면 이 문서에는
   pointerdown 이 오지 않는다 — 그 click 은 프레임이 새로 고르거나
   새 메뉴를 올리므로 그쪽에서 정리된다. */
document.addEventListener(
  "pointerdown",
  (event) => {

    if (isStudioInspectorPickMenuOpen() && !studioInspectorPickMenu.contains(event.target)) {
      hideStudioInspectorPickMenu();
    }

  },
  true
);


/* =========================================================
   hover 이름표 — hover 테두리 왼쪽 위 바깥(자리가 없으면 안쪽)
========================================================== */

function paintStudioInspectorHoverLabel(rect, editId) {

  const label =
    studioInspectorHoverLabel;

  if (!label) {
    return;
  }

  const sameAsSelection =
    !!studioInspectorSelection && studioInspectorSelection.editId === editId;

  const name =
    (rect && editId && !sameAsSelection && !studioInspectorDrag)
      ? studioInspectorNameForEditId(editId)
      : "";

  const mapped =
    name ? studioInspectorMapRect(rect) : null;

  if (!mapped) {
    label.hidden = true;
    return;
  }

  label.textContent = name;
  label.hidden = false;

  const frame =
    studioInspectorFrameGeometry().box;

  const height =
    label.offsetHeight || 18;

  const width =
    label.offsetWidth || 60;

  const outside =
    mapped.top - height - 2;

  const top =
    outside >= studioInspectorLabelTopBound(frame) ? outside : mapped.top + 2;

  const left =
    Math.max(frame.left + 2, Math.min(mapped.left, frame.right - width - 2));

  label.style.left = `${Math.round(left)}px`;
  label.style.top = `${Math.round(top)}px`;

}


/* =========================================================
   Quick Bar — 무엇을 보여 줄까
========================================================== */

/* 앞으로/뒤로가 할 수 있는 일.
     z      자유 배치 안 — 겹침 순서(data-imory-item-z)
     order  순서를 읽는 배치 안 — 형제 사이 한 칸 */
function studioInspectorOrderInfo(resolved) {

  const info =
    resolved && resolved.info;

  const layout =
    info && info.layout;

  if (!info || info.isProtectedRegion || !layout) {
    return { mode: null };
  }

  if (layout.parentType === "free" && typeof SKIN_LAYOUT_ITEM_RULES === "object") {

    const rule =
      SKIN_LAYOUT_ITEM_RULES.z || { min: 0, max: 99 };

    const current =
      Number(layout.item && layout.item.params && layout.item.params.z) || 0;

    return {
      mode: "z",
      current,
      canForward: current < rule.max,
      canBackward: current > rule.min
    };

  }

  if (info.capabilities.reorder) {

    return {
      mode: "order",
      canForward: layout.index > 0,
      canBackward: layout.index < layout.siblingCount - 1
    };

  }

  return { mode: null };

}


function studioInspectorIsHidden(resolved) {

  if (!resolved) {
    return false;
  }

  const target =
    studioInspectorHiddenTarget(resolved);

  return window.readInspectorControlValue(
    "hidden",
    window.readInspectorEditDeclarations(resolved.source.css, target.editId)
  ) === "hidden";

}


function renderStudioInspectorQuickBar(resolved, blocked) {

  const bar =
    studioInspectorQuickBar;

  if (!bar) {
    return;
  }

  /* 다른 요소로 바뀌면(또는 선택이 풀리면) 펼쳐 둔 ··· 메뉴는 닫는다 */
  setStudioInspectorQuickMenuOpen(false);

  if (!resolved) {
    bar.hidden = true;
    return;
  }

  const info =
    resolved.info;

  const order =
    blocked ? { mode: null } : studioInspectorOrderInfo(resolved);

  const buttons =
    studioInspectorQuickBarButtons;

  buttons.image.hidden =
    blocked || !info.capabilities.imageSource;

  buttons.forward.hidden =
    buttons.backward.hidden = !order.mode;

  if (order.mode) {

    const forwardLabel =
      order.mode === "z" ? "앞으로" : "순서 앞으로";

    const backwardLabel =
      order.mode === "z" ? "뒤로" : "순서 뒤로";

    studioInspectorSetQuickLabel(buttons.forward, forwardLabel,
      order.mode === "z" ? "다른 요소보다 앞으로 가져오기" : "형제 중 한 칸 앞으로");

    studioInspectorSetQuickLabel(buttons.backward, backwardLabel,
      order.mode === "z" ? "다른 요소보다 뒤로 보내기" : "형제 중 한 칸 뒤로");

    buttons.forward.disabled = !order.canForward;
    buttons.backward.disabled = !order.canBackward;

  }

  buttons.hide.hidden =
    blocked || info.isProtectedRegion;

  if (!buttons.hide.hidden) {

    const hidden =
      studioInspectorIsHidden(resolved);

    studioInspectorSetQuickLabel(
      buttons.hide,
      hidden ? "보이기" : "숨기기",
      hidden ? "숨긴 요소를 다시 보이게 하기" : "공개 화면에서 숨기기"
    );

    buttons.hide.setAttribute("aria-pressed", String(hidden));

  }

  bar.hidden = false;

  paintStudioInspectorQuickBar(
    studioInspectorSelection
      ? (studioInspectorSelection.visibleRect || studioInspectorSelection.rect)
      : null
  );

}


function studioInspectorSetQuickLabel(button, label, tooltip) {

  const text =
    button.querySelector(".studio-inspector-quick-text");

  if (text) {
    text.textContent = label;
  }

  button.title = tooltip || label;

  button.setAttribute("aria-label", label);

}


/* =========================================================
   Quick Bar — 어디에 둘까

   데스크톱: 선택 테두리 오른쪽 위 **바깥**. 위에 자리가 없으면(Preview
   위쪽 경계 · Top Dock) 테두리 **아래** 바깥, 거기도 없으면 안쪽 위.
   가로는 Preview 프레임 안으로 눌러 넣는다 — 화면 가장자리를 넘지
   않는다. 좁은 화면: 요소 근처에 띄우지 않고 Select 시트 맨 위 자리
   (#studioInspectorQuickBarSlot)에 들어간다.
========================================================== */

const STUDIO_INSPECTOR_QUICKBAR_GAP = 6;


function paintStudioInspectorQuickBar(rect) {

  const bar =
    studioInspectorQuickBar;

  if (!bar || bar.hidden) {
    return;
  }

  const slot =
    document.getElementById("studioInspectorQuickBarSlot");

  if (studioInspectorIsNarrow() && slot) {

    if (bar.parentElement !== slot) {
      slot.appendChild(bar);
    }

    bar.classList.add("is-docked");
    bar.style.removeProperty("left");
    bar.style.removeProperty("top");
    bar.style.removeProperty("visibility");

    layoutStudioInspectorQuickBar();

    return;

  }

  if (bar.parentElement !== studioInspectorLayer && studioInspectorLayer) {
    studioInspectorLayer.appendChild(bar);
  }

  bar.classList.remove("is-docked");

  layoutStudioInspectorQuickBar();

  const mapped =
    rect ? studioInspectorMapRect(rect) : null;

  if (!mapped || studioInspectorDrag || studioInspectorCropDraft) {
    bar.style.visibility = "hidden";
    return;
  }

  bar.style.removeProperty("visibility");

  const frame =
    studioInspectorFrameGeometry().box;

  const width =
    bar.offsetWidth || 180;

  const height =
    bar.offsetHeight || 30;

  const topBound =
    studioInspectorLabelTopBound(frame);

  let top =
    mapped.top - height - STUDIO_INSPECTOR_QUICKBAR_GAP - 20;

  if (top < topBound) {

    top = mapped.top + mapped.height + STUDIO_INSPECTOR_QUICKBAR_GAP;

    if (top + height > frame.bottom - 2) {
      top = mapped.top + STUDIO_INSPECTOR_QUICKBAR_GAP + 20;
    }

  }

  /* 어느 자리든 Top Dock 밑으로 들어가지 않는다 — 요소가 Preview 맨
     위(바 밑)에 걸쳐 있으면 "아래"조차 바 안쪽일 수 있다. 바에 깔린
     버튼은 눌리지 않는다. */
  top = Math.max(top, topBound + 2);

  const left =
    Math.max(
      frame.left + 2,
      Math.min(mapped.left + mapped.width - width, frame.right - width - 2)
    );

  bar.style.left = `${Math.round(left)}px`;
  bar.style.top = `${Math.round(top)}px`;

}


if (studioInspectorNarrowQuery) {

  const repaint = () => {

    if (studioInspectorQuickBar && !studioInspectorQuickBar.hidden) {
      paintStudioInspectorQuickBar(
        studioInspectorSelection
          ? (studioInspectorSelection.visibleRect || studioInspectorSelection.rect)
          : null
      );
    }

    if (isStudioInspectorPickMenuOpen()) {
      hideStudioInspectorPickMenu();
    }

  };

  if (typeof studioInspectorNarrowQuery.addEventListener === "function") {
    studioInspectorNarrowQuery.addEventListener("change", repaint);
  } else if (typeof studioInspectorNarrowQuery.addListener === "function") {
    studioInspectorNarrowQuery.addListener(repaint);
  }

}


/* =========================================================
   MOBILE-SHEET-1 — 시트 머리의 Quick Bar 와 ··· 메뉴

   좁은 화면에서 Quick Bar 는 시트 **머리 한 줄**(요소 이름 · 단계
   버튼과 같은 줄)에 들어간다 — 접힌 시트에서도 보여야 하기 때문이다.
   그 줄은 390px 에서 버튼 서너 개 자리뿐이라, 넘치면 자주 쓰는 것만
   직접 두고 나머지는 ··· 가 여는 작은 목록으로 옮긴다. 가로 스크롤은
   만들지 않는다.

   ★ 버튼을 복제하지 않는다 — 같은 버튼 요소를 메뉴로 **옮길** 뿐이다
     (상단 바의 ··· 메뉴와 같은 원칙, IMORY_STUDIO_SHELL_DESIGN.md §6).
     그래서 id · 핸들러 · aria 가 한 벌이다.

   ★ 순서 — 이미지 변경 · AI로 수정 · 숨기기 · 앞으로 · 뒤로. 몇 개가
     직접 보일지는 그 줄의 실제 폭에서 잰다(단계 버튼이 둘인 "내용 보기"
     는 하나인 "접힘"보다 한 칸 좁다).
========================================================== */

const STUDIO_INSPECTOR_QUICK_ORDER =
  ["image", "forward", "backward", "hide", "ai"];

const STUDIO_INSPECTOR_QUICK_PRIORITY =
  ["image", "ai", "hide", "forward", "backward"];

/* 머리 줄의 버튼 한 칸(40px) + 사이 2px */
const STUDIO_INSPECTOR_QUICK_CELL = 42;

/* 요소 이름이 지켜야 할 최소 폭 — 이보다 좁으면 이름이 두세 글자로 잘린다 */
const STUDIO_INSPECTOR_QUICK_NAME_MIN = 104;


let studioInspectorQuickMore = null;

let studioInspectorQuickMenu = null;


function buildStudioInspectorQuickOverflow() {

  studioInspectorQuickMore =
    document.createElement("button");

  studioInspectorQuickMore.type = "button";
  studioInspectorQuickMore.className = "studio-inspector-quick studio-inspector-quick--more";
  studioInspectorQuickMore.id = "studioInspectorQuickMore";
  studioInspectorQuickMore.dataset.inspectorQuick = "more";
  studioInspectorQuickMore.title = "다른 동작";
  studioInspectorQuickMore.setAttribute("aria-label", "다른 동작");
  studioInspectorQuickMore.setAttribute("aria-haspopup", "true");
  studioInspectorQuickMore.setAttribute("aria-expanded", "false");
  studioInspectorQuickMore.setAttribute("aria-controls", "studioInspectorQuickMenu");
  studioInspectorQuickMore.hidden = true;

  const icon =
    document.createElement("span");

  icon.className = "studio-inspector-quick-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "···";

  studioInspectorQuickMore.appendChild(icon);

  studioInspectorQuickMore.addEventListener("click", () => {
    setStudioInspectorQuickMenuOpen(studioInspectorQuickMenu.hidden);
  });

  studioInspectorQuickMenu =
    document.createElement("div");

  studioInspectorQuickMenu.className = "studio-inspector-quick-menu";
  studioInspectorQuickMenu.id = "studioInspectorQuickMenu";
  studioInspectorQuickMenu.setAttribute("role", "group");
  studioInspectorQuickMenu.setAttribute("aria-label", "다른 동작");
  studioInspectorQuickMenu.hidden = true;

  /* 목록 안 버튼의 일(target 단계)이 끝난 뒤 여기서 닫는다 */
  studioInspectorQuickMenu.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      setStudioInspectorQuickMenuOpen(false);
    }
  });

  studioInspectorQuickBar.appendChild(studioInspectorQuickMore);
  studioInspectorQuickBar.appendChild(studioInspectorQuickMenu);

}


function setStudioInspectorQuickMenuOpen(open) {

  if (!studioInspectorQuickMenu || !studioInspectorQuickMore) {
    return;
  }

  const next =
    !!open && !studioInspectorQuickMore.hidden;

  studioInspectorQuickMenu.hidden = !next;

  studioInspectorQuickMore.setAttribute("aria-expanded", String(next));

}


function isStudioInspectorQuickMenuOpen() {

  return !!studioInspectorQuickMenu && !studioInspectorQuickMenu.hidden;

}


/* 시트 머리 줄에서 Quick Bar 에 남는 폭 → 직접 둘 버튼 수.
   셸 머리 밖(팝오버 안의 예전 자리)이면 제한하지 않는다. */
function studioInspectorQuickCapacity(slot) {

  const header =
    slot && slot.closest(".studio-left-panel-header");

  if (!header) {
    return Infinity;
  }

  const style =
    window.getComputedStyle(header);

  const gap =
    parseFloat(style.columnGap) || 0;

  let used =
    0;

  Array.from(header.children).forEach((child) => {

    /* 이름 · 손잡이(제 줄을 따로 쓴다) · 화면 밖 상태 문구는 세지 않는다 */
    if (
      child === slot ||
      child.classList.contains("studio-left-panel-heading") ||
      child.classList.contains("studio-left-panel-handle") ||
      child.getClientRects().length === 0 ||
      window.getComputedStyle(child).position === "absolute"
    ) {
      return;
    }

    used += child.offsetWidth + gap;

  });

  const inner =
    header.clientWidth -
    (parseFloat(style.paddingLeft) || 0) -
    (parseFloat(style.paddingRight) || 0);

  const available =
    inner - used - STUDIO_INSPECTOR_QUICK_NAME_MIN - gap;

  return Math.max(1, Math.floor((available + 2) / STUDIO_INSPECTOR_QUICK_CELL));

}


function layoutStudioInspectorQuickBar() {

  const bar =
    studioInspectorQuickBar;

  if (!bar || !studioInspectorQuickMore || !studioInspectorQuickMenu) {
    return;
  }

  const buttons =
    studioInspectorQuickBarButtons;

  /* 먼저 전부 제자리로(원래 순서) */
  STUDIO_INSPECTOR_QUICK_ORDER.forEach((key) => {
    if (buttons[key] && buttons[key].parentElement !== bar) {
      bar.insertBefore(buttons[key], studioInspectorQuickMore);
    }
  });

  const docked =
    bar.classList.contains("is-docked") && !bar.hidden;

  const shown =
    STUDIO_INSPECTOR_QUICK_PRIORITY.filter((key) => buttons[key] && !buttons[key].hidden);

  const capacity =
    docked ? studioInspectorQuickCapacity(bar.parentElement) : Infinity;

  if (shown.length <= capacity) {

    studioInspectorQuickMore.hidden = true;

    setStudioInspectorQuickMenuOpen(false);

    return;

  }

  const direct =
    Math.max(1, capacity - 1);

  shown.slice(direct).forEach((key) => {
    studioInspectorQuickMenu.appendChild(buttons[key]);
  });

  studioInspectorQuickMore.hidden = false;

}


/* 바깥을 누르거나 Preview 를 누르면(창 blur) 닫는다 */
document.addEventListener(
  "pointerdown",
  (event) => {

    if (
      !isStudioInspectorQuickMenuOpen() ||
      studioInspectorQuickMenu.contains(event.target) ||
      studioInspectorQuickMore.contains(event.target)
    ) {
      return;
    }

    setStudioInspectorQuickMenuOpen(false);

  },
  true
);


window.addEventListener("blur", () => setStudioInspectorQuickMenuOpen(false));


/* =========================================================
   숨기기 / 보이기

   이 요소의 직접 편집 규칙에 display:none 한 줄. 보이기는 그 줄을
   지운다 — 스킨 CSS 가 정한 원래 display 가 돌아온다. 이미지 정렬이
   남아 있으면(margin 두 줄) 그 정렬이 쓰던 display:block 을 되살린다.

   자른 이미지는 사진이 아니라 **프레임**을 숨긴다 — 사진만 숨기면
   빈 프레임이 자리를 차지하고 남는다.

   Select 모드의 Preview 에서는 숨긴 요소가 흐리게 보인다(다시 골라서
   보이기로 돌릴 수 있어야 하므로) — studioInspectorGhostHiddenCss.
   Select 를 끄면 공개 화면처럼 사라진다.
========================================================== */

function studioInspectorHiddenTarget(resolved) {

  const wrapper =
    (resolved && typeof studioInspectorCropWrapperOf === "function")
      ? studioInspectorCropWrapperOf(resolved.element, resolved.source.css)
      : null;

  return wrapper
    ? { editId: wrapper.id, isFrame: true }
    : { editId: studioInspectorSelection ? studioInspectorSelection.editId : null, isFrame: false };

}


function commitStudioInspectorHidden(hide) {

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved || resolved.info.isProtectedRegion) {
    return false;
  }

  const target =
    studioInspectorHiddenTarget(resolved);

  return applyStudioInspectorPatch((element, css) => {

    const declarations =
      window.readInspectorEditDeclarations(css, target.editId);

    if (hide) {

      declarations.display = "none";

    } else if (target.isFrame) {

      declarations.display = "block";

    } else if (declarations["margin-left"] !== undefined && declarations["margin-right"] !== undefined) {

      declarations.display = "block";

    } else {

      delete declarations.display;

    }

    return {
      css: window.writeInspectorEditDeclarations(css, target.editId, declarations)
    };

  });

}


function toggleStudioInspectorHidden() {

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved) {
    return;
  }

  const hide =
    !studioInspectorIsHidden(resolved);

  if (commitStudioInspectorHidden(hide)) {
    showStudioToast(hide ? "숨겼어요. 공개 화면에서는 보이지 않아요." : "다시 보이게 했어요.");
  }

}


/* Select 모드 Preview 사본의 CSS — 숨긴 요소를 흐리게 보여 준다.
   working draft 는 바뀌지 않는다(stampSkinForInspector 가 Preview 로
   나가는 사본에만 적용한다). */
const STUDIO_INSPECTOR_EDIT_RULE_PATTERN =
  /(\[data-imory-edit-id="([A-Za-z][A-Za-z0-9_-]*)"\]\[data-imory-edit-id="\2"\]\s*\{)([^{}]*)\}/g;


function studioInspectorGhostHiddenCss(css) {

  if (typeof css !== "string" || css.indexOf("display: none") === -1 && css.indexOf("display:none") === -1) {
    return css;
  }

  return css.replace(
    STUDIO_INSPECTOR_EDIT_RULE_PATTERN,
    (whole, head, editId, body) => {

      if (!/(^|;)\s*display\s*:\s*none\s*(;|$)/.test(body)) {
        return whole;
      }

      const rest =
        body
          .split(";")
          .filter((chunk) => chunk.trim() && !/^\s*display\s*:/.test(chunk))
          .map((chunk) => chunk.trim());

      rest.push("opacity: 0.35");
      rest.push("outline: 2px dashed #9aa4b2");
      rest.push("outline-offset: 2px");

      return `${head} ${rest.join("; ")}; }`;

    }
  );

}


/* =========================================================
   앞으로 / 뒤로
     z      겹침 순서 ±1 (규칙 범위 안에서)
     order  형제 사이 한 칸 — "앞으로" = 앞 순서
========================================================== */

function commitStudioInspectorOrder(direction) {

  const resolved =
    describeStudioInspectorSelection();

  const order =
    studioInspectorOrderInfo(resolved);

  if (!order.mode) {
    return false;
  }

  if (order.mode === "z") {

    const rule =
      SKIN_LAYOUT_ITEM_RULES.z || { min: 0, max: 99 };

    const next =
      Math.min(rule.max, Math.max(rule.min, order.current + direction));

    if (next === order.current) {
      return false;
    }

    return commitStudioInspectorLayoutItemParam("z", next === 0 ? "" : String(next));

  }

  if (direction > 0 ? !order.canForward : !order.canBackward) {
    return false;
  }

  return moveStudioInspectorLayoutChild(direction > 0 ? -1 : 1);

}


/* =========================================================
   이미지 변경 — 기존 Images 패널을 **이 요소의 슬롯**을 고른 채로 연다
========================================================== */

function openStudioInspectorImageChange() {

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved || !resolved.info.capabilities.imageSource) {
    return;
  }

  if (typeof window.setSkinImagesPanelSlot === "function") {
    window.setSkinImagesPanelSlot(resolved.info.imageSlot);
  }

  if (typeof window.showStudioLeftPanelMode === "function") {
    window.showStudioLeftPanelMode("images", { returnToSelect: true });
  } else if (typeof window.openSkinImagesPanel === "function") {
    window.openSkinImagesPanel();
  } else {
    showStudioToast("이미지 라이브러리를 열 수 없어요.", { isError: true });
  }

}


/* =========================================================
   바깥 영역 선택 — 프레임이 위로 한 칸 올라가 고른다
   (preview-inspect-direct.js selectParent). 반복 항목이면 **지금 고른
   그 복제본**의 바깥이어야 하므로 식별자로 찾지 않고 프레임이 들고
   있는 요소 참조에서 올라간다.
========================================================== */

function studioInspectorHasOuter(resolved) {

  const element =
    resolved && resolved.element;

  return !!(
    element &&
    element.parentElement &&
    element.parentElement !== element.ownerDocument.body
  );

}


function selectStudioInspectorOuter() {

  if (!studioInspectorSelection || typeof window.postInspectorParentToFrame !== "function") {
    return;
  }

  window.postInspectorParentToFrame();

}


if (typeof window !== "undefined") {

  window.commitStudioInspectorHidden = commitStudioInspectorHidden;
  window.commitStudioInspectorOrder = commitStudioInspectorOrder;
  window.selectStudioInspectorOuter = selectStudioInspectorOuter;

  /* MOBILE-SHEET-1 — 시트 머리의 버튼 수가 바뀌면(단계 변경) 셸이
     다시 재게 한다. ··· 목록의 Escape 도 셸이 먼저 받는다. */
  window.layoutStudioInspectorQuickBar = layoutStudioInspectorQuickBar;
  window.isStudioInspectorQuickMenuOpen = isStudioInspectorQuickMenuOpen;
  window.setStudioInspectorQuickMenuOpen = setStudioInspectorQuickMenuOpen;

}
