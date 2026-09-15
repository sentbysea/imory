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
        /*
          PUBLIC-NUMBER-1: 공개 주소에 쓰는 번호를 함께 읽는다.
          이 값이 없으면 링크를 만들 수 없다(내부 id 는 주소에
          쓰지 않는다).
        */
        "id, public_no, name, slug, sort_order"
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


  /*
    PUBLIC-NUMBER-1: 여기서 본 (id, public_no) 짝을 표에 적어 둔다 —
    나중에 다른 화면이 내부 id 만 들고 주소를 만들 때 왕복 없이
    번호를 찾는다(core/lib/public-number.js).
  */

  rememberPublicNoRows(
    PUBLIC_NO_CATEGORY,
    owner.ownerId,
    data
  );


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
      /:slug/category/:public_no 경로를 넣어두면 핸들러가 이미
      붙어있을 때는 기존처럼 preventDefault + openCategoryPage()로
      처리되고, 혹시 아직 안 붙어있어도 브라우저 기본 이동이
      올바른 경로로 간다. posts-refs.js의 buildPostRoute는 이 시점에
      아직 로드 전이라 site-path.js의 공용 헬퍼를 직접 쓴다.

      PUBLIC-NUMBER-1: 주소의 숫자는 category.public_no 다. 방금
      읽은 행에 들어 있으므로 왕복 없이 동기로 만든다.
    */

    const categoryRoute =
      publicRouteFromRow(
        PUBLIC_NO_CATEGORY,
        category
      );


    link.href =
      buildSitePath(
        getSiteOwnerSlugFromPath(),
        categoryRoute || "/"
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
