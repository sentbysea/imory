/* =========================================================
   SKIN STUDIO — BOTTOM DOCK 설정 패널 (BOTTOM-DOCK-1)

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md §12

   studio/images/images-panel.js 와 같은 형태의 modal 이다 — DOM 은
   처음 열 때 한 번 만들고 이후 재사용한다.

   ── 무엇을 고치는가 ─────────────────────────────────────
   dock 의 **설정**이다(bottomDock). 표시/숨김 · 자리 · 접기 ·
   기본 상태 · 전환 · 트리거, 그리고 항목의 순서/추가/삭제/라벨/
   그림/동작.

   ── 무엇을 고치지 않는가 ───────────────────────────────
   dock 의 **생김새**는 여기서 손대지 않는다. 그건 templates.dock
   과 스킨 CSS 의 몫이고, Code Editor 와 AI 가 그 길이다. 이 패널에
   색·크기·글꼴 칸을 만들면 "스킨마다 자유롭게"가 무너진다
   (요구사항 1절 금지 목록).

   ── DB 를 건드리지 않는다 ──────────────────────────────
   setStudioBottomDock(studio/studio-preview.js) 하나만 부른다 —
   그쪽이 working draft · dirty · Preview 재렌더의 주인이다. 실제
   기록은 Save 가 새 버전 row 에 할 때뿐이다. Cancel 은 정말로
   아무 일도 일어나지 않은 것과 같다(패널이 자기 사본에서만
   작업하고, 확인을 눌러야 draft 에 넘긴다).

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
let dockPanelIsOpen = false;

/*
  패널이 작업하는 **사본**. 확인을 누르기 전까지 working draft 는
  한 글자도 바뀌지 않는다.
*/
let dockPanelDraft = null;

let dockPanelTargets = { categories: [], imageSlots: [] };

/* 항목 끌어 옮기기 — 지금 잡고 있는 항목의 index */
let dockPanelDragFrom = -1;


/* =========================================================
   라벨 — 저장값(enum)은 영어, 화면 글자는 한국어다.
   (Quote Preset 라벨 규칙과 같은 결)
========================================================== */

const DOCK_PANEL_POSITION_LABELS = {
  auto: "자동",
  fixed: "화면에 고정",
  sticky: "따라오다 멈춤",
  static: "콘텐츠 흐름 안"
};

const DOCK_PANEL_POSITION_HINTS = {
  auto: "한 화면에 다 들어오면 고정, 스크롤이 있으면 따라오다 멈춤으로 정해집니다.",
  fixed: "언제나 화면 아래에 떠 있습니다.",
  sticky: "스크롤과 함께 움직이다가 화면 아래에 붙습니다.",
  static: "글 목록·프로필 다음에 오는 평범한 콘텐츠처럼 놓입니다."
};

const DOCK_PANEL_STATE_LABELS = {
  expanded: "펼친 채로",
  collapsed: "접은 채로"
};

const DOCK_PANEL_TRANSITION_LABELS = {
  "none": "없음",
  "fade": "서서히",
  "slide": "밀기",
  "scale": "확대·축소",
  "fade-slide": "서서히 + 밀기",
  "fade-scale": "서서히 + 확대·축소"
};

/* 속도·움직임·방향 — 스킨 요소의 전환 폼
   (studio/inspector/studio-inspector-transition.js)과 같은 이름을 쓴다 */
const DOCK_PANEL_SPEED_CHOICES = [
  ["140", "빠르게"],
  ["200", "보통"],
  ["360", "느리게"],
  ["600", "아주 느리게"]
];

const DOCK_PANEL_EASING_CHOICES = [
  ["ease", "기본"],
  ["smooth", "부드럽게"],
  ["ease-out", "끝을 천천히"],
  ["ease-in", "시작을 천천히"],
  ["ease-in-out", "양끝을 천천히"],
  ["linear", "일정하게"]
];

const DOCK_PANEL_DIRECTION_CHOICES = [
  ["up", "아래에서 위로"],
  ["down", "위에서 아래로"],
  ["left", "오른쪽에서 왼쪽으로"],
  ["right", "왼쪽에서 오른쪽으로"]
];

const DOCK_PANEL_VISUAL_LABELS = {
  icon: "아이콘(스킨 CSS가 그림)",
  emoji: "이모지",
  text: "글자",
  image: "이미지 주소",
  asset: "이미지 슬롯",
  svg: "SVG 주소"
};

const DOCK_PANEL_ACTION_LABELS = {
  navigate: "화면 이동",
  open: "패널 열기",
  action: "동작 실행"
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


/* =========================================================
   기본값 — "처음 만들 때" 어떤 dock 이 생기는가

   3~5개를 권한다(요구사항 14절). 홈 하나만 두면 쓸모를 상상하기
   어렵고, 처음부터 많으면 지우는 일이 먼저가 된다. 그림은 전부
   아이콘 토큰이라 스킨 CSS 가 자기 방식대로 그린다.
========================================================== */

function buildDefaultDockDraft() {

  return {
    visible: true,
    position: "auto",
    collapsible: false,
    defaultState: "expanded",
    transition: "fade",
    trigger: { type: "text", value: "⌄", label: "메뉴 열기" },
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


function dockTextInput(value, placeholder, onChange, maxLength) {

  const input =
    dockEl("input", "dock-panel-input");

  input.type = "text";
  input.value = value || "";

  if (placeholder) {
    input.placeholder = placeholder;
  }

  if (maxLength) {
    input.maxLength = maxLength;
  }

  input.addEventListener("input", () => onChange(input.value));

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
   항목 편집 카드 하나
========================================================== */

function buildDockItemCard(item, index) {

  const card =
    dockEl("div", "dock-panel-item");

  card.setAttribute("draggable", "true");
  card.setAttribute("data-dock-item-index", String(index));


  /* ── 머리 줄: 끌기 손잡이 · ↑↓ · 삭제 ─────────────── */

  const head =
    dockEl("div", "dock-panel-item-head");

  const grip =
    dockEl("span", "dock-panel-grip", "⠿");

  grip.setAttribute("aria-hidden", "true");

  head.appendChild(grip);

  head.appendChild(
    dockEl("span", "dock-panel-item-name", item.label || item.id)
  );


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


  /* ── 라벨 ─────────────────────────────────────────── */

  card.appendChild(
    dockRow(
      "라벨",
      dockTextInput(
        item.label,
        "비워 두면 아이콘만",
        (value) => {
          item.label = value;
          const nameEl = card.querySelector(".dock-panel-item-name");
          if (nameEl) nameEl.textContent = value || item.id;
        },
        24
      )
    )
  );


  /* ── 그림 ─────────────────────────────────────────── */

  const visualTypeSelect =
    dockSelect(
      SKIN_DOCK_VISUAL_TYPES.map((type) => [type, DOCK_PANEL_VISUAL_LABELS[type] || type]),
      item.visual.type,
      (value) => {
        item.visual.type = value;
        item.visual.value = "";
        renderDockItemList();
      }
    );

  card.appendChild(dockRow("그림", visualTypeSelect));

  card.appendChild(
    dockRow(
      "그림 값",
      item.visual.type === "asset"
        ? dockSelect(
            (dockPanelTargets.imageSlots.length
              ? dockPanelTargets.imageSlots
              : [""]
            ).map((slot) => [slot, slot || "(선언된 이미지 슬롯 없음)"]),
            item.visual.value,
            (value) => { item.visual.value = value; }
          )
        : dockTextInput(
            item.visual.value,
            dockVisualPlaceholder(item.visual.type),
            (value) => { item.visual.value = value; },
            2048
          ),
      item.visual.type === "icon"
        ? "영문 소문자 토큰 하나입니다. 모양은 스킨 CSS가 [data-kind=\"…\"]로 그립니다."
        : null
    )
  );


  /* ── 동작 ─────────────────────────────────────────── */

  const actionTypeSelect =
    dockSelect(
      SKIN_DOCK_ACTION_TYPES.map((type) => [type, DOCK_PANEL_ACTION_LABELS[type] || type]),
      item.action.type,
      (value) => {
        item.action.type = value;
        item.action.target =
          value === "navigate" ? "home"
            : value === "open" ? "panel:panel"
              : "top";
        renderDockItemList();
      }
    );

  card.appendChild(dockRow("동작", actionTypeSelect));

  card.appendChild(buildDockActionTargetRow(item));


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
        (value) => { item.audience = value; }
      ),
      item.audience === "owner"
        ? "방문자에게는 이 항목의 데이터 자체가 가지 않습니다."
        : null
    )
  );


  return card;

}


function dockVisualPlaceholder(type) {

  if (type === "icon") return "home / camera / heart …";
  if (type === "emoji") return "♡";
  if (type === "text") return "HOME";
  return "https://…";

}


function buildDockActionTargetRow(item) {

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
          renderDockItemList();
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
            : "/",
          "/about",
          (value) => {
            item.action.target = "path:" + (value.startsWith("/") ? value : "/" + value);
          },
          255
        )
      );

    }

    return dockRow("어디로", wrap);

  }


  if (item.action.type === "open") {

    return dockRow(
      "패널 이름",
      dockTextInput(
        item.action.target.replace(/^panel:/, ""),
        "pair",
        (value) => {
          item.action.target = "panel:" + value.trim().toLowerCase();
        },
        32
      ),
      "스킨 CSS가 [data-imory-dock-open=\"이 이름\"]으로 무엇을 보일지 정합니다."
    );

  }


  return dockRow(
    "무엇을",
    dockSelect(
      SKIN_DOCK_ACTION_TARGETS.map(
        (target) => [target, DOCK_PANEL_ACTION_TARGET_LABELS[target] || target]
      ),
      item.action.target,
      (value) => {
        item.action.target = value;
        renderDockItemList();
      }
    ),
    ["write", "admin", "manage"].indexOf(item.action.target) !== -1
      ? "주인장에게만 주소가 생깁니다 — 방문자에게는 이 항목이 나오지 않습니다."
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
   설정 줄들(항목 위)
========================================================== */

function renderDockSettings(host) {

  host.innerHTML = "";

  host.appendChild(
    dockRow(
      "표시",
      dockSelect(
        [["show", "보이기"], ["hide", "숨기기"]],
        dockPanelDraft.visible ? "show" : "hide",
        (value) => {
          dockPanelDraft.visible = value === "show";
          renderDockSettings(host);
        }
      ),
      dockPanelDraft.visible
        ? null
        : "숨기면 공개 화면에 dock 자체가 그려지지 않습니다(설정은 남습니다)."
    )
  );

  host.appendChild(
    dockRow(
      "자리",
      dockSelect(
        SKIN_DOCK_POSITIONS.map((p) => [p, DOCK_PANEL_POSITION_LABELS[p] || p]),
        dockPanelDraft.position,
        (value) => {
          dockPanelDraft.position = value;
          renderDockSettings(host);
        }
      ),
      DOCK_PANEL_POSITION_HINTS[dockPanelDraft.position]
    )
  );

  host.appendChild(
    dockRow(
      "접기",
      dockSelect(
        [["off", "사용 안 함"], ["on", "사용"]],
        dockPanelDraft.collapsible ? "on" : "off",
        (value) => {
          dockPanelDraft.collapsible = value === "on";
          renderDockSettings(host);
        }
      )
    )
  );

  if (dockPanelDraft.collapsible) {

    host.appendChild(
      dockRow(
        "처음 상태",
        dockSelect(
          SKIN_DOCK_STATES.map((s) => [s, DOCK_PANEL_STATE_LABELS[s] || s]),
          dockPanelDraft.defaultState,
          (value) => { dockPanelDraft.defaultState = value; }
        )
      )
    );

    host.appendChild(
      dockRow(
        "접는 표식",
        dockSelect(
          SKIN_DOCK_VISUAL_TYPES.map((t) => [t, DOCK_PANEL_VISUAL_LABELS[t] || t]),
          dockPanelDraft.trigger.type,
          (value) => {
            dockPanelDraft.trigger.type = value;
            dockPanelDraft.trigger.value = "";
            renderDockSettings(host);
          }
        ),
        "하트 · 리본 · 작은 사진 — 무엇이든 됩니다. 접힌 dock은 햄버거 메뉴가 아닙니다."
      )
    );

    host.appendChild(
      dockRow(
        "표식 값",
        dockTextInput(
          dockPanelDraft.trigger.value,
          dockVisualPlaceholder(dockPanelDraft.trigger.type),
          (value) => { dockPanelDraft.trigger.value = value; },
          2048
        )
      )
    );

    host.appendChild(
      dockRow(
        "표식 이름",
        dockTextInput(
          dockPanelDraft.trigger.label,
          "메뉴 열기",
          (value) => { dockPanelDraft.trigger.label = value; },
          24
        ),
        "화면에 보이지 않아도 스크린 리더가 읽는 이름입니다."
      )
    );

  }

  /*
    TRANSITION-1 — 전환은 공용 전환 primitive 한 벌이다
    ({ type, duration, easing, direction }). 스킨 요소의 Direct Edit
    전환 폼과 **같은 네 칸**이고 값 목록도 같은 파일
    (skin/skin-transition.js)에서 온다.
  */

  const transition =
    dockPanelTransitionDraft();

  host.appendChild(
    dockRow(
      "전환",
      dockSelect(
        SKIN_DOCK_TRANSITIONS.map((t) => [t, DOCK_PANEL_TRANSITION_LABELS[t] || t]),
        transition.type,
        (value) => {
          transition.type = value;
          renderDockSettings(host);
        }
      ),
      "움직임을 줄이도록 설정한 방문자에게는 전환이 자동으로 꺼집니다."
    )
  );

  if (transition.type === "none") {
    return;
  }

  const speedChoices =
    DOCK_PANEL_SPEED_CHOICES.slice();

  if (!speedChoices.some(([value]) => value === String(transition.duration))) {
    speedChoices.push([String(transition.duration), `${transition.duration}ms`]);
  }

  host.appendChild(
    dockRow(
      "속도",
      dockSelect(
        speedChoices,
        String(transition.duration),
        (value) => { transition.duration = Number(value); }
      )
    )
  );

  host.appendChild(
    dockRow(
      "움직임",
      dockSelect(
        DOCK_PANEL_EASING_CHOICES,
        transition.easing,
        (value) => { transition.easing = value; }
      ),
      "\"부드럽게\"는 끝이 길게 풀리는 움직임입니다."
    )
  );

  if (
    transition.type === "slide" ||
    transition.type === "scale" ||
    transition.type === "fade-slide" ||
    transition.type === "fade-scale"
  ) {

    host.appendChild(
      dockRow(
        "방향",
        dockSelect(
          DOCK_PANEL_DIRECTION_CHOICES,
          transition.direction,
          (value) => { transition.direction = value; }
        ),
        "펼쳐질 때 움직이는 쪽입니다."
      )
    );

  }

}


/* draft 의 transition 을 언제나 네 칸짜리 객체로 둔다 — 옛 문자열
   ("fade")로 저장된 dock 을 열어도 같은 폼이 나온다. */
function dockPanelTransitionDraft() {

  const current =
    dockPanelDraft.transition;

  if (
    current &&
    typeof current === "object" &&
    typeof current.type === "string" &&
    typeof current.duration === "number"
  ) {
    return current;
  }

  dockPanelDraft.transition =
    typeof normalizeSkinTransition === "function"
      ? normalizeSkinTransition(current)
      : {
          type: typeof current === "string" ? current : "fade",
          duration: 200,
          easing: "ease",
          direction: "up"
        };

  return dockPanelDraft.transition;

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

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeSkinDockPanel();
    }
  });


  const modal =
    dockEl("div", "dock-panel-modal");

  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Bottom Dock");


  const header =
    dockEl("div", "dock-panel-header");

  header.appendChild(dockEl("h2", "dock-panel-title", "BOTTOM DOCK"));

  header.appendChild(
    dockEl(
      "p",
      "dock-panel-subtitle",
      "무엇이 들어가고 어떻게 동작하는지를 정합니다. 생김새는 스킨의 CSS와 templates.dock이 정합니다."
    )
  );

  modal.appendChild(header);


  dockPanelBody =
    dockEl("div", "dock-panel-body");

  modal.appendChild(dockPanelBody);


  dockPanelMessage =
    dockEl("p", "dock-panel-message");

  modal.appendChild(dockPanelMessage);


  const footer =
    dockEl("div", "dock-panel-footer");

  const removeAll =
    dockEl("button", "dock-panel-button dock-panel-button--quiet", "dock 없애기");

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

  document.body.appendChild(overlay);

  dockPanelOverlay = overlay;


  document.addEventListener("keydown", (event) => {

    if (dockPanelIsOpen && event.key === "Escape") {
      closeSkinDockPanel();
    }

  });

}


function handleDockPanelApply() {

  /*
    빈 라벨/빈 값처럼 "아직 덜 채운" 상태는 정규화가 거부한다 —
    그 문장을 그대로 보여 준다. 어느 항목의 무엇이 문제인지가
    그 안에 들어 있다(skin/skin-bottom-dock.js).
  */

  const result =
    window.setStudioBottomDock(dockPanelDraft);

  if (!result.ok) {
    setDockPanelMessage(result.message, true);
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
    dockEl("h3", "dock-panel-section", "항목")
  );

  dockPanelBody.appendChild(
    dockEl(
      "p",
      "dock-panel-hint",
      "끌어서 순서를 바꾸거나 ↑↓를 쓰세요. 모바일에서는 3~5개가 편합니다."
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
      .querySelectorAll(".dock-panel-item--dragging")
      .forEach((el) => el.classList.remove("dock-panel-item--dragging"));

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

    dockPanelDraft.items.push({
      id: nextDockItemId(),
      label: "",
      audience: "all",
      visual: { type: "icon", value: "home" },
      action: { type: "navigate", target: "home" }
    });

    renderDockItemList();

  });

  dockPanelBody.appendChild(add);

}


/* =========================================================
   열기 / 닫기
========================================================== */

function openSkinDockPanel() {

  if (typeof window.getStudioBottomDock !== "function") {
    return;
  }

  ensureDockPanelDom();

  dockPanelTargets =
    (typeof window.getStudioBottomDockTargets === "function")
      ? window.getStudioBottomDockTargets()
      : { categories: [], imageSlots: [] };

  const existing =
    window.getStudioBottomDock();

  dockPanelDraft =
    existing
      ? dockPanelCloneDraft(existing)
      : buildDefaultDockDraft();

  setDockPanelMessage(
    existing
      ? ""
      : "아직 dock이 없어서 기본 구성을 채워 두었습니다. 적용을 누르면 만들어집니다."
  );

  buildDockPanelContent();

  dockPanelOverlay.classList.add("dock-panel-overlay--open");

  dockPanelIsOpen = true;

}


function closeSkinDockPanel() {

  if (!dockPanelOverlay) {
    return;
  }

  dockPanelOverlay.classList.remove("dock-panel-overlay--open");

  dockPanelIsOpen = false;

  dockPanelDraft = null;

}


if (typeof window !== "undefined") {

  window.openSkinDockPanel = openSkinDockPanel;
  window.closeSkinDockPanel = closeSkinDockPanel;

}
