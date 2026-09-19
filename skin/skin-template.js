/* =========================================================
   SKIN TEMPLATE SELECTION

   AI_SKIN_PHASE1C_PAGE_CONTRACT.md 12-B/14-1절. SkinPackage가
   페이지별 templates.{home,category,post,banner}를 갖는 멀티페이지
   shape으로 확장되는 동안, 이미 저장된 단일-html Skin(templates
   필드 없음)이 계속 HOME을 문제없이 렌더할 수 있게 하는 유일한
   선택 로직.

   이번 Slice(1C-A)는 이 함수를 어디에도 연결하지 않는다 —
   skin-render.js/skin-home.js/preview-bridge.js는 지금 이 파일을
   import/참조하지 않고, 여전히 skin.html/skin.css를 직접 읽는다
   (그 배선은 CATEGORY/POST Renderer가 실제로 생기는 1C-C/1C-D의
   몫이다). 이 파일은 그 전에 필요한 선택 규칙만 순수 함수로
   미리 확정해 둔다.

   DOM/Supabase를 전혀 건드리지 않는다. classic script —
   함수 선언 자체가 window.resolveSkinTemplate /
   window.skinPackageSupportsPageType으로 노출된다.
========================================================== */

/* PHASE 1E: "banner"가 네 번째 page type으로 추가됐다
   (AI_SKIN_PHASE1E_BANNER_AND_OWNER_LINKS.md 2절). 아래
   resolveSkinTemplate()의 규칙은 한 줄도 바뀌지 않는다 —
   templates.banner가 없는 기존 Skin은 여전히 undefined를 받아
   legacy 배너 화면으로 폴백한다(HOME html을 배너에 재사용하지
   않는다). 즉 이 배열에 이름을 하나 더하는 것만으로 "선택적
   배너 template" 계약이 성립한다.

   FOLDER-2: "folder"가 다섯 번째 page type이다(IMORY_FOLDER2_DESIGN.md).
   banner와 같은 **선택** template이다 — templates.folder가 없는 스킨은
   undefined를 받고, 그 경우 플랫폼은 폴더 링크(folderHref)를 아예
   노출하지 않으며 폴더 주소로 들어오면 그 카테고리로 돌려보낸다
   (폴더 전용 폴백 화면을 만들지 않는다). */
/* HIGHLIGHT-1: 하이라이트 화면이 여섯 번째 page type이다. banner/folder와
   같은 **선택** template이지만 폴백이 다르다 — template이 없으면 플랫폼이
   아래 getDefaultHighlightsTemplate()을 쓴다(갤러리와 같은 방식).
   하이라이트 화면은 legacy 화면이 아예 없어서 "지원하지 않으면 안 보여준다"가
   성립하지 않기 때문이다.

   HIGHLIGHT-2: 그 page type 의 공식 이름은 "highlights" 다. HIGHLIGHT-1 이
   쓴 "memos" 는 **레거시 alias**로만 남는다 — 이미 templates.memos 를 담아
   저장·export 한 스킨이 있고, 그 파일을 다시 저장하지 않아도 계속 그려져야
   한다. 새로 만드는 스킨과 AI 가 쓰는 이름은 templates.highlights 하나다.
   alias 제거 가능 시점: IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md §12. */
/* BOTTOM-DOCK-1: "dock" 은 화면이 아니라 **모든 화면에 함께 얹히는
   조각**이다(IMORY_BOTTOM_DOCK_DESIGN.md). 선택 template 이고, 없으면
   플랫폼 기본 template 을 쓴다(하이라이트 화면과 같은 폴백). 실제
   선택은 skin/skin-bottom-dock.js 의 resolveSkinDockTemplate 이
   하지만, Export/Save/감사가 이 목록을 "아는 template 이름"으로
   쓰므로 여기에도 있어야 한다. */
const SKIN_TEMPLATE_PAGE_TYPES =
  ["home", "category", "post", "banner", "folder", "highlights", "memos", "dock"];


/* 하이라이트 화면 template 의 공식 이름과 레거시 alias (우선순위 순) */

const SKIN_HIGHLIGHTS_TEMPLATE_NAMES =
  ["highlights", "memos"];


/* =========================================================
   SANDBOX-1 — renderMode

   IMORY_SANDBOX_SKIN_DESIGN.md §C. SkinPackage 에 선택 필드
   `renderMode` 하나가 더해졌다. schemaVersion 은 **1 그대로**다 —
   2로 올리면 이미 배포된 모든 클라이언트가 그 스킨을 legacy 화면으로
   폴백시킨다(여섯 진입 모듈이 전부 `schemaVersion !== 1` 이면
   폴백한다).

   resolveSkinRenderMode(skinPackage) -> "native" | "sandbox"

   ★ "sandbox" 라고 정확히 적힌 경우에만 sandbox 다. 없거나,
     "native" 거나, 모르는 값이거나, 문자열이 아니면 전부
     **"native"** 다 — 모르는 값을 sandbox 로 추측하지 않는다.
     (Import 는 모르는 값을 아예 거부한다. 이 함수는 그 문을
      통과하지 않은 DB row 도 보므로 한 번 더 좁힌다.)

   ★ 이 함수는 순수 함수다. 기존 함수는 한 줄도 바뀌지 않았고,
     renderMode 가 없는 SkinPackage 는 이 함수를 불러도 "native"
     하나를 돌려받는다 — 호출자의 분기는 그때 오늘과 같은 경로다.
========================================================== */

const SKIN_RENDER_MODE_NATIVE =
  "native";

const SKIN_RENDER_MODE_SANDBOX =
  "sandbox";


function resolveSkinRenderMode(
  skinPackage
) {

  if (
    !skinPackage ||
    typeof skinPackage !== "object" ||
    typeof skinPackage.renderMode !== "string"
  ) {

    return SKIN_RENDER_MODE_NATIVE;

  }


  return skinPackage.renderMode.trim() === SKIN_RENDER_MODE_SANDBOX
    ? SKIN_RENDER_MODE_SANDBOX
    : SKIN_RENDER_MODE_NATIVE;

}


/*
  Import 가 받아들이는 값 목록. resolveSkinRenderMode 와 달리 여기서는
  "native" 를 명시적으로 적은 파일도 그대로 보존한다(왕복에서 필드가
  사라지지 않아야 한다 — 설계 문서 §C).
*/

const SKIN_RENDER_MODES =
  [SKIN_RENDER_MODE_NATIVE, SKIN_RENDER_MODE_SANDBOX];


function isKnownSkinRenderMode(value) {

  return (
    typeof value === "string" &&
    SKIN_RENDER_MODES.indexOf(value) !== -1
  );

}


/* =========================================================
   SANDBOX-5A — 작성 JS (`js`)

   IMORY_SANDBOX_SKIN_DESIGN.md §C 가 처음부터 자리를 비워 둔 필드다
   (§O 가 실행을 켠 기록이다). SkinPackage 최상위의 **문자열 하나**이고,
   `css` 와 같은 결이다: 페이지마다 따로 두지 않고 스킨 전체가 한 벌을
   공유한다.

   ★ schemaVersion 은 여전히 1 이다.

   이 필드를 모르는 옛 배포는 그냥 무시하고 지금까지처럼 그린다 —
   즉 JS 가 빠진 화면이 나온다. renderMode 와 같은 판단이다(2로
   올리면 옛 배포가 스킨을 통째로 legacy 화면으로 폴백시킨다).

   ★ 여기서 sanitize 하지 않는다.

   HTML 은 태그를 지워서 안전하게 만들 수 있지만, JS 는 "일부를
   지워서 안전해지는" 종류가 아니다. 이 문자열의 안전은 전적으로
   **어디서 실행되는가**가 지킨다 — 부모와 다른 origin,
   connect-src 'none', 부모 DOM 접근 불가. 그래서 검사는 타입과
   길이 둘뿐이다.

   ★ 상한은 프로토콜과 같은 값이어야 한다.
   (skin/sandbox/skin-sandbox-protocol.js SANDBOX_MAX_AUTHOR_JS_CHARS)
   어긋나면 "Import 는 통과했는데 프레임에 안 가는" 조용한 오작동이
   생긴다.
========================================================== */

const SKIN_PACKAGE_MAX_JS_CHARS = 131072;


/*
  "이 값을 SkinPackage 의 js 로 받아도 되는가".

  빈 문자열은 **허용**이다 — 사용자가 JS 를 다 지운 상태를
  "필드가 없는 것"과 구분해서 보존해야 왕복에서 값이 사라지지
  않는다(renderMode:"native" 를 명시한 파일을 보존하는 것과 같은
  판단).
*/

function isValidSkinAuthorJs(value) {

  return (
    typeof value === "string" &&
    value.length <= SKIN_PACKAGE_MAX_JS_CHARS
  );

}


/*
  resolveSkinAuthorJs(skinPackage) -> string

  문자열이 아니거나 상한을 넘으면 "" 다 — 어떤 경로로 이상한 값이
  draft 에 들어와 있더라도 렌더 입력에는 빈 문자열만 닿는다.
  (renderMode 와 같은 "모르는 값은 안전한 쪽으로" 규칙.)
*/

function resolveSkinAuthorJs(skinPackage) {

  if (
    !skinPackage ||
    typeof skinPackage !== "object" ||
    !isValidSkinAuthorJs(skinPackage.js)
  ) {
    return "";
  }


  return skinPackage.js;

}

/* Additive gallery fallback. Existing category templates retain full control. */
function getDefaultGalleryTemplate() {
  const tree = (path, depth) => `<ul><li data-imory-repeat="${path}">
    <span data-imory-if="item.name" data-imory-bind="item.name"></span>
    <a data-imory-if="item.href" data-imory-href="item.href" data-imory-bind="item.title"></a>
    ${depth ? tree('item.children', depth - 1) : ''}</li></ul>`;
  return {
    html: `<section class="imory-default-gallery"><h1 data-imory-bind="category.name"></h1>
      <div class="gallery-cards"><article data-imory-repeat="category.gallery.cards">
      <a data-imory-href="item.href"><img data-imory-if="item.hasThumbnail" data-imory-src="item.thumbnailUrl" alt="">
      <span data-imory-bind="item.title"></span></a>
      <div class="gallery-photos" data-imory-if="item.hasAdditionalImages"><img data-imory-repeat="item.additionalImages" data-imory-src="item.url" alt=""></div>
      <time data-imory-bind="item.publishedAtLabel"></time></article></div>
      <p data-imory-if="category.gallery.isEmpty">아직 사진이 없습니다.</p>
      <nav data-imory-if="category.pagination.hasPages"><a data-imory-repeat="category.pagination.pages" data-imory-href="item.href" data-imory-bind="item.label"></a></nav>
      ${tree('category.tree', 3)}</section>`,
    css: `.imory-default-gallery { max-width: 1000px; margin: auto; padding: 24px 16px; }
      .gallery-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 16px; }
      .gallery-cards article { min-width: 0; } .gallery-cards img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; }
      .gallery-cards a, .gallery-cards time { display: block; } .gallery-cards time { font-size: 12px; }
      .gallery-photos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-block: 8px; }
      nav { display: flex; gap: 12px; margin-top: 20px; }`
  };
}


/* =========================================================
   기본 하이라이트 화면 (HIGHLIGHT-1 §7 · HIGHLIGHT-2 §11)

   하이라이트 template 을 가지고 있지 않은 스킨(= HIGHLIGHT-2 이전의
   모든 스킨)에서도 이 화면이 동작해야 한다. 그래서 갤러리와 같은
   방식으로 **플랫폼이 들고 있는 기본 template**을 쓴다.

   ★ 고정된 완성 HTML 하나가 아니다

   이 기본값도 여느 스킨과 똑같이 data-imory-* 바인딩으로만 쓰여 있다.
   스킨 제작자는 이 구조를 그대로 복사해 요소의 순서·태그·클래스를
   바꾸면 되고, 필요 없는 조각은 빼면 된다. 플랫폼이 뒤에서 채우는
   자리는 카드마다 하나씩 있는 [data-imory-region="highlight-tools"]
   뿐이다 — 주인장에게는 ⋮ 버튼이 들어가고 방문자에게는 빈 채로 남는다
   (HIGHLIGHT-1 의 "memo-tools" 도 계속 인정된다, skin/skin-sanitize.js).

   바인딩 경로는 공식 이름인 `highlights.*` 를 쓴다. Context 는 같은
   객체를 `memos` 로도 내보내므로 예전 스킨의 `memos.*` 도 그대로
   동작한다 — 두 경로가 **같은 값**을 가리키므로 어느 쪽을 쓰든 화면은
   한 번만 그려진다.

   CSS는 posts/posts-highlight.css의 클래스를 그대로 쓰므로 여기서는
   최소한의 배치만 준다(스킨이 자기 template을 가지면 이 CSS 자체가
   쓰이지 않는다).
========================================================== */

function getDefaultHighlightsTemplate() {

  return {

    html: `<section class="highlight-screen">

      <nav class="highlight-screen-views">
        <a class="highlight-screen-view" data-imory-href="highlights.allHref" data-imory-bind="highlights.allLabel"></a>
        <a class="highlight-screen-view" data-imory-href="highlights.foldersHref" data-imory-bind="highlights.foldersLabel"></a>
      </nav>

      <h1 class="highlight-folder-name" data-imory-if="highlights.view.isFolder" data-imory-bind="highlights.folder.name"></h1>

      <p class="highlight-screen-state" data-imory-if="highlights.hasError">하이라이트를 불러오지 못했습니다.</p>
      <p class="highlight-screen-sample" data-imory-if="highlights.isSample">아직 하이라이트가 없어 샘플 카드를 보여 주고 있습니다. 공개 화면에는 나오지 않습니다.</p>

      <div class="highlight-folder-grid" data-imory-if="highlights.view.isFolders">
        <a class="highlight-folder-card" data-imory-repeat="highlights.folders" data-imory-href="item.href">
          <span class="highlight-folder-cover" data-imory-if="item.hasCover">
            <img data-imory-src="item.coverUrl" alt="">
          </span>
          <span class="highlight-folder-name" data-imory-bind="item.name"></span>
          <span class="highlight-folder-count" data-imory-bind="item.countLabel"></span>
        </a>
      </div>

      <div class="highlight-card-list" data-imory-if="highlights.showCards">
        <article class="highlight-card" data-imory-repeat="highlights.cards" data-imory-color="item.color">
          <blockquote class="highlight-card-excerpt" data-imory-bind="item.excerpt"></blockquote>
          <p class="highlight-card-note" data-imory-if="item.hasNote" data-imory-bind="item.note"></p>
          <div class="highlight-card-meta">
            <a class="highlight-card-source" data-imory-if="item.postHref" data-imory-href="item.postHref" data-imory-bind="item.sourcePathLabel"></a>
            <span class="highlight-card-source" data-imory-if="item.hasNoPostLink" data-imory-bind="item.sourcePathLabel"></span>
            <span data-imory-bind="item.dateLabel"></span>
            <span class="highlight-card-missing" data-imory-if="item.isMissing">원문에서 위치를 찾을 수 없음</span>
            <span class="highlight-card-unchecked" data-imory-if="item.isPlacementUnknown">원문 위치 확인 전</span>
          </div>
          <div class="highlight-card-actions">
            <a class="highlight-card-open" data-imory-if="item.postHref" data-imory-href="item.postHref">원문 보기</a>
            <span data-imory-region="highlight-tools"></span>
          </div>
        </article>
      </div>

      <p class="highlight-screen-state" data-imory-if="highlights.isEmpty">아직 하이라이트가 없습니다.</p>
      <p class="highlight-screen-state" data-imory-if="highlights.foldersEmpty">아직 하이라이트가 없습니다.</p>

    </section>`,

    /*
      카드 왼쪽 강조선은 **그 하이라이트의 색**이다 — 렌더러가 카드
      요소에 --imory-color 를 얹어 준다(data-imory-color, skin/
      skin-render.js). 색이 없거나 모양이 틀린 카드에서는 변수 자체가
      없으므로 아래 기본색이 그대로 쓰인다. 나머지 배치는
      posts/posts-highlight.css 가 담당한다(스킨이 자기 template 을
      가지면 이 CSS 는 아예 쓰이지 않는다).
    */
    css: `.highlight-card { border-left: 3px solid var(--imory-color, #e6e3e6); padding-left: 12px; }
      .highlight-card-source { display: block; }`

  };

}


/* =========================================================
   resolveSkinHighlightsTemplate(skinPackage) -> { html, css } | undefined

   렌더 우선순위(HIGHLIGHT-2 §11):
     1. templates.highlights   — 공식 이름
     2. templates.memos        — HIGHLIGHT-1 스킨 호환
     (없으면 호출자가 getDefaultHighlightsTemplate()을 쓴다)

   두 이름을 동시에 그리지 않는다 — 먼저 찾은 하나만 돌려준다.
========================================================== */

function resolveSkinHighlightsTemplate(
  skinPackage
) {

  for (const name of SKIN_HIGHLIGHTS_TEMPLATE_NAMES) {

    const template =
      resolveSkinTemplate(skinPackage, name);


    if (template) {

      return template;

    }

  }


  return undefined;

}


/* =========================================================
   resolveSkinTemplate(skinPackage, pageType) -> { html, css } | undefined

   우선순위(PHASE1C 14-1절):
   1. skinPackage.templates?.[pageType] — 명시적으로 저장된
      페이지별 template이 있으면 항상 그것을 쓴다.
   2. pageType이 "home"이고 templates.home이 없으면 기존
      top-level skinPackage.html/css로 폴백한다 — 기존
      published/draft HOME Skin(templates 필드 자체가 없는 Skin)은
      이 계약이 도입돼도 단 한 byte도 다시 저장할 필요가 없다.
   3. 그 외(category/post/banner인데 templates에 해당 페이지가 없음)에는
      undefined를 돌려준다 — "지원하지 않음"을 명시적으로 표현하는
      것이지, HOME html을 category/post에 억지로 재사용하지
      않는다. 호출자(미래의 CATEGORY/POST Skin Renderer)는
      undefined를 받으면 legacy 렌더 경로로 폴백해야 한다
      (skin-home.js가 published Skin 없을 때 legacy HOME으로
      폴백하는 것과 동일한 패턴).
========================================================== */

function resolveSkinTemplate(
  skinPackage,
  pageType
) {

  if (
    !skinPackage ||
    !SKIN_TEMPLATE_PAGE_TYPES.includes(pageType)
  ) {

    return undefined;

  }


  /*
    SANDBOX-5A — 작성 JS 는 페이지별이 아니라 스킨 한 벌이다.

    여기에 실어 보내는 이유는 호출자 수다. 이 함수의 결과가 곧
    "이 화면을 그리는 재료"이고, 공개 다섯 화면과 Studio Preview 가
    전부 이 객체 하나를 들고 다닌다 — 별도 인자로 만들면 같은 값을
    여섯 군데에서 따로 꺼내 넘겨야 하고, 한 군데를 빠뜨리면 그
    화면에서만 JS 가 조용히 빠진다.

    native 렌더러는 이 키를 읽지 않는다(renderSkin 은 html/css 만
    본다) — renderMode:"native" 에서 무시된다는 계약이 그래서 코드
    모양으로 성립한다.
  */

  const authorJs =
    resolveSkinAuthorJs(skinPackage);


  const explicitTemplate =
    skinPackage.templates?.[pageType];

  if (explicitTemplate && typeof explicitTemplate.html === "string") {

    return {
      html: explicitTemplate.html,
      css:
        typeof explicitTemplate.css === "string"
          ? explicitTemplate.css
          : (skinPackage.css || ""),
      js: authorJs
    };

  }


  if (
    pageType === "home" &&
    typeof skinPackage.html === "string"
  ) {

    return {
      html: skinPackage.html,
      css: skinPackage.css || "",
      js: authorJs
    };

  }


  return undefined;

}


/* =========================================================
   skinPackageSupportsPageType(skinPackage, pageType) -> boolean

   실제 지원 여부는 resolveSkinTemplate()이 값을 돌려주는지로
   판단한다 — skinPackage.metadata.supports는 신뢰 경계로 쓰지
   않는다(사용자 요청 6절, PHASE1C 1-5/14-2절: metadata는 오늘
   순수 정보성 필드이고 렌더러가 이 값을 읽어서 분기하지 않는다).
========================================================== */

function skinPackageSupportsPageType(
  skinPackage,
  pageType
) {

  return (
    resolveSkinTemplate(skinPackage, pageType) !==
    undefined
  );

}


/* =========================================================
   htmlHasPostBodyRegion(html) -> boolean (PHASE 1C-J, PHASE 1
   Final Gap 공용화)

   POST 페이지 HTML에 실제 글 본문이 표시될 자리
   (data-imory-region="post-body")가 남아 있는지 검사한다. 원래
   studio/studio-preview.js 안에 Code Editor 전용으로만 있었으나,
   SkinPackage Import(skin/skin-package-import.js)도 동일한 계약을
   검증해야 하므로 이 파일로 옮겨 두 호출자가 공유한다. DOMParser로
   파싱해 판정한다(정규식으로 raw 문자열을 훑지 않음 — 속성 순서/
   따옴표 형태에 흔들리지 않기 위해).
========================================================== */

function htmlHasPostBodyRegion(html) {

  const parsed =
    new DOMParser().parseFromString(
      String(html || ""),
      "text/html"
    );

  return (
    !!parsed.querySelector('[data-imory-region="post-body"]')
  );

}


/* =========================================================
   skinTemplateUsesGallery(template) -> boolean (GALLERY-1)

   "이 CATEGORY template이 갤러리 계약을 실제로 쓰는가".

   왜 metadata 플래그가 아니라 마크업을 보는가 — 위
   skinPackageSupportsPageType()의 주석과 정확히 같은 이유다.
   metadata.supports는 신뢰 경계로 쓰지 않는다(PHASE1C 1-5/14-2절).
   지원 여부의 유일한 근거는 "그 template이 그 데이터를 실제로
   그리는가"이고, 그건 data-imory-* 바인딩 경로에 그대로 적혀 있다.

   이 판정이 필요한 이유(기준 문서 §4):
   갤러리 카테고리는 페이지를 나눠 조회하므로 category.posts가
   "그 페이지의 글"이 된다. 갤러리를 모르는 기존 스킨이 그 데이터를
   받으면 아무 조작도 하지 않았는데 목록이 12개로 잘려 보인다.
   그래서 갤러리 계약을 쓰지 않는 스킨에서는 플랫폼이 갤러리 모드
   자체를 켜지 않고 지금까지와 100% 동일한 목록 조회를 한다 —
   설정은 남아 있고, 갤러리를 아는 스킨으로 바꾸면 그때 살아난다.

   정규식으로 raw 문자열을 훑지 않고 DOMParser로 판정한다
   (htmlHasPostBodyRegion과 같은 이유 — 속성 순서/따옴표 형태에
   흔들리지 않기 위해).
========================================================== */

const SKIN_GALLERY_BINDING_ATTRS =
  [
    "data-imory-repeat",
    "data-imory-if",
    "data-imory-bind",
    "data-imory-src",
    "data-imory-href",
    /* 재료 일치 라운드에서 더해진 두 종(skin/skin-render.js) — 이
       속성만으로 어떤 Context 경로를 쓰는 스킨도 있을 수 있으므로
       판정 대상에 함께 넣는다. */
    "data-imory-kind",
    "data-imory-color"
  ];

const SKIN_GALLERY_CONTEXT_PREFIXES =
  ["category.gallery", "category.pagination"];


/* HIGHLIGHT-2: 페이지네이션만 따로 판정한다 — 아래 주석 참고 */

const SKIN_PAGINATION_CONTEXT_PREFIXES =
  ["category.pagination"];


/* 재료 일치 라운드: "이 CATEGORY template 이 루트 글 목록
   (category.posts)을 실제로 그리는가" — 아래
   skinTemplateUsesRootPostList() 주석 참고. */

const SKIN_ROOT_POST_LIST_CONTEXT_PREFIXES =
  ["category.posts"];


/* 재료 일치 라운드: "이 HOME template 이 발췌 카드 자리를 그리는가"
   — 아래 skinTemplateUsesHomeHighlights() 주석 참고. */

const SKIN_HOME_HIGHLIGHT_CONTEXT_PREFIXES =
  ["home.highlights"];


/*
  "이 template 이 이 Context 경로들을 실제로 그리는가".
  skinTemplateUsesGallery / skinTemplateUsesPagination 이 공유한다 —
  판정 방법(DOMParser + 바인딩 속성만 본다)은 한 곳에만 둔다.
*/

function skinTemplateUsesContextPrefixes(
  template,
  prefixes
) {

  const html =
    template && typeof template.html === "string"
      ? template.html
      : "";


  if (!html) {

    return false;

  }


  /* 빠른 사전 판정 — 문자열에 아예 없으면 파싱하지 않는다. */

  if (
    !prefixes.some(
      (prefix) => html.includes(prefix)
    )
  ) {

    return false;

  }


  let parsed;

  try {

    parsed =
      new DOMParser().parseFromString(
        html,
        "text/html"
      );

  }

  catch (err) {

    return false;

  }


  const selector =
    SKIN_GALLERY_BINDING_ATTRS
      .map((attr) => `[${attr}]`)
      .join(",");


  return Array.from(
    parsed.querySelectorAll(selector)
  ).some(
    (el) =>
      SKIN_GALLERY_BINDING_ATTRS.some((attr) => {

        const value =
          el.getAttribute(attr) || "";

        return prefixes.some(
          (prefix) =>
            value === prefix ||
            value.startsWith(`${prefix}.`)
        );

      })
  );

}


function skinTemplateUsesGallery(
  template
) {

  return skinTemplateUsesContextPrefixes(
    template,
    SKIN_GALLERY_CONTEXT_PREFIXES
  );

}


/* =========================================================
   skinTemplateUsesPagination(template) -> boolean (HIGHLIGHT-2)

   "이 CATEGORY template 이 category.pagination 을 실제로 그리는가".

   왜 필요한가 — 갤러리 때와 정확히 같은 이유다(위
   skinTemplateUsesGallery 주석). 페이지네이션을 켜면 category.posts 가
   "그 페이지의 글"이 되므로, 페이지 링크를 그리지 않는 기존 스킨이
   그 데이터를 받으면 아무것도 바꾸지 않았는데 목록이 12개로 잘려
   보이고 나머지 글로 갈 방법이 없다. 그래서 페이지 링크를 실제로
   그리는 스킨에서만 페이지 단위 조회를 켠다 — 설정(page_size /
   pagination_style)은 남아 있고, 그런 스킨으로 바꾸면 그때 살아난다.

   갤러리 판정과 따로 두는 이유: 갤러리 쪽은 category.gallery 만 써도
   켜져야 하고(카드 목록 자체가 갤러리 계약이다), post 목록 쪽은
   category.pagination 이 **반드시** 있어야 한다.
========================================================== */

function skinTemplateUsesPagination(
  template
) {

  return skinTemplateUsesContextPrefixes(
    template,
    SKIN_PAGINATION_CONTEXT_PREFIXES
  );

}


function skinPackageUsesPagination(
  skinPackage
) {

  return skinTemplateUsesPagination(
    resolveSkinTemplate(skinPackage, "category")
  );

}


/* =========================================================
   skinTemplateUsesRootPostList(template) -> boolean
   (Skin/Studio/Public 재료 일치 라운드)

   "이 CATEGORY template 이 category.posts 를 실제로 그리는가".

   왜 필요한가 — 페이지네이션이 켜지면 category.tree 에서 **루트 글이
   빠진다**(폴더 노드만 남는다, skin/skin-context.js). 루트 글은 그때
   category.posts 로만 온다. 그래서 폴더 트리만 그리고 category.posts
   는 그리지 않는 스킨에서 페이지네이션을 켜면, 관리 화면에도 있고
   Studio 에서도 보이는 카테고리 루트 글이 공개 화면에서만 통째로
   사라진다(실제로 사용자 스킨에서 이 일이 났다).

   플랫폼이 남의 스킨 마크업을 고칠 수는 없으므로, 갤러리/페이지네이션
   때와 **같은 방식**으로 조건을 하나 더 단다: 루트 글을 받아 그릴
   자리가 없는 스킨에서는 페이지 나누기 자체를 켜지 않는다. 그러면
   그 스킨은 지금까지와 100% 동일한 조회(tree 에 루트 글 포함)를
   하고, 설정은 남아 있다가 category.posts 를 그리는 스킨으로 바꾸면
   그때 살아난다.
========================================================== */

function skinTemplateUsesRootPostList(
  template
) {

  return skinTemplateUsesContextPrefixes(
    template,
    SKIN_ROOT_POST_LIST_CONTEXT_PREFIXES
  );

}


function skinPackageUsesRootPostList(
  skinPackage
) {

  return skinTemplateUsesRootPostList(
    resolveSkinTemplate(skinPackage, "category")
  );

}


/* =========================================================
   skinTemplateUsesHomeHighlights(template) -> boolean
   (Skin/Studio/Public 재료 일치 라운드)

   "이 HOME template 이 home.highlights 를 실제로 그리는가".

   HOME 의 하이라이트 재료는 조회 두 번(post_highlights + post_folders)을
   더 부른다. 그 자리를 그리지 않는 대다수의 스킨에서 그 두 번을 매
   HOME 마다 치르게 할 이유가 없다 — 갤러리/페이지네이션과 같은
   방식으로, 받아 그릴 자리가 있는 스킨에서만 조회한다
   (skin/skin-context.js buildHomeSkinContext 의 wantsHighlights).

   Studio Preview 는 이 판정을 하지 않고 항상 조회한다 — 편집 중에
   마크업을 막 붙인 순간에도 재료가 와 있어야 하기 때문이다.
========================================================== */

function skinTemplateUsesHomeHighlights(
  template
) {

  return skinTemplateUsesContextPrefixes(
    template,
    SKIN_HOME_HIGHLIGHT_CONTEXT_PREFIXES
  );

}


/*
  SkinPackage 단위 편의 함수 — templates.category를 뽑아 위 판정에
  넘긴다. 호출자(skin/skin-category.js, studio/preview/
  preview-navigation.js)가 매번 resolveSkinTemplate을 두 번 부르지
  않게 하기 위한 것뿐이다.
*/

function skinPackageUsesGallery(
  skinPackage
) {

  return skinTemplateUsesGallery(
    resolveSkinTemplate(skinPackage, "category")
  );

}


/* =========================================================
   auditSkinPackageMaterials(skinPackage) -> string[]
   (Skin/Studio/Public 재료 일치 라운드)

   "저장은 되지만 화면에서 조용히 잘못 나오는" SkinPackage를 사람이
   읽을 수 있는 문장으로 알려준다. **거부하지 않는다** — 여기서
   막으면 이미 저장돼 있는 스킨을 다시 가져올 수 없게 되고, 그중
   상당수는 의도한 선택일 수도 있다(요구사항 "기존 호환성을 깨지
   않는 범위"). Import/Save 화면이 이 문장들을 그대로 보여준다.

   판정은 전부 마크업/CSS 자체를 보고 한다 — metadata.supports 를
   신뢰 경계로 쓰지 않는다는 원칙(skinPackageSupportsPageType 주석)은
   그대로다. supports 는 여기서 "작성자가 그렇게 주장했다"는 입력일
   뿐이고, 실제 template 과 어긋날 때 그 어긋남을 알리는 데만 쓴다.
========================================================== */

/* nth-child 규칙이 걸려 있으면 순서 의존 장식으로 의심할 nav 반복 경로 */

const SKIN_AUDIT_NAV_REPEAT_PREFIXES =
  [
    "navigation.categories",
    "navigation.postCategories",
    "navigation.galleryCategories",
    "navigation.textPostCategories",
    "navigation.bannerCategories"
  ];


function collectSkinAuditNavClassNames(html) {

  const names = new Set();

  let parsed;

  try {

    parsed =
      new DOMParser().parseFromString(
        String(html || ""),
        "text/html"
      );

  }

  catch (err) {

    return names;

  }


  Array.from(
    parsed.querySelectorAll("[data-imory-repeat]")
  ).forEach(
    (el) => {

      const path =
        el.getAttribute("data-imory-repeat") || "";


      if (
        !SKIN_AUDIT_NAV_REPEAT_PREFIXES.includes(path)
      ) {

        return;

      }


      /* 반복되는 요소 자신과 그 안쪽의 class 전부가 후보다 */

      [el, ...Array.from(el.querySelectorAll("*"))].forEach(
        (node) => {

          String(node.getAttribute("class") || "")
            .split(/\s+/)
            .filter(Boolean)
            .forEach(
              (name) => names.add(name)
            );

        }
      );

    }
  );


  return names;

}


function auditSkinPackageMaterials(skinPackage) {

  const warnings = [];


  if (!skinPackage || typeof skinPackage !== "object") {

    return warnings;

  }


  const templates =
    (skinPackage.templates && typeof skinPackage.templates === "object")
      ? skinPackage.templates
      : {};

  const supports =
    (
      skinPackage.metadata &&
      typeof skinPackage.metadata === "object" &&
      skinPackage.metadata.supports &&
      typeof skinPackage.metadata.supports === "object"
    )
      ? skinPackage.metadata.supports
      : {};


  /* 1) supports 만 선언하고 실제 template 을 빼먹은 경우 */

  const claimsHighlights =
    supports.highlights === true ||
    supports.memos === true;

  const hasHighlightsTemplate =
    SKIN_HIGHLIGHTS_TEMPLATE_NAMES.some(
      (name) =>
        templates[name] &&
        typeof templates[name].html === "string"
    );

  if (claimsHighlights && !hasHighlightsTemplate) {

    warnings.push(
      "metadata.supports.highlights 가 true 인데 templates.highlights 가 없습니다 — 하이라이트 화면은 플랫폼 기본 template 으로 그려집니다(이 스킨의 디자인이 아닙니다)."
    );

  }


  /* 2) 페이지 링크는 그리면서 루트 글 목록은 그리지 않는 CATEGORY */

  const categoryTemplate =
    resolveSkinTemplate(skinPackage, "category");

  if (
    categoryTemplate &&
    skinTemplateUsesPagination(categoryTemplate) &&
    !skinTemplateUsesRootPostList(categoryTemplate)
  ) {

    warnings.push(
      "CATEGORY 템플릿이 category.pagination 은 그리는데 category.posts 를 그리지 않습니다 — 페이지를 나누면 폴더에 들어 있지 않은 글이 화면에서 사라지므로, 플랫폼은 이 스킨에서 페이지 나누기를 켜지 않습니다."
    );

  }


  /* 3) 카테고리 아이콘을 순서(nth-child)로 결정하는 CSS */

  const css =
    typeof skinPackage.css === "string"
      ? skinPackage.css
      : "";

  if (css.includes("nth-child")) {

    const navClassNames =
      new Set();

    ["home", "category", "post", "banner", "folder", ...SKIN_HIGHLIGHTS_TEMPLATE_NAMES].forEach(
      (pageType) => {

        const template =
          templates[pageType];


        if (template && typeof template.html === "string") {

          collectSkinAuditNavClassNames(template.html).forEach(
            (name) => navClassNames.add(name)
          );

        }

      }
    );

    if (typeof skinPackage.html === "string") {

      collectSkinAuditNavClassNames(skinPackage.html).forEach(
        (name) => navClassNames.add(name)
      );

    }


    /* selector(={ 앞) 안에 nth-child 와 nav class 가 함께 있는 규칙만 */

    const orderDependentSelector =
      css
        .split("}")
        .map(
          (chunk) => chunk.split("{")[0] || ""
        )
        .find(
          (selector) =>
            selector.includes("nth-child") &&
            Array.from(navClassNames).some(
              (name) =>
                selector.includes(`.${name}`)
            )
        );

    if (orderDependentSelector) {

      warnings.push(
        `카테고리 메뉴의 모양이 순서에 묶여 있습니다(${orderDependentSelector.trim()}) — 사용자가 카테고리 순서를 바꾸거나 하나를 지우면 아이콘이 어긋납니다. data-imory-kind="item.iconKind" 로 종류를 얹고 [data-kind="..."] 로 그리세요.`
      );

    }

  }


  /* 4) Studio 에서만 존재하는 샘플 문구가 template 에 박힌 경우

     Preview 는 계정에 하이라이트가 하나도 없을 때 샘플 카드를 끼워
     넣는다(studio/preview/preview-navigation.js). 그 문장을 보고
     template 에 그대로 적어 두면 방문자 화면에도 남는다. 샘플 목록의
     소유자는 Preview 쪽이므로 전역이 있으면 그것을 읽는다 — 여기에
     문장을 복사해 두면 두 벌이 갈라진다. */

  const sampleTexts =
    (
      typeof window !== "undefined" &&
      Array.isArray(window.STUDIO_HIGHLIGHT_SAMPLE_TEXTS)
    )
      ? window.STUDIO_HIGHLIGHT_SAMPLE_TEXTS
      : [];

  if (sampleTexts.length) {

    const allHtml =
      [
        typeof skinPackage.html === "string" ? skinPackage.html : "",
        ...Object.keys(templates).map(
          (pageType) =>
            (templates[pageType] && typeof templates[pageType].html === "string")
              ? templates[pageType].html
              : ""
        )
      ].join("\n");

    const leaked =
      sampleTexts.find(
        (text) =>
          typeof text === "string" &&
          text.trim() &&
          allHtml.includes(text)
      );

    if (leaked) {

      warnings.push(
        `Studio 미리보기 전용 샘플 문구가 템플릿에 들어 있습니다("${leaked.slice(0, 20)}…") — 공개 화면에도 그대로 나옵니다. 바인딩(data-imory-bind)으로 바꾸세요.`
      );

    }

  }


  /* 5) 배치 primitive 가 조용히 무시되는 조합

     IMORY_LAYOUT_PRIMITIVE_DESIGN.md. 판정은 skin/skin-layout.js
     한 곳에만 있고 여기서는 페이지마다 불러 모으기만 한다 —
     "저장은 되는데 화면에서 아무 일도 안 일어나는" 배치 선언
     (격자에 direction 을 준다든가, 사이드바에 slot 자식이 없다든가)
     을 사람이 읽을 문장으로 돌려준다. 거부가 아니라 경고다.

     DOMParser 가 없는 환경(node 단위 테스트에서 이 함수를 직접
     부르는 경우)에서는 조용히 건너뛴다 — 배치 감사는 그쪽에서
     skin-layout.js 를 직접 본다. */

  if (
    typeof auditSkinLayoutDocument === "function" &&
    typeof DOMParser !== "undefined"
  ) {

    const parser = new DOMParser();

    const layoutPages =
      [["HOME", typeof skinPackage.html === "string" ? skinPackage.html : ""]]
        .concat(
          Object.keys(templates).map(
            (pageType) => [
              pageType.toUpperCase(),
              (templates[pageType] && typeof templates[pageType].html === "string")
                ? templates[pageType].html
                : ""
            ]
          )
        );

    layoutPages.forEach(([label, html]) => {

      if (!html || html.indexOf("data-imory-layout") === -1) {
        return;
      }

      const doc =
        parser.parseFromString(html, "text/html");

      auditSkinLayoutDocument(doc.body, label).forEach(
        (warning) => warnings.push(warning)
      );

    });

  }


  /* 6) 전환 primitive 가 조용히 무시되는 조합(TRANSITION-1)

     효과 없이 속도만 적힌 요소, 방향이 뜻이 없는 효과에 적힌 방향,
     여는 패널이 같은 템플릿에 없는 토글. 판정은
     skin/skin-transition.js 한 곳에만 있다 — 배치 감사와 같은 방식. */

  if (
    typeof auditSkinTransitionDocument === "function" &&
    typeof DOMParser !== "undefined"
  ) {

    const parser = new DOMParser();

    [["HOME", typeof skinPackage.html === "string" ? skinPackage.html : ""]]
      .concat(
        Object.keys(templates).map(
          (pageType) => [
            pageType.toUpperCase(),
            (templates[pageType] && typeof templates[pageType].html === "string")
              ? templates[pageType].html
              : ""
          ]
        )
      )
      .forEach(([label, html]) => {

        if (
          !html ||
          (html.indexOf("data-imory-transition") === -1 && html.indexOf("data-imory-toggle") === -1)
        ) {
          return;
        }

        auditSkinTransitionDocument(
          parser.parseFromString(html, "text/html").body,
          label
        ).forEach((warning) => warnings.push(warning));

      });

  }


  return warnings;

}


if (typeof window !== "undefined") {

  window.skinTemplateUsesGallery =
    skinTemplateUsesGallery;

  window.auditSkinPackageMaterials =
    auditSkinPackageMaterials;

  window.skinPackageUsesGallery =
    skinPackageUsesGallery;

  window.skinTemplateUsesPagination =
    skinTemplateUsesPagination;

  window.skinPackageUsesPagination =
    skinPackageUsesPagination;

  window.skinTemplateUsesRootPostList =
    skinTemplateUsesRootPostList;

  window.skinPackageUsesRootPostList =
    skinPackageUsesRootPostList;

  window.resolveSkinHighlightsTemplate =
    resolveSkinHighlightsTemplate;

  window.getDefaultHighlightsTemplate =
    getDefaultHighlightsTemplate;

  window.SKIN_HIGHLIGHTS_TEMPLATE_NAMES =
    SKIN_HIGHLIGHTS_TEMPLATE_NAMES;

}
