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

  const themeColorMeta =
    document.getElementById(
      "systemThemeColorMeta"
    );


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

      /*
        iOS Safari 상단/하단 바 색은 <html data-theme>가 아니라
        이 meta의 content를 본다 — index.html <head>의
        #systemThemeColorMeta 값(라이트 #ffffff / 다크 #222222,
        --system-bg 실값과 동일하게 유지)과 반드시 같이 갱신해야
        토글 직후에도 화면 위아래가 이전 테마 색으로 남지 않는다.
      */

      if (themeColorMeta) {

        themeColorMeta.setAttribute(
          "content",
          next === "dark" ? "#222222" : "#ffffff"
        );

        /*
          content 속성만 바꾸면 iOS Safari가 상태바/툴바 색을 다시
          읽어오지 않는 경우가 있다(아래 rAF 완화책과 별개의 오래된
          WebKit 버그) — 메타 엘리먼트를 DOM에서 뺐다 그 자리에
          다시 넣으면 값은 그대로인 채로 Safari가 강제로 다시
          읽는다. 부모/다음 형제가 없어질 일은 없으므로(항상 head
          안의 고정 엘리먼트) 조건 없이 안전하게 수행.
        */

        const themeColorParent =
          themeColorMeta.parentNode;

        const themeColorNextSibling =
          themeColorMeta.nextSibling;

        themeColorParent.removeChild(
          themeColorMeta
        );

        themeColorParent.insertBefore(
          themeColorMeta,
          themeColorNextSibling
        );

      }

      try {

        localStorage.setItem(
          STORAGE_KEY,
          next
        );

      } catch (e) {}

      syncLabel();

      /*
        iOS 26 Safari는 theme-color 메타를 무시하고 body/fixed
        전체화면 요소(.landing-screen)의 배경색에서 상태바/툴바
        틴트를 직접 샘플링하는데, 새로고침 없는 클릭 토글에서는
        이 재샘플링이 누락되는 WebKit 버그가 있다(Design.md 4-7-1
        3번 참고, 26.2에서 수정 예정). data-theme 변경이 실제로
        페인트된 뒤에 스크롤 트릭을 실행해야 하므로 rAF를 두 번
        중첩한다(첫 rAF는 "다음 프레임 직전"이라 아직 이번 프레임의
        페인트가 끝났다는 보장이 없고, 그 안에서 또 rAF를 걸면
        그 사이 프레임이 실제로 그려진 뒤 실행된다) — .landing-screen을
        1px 스크롤했다 되돌려 reflow를 유발, Safari가 다시
        샘플링하도록 유도한다. 완화 조치일 뿐 100% 보장은 아니다.
      */

      requestAnimationFrame(() => {

        requestAnimationFrame(() => {

          const scroller =
            document.querySelector(
              ".landing-screen"
            );

          if (scroller) {

            const top = scroller.scrollTop;
            scroller.scrollTop = top + 1;
            scroller.scrollTop = top;

          }

        });

      });

    }
  );

})();
