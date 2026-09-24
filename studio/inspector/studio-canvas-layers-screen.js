/* =========================================================
   STUDIO — LAYERS · 패널 뼈대와 하위 화면 (STUDIO-CANVAS-LAYERS-SPLIT-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §3
   계약:      docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §35 · §36

   studio/inspector/studio-canvas-layers.js 에서 갈라 나온 셋 중 하나다.
   여기는 **한 자리를 두 화면이 번갈아 쓰는 일**만 안다.

     · 패널의 DOM 뼈대를 한 번 만든다(ensureStudioCanvasLayers)
     · `＋ 재료 추가` 하위 화면을 열고 닫는다 — 트리가 물러나고
       요소 추가 화면이 같은 자리에 선다(`data-layers-screen`)
     · 그 화면의 머리(`← Layers` · 제목)와 **한 단계씩** 돌아가는 길
     · 재료를 만든 뒤 트리로 돌아가 그 행을 드러낸다

   ★ 하위 화면의 **본문**(분류 둘 · 카드 여덟)을 만드는 곳은 여전히
     studio/inspector/studio-canvas-add-v2.js 한 곳이다. 이 파일은
     머리와 돌아가는 길만 갖는다 — 어디로 돌아갈지 아는 곳이
     화면을 연 쪽이기 때문이다.

   ── 상태를 갖지 않는다 ─────────────────────────────────
   studioCanvasLayersRoot · …AddHost · …AddOpen 같은 화면 상태를 읽고
   쓰지만 **선언하는 곳은** studio-canvas-layers.js 다(소유자 하나).

   ── classic script ─────────────────────────────────────
   형제 파일의 최상위 함수를 **호출 시점에** 쓴다. 이 파일은
   studio-canvas-layers.js 보다 **먼저** 실려야 한다 — 그 파일의 맨
   아래 창구 등록이 여기 두 함수(revealStudioCanvasLayersRow ·
   studioCanvasLayersAddBack …)를 최상위에서 읽는다.
========================================================== */


/* =========================================================
   패널의 뼈대 — 한 번 만들고 다시 쓴다
========================================================== */

function ensureStudioCanvasLayers() {

  if (studioCanvasLayersRoot) {
    return studioCanvasLayersRoot;
  }

  const host =
    document.getElementById("studioLeftPanelLayers");

  if (!host) {
    return null;
  }

  studioCanvasLayersRoot =
    studioCanvasLayersEl("div", "studio-canvas-layers");

  studioCanvasLayersRoot.id =
    "studioCanvasLayers";


  /* ── 맨 위: 재료 추가 (계획 문서 §3) ──
     sticky 다 — 트리가 길어도 같은 자리에 있다(CSS). */

  const top =
    studioCanvasLayersEl("div", "studio-canvas-layers-top");

  studioCanvasLayersAddToggle =
    studioCanvasLayersEl(
      "button",
      "studio-canvas-layers-add-toggle",
      "＋ 재료 추가"
    );

  studioCanvasLayersAddToggle.type = "button";
  studioCanvasLayersAddToggle.id = "studioCanvasLayersAddToggle";
  studioCanvasLayersAddToggle.setAttribute("aria-expanded", "false");
  studioCanvasLayersAddToggle.setAttribute("aria-controls", "studioCanvasLayersAddHost");

  studioCanvasLayersAddToggle.addEventListener(
    "click",
    () => setStudioCanvasLayersAddOpen(!studioCanvasLayersAddOpen)
  );

  top.appendChild(studioCanvasLayersAddToggle);


  /* ── 그룹 만들기 (HOME-CANVAS-GROUP-1A · 계약 §38-3) ──

     여럿을 고른 상태에서만 보인다. **고를 수 없는 조합이면
     보이되 눌리지 않고**, 왜 안 되는지 한 줄을 적는다 — 조용히
     사라지면 주인은 이 기능이 있는지조차 모른다. */

  studioCanvasLayersGroupButton =
    studioCanvasLayersEl(
      "button",
      "studio-canvas-layers-group-create",
      "▣ 그룹 만들기"
    );

  studioCanvasLayersGroupButton.type = "button";
  studioCanvasLayersGroupButton.id = "studioCanvasLayersGroupCreate";
  studioCanvasLayersGroupButton.hidden = true;

  studioCanvasLayersGroupButton.addEventListener(
    "click",
    () => runStudioCanvasLayersAction("studioCanvasLayersGroupCreate", [])
  );

  top.appendChild(studioCanvasLayersGroupButton);


  /* ── 하위 화면의 머리 (STUDIO-LAYERS-MATERIALS-1A) ──

     `＋ 재료 추가`를 누르면 트리가 물러나고 **요소 추가** 화면이
     그 자리에 선다. 돌아가는 길이 하나(`← Layers`)뿐이어야 하므로
     그 단추는 같은 sticky 줄에 있고, 본문(카드 격자)을 만드는 곳은
     여전히 studio/inspector/studio-canvas-add-v2.js 하나다.

     ★ Images 의 자리 하나 화면과 같은 규칙이다 — 어디로 돌아갈지
       아는 곳이 화면을 연 쪽이다(studio-shell.js 의 그 사고방식). */

  studioCanvasLayersAddHead =
    studioCanvasLayersEl("div", "studio-canvas-layers-subhead");

  studioCanvasLayersAddHead.id =
    "studioCanvasAddHead";

  studioCanvasLayersAddHead.hidden =
    true;

  const back =
    studioCanvasLayersEl(
      "button",
      "studio-canvas-layers-back",
      "← Layers"
    );

  back.type = "button";
  back.id = "studioCanvasAddBack";

  /* STUDIO-LAYERS-MATERIALS-1B — 뒤로가기는 **한 단계씩**이다
     (계약 §36-3).

       재료 목록  →  요소 추가  →  Layers

     그 첫 단계를 아는 곳은 추가 화면 자신이다(어느 분류를 열고
     있는지 그쪽만 안다). 그래서 먼저 물어보고, 그쪽이 처리하지
     않았을 때만 이 패널이 하위 화면을 닫는다. */
  back.addEventListener(
    "click",
    () => studioCanvasLayersAddBack()
  );

  studioCanvasLayersAddHead.appendChild(back);

  const subtitle =
    studioCanvasLayersEl(
      "p",
      "studio-canvas-layers-subtitle",
      "요소 추가"
    );

  subtitle.id =
    "studioCanvasAddTitle";

  studioCanvasLayersAddHead.appendChild(subtitle);

  top.appendChild(studioCanvasLayersAddHead);

  studioCanvasLayersRoot.appendChild(top);


  /* Escape 도 `← Layers` 와 같은 곳으로 간다 — 하위 화면에 갇히지
     않게. 패널 안에서만 듣는다(문서 전역에 또 하나 달지 않는다). */
  studioCanvasLayersRoot.addEventListener("keydown", (event) => {

    if (event.key === "Escape" && studioCanvasLayersAddOpen) {
      event.stopPropagation();

      /* `←` 와 **같은 곳**을 지난다 — 단계가 두 곳에 적히면 한쪽만
         고쳐지는 날 Escape 만 한 단계를 건너뛴다 */
      studioCanvasLayersAddBack();
    }

  });


  studioCanvasLayersAddHost =
    studioCanvasLayersEl("div", "studio-canvas-layers-add");

  studioCanvasLayersAddHost.id =
    "studioCanvasLayersAddHost";

  studioCanvasLayersAddHost.hidden =
    true;

  studioCanvasLayersRoot.appendChild(studioCanvasLayersAddHost);


  /* ── 왜 안 됐는가 (STUDIO-LAYERS-STRUCTURE-1) ──
     거절된 구조 동작의 이유가 여기 한 줄로 뜬다. 성공하면 비운다.
     ★ 이 줄은 화면 상태다 — draft 에도 Undo 에도 들어가지 않는다. */

  studioCanvasLayersNote =
    studioCanvasLayersEl("p", "studio-canvas-layers-note");

  studioCanvasLayersNote.id =
    "studioCanvasLayersNote";

  studioCanvasLayersNote.setAttribute("role", "status");

  studioCanvasLayersNote.hidden =
    true;

  studioCanvasLayersRoot.appendChild(studioCanvasLayersNote);


  studioCanvasLayersTree =
    studioCanvasLayersEl("div", "studio-canvas-layers-tree");

  studioCanvasLayersTree.id =
    "studioCanvasLayersTree";

  studioCanvasLayersTree.setAttribute("role", "tree");
  studioCanvasLayersTree.setAttribute("aria-label", "HOME 캔버스 레이어");

  studioCanvasLayersRoot.appendChild(studioCanvasLayersTree);


  studioCanvasLayersEmpty =
    studioCanvasLayersEl("p", "studio-canvas-layers-empty");

  studioCanvasLayersEmpty.id =
    "studioCanvasLayersEmpty";

  studioCanvasLayersRoot.appendChild(studioCanvasLayersEmpty);


  /* ── STUDIO-LAYERS-MEDIA-1 — 스킨 이미지 ──

     트리의 행으로 표현되지 않는 그림 자리들이다. 캔버스가 아닌
     스킨(legacy · v1)에서는 **모든** 자리가 여기 있고, v2 에서는
     HOME 캔버스가 쓰지 않는 자리(CATEGORY · POST · BANNER 템플릿이
     쓰는 그림 · 파비콘류)만 남는다.

     ★ 상단 Images 버튼을 되살리지 않기 위한 자리다. 그 버튼이
       사라져도 "예전에 바꿀 수 있던 그림"에 손이 닿아야 한다.
     ★ 기술 이름(slot.name)은 적지 않는다 — 사람이 읽는 label 만.
  */

  studioCanvasLayersMedia =
    studioCanvasLayersEl("section", "studio-canvas-layers-media");

  studioCanvasLayersMedia.id =
    "studioCanvasLayersMedia";

  studioCanvasLayersMedia.hidden =
    true;

  const mediaHeading =
    studioCanvasLayersEl(
      "p",
      "studio-canvas-layers-media-heading",
      "스킨 이미지"
    );

  studioCanvasLayersMedia.appendChild(mediaHeading);

  studioCanvasLayersMediaList =
    studioCanvasLayersEl("div", "studio-canvas-layers-media-list");

  studioCanvasLayersMediaList.id =
    "studioCanvasLayersMediaList";

  studioCanvasLayersMedia.appendChild(studioCanvasLayersMediaList);

  studioCanvasLayersRoot.appendChild(studioCanvasLayersMedia);


  host.appendChild(studioCanvasLayersRoot);

  return studioCanvasLayersRoot;

}

/* =========================================================
   재료 추가 자리 여닫기

   ★ 화면을 만드는 곳은 studio-canvas-add-v2.js 하나다. 여기서
     종류 표도 기본값 표도 한 벌 더 적지 않는다(계획 문서 §3).
========================================================== */

/* =========================================================
   STUDIO-LAYERS-MATERIALS-1B — 뒤로가기 한 단계 (계약 §36-3)

   `←` 와 Escape 가 함께 지나는 한 곳이다.

     재료 목록  →  요소 추가   추가 화면이 처리한다
     요소 추가  →  Layers      이 패널이 하위 화면을 닫는다

   ★ 단계를 **이 함수 하나**로 모은다. 두 곳에 적으면 한쪽만
     고쳐지는 날 Escape 만 한 단계를 건너뛴다.
========================================================== */
function studioCanvasLayersAddBack() {

  if (
    typeof window.studioCanvasV2AddBack === "function" &&
    window.studioCanvasV2AddBack()
  ) {
    return;
  }

  setStudioCanvasLayersAddOpen(false);

}


/* =========================================================
   STUDIO-LAYERS-MATERIALS-1B — 하위 화면의 머리

   제목이 화면마다 다르다("요소 추가" · 그 분류 이름). 무엇을
   적을지 아는 곳은 추가 화면이고, 어디에 적을지 아는 곳은 여기다.
   그래서 그쪽이 화면을 바꾸면 이 함수를 부른다.
========================================================== */
function syncStudioCanvasLayersAddHead() {

  const title =
    document.getElementById("studioCanvasAddTitle");

  const back =
    document.getElementById("studioCanvasAddBack");

  if (!title || !back) {
    return;
  }

  const deep =
    typeof window.getStudioCanvasAddState === "function" &&
    window.getStudioCanvasAddState().screen === "items";

  title.textContent =
    (typeof window.studioCanvasV2AddTitle === "function")
      ? window.studioCanvasV2AddTitle()
      : "요소 추가";

  /* 어디로 돌아가는지 글자로 적는다 — 두 단계가 같은 모양이면
     "한 번 더 눌러야 트리로 간다"를 알 수 없다 */
  back.textContent =
    deep ? "← 요소 추가" : "← Layers";

}


function setStudioCanvasLayersAddOpen(open) {

  const was =
    studioCanvasLayersAddOpen;

  studioCanvasLayersAddOpen =
    !!open;

  /* STUDIO-LAYERS-MATERIALS-1B — 하위 화면을 닫으면 다음에 열 때
     분류 격자부터다. 닫아 둔 화면의 단계를 기억하면 `＋ 재료 추가`
     가 사람마다 다른 화면을 연다. */
  if (
    !studioCanvasLayersAddOpen &&
    typeof window.resetStudioCanvasV2AddScreen === "function"
  ) {
    window.resetStudioCanvasV2AddScreen();
  }

  syncStudioCanvasLayersAdd();

  syncStudioCanvasLayersAddHead();

  if (was === studioCanvasLayersAddOpen) {
    return;
  }

  /* 화면이 바뀌었으면 초점도 따라간다 — 하위 화면에서는 `← Layers`,
     돌아오면 그 화면을 연 `＋ 재료 추가`. 키보드만 쓰는 사람이
     사라진 단추에 초점을 둔 채 남지 않게. */
  const focus =
    studioCanvasLayersAddOpen
      ? document.getElementById("studioCanvasAddBack")
      : studioCanvasLayersAddToggle;

  if (focus && !focus.hidden && typeof focus.focus === "function") {
    focus.focus();
  }

}


/* =========================================================
   STUDIO-LAYERS-MATERIALS-1A — 트리로 돌아가 그 행을 드러낸다

   재료를 만든 직후(그리고 "이미 있는 것"을 고른 직후) 부른다.
   하위 화면을 닫고 · 접힌 프레임을 펼치고 · 그 행이 보이는 자리로
   스크롤한다. 선택 자체는 이미 기존 관문이 했다.

   ★ 창구를 두는 이유는 **돌아갈 곳을 아는 곳이 여기뿐**이기
     때문이다. studio-canvas-add-v2.js 는 자기가 어느 패널의 어느
     화면에 붙어 있는지 몰라도 된다.
========================================================== */
function revealStudioCanvasLayersRow(elementId, note) {

  setStudioCanvasLayersAddOpen(false);

  setStudioCanvasLayersMessage(
    (typeof note === "string") ? note : ""
  );

  const info =
    (typeof window.studioCanvasNodeInfo === "function")
      ? window.studioCanvasNodeInfo(elementId)
      : null;

  if (info && info.kind === "frame-element" && info.parentId) {
    expandStudioCanvasLayersFolder(info.parentId);
  }

  renderStudioCanvasLayers(true);

  if (!studioCanvasLayersTree) {
    return;
  }

  const row =
    Array.from(
      studioCanvasLayersTree.querySelectorAll(".studio-canvas-layers-row")
    ).find((node) => node.dataset.layerId === elementId);

  if (row && typeof row.scrollIntoView === "function") {
    row.scrollIntoView({ block: "nearest" });
  }

}


function syncStudioCanvasLayersAdd() {

  if (!studioCanvasLayersAddHost || !studioCanvasLayersAddToggle) {
    return;
  }

  const canAdd =
    typeof window.studioCanvasV2AddIsOn === "function" &&
    typeof window.buildStudioCanvasV2AddSection === "function" &&
    window.studioCanvasV2AddIsOn();

  studioCanvasLayersAddToggle.disabled =
    !canAdd;

  const open =
    canAdd && studioCanvasLayersAddOpen;

  studioCanvasLayersAddToggle.setAttribute("aria-expanded", String(open));

  studioCanvasLayersAddHost.hidden =
    !open;

  /* STUDIO-LAYERS-MATERIALS-1A — 트리인가 하위 화면인가.
     트리 · 빈 안내 · 스킨 이미지 · 상태 줄을 한꺼번에 물리는 것은
     CSS 다(아래 세 줄이 각자 hidden 을 다투지 않게). */
  studioCanvasLayersRoot.dataset.layersScreen =
    open ? "add" : "tree";

  studioCanvasLayersAddToggle.hidden =
    open;

  if (studioCanvasLayersAddHead) {
    studioCanvasLayersAddHead.hidden = !open;
  }

  if (!open) {

    studioCanvasLayersAddHost.textContent =
      "";

    return;

  }

  /*
    ★ 다시 만드는 조건이 있다. 추가 자리의 모양은 **지금 고른 것이
      어느 프레임 안인가**에 따라 달라진다(studioCanvasV2AddFrameId —
      "메인 비주얼 안" 줄이 생기고 사라진다). 그래서 그 프레임 id 를
      지문으로 들고, 바뀔 때만 다시 그린다. 값만 바뀐 경우
      (슬롯 목록)에는 옵션만 갈아 끼운다 — 고르던 칸이 죽지 않게.
  */
  const frameId =
    (typeof window.getStudioCanvasAddState === "function")
      ? (window.getStudioCanvasAddState().frameId || "")
      : "";

  if (studioCanvasLayersAddHost.dataset.frameId !== frameId ||
      !studioCanvasLayersAddHost.firstChild) {

    studioCanvasLayersAddHost.textContent =
      "";

    studioCanvasLayersAddHost.appendChild(
      window.buildStudioCanvasV2AddSection()
    );

    studioCanvasLayersAddHost.dataset.frameId =
      frameId;

    /* 새로 그린 본문이 몇 번째 화면인지 머리도 따라간다 */
    syncStudioCanvasLayersAddHead();

    return;

  }

  if (typeof window.syncStudioCanvasV2AddSection === "function") {
    window.syncStudioCanvasV2AddSection();
  }

}

