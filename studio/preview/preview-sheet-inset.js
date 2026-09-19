/* =========================================================
   STUDIO PREVIEW — 시트 여유 공간 (MOBILE-SHEET-1)

   기준 문서: IMORY_STUDIO_SHELL_DESIGN.md §5-1

   좁은 화면의 Studio 에서는 편집 시트가 이 Preview 의 아래쪽을 덮는다.
   Studio(studio/studio-sheet.js)가 덮인 높이를 이 문서의 CSS 픽셀로
   알려 주면, 이 문서는 **자기 스크롤 끝**에 그만큼의 여유를 둔다 —
   짧은 페이지의 맨 아래 요소도 시트 위로 끌어올릴 수 있게.

     parent -> iframe  "preview:viewport-inset"  { type, bottom }
     parent -> iframe  "preview:scroll-by"       { type, top }

   ★ 스킨에는 아무것도 붙이지 않는다
     여유는 <html> 의 마지막 자식인 Studio 전용 요소 하나
     (<imory-studio-spacer>)다. #previewRoot(스킨이 그려지는 자리) 밖이고,
     절대 위치라 body 의 flex/grid 배치에 끼어들지 않으며, 보이지도
     눌리지도 않는다. 이 문서는 Studio 안에서만 쓰이므로 저장되는
     SkinPackage · 공개 화면과 무관하다. scroll-padding-bottom 은 이
     문서 <html> 의 inline style 이다.

   ★ 줄어들 때 튀지 않는다
     시트를 접으면 여유도 줄어야 하지만, 지금 그 여유 안까지 스크롤해
     내려와 있으면 스크롤 끝이 당겨져 화면이 확 내려간다. 그래서 여유는
     "지금 보고 있는 자리를 잃지 않을 만큼"보다 작아지지 않고, 사용자가
     위로 스크롤하는 만큼 따라 줄어든다.

   ★ 스크롤은 이 문서만
     "preview:scroll-by" 는 이 문서의 스크롤만 옮긴다. 요소 좌표 ·
     스킨 레이아웃 · 저장되는 값은 그대로다.
========================================================== */

(function () {

  const SPACER_TAG = "imory-studio-spacer";

  /* 선택 요소를 시트에서 조금 띄워 보이게 하는 여백(12px)까지 */
  const SPACER_EXTRA = 16;

  const MAX_INSET = 4000;

  let inset = 0;

  let spacer = null;

  let scheduled = 0;


  function contentBottom() {

    const body =
      document.body;

    if (!body) {
      return 0;
    }

    const scrollY =
      window.scrollY || 0;

    let bottom =
      body.getBoundingClientRect().top + scrollY + body.scrollHeight;

    const root =
      document.getElementById("previewRoot");

    if (root) {
      bottom = Math.max(bottom, root.getBoundingClientRect().bottom + scrollY);
    }

    return Math.ceil(bottom);

  }


  function layout() {

    scheduled = 0;

    const html =
      document.documentElement;

    if (inset > 0) {
      html.style.scrollPaddingBottom = `${inset}px`;
    } else {
      html.style.removeProperty("scroll-padding-bottom");
    }

    const bottom =
      contentBottom();

    const keep =
      spacer
        ? Math.max(0, Math.ceil((window.scrollY || 0) + window.innerHeight - bottom))
        : 0;

    const height =
      Math.max(inset > 0 ? inset + SPACER_EXTRA : 0, keep);

    if (height <= 0) {

      if (spacer) {
        spacer.remove();
        spacer = null;
      }

      return;

    }

    if (!spacer) {

      spacer =
        document.createElement(SPACER_TAG);

      spacer.setAttribute("aria-hidden", "true");

      spacer.style.cssText =
        "display:block;position:absolute;left:0;width:1px;margin:0;padding:0;" +
        "border:0;visibility:hidden;pointer-events:none;";

      html.appendChild(spacer);

    }

    spacer.style.top = `${bottom}px`;

    spacer.style.height = `${height}px`;

  }


  function schedule() {

    if (scheduled || (!spacer && inset === 0)) {
      return;
    }

    scheduled =
      window.requestAnimationFrame(layout);

  }


  function scrollPreviewBy(dy) {

    /* 여유가 먼저 있어야 끝까지 내려갈 수 있다 */
    layout();

    const scroller =
      document.scrollingElement || document.documentElement;

    scroller.scrollTop =
      scroller.scrollTop + dy;

  }


  window.addEventListener("message", (event) => {

    if (event.origin !== window.location.origin || event.source !== window.parent) {
      return;
    }

    const data =
      event.data;

    if (!data || typeof data !== "object") {
      return;
    }

    if (data.type === "preview:viewport-inset") {

      const bottom =
        Number(data.bottom);

      if (!Number.isFinite(bottom)) {
        return;
      }

      inset =
        Math.round(Math.max(0, Math.min(MAX_INSET, bottom)));

      layout();

      return;

    }

    if (data.type === "preview:scroll-by") {

      const top =
        Number(data.top);

      if (!Number.isFinite(top) || Math.abs(top) > MAX_INSET) {
        return;
      }

      scrollPreviewBy(Math.round(top));

    }

  });


  /* 사용자가 위로 스크롤하면 남겨 두었던 여유가 따라 줄어든다 ·
     스킨이 다시 그려져 높이가 바뀌면 여유의 자리를 옮긴다 */
  window.addEventListener("scroll", schedule, { passive: true });

  window.addEventListener("resize", schedule);

  if (typeof ResizeObserver === "function") {

    const observe = () => {

      const root =
        document.getElementById("previewRoot");

      if (root) {
        new ResizeObserver(schedule).observe(root);
      }

    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", observe);
    } else {
      observe();
    }

  }


  /* 테스트용 읽기 창구 — Studio 는 읽지 않는다 */
  window.__imoryStudioSheetInset =
    function () {
      return {
        inset,
        spacer: spacer
          ? { top: parseFloat(spacer.style.top) || 0, height: parseFloat(spacer.style.height) || 0 }
          : null,
        scrollPaddingBottom: document.documentElement.style.scrollPaddingBottom || ""
      };
    };

})();
