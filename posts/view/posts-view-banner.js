/* =========================================================
   POSTS VIEW - BANNER CATEGORY

   posts-view.js 계열 분할본. DOM 참조/상태(bannerGrid,
   bannerEditor*, currentBanners, bannerEditModeOn,
   editingBannerId, currentPostCategoryType 등)는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야 함).

   글이 아니라 지인/사이트 배너 모음을 보여주는 카테고리
   타입("banner"). openCategoryPage(posts-view-list.js)가
   category.type === "banner"일 때 이 파일의
   renderBannerCategory를 호출한다.

   내용: 카테고리 진입/그리드 렌더/카드 생성/edit 모드 토글/
   순서 바꾸기. add/edit 폼 자체는 posts-view-banner-form.js
   에 있음(이 파일보다 나중에 로드돼도 상관없음 — 서로
   함수 이름으로만 참조).
========================================================== */

/* =========================================================
   SKIN 배너 목록 위에서의 화면 전환 (PHASE 1E)

   bannerSkinActive 상태와 setBannerSkinActive()는
   posts/editor/posts-state.js에 있다(그 파일 주석 참고 — 배너
   렌더러를 로드하지 않는 구성에서도 openCategoryPage()가 안전하게
   부를 수 있어야 하므로). 여기에는 그 상태를 보고 실제로 화면을
   바꾸는 동작만 둔다.

   bannerSkinActive가 true일 때 배너 목록은 #postList 안의 Skin이
   그린다. legacy #bannerGrid는 숨어 있고, 소유자가 EDIT 토글을 눌러
   관리 화면으로 들어갈 때만 드러난다 — 즉 "편집을 하려면 목록이 계속
   legacy로 남아 있어야 한다"가 아니라, 기본 화면은 방문자와 똑같은
   Skin이고 관리만 명시적으로 열고 닫는다.
========================================================== */

/*
  Skin 배너 목록을 다시 그린다. 별도의 렌더 경로를 새로 만들지 않고
  openCategoryPage()를 그대로 다시 태운다 — Skin 배너 렌더 경로가
  이 저장소에 한 벌만 존재하게 유지하기 위함이다(관리 화면에서
  나올 때/폼을 닫을 때 모두 이 함수 하나를 쓴다). URL은 이미 이
  카테고리를 가리키고 있으므로 history를 건드리지 않는다.
*/

async function restoreBannerSkinList() {

  if (
    !bannerSkinActive ||
    currentPostCategoryId === null ||
    currentPostCategoryId === undefined
  ) {

    return false;

  }


  await openCategoryPage(
    currentPostCategoryId,
    {
      updateUrl:
        false
    }
  );


  return true;

}


/* =========================================================
   카테고리 진입 (legacy — templates.banner가 없거나 Skin 렌더가
   실패했을 때만 도달한다)
========================================================== */

async function renderBannerCategory(
  categoryId
) {

  if (!bannerGrid) {
    return;
  }


  bannerEditModeOn =
    false;


  editingBannerId =
    null;


  if (bannerEditor) {

    bannerEditor.hidden =
      true;

  }


  bannerGrid.hidden =
    false;


  bannerGrid.innerHTML =
    `
      <div class="post-empty">
        loading...
      </div>
    `;


  const owner =
    await getSiteOwner();


  if (
    owner.scoped &&
    !owner.ownerId
  ) {

    bannerGrid.innerHTML =
      `
        <div class="post-empty">
          no banners yet
        </div>
      `;


    return;

  }


  let bannersQuery =
    supabaseClient
      .from(
        "banners"
      )
      .select(
        "id, name, url, image_url, image_path, sort_order"
      )
      .eq(
        "category_id",
        categoryId
      );


  if (owner.scoped) {

    bannersQuery =
      bannersQuery.eq(
        "user_id",
        owner.ownerId
      );

  }


  const {
    data,
    error
  } =
    await bannersQuery.order(
      "sort_order",
      {
        ascending:
          true
      }
    );


  if (error) {

    console.error(
      error
    );


    bannerGrid.innerHTML =
      `
        <div class="post-empty">
          failed to load
        </div>
      `;


    return;

  }


  currentBanners =
    data ||
    [];


  /*
    PHASE 1E: "로그인했으면 주인"이 아니라 실제 이 사이트의
    소유자인지로 판단한다(isSiteOwnerSignedIn,
    posts/editor/posts-state.js) — 다른 계정으로 로그인한 방문자에게
    배너 편집 토글이 보이면 안 된다. 실제 쓰기 권한은 별개로 각
    쿼리의 user_id 필터와 RLS가 계속 강제한다.
  */

  const isOwner =
    await isSiteOwnerSignedIn();


  if (
    bannerEditToggleButton
  ) {

    bannerEditToggleButton.hidden =
      !isOwner;


    bannerEditToggleButton.setAttribute(
      "aria-pressed",
      "false"
    );

  }


  renderBannerGrid();

}



/* =========================================================
   그리드 렌더
========================================================== */

function renderBannerGrid() {

  if (!bannerGrid) {
    return;
  }


  /*
    Skin이 목록을 그리고 있고 관리 모드도 아니면 legacy 그리드는
    화면에 없다 — 저장/삭제 후 호출되는 경로(refreshBannerList,
    deleteBanner)가 숨은 그리드를 그리려 애쓸 필요가 없다.
    관리 모드일 때는 이 그리드가 곧 관리 화면이므로 정상 렌더한다.
  */

  if (
    bannerSkinActive &&
    !bannerEditModeOn
  ) {

    return;

  }


  bannerGrid.innerHTML =
    "";


  if (
    currentBanners.length === 0 &&
    !bannerEditModeOn
  ) {

    bannerGrid.innerHTML =
      `
        <div class="post-empty">
          no banners yet
        </div>
      `;


    return;

  }


  currentBanners.forEach(
    (
      banner,
      index
    ) => {

      bannerGrid.appendChild(
        createBannerCard(
          banner,
          index
        )
      );

    }
  );

}


function createBannerCard(
  banner,
  index
) {

  const card =
    document.createElement(
      bannerEditModeOn
        ? "div"
        : "a"
    );


  card.className =
    "banner-card";


  if (!bannerEditModeOn) {

    card.href =
      banner.url;


    card.target =
      "_blank";


    card.rel =
      "noopener noreferrer";

  }

  else {

    card.addEventListener(
      "click",
      () => {

        openBannerForm(
          banner
        );

      }
    );

  }


  /*
    ★ 배너 이미지는 실제 <img>로 넣어야 브라우저가 원본
    비율을 그대로 살려서 보여준다(가로폭만 카드에 맞추고
    세로는 auto). 예전엔 배경(div)+aspect-ratio 고정으로
    항상 3:1로 잘라서 보여줬는데, 실제 배너 이미지 비율과
    안 맞으면 이상하게 잘려 보였음.
  */

  const image =
    document.createElement(
      "img"
    );


  image.className =
    "banner-card-image";


  image.src =
    banner.image_url ||
    "";


  image.alt =
    banner.name ||
    "";


  image.loading =
    "lazy";


  card.appendChild(
    image
  );


  if (
    banner.name &&
    banner.name.trim()
  ) {

    const name =
      document.createElement(
        "div"
      );


    name.className =
      "banner-card-name";


    name.textContent =
      banner.name;


    card.appendChild(
      name
    );

  }


  if (
    bannerEditModeOn
  ) {

    card.appendChild(
      createBannerCardControls(
        banner,
        index
      )
    );

  }


  return card;

}


function createBannerCardControls(
  banner,
  index
) {

  const controls =
    document.createElement(
      "div"
    );


  controls.className =
    "banner-card-controls";


  const stopAndRun =
    handler =>
      event => {

        event.preventDefault();

        event.stopPropagation();


        handler();

      };


  const upButton =
    document.createElement(
      "button"
    );

  upButton.type =
    "button";

  upButton.className =
    "banner-card-control";

  upButton.textContent =
    "↑";

  upButton.disabled =
    index === 0;

  upButton.addEventListener(
    "click",
    stopAndRun(
      () =>
        moveBanner(
          index,
          -1
        )
    )
  );


  const downButton =
    document.createElement(
      "button"
    );

  downButton.type =
    "button";

  downButton.className =
    "banner-card-control";

  downButton.textContent =
    "↓";

  downButton.disabled =
    index ===
    currentBanners.length - 1;

  downButton.addEventListener(
    "click",
    stopAndRun(
      () =>
        moveBanner(
          index,
          1
        )
    )
  );


  const deleteButton =
    document.createElement(
      "button"
    );

  deleteButton.type =
    "button";

  deleteButton.className =
    "banner-card-control";

  deleteButton.textContent =
    "×";

  deleteButton.addEventListener(
    "click",
    stopAndRun(
      () =>
        deleteBanner(
          banner.id
        )
    )
  );


  controls.append(
    upButton,
    downButton,
    deleteButton
  );


  return controls;

}



/* =========================================================
   EDIT 모드 토글
========================================================== */

async function toggleBannerEditMode() {

  bannerEditModeOn =
    !bannerEditModeOn;


  bannerEditToggleButton
    ?.setAttribute(
      "aria-pressed",
      String(
        bannerEditModeOn
      )
    );


  if (!bannerSkinActive) {

    renderBannerGrid();


    return;

  }


  /*
    Skin 목록 위에서의 관리 (PHASE 1E)

    켤 때: Skin 목록을 잠시 접고 legacy 관리 그리드(순서 ↑↓ /
    삭제 × / 카드 클릭 → 수정 폼)를 그 자리에 연다. 목록을 "되돌려
    두는" 게 아니라 사용자가 명시적으로 열고 닫는 관리 화면이다.
    currentBanners는 Skin 경로에서 채워지지 않으므로 여기서
    refreshBannerList()로 실제 데이터를 가져온다.

    끌 때: 곧바로 Skin 목록으로 돌아간다(방금 바꾼 순서/삭제가
    그대로 반영된 채로).
  */

  if (bannerEditModeOn) {

    await enterBannerManageScreen();


    return;

  }


  await restoreBannerSkinList();

}


/*
  Skin 목록 -> legacy 관리 그리드. Skin이 쓰던 mount contract
  클래스(post-container--skin-active / post-area--skin-active,
  posts/posts-base.css)를 걷어내야 legacy 그리드가 기존 여백/헤더
  안에서 정상적으로 보인다.
*/

function hideBannerSkinListForManagement() {

  if (postList) {

    postList.hidden =
      true;

  }


  if (postContainer) {

    postContainer.classList.remove(
      "post-container--skin-active"
    );


    /*
      관리 화면/폼은 legacy 레이아웃 안에서 열린다 — 떠 있는
      소유자 도구(+ / edit)도 함께 걷어내고, legacy post-header가
      원래 자리에서 다시 보이게 둔다(거기에 같은 두 버튼이 있다).
    */

    postContainer.classList.remove(
      "post-container--owner-tools"
    );

  }


  /*
    스킨의 줄에 맞춰 잰 좌표도 함께 거둔다
    (posts/view/posts-view-owner-tools.js).
  */

  if (
    typeof restorePlatformOwnerTools ===
    "function"
  ) {

    restorePlatformOwnerTools();

  }


  if (postArea) {

    postArea.classList.remove(
      "post-area--skin-active"
    );

  }

}


async function enterBannerManageScreen() {

  hideBannerSkinListForManagement();


  if (bannerEditor) {

    bannerEditor.hidden =
      true;

  }


  if (bannerGrid) {

    bannerGrid.hidden =
      false;

  }


  await refreshBannerList();

}



/* =========================================================
   순서 바꾸기

   swap 후 화면에 보이는 전체 순서를 그대로 sort_order로
   다시 써서 저장(인덱스 기반이라 꼬일 일이 없음).
========================================================== */

async function moveBanner(
  index,
  direction
) {

  const newIndex =
    index +
    direction;


  if (
    newIndex < 0 ||
    newIndex >=
      currentBanners.length
  ) {
    return;
  }


  const temp =
    currentBanners[index];


  currentBanners[index] =
    currentBanners[newIndex];


  currentBanners[newIndex] =
    temp;


  renderBannerGrid();


  const user =
    await getSignedInUser();


  if (!user) {
    return;
  }


  await Promise.all(
    currentBanners.map(
      (
        banner,
        sortIndex
      ) =>
        supabaseClient
          .from(
            "banners"
          )
          .update({
            sort_order:
              sortIndex
          })
          .eq(
            "id",
            banner.id
          )
          .eq(
            "user_id",
            user.id
          )
    )
  );

}



