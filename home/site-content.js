/* =========================================================
   HOME - SUPABASE / SITE CONTENT (imory 공통)

   home-content.js에서 이동(파일명만 변경, 내용은 그대로).

   supabaseClient / SUPABASE_URL / SUPABASE_KEY는
   core/lib/supabase-client.js에서 전역으로 만들어짐
   (index.html에서 이 파일보다 먼저 로드됨). 같은 페이지의
   다른 스크립트(home/bgm.js, site-footer.js 등)도 그 전역을
   그대로 사용함.

   여기 있는 loadSiteContent()는 section/content를 그대로
   불러와 `#{section}Text` 요소에 채우는 범용 loader이고,
   about/notice/ng라는 구체적인 이름이나 그 텍스트가 들어갈
   고정 DOM(현재는 themes/sua의 프로필 2페이지)은 이 파일에
   전혀 등장하지 않음 — 그래서 이번 분리 단계에서 sua 쪽으로
   옮길 코드가 따로 없음(테마 무관 공통 loader).
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
