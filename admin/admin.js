/* =========================================================
   ADMIN - SUPABASE / DASHBOARD PANEL SWITCHING

   이 파일도 커져서(960줄+), 세션/로그인 확인 로직은
   admin-session.js로 옮겼음 — 그 파일은 이 파일보다
   나중에 로드되어야 함(admin/index.html 순서 참고).

   supabaseClient / SUPABASE_URL / SUPABASE_KEY는
   core/lib/supabase-client.js에서 전역으로 만들어짐
   (admin/index.html에서 이 파일보다 먼저 로드됨).
========================================================== */


/* =========================================================
   공통 요소
========================================================== */

const adminPage =
  document.querySelector(
    ".admin-page"
  );


const loginBox =
  document.getElementById(
    "loginBox"
  );


const adminDashboard =
  document.getElementById(
    "adminDashboard"
  );


const googleLoginButton =
  document.getElementById(
    "googleLoginButton"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


const loginMessage =
  document.getElementById(
    "loginMessage"
  );


const userEmail =
  document.getElementById(
    "userEmail"
  );



/* =========================================================
   화면 요소
========================================================== */

const adminHome =
  document.getElementById(
    "adminHome"
  );


const quotePanel =
  document.getElementById(
    "quotePanel"
  );


const settingsPanel =
  document.getElementById(
    "settingsPanel"
  );


const customizePanel =
  document.getElementById(
    "customizePanel"
  );


const inquiryPanel =
  document.getElementById(
    "inquiryPanel"
  );



/* =========================================================
   메뉴 버튼
========================================================== */

const openQuoteButton =
  document.getElementById(
    "openQuoteButton"
  );


const openSettingsButton =
  document.getElementById(
    "openSettingsButton"
  );


const openCustomizeButton =
  document.getElementById(
    "openCustomizeButton"
  );


const openInquiryButton =
  document.getElementById(
    "openInquiryButton"
  );


const quoteBackButton =
  document.getElementById(
    "quoteBackButton"
  );


const settingsBackButton =
  document.getElementById(
    "settingsBackButton"
  );


const customizeBackButton =
  document.getElementById(
    "customizeBackButton"
  );


const inquiryBackButton =
  document.getElementById(
    "inquiryBackButton"
  );



/* =========================================================
   현재 큰 화면 기억

   home
   quote
   settings
   customize
   inquiry
========================================================== */

let currentAdminView =
  sessionStorage.getItem(
    "admin-current-view"
  ) ||
  "home";



function saveCurrentAdminView(
  view
) {

  currentAdminView =
    view;


  sessionStorage.setItem(
    "admin-current-view",
    view
  );

}



/* =========================================================
   로그인 화면
========================================================== */

function showLogin() {

  adminPage.classList.remove(
    "quote-mode"
  );

  adminPage.classList.remove(
    "customize-mode"
  );


  loginBox.hidden =
    false;


  adminDashboard.hidden =
    true;


  userEmail.textContent =
    "";

}



/* =========================================================
   관리자 화면
========================================================== */

function showDashboard(
  user
) {

  loginBox.hidden =
    true;


  adminDashboard.hidden =
    false;


  userEmail.textContent =
    user.email || "";


  /*
    로그인 상태가 다시 확인됐다고 해서
    무조건 HOME으로 보내지 않는다.

    현재 보고 있던 큰 화면 유지.
  */

  restoreAdminView();

}



/* =========================================================
   ADMIN HOME
========================================================== */

function showAdminHome(
  saveState = true
) {

  if (
    saveState
  ) {

    saveCurrentAdminView(
      "home"
    );

  }


  adminPage.classList.remove(
    "quote-mode"
  );

  adminPage.classList.remove(
    "customize-mode"
  );


  adminHome.hidden =
    false;


  quotePanel.hidden =
    true;


  settingsPanel.hidden =
    true;


  customizePanel.hidden =
    true;


  inquiryPanel.hidden =
    true;

}



/* =========================================================
   QUOTE PRESET
========================================================== */

function showQuotePanel(
  saveState = true
) {

  if (
    saveState
  ) {

    saveCurrentAdminView(
      "quote"
    );

  }


  adminPage.classList.add(
    "quote-mode"
  );

  adminPage.classList.remove(
    "customize-mode"
  );


  adminHome.hidden =
    true;


  quotePanel.hidden =
    false;


  settingsPanel.hidden =
    true;


  customizePanel.hidden =
    true;


  inquiryPanel.hidden =
    true;


  /*
    저장된 PRESET만 최신 상태로 갱신.
  */

  if (
    typeof loadQuotePresets ===
      "function"
  ) {

    loadQuotePresets();

  }


  /*
    panel이 hidden이던 동안엔 stage 너비가 0이라 프리뷰
    축소 계산(applyQuotePreviewScale)이 제대로 안 됐을 수
    있어서, 실제로 보이는 시점에 다시 계산해준다.
  */

  if (
    typeof applyQuotePreviewScale ===
      "function"
  ) {

    requestAnimationFrame(
      applyQuotePreviewScale
    );

  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}



/* =========================================================
   SETTINGS
========================================================== */

function showSettingsPanel(
  saveState = true
) {

  if (
    saveState
  ) {

    saveCurrentAdminView(
      "settings"
    );

  }


  adminPage.classList.remove(
    "quote-mode"
  );

  adminPage.classList.remove(
    "customize-mode"
  );


  adminHome.hidden =
    true;


  quotePanel.hidden =
    true;


  settingsPanel.hidden =
    false;


  customizePanel.hidden =
    true;


  inquiryPanel.hidden =
    true;


  if (
    typeof showSettingsSection ===
      "function"
  ) {

    showSettingsSection(
      "category"
    );

  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}



/* =========================================================
   CUSTOMIZE
========================================================== */

function showCustomizePanel(
  saveState = true
) {

  if (
    saveState
  ) {

    saveCurrentAdminView(
      "customize"
    );

  }


  adminPage.classList.remove(
    "quote-mode"
  );

  adminPage.classList.add(
    "customize-mode"
  );


  adminHome.hidden =
    true;


  quotePanel.hidden =
    true;


  settingsPanel.hidden =
    true;


  customizePanel.hidden =
    false;


  inquiryPanel.hidden =
    true;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}



/* =========================================================
   INQUIRY
========================================================== */

function showInquiryPanel(
  saveState = true
) {

  if (
    saveState
  ) {

    saveCurrentAdminView(
      "inquiry"
    );

  }


  adminPage.classList.remove(
    "quote-mode"
  );

  adminPage.classList.remove(
    "customize-mode"
  );


  adminHome.hidden =
    true;


  quotePanel.hidden =
    true;


  settingsPanel.hidden =
    true;


  customizePanel.hidden =
    true;


  inquiryPanel.hidden =
    false;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}



/* =========================================================
   저장된 큰 화면 복원
========================================================== */

function restoreAdminView() {

  if (
    currentAdminView ===
    "quote"
  ) {

    showQuotePanel(
      false
    );

    return;

  }


  if (
    currentAdminView ===
    "settings"
  ) {

    showSettingsPanel(
      false
    );

    return;

  }


  if (
    currentAdminView ===
    "customize"
  ) {

    showCustomizePanel(
      false
    );

    return;

  }


  if (
    currentAdminView ===
    "inquiry"
  ) {

    showInquiryPanel(
      false
    );

    return;

  }


  showAdminHome(
    false
  );

}



/* =========================================================
   메뉴 이동
========================================================== */

openQuoteButton
  .addEventListener(
    "click",
    () => {

      showQuotePanel();

    }
  );


openSettingsButton
  .addEventListener(
    "click",
    () => {

      showSettingsPanel();

    }
  );


openCustomizeButton
  .addEventListener(
    "click",
    () => {

      showCustomizePanel();

    }
  );


openInquiryButton
  .addEventListener(
    "click",
    () => {

      showInquiryPanel();

    }
  );



/* =========================================================
   전체화면 편집 모드 - 모바일 바깥 페이지 스크롤 잠금

   quote-mode/customize-mode는 showQuotePanel/showCustomizePanel
   (추가)과 showLogin/showAdminHome/showSettingsPanel/
   showInquiryPanel(제거)까지 여러 곳에서 각각 adminPage.classList를
   건드린다. 그 호출부 전부에 잠금/해제를 나눠 넣는 대신,
   adminPage의 class 변화 자체를 MutationObserver로 지켜보다가
   quote-mode/customize-mode(둘 다 모바일에서 전체화면 편집기로
   전환되는 모드) 유무에 맞춰 body를 잠그고 풀어준다 — 호출부를
   하나도 안 건드려도 항상 정확히 동기화됨. CUSTOMIZE는 QUOTE
   PRESET의 이 처리 방식을 그대로 재사용한 것 — quote 전용이던
   클래스명/조건을 두 모드 공용으로 일반화했다.

   position:fixed로 body를 통째로 고정하는 이유: 패널 내부 스크롤이
   끝(맨 위/아래)에 닿은 뒤에도 계속 끌면, 그 여세가 상위 스크롤
   컨테이너(body)로 그대로 이어져(스크롤 체이닝) 배경 페이지가
   같이 살짝 끌리며 튕기는(iOS 고무줄) 문제가 있었다 —
   admin-quote.css의 overscroll-behavior가 체이닝 자체는 막아주지만,
   구형 WebKit 등 지원이 엇갈리는 환경까지 확실히 막으려면 body를
   아예 스크롤 불가능한 위치로 빼놓는 게 가장 확실하다. 대신
   position:fixed는 시각적 스크롤 위치를 0으로 날려버리므로, 잠글 때
   scrollY를 기억해서 top으로 상쇄하고 풀 때 되돌려야 화면이 안 튄다.

   실제 position:fixed 적용은 admin-shell.css의
   body.admin-fullscreen-editor-scroll-locked가
   @media(max-width:600px) 안에서만 담당하므로, 데스크톱에서는
   이 클래스가 붙어도 시각적으로 아무 변화가 없다(아래 top 인라인
   스타일도 position:static인 채로는 무의미).
========================================================== */

let fullscreenEditorScrollLockY = 0;

function lockAdminBodyScroll() {

  fullscreenEditorScrollLockY =
    window.scrollY;


  document.body.style.top =
    `-${fullscreenEditorScrollLockY}px`;


  document.body.classList.add(
    "admin-fullscreen-editor-scroll-locked"
  );

}


function unlockAdminBodyScroll() {

  document.body.classList.remove(
    "admin-fullscreen-editor-scroll-locked"
  );


  document.body.style.top =
    "";


  window.scrollTo(
    0,
    fullscreenEditorScrollLockY
  );

}


new MutationObserver(
  () => {

    const isFullscreenEditorMode =
      adminPage.classList.contains(
        "quote-mode"
      ) ||
      adminPage.classList.contains(
        "customize-mode"
      );


    const isLocked =
      document.body.classList.contains(
        "admin-fullscreen-editor-scroll-locked"
      );


    if (
      isFullscreenEditorMode &&
      !isLocked
    ) {

      lockAdminBodyScroll();

    }


    else if (
      !isFullscreenEditorMode &&
      isLocked
    ) {

      unlockAdminBodyScroll();

    }

  }
)
  .observe(
    adminPage,
    {
      attributes: true,
      attributeFilter: ["class"]
    }
  );



