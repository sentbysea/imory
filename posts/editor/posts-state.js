/* =========================================================
   POSTS - STATE / DATE / MENU / AUTH

   posts-refs.js 분할본(파일이 너무 커져서 둘로 나눔 —
   사실상 한 파일처럼 취급하면 됨, 둘 다 posts/editor/의
   다른 파일들보다 먼저 로드돼야 함).

   내용: 프리뷰 페이지네이션 DOM 참조, current/editor 접두사
   상태 변수, 날짜 포맷, 메뉴 열고닫기, 로그인 사용자 조회
   (getSignedInUser).
========================================================== */


  /* =========================================================
   PAGED PREVIEW
========================================================== */

const postEditorPageBreak =
  document.getElementById(
    "postEditorPageBreak"
  );


const postEditorUndoButton =
  document.getElementById(
    "postEditorUndoButton"
  );


const postEditorPreviewPages =
  document.getElementById(
    "postEditorPreviewPages"
  );


const postEditorPreviewPagination =
  document.getElementById(
    "postEditorPreviewPagination"
  );


const postEditorPreviewPrev =
  document.getElementById(
    "postEditorPreviewPrev"
  );


const postEditorPreviewNext =
  document.getElementById(
    "postEditorPreviewNext"
  );


const postEditorPreviewPageIndicator =
  document.getElementById(
    "postEditorPreviewPageIndicator"
  );


const postEditorPreviewZoomOut =
  document.getElementById(
    "postEditorPreviewZoomOut"
  );


const postEditorPreviewZoomIn =
  document.getElementById(
    "postEditorPreviewZoomIn"
  );


const postEditorPreviewZoomLevel =
  document.getElementById(
    "postEditorPreviewZoomLevel"
  );


const categoryMenuLinks =
  document.getElementById(
    "categoryMenuLinks"
  );



/* =========================================================
   STATE
========================================================== */

let currentPostCategoryId =
  null;

/*
  "post"(기본) 또는 "banner". posts-view-banner.js가 참고.
*/

let currentPostCategoryType =
  "post";


/*
  BANNER 카테고리 상태. posts-view-banner.js 전용.
*/

let bannerEditModeOn =
  false;

let currentBanners =
  [];

let editingBannerId =
  null;


/*
  PHASE 1E: 지금 열려 있는 배너 화면이 published Skin의
  templates.banner로 그려졌는지.

  posts/view/posts-view-list.js의 openCategoryPage()가 렌더 결과에
  따라 켜고 끄고, posts-view-banner.js / posts-view-banner-form.js가
  "legacy 그리드를 그려야 하는가 / 폼을 닫으면 어디로 돌아가는가"를
  이 값으로 판단한다.

  ★ 상태를 배너 렌더러가 아니라 여기(공용 상태 모듈)에 두는 이유:
  openCategoryPage()는 배너가 아닌 카테고리를 열 때도 진입점에서 이
  값을 끈다. 배너 렌더러(posts-view-banner.js)를 로드하지 않는
  구성(예: skin/skin-transition-timing-test.html)에서도 그 호출이
  안전해야 하므로, 상태와 setter는 두 화면 모두가 항상 갖는 이
  파일에 둔다. 실제 화면 전환 동작(관리 그리드 열기/Skin 목록
  복원)만 posts-view-banner.js에 있다.
*/

let bannerSkinActive =
  false;


/*
  PHASE 1E: 지금 열려 있는 post형 CATEGORY 화면이 published Skin의
  templates.category로 그려졌는지. bannerSkinActive와 같은 역할이고
  같은 이유로 여기(공용 상태 모듈)에 있다.

  true면 글 목록은 #postList 안의 Skin이 그린다. 소유자가 떠 있는
  edit 토글을 눌러 관리 화면(선택 삭제 목록)으로 들어갈 때만 그
  자리를 legacy 목록이 대신하고, 토글을 끄면 다시 Skin으로 돌아온다.
*/

let categorySkinActive =
  false;


function setCategorySkinActive(
  active
) {

  categorySkinActive =
    !!active;


  if (categorySkinActive) {

    postListEditModeOn =
      false;


    selectedPostIdsForDelete =
      new Set();

  }

}


function setBannerSkinActive(
  active
) {

  bannerSkinActive =
    !!active;


  if (bannerSkinActive) {

    /*
      Skin 목록으로 (다시) 들어올 때는 항상 관리 모드가 꺼진
      상태에서 시작한다 — legacy 경로에서 renderBannerCategory()가
      하는 초기화와 같은 역할.
    */

    bannerEditModeOn =
      false;


    editingBannerId =
      null;

  }

}


/*
  글 카테고리 목록 상태. posts-view-list.js /
  posts-view-list-select.js 전용. currentCategoryPosts는
  지금 화면에 그려진 글 목록(선택 삭제 모드에서 다시
  그릴 때 재사용), selectedPostIdsForDelete는 선택 삭제
  모드에서 체크된 글 id 모음.
*/

let postListEditModeOn =
  false;

let currentCategoryPosts =
  [];

let selectedPostIdsForDelete =
  new Set();

let currentPostId =
  null;

let currentPostOwnerId =
  null;

let currentPostView =
  "home";


/*
  PHASE 1C-F: 지금 열려 있는 POST가 published Skin outer chrome으로
  렌더된 상태인지, 그렇다면 본문을 mount할 protected region이
  어디인지. posts-view-detail.js(openPostPage)가 매번 설정하고,
  posts-view-detail.js/posts-view-secret-gate.js 양쪽의
  renderPostDetailBody() 호출부가 이 값을 읽어 본문을 legacy
  #postDetailContent 대신 Skin region에 mount한다. Skin 미지원/
  실패/owner 열람이면 항상 null로 되돌아가 기존 legacy 동작과
  100% 동일하다.
*/

let currentPostBodyMountTarget =
  null;


/*
  PHASE 1E 후속: 지금 열려 있는 POST가 "명시적인 관리 진입"으로
  legacy 상세(#postDetail + edit/delete)를 연 상태인지.

  categorySkinActive / bannerSkinActive와 같은 역할이고 같은 이유로
  여기(공용 상태 모듈)에 있다 — posts-view-detail.js가 매 진입마다
  설정하고, posts-list-detail-nav.js의 관리 토글이 "다음에 어느
  쪽으로 갈지"를 이 값 하나로 정한다.

  false면 평소의 읽기 화면이다(스킨이 그렸거나, 스킨이 없어 legacy로
  폴백했거나). 소유자든 방문자든 일반 탐색은 항상 이 상태로 들어온다.
*/

let postManageScreenActive =
  false;


let currentEditorMode =
  null;


/*
  "richtext"(기본) 또는 "html".
  html이면 리치텍스트 에디터/툴바/프리뷰(발췌) 대신
  raw HTML textarea 하나만 쓴다.
*/

let editorContentMode =
  "richtext";

let editorSourcePostId =
  null;


/*
  "public"(기본) / "secret"(비밀글) / "private"(비공개).
  postEditorSecretToggle / postEditorPrivateToggle 두 버튼이
  이 값 하나를 서로 배타적으로 바꾼다.
*/

let editorPostVisibility =
  "public";


/*
  글을 열었을 때 이미 secret이었는지(=이미 저장된
  비밀번호 해시가 있는지). 저장 시 "secret인데 비밀번호
  칸이 비어있음"을 에러로 볼지(신규) 아니면 기존 비밀번호
  유지로 볼지(이미 있던 비밀글) 구분하는 데 씀.
*/

let editorPostHadSecretPassword =
  false;


let postStyleSettings =
  null;


/*
  contenteditable에서 마지막으로 잡은 선택영역.

  툴바나 컬러피커를 눌렀을 때
  선택이 풀리는 문제를 막기 위해 저장함.
*/

let savedEditorRange =
  null;


let postCurtainAnimation =
  null;

/* =========================================================
   PREVIEW PAGE STATE
========================================================== */

let editorPreviewPages =
  [];


let editorPreviewPageIndex =
  0;

/* =========================================================
   MOBILE PREVIEW SCALE

   applyEditorPreviewScale

   -> posts-preview.js 로 이동함.
========================================================== */



/* =========================================================
   POST TRANSITION / POST TRANSITION OUT

   showPostArea, hidePostAreaCurtain

   -> posts-view.js 로 이동함.
========================================================== */





/* =========================================================
   VIBE PRESET / HIGHLIGHT / ACTION-DIALOGUE / BODY STYLE / RENDER POST

   loadPostStylePreset, getPresetHighlightColor,
   getSafeHighlightColor, updatePresetHighlightSwatch,
   updateCustomHighlightSwatch, replaceActionDialogueTextNode,
   applyActionDialogueStyles, applyPostBodyStyles,
   renderStyledPostContentInto, renderStyledPostContent

   -> posts-style.js 로 이동함.

   SAFE HTML (sanitizeRichNode 등) -> posts-sanitize.js 로 이동함.
========================================================== */



/* =========================================================
   DATE

   formatPostListDate / formatPostDetailDate

   -> posts-format.js 로 이동함.
========================================================== */



/* =========================================================
   MENU
========================================================== */

function closePostMenu() {

  menuPanel?.classList.remove(
    "open"
  );


  menuButton?.classList.remove(
    "open"
  );


  menuButton?.setAttribute(
    "aria-expanded",
    "false"
  );

}



/* =========================================================
   AUTH
========================================================== */

async function getSignedInUser() {

  const {
    data,
    error
  } =
    await supabaseClient
      .auth
      .getUser();


  if (
    error ||
    !data?.user
  ) {

    return null;

  }


  return data.user;

}


/* =========================================================
   isSiteOwnerSignedIn() -> Promise<boolean>   (PHASE 1E)

   "지금 로그인한 사람이 **이 사이트의** 주인인가". 소유자 전용
   진입점(글쓰기 +, 배너 편집 토글)을 보여줄지 판단하는 단일
   지점이다.

   원래 이 자리들은 getSignedInUser()의 결과만 보고 "로그인했으면
   주인"으로 취급했다 — 다중 사용자 배포에서는 다른 계정으로
   로그인한 방문자에게도 관리 진입점이 보인다는 뜻이다(실제 쓰기는
   RLS가 막으므로 데이터가 새지는 않지만, 눌러도 실패하는 버튼을
   남에게 보여주는 셈이다). 여기서 slug로 해석한 실제 소유자와
   비교해 그 표시를 바로잡는다.

   getSiteOwner()가 unscoped(= URL에 slug segment가 없는 레거시/
   단일 사용자 배포)를 돌려주면 비교할 대상이 없으므로 기존
   동작(로그인했으면 주인)을 그대로 유지한다.

   ★ 이 함수는 "UI를 보여줄지"만 정한다. 실제 작성/수정/삭제
   권한은 여전히 각 쿼리의 user_id 필터와 RLS가 강제한다 —
   이 값을 true로 속여도 남의 데이터를 건드릴 수 없다.

   의존: getSiteOwner(home/site-owner.js) — index.html이 posts
   모듈보다 먼저 로드한다.
========================================================== */

async function isSiteOwnerSignedIn() {

  let owner;
  let user;

  try {

    [
      owner,
      user
    ] =
      await Promise.all([
        getSiteOwner(),
        getSignedInUser()
      ]);

  } catch (err) {

    console.error(
      "[posts-state] isSiteOwnerSignedIn failed",
      err
    );

    return false;

  }


  if (!user) {

    return false;

  }


  if (
    !owner ||
    !owner.scoped
  ) {

    return true;

  }


  return owner.ownerId === user.id;

}



