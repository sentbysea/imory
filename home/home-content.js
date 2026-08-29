/* =========================================================
   HOME - SUPABASE / SITE CONTENT

   script.js에서 분리됨.

   supabaseClient / SUPABASE_URL / SUPABASE_KEY는
   core/lib/supabase-client.js에서 전역으로 만들어짐
   (index.html에서 이 파일보다 먼저 로드됨). 같은 페이지의
   다른 스크립트(home-bgm.js, site-footer.js 등)도 그 전역을
   그대로 사용함.
========================================================== */

/* =========================================================
   사이트 내용 불러오기
========================================================== */

async function loadSiteContent() {

  const { data, error } =
    await supabaseClient
      .from("site_content")
      .select("section, content");

  if (error) {

    console.error(
      "사이트 내용 불러오기 실패:",
      error
    );

    return;
  }

  data.forEach((item) => {

    if (
      !item.content ||
      item.content.trim() === ""
    ) {
      return;
    }

    const target =
      document.getElementById(
        `${item.section}Text`
      );

    if (!target) {
      return;
    }

    target.textContent =
      item.content;

    target.classList.add(
      "from-supabase"
    );

  });

}


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

loadSiteContent();

loadCategories();
