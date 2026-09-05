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
     parent -> iframe  "preview:render"  { type, skin, context }
     iframe -> parent  "preview:ready"   { type }
     iframe -> parent  "preview:rendered" { type }
     iframe -> parent  "preview:error"   { type, message }

   보안 경계(Slice 3.5 그대로 유지, 12절): 여기서 skin/context를
   신뢰 입력으로 취급하지 않는다 — 최종 DOM 반영은 항상
   renderSkin()을 통과하며(내부에서 매번 sanitize/validate를 다시
   실행), 이 파일 어디에도 raw innerHTML/style 직접 삽입이 없다.
   render 인스턴스는 처음 한 번만 만들고, 이후 메시지는 매번
   update()로 반영해 인스턴스를 유지한다(같은 keyframe namespace
   유지, skin-render.js 305행대 참고).
========================================================== */

import { renderSkin } from "../../skin/skin-render.js";

const PREVIEW_MSG_RENDER = "preview:render";
const PREVIEW_MSG_READY = "preview:ready";
const PREVIEW_MSG_RENDERED = "preview:rendered";
const PREVIEW_MSG_ERROR = "preview:error";

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

    postToParent({ type: PREVIEW_MSG_RENDERED });

  } catch (err) {

    console.error("[preview-bridge] render failed", err);

    postToParent({
      type: PREVIEW_MSG_ERROR,
      message: err?.message || "unknown render error"
    });

  }

}

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

});

/* 모듈 자체 로드가 끝나는 시점(정적 import까지 전부 완료된 뒤)에
   ready를 보낸다 — 부모가 이 신호를 받기 전에 preview:render를
   보내면 유실될 수 있으므로, studio-preview.js는 이 메시지를
   받은 뒤에만 render를 보낸다(폴링 없는 핸드셰이크, skin-home.js/
   skin-initializer.js의 Promise 핸드셰이크와 같은 결). */
postToParent({ type: PREVIEW_MSG_READY });
