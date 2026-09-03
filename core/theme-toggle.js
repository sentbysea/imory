/* =========================================================
   CORE - THEME TOGGLE

   #startThemeToggle 버튼 클릭 처리(Imory 시스템 UI --system-*
   전용, 사용자 홈페이지 --theme-*와 무관). FOUC 방지용 최초
   판정(localStorage → prefers-color-scheme)은 index.html
   <head>의 인라인 스크립트가 이미 <html data-theme>에 반영해둔
   상태에서, 이 파일은 이후 사용자의 클릭만 처리한다.
========================================================== */

(function () {

  const STORAGE_KEY =
    "imory_system_theme";

  const toggle =
    document.getElementById(
      "startThemeToggle"
    );

  if (!toggle) {
    return;
  }


  function currentTheme() {

    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";

  }


  function labelFor(theme) {

    return theme === "dark"
      ? "라이트 모드로 전환"
      : "다크 모드로 전환";

  }


  function syncLabel() {

    toggle.setAttribute(
      "aria-label",
      labelFor(
        currentTheme()
      )
    );

  }


  syncLabel();


  toggle.addEventListener(
    "click",
    () => {

      const next =
        currentTheme() === "dark"
          ? "light"
          : "dark";

      document.documentElement.setAttribute(
        "data-theme",
        next
      );

      try {

        localStorage.setItem(
          STORAGE_KEY,
          next
        );

      } catch (e) {}

      syncLabel();

    }
  );

})();
