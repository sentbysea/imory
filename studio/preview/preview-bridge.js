/* =========================================================
   PREVIEW BRIDGE (iframe 쪽)

   AI_SKIN_PHASE1B_DESIGN.md Slice 3, 11/12절. studio/preview/
   preview-frame.html 안에서만 실행되는 ES 모듈 — 부모 문서
   (studio/index.html, 부모 쪽 로직은 studio/studio-preview.js)와
   postMessage로만 통신한다. 두 문서는 서로 다른 browsing context라
   전역을 공유하지 않으므로, 메시지 타입 문자열은 studio-preview.js
   쪽에도 동일하게 하드코딩되어 있다(상수를 import로 공유할 수
   없는 두 개의 독립 문서 쌍이라 그렇다 — 값을 바꿀 땐 두 파일을
   함께 고쳐야 한다).

   postMessage contract(양쪽 다 origin + shape 검증, 12절):
     parent -> iframe  "preview:render"          { type, skin, context }
     parent -> iframe  "preview:render-banner"   { type, categoryName, items }
     parent -> iframe  "preview:ping"            { type }
     parent -> iframe  "preview:inspector-mode"  { type, enabled }
     parent -> iframe  "preview:inspector-select"{ type, editId }
     parent -> iframe  "preview:inspect-preview" { type, editId, text?, width?, ratio?, clear? }
     iframe -> parent  "preview:ready"           { type }
     iframe -> parent  "preview:rendered"        { type, hasPostBodyRegion }
     iframe -> parent  "preview:error"           { type, message }
     iframe -> parent  "preview:navigate"        { type, href }
     iframe -> parent  "preview:inspect-hover"   { type, editId, tagName, rect }
     iframe -> parent  "preview:inspect-select"  { type, editId, tagName, rect, metrics }
     iframe -> parent  "preview:inspect-rects"   { type, hover, selected }
     iframe -> parent  "preview:inspect-escape"  { type }

   Select mode 직접 편집 라운드 — "preview:inspect-preview"는 이
   문서의 live DOM만 임시로 바꾼다(저장되지 않는다). 확정은 언제나
   parent가 SkinPackage를 고쳐 "preview:render"를 다시 보내는 경로
   하나뿐이다. metrics도 좌표와 같은 성격의 **실측 숫자**만 담는다
   (폭/높이/자연 크기/부모 안쪽 폭).

   PHASE AI-6A(Element Inspector) — 위 inspect-* 넷은 **DOM 노드도
   HTML 문자열도 절대 담지 않는다**. 올라가는 것은 식별자 문자열
   하나(data-imory-edit-id), 태그 이름, 그리고 사각형 좌표 네 개뿐
   이다. 고른 요소가 실제로 어떤 요소인지(바인딩/보호 여부/가능한
   수정)는 parent가 자기가 갖고 있는 SkinPackage에서 그 id로 다시
   찾아 판단한다 — iframe이 판단해서 올려보내지 않는다.

   보안 경계(Slice 3.5 그대로 유지, 12절): 여기서 skin/context를
   신뢰 입력으로 취급하지 않는다 — 최종 DOM 반영은 항상
   renderSkin()을 통과하며(내부에서 매번 sanitize/validate를 다시
   실행), 이 파일 어디에도 raw innerHTML/style 직접 삽입이 없다.
   render 인스턴스는 처음 한 번만 만들고, 이후 메시지는 매번
   update()로 반영해 인스턴스를 유지한다(같은 keyframe namespace
   유지, skin-render.js 305행대 참고).

   "preview:render-banner"(Studio Banner Category Preview, Skin
   template 시스템 밖)도 같은 원칙을 따른다 — parent(studio/preview/
   preview-navigation.js)가 이미 isSafeSkinUrl()로 href/imageUrl을
   걸렀다고 해서 여기서 그 값을 그대로 믿지 않는다. handleBannerMessage()
   는 DOM에 실제로 반영하는 이 지점에서 다시 한번 isSafeSkinUrl()로
   재검증하고(전역, skin-sanitize.js가 이 문서에도 classic script로
   먼저 로드되어 있다), 이름 등 모든 텍스트는 textContent로만 넣는다
   (innerHTML 사용 없음, renderSkin()과 동일한 신뢰 경계).

   PHASE 1C-G(문서 4/5/6절) — Preview 내부 링크 interception: 렌더된
   Skin 안의 <a href> 클릭을 이 문서(iframe) 안에서만 가로챈다.
   route business logic(owner slug/카테고리·글 id 판별)은 여기서
   하지 않는다 — href 문자열만 그대로 parent에 전달하고, 실제 파싱은
   parent(studio/preview/preview-navigation.js의
   resolveStudioPreviewTarget)가 담당한다(문서 6절 "iframe이 route
   business logic을 깊게 알지 않게 하세요").
========================================================== */

import { renderSkin } from "../../skin/skin-render.js";

const PREVIEW_MSG_RENDER = "preview:render";
const PREVIEW_MSG_RENDER_BANNER = "preview:render-banner";
const PREVIEW_MSG_READY = "preview:ready";
const PREVIEW_MSG_RENDERED = "preview:rendered";
const PREVIEW_MSG_ERROR = "preview:error";
const PREVIEW_MSG_NAVIGATE = "preview:navigate";
const PREVIEW_MSG_POST_BODY = "preview:post-body";
const PREVIEW_MSG_FOLDER_BODIES = "preview:folder-bodies";
const PREVIEW_MSG_PING = "preview:ping";

const PREVIEW_MSG_INSPECTOR_MODE = "preview:inspector-mode";
const PREVIEW_MSG_INSPECTOR_SELECT = "preview:inspector-select";
const PREVIEW_MSG_INSPECT_HOVER = "preview:inspect-hover";
const PREVIEW_MSG_INSPECT_SELECT = "preview:inspect-select";
const PREVIEW_MSG_INSPECT_RECTS = "preview:inspect-rects";
const PREVIEW_MSG_INSPECT_ESCAPE = "preview:inspect-escape";
const PREVIEW_MSG_INSPECT_PREVIEW = "preview:inspect-preview";

const POST_BODY_REGION_NAME = "post-body";

const previewRoot = document.getElementById("previewRoot");

let renderInstance = null;

function postToParent(message) {

  if (!window.parent || window.parent === window) {
    return;
  }

  window.parent.postMessage(message, window.location.origin);

}

/* =========================================================
   메시지 검증 — origin + source(event.source === window.parent,
   부모 studio-preview.js의 event.source === studioPreviewFrame.
   contentWindow 확인과 대칭) + shape 세 가지를 모두 확인한다
   (12절 "같은 origin이라도 message shape validation은 하세요").
========================================================== */

function isValidRenderMessage(data) {

  return (
    data &&
    typeof data === "object" &&
    data.type === PREVIEW_MSG_RENDER &&
    typeof data.skin === "object" &&
    data.skin !== null &&
    typeof data.context === "object" &&
    data.context !== null
  );

}

function handleRenderMessage(data) {

  try {

    if (renderInstance) {
      renderInstance.update(data.skin, data.context);
    } else {
      renderInstance = renderSkin({
        container: previewRoot,
        skin: data.skin,
        context: data.context,
        mode: "preview"
      });
    }

    /*
      PHASE 1H: 공개 POST 화면은 스킨 루트에 읽기 모드 상태를 싣는다
      (skin/skin-post-focus.js) — Preview가 그걸 빼먹으면 좁은 폭에서
      공개 화면과 다른 배치가 나온다(기준 문서 §4-2 2번). 값은 항상
      "on"이다: Preview에는 "목록에서 눌러 들어온다"는 이전 화면이
      없으므로 공개 화면의 직접 접속과 같은 상태로 둔다(전환 재생 없이
      최종 배치). 상태를 쓰지 않는 스킨에는 아무 영향이 없다.
    */
    const previewSkinRoot =
      previewRoot.querySelector("[data-skin-root]");

    if (previewSkinRoot) {

      if (data.context?.page?.isPost) {
        previewSkinRoot.setAttribute("data-imory-post-focus", "on");
      } else {
        previewSkinRoot.removeAttribute("data-imory-post-focus");
      }

    }

    /*
      post-body region 존재 여부(PHASE1C 7/13절)는 parent가 판단할 수
      없다 — 실제 mount된 DOM은 이 iframe 안에만 있으므로, 매 렌더마다
      알려준다(HOME/CATEGORY 렌더에서는 studio-preview.js가 이 값을
      무시한다).
    */
    postToParent({
      type: PREVIEW_MSG_RENDERED,
      hasPostBodyRegion: !!renderInstance.getRegion(POST_BODY_REGION_NAME)
    });

    /*
      PHASE AI-6A — 재렌더로 DOM이 통째로 교체됐으므로 이전에 잡아
      둔 element 참조는 전부 detached다. 같은 id의 요소를 다시 찾아
      좌표를 올려보낸다(못 찾으면 selected:null이 올라가 Studio가
      선택을 해제한다).
    */
    if (inspectorEnabled) {

      inspectorHoverElement = null;

      /* 임시 미리보기는 재렌더로 사라진 DOM 위에 있었다 — 되돌릴
         대상이 없으므로 참조만 버린다(확정된 결과는 이미 새로
         그려진 스킨 안에 들어 있다). */
      clearInspectorPreview({ discard: true });

      postInspectorRects();

    }

  } catch (err) {

    console.error("[preview-bridge] render failed", err);

    postToParent({
      type: PREVIEW_MSG_ERROR,
      message: err?.message || "unknown render error"
    });

  }

}

/* =========================================================
   BANNER CATEGORY (Studio Banner Category Preview) — Skin template
   시스템 밖에서 이 문서가 직접 그리는 read-only adapter. 공개
   Banner 렌더러(posts/view/posts-view-banner.js)의 DOM 모양(banner-grid
   > banner-card > banner-card-image/banner-card-name, 같은 CSS
   클래스라 posts/view/posts-view-banner.css를 그대로 재사용한다,
   이 문서 <head> 참고)을 그대로 재현하되, edit 모드/컨트롤은
   전혀 만들지 않는다(읽기 전용).

   name은 항상 textContent로만 넣는다(innerHTML 없음, 파일 상단
   신뢰 경계 참고) — href/imageUrl은 parent가 이미 isSafeSkinUrl()로
   걸렀어도 이 지점에서 다시 검증한다: 안전한 https href가 있을
   때만 <a>(target=_blank, rel=noopener noreferrer)로 만들고, 없으면
   평범한 <div>로 만들어 클릭해도 아무 데도 이동하지 않는다(요구사항
   4절). 안전한 이미지 URL이 없으면 <img> 자체를 만들지 않는다
   (깨진 이미지 아이콘 대신 조용히 생략).
========================================================== */

function isValidBannerMessage(data) {

  return (
    data &&
    typeof data === "object" &&
    data.type === PREVIEW_MSG_RENDER_BANNER &&
    Array.isArray(data.items)
  );

}

function buildBannerCardElement(doc, item) {

  const hasSafeHref =
    typeof item?.href === "string" && isSafeSkinUrl(item.href);

  const card =
    doc.createElement(hasSafeHref ? "a" : "div");

  card.className = "banner-card";

  if (hasSafeHref) {
    card.setAttribute("href", item.href);
    card.setAttribute("target", "_blank");
    card.setAttribute("rel", "noopener noreferrer");
  }

  const hasSafeImage =
    typeof item?.imageUrl === "string" && isSafeSkinUrl(item.imageUrl);

  if (hasSafeImage) {

    const image = doc.createElement("img");
    image.className = "banner-card-image";
    image.setAttribute("src", item.imageUrl);
    image.alt = typeof item.name === "string" ? item.name : "";
    image.loading = "lazy";
    card.appendChild(image);

  }

  if (typeof item?.name === "string" && item.name.trim()) {

    const name = doc.createElement("div");
    name.className = "banner-card-name";
    name.textContent = item.name;
    card.appendChild(name);

  }

  return card;

}

function handleBannerMessage(data) {

  try {

    previewRoot.innerHTML = "";

    const doc = previewRoot.ownerDocument;

    const grid = doc.createElement("div");
    grid.className = "banner-grid";

    if (!data.items.length) {

      const empty = doc.createElement("div");
      empty.className = "banner-grid-empty";
      empty.textContent = "등록된 배너가 없습니다.";
      grid.appendChild(empty);

    } else {

      data.items.forEach((item) => {
        grid.appendChild(buildBannerCardElement(doc, item));
      });

    }

    previewRoot.appendChild(grid);

    /*
      hasPostBodyRegion은 이 렌더와 무관하지만(currentPreviewPageType
      이 "post"가 아닌 "category"일 때만 studio-preview.js가 이
      메시지를 받으므로, 파일 상단 계약과 동일하게 항상 false로
      보낸다 — "preview:render"/renderSkin 경로와 동일한 완료 신호
      형태를 재사용해 parent 쪽에 새 분기를 만들지 않기 위함이다.
    */
    postToParent({
      type: PREVIEW_MSG_RENDERED,
      hasPostBodyRegion: false
    });

  } catch (err) {

    console.error("[preview-bridge] banner render failed", err);

    postToParent({
      type: PREVIEW_MSG_ERROR,
      message: err?.message || "unknown banner render error"
    });

  }

}


/* =========================================================
   post-body 주입 (PHASE 1C-I)

   본문 자체는 renderSkin()이 보지 못한다 — parent(studio/preview/
   preview-post-body.js)가 이미 공개 POST Viewer와 동일한 sanitize/
   서식 파이프라인을 거쳐 만든 안전한 결과물만 여기로 넘어온다.
   이 함수는 skin-post.js/posts-view-detail.js의 "caller가 mount된
   region에 직접 본문을 채운다"는 책임 분리를 이 iframe 경계 안에서
   그대로 재현할 뿐, 새로운 sanitize 로직을 추가하지 않는다.

   renderSkin()이 매 렌더(mount/update)마다 컨테이너를 통째로
   다시 그리므로(PHASE1C 7-6-2절 미해결 지점) region은 항상
   "preview:render" 직후에만 유효하다 — 그래서 currentRoot에서
   매번 다시 querySelector한다(캐싱 금지, skin-post.js와 동일
   원칙). region이 없으면(Skin에 본문 자리가 없거나 아직 렌더
   전이면) 조용히 무시한다 — hasPostBodyRegion=false는 이미
   "preview:rendered"에서 studio-preview.js에 전달되어 unsupported
   overlay로 처리된다.
========================================================== */

function isValidPostBodyMessage(data) {

  return (
    data &&
    typeof data === "object" &&
    data.type === PREVIEW_MSG_POST_BODY &&
    typeof data.html === "string" &&
    typeof data.containerStyle === "string" &&
    typeof data.isHtmlContent === "boolean"
  );

}

function handlePostBodyMessage(data) {

  if (!renderInstance) {
    return;
  }

  const region =
    renderInstance.getRegion(POST_BODY_REGION_NAME);

  if (!region) {
    return;
  }

  region.setAttribute("style", data.containerStyle);

  region.innerHTML = data.html;

}

/* =========================================================
   folder-bodies 주입 (FOLDER-2, Series Viewer)

   폴더 페이지는 post-body region이 글 수만큼 있다. 렌더러가 repeat
   항목의 id를 region에 찍어 두므로(skin-render.js getRegions), 여기서는
   payload의 key와 그 키를 맞춰 채운다 — DOM 순서에 기대지 않는다.
   본문 자체는 post-body와 같은 경로(parent가 이미 서식/sanitize를
   끝낸 결과물)로 온다.
========================================================== */

function isValidFolderBodiesMessage(data) {

  return (
    data &&
    typeof data === "object" &&
    data.type === PREVIEW_MSG_FOLDER_BODIES &&
    Array.isArray(data.bodies) &&
    data.bodies.every((body) =>
      body &&
      typeof body === "object" &&
      typeof body.key === "string" &&
      typeof body.html === "string" &&
      typeof body.containerStyle === "string" &&
      typeof body.isHtmlContent === "boolean"
    )
  );

}

function handleFolderBodiesMessage(data) {

  if (!renderInstance || typeof renderInstance.getRegions !== "function") {
    return;
  }

  const regionsByKey = new Map();

  renderInstance.getRegions(POST_BODY_REGION_NAME).forEach((region) => {

    if (region.key !== null && !regionsByKey.has(region.key)) {
      regionsByKey.set(region.key, region.element);
    }

  });

  data.bodies.forEach((body) => {

    const region =
      regionsByKey.get(body.key);

    if (!region) {
      return;
    }

    region.setAttribute("style", body.containerStyle);

    region.classList.toggle("is-html-content", body.isHtmlContent);

    region.innerHTML = body.html;

  });

}

/* =========================================================
   ELEMENT INSPECTOR — iframe 쪽 (PHASE AI-6A)

   Inspector가 **꺼져 있는 동안에는 이 절의 코드가 화면에 아무런
   영향도 주지 않는다**(요구사항 1절 "Inspector mode가 아닐 때 기존
   Preview 동작을 절대 방해하지 않는다"). 리스너는 문서에 상시
   달려 있지만 전부 첫 줄에서 inspectorEnabled를 확인하고 즉시
   빠져나간다 — 켜고 끌 때마다 리스너를 붙였다 뗐다 하면 "껐는데
   하나가 남아 있다"는 상태가 생길 수 있어서 상태 하나로만 가른다.

   outline은 여기서 그리지 않는다. 좌표만 parent로 올려보내고
   실제 표시는 Studio가 Preview **위에** 얹은 overlay가 담당한다
   (요구사항 4절 "실제 element CSS를 수정해서 outline을 넣지 말고
   overlay 방식 우선") — 스킨 DOM에는 클래스 하나도 붙지 않으므로
   layout shift도, 스킨 CSS와의 충돌도 원천적으로 없다.

   선택 대상은 element 참조로 들고 있는다(id 문자열만으로는 부족).
   data-imory-repeat로 복제된 항목들은 **같은 template 요소에서
   나왔으므로 id가 서로 같기 때문**이다 — 세 번째 글 항목을 눌렀는데
   첫 번째 항목에 테두리가 그려지면 안 된다. 재렌더로 그 참조가
   문서에서 떨어져 나가면 그때만 id로 다시 찾는다(그 경우 같은
   id의 첫 번째 요소로 붙는다 — 반복 항목이면 첫 항목).
========================================================== */

let inspectorEnabled = false;

let inspectorHoverElement = null;

let inspectorSelectedElement = null;

let inspectorSelectedEditId = null;

let inspectorRectFrame = 0;


function inspectorSkinRoot() {

  return previewRoot.querySelector("[data-skin-root]");

}


function inspectorEditIdOf(el) {

  return el && el.getAttribute
    ? el.getAttribute("data-imory-edit-id")
    : null;

}


/* 클릭/hover가 떨어진 노드에서 위로 올라가며 "사용자가 수정할
   만한 단위"를 찾는다 — 장식용 빈 span/br 하나가 잡히지 않도록
   판정 자체는 studio/inspector/studio-inspector-model.js의
   isInspectableElement() 하나만 쓴다(Studio 쪽과 같은 규칙). */
function resolveInspectableTarget(node) {

  const root =
    inspectorSkinRoot();

  if (!root) {
    return null;
  }

  let current =
    (node && node.nodeType === 1) ? node : (node ? node.parentElement : null);

  while (current && current !== root) {

    if (inspectorEditIdOf(current) && window.isInspectableElement(current)) {
      return current;
    }

    current = current.parentElement;

  }

  return null;

}


function inspectorRectOf(el) {

  if (!el || !el.isConnected) {
    return null;
  }

  const rect =
    el.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };

}


/* =========================================================
   inspectorMetricsOf(el) — Studio의 크기 컨트롤이 필요로 하는 실측값

   "초기값은 화면에 실제로 표시되는 크기를 기준으로 한다"와
   "부모보다 커져 모바일 가로 넘침이 생기지 않게 한다"는 둘 다
   **iframe 안에서만** 잴 수 있다. rect는 Studio가 이미 받고 있지만,
   비율 계산에 쓸 자연 크기와 슬라이더 최대값에 쓸 부모 폭은
   여기서만 알 수 있으므로 함께 올려보낸다.

   parentWidth는 부모의 안쪽 폭(padding 제외)이다 — 그 값을 넘는
   순간이 곧 가로 넘침이 시작되는 지점이다.
========================================================== */
function inspectorMetricsOf(el) {

  if (!el || !el.isConnected) {
    return null;
  }

  const rect =
    el.getBoundingClientRect();

  const parent =
    el.parentElement;

  let parentWidth = 0;

  if (parent) {

    const parentStyle =
      window.getComputedStyle(parent);

    parentWidth =
      parent.clientWidth -
      (parseFloat(parentStyle.paddingLeft) || 0) -
      (parseFloat(parentStyle.paddingRight) || 0);

  }

  return {
    width: rect.width,
    height: rect.height,
    naturalWidth: Number(el.naturalWidth) || 0,
    naturalHeight: Number(el.naturalHeight) || 0,
    parentWidth: Math.max(0, Math.round(parentWidth)),
    viewportWidth: document.documentElement.clientWidth || 0
  };

}


/* 재렌더 뒤에는 이전 element 참조가 detached다 — 그때만 id로 다시
   찾는다(위 파일 주석의 반복 항목 한계 참고). */
function inspectorReviveSelection() {

  if (inspectorSelectedElement && inspectorSelectedElement.isConnected) {
    return inspectorSelectedElement;
  }

  const root =
    inspectorSkinRoot();

  if (!root || !inspectorSelectedEditId) {
    inspectorSelectedElement = null;
    return null;
  }

  inspectorSelectedElement =
    root.querySelector(`[data-imory-edit-id="${inspectorSelectedEditId}"]`) || null;

  return inspectorSelectedElement;

}


function postInspectorRects() {

  if (!inspectorEnabled) {
    return;
  }

  const selected =
    inspectorReviveSelection();

  postToParent({
    type: PREVIEW_MSG_INSPECT_RECTS,
    hover:
      (inspectorHoverElement && inspectorHoverElement.isConnected)
        ? { editId: inspectorEditIdOf(inspectorHoverElement), rect: inspectorRectOf(inspectorHoverElement) }
        : null,
    selected:
      selected
        ? {
            editId: inspectorSelectedEditId,
            rect: inspectorRectOf(selected),
            metrics: inspectorMetricsOf(selected)
          }
        : null
  });

}


function scheduleInspectorRects() {

  if (!inspectorEnabled || inspectorRectFrame) {
    return;
  }

  inspectorRectFrame =
    window.requestAnimationFrame(() => {
      inspectorRectFrame = 0;
      postInspectorRects();
    });

}


function setInspectorHover(el) {

  if (el === inspectorHoverElement) {
    return;
  }

  inspectorHoverElement = el;

  postToParent({
    type: PREVIEW_MSG_INSPECT_HOVER,
    editId: el ? inspectorEditIdOf(el) : null,
    tagName: el ? el.tagName.toLowerCase() : null,
    rect: inspectorRectOf(el)
  });

}


/*
  options.silent — 부모가 시켜서 바꾼 선택은 다시 부모로 올려보내지
  않는다 (PHASE AI-6B).

  올려보내면 부모의 handleStudioInspectorMessage가 그 메시지를 또
  처리하고, 그것이 null이면 clearStudioInspectorSelection()이 다시
  이 프레임으로 null을 내려보내 **메시지가 무한히 오간다**. 값이
  같으니 화면은 멀쩡해 보이지만, 그 사이에 사용자가 새 요소를 고르면
  뒤늦게 도착한 null 하나가 방금 잡은 선택을 지운다 — "선택을 풀고
  곧바로 다른 요소를 고르는" 흐름(AI chip의 ×)에서 실제로 그랬다.

  부모가 시킨 선택은 부모가 이미 알고 있으므로 알릴 것이 없다.
  좌표는 곧이어 postInspectorRects()가 보낸다.
*/
function setInspectorSelection(el, options) {

  inspectorSelectedElement = el;

  inspectorSelectedEditId =
    el ? inspectorEditIdOf(el) : null;

  if (options && options.silent) {
    return;
  }

  postToParent({
    type: PREVIEW_MSG_INSPECT_SELECT,
    editId: inspectorSelectedEditId,
    tagName: el ? el.tagName.toLowerCase() : null,
    rect: inspectorRectOf(el),
    metrics: inspectorMetricsOf(el)
  });

}


/* =========================================================
   임시 미리보기 (Select mode 직접 편집 라운드)

   ★ 여기서 바꾼 것은 **저장되지 않는다**. Save/Publish가 읽는 것은
   Studio가 들고 있는 SkinPackage 문자열이지 이 문서의 live DOM이
   아니다 — 그래서 "입력 중에는 미리보기로만 보고, 적용할 때 한 번의
   편집으로 확정한다"를 재렌더 없이 만들 수 있다. 매 글자/매
   pointermove마다 스킨 전체를 다시 그리면 한글 조합이 끊기고
   (IME는 재생성된 textarea를 따라가지 못한다) undo도 그만큼 쌓인다.

   원래 값은 처음 한 번만 저장해 두고, clear에서 되돌린다. 재렌더가
   일어나면 어차피 DOM이 통째로 교체되므로 그때는 그냥 참조만 버린다.
========================================================== */

let inspectorPreviewNode = null;

let inspectorPreviewRestore = null;


function clearInspectorPreview(options) {


  const node =
    inspectorPreviewNode;

  const restore =
    inspectorPreviewRestore;

  inspectorPreviewNode = null;
  inspectorPreviewRestore = null;

  if (!node || !restore) {
    return;
  }

  /* 재렌더로 떨어져 나간 노드는 되돌릴 것도, 되돌릴 필요도 없다. */
  if (!node.isConnected || (options && options.discard)) {
    return;
  }

  if (typeof restore.text === "string") {
    node.textContent = restore.text;
  }

  /* 선언을 먼저 통째로 비우고(cssText) 원래 값을 되돌린다 — 원래
     style 속성이 없었으면 속성 자체를 지운다. 빈 문자열도 "없었던
     것"으로 취급한다: 선언이 하나도 없는 style="" 는 화면에 아무
     영향이 없지만, 남겨 두면 "임시 변경이 남았나?"를 눈으로 구분할
     수 없게 된다. */
  node.style.cssText = "";

  if (typeof restore.style === "string" && restore.style.trim()) {
    node.setAttribute("style", restore.style);
  } else {
    node.removeAttribute("style");
  }

}


function applyInspectorPreview(data) {

  const selected =
    inspectorReviveSelection();

  if (
    !selected ||
    !inspectorSelectedEditId ||
    data.editId !== inspectorSelectedEditId
  ) {
    clearInspectorPreview();
    return;
  }

  if (selected !== inspectorPreviewNode) {

    clearInspectorPreview();

    inspectorPreviewNode = selected;

    inspectorPreviewRestore = {
      text: null,
      style: selected.getAttribute("style")
    };

  }

  if (typeof data.text === "string") {

    if (typeof inspectorPreviewRestore.text !== "string") {
      inspectorPreviewRestore.text = selected.textContent;
    }

    /* textContent만 쓴다 — 입력을 마크업으로 해석하지 않는다.
       (Studio가 자식 태그 없는 요소에만 이 메시지를 보낸다.) */
    selected.textContent = data.text;

    selected.style.whiteSpace =
      data.text.indexOf("\n") === -1 ? "" : "pre-wrap";

  }

  if (typeof data.width === "number" && Number.isFinite(data.width)) {

    selected.style.width = `${Math.round(data.width)}px`;
    selected.style.height = "auto";
    selected.style.maxWidth = "100%";

    selected.style.aspectRatio =
      (typeof data.ratio === "number" && Number.isFinite(data.ratio) && data.ratio > 0)
        ? String(data.ratio)
        : "";

  }

  postInspectorRects();

}


function setInspectorEnabled(enabled) {

  inspectorEnabled = !!enabled;

  if (!inspectorEnabled) {

    clearInspectorPreview();

    inspectorHoverElement = null;
    inspectorSelectedElement = null;
    inspectorSelectedEditId = null;

  }

  document.body.classList.toggle(
    "imory-inspector-on",
    inspectorEnabled
  );

}


/*
  click은 **capture 단계**에서 받아 그 자리에서 전파를 끊는다 —
  아래 링크 interception 리스너(document bubble)도, 스킨 안의
  어떤 기본 동작도 실행되지 않게 하기 위해서다. 그 리스너도
  자기 첫 줄에서 inspectorEnabled를 한 번 더 확인한다(두 겹으로
  막아 둔다 — 전파 제어 한 가지에만 기대지 않는다).
*/
document.addEventListener(
  "click",
  (event) => {

    if (!inspectorEnabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setInspectorSelection(
      resolveInspectableTarget(event.target)
    );

  },
  true
);


/*
  브라우저 기본 이미지 드래그(ghost image를 끌고 다니는 동작)는
  모서리 핸들 드래그와 정면으로 부딪힌다 — 핸들은 Studio overlay에
  있지만 포인터가 이미지 위를 지나는 순간 이 동작이 시작되면
  pointermove가 끊긴다. Inspector 중에는 아예 시작하지 않게 한다.
*/
document.addEventListener(
  "dragstart",
  (event) => {

    if (!inspectorEnabled) {
      return;
    }

    event.preventDefault();

  },
  true
);


/* 가운데 클릭(새 탭)도 Inspector 중에는 막는다. */
document.addEventListener(
  "auxclick",
  (event) => {

    if (!inspectorEnabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

  },
  true
);


document.addEventListener(
  "pointerover",
  (event) => {

    if (!inspectorEnabled) {
      return;
    }

    setInspectorHover(
      resolveInspectableTarget(event.target)
    );

  },
  true
);


document.addEventListener(
  "pointerout",
  (event) => {

    if (!inspectorEnabled || event.relatedTarget) {
      return;
    }

    setInspectorHover(null);

  },
  true
);


/*
  Escape는 두 문서 모두에서 받아야 한다 — 포커스가 Preview 안에
  있을 때 parent의 keydown은 오지 않는다. 여기서는 판단하지 않고
  parent에 알리기만 한다(선택 해제 정책은 Studio가 갖는다).
*/
document.addEventListener(
  "keydown",
  (event) => {

    if (!inspectorEnabled || event.key !== "Escape") {
      return;
    }

    postToParent({ type: PREVIEW_MSG_INSPECT_ESCAPE });

  },
  true
);


window.addEventListener("scroll", scheduleInspectorRects, true);

window.addEventListener("resize", scheduleInspectorRects);


/* =========================================================
   내부 링크 interception (문서 4/5/23/24절)

   delegated click listener 하나로 처리한다 — renderSkin()이 매
   렌더마다 previewRoot 아래를 통째로 다시 그리므로(container.
   innerHTML 재작성), 개별 앵커에 리스너를 다는 대신 document
   레벨에서 위임한다.

   판정 순서:
   1. 앵커가 아니거나 href가 없으면 무시(기본 동작 없음, 어차피
      아무 일도 안 일어남).
   2. href를 이 문서 origin 기준으로 파싱할 수 없거나(예: 깨진 값)
      http/https가 아니면(예: sanitizer를 어떻게든 피한 mailto:/
      기타 스킴) 아무 것도 하지 않는다 — 브라우저 기본 동작에
      맡기지 않고 그냥 무시한다(이 앵커들은 sanitizer가 이미
      href 자체를 지웠어야 정상이므로 사실상 방어적 코드).
   3. 그 외에는 항상 preventDefault — 이 iframe이 실제 public
      route로 벗어나는 일은 절대 없다.
   4. 같은 origin이면 parent에 raw href만 전달("preview:navigate")
      — route 파싱은 parent 몫(문서 6절).
   5. 다른 origin(외부 링크)이면 새 탭으로만 연다(문서 23절 최소
      정책) — Studio Preview 자신은 절대 그 주소로 이동하지 않는다.
========================================================== */

document.addEventListener("click", (event) => {

  /* PHASE AI-6A — Inspector 중에는 링크가 "선택 대상"일 뿐이다.
     위 capture 리스너가 이미 전파를 끊었지만, 그 한 가지에만
     기대지 않는다. */
  if (inspectorEnabled) {
    return;
  }

  const anchor = event.target?.closest?.("a[href]");

  if (!anchor) {
    return;
  }

  const rawHref = anchor.getAttribute("href");

  if (!rawHref) {
    return;
  }

  let resolved;

  try {
    resolved = new URL(rawHref, window.location.href);
  } catch (err) {
    return;
  }

  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return;
  }

  event.preventDefault();

  if (resolved.origin !== window.location.origin) {
    window.open(resolved.href, "_blank", "noopener,noreferrer");
    return;
  }

  postToParent({
    type: PREVIEW_MSG_NAVIGATE,
    href: resolved.pathname + resolved.search
  });

});

window.addEventListener("message", (event) => {

  if (event.origin !== window.location.origin) {
    return;
  }

  if (event.source !== window.parent) {
    return;
  }

  const data = event.data;

  if (!data || typeof data !== "object" || typeof data.type !== "string") {
    return;
  }

  /*
     ready 재요청("preview:ping") — 아래 파일 끝의 "preview:ready"는
     이 모듈이 평가될 때 딱 한 번만 나간다. parent(studio/studio-preview.js)
     가 그 시점에 아직 message 리스너를 등록하지 못했으면 그 신호는
     받는 곳이 없어 그대로 버려지고, parent는 previewFrameReady가
     영원히 false로 남아 render를 pendingRenderPayload에 영구 대기시킨다
     (= Preview가 계속 blank). 이 문서는 iframe이라 parent보다 훨씬
     적은 직렬 요청만 거치므로, 실제 네트워크(RTT 25ms 이상)에서는
     그 역전이 정상적으로 일어난다 — localhost에서는 거의 재현되지
     않는다.

     그래서 parent는 리스너를 등록한 직후 이 ping을 한 번 보낸다.
     아래 ready 발신은 이 리스너 등록 **뒤에** 실행되므로, ready가
     이미 유실됐다면 이 리스너는 반드시 살아 있다 — 즉 ping은
     항상 도달한다. 반대로 이 문서가 아직 로드 전이면 ping 쪽이
     버려지고 원래의 ready가 parent 리스너에 정상 도착한다. 두 경우
     모두 폴링 없이 덮인다.
  */
  if (data.type === PREVIEW_MSG_PING) {

    postToParent({ type: PREVIEW_MSG_READY });
    return;

  }

  if (data.type === PREVIEW_MSG_RENDER) {

    if (!isValidRenderMessage(data)) {
      postToParent({ type: PREVIEW_MSG_ERROR, message: "malformed preview:render payload" });
      return;
    }

    handleRenderMessage(data);
    return;

  }

  if (data.type === PREVIEW_MSG_RENDER_BANNER) {

    if (!isValidBannerMessage(data)) {
      postToParent({ type: PREVIEW_MSG_ERROR, message: "malformed preview:render-banner payload" });
      return;
    }

    handleBannerMessage(data);
    return;

  }

  if (data.type === PREVIEW_MSG_INSPECTOR_MODE) {

    setInspectorEnabled(data.enabled === true);
    return;

  }

  if (data.type === PREVIEW_MSG_INSPECTOR_SELECT) {

    if (!inspectorEnabled) {
      return;
    }

    const root =
      inspectorSkinRoot();

    setInspectorSelection(
      (root && typeof data.editId === "string" && window.isValidInspectorEditId(data.editId))
        ? root.querySelector(`[data-imory-edit-id="${data.editId}"]`)
        : null,
      { silent: true }
    );

    return;

  }

  if (data.type === PREVIEW_MSG_INSPECT_PREVIEW) {

    if (!inspectorEnabled) {
      return;
    }

    if (data.clear === true) {
      clearInspectorPreview();
      postInspectorRects();
      return;
    }

    if (typeof data.editId !== "string" || !window.isValidInspectorEditId(data.editId)) {
      return;
    }

    applyInspectorPreview(data);

    return;

  }

  if (data.type === PREVIEW_MSG_FOLDER_BODIES) {

    if (!isValidFolderBodiesMessage(data)) {
      postToParent({ type: PREVIEW_MSG_ERROR, message: "malformed preview:folder-bodies payload" });
      return;
    }

    handleFolderBodiesMessage(data);
    return;

  }

  if (data.type === PREVIEW_MSG_POST_BODY) {

    if (!isValidPostBodyMessage(data)) {
      postToParent({ type: PREVIEW_MSG_ERROR, message: "malformed preview:post-body payload" });
      return;
    }

    handlePostBodyMessage(data);
    return;

  }

});

/* 모듈 자체 로드가 끝나는 시점(정적 import까지 전부 완료된 뒤)에
   ready를 보낸다 — 부모가 이 신호를 받기 전에 preview:render를
   보내면 유실될 수 있으므로, studio-preview.js는 이 메시지를
   받은 뒤에만 render를 보낸다(폴링 없는 핸드셰이크, skin-home.js/
   skin-initializer.js의 Promise 핸드셰이크와 같은 결). */
postToParent({ type: PREVIEW_MSG_READY });
