/* =========================================================
   ADMIN SETTINGS - REFS / LOAD

   admin-settings.js가 너무 커져서(1190줄+) 쪼갠 것 중
   첫 번째 파일. admin-settings-save.js가 여기 있는 DOM
   참조를 공유해서 쓰므로 반드시 이 파일이 먼저
   로드돼야 함(admin/index.html 순서 참고).

   내용: DOM 요소 참조, 설정 탭 전환(PROFILE/HOME/CATEGORY/
   BANNER/DATA), 닉네임/BGM/블로그 제목/카테고리 목록 불러오기
   및 렌더링, 카테고리 순서변경/삭제/추가.
   아바타는 admin-settings-avatar.js, 파비콘/커서는
   admin-favicon.js·admin-cursor.js(공용 구현
   admin-image-setting.js), HOME>ETC 보호 설정은
   admin-etc-settings.js로 각각 분리되어 있다.
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

const profileTabButton =
  document.getElementById(
    "profileTabButton"
  );


const categoryTabButton =
  document.getElementById(
    "categoryTabButton"
  );


const homeTabButton =
  document.getElementById(
    "homeTabButton"
  );


const bannerTabButton =
  document.getElementById(
    "bannerTabButton"
  );


const dataTabButton =
  document.getElementById(
    "dataTabButton"
  );


const profileSettingsPanel =
  document.getElementById(
    "profileSettingsPanel"
  );


const categorySettingsPanel =
  document.getElementById(
    "categorySettingsPanel"
  );


const homeSettingsPanel =
  document.getElementById(
    "homeSettingsPanel"
  );


const bannerSettingsPanel =
  document.getElementById(
    "bannerSettingsPanel"
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


const nicknameInput =
  document.getElementById(
    "nicknameInput"
  );


const nicknameSaveButton =
  document.getElementById(
    "nicknameSaveButton"
  );


const nicknameSaveMessage =
  document.getElementById(
    "nicknameSaveMessage"
  );


/* 마우스 포인터(CURSOR)와 파비콘의 DOM 참조는 각자의 파일이
   직접 잡는다 — admin/settings/admin-cursor.js ·
   admin-favicon.js(공용 구현은 admin-image-setting.js). */


const withdrawAccountButton =
  document.getElementById(
    "withdrawAccountButton"
  );


const withdrawAccountMessage =
  document.getElementById(
    "withdrawAccountMessage"
  );


const withdrawAccountDialog =
  document.getElementById(
    "withdrawAccountDialog"
  );


const withdrawAccountConfirmInput =
  document.getElementById(
    "withdrawAccountConfirmInput"
  );


const withdrawAccountCancelButton =
  document.getElementById(
    "withdrawAccountCancelButton"
  );


const withdrawAccountConfirmButton =
  document.getElementById(
    "withdrawAccountConfirmButton"
  );


const withdrawAccountDialogMessage =
  document.getElementById(
    "withdrawAccountDialogMessage"
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

   ★ 지금 보고 있는 탭을 기억한다
   onAuthStateChange는 토큰 갱신이나 **탭 복귀**마다 다시 불리고,
   그때 restoreAdminView()가 SETTINGS 화면을 다시 연다
   (admin/admin-session.js · admin/admin.js). 예전에는 그 자리에서
   무조건 "profile"을 열어서, 다른 앱에 갔다 돌아오면 보고 있던
   탭이 첫 탭으로 튀었다. 큰 화면(currentAdminView)을 sessionStorage에
   기억하는 것과 같은 방식으로 안쪽 탭도 기억한다.
========================================================== */

const SETTINGS_SECTIONS =
  ["profile", "home", "category", "banner", "data"];


function currentSettingsSection() {

  const saved =
    sessionStorage.getItem(
      "admin-settings-section"
    );


  return SETTINGS_SECTIONS.includes(saved)
    ? saved
    : "profile";

}


function showSettingsSection(
  section
) {

  if (SETTINGS_SECTIONS.includes(section)) {

    sessionStorage.setItem(
      "admin-settings-section",
      section
    );

  }


  profileSettingsPanel.hidden =
    section !== "profile";


  categorySettingsPanel.hidden =
    section !== "category";


  homeSettingsPanel.hidden =
    section !== "home";


  bannerSettingsPanel.hidden =
    section !== "banner";


  dataSettingsPanel.hidden =
    section !== "data";


  profileTabButton.classList.toggle(
    "active",
    section === "profile"
  );


  categoryTabButton.classList.toggle(
    "active",
    section === "category"
  );


  homeTabButton.classList.toggle(
    "active",
    section === "home"
  );


  bannerTabButton.classList.toggle(
    "active",
    section === "banner"
  );


  dataTabButton.classList.toggle(
    "active",
    section === "data"
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


homeTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "home"
    );

  }
);


bannerTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "banner"
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
   닉네임 불러오기

   profiles.nickname은 public select 정책으로 이미 읽을 수
   있다([[20260830140000_rls_profiles_app_config_home_customize.sql]]).
   저장은 update_own_nickname() RPC로만 가능(admin-settings-save.js).
========================================================== */

async function loadNickname(
  user
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "profiles"
      )
      .select(
        "nickname"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      "load nickname error:",
      error
    );


    nicknameSaveMessage.textContent =
      "닉네임을 불러오지 못했습니다.";


    return;

  }


  nicknameInput.value =
    data?.nickname || "";

}


async function loadCategories(
  user
) {

  /*
    GALLERY-1: 표시 설정 컬럼을 함께 읽는다. migration이 아직
    적용되지 않은 배포에서는 42703이 나므로 기본 컬럼만으로 한 번 더
    읽고, 그 사실을 표시 설정 UI에 알린다 — 없는 컬럼을 UPDATE에
    넣으면 카테고리 저장 전체가 실패하기 때문이다
    (admin/settings/admin-settings-category-display.js).
  */

  const BASE_COLUMNS =
    "id, name, slug, sort_order, type";

  /*
    GALLERY-1 후속: secret_cover_url(공개 https 주소)은 사라졌다 —
    파일은 비공개 버킷에 있고 미리보기도 /api/post-cover?category=<id>로
    받는다(core/lib/post-cover-url.js).
  */

  const GALLERY_COLUMNS =
    "list_style, page_size, secret_cover_mode, secret_cover_path";


  const runCategoryQuery =
    (columns) =>
      supabaseClient
        .from(
          "categories"
        )
        .select(
          columns
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


  let {
    data,
    error
  } =
    await runCategoryQuery(
      `${BASE_COLUMNS}, ${GALLERY_COLUMNS}`
    );


  if (
    error &&
    error.code === "42703"
  ) {

    setCategoryDisplayColumnsAvailable(
      false
    );


    ({
      data,
      error
    } =
      await runCategoryQuery(
        BASE_COLUMNS
      ));

  }

  else if (!error) {

    setCategoryDisplayColumnsAvailable(
      true
    );

  }


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

  categories.forEach(category => {
    if (category.type === "post" && category.list_style === "gallery") category.type = "gallery";
  });


  deletedCategoryIds =
    [];


  /*
    HIGHLIGHT-1: 메모 화면의 폴더 설정(순서·커버·비율·구도)을 함께
    읽는다. 별도 테이블이라 카테고리 조회에 컬럼을 더하지 않는다 —
    migration 이전 배포에서는 그 안에서 판정해 줄을 아예 그리지
    않는다(admin/settings/admin-settings-memo-folders.js).
  */

  if (typeof loadMemoFolderSettingsForAdmin === "function") {

    await loadMemoFolderSettingsForAdmin(
      user.id
    );

  }


  renderCategories();

}


function renderCategories() {

  /*
    HIGHLIGHT-1: 메모 폴더 차례를 지금 카테고리 목록에 맞춘다 —
    카테고리를 더하거나 지운 직후에도 ↑↓ 가 올바른 자리를 가리킨다.
  */

  if (typeof syncMemoFolderOrder === "function") {

    syncMemoFolderOrder(
      categories
    );

  }


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
          value: "gallery",
          label: "gallery"
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

          category.list_style = category.type === "gallery" ? "gallery" : "list";


          /* GALLERY-1: post ↔ banner를 바꾸면 표시 설정 줄이
             나타나거나 사라진다 — 전체를 다시 그린다. */

          renderCategories();

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


      /*
        GALLERY-1: post형 카테고리에만 표시 설정 줄을 붙인다
        (admin/settings/admin-settings-category-display.js).
        migration 이전 배포에서는 null이 돌아와 아무것도 붙지 않고,
        지금까지와 완전히 같은 화면이 된다.
      */

      const displayRow =
        typeof buildCategoryDisplayRow === "function"
          ? buildCategoryDisplayRow(
              category,
              renderCategories
            )
          : null;


      if (displayRow) {

        item.appendChild(
          displayRow
        );

      }


      /*
        HIGHLIGHT-1: 메모 화면의 폴더 설정 줄. 저장된 카테고리(글이
        들어갈 수 있는 것)에만 붙는다.
      */

      const memoFolderRow =
        typeof buildMemoFolderRow === "function"
          ? buildMemoFolderRow(
              category,
              renderCategories
            )
          : null;


      if (memoFolderRow) {

        item.appendChild(
          memoFolderRow
        );

      }


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
