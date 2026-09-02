/* =========================================================
   POSTS - STYLE: PRESET / HIGHLIGHT

   posts.js에서 분리됨(posts-style.js). posts-style.js
   자체도 너무 커져서 posts/style/ 폴더 안에서 다시
   기능별로 쪼갠 것 중 첫 번째 파일.

   postStyleSettings, postDetailContent는
   posts/editor/posts-refs.js에 있음(같은 페이지에서
   함께 로드되어야 함).
   getPostContentAsSafeHTML은 posts-sanitize.js에 있음.

   내용: Vibe 프리셋 불러오기, 글쓰기 화면의 세션 한정
   프리셋 드롭다운, 프리셋 하이라이트 색상.
========================================================== */

/* =========================================================
   VIBE PRESET
========================================================== */

async function loadPostStylePreset() {

  /*
    admin-quote에서 "사용 중"으로 지정해둔 프리셋이 있으면
    그걸 최우선으로 쓰고, 없으면(한 번도 지정 안 한 경우)
    기존처럼 이름이 "Vibe"인 프리셋으로 폴백한다.
  */

  const owner =
    await getSiteOwner();


  if (
    owner.scoped &&
    !owner.ownerId
  ) {

    postStyleSettings = {};

    return postStyleSettings;

  }


  let activeQuery =
    supabaseClient
      .from(
        "quote_presets"
      )
      .select(
        "settings"
      )
      .eq(
        "is_active",
        true
      );


  if (owner.scoped) {

    activeQuery =
      activeQuery.eq(
        "user_id",
        owner.ownerId
      );

  }


  const {
    data: activeData,
    error: activeError
  } =
    await activeQuery
      .maybeSingle();


  if (
    !activeError &&
    activeData
  ) {

    postStyleSettings =
      activeData.settings ||
      {};


    updatePresetHighlightSwatch();


    updatePresetPointColorSwatch();


    return postStyleSettings;

  }


  let fallbackQuery =
    supabaseClient
      .from(
        "quote_presets"
      )
      .select(
        "settings"
      )
      .eq(
        "name",
        "Vibe"
      );


  if (owner.scoped) {

    fallbackQuery =
      fallbackQuery.eq(
        "user_id",
        owner.ownerId
      );

  }


  const {
    data,
    error
  } =
    await fallbackQuery
      .maybeSingle();


  if (error) {

    console.error(
      "Vibe 프리셋 불러오기 실패:",
      error
    );

    return null;

  }


  postStyleSettings =
    data?.settings ||
    {};


  updatePresetHighlightSwatch();


  return postStyleSettings;

}


/*
  글 하나에 지정해둔 프리셋(posts.quote_preset_id)을 불러온다
  — loadPostStylePreset과 달리 "사용 중" 여부와 무관하게 이
  글에 박아둔 그 프리셋을 그대로 쓴다. 삭제 등으로 못 찾으면
  기존처럼 활성 프리셋으로 폴백.
*/

async function loadPostStylePresetById(
  presetId
) {

  const owner =
    await getSiteOwner();


  if (
    owner.scoped &&
    !owner.ownerId
  ) {

    postStyleSettings = {};

    return postStyleSettings;

  }


  let presetQuery =
    supabaseClient
      .from(
        "quote_presets"
      )
      .select(
        "settings"
      )
      .eq(
        "id",
        presetId
      );


  if (owner.scoped) {

    presetQuery =
      presetQuery.eq(
        "user_id",
        owner.ownerId
      );

  }


  const {
    data,
    error
  } =
    await presetQuery
      .maybeSingle();


  if (
    error ||
    !data
  ) {

    return loadPostStylePreset();

  }


  postStyleSettings =
    data.settings ||
    {};


  updatePresetHighlightSwatch();


  updatePresetPointColorSwatch();


  return postStyleSettings;

}



/* =========================================================
   PRESET 드롭다운

   내가 admin에서 저장해둔 QUOTE 프리셋 중 아무거나 골라서
   프리뷰/export 서식을 바꿔 낄 수 있음. 고른 프리셋의 id는
   글 저장 시 posts.quote_preset_id에 그대로 저장되어(posts-save.js)
   그 글의 뷰어/발췌 export에도 영구 반영된다(posts-view-detail.js가
   글을 열 때 quote_preset_id가 있으면 loadPostStylePresetById로
   그 프리셋을 최우선으로 쓴다) — "프리셋 없음"을 고르면
   quote_preset_id가 null로 저장되고, 그때는 사이트 전역
   "사용 중" 프리셋을 그대로 따라간다.
========================================================== */

let postPresetOptions =
  [];


async function loadPostPresetOptions() {

  const user =
    await getSignedInUser();


  if (!user) {
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
        "id, name, settings"
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "name",
        {
          ascending:
            true
        }
      );


  if (error) {

    console.error(
      "preset 목록 불러오기 실패:",
      error
    );

    return;

  }


  postPresetOptions =
    data ||
    [];


  renderPostPresetSelect();

}


function renderPostPresetSelect() {

  if (
    !postEditorPresetSelect
  ) {
    return;
  }


  postEditorPresetSelect.innerHTML =
    "";


  /*
    "없음" = 이 글에는 프리셋을 박아두지 않고, 사이트 전역
    "사용 중" 프리셋을 그대로 따라간다는 뜻(quote_preset_id
    null로 저장됨). posts-view-editor-load.js가 글을 열 때
    이 글의 저장된 선택으로 값을 다시 맞춰준다.
  */

  const noneOption =
    document.createElement(
      "option"
    );


  noneOption.value =
    "";


  noneOption.textContent =
    "프리셋 없음 (사용 중인 스타일)";


  postEditorPresetSelect.appendChild(
    noneOption
  );


  postPresetOptions.forEach(
    preset => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        preset.id;


      option.textContent =
        preset.name;


      postEditorPresetSelect.appendChild(
        option
      );

    }
  );


  postEditorPresetSelect.value =
    "";

}


/*
  presetId가 없으면("없음" 선택) 이 글의 프리셋 오버라이드를
  풀고 사이트 전역 활성 프리셋으로 되돌린다.
*/

async function applyPostPresetById(
  presetId
) {

  if (!presetId) {

    await loadPostStylePreset();


    updateEditorPreview();


    return;

  }


  const preset =
    postPresetOptions.find(
      item =>
        String(item.id) ===
        String(presetId)
    );


  if (!preset) {
    return;
  }


  postStyleSettings =
    preset.settings ||
    {};


  updatePresetHighlightSwatch();


  updatePresetPointColorSwatch();


  updateEditorPreview();

}



/* =========================================================
   HIGHLIGHT
========================================================== */

function getPresetHighlightColor() {

  const color =
    postStyleSettings
      ?.highlightColor;


  if (
    /^#[0-9a-fA-F]{6}$/.test(
      color || ""
    )
  ) {

    return color;

  }


  return "#f4dce6";

}


function getSafeHighlightColor(
  color
) {

  if (
    /^#[0-9a-fA-F]{6}$/.test(
      color || ""
    )
  ) {

    return color;

  }


  return getPresetHighlightColor();

}


/*
  ★ 버튼이 하나(커스텀 컬러피커)뿐이라, 이 컨트롤의 "초기 색"을
  QUOTE PRESET의 하이라이트 색으로 맞춰준다 — 프리셋이 처음
  로드되거나(loadPostStylePreset) 세션 중 다른 프리셋으로
  바꿔 낄 때(applyPostPresetById)마다 호출됨.
*/

function updatePresetHighlightSwatch() {

  const presetColor =
    getPresetHighlightColor();


  if (postEditorCustomColor) {

    postEditorCustomColor.value =
      presetColor;

  }


  updateCustomHighlightSwatch();

}


function updateCustomHighlightSwatch() {

  if (
    !postEditorCustomSwatch ||
    !postEditorCustomColor
  ) {
    return;
  }


  const color =
    getSafeHighlightColor(
      postEditorCustomColor.value
    );


  postEditorCustomSwatch.style.background =
    color;


  if (
    postEditorFloatingCustomSwatch
  ) {

    postEditorFloatingCustomSwatch.style.background =
      color;

  }


  if (
    postEditorFloatingCustomColor &&
    postEditorFloatingCustomColor.value !==
      postEditorCustomColor.value
  ) {

    postEditorFloatingCustomColor.value =
      postEditorCustomColor.value;

  }

}



/* =========================================================
   POINT COLOR
   (HIGHLIGHT과 동일한 구조 — 배경색 대신 글자색)
========================================================== */

function getPresetPointColor() {

  const color =
    postStyleSettings
      ?.pointColor;


  if (
    /^#[0-9a-fA-F]{6}$/.test(
      color || ""
    )
  ) {

    return color;

  }


  return "#5c7cfa";

}


function getSafePointColor(
  color
) {

  if (
    /^#[0-9a-fA-F]{6}$/.test(
      color || ""
    )
  ) {

    return color;

  }


  return getPresetPointColor();

}


/*
  ★ HIGHLIGHT과 동일 — 버튼이 하나뿐이라 이 컨트롤의 초기
  색을 QUOTE PRESET의 포인트 컬러로 맞춰준다.
*/

function updatePresetPointColorSwatch() {

  const presetColor =
    getPresetPointColor();


  if (postEditorCustomPointColor) {

    postEditorCustomPointColor.value =
      presetColor;

  }


  updateCustomPointColorSwatch();

}


function updateCustomPointColorSwatch() {

  if (
    !postEditorCustomPointSwatch ||
    !postEditorCustomPointColor
  ) {
    return;
  }


  const color =
    getSafePointColor(
      postEditorCustomPointColor.value
    );


  postEditorCustomPointSwatch.style.background =
    color;


  if (
    postEditorFloatingCustomPointSwatch
  ) {

    postEditorFloatingCustomPointSwatch.style.background =
      color;

  }


  if (
    postEditorFloatingCustomPointColor &&
    postEditorFloatingCustomPointColor.value !==
      postEditorCustomPointColor.value
  ) {

    postEditorFloatingCustomPointColor.value =
      postEditorCustomPointColor.value;

  }

}


