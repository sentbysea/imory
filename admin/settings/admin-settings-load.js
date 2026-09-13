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


/* 예전 이름은 bannerTabButton 이었다 — 안쪽에 CARD 가 들어오면서
   SHARE 로 바뀌었다(IMORY_SHARE_CARD_DESIGN.md §2). */

const shareTabButton =
  document.getElementById(
    "shareTabButton"
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


const shareSettingsPanel =
  document.getElementById(
    "shareSettingsPanel"
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
  ["profile", "home", "category", "share", "data"];


/*
  예전에는 "banner"였다. sessionStorage에 그 값을 들고 있는 탭이
  돌아왔을 때 첫 탭으로 튀지 않도록 같은 자리로 옮겨 읽는다
  (기억해 둔 탭을 유지한다는 이 함수의 목적 그대로).
*/

const SETTINGS_SECTION_ALIASES =
  {
    banner: "share"
  };


function currentSettingsSection() {

  const saved =
    sessionStorage.getItem(
      "admin-settings-section"
    );


  const resolved =
    SETTINGS_SECTION_ALIASES[saved] || saved;


  return SETTINGS_SECTIONS.includes(resolved)
    ? resolved
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


  shareSettingsPanel.hidden =
    section !== "share";


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


  shareTabButton.classList.toggle(
    "active",
    section === "share"
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


shareTabButton.addEventListener(
  "click",
  () => {

    showSettingsSection(
      "share"
    );

  }
);


/* =========================================================
   SHARE 안쪽 탭 — BANNER / CARD

   바깥 탭과 같은 규칙이다: 지금 보고 있는 것을 sessionStorage에
   기억해서, 다른 앱에 갔다 돌아왔을 때(restoreAdminView) 보고
   있던 자리가 유지된다.
========================================================== */

const SHARE_SECTIONS =
  ["banner", "card"];


const shareBannerTabButton =
  document.getElementById(
    "shareBannerTabButton"
  );


const shareCardTabButton =
  document.getElementById(
    "shareCardTabButton"
  );


const shareBannerInnerPanel =
  document.getElementById(
    "shareBannerInnerPanel"
  );


const shareCardInnerPanel =
  document.getElementById(
    "shareCardInnerPanel"
  );


function currentShareSection() {

  const saved =
    sessionStorage.getItem(
      "admin-share-section"
    );


  return SHARE_SECTIONS.includes(saved)
    ? saved
    : "banner";

}


function showShareSection(
  section
) {

  const next =
    SHARE_SECTIONS.includes(section)
      ? section
      : "banner";


  sessionStorage.setItem(
    "admin-share-section",
    next
  );


  if (shareBannerInnerPanel) {

    shareBannerInnerPanel.hidden =
      next !== "banner";

  }


  if (shareCardInnerPanel) {

    shareCardInnerPanel.hidden =
      next !== "card";

  }


  if (shareBannerTabButton) {

    shareBannerTabButton.classList.toggle(
      "active",
      next === "banner"
    );

  }


  if (shareCardTabButton) {

    shareCardTabButton.classList.toggle(
      "active",
      next === "card"
    );

  }


  /*
    카드 미리보기는 숨어 있는 동안 크기를 잴 수 없다(폭이 0이다).
    CARD를 열 때 다시 맞춘다(admin/settings/admin-share-card.js).
  */

  if (
    next === "card" &&
    typeof refreshShareCardPreviewScale === "function"
  ) {

    refreshShareCardPreviewScale();

  }

}


shareBannerTabButton
  ?.addEventListener(
    "click",
    () => {

      showShareSection(
        "banner"
      );

    }
  );


shareCardTabButton
  ?.addEventListener(
    "click",
    () => {

      showShareSection(
        "card"
      );

    }
  );


showShareSection(
  currentShareSection()
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

  /*
    HIGHLIGHT-2: pagination_style / pagination_window_size 두 컬럼이
    같은 묶음에 들어간다 — 아래 42703 폴백이 "표시 설정 컬럼이 아직
    없는 배포"를 이미 처리하므로, 새 컬럼을 여기 더하는 것만으로
    migration 이전 배포에서도 지금까지와 똑같이 동작한다.
  */

  const GALLERY_COLUMNS =
    "list_style, page_size, secret_cover_mode, secret_cover_path, " +
    "pagination_style, pagination_window_size, paginate_posts";


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


  /*
    HIGHLIGHT-2: 읽어 온 순간의 타입을 적어 둔다. 저장할 때 그 값과
    다르면 categories.update 가 아니라 change_own_category_type RPC 를
    부른다 — 글/폴더 이동과 타입 변경이 한 트랜잭션이어야 한다
    (admin/settings/admin-settings-category-type.js).
  */

  if (typeof markSavedCategoryTypes === "function") {

    markSavedCategoryTypes(categories);

  }


  deletedCategoryIds =
    [];


  /*
    HIGHLIGHT-1: 하이라이트 화면의 폴더 설정(순서·커버·비율·구도)을 함께
    읽는다. 별도 테이블이라 카테고리 조회에 컬럼을 더하지 않는다 —
    migration 이전 배포에서는 그 안에서 판정해 줄을 아예 그리지
    않는다(admin/settings/admin-settings-highlight-folders.js).
  */

  if (typeof loadHighlightFolderSettingsForAdmin === "function") {

    await loadHighlightFolderSettingsForAdmin(
      user.id
    );

  }


  renderCategories();

}


function renderCategories() {

  /*
    HIGHLIGHT-1: 하이라이트 폴더 차례를 지금 카테고리 목록에 맞춘다 —
    카테고리를 더하거나 지운 직후에도 아래 순서 목록이 올바른
    자리를 가리킨다.
  */

  if (typeof syncHighlightFolderOrder === "function") {

    syncHighlightFolderOrder(
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


      /* =====================================================
         HIGHLIGHT-2 — 타입 목록과 singleton 안내

         목록은 core/lib/category-types.js 하나에서 온다(DB 의
         check 제약과 같은 집합). 'memo' 는 여기 없다 — 그 이름은
         나중에 사용자가 직접 쓰는 짧은 글 기능을 위해 비워 둔다.

         이미 쓰고 있는 singleton 타입(banner / highlight)은 **감추지
         않고 disabled** 로 둔다. 감추면 "왜 없지?"가 되고, 눌리는
         채로 두면 저장할 때야 실패한다. 이유는 title 로 붙인다.

         프런트의 이 판정은 안내일 뿐이다 — 실제 거절은 DB 의
         categories_singleton_type_idx 가 한다
         (supabase/migrations/20260913160000_*.sql).
      ====================================================== */

      const singletonOwner =
        {};

      categories.forEach(
        (other) => {

          const otherType =
            normalizeCategoryType(other.type);


          if (
            isSingletonCategoryType(otherType) &&
            !singletonOwner[otherType]
          ) {

            singletonOwner[otherType] =
              other;

          }

        }
      );


      CATEGORY_TYPES.forEach(
        (value) => {

          const optionElement =
            document.createElement(
              "option"
            );


          optionElement.value =
            value;


          optionElement.textContent =
            `${value} · ${categoryTypeLabel(value)}`;


          const taken =
            isSingletonCategoryType(value) &&
            singletonOwner[value] &&
            singletonOwner[value] !== category;


          if (taken) {

            optionElement.disabled =
              true;


            optionElement.title =
              `이미 ${value.toUpperCase()} 카테고리가 있습니다`;

          }


          typeSelect.appendChild(
            optionElement
          );

        }
      );


      typeSelect.value =
        normalizeCategoryType(category.type);


      /*
        같은 안내를 드롭다운 옆에도 남긴다 — disabled option 의 title
        은 마우스를 올려야 보이고, 모바일에서는 아예 보이지 않는다.
      */

      const takenTypes =
        SINGLETON_CATEGORY_TYPES.filter(
          (value) =>
            singletonOwner[value] &&
            singletonOwner[value] !== category
        );


      typeSelect.setAttribute(
        "aria-label",
        "카테고리 종류"
      );


      if (takenTypes.length) {

        typeSelect.title =
          takenTypes
            .map(
              (value) =>
                `이미 ${value.toUpperCase()} 카테고리가 있습니다`
            )
            .join(" · ");

      }


      typeSelect.addEventListener(
        "change",
        async () => {

          const next =
            normalizeCategoryType(typeSelect.value);


          /*
            판정 중에는 칸을 잠근다 — 개수를 세는 동안 다시 고르면
            두 판정이 엇갈린 채 적용될 수 있다.
          */

          typeSelect.disabled =
            true;


          /*
            HIGHLIGHT-2 요구사항 10 — singleton 으로 바꾸는데 글이나
            폴더가 남아 있으면 어디로 옮길지 먼저 고르게 한다. 고르지
            않으면 타입을 바꾸지 않는다(값을 되돌린다).

            실제 이동과 타입 변경은 한 트랜잭션 안에서 DB 가 한다
            (change_own_category_type RPC) — 저장할 때 호출된다.
          */

          if (typeof requestCategoryTypeChange === "function") {

            let decision;

            try {

              decision =
                await requestCategoryTypeChange(
                  category,
                  next
                );

            }

            catch (err) {

              console.error("[category-type] 판정 실패:", err);

              decision =
                {
                  ok: false,
                  message: "지금은 종류를 바꿀 수 없습니다. 잠시 뒤 다시 시도해 주세요."
                };

            }


            typeSelect.disabled =
              false;


            if (!decision.ok) {

              typeSelect.value =
                normalizeCategoryType(category.type);


              categorySaveMessage.textContent =
                decision.message || "종류를 바꾸지 못했습니다.";


              return;

            }


            categorySaveMessage.textContent =
              "";

          }

          else {

            typeSelect.disabled =
              false;

          }


          category.type =
            next;

          category.list_style = category.type === "gallery" ? "gallery" : "list";


          /* 타입이 바뀌면 고급 설정의 내용도 달라진다 — 전체를 다시 그린다. */

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
        HIGHLIGHT-2 §7 — 고급 설정은 더 이상 이 줄에 붙지 않는다.

        표시 설정(페이지 · 비밀글 커버)과 하이라이트 폴더 설정은 아래
        ADVANCED SETTINGS 영역으로 옮겼다
        (admin/settings/admin-settings-advanced.js). 카테고리가 몇 개만
        돼도 이 목록이 설정 줄로 가득 차서, 이름을 고치러 온 사람이
        무엇을 보고 있는지 알기 어려웠다.

        같은 category 객체를 두 영역이 함께 고치므로 저장 버튼은
        하나 그대로다.
      */

      categoryList.appendChild(
        item
      );

    }
  );


  /*
    HIGHLIGHT-1 후속: 하이라이트 폴더 차례 목록(꾹 눌러 끌기 + ↑↓).
    카테고리 목록과 다른 배열을 움직이므로 카테고리 줄 안이 아니라
    따로 그린다(admin/settings/admin-settings-highlight-folder-order.js).
    HIGHLIGHT-2 부터 그 목록이 놓이는 자리는 ADVANCED SETTINGS 의
    HIGHLIGHT 패널 안이다.
  */

  if (typeof renderHighlightFolderOrderList === "function") {

    renderHighlightFolderOrderList(
      categories,
      renderCategories
    );

  }


  /*
    HIGHLIGHT-2 §7: 고급 설정. 고른 카테고리 하나의, 그 타입에 필요한
    설정만 그린다(admin/settings/admin-settings-advanced.js).
  */

  if (typeof renderAdvancedCategorySettings === "function") {

    renderAdvancedCategorySettings(
      categories,
      renderCategories
    );

  }

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


  /*
    HIGHLIGHT-2: HIGHLIGHT 카테고리를 지워도 하이라이트 데이터는
    남는다 — post_highlights 는 posts 를 부모로 두고 있고, 이 행은
    표시·내비게이션 설정일 뿐이다. 그 사실을 확인창에 적는다:
    적지 않으면 "내 하이라이트가 전부 지워지는구나"로 읽힌다.
  */

  if (
    normalizeCategoryType(category.type) === "highlight" &&
    category.id &&
    !window.confirm(
      "HIGHLIGHT 카테고리를 목록에서 지웁니다.\n\n" +
      "하이라이트·발췌문·노트는 지워지지 않습니다. 지워지는 것은 이 화면을 메뉴에 보여 주고 꾸미는 설정뿐이고, 나중에 HIGHLIGHT 카테고리를 다시 만들면 기존 카드가 그대로 다시 보입니다.\n\n" +
      "계속할까요?"
    )
  ) {

    return;

  }


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
