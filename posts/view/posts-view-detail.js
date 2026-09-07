/* =========================================================
   POSTS VIEW - POST PAGE (상세) / 본문 렌더

   posts-view.js 분할본. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 글 상세 화면 열기(openPostPage), HTML 모드/리치텍스트
   본문 렌더링(renderPostDetailBody).
========================================================== */


/* =========================================================
   POST PAGE - published Skin 시도 (Slice 1C-F)

   skin/skin-post.js의 renderPublishedSkinPost()를
   posts-view-detail.js(classic script)가 폴링 없이 넘겨받도록
   index.html이 선언해 둔 window.skinPostReady 핸드셰이크를 쓴다
   (posts-view-list.js의 tryRenderPublishedSkinCategory와 동일한
   패턴).

   이 함수는 절대 throw하지 않는다 — 실패하면 항상 false를
   반환해서 openPostPage()가 기존 legacy #postDetail 렌더를
   그대로 진행하게 한다.

   PHASE 1E 후속: 소유자 본인도 여기서 POST 스킨을 본다. 예전에는
   "로그인한 사람이 이 사이트의 주인이면 스킨을 통째로 건너뛴다"는
   분기가 이 함수 안에 있었다 — 수정/삭제 버튼이 legacy #postDetail
   안에 있어서였다. 그 결과 소유자만 자기 글을 방문자와 다른 화면으로
   읽게 됐다. 이제 CATEGORY/BANNER와 같은 원칙을 쓴다: 화면을 가르는
   기준은 "누가 보는가"가 아니라 "무엇을 하려고 들어왔는가"다. 기존
   관리 화면(legacy 상세 + edit/delete)은 명시적인 관리 진입
   (?manage=1 또는 스킨 위에 떠 있는 관리 토글)일 때만 열리고, 그
   판단은 호출자인 openPostPage()가 한다 — 이 함수는
   tryRenderPublishedSkinCategory와 마찬가지로 "누가 보고 있는가"를
   전혀 모른다.
========================================================== */

async function tryRenderPublishedSkinPost(
  postId,
  container
) {

  let owner;

  try {

    owner =
      await getSiteOwner();

  } catch (err) {

    console.error(
      "[posts-view-detail] getSiteOwner failed",
      err
    );

    return false;

  }


  if (
    !owner ||
    !owner.scoped ||
    !owner.ownerId
  ) {

    return false;

  }


  let renderPublishedSkinPost;

  try {

    renderPublishedSkinPost =
      await window.skinPostReady;

  } catch (err) {

    console.error(
      "[posts-view-detail] skin-post module failed to load",
      err
    );

    return false;

  }


  try {

    return await renderPublishedSkinPost({
      ownerId: owner.ownerId,
      postId,
      container
    });

  } catch (err) {

    console.error(
      "[posts-view-detail] renderPublishedSkinPost threw unexpectedly",
      err
    );

    return false;

  }

}



/* =========================================================
   POST PAGE

   postPageRequestSeq: openCategoryPage()의 categoryPageRequestSeq와
   동일한 목적 — 빠른 연속 클릭/뒤로가기로 이 글보다 나중에 시작된
   호출이 먼저 끝나버리면, 이 글의 늦게 도착한 응답이 최신 화면을
   덮어쓰지 않도록 순번으로 막는다(posts-view-list.js에 이미 있던
   패턴을 POST에도 동일하게 적용).
========================================================== */

let postPageRequestSeq =
  0;


/*
  postSecretGate는 legacy #postDetail 안에 선언된 고정 DOM인데,
  Skin 경로에서는 Skin의 post-body region 안으로 옮겨진다
  (showPostSecretGate). 그 상태로 Skin 컨테이너를 비우면 이 노드가
  통째로 사라져 다음 글에서 쓸 수 없게 되므로, 컨테이너를 비우기
  직전에 반드시 원래 자리로 되돌려야 한다 — 그 한 줄짜리 규칙을
  세 호출 지점(비-후보 즉시 정리 / 조회 실패 / Skin 확정)이
  공유한다.
*/

function restorePostSecretGateToLegacyDetail() {

  if (
    postDetail &&
    postSecretGate &&
    postSecretGate.parentNode !==
      postDetail
  ) {

    postDetail.appendChild(
      postSecretGate
    );

  }

}


async function openPostPage(
  postId,
  options = {}
) {

  const {
    updateUrl = true
  } = options;


  /*
    PHASE 1D: published Skin 후보인지 먼저 가볍게 확인한다
    (getSiteOwner()는 메모이즈돼 있어 HOME 로드 이후엔 사실상
    즉시 resolve된다) — 아래에서 legacy #postDetail을 "loading..."
    상태로 바로 열어젖힐지, 아니면 이전 화면(HOME이거나 카테고리
    목록이거나 이전 글)을 그대로 둔 채 조용히 기다릴지를 가른다.
    실제로 이 글이 Skin으로 렌더될지는 아래 tryRenderPublishedSkinPost가
    최종 판정하고 그 결과로 다시 정확히 바로잡는다 — 이 fetch는
    바로 아래 posts 조회에도 필요해서(owner.scoped 필터) 앞당긴
    것뿐, 새로 추가된 네트워크 요청이 아니다.

    openCategoryPage()와 동일하게 showPostArea()보다 먼저 읽는다 —
    "커튼을 칠지 말지"를 이 값이 결정하기 때문이다.
  */

  const owner =
    await getSiteOwner();


  const skinRouteCandidate =
    Boolean(
      owner.scoped &&
      owner.ownerId
    );


  /*
    POST에는 더 이상 별도의 "관리 화면"이 없다. 예전에는 소유자가
    ?manage=1로 옛 상세 화면(legacy #postDetail + edit/delete)을 열고
    거기서 다시 수정 버튼을 눌러야 했는데, 실사용자가 그 버튼을
    누르는 이유는 고치기 위해서라 이제 곧장 수정 폼(?edit=1,
    posts/view/posts-view-editor-load.js)으로 간다. 그래서 이 화면은
    "누가 보든 같은 읽기 화면"이고, 스킨을 그릴지 여부만 남는다.

    ?manage=1이 붙은 옛 주소로 들어와도 여기서는 그냥 무시된다 —
    아래 pushState가 쿼리 없는 주소로 정리하므로 새로고침해도
    같은 읽기 화면이 나온다.
  */

  const maybeSkinCandidate =
    skinRouteCandidate;


  /*
    PHASE 1D 전환 정리: Skin 후보가 아닐 때만 기존처럼 지금 바로
    흰색 커튼을 친다. 후보면 이 시점엔 아무것도 하지 않고 이전
    화면(HOME/카테고리/이전 글)을 그대로 둔 채 기다렸다가, 아래
    usingSkinPost 확정 지점에서 revealPostArea()로 한 번에
    교체한다 — 다 그려진 화면 위로 흰 배경이 페이드인했다가
    걷히는 군더더기 전환(실사용자 리포트)을 없앤다. 응답이 오래
    걸릴 때만 작은 스피너(schedulePendingIndicator)가 잠깐 뜬다.
  */

  const comingFromHome =
    currentPostView ===
      "home";


  if (
    comingFromHome &&
    !maybeSkinCandidate
  ) {

    await showPostArea();

  }


  currentPostView =
    "post";


  currentPostId =
    Number(
      postId
    );


  const requestId =
    ++postPageRequestSeq;


  closePostMenu();


  /*
    Skin 후보면 이전 화면(카테고리 Skin 목록)을 아래 확정
    지점까지 그대로 유지한다 — 여기서 미리 숨기면 #postArea가
    빈 흰 화면이 된 채로 응답을 기다리게 된다.
  */

  if (
    postList &&
    !maybeSkinCandidate
  ) {

    postList.hidden =
      true;

  }


  hidePostEditor();


  const pendingIndicatorTimer =
    maybeSkinCandidate
      ? schedulePendingIndicator(
          () =>
            requestId ===
            postPageRequestSeq
        )
      : null;


  /*
    후보가 아니면 기존 그대로 즉시 legacy 상세 화면을 연다.

    후보면 결과를 알기 전까지는 postDetail을 계속 hidden으로
    묶어 둔다(직전 화면이 이 postDetail 자체였더라도) — 그 안의
    title/date/content를 아래에서 바로 "loading..."/빈 값으로
    덮어써버리므로, hidden을 안 강제하면 "직전 글의 그림/날짜에
    엉뚱한 loading 제목"이 섞인 어중간한 화면이 잠깐 보일 수
    있다. 대신 커튼(showPostArea) 배경만 보이는 중립 상태로
    기다리다 아래 usingSkinPost 확정 지점에서 최종 화면으로
    한 번에 교체한다 — 뒤로가기 헤더+"loading..."가 잠깐
    나타났다 사라지는 깜빡임을 없앤다.
  */

  if (postDetail) {

    postDetail.hidden =
      maybeSkinCandidate;

  }


  if (postAddButton) {

    postAddButton.hidden =
      true;

  }


  if (
    bannerEditToggleButton
  ) {

    bannerEditToggleButton.hidden =
      true;

  }


  /*
    글 목록 편집(선택 삭제) 버튼은 카테고리 목록에서만
    보여야 하는데, updatePostAddButton은 openCategoryPage에서만
    불려서 여기(글 뷰어)로 넘어와도 이전 상태(visible)가
    그대로 남아있었다.
  */

  if (
    postListEditToggleButton
  ) {

    postListEditToggleButton.hidden =
      true;

  }


  /*
    PHASE 1E 후속: 관리 토글은 아래 확정 지점에서 "이 글의 주인이
    보고 있고, 스킨으로 그려졌거나 관리 진입으로 열렸을 때"만 다시
    켠다 — 매 진입마다 여기서 한 번 끈다.
  */

  if (
    postManageToggleButton
  ) {

    postManageToggleButton.hidden =
      true;

  }


  postListEditModeOn =
    false;


  if (
    postListSelectBar
  ) {

    postListSelectBar.hidden =
      true;

  }


  if (postPageTitle) {

    postPageTitle.textContent =
      "";

  }


  if (postDetailTitle) {

    postDetailTitle.textContent =
      "loading...";

  }


  if (postDetailDate) {

    postDetailDate.textContent =
      "";

  }


  if (postDetailContent) {

    postDetailContent.textContent =
      "";

  }


  hideReaderFontScaleControl();


  if (postDetailActions) {

    postDetailActions.hidden =
      true;

  }


  if (postRelated) {

    postRelated.hidden =
      true;

  }


  if (
    postSecretGate
  ) {

    postSecretGate.hidden =
      true;

  }


  if (
    postDetailContentWrap
  ) {

    postDetailContentWrap.hidden =
      false;

  }


  currentPostBodyMountTarget =
    null;


  /*
    PHASE 1C-F: 이전 글이 Skin 경로로 그려졌다면 postSecretGate가
    그 Skin 컨테이너 안에 들어가 있다 — 매 진입마다 legacy
    #postDetail 소속으로 되돌려 둬야 이전 Skin 컨테이너가 지워질 때
    미아가 되지 않는다(이번 글이 다시 Skin 경로를 타면
    showPostSecretGate가 bodyRegion 안으로 옮긴다).

    단 Skin 후보일 때는 이 정리(그리고 postSkinContainer 비우기)를
    아래 usingSkinPost 확정 지점까지 미룬다 — 여기서 미리 지우면
    응답을 기다리는 동안 이전 화면이 빈 흰 화면으로 바뀐다. 확정
    지점은 어차피 postSkinContainer.innerHTML을 통째로 갈아치우므로
    "매 진입마다 한 번" 이라는 보장은 그대로 유지된다.
  */

  if (!maybeSkinCandidate) {

    restorePostSecretGateToLegacyDetail();


    if (
      postSkinContainer
    ) {

      postSkinContainer.hidden =
        true;

      postSkinContainer.innerHTML =
        "";

    }

  }


  /*
    후보가 아니면(비-scoped/legacy 배포) 이전 글이 Skin 경로로
    그려졌을 수 있으므로 매 진입마다 우선 되돌려 둔다 — 기존과
    동일.

    후보면 반대로 미리 붙여 둔다 — 이전 글이 무엇이었든 뒤로가기
    헤더가 잠깐 나타났다 사라지는 깜빡임 없이 곧장 최종 화면(Skin
    성공 시 그대로, 실패 시 아래 usingSkinPost 확정 지점에서 다시
    벗겨낸다)으로 이어지게 한다.
  */

  if (postContainer) {

    postContainer.classList.toggle(
      "post-container--skin-active",
      maybeSkinCandidate
    );

  }

  postArea?.classList.toggle(
    "post-area--skin-active",
    maybeSkinCandidate
  );


  /*
    PHASE 1E 후속: 떠 있는 소유자 도구는 직전 화면(카테고리/배너
    스킨)에서 켜져 있었을 수 있다 — 이번 글의 확정 지점에서 다시
    판단하므로 진입 시 한 번 끈다.
  */

  if (postContainer) {

    postContainer.classList.remove(
      "post-container--owner-tools"
    );

  }


  let post =
    null;

  let error =
    null;


  if (
    owner.scoped &&
    !owner.ownerId
  ) {

    error = null;

  }

  else {

    let postQuery =
      supabaseClient
        .from(
          "posts"
        )
        .select(
          `
          id,
          category_id,
          user_id,
          title,
          content_type,
          visibility,
          created_at,
          quote_preset_id
          `
        )
        .eq(
          "id",
          postId
        );


    if (owner.scoped) {

      postQuery =
        postQuery.eq(
          "user_id",
          owner.ownerId
        );

    }


    const result =
      await postQuery.maybeSingle();


    post =
      result.data;

    error =
      result.error;

  }


  if (
    error ||
    !post
  ) {

    if (
      requestId !==
      postPageRequestSeq
    ) {

      cancelPendingIndicator(
        pendingIndicatorTimer
      );


      return;

    }


    clearPendingIndicator(
      pendingIndicatorTimer
    );


    console.error(
      error
    );


    /*
      실패 시 오류를 보여주고 돌아갈 수 있는 경로(기존
      post-back-button)를 되살린다 — Skin 후보라 위에서 헤더를
      미리 숨기고 postDetail도 아직 안 열어 뒀을 수 있으므로,
      벗겨내지 않으면 "post not found" 문구조차 보이지 않는다.

      #postArea 자체도 아직 안 열려 있을 수 있다(HOME에서 곧장
      들어온 Skin 후보 경로는 화면이 준비될 때까지 커튼을 미룬다)
      — 여기서 열지 않으면 오류와 뒤로가기 버튼이 통째로 안 보인다.
    */

    if (maybeSkinCandidate) {

      if (postDetail) {

        postDetail.hidden =
          false;

      }


      restorePostSecretGateToLegacyDetail();


      if (postSkinContainer) {

        postSkinContainer.hidden =
          true;

        postSkinContainer.innerHTML =
          "";

      }


      if (postList) {

        postList.hidden =
          true;

      }


      if (postContainer) {

        postContainer.classList.remove(
          "post-container--skin-active"
        );

      }


      postArea?.classList.remove(
        "post-area--skin-active"
      );


      await revealPostArea(
        false
      );

    }


    postDetailTitle.textContent =
      "post not found";


    return;

  }


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
    PHASE 1C-F: published Skin이 이 POST를 지원하면 outer chrome
    (title/category/footer)을 먼저 시도한다 — 실패/미지원/owner
    본인 열람이면 항상 false가 돌아오므로 legacy #postDetail로
    폴백한다(위 tryRenderPublishedSkinPost 참고). 이 지점은 이미
    post row가 확정된 뒤이므로 secret/raw HTML 분기는 전혀
    건드리지 않는다 — 아래에서 본문을 "어디에" mount할지만
    결정한다.

    postSkinContainer에 곧장 렌더하지 않고 떨어진(detached) 스크래치
    엘리먼트에 먼저 그린다 — renderSkin()은 container.innerHTML을
    통째로 다시 그리므로, 이 응답이 늦게 도착했는데 그 사이 더 빠른
    다른 글 클릭이 이미 postSkinContainer에 최신 화면을 그려 둔
    상태라면, 곧장 postSkinContainer에 그렸을 경우 requestId 검사
    이전에 이미 최신 화면을 덮어써버린다. 아래에서 requestId가
    여전히 최신일 때만 이 스크래치 엘리먼트의 내용을 옮긴다 —
    bodyRegion은 실제 DOM 노드를 옮기는(clone 아님) 것이므로 참조는
    그대로 유효하다.
  */

  const skinRenderTarget =
    document.createElement(
      "div"
    );

  /*
    관리 진입으로 연 화면(그리고 애초에 후보가 아닌 배포)에서는
    스킨을 시도하지 않는다 — tryRenderPublishedSkinPost 자신도
    후보가 아니면 false를 돌려주지만, 여기서 걸러 관리 화면이
    쓸데없는 RPC 왕복을 기다리지 않게 한다.
  */

  const skinPostResult =
    maybeSkinCandidate
      ? await tryRenderPublishedSkinPost(
          post.id,
          skinRenderTarget
        )
      : false;


  if (
    requestId !==
    postPageRequestSeq
  ) {

    cancelPendingIndicator(
      pendingIndicatorTimer
    );


    return;

  }


  clearPendingIndicator(
    pendingIndicatorTimer
  );


  const usingSkinPost =
    Boolean(
      skinPostResult &&
      skinPostResult.rendered
    );


  if (postDetail) {

    postDetail.hidden =
      usingSkinPost;

  }


  /*
    Skin 후보 경로는 여기까지 이전 화면을 그대로 유지했다 —
    이제서야 이전 글의 Skin 컨테이너를 비운다. 비우기 직전에
    postSecretGate를 반드시 legacy #postDetail로 되돌린다(위
    helper 주석 참고).
  */

  restorePostSecretGateToLegacyDetail();


  if (
    postList &&
    !postList.hidden
  ) {

    postList.hidden =
      true;

  }


  if (postSkinContainer) {

    postSkinContainer.innerHTML =
      "";


    if (usingSkinPost) {

      while (
        skinRenderTarget.firstChild
      ) {

        postSkinContainer.appendChild(
          skinRenderTarget.firstChild
        );

      }

    }


    postSkinContainer.hidden =
      !usingSkinPost;

  }


  if (postContainer) {

    postContainer.classList.toggle(
      "post-container--skin-active",
      usingSkinPost
    );

  }

  postArea?.classList.toggle(
    "post-area--skin-active",
    usingSkinPost
  );


  /*
    화면이 완성된 지금 한 번에 드러낸다 — Skin이면 커튼 없이,
    legacy 폴백이면 기존 흰색 커튼으로. #postArea가 이미 열려
    있으면(카테고리→글처럼 같은 컨테이너 안 이동) 아무 일도
    일어나지 않는다.
  */

  await revealPostArea(
    usingSkinPost
  );


  currentPostBodyMountTarget =
    usingSkinPost
      ? skinPostResult.bodyRegion
      : null;


  if (usingSkinPost) {

    /*
      Skin의 outer chrome(article)이 post.title/post.categoryName
      등을 이미 data-imory-bind로 그려 뒀다(skin/skin-context.js
      buildPostSkinContext) — legacy #postDetailTitle/
      #postDetailDate는 지금 hidden이므로 건드리지 않는다.
    */

    if (
      postSecretGate &&
      postSecretGate.parentNode !==
        skinPostResult.bodyRegion
    ) {

      skinPostResult.bodyRegion.appendChild(
        postSecretGate
      );

    }

  }

  else {

    applyPostVisibilityTitle(
      postDetailTitle,
      post.visibility,
      post.title
    );


    postDetailDate.textContent =
      formatPostDetailDate(
        post.created_at
      );

  }


  const viewer =
    await getSignedInUser();


  const isOwnerViewing =
    Boolean(
      viewer &&
      viewer.id ===
        post.user_id
    );


  /*
    PHASE 1E 후속 — 소유자 전용 진입점(CATEGORY/BANNER와 같은 방식).

    스킨이 이 글을 그렸다면 legacy 헤더는 mount contract가 통째로
    숨기므로(posts/posts-base.css) 그 안의 관리 토글만 화면 오른쪽
    아래에 떠 있는 플랫폼 도구로 되살린다. 관리 화면을 연 상태에서는
    legacy 헤더가 그대로 보이므로, 같은 버튼이 원래 자리에서 "읽기
    화면으로 돌아가기"가 된다(aria-pressed로 구분).

    판정은 아래 secret 분기와 updatePostOwnerActions()가 이미 쓰는
    "이 글의 주인인가"(isOwnerViewing)와 같은 값이라 조회가 하나도
    늘지 않는다 — 다른 계정으로 로그인한 방문자에게는 어느 쪽도
    보이지 않는다. 실제 수정/삭제 권한은 여전히 각 쿼리의 user_id
    필터와 RLS가 강제한다.

    스킨이 이 글을 그렸을 때만 필요하다 — 스킨을 쓰지 않는(폴백)
    화면에는 legacy #postDetailActions의 edit/delete가 원래 자리에
    그대로 있다.
  */

  if (postManageToggleButton) {

    postManageToggleButton.hidden =
      !(
        isOwnerViewing &&
        usingSkinPost
      );

    postManageToggleButton.setAttribute(
      "aria-pressed",
      "false"
    );

  }


  if (postContainer) {

    postContainer.classList.toggle(
      "post-container--owner-tools",
      usingSkinPost &&
      isOwnerViewing
    );

  }


  if (
    post.visibility ===
      "secret" &&
    !isOwnerViewing
  ) {

    /*
      비밀번호를 맞히기 전엔 본문을 아예 서버에 요청하지도
      않는다(post_contents는 RLS로 어차피 막혀있지만,
      요청 자체를 안 보내는 게 더 깔끔함).
    */

    showPostSecretGate(
      post.id,
      post.content_type,
      post.quote_preset_id
    );

  }

  else {

    const {
      data: postContent,
      error: postContentError
    } =
      await supabaseClient
        .from(
          "post_contents"
        )
        .select(
          "content"
        )
        .eq(
          "post_id",
          post.id
        )
        .maybeSingle();


    if (postContentError) {

      console.error(
        postContentError
      );

    }


    await renderPostDetailBody(
      post.content_type,
      postContent?.content ||
        "",
      post.quote_preset_id
    );

  }


  let categoryName =
    "";


  if (
    post.category_id
  ) {

    const {
      data: category
    } =
      await supabaseClient
        .from(
          "categories"
        )
        .select(
          "name"
        )
        .eq(
          "id",
          post.category_id
        )
        .maybeSingle();


    categoryName =
      category?.name ||
      "";


    postPageTitle.textContent =
      categoryName;

  }


  await updatePostOwnerActions();


  /*
    PHASE 1C-F: "관련 글" 목록은 POST Skin Contract v0.1에
    없는 개념이다(AI_SKIN_PHASE1C_PAGE_CONTRACT.md 6-2절) — Skin이
    outer chrome을 그리는 경로에서는 이 목록이 어차피 화면에
    나오지 않는 legacy #postRelated(hidden) 안에만 채워지므로
    불필요한 조회를 생략한다.
  */

  if (!usingSkinPost) {

    await loadRelatedPosts(
      post.category_id,
      post.id,
      categoryName
    );

  }


  if (updateUrl) {

    history.pushState(
      {
        page:
          "post",

        postId:
          Number(
            post.id
          )
      },
      "",
      buildPostRoute(
        `/post/${post.id}`
      )
    );

  }

}



/* =========================================================
   POST BODY RENDER

   openPostPage(공개/주인이 보는 secret,private)와
   handleSecretGateSubmit(비밀번호 맞힌 뒤)에서 공통으로 씀.
========================================================== */

async function renderPostDetailBody(
  contentType,
  contentText,
  quotePresetId
) {

  /*
    PHASE 1C-F: published Skin의 protected post-body region이
    mount 대상이면(openPostPage/handleSecretGateSubmit이 매번
    currentPostBodyMountTarget을 설정) legacy #postDetailContent
    대신 그 region에 직접 렌더한다. 글자 크기 +/- 컨트롤
    (posts-reader-scale.js)과 HTML 폭 자동 축소
    (posts-view-html-fit.js)는 legacy #postDetail 전용 고정 DOM
    (#postDetailContent/#postDetailContentWrap/#postDetailFontScale)
    만 다루는 chrome 기능이라 Skin 쪽엔 대응하는 자리가 없다 —
    POST Skin Contract v0.1도 이 두 기능을 계약하지 않는다(본문
    표현 자체는 legacy와 동일하게 renderStyledPostContentInto()/
    innerHTML을 그대로 재사용한다).
  */

  if (currentPostBodyMountTarget) {

    const skinBodyTarget =
      currentPostBodyMountTarget;


    if (
      contentType ===
      "html"
    ) {

      skinBodyTarget.classList.add(
        "is-html-content"
      );


      skinBodyTarget.innerHTML =
        contentText ||
        "";

    }

    else {

      skinBodyTarget.classList.remove(
        "is-html-content"
      );


      if (quotePresetId) {

        await loadPostStylePresetById(
          quotePresetId
        );

      } else {

        await loadPostStylePreset();

      }


      renderStyledPostContentInto(
        skinBodyTarget,
        contentText ||
          "",
        postStyleSettings ||
          {}
      );

    }


    return;

  }


  if (
    contentType ===
    "html"
  ) {

    /*
      HTML 모드 글: sanitize/스타일 프리셋 없이
      저장된 HTML을 그대로 출력(HTML 뷰어처럼 보여주는 용도).
    */

    if (
      postDetailContent
    ) {

      postDetailContent.classList.add(
        "is-html-content"
      );


      postDetailContent.innerHTML =
        contentText ||
        "";


      /*
        붙여넣은 HTML이 화면 폭이 고정된 마크업(카톡 대화창
        재현 등)이면 화면보다 넓어져서 잘리거나 깨져 보인다.
        실제 크기를 측정해서 화면에 맞게 축소한다.
      */

      requestAnimationFrame(
        fitHtmlPostContentToViewport
      );

    }


    /*
      HTML 모드는 프리셋 기준 크기라는 게 없어서(원본
      마크업을 그대로 출력) 글자 크기 +/- 대상에서 제외.
    */

    hideReaderFontScaleControl();

  }

  else {

    if (
      postDetailContent
    ) {

      postDetailContent.classList.remove(
        "is-html-content"
      );

    }


    resetHtmlPostContentFit();


    /*
      이 글에 프리셋이 지정돼 있으면(quote_preset_id) 사이트
      전역 "사용 중" 프리셋과 무관하게 그걸 최우선으로 쓴다
      (posts-style-preset.js 참고).
    */

    if (quotePresetId) {

      await loadPostStylePresetById(
        quotePresetId
      );

    } else {

      await loadPostStylePreset();

    }


    renderStyledPostContent(
      contentText ||
        "",
      postStyleSettings ||
        {}
    );


    initReaderFontScaleForCurrentPost();

  }

}



