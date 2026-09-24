/* =========================================================
   STUDIO — LAYERS · 행 DOM (STUDIO-CANVAS-LAYERS-SPLIT-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md
              §2 · §3
   계약:      docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §28 · §32 · §38

   studio/inspector/studio-canvas-layers.js 에서 갈라 나온 셋 중 하나다.
   여기는 **어떻게 생겼는가**만 안다 — draft 를 읽지도 고치지도 않는다.

     · 행 하나의 DOM(일반 행 · 폴더 행) 과 오른쪽 단추들
     · 그룹 이름의 인라인 입력(확정 Enter · blur, 취소 Escape)
     · 트리 아래 `스킨 이미지` 구역의 단추들
     · 구조 동작 창구를 부르고 그 결과를 한 줄로 적는 곳

   ── 행의 생김새 ────────────────────────────────────────

     [⠿ 손잡이] [★ 대표] [이름(고르기)] [👁 눈] [🔒 자물쇠] [🗑 삭제]

     · 대표 단추는 **메인 비주얼 안의 사진**에만 있다.
     · 오른쪽 세 단추는 pointerdown 을 멈춘다 — 누르면 행이 골라지지도
       끌리지도 않는다(계약 §32-2).
     · 숨김 · 잠금된 행도 **목록에는 남는다**. 그것이 다시 켜는
       유일한 길이다.

   ── 상태를 갖지 않는다 ─────────────────────────────────
   studioCanvasLayersRenaming 을 읽고 쓰지만 **선언하는 곳은**
   studio-canvas-layers.js 다(소유자 하나). 다시 그리기도 그쪽
   renderStudioCanvasLayers() 하나를 부른다.

   ── classic script ─────────────────────────────────────
   형제 파일의 최상위 함수를 **호출 시점에** 쓴다. 이 파일은
   studio-canvas-layers.js 보다 **먼저** 실려야 한다(그 파일 머리말의
   그 이유).
========================================================== */


/*
  행 오른쪽의 단추 셋 (STUDIO-LAYERS-STRUCTURE-1)

  ★ 글자로 그린다 — 아이콘 폰트도 SVG 도 새로 들이지 않는다. 상태에
    따라 글자가 바뀌므로 `aria-pressed` 와 함께 읽으면 뜻이 분명하다.
*/
const STUDIO_CANVAS_LAYER_FLAG_BUTTONS = [
  {
    flag: "hidden",
    className: "studio-canvas-layers-eye",
    on: "🙈",
    off: "👁",
    labelOn: "다시 보이기",
    labelOff: "숨기기"
  },
  {
    flag: "locked",
    className: "studio-canvas-layers-lock",
    on: "🔒",
    off: "🔓",
    labelOn: "잠금 풀기",
    labelOff: "잠그기"
  }
];


/* =========================================================
   DOM 조각 — 한 번 만들고 다시 쓴다
========================================================== */

/* 작은 요소 하나. 이 패널의 네 파일이 모두 이것으로 만든다. */
function studioCanvasLayersEl(tag, className, text) {

  const node =
    document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (typeof text === "string") {
    node.textContent = text;
  }

  return node;

}


/* =========================================================
   행의 오른쪽 단추 · 구조 동작 부르기
========================================================== */

/*
  행 오른쪽의 작은 단추 하나.

  ★ **pointerdown 을 멈춘다.** 그래야 이 단추를 누른 입력이 행
    고르기로도, 끌기로도 이어지지 않는다(계약 §32-2). click 만
    멈추면 끌기가 pointerdown 에서 이미 시작돼 버린다.
*/
function studioCanvasLayersActionButton(className, text, label, onClick) {

  const button =
    studioCanvasLayersEl("button", `studio-canvas-layers-action ${className}`, text);

  button.type = "button";

  button.setAttribute("aria-label", label);

  button.title = label;

  button.addEventListener("pointerdown", (event) => event.stopPropagation());

  button.addEventListener("click", (event) => {

    event.stopPropagation();

    onClick();

  });

  return button;

}


/*
  구조 동작 하나 — 부르고 결과를 화면에 적는다.

  ★ 창구는 **호출 시점에** 찾는다(studio-canvas-layers-ops.js 가 이
    파일보다 나중에 로드돼도 된다 — 다른 classic script 들과 같은
    규칙). 없으면 조용히 실패하지 않고 그 사실을 적는다.
*/
function runStudioCanvasLayersAction(name, args) {

  if (typeof window[name] !== "function") {

    setStudioCanvasLayersMessage(
      "이 동작을 아직 쓸 수 없습니다 — 화면을 새로 고쳐 주세요."
    );

    return;

  }

  const result =
    window[name].apply(null, args);

  setStudioCanvasLayersMessage(
    (result && result.accepted) ? "" : ((result && result.message) || "")
  );

}


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 사진 행을 누르면 그 자리의 이미지 화면

   상단 Images 버튼이 없어진 자리를 메우는 길이다. 행을 한 번 누르면
   **고르는 일과 여는 일이 함께** 일어난다 — Preview 에는 파란 테두리,
   왼쪽 패널에는 그 자리의 이미지 선택기. ← Layers 로 돌아오면 트리와
   선택이 그대로다(선택은 이 파일이 들고 있지 않고 캔버스 선택 하나가
   원천이라 저절로 그렇다).

   ★ 여는 조건을 좁게 잡는다(사용자 지시)

     · 수식키(Ctrl/⌘ · Shift)가 눌린 클릭은 **고르기만** 한다
       — 여러 개를 고르는 중에 화면이 바뀌면 그 흐름이 끊긴다.
     · 끌고 있는 동안에는 열지 않는다.
     · 손잡이 · 눈 · 자물쇠 · 삭제는 애초에 이 핸들러에 오지 않는다
       (그 단추들이 pointerdown/click 을 멈춘다).
     · 그림 자리가 없는 종류(글자 · 도형 · 카테고리 …)는 고르기만
       한다 — 바꿀 사진이 없다.

   ★ 슬롯 이름이 지금 선언에 없으면 열지 않는다. 그런 자리는 패널이
     보여 줄 수 없고(setStudioImageSlot 도 거절한다), 빈 화면으로
     넘어가느니 트리에 남는 편이 낫다.
========================================================== */
function openStudioCanvasLayerImages(slotName) {

  if (!studioCanvasLayersDeclaredSlot(slotName)) {
    return false;
  }

  if (typeof window.setSkinImagesPanelSlot !== "function") {
    return false;
  }

  window.setSkinImagesPanelSlot(slotName);

  if (typeof window.showStudioLeftPanelMode !== "function") {
    return false;
  }

  window.showStudioLeftPanelMode("images", { returnTo: "layers" });

  return true;

}


/* 지금 행을 끌고 있는가 — studio-canvas-layers-drag.js 가 원천이다 */
function studioCanvasLayersIsDragging() {

  if (typeof window.getStudioCanvasLayersDragState !== "function") {
    return false;
  }

  const state =
    window.getStudioCanvasLayersDragState();

  return !!(state && state.dragging);

}


/* =========================================================
   행 하나의 DOM
========================================================== */

/* =========================================================
   HOME-CANVAS-GROUP-1A — 폴더 행 (계약 §38-4 · §38-6 · §38-7)

   ★ 손잡이가 없다. 그룹을 한 덩어리로 위아래 옮기는 것은 1A 에
     없다 — 멤버를 배열에서 연속으로 모으면 사이에 낀 요소와의
     겹침 순서가 바뀌기 때문이다(설계 §5 의 ★).

   ★ 눈 · 자물쇠도 없다. 저장 구조에 그룹의 `hidden`/`locked` 칸이
     **없고**(계약 §38-1), 멤버 전부에 일괄로 쓰면 **끌 때 되돌릴
     수 없다** — 원래 혼자 숨어 있던 멤버까지 함께 드러난다.
     되돌릴 수 없는 토글을 만들지 않는다.
========================================================== */
function studioCanvasLayersGroupRowNode(row, expanded) {

  const wrap =
    studioCanvasLayersEl("div", "studio-canvas-layers-row studio-canvas-layers-group-row");

  wrap.dataset.layerId = row.id;
  wrap.dataset.layerKind = "group";
  wrap.dataset.layerType = "group";
  wrap.dataset.layerParent = row.parentId || "";
  wrap.dataset.layerIndex = "-1";
  wrap.dataset.layerCount = String(row.count);

  if (row.hidden) {
    wrap.dataset.layerHidden = "true";
  }

  if (row.locked) {
    wrap.dataset.layerLocked = "true";
  }

  if (row.depth) {
    wrap.dataset.layerDepth = String(row.depth);
  }

  wrap.setAttribute("role", "treeitem");

  /* 손잡이 자리는 비워 둔다 — 들여쓰기가 멤버 행과 어긋나지 않게 */
  wrap.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-handle-gap")
  );

  const twisty =
    studioCanvasLayersEl(
      "button",
      "studio-canvas-layers-twisty",
      expanded ? "▾" : "▸"
    );

  twisty.type = "button";
  twisty.id = `studioCanvasLayerTwisty-${row.id}`;
  twisty.setAttribute("aria-expanded", String(expanded));
  twisty.setAttribute("aria-label", expanded ? "그룹 접기" : "그룹 펼치기");

  twisty.addEventListener("click", (event) => {

    event.stopPropagation();

    if (studioCanvasLayersCollapsed.has(row.id)) {
      studioCanvasLayersCollapsed.delete(row.id);
    } else {
      studioCanvasLayersCollapsed.add(row.id);
    }

    renderStudioCanvasLayers(true);

  });

  wrap.appendChild(twisty);

  /* ★ 자리는 비우지 않는다 — 멤버 행의 ★ 칸과 폭을 맞춘다 */
  wrap.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-star-gap")
  );


  const pick =
    studioCanvasLayersEl("button", "studio-canvas-layers-pick");

  pick.type = "button";
  pick.id = `studioCanvasLayer-${row.id}`;

  pick.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-folder", "📁")
  );

  const renaming =
    !!(studioCanvasLayersRenaming && studioCanvasLayersRenaming.id === row.id);

  if (renaming) {

    /* ★ 고치는 동안에는 멤버 수와 단추 셋이 물러난다(CSS). 390px
       에서 그 칸들이 그대로 서 있으면 입력 칸이 60px 도 안 남는다
       — 실측 58px. 어차피 고치는 중에는 누를 수 없는 것들이다. */
    wrap.dataset.layerRenaming = "true";

    /* 인라인 입력 — 확정은 Enter · blur, 취소는 Escape(계약 §38-6) */
    const input =
      document.createElement("input");

    input.type = "text";
    input.className = "studio-canvas-layers-rename";
    input.id = `studioCanvasLayerRenameInput-${row.id}`;
    input.value = row.name || "";
    input.maxLength =
      (typeof window.SKIN_HOME_CANVAS_GROUP_NAME_MAX === "number")
        ? window.SKIN_HOME_CANVAS_GROUP_NAME_MAX
        : 40;
    input.setAttribute("aria-label", "그룹 이름");

    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());

    let done = false;

    const finish = (commit) => {

      if (done) {
        return;
      }

      done = true;

      const value = input.value;

      studioCanvasLayersRenaming = null;

      if (commit) {
        runStudioCanvasLayersAction(
          "studioCanvasLayersGroupRename", [row.id, value]
        );
      }

      renderStudioCanvasLayers(true);

    };

    input.addEventListener("keydown", (event) => {

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      }
      else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }

    });

    input.addEventListener("blur", () => finish(true));

    pick.appendChild(input);

    /* 그리고 나서 초점을 준다 — 다시 그린 직후다 */
    window.setTimeout(() => {
      if (input.isConnected) {
        input.focus();
        input.select();
      }
    }, 0);

  }
  else {

    pick.appendChild(
      studioCanvasLayersEl(
        "span",
        "studio-canvas-layers-name",
        row.name || "그룹"
      )
    );

  }

  pick.appendChild(
    studioCanvasLayersEl(
      "span",
      "studio-canvas-layers-count",
      `(${row.count})`
    )
  );

  pick.title =
    `${row.name || "그룹"} · 요소 ${row.count}개 — 누르면 전체를 고릅니다`;

  pick.addEventListener("click", (event) => {

    if (renaming) {
      return;
    }

    event.stopPropagation();

    selectStudioCanvasLayerGroup(row.id);

  });

  /* 더블클릭은 이름 고치기다(계약 §38-6) */
  pick.addEventListener("dblclick", (event) => {

    event.stopPropagation();
    event.preventDefault();

    studioCanvasLayersRenaming = { id: row.id };

    renderStudioCanvasLayers(true);

  });

  wrap.appendChild(pick);


  /* 눈 · 자물쇠 자리는 비운다 — 폭을 멤버 행과 맞추되 누를 수 없다 */
  wrap.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-flag-gap")
  );
  wrap.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-flag-gap")
  );


  /* ── ✎ 이름 변경 ── */

  const rename =
    studioCanvasLayersActionButton(
      "studio-canvas-layers-rename-button",
      "✎",
      "그룹 이름 변경",
      () => {
        studioCanvasLayersRenaming = { id: row.id };
        renderStudioCanvasLayers(true);
      }
    );

  rename.id = `studioCanvasLayerRename-${row.id}`;

  wrap.appendChild(rename);


  /* ── ⤺ 그룹 해제 — 폴더만 없앤다 ── */

  const dissolve =
    studioCanvasLayersActionButton(
      "studio-canvas-layers-dissolve",
      "⤺",
      "그룹 해제 — 폴더만 없애고 요소는 남깁니다",
      () => runStudioCanvasLayersAction(
        "studioCanvasLayersGroupDissolve", [row.id]
      )
    );

  dissolve.id = `studioCanvasLayerDissolve-${row.id}`;

  wrap.appendChild(dissolve);


  /* ── 🗑 그룹 삭제 — 자식까지 ── */

  const remove =
    studioCanvasLayersActionButton(
      "studio-canvas-layers-remove",
      "🗑",
      "그룹 삭제 — 안의 요소까지 함께 지웁니다",
      () => runStudioCanvasLayersAction(
        "studioCanvasLayersGroupRemove", [row.id]
      )
    );

  remove.id = `studioCanvasLayerRemove-${row.id}`;

  wrap.appendChild(remove);

  return wrap;

}

function studioCanvasLayersRowNode(row, expanded) {

  if (row.kind === "group") {
    return studioCanvasLayersGroupRowNode(row, expanded);
  }

  const wrap =
    studioCanvasLayersEl("div", "studio-canvas-layers-row");

  wrap.dataset.layerId = row.id;
  wrap.dataset.layerKind = row.kind;
  wrap.dataset.layerType = row.type;
  wrap.dataset.layerParent = row.parentId || "";
  wrap.dataset.layerIndex = String(row.index);

  /* HOME-CANVAS-GROUP-1A — 이 행이 어느 폴더 안인가(없으면 빈 값).
     끌기가 "그룹에서 빼기"를 이 한 칸으로 판정한다. */
  wrap.dataset.layerGroupId = row.groupId || "";

  if (row.hidden) {
    wrap.dataset.layerHidden = "true";
  }

  if (row.locked) {
    wrap.dataset.layerLocked = "true";
  }

  if (row.depth) {
    wrap.dataset.layerDepth = String(row.depth);
  }

  wrap.setAttribute("role", "treeitem");


  /* ── 끌기 손잡이 (STUDIO-LAYERS-STRUCTURE-1) ──
     `touch-action: none` 은 이 요소 하나에만 있다(CSS) — 패널의
     세로 스크롤을 죽이지 않기 위해서다. */

  const handle =
    studioCanvasLayersEl("span", "studio-canvas-layers-handle", "⠿");

  handle.setAttribute("aria-hidden", "true");

  handle.dataset.layerHandle = row.id;

  if (typeof window.bindStudioCanvasLayersHandle === "function") {
    window.bindStudioCanvasLayersHandle(handle);
  }

  wrap.appendChild(handle);


  /* 폴더(= main_visual)만 접기 손잡이를 갖는다. 계획 문서 §2-7 —
     첫 단계의 "폴더"는 이 한 단계뿐이다. */
  const isFolder =
    row.kind === "block" && row.type === "main_visual";

  if (isFolder) {

    const twisty =
      studioCanvasLayersEl(
        "button",
        "studio-canvas-layers-twisty",
        expanded ? "▾" : "▸"
      );

    twisty.type = "button";
    twisty.id = `studioCanvasLayerTwisty-${row.id}`;
    twisty.setAttribute("aria-expanded", String(expanded));
    twisty.setAttribute(
      "aria-label",
      expanded ? "메인 비주얼 접기" : "메인 비주얼 펼치기"
    );

    twisty.addEventListener("click", (event) => {

      /* 손잡이는 **고르지 않는다** — 접고 펴기만 한다 */
      event.stopPropagation();

      if (studioCanvasLayersCollapsed.has(row.id)) {
        studioCanvasLayersCollapsed.delete(row.id);
      } else {
        studioCanvasLayersCollapsed.add(row.id);
      }

      /* 지문이 바뀌므로 다시 그린다 */
      renderStudioCanvasLayers(true);

    });

    wrap.appendChild(twisty);

  } else {

    wrap.appendChild(
      studioCanvasLayersEl("span", "studio-canvas-layers-twisty-gap")
    );

  }


  /* ── ★ 대표 사진 ──
     메인 비주얼 안의 **사진**에만 있다. 누르면 그 프레임의 대표가
     되고, 옛 대표는 보통 사진으로 남는다(계획 문서 §2-5). */

  if (row.canBePrimary) {

    const star =
      studioCanvasLayersActionButton(
        "studio-canvas-layers-star",
        row.primary ? "★" : "☆",
        row.primary ? "지금 대표 사진입니다" : "대표 사진으로 지정",
        () => {

          if (row.primary) {
            return;
          }

          runStudioCanvasLayersAction(
            "studioCanvasLayersPrimary", [row.id, row.parentId]
          );

        }
      );

    star.setAttribute("aria-pressed", String(!!row.primary));

    star.disabled = !!row.primary;

    star.id = `studioCanvasLayerPrimary-${row.id}`;

    wrap.appendChild(star);

  } else {

    wrap.appendChild(
      studioCanvasLayersEl("span", "studio-canvas-layers-star-gap")
    );

  }


  const pick =
    studioCanvasLayersEl("button", "studio-canvas-layers-pick");

  pick.type = "button";
  pick.id = `studioCanvasLayer-${row.id}`;

  /* ── STUDIO-LAYERS-MEDIA-1 — 사진 행의 작은 미리보기 ──
     지금 그 자리에 무엇이 들어 있는지 트리에서 바로 보인다. 빈
     자리는 빈 네모로 남는다(가짜 그림을 넣지 않는다). */

  const declared =
    row.slot ? studioCanvasLayersDeclaredSlot(row.slot) : null;

  if (declared) {

    const thumb =
      studioCanvasLayersEl("span", "studio-canvas-layers-thumb");

    thumb.dataset.layerThumb = declared.binding ? "filled" : "empty";

    if (declared.binding) {

      const img =
        document.createElement("img");

      img.src = declared.binding.imageUrl;
      img.alt = "";
      img.loading = "lazy";

      thumb.appendChild(img);

    }

    pick.appendChild(thumb);

  }

  /* 이름은 지금까지처럼 **종류**다 — 트리는 구조를 읽는 화면이고,
     그 자리의 사람이 읽는 이름은 넘어간 화면의 제목이 된다. */
  pick.appendChild(
    studioCanvasLayersEl(
      "span",
      "studio-canvas-layers-name",
      studioCanvasLayerLabel(row.type)
    )
  );

  pick.title =
    declared
      ? `${declared.label} — 누르면 사진을 고릅니다`
      : `${studioCanvasLayerLabel(row.type)} · ${row.id}`;

  pick.addEventListener("click", (event) => {

    /* Ctrl/⌘ 는 **더하기/빼기**다(계획 문서 §2-2). 그 판정도 여기서
       하지 않는다 — mode 만 넘기고 합치는 것은 선택 관문이 한다. */
    const additive =
      event.ctrlKey || event.metaKey;

    const picked =
      selectStudioCanvasLayer(row.id, additive);

    /* STUDIO-LAYERS-MEDIA-1 — 수식키 없는 사진 행의 단일 클릭만
       이미지 화면으로 넘어간다(위 ★). */
    if (
      !picked ||
      additive ||
      event.shiftKey ||
      !row.slot ||
      studioCanvasLayersIsDragging()
    ) {
      return;
    }

    openStudioCanvasLayerImages(row.slot);

  });

  wrap.appendChild(pick);


  /* ── 👁 눈 · 🔒 자물쇠 ──
     검증도 렌더러도 블록 · 프레임 내부 요소 · overlay 셋 모두에 이 두
     칸을 갖고 있다(계약 §32-5). 그래서 모든 행에 그린다. */

  STUDIO_CANVAS_LAYER_FLAG_BUTTONS.forEach((spec) => {

    const on =
      row[spec.flag] === true;

    const button =
      studioCanvasLayersActionButton(
        spec.className,
        on ? spec.on : spec.off,
        on ? spec.labelOn : spec.labelOff,
        () => runStudioCanvasLayersAction(
          "studioCanvasLayersFlag", [row.id, spec.flag, !on]
        )
      );

    button.setAttribute("aria-pressed", String(on));

    button.id = `studioCanvasLayer${spec.flag === "hidden" ? "Eye" : "Lock"}-${row.id}`;

    wrap.appendChild(button);

  });


  /* ── 🗑 삭제 ──
     메인 비주얼이면 자식 수를 보여 주고 한 번 묻는다. 대표 사진처럼
     지울 수 없는 것은 이유를 보여 주고 거부한다(계약 §32-9). */

  const remove =
    studioCanvasLayersActionButton(
      "studio-canvas-layers-remove",
      "🗑",
      "삭제",
      () => runStudioCanvasLayersAction("studioCanvasLayersRemove", [row])
    );

  remove.id = `studioCanvasLayerRemove-${row.id}`;

  wrap.appendChild(remove);

  return wrap;

}


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 스킨 이미지 구역 그리기

   트리가 비어 있든(legacy 스킨 · Select 가 꺼짐) 가득 차 있든 **늘**
   그린다. 이 구역이 상단 Images 버튼을 대신하므로, 트리가 없다는
   이유로 함께 사라지면 그 스킨의 그림에 손이 닿지 않는다.
========================================================== */

function renderStudioCanvasLayersMedia(rows) {

  if (!studioCanvasLayersMedia || !studioCanvasLayersMediaList) {
    return;
  }

  const slots =
    studioCanvasLayersMediaSlots(rows);

  studioCanvasLayersMedia.hidden =
    !slots.length;

  studioCanvasLayersMediaList.textContent =
    "";

  slots.forEach((slot) => {

    const button =
      studioCanvasLayersEl("button", "studio-canvas-layers-media-item");

    button.type = "button";
    button.id = `studioCanvasLayersMedia-${slot.name}`;
    button.dataset.mediaSlot = slot.name;

    const thumb =
      studioCanvasLayersEl("span", "studio-canvas-layers-thumb");

    thumb.dataset.layerThumb = slot.binding ? "filled" : "empty";

    if (slot.binding) {

      const img =
        document.createElement("img");

      img.src = slot.binding.imageUrl;
      img.alt = "";
      img.loading = "lazy";

      thumb.appendChild(img);

    }

    button.appendChild(thumb);

    button.appendChild(
      studioCanvasLayersEl(
        "span",
        "studio-canvas-layers-media-name",
        slot.label
      )
    );

    button.title =
      `${slot.label} — 누르면 사진을 고릅니다`;

    button.addEventListener("click", () => {
      openStudioCanvasLayerImages(slot.name);
    });

    studioCanvasLayersMediaList.appendChild(button);

  });

}

