/* =========================================================
   SKIN BOTTOM DOCK — 접기 · 동작 (DOM)

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md §6 · §7

   skin/skin-bottom-dock-mount.js 에서 갈라 나온 파일이다. 그쪽은
   "어디에 두는가"(자리 · 여백 · 수명)를 담당하고, 여기는 "눌렀을 때
   무엇이 일어나는가"를 담당한다 — 접기/펼치기 상태 기계와 다섯 가지
   동작(navigate · open · share · theme · top), 그리고 주소 없는
   자리를 키보드로 쓸 수 있게 만드는 한 함수.

   두 파일은 같은 realm 의 classic script 라 최상위 함수/상수를
   그대로 공유한다(studio/inspector/* 가 일곱 파일로 갈라진 것과 같은
   방식) — 로드 순서는 이 파일이 먼저다. 실행 시점에 서로의 함수를
   부르므로 사실 순서는 자유지만, 읽는 순서를 그렇게 정해 둔다.

   의존: 없음(순수 DOM). navigateToSkinRoute / resolveInSiteSkinRoute
   (skin/skin-link-nav.js)는 **있으면** 쓴다.
========================================================== */

/* =========================================================
   작은 도우미
========================================================== */

function skinDockPrefersReducedMotion(doc) {

  try {

    const view =
      doc && doc.defaultView;

    return !!(
      view &&
      view.matchMedia &&
      view.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

  } catch (err) {
    return false;
  }

}


/*
  스킨이 들어 있는 **스크롤 담당 요소**를 찾는다.

  HOME 은 #themeMount(theme-mount--skin), 그 밖의 화면은 .post-area 가
  자기 안에서 스크롤한다(home/home-base.css · posts/posts-base.css).
  둘 중 무엇인지 이름으로 묻지 않고 계산된 overflow 로 찾는다 —
  화면이 하나 더 생겨도 이 함수는 그대로다.
*/
function findSkinDockScrollContainer(el) {

  const doc =
    el && el.ownerDocument;

  const view =
    doc && doc.defaultView;

  if (!view) {
    return null;
  }


  let current =
    el && el.parentElement;

  while (current && current !== doc.body) {

    let overflowY;

    try {
      overflowY = view.getComputedStyle(current).overflowY;
    } catch (err) {
      overflowY = "";
    }

    if (overflowY === "auto" || overflowY === "scroll") {
      return current;
    }

    current = current.parentElement;

  }


  return doc.scrollingElement || doc.documentElement || null;

}



/* =========================================================
   접기 / 펼치기

   전환은 CSS 가 한다(skin/skin-bottom-dock.css). 여기서는 상태
   속성을 바꾸고, 닫힐 때만 전환이 끝난 뒤 hidden 을 얹는다 —
   전환 중에 요소가 레이아웃에서 사라지면 애니메이션이 보이지
   않기 때문이다.

   prefers-reduced-motion 이거나 transition 이 "none" 이면 기다리지
   않는다(요구사항 11절).
========================================================== */

const SKIN_DOCK_TRANSITION_MS = 220;

function setSkinDockCollapsed(mount, collapsed, animate) {

  if (!mount || !mount.dockRoot) {
    return;
  }

  const {
    dockRoot,
    itemsEl,
    triggerEl,
    doc
  } = mount;


  mount.collapsed = collapsed;

  dockRoot.setAttribute(
    "data-imory-dock-state",
    collapsed ? "collapsed" : "expanded"
  );

  if (triggerEl) {

    triggerEl.setAttribute(
      "aria-expanded",
      collapsed ? "false" : "true"
    );

  }


  if (!itemsEl) {
    return;
  }


  const instant =
    animate === false ||
    mount.transition === "none" ||
    skinDockPrefersReducedMotion(doc);


  if (mount.collapseTimer) {

    doc.defaultView.clearTimeout(mount.collapseTimer);

    mount.collapseTimer = 0;

  }


  if (!collapsed) {

    /* 펼치기 — 먼저 레이아웃에 되돌려 놓아야 전환이 보인다 */

    itemsEl.hidden = false;

    return;

  }


  if (instant) {

    itemsEl.hidden = true;

    return;

  }


  mount.collapseTimer =
    doc.defaultView.setTimeout(
      () => {

        mount.collapseTimer = 0;

        if (mount.collapsed) {
          itemsEl.hidden = true;
        }

      },
      SKIN_DOCK_TRANSITION_MS
    );

}


/* =========================================================
   동작

   navigate 는 여기서 처리하지 않는다 — dock 은 renderSkin() 이
   그리므로 루트에 .imory-skin-root 가 붙고, 그 안의 <a href> 클릭은
   이미 기존 SPA 라우터가 가져간다(skin/skin-link-nav.js). 별도
   라우터를 만들지 않는다는 원칙 그대로다.

   스킨이 항목을 <a> 가 아닌 것으로 그렸을 때만 여기서 같은 출구로
   보낸다(navigateToSkinRoute).
========================================================== */

async function runSkinDockNavigate(mount, href) {

  const view =
    mount.doc.defaultView;

  let url;

  try {
    url = new URL(href, view.location.href);
  } catch (err) {
    return;
  }


  if (
    typeof resolveInSiteSkinRoute === "function" &&
    typeof navigateToSkinRoute === "function"
  ) {

    const route =
      resolveInSiteSkinRoute(url);

    if (route) {

      await navigateToSkinRoute(route, url);

      return;

    }

  }


  view.location.assign(url.href);

}


function runSkinDockShare(mount) {

  const view =
    mount.doc.defaultView;

  const url =
    view.location.href;

  const title =
    (mount.context && mount.context.site && mount.context.site.title) || "";


  if (view.navigator && typeof view.navigator.share === "function") {

    view.navigator.share({ title, url }).catch(() => {});

    return;

  }


  if (view.navigator && view.navigator.clipboard) {

    view.navigator.clipboard.writeText(url).catch(() => {});

  }

}


/*
  Imory 시스템 UI 의 라이트/다크 토글. 그 버튼이 화면에 없으면
  아무 일도 하지 않는다 — dock 이 자기 테마 상태를 따로 갖지
  않는다(상태가 두 벌이 되면 서로 어긋난다).
*/
function runSkinDockThemeToggle(mount) {

  const toggle =
    mount.doc.getElementById("startThemeToggle");

  if (toggle && typeof toggle.click === "function") {
    toggle.click();
  }

}


function runSkinDockScrollTop(mount) {

  const scroller =
    findSkinDockScrollContainer(mount.dockRoot) ||
    mount.doc.scrollingElement;

  if (!scroller || typeof scroller.scrollTo !== "function") {
    return;
  }

  scroller.scrollTo({
    top: 0,
    behavior: skinDockPrefersReducedMotion(mount.doc) ? "auto" : "smooth"
  });

}


/*
  open — 패널 하나를 연다/닫는다.

  플랫폼은 dock 루트의 data-imory-dock-open 값만 바꾼다. 무엇이
  어떻게 보일지는 전적으로 스킨 CSS 다:

    [data-imory-dock-open="pair"] .my-pair-panel { display: block; }

  같은 항목을 한 번 더 누르면 닫힌다(토글).
*/
function runSkinDockOpenPanel(mount, panelId) {

  const current =
    mount.dockRoot.getAttribute("data-imory-dock-open");

  if (current === panelId) {

    mount.dockRoot.removeAttribute("data-imory-dock-open");

    return;

  }

  mount.dockRoot.setAttribute("data-imory-dock-open", panelId);

}


function runSkinDockItemAction(mount, item, event) {

  if (item.isOpen) {

    event.preventDefault();

    runSkinDockOpenPanel(mount, item.panelId);

    return;

  }


  if (item.isAction) {

    if (item.actionTarget === "share") {
      event.preventDefault();
      runSkinDockShare(mount);
      return;
    }

    if (item.actionTarget === "theme") {
      event.preventDefault();
      runSkinDockThemeToggle(mount);
      return;
    }

    if (item.actionTarget === "top") {
      event.preventDefault();
      runSkinDockScrollTop(mount);
      return;
    }

  }


  /* 주소가 있는 항목 — 스킨이 <a href> 로 그렸으면 기존 라우터가
     이미 가져갔으므로 여기 오지 않는다. */

  if (item.hasHref) {

    const anchor =
      event.target &&
      typeof event.target.closest === "function"
        ? event.target.closest("a[href]")
        : null;

    if (anchor) {
      return;
    }

    event.preventDefault();

    runSkinDockNavigate(mount, item.href);

  }

}


/* =========================================================
   렌더된 dock 에 플랫폼 몫 얹기

   - 주소 없는 항목/트리거를 키보드로 쓸 수 있게 한다.
     (스킨 HTML 은 tabindex 를 쓸 수 없다 — sanitizer 가 전면
      금지한다. 그래서 렌더 뒤에 플랫폼이 얹는다.)
   - 보이는 글자가 없는 항목에 읽히는 이름을 준다.
   - 터치 영역을 최소 44px 로 보장하는 것은 CSS 의 몫이다
     (skin/skin-bottom-dock.css — 시각적 크기는 스킨이 정하고
      hit area 만 플랫폼이 넓힌다, 요구사항 10절).
========================================================== */

function prepareSkinDockInteractive(el, accessibleLabel) {

  if (!el) {
    return;
  }

  const isRealLink =
    el.tagName === "A" && el.hasAttribute("href");

  if (!isRealLink) {

    if (!el.hasAttribute("role")) {
      el.setAttribute("role", "button");
    }

    el.setAttribute("tabindex", "0");

  }


  if (
    accessibleLabel &&
    !el.hasAttribute("aria-label") &&
    !String(el.textContent || "").trim()
  ) {

    el.setAttribute("aria-label", accessibleLabel);

  }

}
