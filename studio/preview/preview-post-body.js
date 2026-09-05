/* =========================================================
   STUDIO PREVIEW POST BODY (PHASE 1C-I)

   Studio Preview에서 POST로 이동했을 때 protected post-body
   region(AI_SKIN_PHASE1C_PAGE_CONTRACT.md 7절, skin/skin-render.js의
   applySkinRegion())에 실제 글 본문을 채워 넣기 위한 데이터
   조회/렌더 지점. skin/skin-context.js의 buildPostSkinContext()는
   의도적으로 본문을 Context에 포함하지 않으므로(6-1/7-2절), 본문은
   항상 이 파일이 별도로 조회해서 postMessage로 iframe에 전달한다
   (context와는 별개의 채널 — Skin data-imory-bind 경로로는 절대
   본문에 접근할 수 없다는 계약을 그대로 유지).

   본문 서식(Quote Preset/대화체 강조/문단 처리/HTML sanitize)은
   새로 만들지 않고 공개 POST Viewer(posts/view/posts-view-detail.js)
   가 쓰는 것과 동일한 함수를 그대로 재사용한다:
     - getPostContentAsSafeHTML()  (posts/posts-sanitize.js)
     - renderStyledPostContentInto()(posts/style/posts-style-render.js)
     - applyActionDialogueStyles() (posts/style/posts-style-dialogue.js)
     - getSafeHighlightColor()/getPresetHighlightColor()
       (posts/style/posts-style-preset.js) — 전역 postStyleSettings를
       직접 읽으므로, 아래 postStyleSettings 전역을 그 이름 그대로
       선언해 둔다(파일을 고치지 않고 그대로 재사용하기 위한 유일한
       결합 지점).

   posts/style/posts-style-preset.js의 loadPostStylePreset()/
   loadPostStylePresetById() 자체는 재사용하지 않는다 — 그 두
   함수는 getSiteOwner()(slug 기반 URL 라우팅 전제)와 admin-quote
   전용 swatch UI 업데이트 함수(updatePresetHighlightSwatch 등,
   Studio에는 존재하지 않음)에 의존해서 그대로 가져오면 깨진다.
   Studio는 이미 currentOwnerId(로그인한 사용자 id, slug 아님)를
   갖고 있으므로, 동일한 조회 로직(사용 중 프리셋 우선 -> 이름
   "Vibe" 폴백, 글에 지정된 quote_preset_id 우선)을 ownerId 기준으로
   다시 구현한다 — 조회 SQL 모양만 같고 로직은 posts/style/
   posts-style-preset.js를 고치지 않는다(9-1/9-2절 "파이프라인
   리팩터링 금지").

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   supabaseClient, renderStyledPostContentInto(posts/style/
   posts-style-render.js, posts/posts-sanitize.js,
   posts/style/posts-style-dialogue.js, posts/style/
   posts-style-preset.js도 함께 로드되어야 함 — studio/index.html
   참고).
========================================================== */


/*
  posts/style/posts-style-preset.js의 getPresetHighlightColor()가
  참조하는 바로 그 전역 이름이다(posts/editor/posts-refs.js가
  공개 POST Viewer 쪽에서 선언하는 것과 동일한 역할) — 이름을
  바꾸면 그 함수가 읽지 못한다.
*/
let postStyleSettings = {};


/* =========================================================
   fetchStudioPostRecord(ownerId, postId)
     -> { id, content_type, quote_preset_id } | null

   skin/skin-context.js의 fetchSkinPostById()와 동일한 scope
   원칙(user_id + id)을 쓰되, 본문 렌더에 필요한 컬럼만 추가로
   select한다. secret_password_hash/본문 자체는 여기서도 select
   하지 않는다.
========================================================== */

async function fetchStudioPostRecord(
  ownerId,
  postId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("posts")
      .select("id, content_type, quote_preset_id")
      .eq("user_id", ownerId)
      .eq("id", postId)
      .maybeSingle();

  if (error) {

    console.error(
      "[preview-post-body] post 조회 실패:",
      error
    );

    return null;

  }

  return data;

}


/* =========================================================
   fetchStudioPostContent(postId) -> string

   공개 POST Viewer(posts-view-detail.js)와 동일하게 post_contents를
   post_id로만 조회한다 — Studio는 항상 site owner 본인 세션이므로
   secret gate 분기 자체가 없다(8절, isOwnerViewing이 언제나 true인
   경우와 동일한 신뢰 경계).
========================================================== */

async function fetchStudioPostContent(
  postId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("post_contents")
      .select("content")
      .eq("post_id", postId)
      .maybeSingle();

  if (error) {

    console.error(
      "[preview-post-body] post_contents 조회 실패:",
      error
    );

  }

  return (
    data?.content ||
    ""
  );

}


/* =========================================================
   loadStudioPostStyleSettings(ownerId, quotePresetId)

   posts/style/posts-style-preset.js의 loadPostStylePresetById()/
   loadPostStylePreset()과 동일한 우선순위(1. 글에 지정된 프리셋,
   2. "사용 중" 프리셋, 3. 이름 "Vibe" 프리셋)를 ownerId 기준으로
   재구현한다 — 전역 postStyleSettings만 갱신하고 반환한다.
========================================================== */

async function loadStudioPostStyleSettings(
  ownerId,
  quotePresetId
) {

  if (quotePresetId) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from("quote_presets")
        .select("settings")
        .eq("id", quotePresetId)
        .eq("user_id", ownerId)
        .maybeSingle();

    if (!error && data) {

      postStyleSettings =
        data.settings ||
        {};

      return postStyleSettings;

    }

  }

  const {
    data: activeData,
    error: activeError
  } =
    await supabaseClient
      .from("quote_presets")
      .select("settings")
      .eq("is_active", true)
      .eq("user_id", ownerId)
      .maybeSingle();

  if (!activeError && activeData) {

    postStyleSettings =
      activeData.settings ||
      {};

    return postStyleSettings;

  }

  const {
    data: fallbackData,
    error: fallbackError
  } =
    await supabaseClient
      .from("quote_presets")
      .select("settings")
      .eq("name", "Vibe")
      .eq("user_id", ownerId)
      .maybeSingle();

  postStyleSettings =
    (!fallbackError && fallbackData?.settings) ||
    {};

  return postStyleSettings;

}


/* =========================================================
   buildStudioPostBodyPayload(ownerId, postId)
     -> { html, containerStyle, isHtmlContent } | null

   postMessage로 iframe에 보낼 최종 payload를 만든다. html-content
   모드는 공개 POST Viewer와 동일하게 저장된 HTML을 sanitize 없이
   그대로 쓴다(posts-view-detail.js renderPostDetailBody와 동일한
   기존 신뢰 경계, 새로 추가하는 것이 아니다). rich 모드는
   renderStyledPostContentInto()가 이미 getPostContentAsSafeHTML()로
   sanitize한 뒤 컨테이너에 그린 결과를 그대로 가져간다.

   containerStyle을 innerHTML과 분리해서 넘기는 이유: applyPostBodyStyles()
   가 폰트/색/줄간격 등을 "컨테이너 자신"의 인라인 style로 적용하기
   때문이다(자식이 아니라) — 이 스타일 없이 innerHTML만 넘기면
   서식이 전부 사라진다. iframe 쪽(preview-bridge.js)이 실제 region
   엘리먼트에 이 스타일을 그대로 적용해 공개 POST의 #postDetailContent
   와 동일한 결과를 만든다.
========================================================== */

async function buildStudioPostBodyPayload(
  ownerId,
  postId
) {

  const post =
    await fetchStudioPostRecord(
      ownerId,
      postId
    );

  if (!post) {
    return null;
  }

  const contentText =
    await fetchStudioPostContent(
      postId
    );

  if (post.content_type === "html") {

    return {
      html: contentText || "",
      containerStyle: "",
      isHtmlContent: true
    };

  }

  await loadStudioPostStyleSettings(
    ownerId,
    post.quote_preset_id
  );

  const offscreen =
    document.createElement("div");

  renderStyledPostContentInto(
    offscreen,
    contentText || "",
    postStyleSettings || {}
  );

  return {
    html: offscreen.innerHTML,
    containerStyle: offscreen.getAttribute("style") || "",
    isHtmlContent: false
  };

}
