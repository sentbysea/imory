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
     parent -> iframe  "preview:render"   { type, skin, context }
     iframe -> parent  "preview:ready"    { type }
     iframe -> parent  "preview:rendered" { type, hasPostBodyRegion }
     iframe -> parent  "preview:error"    { type, message }
     iframe -> parent  "preview:navigate" { type, href }

   보안 경계(Slice 3.5 그대로 유지, 12절): 여기서 skin/context를
   신뢰 입력으로 취급하지 않는다 — 최종 DOM 반영은 항상
   renderSkin()을 통과하며(내부에서 매번 sanitize/validate를 다시
   실행), 이 파일 어디에도 raw innerHTML/style 직접 삽입이 없다.
   render 인스턴스는 처음 한 번만 만들고, 이후 메시지는 매번
   update()로 반영해 인스턴스를 유지한다(같은 keyframe namespace
   유지, skin-render.js 305행대 참고).

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
