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


  const { data, error } =
    await supabaseClient
      .from("categories")
      .select(
        "id, name, slug, sort_order"
      )
      .order(
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


    link.href =
      "#";


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
