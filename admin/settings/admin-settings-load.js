/* =========================================================
   ADMIN SETTINGS - REFS / LOAD

   admin-settings.js가 너무 커져서(1190줄+) 쪼갠 것 중
   첫 번째 파일. admin-settings-save.js가 여기 있는 DOM
   참조를 공유해서 쓰므로 반드시 이 파일이 먼저
   로드돼야 함(admin/index.html 순서 참고).

   내용: DOM 요소 참조, 설정 탭 전환, 소개글/BGM/카테고리
   목록 불러오기 및 렌더링, 카테고리 순서변경/삭제/추가.
========================================================== */


/* =========================================================
   SETTINGS 요소
========================================================== */

const aboutInput =
  document.getElementById(
    "aboutInput"
  );


const noticeInput =
  document.getElementById(
    "noticeInput"
  );


const ngInput =
  document.getElementById(
    "ngInput"
  );


const saveButton =
  document.getElementById(
    "saveButton"
  );


const saveMessage =
  document.getElementById(
    "saveMessage"
  );


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

  const profileTabButton =
  document.getElementById(
    "profileTabButton"
  );


const categoryTabButton =
  document.getElementById(
    "categoryTabButton"
  );


const bgmTabButton =
  document.getElementById(
    "bgmTabButton"
  );


const profileSettingsPanel =
  document.getElementById(
    "profileSettingsPanel"
  );


const categorySettingsPanel =
  document.getElementById(
    "categorySettingsPanel"
  );


const bgmSettingsPanel =
  document.getElementById(
    "bgmSettingsPanel"
  );


const myBannerTabButton =
  document.getElementById(
    "myBannerTabButton"
  );

const myBannerSettingsPanel =
  document.getElementById(
    "myBannerSettingsPanel"
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
   PROFILE 불러오기
========================================================== */

/* =========================================================
   SETTINGS 내부 탭
========================================================== */

function showSettingsSection(
  section
) {

  profileSettingsPanel.hidden =
    section !== "profile";


  categorySettingsPanel.hidden =
    section !== "category";


  bgmSettingsPanel.hidden =
    section !== "bgm";


  myBannerSettingsPanel.hidden =
    section !== "mybanner";


  profileTabButton.classList.toggle(
    "active",
    section === "profile"
  );


  categoryTabButton.classList.toggle(
    "active",
    section === "category"
  );


  bgmTabButton.classList.toggle(
    "active",
    section === "bgm"
  );


  myBannerTabButton.classList.toggle(
    "active",
    section === "mybanner"
  );

}


profileTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "profile"
    );

  }
);


categoryTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "category"
    );

  }
);


bgmTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "bgm"
    );

  }
);


myBannerTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "mybanner"
    );

  }
);

async function loadContent(
  user
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "site_content"
      )
      .select(
        "section, content"
      )
      .eq(
        "user_id",
        user.id
      );


  if (error) {

    console.error(
      "load content error:",
      error
    );


    saveMessage.textContent =
      "내용을 불러오지 못했습니다.";


    return;

  }


  const contentMap =
    {};


  data.forEach(
    row => {

      contentMap[
        row.section
      ] =
        row.content || "";

    }
  );


  aboutInput.value =
    contentMap.about || "";


  noticeInput.value =
    contentMap.notice || "";


  ngInput.value =
    contentMap.ng || "";

}



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
        "category-type-select";


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
        "category-action";


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
        "category-action";


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
        "category-action delete";


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

