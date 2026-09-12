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
   skin-template.js), buildCategorySkinContext/buildPostSkinContext/
   buildBannerSkinContext/fetchSkinCategoryById/fetchSkinBanners
   (skin/skin-context.js),
   isSafeSkinUrl(skin/skin-sanitize.js), resolveStudioPreviewTarget
   (studio/preview/preview-route.js), postBannerRenderToFrame
   (studio-preview.js).

   Banner Category Preview — category.type === "banner"는 Skin
   template(templates.category) 없이도 항상 미리볼 수 있다(공개
   Banner 렌더러가 Skin 유무와 무관하게 동작하는 것과 같은 계약).
   Skin의 CATEGORY template 렌더 경로(postRenderToFrame + renderSkin)
   를 타지 않고, 이 파일의 renderBannerCategoryPreviewFor()가 만든
   안전한 평문 데이터만 postBannerRenderToFrame()으로 보내면
   preview-bridge.js가 iframe 안에서 직접 DOM을 구성한다(자세한
   내용은 아래 renderBannerCategoryPreviewFor()/studio-preview.js/
   preview-bridge.js 주석).

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
    /* GALLERY-1: 페이지 번호까지 포함해야 "같은 자리" 판정이 정확하다 */
    return { type: "category", categoryId: top.categoryId, page: top.page || 1 };
  }

  if (top.type === "post") {
    return { type: "post", postId: top.postId };
  }

  if (top.type === "folder") {
    return {
      type: "folder",
      categoryId: top.categoryId,
      folderId: top.folderId,
      series: Boolean(top.series)
    };
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

   Banner Category Preview(카테고리 유형 확장) — category.type을
   먼저 알아야만 어느 렌더 경로(post형 Skin CATEGORY template vs
   banner형 read-only adapter)를 탈지 결정할 수 있다. banner
   카테고리는 Skin이 CATEGORY template을 전혀 갖고 있지 않아도
   (HOME-only Skin 포함) 항상 미리볼 수 있어야 하므로 — 공개
   Banner 렌더러(posts/view/posts-view-banner.js)가 Skin 유무와
   무관하게 항상 동작하는 것과 같은 계약 — categoryTemplate 존재
   여부를 확인하기 전에 fetchSkinCategoryById()(skin/skin-context.js
   전역, 이미 로드됨)로 실제 type을 가볍게 먼저 확인한다. post형은
   기존과 동일하게 categoryTemplate이 없으면 그 자리에서 바로
   unsupported로 끝난다(추가 fetch 없음).
========================================================== */

async function renderCategoryPreviewFor(categoryId, options, page) {

  currentPreviewPageType =
    "category";

  updateStudioCodeButtonState();

  updatePreviewBackButtonVisibility();

  if (!currentWorkingSkin) {
    return;
  }

  setStudioPreviewOverlay(
    "loading",
    "카테고리 미리보기를 불러오는 중..."
  );

  const token =
    ++previewNavToken;

  let category;

  try {

    category =
      await fetchSkinCategoryById(
        currentOwnerId,
        categoryId
      );

  } catch (err) {

    console.error(
      "[preview-navigation] fetchSkinCategoryById failed",
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

  if (!category) {

    reportPreviewEntryUnavailable(
      options,
      "empty",
      "이 카테고리를 찾을 수 없습니다."
    );

    return;

  }

  if (category.type === "banner") {

    /*
      PHASE 1E — 이 스킨이 templates.banner를 갖고 있으면 공개
      화면(skin/skin-banner.js)과 **같은 template/같은 Context/같은
      renderSkin 경로**로 미리 본다. 없으면 지금까지처럼 Studio
      전용 read-only adapter(renderBannerCategoryPreviewFor, 아래)로
      떨어진다 — 그래야 배너 template이 없는 스킨을 편집하는
      중에도 배너 화면을 계속 확인할 수 있다(공개 배너 렌더러가
      Skin 유무와 무관하게 동작하는 것과 같은 계약).
    */

    const bannerTemplate =
      resolveSkinTemplate(currentWorkingSkin, "banner");

    if (bannerTemplate) {

      await renderBannerSkinPreviewFor(
        categoryId,
        bannerTemplate,
        token,
        options
      );

      return;

    }


    await renderBannerCategoryPreviewFor(
      categoryId,
      category,
      token
    );

    return;

  }

  const categoryTemplate =
    resolveSkinTemplate(currentWorkingSkin, "category") ||
      (category.type === "gallery" ? getDefaultGalleryTemplate() : null);

  if (!categoryTemplate) {

    reportPreviewEntryUnavailable(
      options,
      "unsupported",
      "이 스킨에는 아직 CATEGORY 템플릿이 없습니다."
    );

    return;

  }

  let context;

  try {

    /*
      FOLDER-2: 공개 화면(skin/skin-category.js)과 같은 판정 — 작업 중
      스킨에 templates.folder가 있을 때만 폴더 노드의 folderHref가
      채워진다. Preview에서 폴더 링크를 누르면 아래
      renderFolderPreviewFor()로 간다.
    */
    /*
      GALLERY-1: 공개 화면(skin/skin-category.js)과 **같은 판정·같은
      Context**를 쓴다 — 작업 중 CATEGORY template이 category.gallery를
      실제로 그릴 때만 갤러리 모드가 켜지고, 페이지 번호도 Preview
      안의 링크에서 온 값을 그대로 넘긴다. 그래서 "Preview에서는
      갤러리인데 공개 화면에서는 목록"이 구조적으로 생길 수 없다.
    */
    context =
      await buildCategorySkinContext(
        currentOwnerId,
        categoryId,
        {
          imageSlotNames: currentImageSlotNames,
          imageSlotValues: currentImageSlotValues,
          supportsFolderPage: !!resolveSkinTemplate(currentWorkingSkin, "folder"),
          supportsGallery: skinTemplateUsesGallery(categoryTemplate),
          page: page || 1
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

  if (
    token !== previewNavToken ||
    getCurrentPreviewLocation().type !== "category"
  ) {
    return;
  }

  if (!context) {

    reportPreviewEntryUnavailable(
      options,
      "empty",
      "이 카테고리를 찾을 수 없습니다."
    );

    return;

  }

  if (!["post", "gallery"].includes(context.category.type)) {

    /*
      banner는 위에서 이미 분기됐다 — 여기 남는 건 post/banner가
      아닌 미래의 알 수 없는 category type뿐이다(문서 11절과 동일한
      결). public 라우트로 나가지 않고 Preview Back만 가능한
      unsupported 상태로 남긴다.
    */

    reportPreviewEntryUnavailable(
      options,
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
   BANNER — Skin template 경로 (PHASE 1E)

   templates.banner가 있는 스킨의 배너 미리보기. 공개 경로
   (skin/skin-banner.js)와 완전히 같은 계약을 쓴다 —
   buildBannerSkinContext()가 만든 같은 Context를 같은 template과
   함께 postRenderToFrame()으로 보내고, iframe 안에서
   renderSkin()이 그린다. Studio 전용 렌더 경로를 따로 만들지
   않으므로 "Preview에서는 되는데 공개 화면에서는 다르다"가
   구조적으로 생길 수 없다.

   currentPreviewPageType을 "banner"로 바꿔서 CODE 버튼이
   templates.banner를 편집 대상으로 잡게 한다
   (studio-preview.js의 resolveCodeEditorSource/
   applyWorkingSkinChanges는 pageType 일반형이라 별도 분기가
   필요 없다). previewHistory 항목 자체는 여전히
   {type:"category", categoryId}다 — 실제 라우트가 그것이고,
   renderCurrentPreviewEntry()가 다시 들어오면 여기서 다시
   banner로 판정된다.

   staleness 가드(token + 현재 위치)는 renderCategoryPreviewFor/
   renderPostPreviewFor와 동일하다.
========================================================== */

async function renderBannerSkinPreviewFor(categoryId, bannerTemplate, token, options) {

  currentPreviewPageType =
    "banner";

  updateStudioCodeButtonState();

  setStudioPreviewOverlay(
    "loading",
    "배너 미리보기를 불러오는 중..."
  );

  let context;

  try {

    context =
      await buildBannerSkinContext(
        currentOwnerId,
        categoryId,
        {
          imageSlotNames: currentImageSlotNames,
          imageSlotValues: currentImageSlotValues
        }
      );

  } catch (err) {

    console.error(
      "[preview-navigation] buildBannerSkinContext failed",
      err
    );

    if (
      token === previewNavToken &&
      getCurrentPreviewLocation().type === "category"
    ) {

      setStudioPreviewOverlay(
        "error",
        "배너 미리보기를 불러오지 못했습니다."
      );

    }

    return;

  }

  if (
    token !== previewNavToken ||
    getCurrentPreviewLocation().type !== "category"
  ) {
    return;
  }

  if (!context) {

    reportPreviewEntryUnavailable(
      options,
      "empty",
      "이 카테고리를 찾을 수 없습니다."
    );

    return;

  }

  setStudioPreviewOverlay(
    "hidden"
  );

  postRenderToFrame(
    {
      skin: bannerTemplate,
      context
    }
  );

}


/* =========================================================
   BANNER CATEGORY — Studio 전용 read-only adapter (Skin template
   시스템 밖, templates.banner가 없는 스킨 전용). 공개 Banner 렌더러(posts/view/posts-view-banner.js)와
   달리 edit 모드/순서 변경/폼은 없다 — 목록을 보여주기만 한다.

   owner(currentOwnerId) + category_id 필터를 모두 적용한다
   (fetchSkinBanners가 이미 .eq("user_id", ownerId).in("category_id",
   [categoryId])로 두 조건 다 강제한다, skin/skin-context.js) — 다른
   사용자의 배너나 다른 banner category의 배너가 섞이지 않는다.

   href/image_url은 원본 DB 값을 그대로 DOM에 넣지 않는다 — 공개
   Banner 렌더러/Skin Context가 공유하는 단일 URL 판정 함수
   isSafeSkinUrl()(skin/skin-sanitize.js 전역, https + 위험 스킴
   차단, skin/skin-render.js의 data-imory-href/src 런타임 바인딩과
   동일 함수)로 여기서 한 번 걸러 보낸 뒤, preview-bridge.js(iframe)가
   실제 DOM에 반영하는 시점에 다시 한번 재검증한다(Slice 3.5
   renderSkin()과 동일한 "매 반영 지점마다 재검증" 원칙, 이중 방어).
   안전하지 않은 값은 null로 보낸다 — 표시 자체를 막지 않고(이름은
   여전히 보인다) 링크/이미지만 없앤다(공개 CATEGORY 렌더러가 관리자
   전용 화면이 아니라는 점, 5절과 동일 결).
========================================================== */

async function renderBannerCategoryPreviewFor(categoryId, category, token) {

  setStudioPreviewOverlay(
    "loading",
    "배너 미리보기를 불러오는 중..."
  );

  let banners;

  try {

    banners =
      await fetchSkinBanners(
        currentOwnerId,
        [categoryId]
      );

  } catch (err) {

    console.error(
      "[preview-navigation] fetchSkinBanners failed",
      err
    );

    if (
      token === previewNavToken &&
      getCurrentPreviewLocation().type === "category"
    ) {

      setStudioPreviewOverlay(
        "error",
        "배너 미리보기를 불러오지 못했습니다."
      );

    }

    return;

  }

  if (
    token !== previewNavToken ||
    getCurrentPreviewLocation().type !== "category"
  ) {
    return;
  }

  const items =
    banners.map(
      (banner) => ({
        id: String(banner.id),
        name: banner.name || "",
        href:
          typeof banner.url === "string" && isSafeSkinUrl(banner.url)
            ? banner.url
            : null,
        imageUrl:
          typeof banner.image_url === "string" && isSafeSkinUrl(banner.image_url)
            ? banner.image_url
            : null
      })
    );

  setStudioPreviewOverlay(
    "hidden"
  );

  postBannerRenderToFrame(
    {
      categoryName: category.name || "",
      items
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

async function renderPostPreviewFor(postId, options) {

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

    reportPreviewEntryUnavailable(
      options,
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

    reportPreviewEntryUnavailable(
      options,
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


/* =========================================================
   FOLDER — 폴더 페이지(Series Viewer) Preview (FOLDER-2)

   공개 화면(skin/skin-folder.js + posts/view/posts-view-folder.js)과
   같은 계약이다: 같은 templates.folder, 같은 buildFolderSkinContext(),
   같은 renderSkin(), 그리고 본문은 Context가 아니라 렌더 뒤 글별
   post-body region에 채운다. Studio는 항상 소유자 세션이므로 secret
   gate 분기가 없다(POST Preview와 같은 신뢰 경계, preview-post-body.js).

   templates.folder가 없으면 unsupported overlay + Preview Back으로
   남긴다(공개 화면은 카테고리로 복귀하지만, Studio에서는 "이 스킨에
   폴더 페이지가 없다"를 보여주는 편이 편집자에게 맞다 — 그 상태에서
   CODE 버튼도 비활성이라 Import/AI로 채우게 된다). 폴더가 없거나
   보이는 direct 글이 없으면 "empty"다.
========================================================== */

async function renderFolderPreviewFor(categoryId, folderId, series, options) {

  const seriesMode =
    Boolean(series);


  currentPreviewPageType =
    "folder";

  updateStudioCodeButtonState();

  updatePreviewBackButtonVisibility();

  if (!currentWorkingSkin) {
    return;
  }

  const folderTemplate =
    resolveSkinTemplate(currentWorkingSkin, "folder");

  if (!folderTemplate) {

    reportPreviewEntryUnavailable(
      options,
      "unsupported",
      "이 스킨에는 아직 FOLDER 템플릿이 없습니다."
    );

    return;

  }

  setStudioPreviewOverlay(
    "loading",
    "폴더 미리보기를 불러오는 중..."
  );

  const token =
    ++previewNavToken;

  const isCurrent =
    () => {

      const location =
        getCurrentPreviewLocation();

      return (
        token === previewNavToken &&
        location.type === "folder" &&
        location.folderId === folderId &&
        Boolean(location.series) === seriesMode
      );

    };

  let context;

  try {

    context =
      await buildFolderSkinContext(
        currentOwnerId,
        categoryId,
        folderId,
        {
          imageSlotNames: currentImageSlotNames,
          imageSlotValues: currentImageSlotValues,
          series: seriesMode
        }
      );

  } catch (err) {

    console.error(
      "[preview-navigation] buildFolderSkinContext failed",
      err
    );

    if (isCurrent()) {

      setStudioPreviewOverlay(
        "error",
        "폴더 미리보기를 불러오지 못했습니다."
      );

    }

    return;

  }

  if (!isCurrent()) {
    return;
  }

  if (!context) {

    reportPreviewEntryUnavailable(
      options,
      "empty",
      "이 폴더를 찾을 수 없거나 보여줄 글이 없습니다."
    );

    return;

  }

  setStudioPreviewOverlay(
    "hidden"
  );

  postRenderToFrame(
    {
      skin: folderTemplate,
      context
    }
  );

  /*
    본문 — 이어읽기 모드에서만이다. 목록 모드는 공개 화면과 똑같이
    본문을 조회하지도 보내지도 않는다(posts/view/posts-view-folder.js).
  */

  if (!seriesMode) {
    return;
  }


  /*
    POST Preview(renderPostPreviewFor)와 같은 별도 채널. 글별 payload를
    한 메시지에 담아 보내고, iframe이 region 키(item.id)로 짝지어
    채운다(preview-bridge.js). 그 사이 사용자가 이동했으면 버린다.
  */

  let bodies;

  try {

    bodies =
      await buildStudioFolderBodiesPayload(
        currentOwnerId,
        context.folder.posts.map((post) => post.id)
      );

  } catch (err) {

    console.error(
      "[preview-navigation] buildStudioFolderBodiesPayload failed",
      err
    );

    return;

  }

  if (
    !isCurrent() ||
    !Array.isArray(bodies) ||
    bodies.length === 0
  ) {
    return;
  }

  postFolderBodiesToFrame(
    {
      bodies
    }
  );

}


/* =========================================================
   renderCurrentPreviewEntry(options)

   options.fallbackToHomeIfUnavailable (PHASE AI-5A)
     이 렌더가 "그 카테고리/글을 찾을 수 없다" 또는 "이 스킨은 그
     페이지를 지원하지 않는다"로 끝나면 overlay를 띄우는 대신 HOME
     으로 되돌린다. AI 결과를 적용한 뒤 보고 있던 화면을 복원하는
     경로에서만 쓴다 — 사용자가 직접 링크를 눌러 들어간 경우에는
     지금까지처럼 그 자리에 남아 overlay + Preview Back을 본다
     (자기가 누른 링크가 조용히 HOME으로 바뀌면 더 혼란스럽다).

   플래그를 모듈 변수로 들고 있지 않고 인자로 흘려보내는 이유:
   렌더는 비동기라 "지금 복원 중인가"를 전역 상태로 두면 그 사이
   사용자가 이동했을 때 누가 언제 그 값을 지워야 하는지가
   불분명해진다. 인자는 그 렌더 한 번에만 붙는다.
========================================================== */

function renderCurrentPreviewEntry(options) {

  const entry =
    previewHistory[previewHistory.length - 1];

  if (entry.type === "home") {
    renderHomePreview();
    return;
  }

  if (entry.type === "category") {
    renderCategoryPreviewFor(entry.categoryId, options, entry.page || 1);
    return;
  }

  if (entry.type === "folder") {
    renderFolderPreviewFor(entry.categoryId, entry.folderId, entry.series, options);
    return;
  }

  renderPostPreviewFor(entry.postId, options);

}


/* =========================================================
   PHASE AI-5A — SkinPackage가 통째로 바뀐 뒤 화면 복원

   studio-preview.js의 applyImportedSkinPackage()가
   options.preserveNavigation일 때(= AI 적용/되돌리기) 호출한다.
   Import 버튼은 지금까지처럼 resetPreviewNavigation() + HOME이다.

   previewNavToken을 먼저 올려 진행 중이던 fetch 응답이 새 화면을
   덮지 않게 한다(resetPreviewNavigation과 같은 이유).
========================================================== */

function renderPreviewAfterSkinPackageChange() {

  previewNavToken +=
    1;

  renderCurrentPreviewEntry(
    { fallbackToHomeIfUnavailable: true }
  );

}


/* =========================================================
   지금 항목을 그릴 수 없을 때

   기본은 지금까지와 같은 overlay다. 복원 렌더(위 options)에서만
   HOME으로 되돌린다 — previewHistory까지 HOME 하나로 되돌리므로
   Preview Back도 함께 사라진다(renderHomePreview가
   updatePreviewBackButtonVisibility를 부른다).
========================================================== */

function reportPreviewEntryUnavailable(options, state, message) {

  if (options && options.fallbackToHomeIfUnavailable) {

    previewHistory =
      [{ type: "home" }];

    previewNavToken +=
      1;

    renderHomePreview();

    return;

  }

  setStudioPreviewOverlay(
    state,
    message
  );

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
      (
        target.type === "category" &&
        current.categoryId === target.categoryId &&
        (current.page || 1) === (target.page || 1)
      ) ||
      (target.type === "post" && current.postId === target.postId) ||
      (
        target.type === "folder" &&
        current.categoryId === target.categoryId &&
        current.folderId === target.folderId &&
        Boolean(current.series) === Boolean(target.series)
      )
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
