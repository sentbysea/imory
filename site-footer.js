/* =========================================================
   SITE FOOTER (공용)

   홈 / 글 / 어드민, 어디서든 방문자 수 표시와 copyright 문구를
   여기 한 곳에서만 관리함.

   [data-site-today-count] / [data-site-copyright] 마커가 있는
   footer라면 페이지에 몇 개가 있든 전부 같은 내용으로 채움.

   이 스크립트보다 먼저 supabaseClient가 선언되어 있어야 함
   (홈/글은 home/home-content.js, 어드민은 admin.js).
========================================================== */

const SITE_COPYRIGHT_TEXT =
  "© 2026 sentbysea. all rights reserved.";



/* =========================================================
   COPYRIGHT
========================================================== */

function applySiteCopyright() {

  document
    .querySelectorAll(
      "[data-site-copyright]"
    )
    .forEach(
      el => {

        el.textContent =
          SITE_COPYRIGHT_TEXT;

      }
    );

}



/* =========================================================
   오늘 방문자
========================================================== */

function getSiteTodayKst() {

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Seoul",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    )
      .formatToParts(
        new Date()
      );

  const year =
    parts.find(
      part =>
        part.type === "year"
    ).value;

  const month =
    parts.find(
      part =>
        part.type === "month"
    ).value;

  const day =
    parts.find(
      part =>
        part.type === "day"
    ).value;

  return `${year}-${month}-${day}`;

}


async function countSiteDailyVisit() {

  const today =
    getSiteTodayKst();


  const lastCountedDate =
    localStorage.getItem(
      "last-counted-visit"
    );


  if (
    lastCountedDate === today
  ) {

    return;

  }


  const {
    data,
    error
  } =
    await supabaseClient.rpc(
      "increment_daily_visit_kst",
      {
        p_visit_date:
          today
      }
    );


  if (error) {

    console.error(
      "방문자 집계 실패:",
      error
    );

    return;

  }


  localStorage.setItem(
    "last-counted-visit",
    today
  );

}


/*
  가장 최근에 불러온 방문자 수.
  posts.html처럼 나중에(비동기로) 끼워지는 footer가 있어서,
  다시 서버에 물어보지 않고도 재적용할 수 있게 캐싱해둠.
*/

let siteTodayVisitCountCache =
  null;


function renderSiteTodayCount(
  count
) {

  document
    .querySelectorAll(
      "[data-site-today-count]"
    )
    .forEach(
      el => {

        el.innerHTML =
          `today ${count}
          <button
            class="admin-heart"
            type="button"
            aria-label="admin"
          >
            ♡
          </button>`;

      }
    );

}


/*
  posts.html처럼 나중에 DOM에 끼워지는 footer 마커를 위해
  외부(index.html의 posts 로더 등)에서 호출할 수 있는
  재적용 함수. 이미 불러온 값이 있으면 재요청하지 않음.
*/

function refreshSiteFooterMarkers() {

  applySiteCopyright();


  if (
    siteTodayVisitCountCache !==
    null
  ) {

    renderSiteTodayCount(
      siteTodayVisitCountCache
    );

  }

}


async function loadSiteTodayVisitCount() {

  const today =
    getSiteTodayKst();


  const {
    data,
    error
  } =
    await supabaseClient
      .from("daily_visits")
      .select("visit_count")
      .eq(
        "visit_date",
        today
      )
      .maybeSingle();


  if (error) {

    console.error(
      "오늘 방문자 수 불러오기 실패:",
      error
    );

    return;

  }


  const count =
    data
      ? data.visit_count
      : 0;


  siteTodayVisitCountCache =
    count;


  renderSiteTodayCount(
    count
  );

}


async function initializeSiteFooter() {

  applySiteCopyright();


  await countSiteDailyVisit();


  await loadSiteTodayVisitCount();

}


initializeSiteFooter();



/* =========================================================
   ADMIN HEART
   footer가 여러 개(홈/글)여도 클래스 기준이라 전부 동작함.
========================================================== */

document.addEventListener(
  "click",
  (event) => {

    const adminHeart =
      event.target.closest(
        ".admin-heart"
      );

    if (!adminHeart) {
      return;
    }

    adminHeart.classList.add(
      "is-entering"
    );

    const isOnAdminPage =
      window.location.pathname.includes(
        "/admin/"
      );

    const destination =
      isOnAdminPage
        ? "../"
        : "/admin/";


    /*
      어드민에서 나갈 땐 마지막으로 보던 화면을
      잊는다 — 사이트 홈에서 하트로 다시 들어올 땐
      항상 admin 초기 화면(홈 메뉴)부터 시작하도록.
      (어드민 안에서의 새로고침/탭 복귀는 마지막 화면
      유지가 의도된 동작이라 그대로 둠 — admin.js 참고.)
    */

    if (
      isOnAdminPage
    ) {

      sessionStorage.setItem(
        "admin-current-view",
        "home"
      );

    }


    window.setTimeout(
      () => {

        window.location.href =
          destination;

      },
      350
    );

  }
);
