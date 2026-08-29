/* =========================================================
   QUOTE - RENDER / LOAD PRESET LIST

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 저장된 프리셋 목록을 화면에 그리기, DB에서 목록
   불러오기(loadQuotePresets).
========================================================== */


/* =========================================================
   SAVE 버튼 활성/비활성

   save는 "지금 선택된 프리셋에 덮어쓰기"라 선택된 프리셋이
   없을 때는(currentQuotePresetId 없음) 누를 게 없으므로
   비활성화한다. new는 항상 누를 수 있어서 손대지 않음.
========================================================== */

function syncQuotePresetSaveButton() {

  if (!quoteSaveButton) {
    return;
  }


  quoteSaveButton.disabled =
    !currentQuotePresetId;

}


/* =========================================================
   RENDER PRESETS
========================================================== */

function renderQuotePresets(
  presets
) {

  ensureQuotePresetList();

  syncQuotePresetSaveButton();


  if (!quotePresetList) {
    return;
  }


  quotePresetList.innerHTML =
    "";


  if (
    presets.length === 0
  ) {

    const empty =
      document.createElement(
        "p"
      );


    empty.className =
      "quote-preset-empty";


    empty.textContent =
      "saved preset 없음";


    quotePresetList.appendChild(
      empty
    );


    return;

  }


  presets.forEach(
    preset => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "quote-preset-item";


      if (
        preset.id ===
        currentQuotePresetId
      ) {

        item.classList.add(
          "active"
        );

      }


      if (
        preset.is_active
      ) {

        item.classList.add(
          "is-live"
        );

      }


      /* ACTIVATE (실제 프리뷰/게시글에 반영될 프리셋으로 지정) */

      const activateButton =
        document.createElement(
          "button"
        );


      activateButton.type =
        "button";


      activateButton.className =
        "quote-preset-activate";


      activateButton.disabled =
        Boolean(
          preset.is_active
        );


      activateButton.textContent =
        preset.is_active
          ? "사용 중"
          : "사용 중으로 설정";


      activateButton.addEventListener(
        "click",
        async () => {

          await activateQuotePreset(
            preset.id
          );

        }
      );


      /* LOAD */

      const loadButton =
        document.createElement(
          "button"
        );


      loadButton.type =
        "button";


      loadButton.className =
        "quote-preset-load";


      loadButton.textContent =
        preset.name;


      loadButton.addEventListener(
        "click",
        () => {

          currentQuotePresetId =
            preset.id;


          if (quotePresetName) {

            quotePresetName.value =
              preset.name;

          }


          applyQuoteSettings(
            preset.settings ||
            {}
          );


          showQuoteMessage(
            "preset loaded ♡",
            true
          );


          renderQuotePresets(
            presets
          );

        }
      );


      /* DELETE */

      const deleteButton =
        document.createElement(
          "button"
        );


      deleteButton.type =
        "button";


      deleteButton.className =
        "quote-preset-delete";


      deleteButton.textContent =
        "×";


      deleteButton.addEventListener(
        "click",
        async () => {

          await deleteQuotePreset(
            preset.id
          );

        }
      );


      item.append(
        activateButton,
        loadButton,
        deleteButton
      );


      quotePresetList.appendChild(
        item
      );

    }
  );

}


/* =========================================================
   LOAD PRESETS
========================================================== */

async function loadQuotePresets() {

  ensureQuotePresetList();


  if (!quotePresetList) {
    return;
  }


  const {
    data: userData,
    error: userError
  } =
    await supabaseClient
      .auth
      .getUser();


  if (
    userError ||
    !userData.user
  ) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "quote_presets"
      )
      .select(
        "id, name, settings, updated_at, is_active"
      )
      .eq(
        "user_id",
        userData.user.id
      )
      .order(
        "updated_at",
        {
          ascending:
            false
        }
      );


  if (error) {

    console.error(
      "quote preset load error:",
      error
    );


    return;

  }


  const presets =
    data || [];


  /*
    처음 이 화면에 들어왔을 때(currentQuotePresetId 없음)는
    폼이 index.html의 기본값(fontSize 16, padding 48 등)
    그대로라, 실제 글에 반영되는 "사용 중" 프리셋과 미리보기가
    달라 보였다 — is_active 프리셋을 찾아서 loadButton을 누른
    것과 똑같이 자동으로 불러온다. 이미 뭔가 불러온 상태라면
    (수동으로 다른 프리셋을 편집 중일 수 있음) 덮어쓰지 않는다.
  */

  if (!currentQuotePresetId) {

    const activePreset =
      presets.find(
        preset => preset.is_active
      );


    if (activePreset) {

      currentQuotePresetId =
        activePreset.id;


      if (quotePresetName) {

        quotePresetName.value =
          activePreset.name;

      }


      applyQuoteSettings(
        activePreset.settings ||
        {}
      );

    }

  }


  renderQuotePresets(
    presets
  );

}


