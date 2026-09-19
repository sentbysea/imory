/* =========================================================
   SKIN STUDIO — BOTTOM DOCK 설정 패널 (BOTTOM-DOCK-1)

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md §9

   studio/images/images-panel.js 와 같은 형태다 — DOM 은 처음 열 때
   한 번 만들고 이후 재사용한다.

   STUDIO-SHELL-1 — 예전에는 화면 전체를 덮는 modal 이었다. 이제
   Studio 왼쪽 패널의 Dock 자리(#studioLeftPanelDock)에 들어가는
   **패널 내용**이다. 여닫기는 studio/studio-shell.js 가 정한다.
   셸이 다른 내용(Select/Images)으로 옮겨 가도 적용하지 않은 사본은
   버리지 않는다 — 다시 Dock 을 누르면 그 사본 그대로 보인다. 다만
   그 사이 working draft 가 바뀌었으면(Undo · AI · Import …) 옛
   사본으로 새 draft 를 덮지 않도록 새로 만든다(openSkinDockPanel).
   적용 · 취소 · 지우기 · Escape 는 예전처럼 사본을 끝내고, 셸에게
   알려 패널을 접게 한다.

   ── 사용자가 이해해야 하는 것은 넷뿐이다 ────────────────
     1) Dock 켜기/끄기
     2) 작은 열기 버튼의 모양
     3) Dock 안에 어떤 항목을 넣을지
     4) 각 항목을 누르면 어디로 갈지

   자리(position) · 처음 상태(defaultState) · 전환(종류/속도/움직임/
   방향) 칸은 **없다**. 이 패널이 만드는 dock 은 언제나 화면 아래에
   고정되고(fixed) 접힌 채로 시작한다(collapsed) — 평소에는 작은 열기
   버튼 하나만 보이고, 누르면 펼쳐지고, 다시 누르면 접힌다. 펼치고
   접는 움직임은 공용 전환 primitive 가 한다(저장된 transition 이
   있으면 그대로 두고, 없으면 조용한 기본값 하나).

   저장 모양과 렌더러는 그대로다 — position/defaultState/transition 은
   여전히 bottomDock 의 칸이고 Code · AI · 옛 데이터가 쓸 수 있다.
   이 패널이 그 칸을 **사용자에게 보이지 않을** 뿐이다.

   표시 방식도 넷만 보인다 — 아이콘 · 이모지 · 글자 · 이미지 주소.
   아이콘은 토큰을 적는 칸이 아니라 아이모리가 그리는 그림에서
   고른다(SKIN_DOCK_IMORY_ICONS · skin/skin-dock-icons.css). 옛
   데이터의 asset/svg 는 "이전 설정 그대로"로 보존된다.

   ── 무엇을 고치지 않는가 ───────────────────────────────
   dock 의 **생김새**(색·크기·글꼴)는 여기서 손대지 않는다. 그건
   templates.dock 과 스킨 CSS 의 몫이고, Code Editor 와 AI 가 그
   길이다.

   ── DB 를 건드리지 않는다 ──────────────────────────────
   setStudioBottomDock(studio/studio-preview.js) 하나만 부른다 —
   그쪽이 working draft · dirty · Preview 재렌더의 주인이다. 실제
   기록은 Save 가 새 버전 row 에 할 때뿐이다. 취소는 정말로
   아무 일도 일어나지 않은 것과 같다(패널이 자기 사본에서만
   작업하고, 적용을 눌러야 draft 에 넘긴다).

   classic script — window.openSkinDockPanel 로 노출된다.
   의존(먼저 로드되어야 함): skin/skin-bottom-dock.js(값 목록과
   정규화). getStudioBottomDock / getStudioBottomDockTargets /
   setStudioBottomDock(studio/studio-preview.js)은 **패널을 여는
   시점에만** 있으면 된다.
========================================================== */

let dockPanelOverlay = null;
let dockPanelBody = null;
let dockPanelMessage = null;
let dockPanelItemList = null;
let dockPanelTriggerHost = null;
let dockPanelIsOpen = false;

/*
  패널이 작업하는 **사본**. 적용을 누르기 전까지 working draft 는
  한 글자도 바뀌지 않는다.
*/
let dockPanelDraft = null;

/* 사본을 만든 순간의 working draft revision(studio-preview.js
   studioWorkingRevision). 다시 열 때 이 값이 그대로면 사본을 이어서
   보여 준다. */
let dockPanelDraftRevision = -1;

let dockPanelTargets = { categories: [], imageSlots: [] };

/* 항목 끌어 옮기기 — 지금 잡고 있는 항목의 index */
let dockPanelDragFrom = -1;

/*
  안내 문구를 보여 줄 대상(항목 객체 / 트리거 객체). 처음 추가한
  빈 항목에 곧바로 빨간 글자를 띄우지 않고, 손을 댄 뒤(표시 방식을
  바꿨거나 칸을 비운 채 나갔거나 적용을 눌렀을 때)부터 보인다.
*/
let dockPanelTouched = new WeakSet();


/* =========================================================
   이 패널이 만드는 dock 의 고정값
========================================================== */

const DOCK_PANEL_FIXED_POSITION = "fixed";
const DOCK_PANEL_FIXED_STATE = "collapsed";

/* 저장된 전환이 없을 때만 쓰는 기본 움직임 — 아래에서 살짝 올라오며
   나타난다. 사용자에게는 보이지 않는다. */
const DOCK_PANEL_DEFAULT_TRANSITION = {
  type: "fade-slide",
  duration: 200,
  easing: "smooth",
  direction: "up"
};

const DOCK_PANEL_DEFAULT_TRIGGER_LABEL = "메뉴 열기";


/* =========================================================
   라벨 — 저장값(enum)은 영어, 화면 글자는 한국어다.
========================================================== */

const DOCK_PANEL_VISUAL_LABELS = {
  icon: "아이콘",
  emoji: "이모지",
  text: "글자",
  image: "이미지 주소"
};

/* 옛 데이터(asset/svg)를 열었을 때만 보이는 선택지 */
const DOCK_PANEL_LEGACY_VISUAL_LABEL = "이전 설정 그대로";

const DOCK_PANEL_VISUAL_PLACEHOLDERS = {
  emoji: "예: ♡",
  text: "예: HOME",
  image: "https://..."
};

const DOCK_PANEL_ACTION_LABELS = {
  navigate: "화면 이동",
  action: "기능 실행",
  open: "패널 열기"
};

const DOCK_PANEL_NAVIGATE_LABELS = {
  home: "홈",
  highlights: "하이라이트",
  gallery: "첫 갤러리 카테고리",
  banner: "첫 배너 카테고리"
};

const DOCK_PANEL_ACTION_TARGET_LABELS = {
  write: "글쓰기 (주인장)",
  admin: "관리 화면 (주인장)",
  manage: "이 화면 관리 (주인장)",
  share: "이 주소 공유",
  theme: "라이트/다크 전환",
  top: "맨 위로"
};

/* 정규화(skin/skin-bottom-dock.js normalizeSkinDockAction)와 같은 규칙 */
const DOCK_PANEL_PATH_PATTERN = /^\/[A-Za-z0-9/_\-.?=&%]{0,255}$/;
const DOCK_PANEL_PANEL_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;


/* =========================================================
   기본값 — "처음 만들 때" 어떤 dock 이 생기는가

   3~5개를 권한다(요구사항 14절). 홈 하나만 두면 쓸모를 상상하기
   어렵고, 처음부터 많으면 지우는 일이 먼저가 된다. 그림은 전부
   아이모리 아이콘이라 어느 스킨에서도 보인다.
========================================================== */

function buildDefaultDockDraft() {

  return {
    visible: true,
    position: DOCK_PANEL_FIXED_POSITION,
    collapsible: true,
    defaultState: DOCK_PANEL_FIXED_STATE,
    transition: { ...DOCK_PANEL_DEFAULT_TRANSITION },
    trigger: { type: "icon", value: "menu", label: DOCK_PANEL_DEFAULT_TRIGGER_LABEL },
    items: [
      { id: "home", label: "home", audience: "all", visual: { type: "icon", value: "home" }, action: { type: "navigate", target: "home" } },
      { id: "highlights", label: "quotes", audience: "all", visual: { type: "icon", value: "quote" }, action: { type: "navigate", target: "highlights" } },
      { id: "top", label: "top", audience: "all", visual: { type: "icon", value: "top" }, action: { type: "action", target: "top" } }
    ]
  };

}


function dockPanelCloneDraft(dock) {

  return JSON.parse(JSON.stringify(dock));

}


function setDockPanelMessage(text, isError) {

  if (!dockPanelMessage) {
    return;
  }

  dockPanelMessage.textContent =
    text || "";

  dockPanelMessage.classList.toggle(
    "dock-panel-message--error",
    !!isError
  );

}


/* =========================================================
   작은 DOM 도우미 — innerHTML 로 사용자 값을 넣지 않는다
========================================================== */

function dockEl(tag, className, text) {

  const el =
    document.createElement(tag);

  if (className) {
    el.className = className;
  }

  if (text !== undefined && text !== null) {
    el.textContent = String(text);
  }

  return el;

}


function dockSelect(options, value, onChange) {

  const select =
    dockEl("select", "dock-panel-select");

  options.forEach(([optionValue, optionLabel]) => {

    const option =
      dockEl("option", null, optionLabel);

    option.value = optionValue;

    select.appendChild(option);

  });

  select.value = value;

  select.addEventListener("change", () => onChange(select.value));

  return select;

}


/*
  ★ 예시는 placeholder 로만 보인다. input.value 는 언제나 **실제로
    저장될 값**이다 — 비어 있으면 빈 값이다. 예시 글자가 값처럼
    보여서 "이미 ♡ 가 들어 있다"고 오해하지 않게 placeholder 는
    옅게 그린다(dock-panel.css).
*/
function dockTextInput(value, placeholder, onChange, maxLength, onBlur) {

  const input =
    dockEl("input", "dock-panel-input");

  input.type = "text";
  input.value = value || "";
  input.autocomplete = "off";
  input.spellcheck = false;

  if (placeholder) {
    input.placeholder = placeholder;
  }

  if (maxLength) {
    input.maxLength = maxLength;
  }

  input.addEventListener("input", () => onChange(input.value));

  if (onBlur) {
    input.addEventListener("blur", () => onBlur(input.value));
  }

  return input;

}


/*
  한 줄 = 라벨 + 컨트롤. 라디오가 아니라 select 를 쓰는 이유는
  항목 카드 안에도 같은 컨트롤이 여러 개 들어가서 — 390px 에서
  라디오 행이 줄바꿈되면 무엇이 무엇인지 읽기 어렵다.
*/
function dockRow(labelText, control, hintText) {

  const row =
    dockEl("div", "dock-panel-row");

  const label =
    dockEl("label", "dock-panel-label", labelText);

  row.appendChild(label);
  row.appendChild(control);

  if (hintText) {
    row.appendChild(dockEl("p", "dock-panel-hint", hintText));
  }

  return row;

}


/* =========================================================
   표시(visual) — 방식 고르기 · 값 입력 · 안내 문구
========================================================== */

function isDockPanelLegacyVisualType(type) {

  return (window.SKIN_DOCK_USER_VISUAL_TYPES || ["icon", "emoji", "text", "image"])
    .indexOf(type) === -1;

}


/*
  지금 고른 방식에 맞는 짧은 안내 문구 — 없으면 null.

  ★ 내부 경로("bottomDock.items[0].visual.value")를 보여 주지 않는다.
    사용자에게는 "무엇을 하면 되는지"만 말한다.
*/
function dockPanelVisualProblem(visual) {

  const type =
    visual ? visual.type : "";

  const value =
    visual && typeof visual.value === "string"
      ? visual.value.trim()
      : "";

  if (type === "icon") {
    return value ? null : "아이콘을 골라 주세요.";
  }

  if (type === "emoji") {
    return value ? null : "표시할 이모지를 입력해 주세요.";
  }

  if (type === "text") {
    return value ? null : "표시할 글자를 입력해 주세요.";
  }

  if (type === "image") {

    if (!value) {
      return "이미지 주소를 입력해 주세요.";
    }

    return /^https:\/\/[^\s"'<>]+$/i.test(value)
      ? null
      : "https:// 로 시작하는 이미지 주소를 입력해 주세요.";

  }

  /* 옛 asset/svg — 이 패널에서 고친 값이 아니므로 판단하지 않는다 */
  return null;

}


function dockPanelActionProblem(action) {

  if (!action) {
    return null;
  }

  const target =
    typeof action.target === "string" ? action.target : "";

  if (action.type === "navigate" && target.startsWith("path:")) {

    const path =
      target.slice("path:".length);

    return (
      DOCK_PANEL_PATH_PATTERN.test(path) &&
      path.indexOf("//") === -1 &&
      path.indexOf("..") === -1
    )
      ? null
      : "이동할 주소는 / 로 시작하는 이 블로그 안의 주소로 입력해 주세요. 예: /about";

  }

  if (action.type === "open") {

    return DOCK_PANEL_PANEL_PATTERN.test(target.replace(/^panel:/, ""))
      ? null
      : "패널 이름은 영문 소문자로 입력해 주세요.";

  }

  return null;

}


function dockPanelItemProblem(item) {

  return dockPanelVisualProblem(item.visual) || dockPanelActionProblem(item.action);

}


/*
  안내 문구 한 줄 — 카드(또는 열기 버튼 구역) 맨 아래에 붙는다.
  owner 는 항목 객체 / 트리거 객체, compute 는 지금 문제를 돌려준다.
*/
function syncDockPanelError(errorEl, owner, compute) {

  const problem =
    dockPanelTouched.has(owner) ? compute() : null;

  errorEl.textContent =
    problem || "";

  errorEl.hidden =
    !problem;

  return problem;

}


/*
  아이콘 고르기 — 아이모리가 그리는 그림 목록.

  ★ 토큰 이름("home")은 화면 어디에도 나오지 않는다. 그림과 한국어
    이름(title/aria-label)만 보인다.
*/
function buildDockIconPicker(visual, onPick) {

  const picker =
    dockEl("div", "dock-panel-icons");

  picker.setAttribute("role", "radiogroup");
  picker.setAttribute("aria-label", "아이콘");

  const icons =
    window.SKIN_DOCK_IMORY_ICONS || [];

  const known =
    icons.some((icon) => icon.token === visual.value);

  const choices =
    icons.map((icon) => ({ token: icon.token, label: icon.label, draw: true }));

  /*
    스킨 고유의 낱말(Code · AI 가 적은 "cassette" 같은 값)은 목록에
    없다. 그 값을 지우지 않고 "이 스킨의 아이콘"으로 보여 준다 —
    다른 그림을 고르기 전까지 그대로 저장된다.
  */
  if (visual.value && !known) {
    choices.unshift({ token: visual.value, label: "이 스킨의 아이콘", draw: false });
  }

  choices.forEach((choice) => {

    const button =
      dockEl("button", "dock-panel-icon");

    button.type = "button";
    button.title = choice.label;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", choice.label);
    button.setAttribute("data-dock-icon-choice", choice.draw ? "imory" : "skin");

    const selected =
      choice.token === visual.value;

    button.setAttribute("aria-checked", selected ? "true" : "false");

    if (selected) {
      button.classList.add("dock-panel-icon--selected");
    }

    if (choice.draw) {

      const glyph =
        dockEl("span", "dock-panel-icon-glyph");

      glyph.setAttribute("data-imory-dock-icon", choice.token);
      glyph.setAttribute("aria-hidden", "true");

      button.appendChild(glyph);

    } else {

      button.appendChild(dockEl("span", "dock-panel-icon-skin", "스킨"));

    }

    button.addEventListener("click", () => onPick(choice.token));

    picker.appendChild(button);

  });

  return picker;

}


/*
  표시 방식 + 표시 두 줄을 host 에 그린다. 항목과 열기 버튼이 같은
  함수를 쓴다.

  owner    안내 문구를 붙일 대상(항목/트리거 객체)
  refresh  방식이 바뀌어 칸 모양이 달라질 때 다시 그리는 함수
  onValue  값이 바뀔 때마다(안내 문구 갱신)
*/
function appendDockVisualRows(host, owner, visual, refresh, onValue) {

  const types =
    (window.SKIN_DOCK_USER_VISUAL_TYPES || ["icon", "emoji", "text", "image"]).slice();

  const options =
    types.map((type) => [type, DOCK_PANEL_VISUAL_LABELS[type] || type]);

  if (isDockPanelLegacyVisualType(visual.type)) {
    options.push([visual.type, DOCK_PANEL_LEGACY_VISUAL_LABEL]);
  }

  host.appendChild(
    dockRow(
      "표시 방식",
      dockSelect(
        options,
        visual.type,
        (value) => {
          visual.type = value;
          /* 이전 방식의 값을 새 방식에 끌고 가지 않는다 — 아이콘
             이름이 글자로, 이모지가 주소로 저장되는 일이 없게 */
          visual.value = "";
          dockPanelTouched.add(owner);
          refresh();
        }
      )
    )
  );


  let control;

  if (visual.type === "icon") {

    control =
      buildDockIconPicker(visual, (token) => {
        visual.value = token;
        dockPanelTouched.add(owner);
        refresh();
      });

  } else if (isDockPanelLegacyVisualType(visual.type)) {

    control =
      dockEl(
        "p",
        "dock-panel-note",
        "이전에 저장된 표시를 그대로 씁니다. 바꾸려면 위에서 다른 방식을 고르세요."
      );

  } else {

    const maxLength =
      visual.type === "emoji"
        ? (window.SKIN_DOCK_MAX_EMOJI_CHARS || 8)
        : visual.type === "text"
          ? (window.SKIN_DOCK_MAX_TEXT_CHARS || 24)
          : 2048;

    control =
      dockTextInput(
        visual.value,
        DOCK_PANEL_VISUAL_PLACEHOLDERS[visual.type] || "",
        (value) => {
          visual.value = value;
          onValue();
        },
        maxLength,
        (value) => {
          if (!value.trim()) {
            dockPanelTouched.add(owner);
          }
          onValue();
        }
      );

    if (visual.type === "image") {
      control.inputMode = "url";
    }

  }

  host.appendChild(dockRow("표시", control));

}


/* =========================================================
   독 열기 버튼(trigger)
========================================================== */

function renderDockTriggerSection() {

  const host =
    dockPanelTriggerHost;

  if (!host) {
    return;
  }

  host.innerHTML = "";

  const trigger =
    dockPanelDraft.trigger;

  host.appendChild(
    dockEl(
      "p",
      "dock-panel-hint dock-panel-hint--lead",
      "평소에는 이 버튼 하나만 화면 아래에 보입니다. 누르면 항목이 펼쳐지고, 다시 누르면 접힙니다."
    )
  );

  const error =
    dockEl("p", "dock-panel-error");

  error.setAttribute("role", "alert");

  const update =
    () => syncDockPanelError(error, trigger, () => dockPanelVisualProblem(trigger));

  appendDockVisualRows(host, trigger, trigger, renderDockTriggerSection, update);

  host.appendChild(error);

  update();

}


/* =========================================================
   항목 편집 카드 하나
========================================================== */

function buildDockItemCard(item, index) {

  const card =
    dockEl("div", "dock-panel-item");

  card.setAttribute("data-dock-item-index", String(index));


  /* ── 머리 줄: 끌기 손잡이 · 이름 · ↑↓ · 삭제 ──────── */

  const head =
    dockEl("div", "dock-panel-item-head");

  const grip =
    dockEl("span", "dock-panel-grip", "⠿");

  grip.setAttribute("aria-hidden", "true");

  /*
    카드 전체가 아니라 **손잡이를 잡았을 때만** 끌 수 있다. 카드 전체가
    draggable 이면 안쪽 입력 칸에서 글자를 고르거나 커서를 옮기는
    동작이 끌기로 바뀌는 브라우저가 있다.
  */
  grip.addEventListener("pointerdown", () => {
    card.setAttribute("draggable", "true");
  });

  grip.addEventListener("pointerup", () => {
    card.removeAttribute("draggable");
  });

  head.appendChild(grip);

  const nameEl =
    dockEl("span", "dock-panel-item-name", item.label || `${index + 1}번째 항목`);

  head.appendChild(nameEl);


  const moves =
    dockEl("div", "dock-panel-item-moves");

  /*
    ↑↓ 는 끌기의 보조가 아니라 **동등한 수단**이다. 끌기는 모바일과
    키보드에서 다루기 어렵고, 순서는 dock 의 핵심 설정이다
    (관리 화면의 메모 폴더 차례가 같은 이유로 둘 다 갖는다).
  */

  const up =
    dockEl("button", "dock-panel-move", "↑");

  up.type = "button";
  up.setAttribute("aria-label", "위로");
  up.disabled = index === 0;
  up.addEventListener("click", () => moveDockItem(index, index - 1));

  const down =
    dockEl("button", "dock-panel-move", "↓");

  down.type = "button";
  down.setAttribute("aria-label", "아래로");
  down.disabled = index === dockPanelDraft.items.length - 1;
  down.addEventListener("click", () => moveDockItem(index, index + 1));

  const remove =
    dockEl("button", "dock-panel-remove", "삭제");

  remove.type = "button";
  remove.addEventListener("click", () => {

    dockPanelDraft.items.splice(index, 1);

    renderDockItemList();

  });

  moves.appendChild(up);
  moves.appendChild(down);
  moves.appendChild(remove);

  head.appendChild(moves);

  card.appendChild(head);


  const error =
    dockEl("p", "dock-panel-error");

  error.setAttribute("role", "alert");

  const update =
    () => {
      const problem =
        syncDockPanelError(error, item, () => dockPanelItemProblem(item));
      card.classList.toggle("dock-panel-item--invalid", !!problem);
    };

  const rerender =
    () => replaceDockItemCard(card, item, index);


  /* ── 라벨 ─────────────────────────────────────────── */

  card.appendChild(
    dockRow(
      "라벨",
      dockTextInput(
        item.label,
        "예: 홈 (비워 두면 표시만 보입니다)",
        (value) => {
          item.label = value;
          nameEl.textContent = value || `${index + 1}번째 항목`;
        },
        24
      )
    )
  );


  /* ── 표시 방식 · 표시 ─────────────────────────────── */

  appendDockVisualRows(card, item, item.visual, rerender, update);


  /* ── 동작 · 이동할 곳 ─────────────────────────────── */

  const actionOptions =
    ["navigate", "action"].map((type) => [type, DOCK_PANEL_ACTION_LABELS[type]]);

  /* 패널 열기는 스킨 마크업이 있어야 동작하는 개발자용 동작이다 —
     이미 그렇게 저장된 항목에서만 보인다 */
  if (item.action.type === "open") {
    actionOptions.push(["open", DOCK_PANEL_ACTION_LABELS.open]);
  }

  card.appendChild(
    dockRow(
      "동작",
      dockSelect(
        actionOptions,
        item.action.type,
        (value) => {
          item.action.type = value;
          item.action.target =
            value === "navigate" ? "home"
              : value === "open" ? "panel:panel"
                : "top";
          rerender();
        }
      )
    )
  );

  card.appendChild(buildDockActionTargetRow(item, update, rerender));


  /* ── 누가 보는가 ─────────────────────────────────── */

  card.appendChild(
    dockRow(
      "보이는 사람",
      dockSelect(
        [
          ["all", "모두"],
          ["owner", "주인장만"],
          ["visitor", "방문자만"]
        ],
        item.audience || "all",
        (value) => {
          item.audience = value;
          rerender();
        }
      ),
      item.audience === "owner"
        ? "방문자에게는 이 항목이 보이지 않습니다."
        : null
    )
  );


  card.appendChild(error);

  update();

  return card;

}


/* 카드 하나만 다시 그린다 — 다른 카드의 입력 중인 칸을 흔들지 않게 */
function replaceDockItemCard(card, item, index) {

  if (!card.parentNode) {
    return;
  }

  card.parentNode.replaceChild(buildDockItemCard(item, index), card);

}


function buildDockActionTargetRow(item, update, rerender) {

  if (item.action.type === "navigate") {

    const options =
      SKIN_DOCK_NAVIGATE_TARGETS.map(
        (target) => [target, DOCK_PANEL_NAVIGATE_LABELS[target] || target]
      );

    dockPanelTargets.categories.forEach((category) => {
      options.push([`category:${category.id}`, `카테고리 · ${category.name}`]);
    });

    options.push(["path:", "이 블로그 안의 주소 직접 입력"]);

    const isKnown =
      options.some(([value]) => value === item.action.target);

    const select =
      dockSelect(
        options,
        isKnown ? item.action.target : "path:",
        (value) => {
          item.action.target = value === "path:" ? "path:/" : value;
          rerender();
        }
      );

    const wrap =
      dockEl("div", "dock-panel-target");

    wrap.appendChild(select);

    if (!isKnown || item.action.target.startsWith("path:")) {

      wrap.appendChild(
        dockTextInput(
          item.action.target.startsWith("path:")
            ? item.action.target.slice("path:".length)
            : "",
          "/about",
          (value) => {
            const trimmed = value.trim();
            item.action.target =
              "path:" + (trimmed.startsWith("/") ? trimmed : "/" + trimmed);
            update();
          },
          255,
          () => {
            dockPanelTouched.add(item);
            update();
          }
        )
      );

    }

    return dockRow("이동할 곳", wrap);

  }


  if (item.action.type === "open") {

    return dockRow(
      "패널 이름",
      dockTextInput(
        item.action.target.replace(/^panel:/, ""),
        "pair",
        (value) => {
          item.action.target = "panel:" + value.trim().toLowerCase();
          update();
        },
        32,
        () => {
          dockPanelTouched.add(item);
          update();
        }
      ),
      "스킨에 그 이름의 패널이 있어야 열립니다."
    );

  }


  return dockRow(
    "실행할 기능",
    dockSelect(
      SKIN_DOCK_ACTION_TARGETS.map(
        (target) => [target, DOCK_PANEL_ACTION_TARGET_LABELS[target] || target]
      ),
      item.action.target,
      (value) => {
        item.action.target = value;
        rerender();
      }
    ),
    ["write", "admin", "manage"].indexOf(item.action.target) !== -1
      ? "주인장에게만 보입니다."
      : null
  );

}


function moveDockItem(from, to) {

  if (
    !dockPanelDraft ||
    to < 0 ||
    to >= dockPanelDraft.items.length ||
    from === to
  ) {
    return;
  }

  const [moved] =
    dockPanelDraft.items.splice(from, 1);

  dockPanelDraft.items.splice(to, 0, moved);

  renderDockItemList();

}


function nextDockItemId() {

  const used =
    new Set(dockPanelDraft.items.map((item) => item.id));

  for (let i = 1; i < 100; i += 1) {

    const candidate = `item${i}`;

    if (!used.has(candidate)) {
      return candidate;
    }

  }

  return `item${Date.now()}`;

}


function renderDockItemList() {

  if (!dockPanelItemList) {
    return;
  }

  dockPanelItemList.innerHTML = "";

  dockPanelDraft.items.forEach((item, index) => {
    dockPanelItemList.appendChild(buildDockItemCard(item, index));
  });

  if (dockPanelDraft.items.length === 0) {

    dockPanelItemList.appendChild(
      dockEl("p", "dock-panel-empty", "항목이 없습니다. 아래에서 하나 추가해 보세요.")
    );

  }

}


/* =========================================================
   Dock 켜기/끄기
========================================================== */

function renderDockSettings(host) {

  host.innerHTML = "";

  host.appendChild(
    dockRow(
      "Dock",
      dockSelect(
        [["show", "사용"], ["hide", "사용 안 함"]],
        dockPanelDraft.visible ? "show" : "hide",
        (value) => {
          dockPanelDraft.visible = value === "show";
          renderDockSettings(host);
        }
      ),
      dockPanelDraft.visible
        ? null
        : "공개 화면에 Dock이 나오지 않습니다. 아래 설정은 그대로 남습니다."
    )
  );

}


/* =========================================================
   DOM (한 번만 만든다)
========================================================== */

function ensureDockPanelDom() {

  if (dockPanelOverlay) {
    return;
  }

  const overlay =
    dockEl("div", "dock-panel-overlay");

  const host =
    document.getElementById("studioLeftPanelDock");

  /* 바깥(어두운 배경)을 눌러 닫기 — modal 로 뜰 때만 */
  if (!host) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeSkinDockPanel();
      }
    });
  }


  const modal =
    dockEl("div", "dock-panel-modal");

  if (host) {
    modal.setAttribute("role", "region");
  } else {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
  }

  modal.setAttribute("aria-label", "Bottom Dock");


  const header =
    dockEl("div", "dock-panel-header");

  header.appendChild(dockEl("h2", "dock-panel-title", "BOTTOM DOCK"));

  header.appendChild(
    dockEl(
      "p",
      "dock-panel-subtitle",
      "화면 아래에 작은 열기 버튼이 떠 있고, 누르면 항목들이 펼쳐집니다. 색과 크기는 스킨이 정합니다."
    )
  );

  modal.appendChild(header);


  dockPanelBody =
    dockEl("div", "dock-panel-body");

  modal.appendChild(dockPanelBody);


  dockPanelMessage =
    dockEl("p", "dock-panel-message");

  dockPanelMessage.setAttribute("aria-live", "polite");

  modal.appendChild(dockPanelMessage);


  const footer =
    dockEl("div", "dock-panel-footer");

  const removeAll =
    dockEl("button", "dock-panel-button dock-panel-button--quiet", "Dock 지우기");

  removeAll.type = "button";
  removeAll.addEventListener("click", () => {

    const result =
      window.setStudioBottomDock(null);

    if (!result.ok) {
      setDockPanelMessage(result.message, true);
      return;
    }

    closeSkinDockPanel();

  });

  const cancel =
    dockEl("button", "dock-panel-button", "취소");

  cancel.type = "button";
  cancel.addEventListener("click", closeSkinDockPanel);

  const apply =
    dockEl("button", "dock-panel-button dock-panel-button--primary", "적용");

  apply.type = "button";
  apply.addEventListener("click", handleDockPanelApply);

  footer.appendChild(removeAll);
  footer.appendChild(cancel);
  footer.appendChild(apply);

  modal.appendChild(footer);

  overlay.appendChild(modal);

  (host || document.body).appendChild(overlay);

  dockPanelOverlay = overlay;


  /* Escape — 패널이 지금 Dock 을 **보여 주고 있을 때만**. 다른 내용을
     보는 동안 숨겨진 사본을 Escape 가 버리면 안 된다. */
  document.addEventListener("keydown", (event) => {

    if (!dockPanelIsOpen || event.key !== "Escape") {
      return;
    }

    if (
      host &&
      typeof window.isStudioLeftPanelShowing === "function" &&
      !window.isStudioLeftPanelShowing("dock")
    ) {
      return;
    }

    closeSkinDockPanel();

  });

}


/*
  적용할 모양 — 사용자가 고른 것 + 이 패널이 늘 정하는 것.

  ★ 자리는 화면 아래 고정, 처음 상태는 접힘, 접기는 켜짐 — 사용자가
    고르지 않는다. 전환은 저장된 것이 있으면 그대로(Code · AI 가 정한
    움직임을 지우지 않는다), 없으면 기본값.
*/
function buildDockPanelResult() {

  const draft =
    dockPanelCloneDraft(dockPanelDraft);

  draft.position = DOCK_PANEL_FIXED_POSITION;
  draft.collapsible = true;
  draft.defaultState = DOCK_PANEL_FIXED_STATE;

  if (draft.transition === undefined || draft.transition === null) {
    draft.transition = { ...DOCK_PANEL_DEFAULT_TRANSITION };
  }

  if (!draft.trigger.label) {
    draft.trigger.label = DOCK_PANEL_DEFAULT_TRIGGER_LABEL;
  }

  draft.trigger.value =
    typeof draft.trigger.value === "string" ? draft.trigger.value.trim() : "";

  draft.items.forEach((item) => {
    item.visual.value =
      typeof item.visual.value === "string" ? item.visual.value.trim() : "";
  });

  return draft;

}


/*
  정규화가 그래도 거부했을 때 — 내부 경로 대신 "몇 번째 항목"만
  말한다. 패널이 먼저 걸러 내므로 여기까지 오는 일은 드물다(옛
  데이터의 모양이 이미 틀린 경우 정도).
*/
function describeDockPanelFailure(message) {

  const match =
    /bottomDock\.items\[(\d+)\]/.exec(message || "");

  if (match) {
    return `${Number(match[1]) + 1}번째 항목의 설정을 확인해 주세요.`;
  }

  if (/bottomDock\.trigger/.test(message || "")) {
    return "열기 버튼의 설정을 확인해 주세요.";
  }

  return "입력한 설정을 확인해 주세요.";

}


function handleDockPanelApply() {

  /*
    빈 칸은 적용 **전에** 여기서 잡는다. 문제가 있는 자리마다 그
    아래에 짧은 안내를 띄우고, 첫 자리로 스크롤한다.
  */

  dockPanelTouched.add(dockPanelDraft.trigger);

  dockPanelDraft.items.forEach((item) => dockPanelTouched.add(item));

  renderDockTriggerSection();
  renderDockItemList();

  const firstError =
    dockPanelBody.querySelector(".dock-panel-error:not([hidden])");

  if (firstError) {

    setDockPanelMessage("비어 있는 칸을 채워 주세요.", true);

    if (typeof firstError.scrollIntoView === "function") {
      firstError.scrollIntoView({ block: "center" });
    }

    return;

  }


  const result =
    window.setStudioBottomDock(buildDockPanelResult());

  if (!result.ok) {
    setDockPanelMessage(describeDockPanelFailure(result.message), true);
    return;
  }

  closeSkinDockPanel();

}


function buildDockPanelContent() {

  dockPanelBody.innerHTML = "";

  const settings =
    dockEl("div", "dock-panel-settings");

  dockPanelBody.appendChild(settings);

  renderDockSettings(settings);


  dockPanelBody.appendChild(
    dockEl("h3", "dock-panel-section", "독 열기 버튼")
  );

  dockPanelTriggerHost =
    dockEl("div", "dock-panel-trigger");

  dockPanelBody.appendChild(dockPanelTriggerHost);

  renderDockTriggerSection();


  dockPanelBody.appendChild(
    dockEl("h3", "dock-panel-section", "항목")
  );

  dockPanelBody.appendChild(
    dockEl(
      "p",
      "dock-panel-hint",
      "펼쳤을 때 보이는 항목입니다. 끌거나 ↑↓로 순서를 바꿉니다. 모바일에서는 3~5개가 편합니다."
    )
  );


  dockPanelItemList =
    dockEl("div", "dock-panel-items");

  /*
    끌어 옮기기 — HTML5 drag & drop 하나로 끝낸다. 카드가 크고
    목록이 짧아서 정밀한 좌표 계산이 필요 없고, ↑↓ 가 같은 일을
    하므로 끌기가 안 되는 환경에서도 순서를 바꿀 수 있다.
  */

  dockPanelItemList.addEventListener("dragstart", (event) => {

    const card =
      event.target.closest(".dock-panel-item");

    if (!card) {
      return;
    }

    dockPanelDragFrom =
      Number(card.getAttribute("data-dock-item-index"));

    card.classList.add("dock-panel-item--dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      /* Firefox 는 데이터가 없으면 드래그를 시작하지 않는다 */
      event.dataTransfer.setData("text/plain", String(dockPanelDragFrom));
    }

  });

  dockPanelItemList.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  dockPanelItemList.addEventListener("drop", (event) => {

    event.preventDefault();

    const card =
      event.target.closest(".dock-panel-item");

    if (!card || dockPanelDragFrom < 0) {
      return;
    }

    moveDockItem(
      dockPanelDragFrom,
      Number(card.getAttribute("data-dock-item-index"))
    );

    dockPanelDragFrom = -1;

  });

  dockPanelItemList.addEventListener("dragend", () => {

    dockPanelDragFrom = -1;

    dockPanelItemList
      .querySelectorAll(".dock-panel-item--dragging, .dock-panel-item[draggable]")
      .forEach((el) => {
        el.classList.remove("dock-panel-item--dragging");
        el.removeAttribute("draggable");
      });

  });

  dockPanelBody.appendChild(dockPanelItemList);

  renderDockItemList();


  const add =
    dockEl("button", "dock-panel-button dock-panel-button--add", "＋ 항목 추가");

  add.type = "button";
  add.addEventListener("click", () => {

    if (dockPanelDraft.items.length >= SKIN_DOCK_MAX_ITEMS) {
      setDockPanelMessage(`항목은 ${SKIN_DOCK_MAX_ITEMS}개까지입니다.`, true);
      return;
    }

    setDockPanelMessage("");

    /* 빈 항목 — 표시는 사용자가 고른다(예시 값을 미리 넣지 않는다) */
    dockPanelDraft.items.push({
      id: nextDockItemId(),
      label: "",
      audience: "all",
      visual: { type: "icon", value: "" },
      action: { type: "navigate", target: "home" }
    });

    renderDockItemList();

    const cards =
      dockPanelItemList.querySelectorAll(".dock-panel-item");

    const last =
      cards[cards.length - 1];

    if (last && typeof last.scrollIntoView === "function") {
      last.scrollIntoView({ block: "nearest" });
    }

  });

  dockPanelBody.appendChild(add);

}


/*
  옛 설정(자리/처음 상태/접기를 따로 골랐던 dock)을 열었을 때
  사본의 모양을 맞춘다. trigger 가 없던 dock 에는 기본 열기 버튼을
  준다 — 이 패널이 만드는 dock 은 언제나 접혀서 시작하므로 열기
  버튼이 반드시 있어야 한다.
*/
function prepareDockPanelDraft(existing) {

  const draft =
    dockPanelCloneDraft(existing);

  if (!draft.trigger || typeof draft.trigger !== "object") {
    draft.trigger = { type: "icon", value: "menu", label: DOCK_PANEL_DEFAULT_TRIGGER_LABEL };
  }

  if (typeof draft.trigger.value !== "string") {
    draft.trigger.value = "";
  }

  if (!Array.isArray(draft.items)) {
    draft.items = [];
  }

  return draft;

}


/* =========================================================
   열기 / 닫기
========================================================== */

function openSkinDockPanel() {

  if (typeof window.getStudioBottomDock !== "function") {
    return;
  }

  ensureDockPanelDom();

  /* 셸이 다른 내용을 보다가 돌아왔다 — 그 사이 working draft 가 그대로면
     적용하지 않은 사본을 이어서 보여 준다. */
  if (
    dockPanelIsOpen &&
    dockPanelDraft &&
    dockPanelDraftRevision === dockPanelWorkingRevision()
  ) {

    dockPanelOverlay.classList.add("dock-panel-overlay--open");

    return;

  }

  dockPanelTargets =
    (typeof window.getStudioBottomDockTargets === "function")
      ? window.getStudioBottomDockTargets()
      : { categories: [], imageSlots: [] };

  const existing =
    window.getStudioBottomDock();

  dockPanelTouched =
    new WeakSet();

  dockPanelDraft =
    existing
      ? prepareDockPanelDraft(existing)
      : buildDefaultDockDraft();

  setDockPanelMessage(
    existing
      ? ""
      : "아직 dock이 없어서 기본 구성을 채워 두었습니다. 적용을 누르면 만들어집니다."
  );

  buildDockPanelContent();

  dockPanelOverlay.classList.add("dock-panel-overlay--open");

  dockPanelIsOpen = true;

  dockPanelDraftRevision =
    dockPanelWorkingRevision();

}


/* studio-preview.js 의 studioWorkingRevision(나중에 로드되는 classic
   script 의 top-level let — 호출 시점에는 이미 있다). 없는 문서에서는
   매번 다른 값이라 사본을 이어 쓰지 않는다. */
function dockPanelWorkingRevision() {

  return typeof studioWorkingRevision === "number"
    ? studioWorkingRevision
    : Number.NaN;

}


function closeSkinDockPanel() {

  if (!dockPanelOverlay) {
    return;
  }

  dockPanelOverlay.classList.remove("dock-panel-overlay--open");

  dockPanelIsOpen = false;

  dockPanelDraft = null;

  dockPanelDraftRevision = -1;

  /* STUDIO-SHELL-1 — 왼쪽 패널이 Dock 을 보여 주고 있었다면 접는다 */
  if (typeof window.handleStudioLeftPanelContentClosed === "function") {
    window.handleStudioLeftPanelContentClosed("dock");
  }

}


if (typeof window !== "undefined") {

  window.openSkinDockPanel = openSkinDockPanel;
  window.closeSkinDockPanel = closeSkinDockPanel;

}
