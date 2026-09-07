/* =========================================================
   SKIN LINK NAV (published Skin 내부 링크 → SPA 라우팅)

   published Skin이 그리는 링크는 data-imory-href가 만든 평범한
   <a href="/:slug/post/:id"> 등이다(skin/skin-render.js). 지금까지
   이 링크들은 어떤 핸들러에도 걸리지 않아 매번 문서 전체가 다시
   로드됐다 — 클릭할 때마다 화면이 흰 배경으로 완전히 비워졌다가
   index.html + posts.html + 30여 개 스크립트를 처음부터 다시 받고
   나서야 다음 화면이 나타난다. 실사용자가 보고한 "흰색 배경이
   페이드인한 뒤 다음 화면으로 넘어가는 부자연스러운 전환"의
   본체가 이것이다(그 위에 posts-view-transition.js의 흰색 커튼
   380ms가 한 번 더 겹쳐 있었다).

   이 파일은 published Skin 안에서 시작된 클릭만 가로채서 기존 SPA
   라우터(openPostPage/openCategoryPage/closePostArea)로 넘긴다.
   같은 세 경로에 ?write=1 / ?edit=1 / ?manage=1이 붙어 있으면
   작성 폼(startPostCompose) / 수정 폼(openPostEditor) / 목록 관리
   패널로 곧장 넘긴다 — 옛 목록·상세 화면을 한 번 그렸다가 그 위에서
   다시 폼을 여는 중간 단계를 만들지 않기 위해서다(주소 계약은
   core/lib/site-path.js, 권한 검사는 받는 쪽이 다시 한다).
   그 라우터들이 이미 갖고 있는 보호 장치를 그대로 물려받는다 —
   요청 순번(postPageRequestSeq/categoryPageRequestSeq)으로 늦게
   도착한 응답이 최신 화면을 덮지 않게 하고, 화면이 준비된 뒤에야
   #postArea를 커튼 없이 드러내며(revealPostArea), 실패하면 오류와
   뒤로가기 경로를 되살린다.

   가로채지 않는 것(전부 브라우저 기본 동작 그대로 둔다):
   - Skin 바깥(.imory-skin-root 밖)에서 시작된 클릭 — legacy
     post-list/배너/메뉴 링크의 기존 동작을 한 줄도 바꾸지 않는다.
   - 다른 오리진, target=_blank, download, 수정키/보조버튼 클릭.
   - 이 사이트의 /:slug, /:slug/post/:id, /:slug/category/:id
     세 패턴에 해당하지 않는 주소(배너의 외부 URL 등).
   - 이미 다른 핸들러가 preventDefault()한 클릭.

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   core/lib/site-path.js(SITE_BASE_PATH), home/site-owner.js
   (siteOwnerSlug). 실제 라우팅 함수(openPostPage 등)와
   loadPostsModule()은 posts 모듈/index.html이 나중에 정의하므로
   클릭 시점에 존재 여부를 확인해서 쓴다 — 아직 없으면 가로채지
   않고 브라우저 기본 이동에 맡긴다(모듈 로드 전 첫 클릭도 절대
   먹통이 되지 않는다).
========================================================== */

/* =========================================================
   resolveInSiteSkinRoute(url) -> null | {page,id}

   같은 사이트의 SPA 라우트면 그 라우트를, 아니면 null.
   getSitePathAfterSlug()/handlePostRoute()가 쓰는 규칙과 동일한
   패턴만 인정한다(core/lib/site-path.js,
   posts/editor/posts-router-init.js).
========================================================== */

function resolveInSiteSkinRoute(url) {

  if (url.origin !== window.location.origin) {
    return null;
  }


  let pathname = url.pathname;

  if (
    typeof SITE_BASE_PATH === "string" &&
    SITE_BASE_PATH &&
    pathname.startsWith(SITE_BASE_PATH)
  ) {

    pathname =
      pathname.slice(SITE_BASE_PATH.length) || "/";

  }


  const segments =
    pathname.split("/").filter(Boolean);


  /*
    scoped 배포(/:slug/...)면 첫 segment가 지금 보고 있는 사이트의
    slug와 정확히 같아야 한다 — 다른 사용자의 홈으로 가는 링크는
    SPA로 처리할 수 없으므로(전체 사이트 상태가 바뀐다) 그대로
    문서 이동에 맡긴다. unscoped 배포면 경로가 곧 sub-path다.
  */

  if (siteOwnerSlug) {

    if (segments[0] !== siteOwnerSlug) {
      return null;
    }

    segments.shift();

  }


  if (segments.length === 0) {

    /*
      HOME 경로 + ?write=1은 "대상 카테고리가 아직 정해지지 않은
      작성 요청"이다(core/lib/site-path.js). 여기서는 전달만 하고,
      소유자 검사와 카테고리 결정은 startPostCompose()가 한다.
    */

    return {
      page: "home",
      id: null,
      compose: isSiteComposeRequested(url.search)
    };

  }


  if (
    segments.length === 2 &&
    /^\d+$/.test(segments[1])
  ) {

    if (segments[0] === "post") {

      /*
        ?edit=1은 "이 글의 수정 폼을 열어달라"는 요청이다 —
        작성자 검사는 openPostEditor()가 다시 한다.
      */

      return {
        page: "post",
        id: Number(segments[1]),
        edit: isSiteEditRequested(url.search)
      };

    }

    if (segments[0] === "category") {

      /*
        PHASE 1E 관리 진입 계약 — 같은 카테고리 경로라도 ?manage=1이
        붙어 있으면 "목록 관리 패널을 열어달라", ?write=1이면 "이
        카테고리에 새 글을 쓰겠다"는 요청이다(core/lib/site-path.js).
        여기서는 전달만 하고, 실제 소유자 검사는 각각
        openCategoryPage()/startPostCompose()가 한다.
      */

      return {
        page: "category",
        id: Number(segments[1]),
        manage: isSiteManageRequested(url.search),
        compose: isSiteComposeRequested(url.search)
      };

    }

  }


  return null;

}


/* =========================================================
   클릭 위임

   document 하나에만 건다 — Skin은 매 화면마다 통째로 다시
   그려지므로(renderSkin이 container.innerHTML을 교체) 개별
   엘리먼트에 리스너를 붙이면 화면이 바뀔 때마다 사라진다.
========================================================== */

document.addEventListener(
  "click",
  async (event) => {

    if (event.defaultPrevented) {
      return;
    }


    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }


    const target = event.target;

    if (!target || typeof target.closest !== "function") {
      return;
    }


    const anchor =
      target.closest("a[href]");

    if (!anchor) {
      return;
    }


    /*
      .imory-skin-root은 renderSkin()이 모든 Skin 인스턴스의 루트에
      붙이는 플랫폼 소유 클래스다(skin/skin-render.js) — 개별 Skin이
      쓰는 클래스명(.quiet-* 등)에는 절대 의존하지 않는다.
    */

    if (!anchor.closest(".imory-skin-root")) {
      return;
    }


    if (
      anchor.hasAttribute("download") ||
      (anchor.target && anchor.target !== "_self")
    ) {
      return;
    }


    let url;

    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }


    const route =
      resolveInSiteSkinRoute(url);

    if (!route) {
      return;
    }


    /*
      posts 모듈(openPostPage 등)이 아직 준비되지 않았을 수 있다 —
      index.html이 idle 시점에 프리워밍하지만 그보다 빠른 첫 클릭이
      있을 수 있다. loadPostsModule()이 있으면 기다렸다가 SPA로
      처리하고, 그마저 없거나 실패하면 가로채지 않은 것과 동일하게
      브라우저 이동으로 넘긴다.
    */

    event.preventDefault();


    try {

      if (typeof loadPostsModule === "function") {

        await loadPostsModule();

      }


      /*
        작성/수정 요청(?write=1 / ?edit=1)은 어느 경로에 붙어 있든
        먼저 처리한다 — 옛 목록/상세 화면을 한 번 그렸다가 그
        위에서 다시 폼을 여는 중간 단계를 만들지 않기 위해서다.
        소유자/작성자 검사는 받는 쪽(startPostCompose /
        openPostEditor)이 한다.
      */

      if (route.compose === true) {

        if (typeof startPostCompose !== "function") {
          throw new Error("startPostCompose unavailable");
        }

        await startPostCompose({
          categoryId:
            route.page === "category"
              ? route.id
              : null
        });

        return;

      }


      if (
        route.page === "post" &&
        route.edit === true
      ) {

        if (typeof openPostEditor !== "function") {
          throw new Error("openPostEditor unavailable");
        }

        await openPostEditor(route.id);

        return;

      }


      if (route.page === "post") {

        if (typeof openPostPage !== "function") {
          throw new Error("openPostPage unavailable");
        }

        await openPostPage(route.id);

        return;

      }


      if (route.page === "category") {

        if (typeof openCategoryPage !== "function") {
          throw new Error("openCategoryPage unavailable");
        }

        await openCategoryPage(
          route.id,
          {
            manage: route.manage === true
          }
        );

        return;

      }


      /*
        HOME: #themeMount의 HOME Skin은 계속 mount된 채 남아 있으므로
        #postArea만 애니메이션 없이 닫으면 곧바로 HOME이 보인다.
        이미 HOME이면 아무것도 하지 않는다(불필요한 history 항목을
        쌓지 않는다).
      */

      if (
        typeof currentPostView === "string" &&
        currentPostView === "home"
      ) {
        return;
      }


      if (typeof closePostArea !== "function") {
        throw new Error("closePostArea unavailable");
      }


      await closePostArea({
        animate: false
      });

    }

    catch (err) {

      console.error(
        "[skin-link-nav] SPA navigation failed, falling back to document navigation",
        err
      );

      window.location.assign(url.href);

    }

  }
);
