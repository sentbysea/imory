/* =========================================================
   STUDIO PREVIEW NAVIGATION (PHASE 1C-G)

   "Skin 안의 Preview를 실제 홈페이지처럼 탐색 가능하게 만든다"의
   핵심 구현. Studio는 최종 사용자에게 HOME/CATEGORY/POST를 고르는
   별도 page selector를 주지 않는다(문서 0절) — 사용자는 Preview
   iframe 안의 Skin 자신의 navigation(카테고리 메뉴, 글 목록 링크
   등)을 실제로 클릭해 이동한다. 그 클릭은 iframe(studio/preview/
   preview-bridge.js)이 intercept해서 postMessage
   "preview:navigate"로 href만 올려보내고, 그 메시지를 받은
   studio-preview.js가 이 파일의 handlePreviewNavigateMessage()를
   호출한다 — 실제 route 해석(resolveStudioPreviewTarget, studio/
   preview/preview-route.js)과 페이지 전환은 전부 이 파일의 몫이다.

   이 파일은 studio-preview.js가 이미 로드/선언해 둔 것들에
   의존하는 classic script다(둘 다 최상위 var/let/함수 선언이 같은
   전역 렉시컬 환경을 공유하므로 로드 순서가 서로를 호출하는 데
   문제되지 않는다 — 실제 호출은 항상 window "load" 이후, 즉 두
   파일 모두 이미 평가를 마친 시점에만 일어난다):
   currentWorkingSkin/currentSkinContext/currentOwnerId/
   currentImageSlotNames/currentImageSlotValues(작업 중 draft
   상태), buildStudioHomePreviewSkin()/postRenderToFrame()/
   setStudioPreviewOverlay()/updateStudioCodeButtonState()
   (studio-preview.js). 반대로 studio-preview.js는 이 파일의
   renderCurrentPreviewEntry()/resetPreviewNavigation()/
   handlePreviewNavigateMessage()를 호출한다(mountStudioPreview/
   resetStudioWorkingState/message listener).

   의존(먼저 로드되어야 함): resolveSkinTemplate(skin/
   skin-template.js), buildCategorySkinContext/buildPostSkinContext
   (skin/skin-context.js), resolveStudioPreviewTarget(studio/
   preview/preview-route.js).

   previewHistory 스택 규칙(문서 8/9/10/12절):
   - 최초 진입은 항상 [{type:"home"}] 하나뿐(resetPreviewNavigation).
   - HOME으로 이동하면 스택 전체를 [{type:"home"}]으로 리셋한다
     (로고 등으로 되돌아온 경우 같은 HOME이 중복으로 쌓이지 않게).
   - CATEGORY/POST로 이동하면 push, 단 이미 그 자리에 있으면
     no-op(같은 링크를 다시 눌러도 스택이 늘지 않음).
   - Preview Back은 pop, forward는 없다(browser history API 사용
     안 함) — HOME에서는 뒤로 갈 곳이 없어 컨트롤 자체를 숨긴다.
========================================================== */

const studioPreviewBackButton =
  document.getElementById("studioPreviewBackButton");


let previewHistory =
  [{ type: "home" }];

let previewNavToken =
  0;

let currentPreviewPageType =
  "home";


function updatePreviewBackButtonVisibility() {

  const isHome =
    previewHistory.length <= 1;

  studioPreviewBackButton.hidden =
    isHome;

}


/* =========================================================
   getCurrentPreviewLocation() -> { type, categoryId? , postId? }

   향후 AI가 "지금 보고 있는 page"를 알아야 할 때 쓸 수 있도록
   미리 노출해 두는 최소 API(문서 31절) — 지금은 이 파일 자신의
   중복 push 방지 판정에도 그대로 재사용한다.
========================================================== */

function getCurrentPreviewLocation() {

  const top =
    previewHistory[previewHistory.length - 1];

  if (top.type === "category") {
    return { type: "category", categoryId: top.categoryId };
  }

  if (top.type === "post") {
    return { type: "post", postId: top.postId };
  }

  return { type: "home" };

}

window.getCurrentPreviewLocation =
  getCurrentPreviewLocation;


/* =========================================================
   resetPreviewNavigation() — studio-preview.js의
   resetStudioWorkingState()가 mountStudioPreview() 재진입/Preview
   Shell 숨김 시 호출한다. 스택을 초기 상태로 되돌리고 stale fetch
   가드 토큰을 무효화한다(mountToken과 동일한 패턴).
========================================================== */

function resetPreviewNavigation() {

  previewHistory =
    [{ type: "home" }];

  previewNavToken +=
    1;

  currentPreviewPageType =
    "home";

  updateStudioCodeButtonState();

  updatePreviewBackButtonVisibility();

}


function renderHomePreview() {

  currentPreviewPageType =
    "home";

  updateStudioCodeButtonState();

  updatePreviewBackButtonVisibility();

  setStudioPreviewOverlay(
    "hidden"
  );

  postRenderToFrame(
    {
      skin: buildStudioHomePreviewSkin(currentWorkingSkin),
      context: currentSkinContext
    }
  );

}


/* =========================================================
   CATEGORY — categoryId는 더 이상 "세션 동안 고정된 첫 post형
   카테고리"가 아니라 Skin의 실제 navigation/목록 링크가 가리키는
   임의의 값이다. v0.1은 fetch 결과를 캐시하지 않는다 — 카테고리를
   여러 번 오갈 수 있어 단일 슬롯 캐시가 더 이상 맞지 않고, 이번
   Slice는 정확성/단순함을 성능보다 우선한다(문서 25/26절 "억지로
   복잡하게 만들지 않는다"와 같은 결).
========================================================== */

async function renderCategoryPreviewFor(categoryId) {

  currentPreviewPageType =
    "category";

  updateStudioCodeButtonState();

  updatePreviewBackButtonVisibility();

  if (!currentWorkingSkin) {
    return;
  }

  const categoryTemplate =
    resolveSkinTemplate(currentWorkingSkin, "category");

  if (!categoryTemplate) {

    setStudioPreviewOverlay(
      "unsupported",
      "이 스킨에는 아직 CATEGORY 템플릿이 없습니다."
    );

    return;

  }

  setStudioPreviewOverlay(
    "loading",
    "카테고리 미리보기를 불러오는 중..."
  );

  const token =
    ++previewNavToken;

  let context;

  try {

    context =
      await buildCategorySkinContext(
        currentOwnerId,
        categoryId,
        {
          imageSlotNames: currentImageSlotNames,
          imageSlotValues: currentImageSlotValues
        }
      );

  } catch (err) {

    console.error(
      "[preview-navigation] buildCategorySkinContext failed",
      err
    );

    if (
      token === previewNavToken &&
      getCurrentPreviewLocation().type === "category"
    ) {

      setStudioPreviewOverlay(
        "error",
        "카테고리 미리보기를 불러오지 못했습니다."
      );

    }

    return;

  }

  /*
    stale 응답 — fetch가 끝나기 전에 사용자가 이미 다른 곳으로
    이동했다면 이 결과는 화면에 반영하지 않는다(mountToken과
    동일한 패턴, studio-preview.js 참고).
  */
  if (
    token !== previewNavToken ||
    getCurrentPreviewLocation().type !== "category"
  ) {
    return;
  }

  if (!context) {

    setStudioPreviewOverlay(
      "empty",
      "이 카테고리를 찾을 수 없습니다."
    );

    return;

  }

  if (context.category.type !== "post") {

    /*
      banner 등 v0.1이 계약하지 않는 category type(문서 11절) —
      public 라우트로 나가지 않고 Preview Back만 가능한 unsupported
      상태로 남긴다.
    */

    setStudioPreviewOverlay(
      "unsupported",
      "이 카테고리 유형은 아직 Studio Preview를 지원하지 않습니다."
    );

    return;

  }

  setStudioPreviewOverlay(
    "hidden"
  );

  postRenderToFrame(
    {
      skin: categoryTemplate,
      context
    }
  );

}


/* =========================================================
   POST — outer chrome만 렌더한다(문서 14절). 실제 본문(Quote
   Preset/raw HTML/secret gate)은 이번 Slice에서 mount하지 않는다 —
   owner-authenticated fetch + secret gate + Quote Preset Renderer를
   Studio Preview(iframe 너머 postMessage 경계) 안으로 안전하게
   다시 끌어오는 결합도가 이번 Slice 범위에 비해 크다고 판단했다
   (완료 보고에 명시, 문서 14절 "억지로 복잡하게 만들지 마세요").
   post-body region은 항상 비어 있는 protected placeholder로만
   남는다 — skin-render.js의 applySkinRegion()이 이미 그렇게
   동작한다(별도 코드 불필요, PHASE1C 7절 계약 그대로).
========================================================== */

async function renderPostPreviewFor(postId) {

  currentPreviewPageType =
    "post";

  updateStudioCodeButtonState();

  updatePreviewBackButtonVisibility();

  if (!currentWorkingSkin) {
    return;
  }

  const postTemplate =
    resolveSkinTemplate(currentWorkingSkin, "post");

  if (!postTemplate) {

    setStudioPreviewOverlay(
      "unsupported",
      "이 스킨에는 아직 POST 템플릿이 없습니다."
    );

    return;

  }

  setStudioPreviewOverlay(
    "loading",
    "글 미리보기를 불러오는 중..."
  );

  const token =
    ++previewNavToken;

  let context;

  try {

    context =
      await buildPostSkinContext(
        currentOwnerId,
        postId,
        {
          imageSlotNames: currentImageSlotNames,
          imageSlotValues: currentImageSlotValues
        }
      );

  } catch (err) {

    console.error(
      "[preview-navigation] buildPostSkinContext failed",
      err
    );

    if (
      token === previewNavToken &&
      getCurrentPreviewLocation().type === "post"
    ) {

      setStudioPreviewOverlay(
        "error",
        "글 미리보기를 불러오지 못했습니다."
      );

    }

    return;

  }

  if (
    token !== previewNavToken ||
    getCurrentPreviewLocation().type !== "post"
  ) {
    return;
  }

  if (!context) {

    setStudioPreviewOverlay(
      "empty",
      "이 글을 찾을 수 없습니다."
    );

    return;

  }

  setStudioPreviewOverlay(
    "hidden"
  );

  postRenderToFrame(
    {
      skin: postTemplate,
      context
    }
  );

  /*
    post-body region 유효성(문서 13/27-O절)은 iframe이 실제 mount한
    DOM을 봐야만 판정할 수 있다 — preview-bridge.js가
    "preview:rendered" 메시지에 hasPostBodyRegion을 함께 실어
    보내고, studio-preview.js의 message listener가
    currentPreviewPageType === "post"일 때만 그 값을 검사해 invalid
    overlay로 전환한다.
  */

  /* =========================================================
     실제 본문(PHASE 1C-I) — outer chrome(위 postRenderToFrame)과는
     항상 별도 메시지로 보낸다(post.content는 context에 절대 담기지
     않는다, PHASE1C 7-2절). postMessage 전송 순서가 도착 순서와
     같으므로, iframe은 이 메시지를 처리할 때 이미 이번 POST의
     post-body region을 갖고 있다(preview-bridge.js).

     buildStudioPostBodyPayload()는 Supabase를 왕복하므로 그 사이에
     사용자가 다른 곳으로 이동했을 수 있다 — context fetch와 동일한
     staleness 가드(token + 현재 위치)로 stale 응답을 버린다.
  ========================================================== */

  let bodyPayload;

  try {

    bodyPayload =
      await buildStudioPostBodyPayload(
        currentOwnerId,
        postId
      );

  } catch (err) {

    console.error(
      "[preview-navigation] buildStudioPostBodyPayload failed",
      err
    );

    return;

  }

  if (
    token !== previewNavToken ||
    getCurrentPreviewLocation().type !== "post" ||
    !bodyPayload
  ) {
    return;
  }

  postPostBodyToFrame(
    bodyPayload
  );

}


function renderCurrentPreviewEntry() {

  const entry =
    previewHistory[previewHistory.length - 1];

  if (entry.type === "home") {
    renderHomePreview();
    return;
  }

  if (entry.type === "category") {
    renderCategoryPreviewFor(entry.categoryId);
    return;
  }

  renderPostPreviewFor(entry.postId);

}


function pushPreviewNavigation(target) {

  previewHistory =
    target.type === "home"
      ? [{ type: "home" }]
      : [...previewHistory, target];

  renderCurrentPreviewEntry();

}


function popPreviewNavigation() {

  if (previewHistory.length <= 1) {
    return;
  }

  previewHistory =
    previewHistory.slice(0, -1);

  renderCurrentPreviewEntry();

}


/* =========================================================
   preview-bridge.js(iframe)가 보낸 "preview:navigate" 처리 — href는
   Skin HTML에서 온 값이라 신뢰하지 않고 매번
   resolveStudioPreviewTarget()(studio/preview/preview-route.js)로
   다시 해석한다(문서 7/24절 "parent가 실제 route parsing 담당").
   알 수 없는 경로/다른 owner slug는 조용히 무시한다(문서 Q "다른
   slug는 Studio internal route 처리 안 함") — 이미 같은 위치에
   있으면 재진입하지 않는다(중복 push 방지).
========================================================== */

function handlePreviewNavigateMessage(href) {

  if (!currentSkinContext) {
    return;
  }

  const target =
    resolveStudioPreviewTarget(
      href,
      currentSkinContext.site.slug
    );

  if (!target) {
    return;
  }

  const current =
    getCurrentPreviewLocation();

  const isSameLocation =
    current.type === target.type &&
    (
      target.type === "home" ||
      (target.type === "category" && current.categoryId === target.categoryId) ||
      (target.type === "post" && current.postId === target.postId)
    );

  if (isSameLocation) {
    return;
  }

  pushPreviewNavigation(
    target
  );

}


studioPreviewBackButton.addEventListener(
  "click",
  popPreviewNavigation
);
