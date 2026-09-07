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
     parent -> iframe  "preview:render"        { type, skin, context }
     parent -> iframe  "preview:render-banner" { type, categoryName, items }
     iframe -> parent  "preview:ready"         { type }
     iframe -> parent  "preview:rendered"      { type, hasPostBodyRegion }
     iframe -> parent  "preview:error"         { type, message }
     iframe -> parent  "preview:navigate"      { type, href }

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
