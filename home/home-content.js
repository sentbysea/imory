/* =========================================================
   HOME - SUPABASE / SITE CONTENT

   script.js에서 분리됨.

   여기서 만드는 supabaseClient는 같은 페이지의 다른 스크립트
   (home-bgm.js, site-footer.js 등)에서도 전역으로 그대로
   사용하므로, 이 파일이 가장 먼저 로드되어야 함
   (index.html 순서 참고).
========================================================== */

/* =========================================================
   SUPABASE 연결
========================================================== */

const SUPABASE_URL =
  "https://iokdgqzfprtggsnrusez.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_N9mPjBMUQJEhKYPo9ZMlZg_9i7GEsYp";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


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
