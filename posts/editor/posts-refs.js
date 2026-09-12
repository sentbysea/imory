/* =========================================================
   POSTS - REFS / STATE / SMALL HELPERS

   posts.js가 너무 커져서(3200줄+) 기능별로 쪼갠 것 중
   첫 번째 파일. posts/editor/ 폴더의 다른 파일들은
   전부 여기 있는 DOM 참조와 상태 변수를 공유해서 쓰므로
   반드시 이 파일이 제일 먼저 로드돼야 함(index.html의
   postsDependencyScripts 순서 참고).

   내용: 라우팅(buildPostRoute 등 — slug 자체는
   core/lib/site-path.js 공용 헬퍼에 위임), 에디터/툴바/프리뷰
   DOM 요소 참조(배너 관련 참조 포함).

   상태 변수(current* 등)와 날짜 포맷/메뉴/로그인 조회
   함수는 바로 다음에 로드되는 posts-state.js에 있음 —
   이 파일이 너무 커져서(800줄+) 둘로 나눴을 뿐 사실상
   한 파일처럼 취급하면 됨(둘 다 posts/editor/의 다른
   파일들보다 먼저 로드돼야 함).

   실제 기능 로직(저장, 목록/상세, 리치에디터 이벤트,
   하이라이트/툴바, 페이지 이동 등)은 같은 폴더의 다른
   파일들에 나눠져 있음 — 각 파일 맨 위 주석 참고.
========================================================== */


/* =========================================================
   ROUTING

   SITE_BASE_PATH/getSitePath 등은 core/lib/site-path.js
   (index.html에서 이 파일보다 먼저 로드됨)에 있음 — owner
   slug(home/site-owner.js 참고)는 이제 검색 파라미터가 아니라
   경로 첫 segment라 history.pushState로 경로를 바꿔도
   사라지지 않지만, 이 함수를 거치는 모든 내부 네비게이션
   (히스토리 이동, 링크 생성, 404 redirect restore)에서 여전히
   현재 slug를 다시 읽어 그대로 유지시켜준다.
========================================================== */

function buildPostRoute(path = "/") {

  return buildSitePath(
    getSiteOwnerSlugFromPath(),
    path
  );

}


function getPostRoutePath() {

  return getSitePathAfterSlug();

}



/* =========================================================
   ELEMENTS
========================================================== */

const postArea =
  document.getElementById(
    "postArea"
  );


/*
  글 읽기 화면은 window가 아니라 #postArea 안에서
  자체적으로 스크롤되므로, 메뉴/음악 버튼 숨김 함수
  (home/menu.js, 전역)를 여기서도 그대로 호출해준다.

  그 함수는 legacy_sua 홈에서만 로드되는 스크립트가 선언한다
  (index.html의 loadLegacySuaCommonScripts) — 선언 자체가 없는
  배포(customize/Skin 홈)에서는 optional call(?.)로도 ReferenceError가 나므로
  (선언되지 않은 식별자는 optional call이 막아주지 못한다) typeof로
  확인한다. 없으면 조용히 넘어간다 — 숨길 버튼 자체가 없는 화면이다.
*/

postArea?.addEventListener(
  "scroll",
  () => {

    if (
      typeof updateFixedButtonsOnScroll ===
      "function"
    ) {

      updateFixedButtonsOnScroll(
        postArea.scrollTop
      );

    }

  },
  {
    passive: true
  }
);

const postContainer =
  document.getElementById(
    "postContainer"
  );

/*
  PHASE 1D: published Skin 후보 CATEGORY/POST 전환 중,
  기존 화면을 그대로 유지하다가 응답이 오래 걸릴 때만 잠깐
  보여주는 작은 대기 표시(posts-view-transition.js의
  schedulePendingIndicator/clearPendingIndicator).
*/

const postPendingIndicator =
  document.getElementById(
    "postPendingIndicator"
  );

const postPageTitle =
  document.getElementById(
    "postPageTitle"
  );

const postList =
  document.getElementById(
    "postList"
  );

const postDetail =
  document.getElementById(
    "postDetail"
  );

/*
  PHASE 1C-F: published Skin이 이 POST를 지원할 때 outer chrome을
  통째로 여기 렌더한다(posts/view/posts-view-detail.js의
  tryRenderPublishedSkinPost). 지원하지 않으면 항상 hidden.
*/

const postSkinContainer =
  document.getElementById(
    "postSkinContainer"
  );

const postDetailTitle =
  document.getElementById(
    "postDetailTitle"
  );

const postDetailDate =
  document.getElementById(
    "postDetailDate"
  );

const postDetailContentWrap =
  document.getElementById(
    "postDetailContentWrap"
  );

const postDetailContent =
  document.getElementById(
    "postDetailContent"
  );

const postSecretGate =
  document.getElementById(
    "postSecretGate"
  );

const postSecretGateInput =
  document.getElementById(
    "postSecretGateInput"
  );

const postSecretGateSubmit =
  document.getElementById(
    "postSecretGateSubmit"
  );

const postSecretGateMessage =
  document.getElementById(
    "postSecretGateMessage"
  );

const postBackButton =
  document.getElementById(
    "postBackButton"
  );

const postAddButton =
  document.getElementById(
    "postAddButton"
  );


const bannerEditToggleButton =
  document.getElementById(
    "bannerEditToggleButton"
  );


const postListEditToggleButton =
  document.getElementById(
    "postListEditToggleButton"
  );


/*
  POST 스킨 위에서 그 글의 수정 폼을 곧장 여는 소유자 전용
  진입점(posts.html). 예전에는 옛 상세 화면을 열고 닫는
  토글이었는데, 실사용자가 이 버튼을 누르는 이유는 고치기
  위해서라 지금은 바로 폼으로 간다.
*/

const postManageToggleButton =
  document.getElementById(
    "postManageToggleButton"
  );


/*
  HIGHLIGHT-1: 글 읽기 화면의 도구 메뉴(⋮) 버튼. 주인장과 방문자
  모두에게 나오고, 메뉴 내용만 권한에 따라 달라진다
  (posts/view/posts-view-tools-menu.js). 스킨이 자기 자리에
  ?tools=1 링크를 그렸으면 이 버튼은 숨는다 — 같은 동작을 두 번
  보여주지 않는다.
*/

const postToolsButton =
  document.getElementById(
    "postToolsButton"
  );


/*
  WRITE를 눌렀는데 글 카테고리가 하나도 없을 때만 뜨는 안내
  패널(posts/view/posts-view-compose.js). 스킨 HTML 밖의
  플랫폼 UI라 스킨은 이 화면의 존재를 몰라도 된다.
*/

const postComposeNotice =
  document.getElementById(
    "postComposeNotice"
  );

const postComposeNoticeHint =
  document.getElementById(
    "postComposeNoticeHint"
  );

const postComposeNoticeAdmin =
  document.getElementById(
    "postComposeNoticeAdmin"
  );

const postComposeNoticeClose =
  document.getElementById(
    "postComposeNoticeClose"
  );

const postListSelectBar =
  document.getElementById(
    "postListSelectBar"
  );

const postListSelectCount =
  document.getElementById(
    "postListSelectCount"
  );

const postListSelectDeleteButton =
  document.getElementById(
    "postListSelectDeleteButton"
  );


const bannerGrid =
  document.getElementById(
    "bannerGrid"
  );

const bannerEditor =
  document.getElementById(
    "bannerEditor"
  );

const bannerEditorHeading =
  document.getElementById(
    "bannerEditorHeading"
  );

const bannerEditorName =
  document.getElementById(
    "bannerEditorName"
  );

const bannerEditorUrl =
  document.getElementById(
    "bannerEditorUrl"
  );

const bannerEditorFileInput =
  document.getElementById(
    "bannerEditorFileInput"
  );

const bannerEditorPreview =
  document.getElementById(
    "bannerEditorPreview"
  );

const bannerEditorPreviewEmpty =
  document.getElementById(
    "bannerEditorPreviewEmpty"
  );

const bannerEditorUploadMessage =
  document.getElementById(
    "bannerEditorUploadMessage"
  );

const bannerEditorDelete =
  document.getElementById(
    "bannerEditorDelete"
  );

const bannerEditorCancel =
  document.getElementById(
    "bannerEditorCancel"
  );

const bannerEditorSave =
  document.getElementById(
    "bannerEditorSave"
  );

const bannerEditorMessage =
  document.getElementById(
    "bannerEditorMessage"
  );


const postDetailFontScale =
  document.getElementById(
    "postDetailFontScale"
  );

const postDetailFontScaleDown =
  document.getElementById(
    "postDetailFontScaleDown"
  );

const postDetailFontScaleUp =
  document.getElementById(
    "postDetailFontScaleUp"
  );

const postDetailActions =
  document.getElementById(
    "postDetailActions"
  );

const postEditButton =
  document.getElementById(
    "postEditButton"
  );

const postDeleteButton =
  document.getElementById(
    "postDeleteButton"
  );

const postRelated =
  document.getElementById(
    "postRelated"
  );

const postRelatedTitle =
  document.getElementById(
    "postRelatedTitle"
  );

const postRelatedList =
  document.getElementById(
    "postRelatedList"
  );



/* =========================================================
   EDITOR
========================================================== */

const postEditor =
  document.getElementById(
    "postEditor"
  );

const postEditorCategory =
  document.getElementById(
    "postEditorCategory"
  );

/*
  카테고리 안의 폴더 선택(FOLDER-1). 폴더가 없는 카테고리에서는
  field 자체를 숨기므로 두 참조를 함께 둔다
  (posts/editor/format/posts-editor-folder.js).
*/

const postEditorFolder =
  document.getElementById(
    "postEditorFolder"
  );

const postEditorFolderField =
  document.getElementById(
    "postEditorFolderField"
  );

const postEditorTitle =
  document.getElementById(
    "postEditorTitle"
  );

const postEditorContent =
  document.getElementById(
    "postEditorContent"
  );

const postEditorOOCToggle =
  document.getElementById(
    "postEditorOOCToggle"
  );

const postEditorOOC =
  document.getElementById(
    "postEditorOOC"
  );

const postEditorHtmlModeToggle =
  document.getElementById(
    "postEditorHtmlModeToggle"
  );

const postEditorSecretToggle =
  document.getElementById(
    "postEditorSecretToggle"
  );

const postEditorPrivateToggle =
  document.getElementById(
    "postEditorPrivateToggle"
  );

const postEditorSecretPassword =
  document.getElementById(
    "postEditorSecretPassword"
  );

const postEditorRichtextMode =
  document.getElementById(
    "postEditorRichtextMode"
  );

const postEditorHtmlContent =
  document.getElementById(
    "postEditorHtmlContent"
  );

const postEditorCancelButton =
  document.getElementById(
    "postEditorCancelButton"
  );


/*
  수정 폼에서만 보이는 삭제 버튼 — 스킨 POST에서 옛 상세 화면을
  거쳐야만 삭제할 수 있던 동선을 대신한다. 확인 창과 삭제 로직은
  기존 #postDeleteButton과 완전히 같은 함수를 쓴다
  (posts/editor/posts-list-detail-nav.js).
*/

const postEditorDeleteButton =
  document.getElementById(
    "postEditorDeleteButton"
  );

const postEditorSaveButton =
  document.getElementById(
    "postEditorSaveButton"
  );

const postEditorExportButton =
  document.getElementById(
    "postEditorExportButton"
  );

const postEditorCopyButton =
  document.getElementById(
    "postEditorCopyButton"
  );

const postEditorMessage =
  document.getElementById(
    "postEditorMessage"
  );



/* =========================================================
   TOOLBAR
========================================================== */

const postEditorFontToggle =
  document.getElementById(
    "postEditorFontToggle"
  );

const postEditorBoldToggle =
  document.getElementById(
    "postEditorBoldToggle"
  );

const postEditorItalicToggle =
  document.getElementById(
    "postEditorItalicToggle"
  );

const postEditorUnderlineToggle =
  document.getElementById(
    "postEditorUnderlineToggle"
  );

const postEditorStrikeToggle =
  document.getElementById(
    "postEditorStrikeToggle"
  );

/*
  ★ 색 컨트롤은 더 이상 <input type="color">가 아니다.

  OS 컬러피커는 한 번 누르면 닫혀버려 이어서 조정할 수 없고,
  열리는 동안 본문 선택/포커스를 가져간다(요구사항 1). 지금은
  스와치 버튼을 누르면 우리가 그리는 팝오버가 열린다
  (posts/editor/posts-color-picker.js). "지금 색"은 DOM이 아니라
  posts/style/posts-style-preset.js의 변수가 들고 있다.
*/

const postEditorCustomControl =
  document.getElementById(
    "postEditorCustomControl"
  );

const postEditorCustomSwatch =
  document.getElementById(
    "postEditorCustomSwatch"
  );

const postEditorCustomPointSwatch =
  document.getElementById(
    "postEditorCustomPointSwatch"
  );

const postEditorCustomPointControl =
  document.getElementById(
    "postEditorCustomPointControl"
  );


/* 강조선 — 문단 왼쪽 세로선 */

const postEditorRuleToggle =
  document.getElementById(
    "postEditorRuleToggle"
  );

const postEditorRuleControl =
  document.getElementById(
    "postEditorRuleControl"
  );

const postEditorRuleSwatch =
  document.getElementById(
    "postEditorRuleSwatch"
  );

const postEditorClearStyle =
  document.getElementById(
    "postEditorClearStyle"
  );

const postEditorPresetSelect =
  document.getElementById(
    "postEditorPresetSelect"
  );


/*
  HTML 모드의 디자인 미리보기 · PNG 저장 (요구사항 10).
  posts/export/posts-html-image.js가 쓴다.
*/

const postEditorHtmlPreview =
  document.getElementById(
    "postEditorHtmlPreview"
  );

const postEditorHtmlPreviewEmpty =
  document.getElementById(
    "postEditorHtmlPreviewEmpty"
  );


/*
  툴바 3행 — 블록 삽입(복사 상자 · 메모 · 구분선).
  posts/editor/posts-editor-blocks.js가 쓴다.
*/

const postEditorInsertCopyBox =
  document.getElementById(
    "postEditorInsertCopyBox"
  );

const postEditorInsertMemo =
  document.getElementById(
    "postEditorInsertMemo"
  );

const postEditorInsertDivider =
  document.getElementById(
    "postEditorInsertDivider"
  );


const postEditorFloatingMenu =
  document.getElementById(
    "postEditorFloatingMenu"
  );

const postEditorFloatingCustomControl =
  document.getElementById(
    "postEditorFloatingCustomControl"
  );

const postEditorFloatingCustomSwatch =
  document.getElementById(
    "postEditorFloatingCustomSwatch"
  );

const postEditorFloatingCustomPointControl =
  document.getElementById(
    "postEditorFloatingCustomPointControl"
  );

const postEditorFloatingCustomPointSwatch =
  document.getElementById(
    "postEditorFloatingCustomPointSwatch"
  );

const postEditorFloatingRuleControl =
  document.getElementById(
    "postEditorFloatingRuleControl"
  );

const postEditorFloatingRuleSwatch =
  document.getElementById(
    "postEditorFloatingRuleSwatch"
  );


/* =========================================================
   PREVIEW
========================================================== */

const postEditorPreviewToggle =
  document.getElementById(
    "postEditorPreviewToggle"
  );

const postEditorPreviewToggleLabel =
  document.getElementById(
    "postEditorPreviewToggleLabel"
  );

const postEditorPreviewToggleIcon =
  document.getElementById(
    "postEditorPreviewToggleIcon"
  );

const postEditorPreviewSection =
  document.getElementById(
    "postEditorPreviewSection"
  );

const postEditorPreviewSheet =
  document.getElementById(
    "postEditorPreviewSheet"
  );

const postEditorPreviewDragHandle =
  document.getElementById(
    "postEditorPreviewDragHandle"
  );

const postEditorPreviewStage =
  document.getElementById(
    "postEditorPreviewStage"
  );


/* 배경 사진 · 출처 강조선 (이번 발췌 전용 — posts/preview/posts-preview-background.js) */

/*
  ★ 배경 버튼 셋(change image · move · reset)은 이제 설정의
  마지막 줄에 바로 있다 — 그것들을 감싸던 "background" 여닫기
  버튼과 패널은 없앴다(요구사항 8).
*/

const postEditorPreviewBackgroundPick =
  document.getElementById(
    "postEditorPreviewBackgroundPick"
  );

const postEditorPreviewBackgroundFile =
  document.getElementById(
    "postEditorPreviewBackgroundFile"
  );

const postEditorPreviewBackgroundMove =
  document.getElementById(
    "postEditorPreviewBackgroundMove"
  );

const postEditorPreviewBackgroundReset =
  document.getElementById(
    "postEditorPreviewBackgroundReset"
  );

const postEditorPreviewBackgroundMessage =
  document.getElementById(
    "postEditorPreviewBackgroundMessage"
  );

const postEditorPreviewSourceRuleToggle =
  document.getElementById(
    "postEditorPreviewSourceRuleToggle"
  );

/*
  ★ 출처 강조선의 **색 견본은 없앴다**(요구사항 7) — 이 발췌
  설정에서는 켜고 끄기만 하고 색은 Quote Preset의 SOURCE 값을
  그대로 따른다. 본문 툴바의 H/P/L 색 견본은 그대로 남아 있다
  (postEditorCustomControl / …PointControl / postEditorRuleControl).
*/

const postEditorPreviewTitleToggle =
  document.getElementById(
    "postEditorPreviewTitleToggle"
  );

const postEditorPreviewSourceToggle =
  document.getElementById(
    "postEditorPreviewSourceToggle"
  );

const postEditorPreviewAlignRow =
  document.getElementById(
    "postEditorPreviewAlignRow"
  );

const postEditorPreviewAlignSelect =
  document.getElementById(
    "postEditorPreviewAlignSelect"
  );

const postEditorPreviewBodyAlignSelect =
  document.getElementById(
    "postEditorPreviewBodyAlignSelect"
  );

const postEditorPreviewRatioControls =
  document.getElementById(
    "postEditorPreviewRatioControls"
  );

const postEditorPreviewRatioButtons =
  document.querySelectorAll(
    "#postEditorPreviewRatioControls .post-editor-preview-ratio-button"
  );

const postEditorPreviewRatioCustomInputs =
  document.getElementById(
    "postEditorPreviewRatioCustomInputs"
  );

const postEditorPreviewRatioCustomWidth =
  document.getElementById(
    "postEditorPreviewRatioCustomWidth"
  );

const postEditorPreviewRatioCustomHeight =
  document.getElementById(
    "postEditorPreviewRatioCustomHeight"
  );

/* 출력 픽셀 크기 표시(읽기 전용). 가로 픽셀을 고르는 입력칸은
   이 화면에 없다 — Quote Preset의 CANVAS에서만 고친다
   (posts/preview/posts-preview-settings.js) */

const postEditorPreviewExportSize =
  document.getElementById(
    "postEditorPreviewExportSize"
  );

const postEditorPreviewSourceBottomOffsetRow =
  document.getElementById(
    "postEditorPreviewSourceBottomOffsetRow"
  );

const postEditorPreviewSourceBottomOffset =
  document.getElementById(
    "postEditorPreviewSourceBottomOffset"
  );

const postEditorPreviewSourceSpacingRow =
  document.getElementById(
    "postEditorPreviewSourceSpacingRow"
  );

const postEditorPreviewSourceSpacing =
  document.getElementById(
    "postEditorPreviewSourceSpacing"
  );

const postEditorPreviewTitle =
  document.getElementById(
    "postEditorPreviewTitle"
  );

const postEditorPreviewContent =
  document.getElementById(
    "postEditorPreviewContent"
  );

