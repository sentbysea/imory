/* =========================================================
   ADMIN SETTINGS - REFS / LOAD

   admin-settings.js가 너무 커져서(1190줄+) 쪼갠 것 중
   첫 번째 파일. admin-settings-save.js가 여기 있는 DOM
   참조를 공유해서 쓰므로 반드시 이 파일이 먼저
   로드돼야 함(admin/index.html 순서 참고).

   내용: DOM 요소 참조, 설정 탭 전환, BGM/카테고리 목록
   불러오기 및 렌더링, 카테고리 순서변경/삭제/추가.
   (about/notice/ng PROFILE 탭은 Phase 0-5에서 레거시 제거됨)
========================================================== */


/* =========================================================
   SETTINGS 요소
========================================================== */

const bgmUrlInput =
  document.getElementById(
    "bgmUrlInput"
  );


const bgmSaveButton =
  document.getElementById(
    "bgmSaveButton"
  );


const bgmSaveMessage =
  document.getElementById(
    "bgmSaveMessage"
  );

const categoryTabButton =
  document.getElementById(
    "categoryTabButton"
  );


const homeTabButton =
  document.getElementById(
    "homeTabButton"
  );


const dataTabButton =
  document.getElementById(
    "dataTabButton"
  );


const categorySettingsPanel =
  document.getElementById(
    "categorySettingsPanel"
  );


const homeSettingsPanel =
  document.getElementById(
    "homeSettingsPanel"
  );


const dataSettingsPanel =
  document.getElementById(
    "dataSettingsPanel"
  );


const bgmSettingsPanel =
  document.getElementById(
    "bgmSettingsPanel"
  );


const myBannerSettingsPanel =
  document.getElementById(
    "myBannerSettingsPanel"
  );


const blogTitleInput =
  document.getElementById(
    "blogTitleInput"
  );


const blogTitleSaveButton =
  document.getElementById(
    "blogTitleSaveButton"
  );


const blogTitleSaveMessage =
  document.getElementById(
    "blogTitleSaveMessage"
  );


const cursorUrlInput =
  document.getElementById(
    "cursorUrlInput"
  );


const cursorSaveButton =
  document.getElementById(
    "cursorSaveButton"
  );


const cursorSaveMessage =
  document.getElementById(
    "cursorSaveMessage"
  );


const cursorFileInput =
  document.getElementById(
    "cursorFileInput"
  );


const cursorUploadMessage =
  document.getElementById(
    "cursorUploadMessage"
  );


const categoryList =
  document.getElementById(
    "categoryList"
  );


const addCategoryButton =
  document.getElementById(
    "addCategoryButton"
  );


const categorySaveButton =
  document.getElementById(
    "categorySaveButton"
  );


const categorySaveMessage =
  document.getElementById(
    "categorySaveMessage"
  );


let categories =
  [];


let deletedCategoryIds =
  [];

/* =========================================================
   SETTINGS 내부 탭
========================================================== */

function showSettingsSection(
  section
) {

  categorySettingsPanel.hidden =
    section !== "category";


  homeSettingsPanel.hidden =
    section !== "home";


  dataSettingsPanel.hidden =
    section !== "data";


  categoryTabButton.classList.toggle(
    "active",
    section === "category"
  );


  homeTabButton.classList.toggle(
    "active",
    section === "home"
  );


  dataTabButton.classList.toggle(
    "active",
    section === "data"
  );

}


categoryTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "category"
    );

  }
);


homeTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "home"
    );

  }
);


dataTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "data"
    );

  }
);

/* =========================================================
   BGM 불러오기
========================================================== */

async function loadBgm(
  user
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "site_settings"
      )
      .select(
        "value"
      )
      .eq(
        "key",
        "bgm_url"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      "load bgm error:",
      error
    );


    bgmSaveMessage.textContent =
      "BGM을 불러오지 못했습니다.";


    return;

  }


  bgmUrlInput.value =
    data?.value || "";

}


/* =========================================================
   블로그 제목 불러오기
========================================================== */

async function loadBlogTitle(
  user
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "site_settings"
      )
      .select(
        "value"
      )
      .eq(
        "key",
        "blog_title"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      "load blog title error:",
      error
    );


    blogTitleSaveMessage.textContent =
      "블로그 제목을 불러오지 못했습니다.";


    return;

  }


  blogTitleInput.value =
    data?.value || "";

}


/* =========================================================
   마우스 포인터 불러오기
========================================================== */

async function loadCursorSetting(
  user
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "site_settings"
      )
      .select(
        "value"
      )
      .eq(
        "key",
        "cursor_url"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      "load cursor error:",
      error
    );


    cursorSaveMessage.textContent =
      "마우스 포인터 설정을 불러오지 못했습니다.";


    return;

  }


  cursorUrlInput.value =
    data?.value || "";

}

async function loadCategories(
  user
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "categories"
      )
      .select(
        "id, name, slug, sort_order, type"
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "sort_order",
        {
          ascending: true
        }
      );


  if (error) {

    console.error(
      "load categories error:",
      error
    );


    categorySaveMessage.textContent =
      "카테고리를 불러오지 못했습니다.";


    return;

  }


  categories =
    data;


  deletedCategoryIds =
    [];


  renderCategories();

}


function renderCategories() {

  categoryList.innerHTML =
    "";


  categories.forEach(
    (
      category,
      index
    ) => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "category-item";


      const input =
        document.createElement(
          "input"
        );


      input.type =
        "text";


      input.className =
        "category-name-input";


      input.value =
        category.name;


      input.addEventListener(
        "input",
        () => {

          category.name =
            input.value;

        }
      );


      const typeSelect =
        document.createElement(
          "select"
        );


      typeSelect.className =
        "category-type-select imory-field imory-field--sm";


      [
        {
          value: "post",
          label: "post"
        },
        {
          value: "banner",
          label: "banner"
        }
      ].forEach(
        option => {

          const optionElement =
            document.createElement(
              "option"
            );


          optionElement.value =
            option.value;


          optionElement.textContent =
            option.label;


          typeSelect.appendChild(
            optionElement
          );

        }
      );


      typeSelect.value =
        category.type ||
        "post";


      typeSelect.addEventListener(
        "change",
        () => {

          category.type =
            typeSelect.value;

        }
      );


      const actions =
        document.createElement(
          "div"
        );


      actions.className =
        "category-actions";


      const upButton =
        document.createElement(
          "button"
        );


      upButton.type =
        "button";


      upButton.className =
        "category-action imory-button imory-button--ghost imory-button--sm";


      upButton.textContent =
        "↑";


      upButton.disabled =
        index === 0;


      upButton.addEventListener(
        "click",
        () => {

          moveCategory(
            index,
            -1
          );

        }
      );


      const downButton =
        document.createElement(
          "button"
        );


      downButton.type =
        "button";


      downButton.className =
        "category-action imory-button imory-button--ghost imory-button--sm";


      downButton.textContent =
        "↓";


      downButton.disabled =
        index ===
        categories.length - 1;


      downButton.addEventListener(
        "click",
        () => {

          moveCategory(
            index,
            1
          );

        }
      );


      const deleteButton =
        document.createElement(
          "button"
        );


      deleteButton.type =
        "button";


      deleteButton.className =
        "category-action delete imory-button imory-button--ghost imory-button--sm";


      deleteButton.textContent =
        "×";


      deleteButton.addEventListener(
        "click",
        () => {

          removeCategory(
            index
          );

        }
      );


      actions.append(
        upButton,
        downButton,
        deleteButton
      );


      item.append(
        input,
        typeSelect,
        actions
      );


      categoryList.appendChild(
        item
      );

    }
  );

}


function moveCategory(
  index,
  direction
) {

  const newIndex =
    index + direction;


  if (
    newIndex < 0 ||
    newIndex >= categories.length
  ) {
    return;
  }


  const temp =
    categories[index];


  categories[index] =
    categories[newIndex];


  categories[newIndex] =
    temp;


  renderCategories();

}


function removeCategory(
  index
) {

  const category =
    categories[index];


  if (category.id) {

    deletedCategoryIds.push(
      category.id
    );

  }


  categories.splice(
    index,
    1
  );


  renderCategories();

}


function addCategory() {

  categories.push({

    id:
      null,

    name:
      "NEW CATEGORY",

    slug:
      `category-${Date.now()}`,

    sort_order:
      categories.length + 1,

    type:
      "post"

  });


  renderCategories();

}


addCategoryButton.addEventListener(
  "click",
  addCategory
);

