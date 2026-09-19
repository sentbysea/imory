/* =========================================================
   SKIN BOTTOM DOCK — 화면에 얹기 (DOM)

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md

   dock 은 세 파일이다.

     skin-bottom-dock.js          설정 정규화 · Context (순수 함수)
     skin-bottom-dock-actions.js  접기 상태 기계 · 다섯 가지 동작
     skin-bottom-dock-mount.js    ← 이 파일. **어디에 두는가**

   이 파일이 담당하는 것:

     자리      auto / fixed / sticky / static
     공간      모바일 safe area · 콘텐츠 아래 여백 · 가로 넘침 0
     수명      화면마다 하나 · 옛 것은 반드시 내린다

   눌렀을 때 무엇이 일어나는가는 actions 쪽이다.

   ── 왜 플랫폼이 이 넷을 갖는가 ──────────────────────────
   SKIN_SURFACE_AND_TRANSITION_CONTRACT.md 의 담당 범위 그대로다 —
   표시 공간·스크롤·라우팅은 플랫폼이고, 배치·색·글씨·장식은
   스킨이다. dock 의 **그림**은 templates.dock 과 스킨 CSS 가 전부
   그리고, 여기서는 그림에 손대지 않는다(클래스도 색도 크기도
   만들지 않는다). 얹는 것은 플랫폼 소유 속성 넷뿐이다:

     data-imory-dock-position   fixed | sticky | static
     data-imory-dock-state      expanded | collapsed
     data-imory-dock-transition none | fade | slide | ...
     data-imory-dock-open       지금 열린 패널 이름(없으면 속성 없음)

   스킨 CSS 는 이 속성들을 **`:root[...]`** 로 받아서 자기 방식대로
   그린다(그냥 `[data-imory-dock-open=...]` 이라고 쓰면 scope class 가
   앞에 붙어 자손을 요구하게 되고, fixed dock 에서는 조용히 안
   먹는다 — IMORY_BOTTOM_DOCK_DESIGN.md §4). 그래서 같은 상태 기계
   위에 전혀 다른 dock 이 올라갈 수 있다.

   ── 스킨 마크업에서 플랫폼이 찾는 것 두 개 ───────────────
     [data-imory-dock="trigger"]  접기/펼치기를 누르는 자리
     [data-imory-dock="items"]    접힐 때 사라지는 덩어리
   둘 다 **선택**이다. trigger 가 없으면 접기 기능이 없는 dock 이고,
   items 가 없으면 trigger 를 뺀 나머지 전부가 접힌다.

   ── 의존(classic script, 먼저 로드되어야 함) ─────────────
   skin/skin-bottom-dock.js (설정/Context) ·
   skin/skin-bottom-dock-actions.js (접기/동작) ·
   window.renderSkin(skin/skin-render.js — module 이지만 window 에도
   노출된다. 호출 시점에만 있으면 된다).

   세 파일은 같은 realm 의 classic script 라 최상위 함수/상수를
   그대로 공유한다 — studio/inspector/* 가 일곱 파일로 갈라진 것과
   같은 방식이다(window 로 올릴 필요가 없다).
========================================================== */


/* 플랫폼이 만든 자리의 표식 — 스킨 마크업에는 들어갈 수 없다 */

const SKIN_DOCK_FIXED_HOST_ID =
  "imoryBottomDockFixed";

const SKIN_DOCK_FLOW_HOST_CLASS =
  "imory-dock-flow";

const SKIN_DOCK_ITEM_ATTR =
  "data-imory-dock-item";

const SKIN_DOCK_ROOT_ATTR =
  "data-imory-dock";

/* 콘텐츠가 dock 에 가리지 않도록 플랫폼이 확보하는 여백 */

const SKIN_DOCK_BODY_CLASS =
  "imory-has-bottom-dock";

const SKIN_DOCK_HEIGHT_VAR =
  "--imory-bottom-dock-height";


/* =========================================================
   지금 화면의 dock 하나 — 이 realm 에 하나뿐이다.

   화면을 옮길 때마다 새로 그리고, 옛 것은 반드시 내린다
   (SANDBOX-5B 가 프레임에서 배운 것과 같다 — "가려진 것"이 아니라
   "없어진 것"이어야 한다). 접힌 상태만 화면 전환을 넘어 기억한다.
========================================================== */

let currentSkinDock =
  null;


/*
  방문자가 직접 접었는가 / 폈는가. null 이면 아직 손대지 않았다는
  뜻이고 그때는 설정의 defaultState 를 따른다.

  ★ localStorage 에 쓰지 않는다. 새로고침하면 스킨이 정한 기본
    상태로 돌아가고, 한 세션 안에서 화면을 옮기는 동안에만 방문자의
    선택이 유지된다 — 저장소 권한(사생활 보호 창·차단 설정)에
    기대지 않으면서 "눌렀는데 다음 화면에서 도로 펴지는" 불편은
    없앤다.
*/

let skinDockCollapsedOverride =
  null;


/*
  HOME 의 dock 재료 한 벌.

  HOME 은 한 번 그리면 다시 그리지 않는다 — 다른 화면으로 갔다가
  돌아올 때는 표시 공간(#postArea)만 접힌다(posts/view/
  posts-view-transition.js). 그래서 그 복귀 지점에는 skinPackage 도
  Context 도 없다. HOME 을 그릴 때 받은 재료를 여기 기억해 두었다가
  복귀 때 그대로 다시 쓴다 — 조회도 Context 조립도 다시 하지 않는다.

  (하이라이트 진입점 칩이 같은 자리에서 다시 판정하는 것과 같은
   사정이다, skin/skin-highlight-entry.js)
*/

let skinDockHomeOptions =
  null;



/* =========================================================
   auto — "한 화면에 다 들어오는가"

   요구사항 5절: 주요 콘텐츠가 한 viewport 안에 들어오고 실질적인
   세로 스크롤이 없으면 fixed 를 고른다. 스크롤이 있으면 sticky 로
   간다 — 읽는 중에도 닿을 수 있으면서(고정과 같은 자리) 글의
   맨 끝에서는 흐름 안으로 들어와 마지막 줄을 가리지 않는다.

   ★ 재는 시점이 중요하다. dock 을 아직 붙이지 않은 상태에서 잰다 —
     흐름에 들어간 dock 이 스스로 스크롤을 만들어 "스크롤이 있으니
     sticky" 라고 자기 판단을 뒤집는 고리를 막는다.

   ★ 사용자가 position 을 명시했으면 이 함수는 불리지 않는다
     (요구사항 5절 마지막 줄 — 명시 설정이 auto 판단보다 우선).
========================================================== */

const SKIN_DOCK_SCROLL_SLACK_PX = 8;

/*
  "dock 이 없다고 치면 이 화면은 스크롤되는가".

  ★ dock 자신을 반드시 빼고 잰다.

  빼지 않으면 판정이 진동한다: fixed 를 고르면 콘텐츠 아래에 dock
  높이만큼 여백이 생겨 스크롤이 만들어지고 → "스크롤이 있으니
  sticky" → 여백이 사라지고 → 다시 fixed … 가 끝없이 반복된다.
  그래서 재는 순간에만 dock 과 그 여백을 잠시 걷어낸다. 한 번의
  동기 블록 안에서 끝나므로 중간에 그려지는 화면은 없다.
*/

function skinDockScrollsWithoutDock(doc, scroller, mount) {

  if (!scroller) {
    return false;
  }

  const root =
    doc.documentElement;

  const hadPadding =
    !!root && root.classList.contains(SKIN_DOCK_BODY_CLASS);

  const dockRoot =
    mount && mount.dockRoot;

  const previousDisplay =
    dockRoot ? dockRoot.style.display : null;


  if (hadPadding) {
    root.classList.remove(SKIN_DOCK_BODY_CLASS);
  }

  if (dockRoot) {
    dockRoot.style.display = "none";
  }


  const scrolls =
    (scroller.scrollHeight || 0) >
    (scroller.clientHeight || 0) + SKIN_DOCK_SCROLL_SLACK_PX;


  if (dockRoot) {
    dockRoot.style.display = previousDisplay || "";
  }

  if (hadPadding) {
    root.classList.add(SKIN_DOCK_BODY_CLASS);
  }


  return scrolls;

}


function resolveAutoSkinDockPosition(doc, skinRoot, mount) {

  const scroller =
    findSkinDockScrollContainer(skinRoot);

  if (!scroller) {
    return "fixed";
  }

  return skinDockScrollsWithoutDock(doc, scroller, mount)
    ? "sticky"
    : "fixed";

}


/* =========================================================
   auto 는 한 번 재고 끝나지 않는다

   화면이 실제로 보이는 시점은 렌더보다 늦다 — CATEGORY/POST 는
   #postArea 가 열리면서(posts/view/posts-view-transition.js) 비로소
   높이를 갖는다. 그 전에 잰 값은 언제나 "스크롤 없음"이라
   긴 글에서도 fixed 가 나온다.

   그래서 붙인 뒤에도 두 가지를 본다:
     1) 레이아웃이 한 번 돌고 난 다음 프레임
     2) 콘텐츠나 표시 공간의 크기가 바뀔 때(ResizeObserver)

   판정이 달라지면 **다시 그리지 않고 자리만 옮긴다** — DOM 노드를
   옮기므로 접힘 상태도 패널 상태도 그대로다.
========================================================== */

function moveSkinDockToPosition(mount, position) {

  if (!mount || mount.position === position) {
    return;
  }

  const host =
    position === "fixed"
      ? ensureSkinDockFixedHost(mount.doc)
      : ensureSkinDockFlowHost(mount.doc, mount.skinRoot);

  if (!host) {
    return;
  }


  host.appendChild(mount.dockRoot);


  /* 비게 된 플랫폼 자리는 치운다 */

  if (
    mount.host !== host &&
    mount.host &&
    mount.host.parentElement &&
    !mount.host.firstElementChild &&
    (
      mount.host.id === SKIN_DOCK_FIXED_HOST_ID ||
      mount.host.classList.contains(SKIN_DOCK_FLOW_HOST_CLASS)
    )
  ) {

    mount.host.parentElement.removeChild(mount.host);

  }


  mount.host = host;
  mount.position = position;

  mount.dockRoot.setAttribute("data-imory-dock-position", position);

  applySkinDockContentPadding(mount.doc, mount.dockRoot, position);

}


function watchAutoSkinDockPosition(mount) {

  if (mount.authoredPosition !== "auto") {
    return;
  }

  const view =
    mount.doc.defaultView;

  if (!view) {
    return;
  }


  const reevaluate =
    () => {

      if (currentSkinDock !== mount) {
        return;
      }

      moveSkinDockToPosition(
        mount,
        resolveAutoSkinDockPosition(mount.doc, mount.skinRoot, mount)
      );

    };


  /* 1) 레이아웃이 한 번 돈 뒤 */

  view.requestAnimationFrame(
    () => view.requestAnimationFrame(reevaluate)
  );


  /* 2) 표시 공간이나 콘텐츠의 크기가 바뀔 때 */

  if (typeof view.ResizeObserver === "function") {

    const observer =
      new view.ResizeObserver(reevaluate);

    const scroller =
      findSkinDockScrollContainer(mount.skinRoot);

    if (scroller) {
      observer.observe(scroller);
    }

    if (mount.skinRoot && mount.skinRoot !== scroller) {
      observer.observe(mount.skinRoot);
    }

    mount.listeners.push(() => observer.disconnect());

  }


  /*
    화면이 드러나는 전환(커튼 380ms)보다 넉넉히 뒤에 한 번 더 —
    ResizeObserver 가 없는 환경의 안전망이다.
  */

  const timer =
    view.setTimeout(reevaluate, 700);

  mount.listeners.push(() => view.clearTimeout(timer));

}


/* =========================================================
   자리 만들기
========================================================== */

function ensureSkinDockFixedHost(doc) {

  let host =
    doc.getElementById(SKIN_DOCK_FIXED_HOST_ID);

  if (!host) {

    host = doc.createElement("div");
    host.id = SKIN_DOCK_FIXED_HOST_ID;
    host.className = "imory-dock-fixed";

    doc.body.appendChild(host);

  }

  return host;

}


/*
  흐름 안의 자리.

  1) 스킨이 [data-imory-region="bottom-dock"] 을 그렸으면 그 자리다 —
     스킨이 "내 레이아웃의 여기"라고 말한 것이므로 플랫폼이
     다시 정하지 않는다.
  2) 없으면 스킨 루트 **바로 뒤**에 플랫폼이 자리를 하나 만든다.
     스킨 DOM 안에는 한 글자도 넣지 않는다(스킨 내부 구조에
     의존하는 제품 코드를 만들지 않는다는 원칙, 기준 문서 0절).
*/
function ensureSkinDockFlowHost(doc, skinRoot) {

  const region =
    skinRoot && typeof skinRoot.querySelector === "function"
      ? skinRoot.querySelector('[data-imory-region="bottom-dock"]')
      : null;

  if (region) {
    return region;
  }


  const anchor =
    skinRoot && skinRoot.parentElement
      ? skinRoot
      : null;

  if (!anchor || !anchor.parentElement) {
    return null;
  }


  const existing =
    anchor.nextElementSibling &&
    anchor.nextElementSibling.classList &&
    anchor.nextElementSibling.classList.contains(SKIN_DOCK_FLOW_HOST_CLASS)
      ? anchor.nextElementSibling
      : null;

  if (existing) {
    return existing;
  }


  const host =
    doc.createElement("div");

  host.className = SKIN_DOCK_FLOW_HOST_CLASS;

  anchor.parentElement.insertBefore(host, anchor.nextSibling);

  return host;

}


/* =========================================================
   콘텐츠 아래 여백 — fixed dock 이 본문 끝을 가리지 않게

   요구사항 6절. 플랫폼이 재서 CSS 변수 하나로 넘기고, 실제 여백은
   skin/skin-bottom-dock.css 가 스크롤 담당 요소에 준다. 스킨 CSS
   에는 손대지 않는다.
========================================================== */

function applySkinDockContentPadding(doc, dockRoot, position) {

  const root =
    doc.documentElement;

  if (!root) {
    return;
  }

  if (position !== "fixed" || !dockRoot) {

    root.classList.remove(SKIN_DOCK_BODY_CLASS);
    root.style.removeProperty(SKIN_DOCK_HEIGHT_VAR);

    return;

  }


  let height = 0;

  try {
    height = Math.ceil(dockRoot.getBoundingClientRect().height || 0);
  } catch (err) {
    height = 0;
  }

  root.style.setProperty(SKIN_DOCK_HEIGHT_VAR, `${height}px`);
  root.classList.add(SKIN_DOCK_BODY_CLASS);

}



/* =========================================================
   mountSkinBottomDock — 실제로 그린다
========================================================== */

function mountSkinBottomDock({
  doc,
  dockContext,
  template,
  context,
  skinRoot,
  position,
  transitionSpec
}) {

  const host =
    position === "fixed"
      ? ensureSkinDockFixedHost(doc)
      : ensureSkinDockFlowHost(doc, skinRoot);

  if (!host) {
    return null;
  }


  const renderer =
    typeof window !== "undefined" && typeof window.renderSkin === "function"
      ? window.renderSkin
      : null;

  if (!renderer) {
    return null;
  }


  const itemsById =
    new Map();

  dockContext.items.forEach((item) => {
    itemsById.set(item.id, item);
  });


  let instance;

  try {

    instance =
      renderer({

        container: host,

        skin: template,

        /*
          dock 은 페이지 Context 의 일부다 — site/profile/navigation 을
          그대로 쓸 수 있어야 하고, 거기에 dock namespace 하나가
          더해진다.
        */
        context: {
          ...context,
          dock: dockContext
        },

        mode: "view",

        /*
          항목마다 플랫폼 표식을 하나 찍는다(skin/skin-render.js
          onRepeatItem). 주소가 없는 동작(패널·공유·맨 위로)을
          눌렀을 때 "어느 항목인가"를 아는 유일한 근거다 — 스킨
          HTML 은 이 속성을 적을 수 없다.
        */
        onRepeatItem: (clone, item, path) => {

          if (path !== "dock.items" || !item || !item.id) {
            return;
          }

          clone.setAttribute(SKIN_DOCK_ITEM_ATTR, String(item.id));

          prepareSkinDockInteractive(clone, item.accessibleLabel);

        }

      });

  } catch (err) {

    console.error("[skin-bottom-dock] renderSkin failed", err);

    return null;

  }


  const dockRoot =
    host.querySelector("[data-skin-root]");

  if (!dockRoot) {
    return null;
  }


  dockRoot.setAttribute(SKIN_DOCK_ROOT_ATTR, "root");
  dockRoot.setAttribute("data-imory-dock-position", position);
  dockRoot.setAttribute("data-imory-dock-transition", dockContext.transition);

  /* 옆으로 접히는 dock 은 전환 동안 화면을 옆으로 밀지 않게 가로를
     자른다 — 스킨 안의 전환과 같은 장치(skin/skin-transition.css). */
  if (
    typeof isSkinTransitionHorizontal === "function" &&
    transitionSpec &&
    isSkinTransitionHorizontal(transitionSpec)
  ) {
    dockRoot.setAttribute("data-imory-transition-clip", "");
  }


  const triggerEl =
    dockContext.collapsible
      ? dockRoot.querySelector('[data-imory-dock="trigger"]')
      : null;

  const itemsEl =
    dockRoot.querySelector('[data-imory-dock="items"]');


  if (triggerEl) {

    prepareSkinDockInteractive(triggerEl, dockContext.trigger.accessibleLabel);

  }


  const mount = {

    doc,
    host,
    instance,
    dockRoot,
    skinRoot,
    triggerEl,
    itemsEl,
    itemsById,
    context,
    dockContext,
    position,

    /* 사용자가 적은 값 — "auto 인가"를 나중에도 알아야 한다 */
    authoredPosition: dockContext.position,

    /* TRANSITION-1 — 접기/펴기의 움직임 전체(종류·속도·곡선·방향).
       dock 루트의 data-imory-dock-transition 에는 종류 이름만 나간다
       (스킨 CSS 가 읽는 옛 계약). */
    transition:
      transitionSpec && typeof transitionSpec === "object"
        ? transitionSpec
        : { type: dockContext.transition },

    collapsed: false,
    listeners: []

  };


  /* 초기 접힘 상태 — 방문자가 이 세션에서 고른 것이 있으면 그것,
     없으면 스킨이 정한 defaultState. trigger 가 없으면 접을 수단이
     없으므로 언제나 펼친 상태다(요구사항 8/10절). */

  const collapsedStart =
    !!triggerEl &&
    (
      skinDockCollapsedOverride === null
        ? dockContext.isCollapsedByDefault
        : skinDockCollapsedOverride
    );

  setSkinDockCollapsed(mount, collapsedStart, false);


  /* ── 클릭 ─────────────────────────────────────────────── */

  const onClick =
    (event) => {

      const target =
        event.target;

      if (!target || typeof target.closest !== "function") {
        return;
      }


      if (triggerEl && target.closest('[data-imory-dock="trigger"]')) {

        event.preventDefault();

        skinDockCollapsedOverride = !mount.collapsed;

        setSkinDockCollapsed(mount, skinDockCollapsedOverride, true);

        return;

      }


      const itemEl =
        target.closest(`[${SKIN_DOCK_ITEM_ATTR}]`);

      if (!itemEl) {
        return;
      }

      const item =
        itemsById.get(itemEl.getAttribute(SKIN_DOCK_ITEM_ATTR));

      if (!item) {
        return;
      }

      runSkinDockItemAction(mount, item, event);

    };


  /* ── 키보드 — <a href> 가 아닌 자리도 Enter/Space 로 ────── */

  const onKeyDown =
    (event) => {

      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
        return;
      }

      const target =
        event.target;

      if (!target || typeof target.closest !== "function") {
        return;
      }

      if (target.tagName === "A" && target.hasAttribute("href")) {
        return;
      }

      if (
        !target.closest(`[${SKIN_DOCK_ITEM_ATTR}]`) &&
        !target.closest('[data-imory-dock="trigger"]')
      ) {
        return;
      }

      event.preventDefault();

      target.click();

    };


  dockRoot.addEventListener("click", onClick);
  dockRoot.addEventListener("keydown", onKeyDown);

  mount.listeners.push(
    () => dockRoot.removeEventListener("click", onClick),
    () => dockRoot.removeEventListener("keydown", onKeyDown)
  );


  return mount;

}


/* =========================================================
   unmountSkinBottomDock — 내린다

   "가려진 것"이 아니라 "없어진 것"이어야 한다: 리스너·타이머·
   플랫폼이 만든 자리·문서에 얹은 여백 클래스까지 전부 되돌린다.
========================================================== */

function unmountSkinBottomDock() {

  const mount =
    currentSkinDock;

  if (!mount) {
    return;
  }

  currentSkinDock = null;


  mount.listeners.forEach((off) => {

    try {
      off();
    } catch (err) {}

  });


  /* 접기 전환의 타이머는 전환 primitive 가 요소별로 갖고 있다
     (skin/skin-transition.js). 요소가 떨어지면 그 타이머는 떨어진
     요소의 상태만 맞추고 끝난다 — 새 dock 에 닿지 않는다. */


  /*
    ★ 렌더 루트를 **먼저** 직접 뗀다.

    renderSkin() 의 destroy() 는 자기가 마운트될 때 받은 컨테이너를
    비운다. 그런데 auto 판정이 바뀌면 루트가 다른 자리로 옮겨 가
    있을 수 있어서(moveSkinDockToPosition), 그때 destroy() 는
    **비어 있는 옛 자리**를 비우고 끝난다. 옮겨 간 자리가 스킨이
    그린 region 이면(아래에서 지우지 않는다) dock 이 화면에 남고,
    다음 화면이 자기 dock 을 그리는 순간 둘이 된다.
  */

  if (mount.dockRoot && mount.dockRoot.parentNode) {

    mount.dockRoot.parentNode.removeChild(mount.dockRoot);

  }


  try {
    mount.instance.destroy();
  } catch (err) {}


  /* 스킨이 그린 region 은 지우지 않는다 — 스킨 DOM 이다.
     플랫폼이 만든 자리만 치운다. */

  if (
    mount.host &&
    mount.host.parentElement &&
    (
      mount.host.id === SKIN_DOCK_FIXED_HOST_ID ||
      mount.host.classList.contains(SKIN_DOCK_FLOW_HOST_CLASS)
    )
  ) {

    mount.host.parentElement.removeChild(mount.host);

  }


  applySkinDockContentPadding(mount.doc, null, "static");

}


/* =========================================================
   syncSkinBottomDockForScreen(options)

     document    기본 window.document (Studio Preview 는 자기 문서)
     skinPackage 지금 화면을 그린 SkinPackage
     context     그 화면의 Skin Context
     container   스킨이 그려진 자리(skinRoot 를 못 줄 때 이것만 줘도 된다)
     skinRoot    렌더된 스킨 루트(.imory-skin-root) — 있으면 더 정확하다
     dock        설정을 SkinPackage 대신 직접 줄 때(Studio Preview)
     dockTemplate template 을 직접 줄 때(Studio Preview)
     pageType    "home" 이면 재료를 기억해 둔다(HOME 복귀용)
     active      false 면 조건과 무관하게 내린다

   각 화면이 "이 화면을 그렸다"를 확정한 직후 부른다. 언제 불러도
   결과는 같다 — 항상 지금 화면의 dock 하나만 남는다.

   ★ 절대 throw 하지 않는다. dock 설정 하나 때문에 공개 화면이
     깨지면 안 된다(skin/skin-home.js 의 책임 경계와 같은 규칙).
========================================================== */

function syncSkinBottomDockForScreen(options = {}) {

  const doc =
    options.document ||
    (typeof document !== "undefined" ? document : null);

  if (!doc) {
    return null;
  }


  try {

    unmountSkinBottomDock();


    if (options.pageType === "home") {

      skinDockHomeOptions = {
        document: options.document,
        skinPackage: options.skinPackage,
        context: options.context,
        container: options.container,
        skinRoot: options.skinRoot,
        pageType: "home"
      };

    }


    if (options.active === false) {
      return null;
    }


    if (typeof resolveSkinBottomDock !== "function") {
      return null;
    }


    /*
      설정은 보통 SkinPackage 에서 꺼낸다. Studio Preview 만
      예외다 — 그 문서는 SkinPackage 전체가 아니라 "이번에 그릴
      template 한 장"을 봉투로 받으므로(studio/studio-preview.js
      postRenderToFrame) dock 설정과 template 도 봉투에 실려 온다.

      그렇게 받은 값도 **똑같이 정규화를 거친다** — 같은 origin
      메시지라도 모양 검사를 생략하지 않는다는 Preview 계약 그대로다.
    */

    const dock =
      options.dock
        ? (
            normalizeSkinBottomDock(options.dock).dock || null
          )
        : resolveSkinBottomDock(options.skinPackage);

    if (!dock || !dock.visible) {
      return null;
    }


    const dockContext =
      buildSkinDockContext(
        dock,
        options.context,
        {
          currentHref:
            doc.defaultView ? doc.defaultView.location.pathname : null
        }
      );

    if (!dockContext || !dockContext.hasDock) {
      return null;
    }


    /*
      dock 이 기댈 요소 하나.

      보통은 renderSkin 이 만든 스킨 루트([data-skin-root])다 —
      스킨이 그린 bottom-dock region 을 그 안에서 찾고, 흐름 자리도
      그 바로 뒤에 만든다.

      sandbox 스킨(별도 origin iframe)에서는 그 루트가 프레임 **안**에
      있어 부모에서 닿지 않는다. 그래서 그때는 컨테이너(iframe 이
      들어 있는 자리)를 기준으로 삼는다 — dock 은 sandbox 에서도
      부모가 native 로 그린다(IMORY_BOTTOM_DOCK_DESIGN.md §10).
    */

    const skinRoot =
      options.skinRoot ||
      (
        options.container && typeof options.container.querySelector === "function"
          ? (options.container.querySelector("[data-skin-root]") || options.container)
          : null
      );


    /*
      auto 의 첫 판정은 dock 을 아직 붙이지 않은 지금 한다 —
      화면이 이미 그려져 있으면 이 값이 그대로 맞고, 아직 열리는
      중이면 watchAutoSkinDockPosition 이 곧 고친다. 사용자가
      명시한 값은 재지 않는다(요구사항 5절 마지막 줄).
    */

    const position =
      dock.position === "auto"
        ? resolveAutoSkinDockPosition(doc, skinRoot, null)
        : dock.position;


    const template =
      options.dockTemplate &&
      typeof options.dockTemplate.html === "string"
        ? options.dockTemplate
        : resolveSkinDockTemplate(options.skinPackage);


    const mount =
      mountSkinBottomDock({
        doc,
        dockContext,
        template,
        context: options.context || {},
        skinRoot,
        position,
        transitionSpec: dock.transition
      });

    if (!mount) {
      return null;
    }

    currentSkinDock = mount;


    applySkinDockContentPadding(doc, mount.dockRoot, position);


    /* auto 는 화면이 실제로 드러난 뒤에 한 번 더 판정한다 */

    watchAutoSkinDockPosition(mount);


    /*
      창 크기가 바뀌면 두 가지가 달라진다 — fixed dock 의 높이(줄이
      늘거나 줄어든다)와 auto 판정(가로가 좁아지면 스크롤이 생긴다).
      둘 다 여기서 다시 맞춘다. 화면 전환 때 unmount 가 이 리스너를
      떼므로 쌓이지 않는다.
    */

    const view =
      doc.defaultView;

    if (view) {

      const onResize =
        () => {

          if (currentSkinDock !== mount) {
            return;
          }

          applySkinDockContentPadding(doc, mount.dockRoot, mount.position);

        };

      view.addEventListener("resize", onResize);

      mount.listeners.push(
        () => view.removeEventListener("resize", onResize)
      );

    }


    return mount;

  }

  catch (err) {

    console.error("[skin-bottom-dock] sync failed", err);

    try {
      unmountSkinBottomDock();
    } catch (cleanupError) {}

    return null;

  }

}


/*
  화면을 떠날 때(관리 화면 · 에디터 등 스킨이 아닌 화면) 부른다 —
  hidePlatformMemoEntry() 와 같은 자리다.
*/
function hideSkinBottomDock() {

  unmountSkinBottomDock();

}


/* =========================================================
   restoreSkinBottomDockForHome()

   HOME 으로 돌아왔을 때 부른다(posts/view/posts-view-transition.js).
   HOME 을 그린 적이 없으면 아무 일도 하지 않는다 — HOME 이 legacy
   화면이거나 published 스킨이 없는 블로그에서는 dock 자체가 없다.

   ★ "돌아왔으니 그냥 두자"가 아니라 **다시 그린다**. CATEGORY 에서
     쓰던 dock 은 그 화면의 항목 구성(viewer.manageHref 등)과 auto
     자리 판정을 가지고 있어서, 그대로 두면 HOME 에서 엉뚱한 자리에
     엉뚱한 항목이 남는다.
========================================================== */

function restoreSkinBottomDockForHome() {

  if (!skinDockHomeOptions) {

    unmountSkinBottomDock();

    return null;

  }

  return syncSkinBottomDockForScreen(skinDockHomeOptions);

}


if (typeof window !== "undefined") {

  window.syncSkinBottomDockForScreen = syncSkinBottomDockForScreen;
  window.hideSkinBottomDock = hideSkinBottomDock;
  window.restoreSkinBottomDockForHome = restoreSkinBottomDockForHome;

  /* 테스트/진단용 — 지금 떠 있는 dock 하나를 들여다본다 */
  window.__imorySkinDockDebug = () => currentSkinDock;

}
