/* =========================================================
   POSTS VIEW - NEW / EDIT / CANCEL EDITOR

   posts-view.js 분할본 중 마지막. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 새 글 에디터 열기, 기존 글 수정용 에디터 열기
   (본문은 post_contents에서 따로 불러옴), 편집 취소.
========================================================== */


/*
  FOLDER-3: 지금 작성 폼이 어느 폴더에서 시작됐는지. ?write=1 주소로
  곧장 들어온 경우에는 "진입 전 화면"이 이 세션에 없어서
  (rememberPlatformScreenReturn을 건너뛴다) 취소했을 때 돌아갈 자리를
  이 값으로 정한다 — 없으면 지금까지처럼 그 카테고리로 간다.
*/

let composeOriginFolderId =
  null;


/* =========================================================
   NEW EDITOR

   카테고리의 + 버튼과 스킨의 WRITE(?write=1)가 전부 여기로
   모인다 — 목록도 선택 화면도 거치지 않는다. 어느 카테고리에
   쓸지는 폼 안의 CATEGORY 드롭다운에서 바꾼다.

   updateUrl: 진입 주소를 /:slug/category/:id?write=1로 남길지.
   라우터가 이미 그 주소로 들어온 경우(직접 접속/새로고침/
   뒤로가기)에는 false로 불러 같은 항목을 두 번 쌓지 않는다.
========================================================== */

async function openNewPostEditor(
  categoryId,
  options = {}
) {

  const {
    updateUrl = true,

    /*
      FOLDER-3: 폴더 페이지에서 WRITE를 눌렀으면 그 폴더가 미리
      골라진 채로 열린다 — 카테고리만 맞고 폴더는 root였던
      예전 동작을 대체한다(posts/view/posts-view-compose.js).
    */

    folderId = null
  } = options;


  const user =
    await getSignedInUser();


  if (!user) {

    alert(
      "로그인이 필요합니다."
    );

    return;

  }


  /*
    들어오기 직전 화면(스킨 HOME/CATEGORY/POST)과 스크롤을
    기억해 둔다 — 취소하면 여기로 돌아온다. 이미 기록해 둔
    진입 지점이 있으면 덮어쓰지 않는다
    (rememberPlatformScreenReturn의 guard).

    updateUrl이 false면 라우터가 ?write=1 주소로 들어온 것이라
    "진입 전 화면"이 이 세션에 없다 — 그 주소를 복귀 지점으로
    기억하면 취소해도 ?write=1이 그대로 남는다. 그때는 기록하지
    않고 cancelPostEditor()의 fallback(그 카테고리)으로 간다.
  */

  if (updateUrl) {

    rememberPlatformScreenReturn();

  }


  /*
    스킨 mount contract를 걷어내고 커튼 없이 #postArea를 연다 —
    이 두 줄이 없으면 에디터가 프레임 폭/여백 없이 그려지고,
    소유자 도구 알약이 빈 껍데기로 남는다(posts-view-transition.js).
  */

  enterPlatformScreen();

  hideOtherPostScreens();


  currentPostView =
    "editor";


  currentEditorMode =
    "create";


  editorSourcePostId =
    null;


  composeOriginFolderId =
    folderId
      ? Number(
          folderId
        )
      : null;


  currentPostCategoryId =
    categoryId
      ? Number(
          categoryId
        )
      : currentPostCategoryId;


  if (postEditor) {

    postEditor.hidden =
      false;

  }


  document.body.classList.add(
    "post-editor-mode"
  );


  closePostMenu();


  /*
    새 글에는 삭제할 대상이 없다 — 삭제 버튼은 수정 폼에서만
    보인다(posts/editor/posts-list-detail-nav.js).
  */

  if (postEditorDeleteButton) {

    postEditorDeleteButton.hidden =
      true;

  }


  postListEditModeOn =
    false;


  postPageTitle.textContent =
    "NEW POST";


  postEditorTitle.value =
    "";


  clearRichEditor();


  resetEditorOOC();


  resetEditorVisibility();


  /* 새 글에는 사진이 없다. 이전 글에서 고르다 만 파일과 미리보기가
     남지 않게 비운다(posts/editor/posts-body-images.js). */

  resetPostBodyImages();


  if (
    postEditorHtmlContent
  ) {

    postEditorHtmlContent.value =
      "";

  }


  setEditorContentMode(
    "richtext"
  );


  await loadPostEditorCategories(
    categoryId
  );


  /*
    FOLDER-3: 이 카테고리의 폴더 목록을 채우고, 폴더 페이지에서
    들어왔으면 그 폴더를 미리 고른다. 새 글은 "원래 있던 폴더"가
    없으므로 출처는 항상 root(null)다 — 저장할 때 고른 폴더와
    비교해 옮길지 정한다(posts/editor/format/posts-editor-folder.js).
  */

  await loadPostEditorFolders(
    categoryId,
    folderId
  );


  setPostEditorFolderSource(
    null
  );


  await prepareEditorUI();


  /*
    새 글은 프리셋 오버라이드 없이 시작(사이트 전역 "사용 중"
    프리셋을 그대로 따라감) — prepareEditorUI의 loadPostStylePreset()이
    이미 그 값을 postStyleSettings에 채워뒀으므로 드롭다운만
    "없음"으로 맞춘다.
  */

  if (
    postEditorPresetSelect
  ) {

    postEditorPresetSelect.value =
      "";

  }


  /*
    주소를 작성 화면과 일치시킨다 — 새로고침/뒤로가기/앞으로가기
    어디서든 라우터가 이 주소를 보고 같은 작성 폼을 다시 연다
    (posts/editor/posts-router-init.js). 카테고리가 정해지지 않은
    상태(글 카테고리가 없는 예외)에서는 HOME 작성 주소를
    유지한다.

    FOLDER-3: 폴더에서 들어온 작성은 그 폴더의 주소를 남긴다
    (/category/:cid/folder/:fid?write=1) — 새로고침·뒤로가기·앞으로
    가기 어디서 다시 들어와도 같은 폴더가 미리 골라진 폼이 열린다.
  */

  if (updateUrl) {

    const composePath =
      currentPostCategoryId
        ? (
            folderId
              ? buildPostRoute(
                  `/category/${currentPostCategoryId}/folder/${Number(folderId)}`
                )
              : buildPostRoute(
                  `/category/${currentPostCategoryId}`
                )
          )
        : buildPostRoute(
            "/"
          );


    history.pushState(
      {
        page: "compose",

        categoryId:
          currentPostCategoryId,

        folderId:
          folderId
            ? Number(folderId)
            : null
      },
      "",
      buildSiteComposeUrl(
        composePath
      )
    );

  }


  /*
    "저장하지 않은 입력"을 판단하는 기준점 — 지금 막 채운 값이
    곧 "아직 아무것도 안 쓴 상태"다(posts-view-transition.js의
    복귀 경로와 posts-router-init.js의 뒤로가기 가드가 쓴다).
  */

  capturePostEditorSnapshot();


  postEditorTitle.focus();

}



/* =========================================================
   EDIT EDITOR

   스킨 POST 위에 떠 있는 edit 버튼과 ?edit=1 주소가 여기로
   온다 — 옛 상세 화면을 한 번 그렸다가 다시 폼을 여는 중간
   단계를 만들지 않는다.

   글 주인이 아니면(로그아웃/다른 계정/주소 직접 입력) 폼을 열지
   않고 주소에서 ?edit=1을 지운 뒤 평소의 읽기 화면으로 돌려보낸다
   — 실제 수정 권한은 여전히 저장 시점의 user_id 필터와 RLS가
   강제한다.
========================================================== */

async function openPostEditor(
  postId,
  options = {}
) {

  const {
    updateUrl = true
  } = options;


  const user =
    await getSignedInUser();


  if (!user) {

    await leavePostEditRequest(
      postId
    );

    return;

  }


  const {
    data: post,
    error
  } =
    await supabaseClient
      .from(
        "posts"
      )
      .select(
        `
        id,
        user_id,
        category_id,
        folder_id,
        title,
        content_type,
        visibility,
        quote_preset_id
        `
      )
      .eq(
        "id",
        postId
      )
      .maybeSingle();


  if (
    error ||
    !post
  ) {

    console.error(
      error
    );


    await leavePostEditRequest(
      postId
    );


    return;

  }


  if (
    post.user_id !==
      user.id
  ) {

    await leavePostEditRequest(
      postId
    );


    return;

  }


  /*
    본문(content/ooc_content)은 posts가 아니라
    post_contents에 따로 있음(비밀글의 "제목은 보이되
    본문만 숨기기"를 DB RLS로 구현하려고 분리함).

    ooc_content는 테이블에서 직접 SELECT할 수 없다 —
    anon/authenticated 어느 역할에도 그 컬럼의 SELECT
    GRANT가 없다(supabase/migrations/
    20260909100000_lock_down_post_contents_ooc.sql).
    소유자만 본문 + OOC를 받는 SECURITY DEFINER RPC로
    읽는다. 함수가 auth.uid()로 소유권을 다시 확인하므로
    비소유자에게는 0행(null)이 온다.
  */

  const {
    data: postContent,
    error: postContentError
  } =
    await supabaseClient
      .rpc(
        "get_own_post_content",
        {
          p_post_id:
            post.id
        }
      )
      .maybeSingle();


  if (postContentError) {

    console.error(
      postContentError
    );

  }


  post.content =
    postContent?.content ||
    "";


  post.ooc_content =
    postContent?.ooc_content ||
    "";


  /*
    들어오기 직전 화면(스킨 POST)과 스크롤을 기억해 둔다 —
    취소하면 여기로 돌아온다(posts-view-transition.js).
    updateUrl이 false면 ?edit=1 주소로 곧장 들어온 것이라 기록할
    진입 전 화면이 없다(openNewPostEditor의 같은 guard 참고).
  */

  if (updateUrl) {

    rememberPlatformScreenReturn();

  }


  currentPostView =
    "editor";


  currentEditorMode =
    "edit";


  /* 수정은 폴더에서 시작한 작성이 아니다 — 직전 값을 지운다. */

  composeOriginFolderId =
    null;


  editorSourcePostId =
    Number(
      post.id
    );


  currentPostId =
    Number(
      post.id
    );


  currentPostCategoryId =
    post.category_id
      ? Number(
          post.category_id
        )
      : null;


  currentPostOwnerId =
    post.user_id ||
    null;


  /*
    스킨 mount contract를 걷어내고 커튼 없이 #postArea를 연다 —
    openNewPostEditor()와 같은 이유다(posts-view-transition.js).
  */

  enterPlatformScreen();

  hideOtherPostScreens();


  if (postEditor) {

    postEditor.hidden =
      false;

  }


  document.body.classList.add(
    "post-editor-mode"
  );


  closePostMenu();


  /*
    삭제는 수정 폼 안에 있다 — 스킨 POST에서 옛 상세 화면을 거쳐야
    삭제할 수 있었던 동선을 없앤 자리다(요청서 1절). 실제 확인
    창/삭제 로직/삭제 후 이동은 기존 것을 그대로 쓴다
    (posts/editor/posts-list-detail-nav.js).
  */

  if (postEditorDeleteButton) {

    postEditorDeleteButton.hidden =
      false;

  }


  postListEditModeOn =
    false;


  postPageTitle.textContent =
    "EDIT POST";


  await loadPostEditorCategories(
    post.category_id
  );


  /*
    FOLDER-3: 이 글이 지금 들어 있는 폴더를 그대로 고른 채로 연다.
    출처를 따로 기억해 두는 이유는 저장할 때 "바뀌었을 때만"
    move_tree_node()를 부르기 위해서다 — 폴더를 건드리지 않은 저장이
    그 글의 컨테이너 안 순서를 맨 위로 끌어올리면 안 된다
    (posts/editor/format/posts-editor-folder.js).
  */

  await loadPostEditorFolders(
    post.category_id,
    post.folder_id
  );


  setPostEditorFolderSource(
    post.folder_id
  );


  postEditorTitle.value =
    post.title ||
    "";


  setEditorVisibility(
    post.visibility ||
    "public"
  );


  editorPostHadSecretPassword =
    post.visibility ===
    "secret";


  /*
    비밀번호는 절대 다시 불러와서 보여주지 않음(애초에
    해시라서 원문을 알 방법도 없음). 비워두면 "기존
    비밀번호 유지"로 저장 시 처리된다.
  */

  if (
    postEditorSecretPassword
  ) {

    postEditorSecretPassword.value =
      "";

  }


  if (
    postEditorOOC
  ) {

    postEditorOOC.value =
      post.ooc_content ||
      "";


    postEditorOOC.hidden =
      !post.ooc_content;


    postEditorOOCToggle
      ?.setAttribute(
        "aria-expanded",
        String(
          Boolean(
            post.ooc_content
          )
        )
      );

  }


  /*
    GALLERY-1이 자동 생성해 저장해 둔 예전 갤러리 본문을 공통
    에디터로 되돌린다.

    그때는 사진 목록으로 본문 HTML을 만들어 content_type을 'html'로
    저장했다 — 그대로 열면 사진 대신 <img> 태그 글자가 보이는 raw
    HTML 칸이 뜬다. 그 본문은 "<p><img ...></p>가 이어붙은 것"
    외에는 아무것도 아니므로, 그 모양일 때만 리치텍스트로 연다.
    저장된 데이터는 건드리지 않고 **여는 방식만** 바꾸는 것이라,
    사진도 순서도 그대로 남고 사용자가 그 위에 글을 덧쓸 수 있다
    (요구사항 2절 "기존 글의 이미지는 ... 유실되면 안 된다").

    사람이 직접 쓴 HTML 글은 이 모양과 일치하지 않으므로 지금까지처럼
    HTML 모드로 열린다.
  */

  const isLegacyGeneratedGalleryBody =
    post.content_type === "html" &&
    /^(?:\s*<p>\s*<img src="\/api\/post-cover\?image=[0-9a-f-]{36}" alt="">\s*<\/p>\s*)+$/i
      .test(String(post.content || ""));


  const isHtmlPost =
    post.content_type ===
      "html" &&
    !isLegacyGeneratedGalleryBody;


  setEditorContentMode(
    isHtmlPost
      ? "html"
      : "richtext"
  );


  if (isHtmlPost) {

    if (
      postEditorHtmlContent
    ) {

      postEditorHtmlContent.value =
        post.content ||
        "";

    }

  }

  else {

    /*
      ★ 다른 글(특히 HTML 모드 글)을 편집하다가 넘어오면
      이 textarea에 그 글의 내용이 그대로 남아있을 수
      있어서, 리치텍스트 글을 열 때는 명시적으로 비운다.
      (setEditorContentMode가 hidden 처리는 해도 값 자체를
      지우진 않기 때문에 방어적으로 필요.)
    */

    if (
      postEditorHtmlContent
    ) {

      postEditorHtmlContent.value =
        "";

    }


    /*
      저장된 rich HTML 또는
      예전 legacy 문법을
      에디터에 실제 스타일로 복원.
    */

    setRichEditorContent(
      post.content || ""
    );

  }


  /*
    본문이 편집 영역에 들어간 **뒤에** 사진 정보를 불러온다 —
    대표 사진 표시는 본문 안의 그 <img>에 붙는다
    (posts/editor/posts-body-images.js). await하지 않는다: 사진은
    본문 HTML이 이미 갖고 있어 화면은 이 왕복을 기다릴 이유가 없고,
    한 번의 왕복을 더 기다리면 수정 폼이 그만큼 늦게 열린다.
    도착하면 대표 표시가 채워지고 기준 스냅샷도 다시 찍힌다.
  */

  loadPostBodyImages(
    post.id
  );


  await prepareEditorUI();


  /*
    이 글에 프리셋이 지정돼 있으면(quote_preset_id) 그걸
    최우선으로 불러온다 — prepareEditorUI가 방금 채워둔
    "사이트 전역 활성 프리셋" 기준값 위에 덮어쓰는 것.
    없으면 드롭다운을 "없음"으로 맞춰서 전역 프리셋을
    그대로 따르고 있음을 보여준다.
  */

  if (
    post.quote_preset_id
  ) {

    if (
      postEditorPresetSelect
    ) {

      postEditorPresetSelect.value =
        String(
          post.quote_preset_id
        );

    }


    await applyPostPresetById(
      post.quote_preset_id
    );


    /*
      ★ PREVIEW의 세션 값은 "이 글의 프리셋"에서 시작해야 한다.

      prepareEditorUI()가 이미 한 번 초기화했지만, 그때는 아직
      사이트 전역 활성 프리셋 기준이었다 — 이 글이 자기 프리셋을
      가지고 있으면 제목/출처 표시 기본값이 달라질 수 있다.
      아직 사용자가 아무 것도 건드리기 전인 지금 다시 맞춘다
      (posts/preview/posts-preview-css-vars.js).
    */

    resetPreviewVisibilityOverrides();

  } else if (
    postEditorPresetSelect
  ) {

    postEditorPresetSelect.value =
      "";

  }


  /*
    주소를 수정 화면과 일치시킨다 — 새로고침/뒤로가기/앞으로가기
    어디서든 라우터가 이 주소를 보고 같은 수정 폼을 다시 연다
    (posts/editor/posts-router-init.js).
  */

  if (updateUrl) {

    history.pushState(
      {
        page: "edit",

        postId:
          Number(
            post.id
          )
      },
      "",
      buildSiteEditUrl(
        buildPostRoute(
          `/post/${post.id}`
        )
      )
    );

  }


  capturePostEditorSnapshot();


  postEditorTitle.focus();

}



/* =========================================================
   수정 요청을 처리할 수 없을 때

   ?edit=1은 요청일 뿐이라 작성자가 아니면 폼을 열지 않는다.
   그때 주소에 ?edit=1이 남아 있으면 새로고침할 때마다 같은
   거절을 반복하므로, 쿼리를 지우고 그 글의 평소 읽기 화면으로
   돌려보낸다. 로그아웃 방문자/다른 계정/삭제된 글 모두 같은
   경로다 — 어느 쪽인지 알려주지 않는다.
========================================================== */

async function leavePostEditRequest(
  postId
) {

  history.replaceState(
    {
      page: "post",

      postId:
        Number(
          postId
        )
    },
    "",
    buildPostRoute(
      `/post/${postId}`
    )
  );


  await openPostPage(
    postId,
    {
      updateUrl:
        false
    }
  );

}



/* =========================================================
   저장하지 않은 입력 보호

   에디터를 연 순간의 값(제목/본문/OOC)을 그대로 담아두고,
   나가려 할 때 지금 값과 비교한다. 바뀐 게 없으면 아무것도 묻지
   않고, 바뀌었으면 한 번만 확인한다.

   취소 버튼뿐 아니라 브라우저 뒤로가기(popstate,
   posts/editor/posts-router-init.js)와 탭 닫기(beforeunload)도
   같은 판단을 쓴다 — 작성/수정 화면이 이제 자기 주소를 갖게
   되면서 "뒤로가기 한 번에 쓰던 글이 사라지는" 경로가 실제로
   생겼기 때문이다.
========================================================== */

let postEditorSnapshot =
  null;


function readPostEditorValues() {

  return {

    title:
      postEditorTitle
        ? postEditorTitle.value
        : "",

    content:
      editorContentMode === "html"
        ? (
            postEditorHtmlContent
              ? postEditorHtmlContent.value
              : ""
          )
        : (
            typeof getRichEditorHTML === "function"
              ? getRichEditorHTML()
              : ""
          ),

    ooc:
      postEditorOOC
        ? postEditorOOC.value
        : ""

  };

}


function capturePostEditorSnapshot() {

  postEditorSnapshot =
    readPostEditorValues();

}


function clearPostEditorSnapshot() {

  postEditorSnapshot =
    null;

}


function postEditorHasUnsavedChanges() {

  if (
    !postEditorSnapshot ||
    !postEditor ||
    postEditor.hidden
  ) {

    return false;

  }


  const now =
    readPostEditorValues();


  return (
    now.title !== postEditorSnapshot.title ||
    now.content !== postEditorSnapshot.content ||
    now.ooc !== postEditorSnapshot.ooc ||

    /*
      사진만 바꾸고 나가려는 경우에도 확인 창이 떠야 한다 — 고른
      파일은 아직 어디에도 올라가지 않았고, 대표 지정 변경은
      sanitize된 본문 HTML에 남지 않아 위 비교로는 잡히지 않는다
      (posts/editor/posts-body-images.js).
    */
    (
      typeof postBodyImagesHavePendingChange === "function" &&
      postBodyImagesHavePendingChange()
    )
  );

}


function confirmLeavePostEditor() {

  if (!postEditorHasUnsavedChanges()) {

    return true;

  }


  return confirm(
    "저장하지 않은 내용이 있습니다. 화면을 나갈까요?"
  );

}


window.addEventListener(
  "beforeunload",
  (event) => {

    if (!postEditorHasUnsavedChanges()) {

      return;

    }


    event.preventDefault();


    /* 구형 브라우저 호환 — 문구 자체는 브라우저가 정한다. */

    event.returnValue =
      "";

  }
);



/* =========================================================
   CANCEL EDITOR

   진입 전 스킨 화면과 스크롤 위치로 돌아간다
   (returnToPlatformScreenOrigin, posts-view-transition.js).
   기억된 진입 지점이 없으면(주소를 직접 쳐서 ?write=1 /
   ?edit=1로 바로 들어온 경우) 수정 중이던 글 / 쓰고 있던
   카테고리로 돌아간다.
========================================================== */

async function cancelPostEditor() {

  if (!confirmLeavePostEditor()) {

    return;

  }


  const mode =
    currentEditorMode;


  const postId =
    editorSourcePostId;


  const categoryId =
    currentPostCategoryId;


  /*
    사진을 고르기만 하고 취소했으므로 Storage에는 아무것도 없다 —
    미리보기 URL만 해제한다(임시 파일 정리 문제 자체가 생기지 않는
    설계, posts/editor/posts-body-images.js 상단).
  */

  resetPostBodyImages();


  hidePostEditor();


  await returnToPlatformScreenOrigin(
    mode === "edit" && postId
      ? {
          view: "post",
          postId,
          categoryId
        }
      : (
          categoryId
            ? {
                /*
                  FOLDER-3: 폴더에서 시작한 작성을 취소하면 그 폴더로
                  돌아간다 — 카테고리로 떨어뜨리면 보고 있던 자리를
                  잃는다.
                */

                view:
                  composeOriginFolderId
                    ? "folder"
                    : "category",

                postId: null,
                categoryId,

                folderId:
                  composeOriginFolderId
              }
            : null
        )
  );

}
