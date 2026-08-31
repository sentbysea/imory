/* =========================================================
   HOME - CATEGORY MENU (imory 공통)

   home/site-content.js에서 분리됨(Phase 0-5, 다중 사용자
   전환 계획 참고). site-content.js는 legacy about/notice/ng
   로더였고, 이 파일에는 그것과 무관한 카테고리 nav 메뉴
   로더만 남김.

   supabaseClient / SUPABASE_URL / SUPABASE_KEY는
   core/lib/supabase-client.js에서 전역으로 만들어짐
   (index.html에서 이 파일보다 먼저 로드됨).
========================================================== */

/* =========================================================
   카테고리 불러오기
========================================================== */

async function loadCategories() {

  const categoryMenuLinks =
    document.getElementById(
      "categoryMenuLinks"
    );


  if (!categoryMenuLinks) {
    return;
  }


  const owner =
    await getSiteOwner();

  if (
    owner.scoped &&
    !owner.ownerId
  ) {

    categoryMenuLinks.innerHTML =
      "";

    return;

  }

  let categoriesQuery =
    supabaseClient
      .from("categories")
      .select(
        "id, name, slug, sort_order"
      );

  if (owner.scoped) {

    categoriesQuery =
      categoriesQuery.eq(
        "user_id",
        owner.ownerId
      );

  }

  const { data, error } =
    await categoriesQuery.order(
      "sort_order",
      {
        ascending: true
      }
    );


  if (error) {

    console.error(
      "카테고리 불러오기 실패:",
      error
    );

    return;
  }


  categoryMenuLinks.innerHTML =
    "";


  data.forEach((category) => {

    const link =
      document.createElement(
        "a"
      );


    /*
      href="#"였던 예전 코드는 index.html의 <base href="/"> 때문에
      "/"(루트)로 풀린다 — 클릭 핸들러(posts/editor/
      posts-list-detail-nav.js)가 아직 안 붙어있는 상태에서
      클릭되면 그대로 루트 랜딩으로 튕겨나간다. 실제
      /:slug/category/:id 경로를 넣어두면 핸들러가 이미 붙어있을
      때는 기존처럼 preventDefault + openCategoryPage()로 처리되고,
      혹시 아직 안 붙어있어도 브라우저 기본 이동이 올바른 경로로
      간다. posts-refs.js의 buildPostRoute는 이 시점에 아직 로드
      전이라 site-path.js의 공용 헬퍼를 직접 쓴다.
    */

    link.href =
      buildSitePath(
        getSiteOwnerSlugFromPath(),
        `/category/${category.id}`
      );


    link.textContent =
      category.name;


    link.dataset.categoryId =
      category.id;


    link.dataset.categorySlug =
      category.slug;


    categoryMenuLinks.appendChild(
      link
    );

  });

}


/* =========================================================
   초기 로드
========================================================== */

loadCategories();
