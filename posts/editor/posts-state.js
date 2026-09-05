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



