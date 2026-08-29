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
   카테고리 진입
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


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "banners"
      )
      .select(
        "id, name, url, image_url, image_path, sort_order"
      )
      .eq(
        "category_id",
        categoryId
      )
      .order(
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


  const user =
    await getSignedInUser();


  const isOwner =
    Boolean(
      user
    );


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

function toggleBannerEditMode() {

  bannerEditModeOn =
    !bannerEditModeOn;


  bannerEditToggleButton
    ?.setAttribute(
      "aria-pressed",
      String(
        bannerEditModeOn
      )
    );


  renderBannerGrid();

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



