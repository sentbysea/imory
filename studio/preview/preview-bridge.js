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
     parent -> iframe  "preview:render"          { type, skin, renderMode, context }
     parent -> iframe  "preview:render-banner"   { type, categoryName, items }
     parent -> iframe  "preview:ping"            { type }
     parent -> iframe  "preview:inspector-mode"  { type, enabled }
     parent -> iframe  "preview:inspector-select"{ type, editId }
     parent -> iframe  "preview:inspect-preview" { type, editId, text?, width?, ratio?, target?, crop?, clear? }
     iframe -> parent  "preview:ready"           { type }
     iframe -> parent  "preview:rendered"        { type, hasPostBodyRegion }
     iframe -> parent  "preview:error"           { type, message }
     iframe -> parent  "preview:navigate"        { type, href }
     iframe -> parent  "preview:inspect-hover"   { type, editId, tagName, rect, visibleRect }
     iframe -> parent  "preview:inspect-select"  { type, editId, tagName, rect, visibleRect, metrics }
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

import { renderSkin, buildSkinCropGuardDeclarations } from "../../skin/skin-render.js";

/*
  SANDBOX-4 — renderMode:"sandbox" 인 스킨은 이 문서가 직접 그리지
  않고, 공개 화면과 **같은** cross-origin 프레임에 그린다. 분기는
  아래 handleRenderMessage() 첫 줄 하나뿐이고, 그 조건이 거짓이면
  (= 지금까지의 모든 스킨) 이 파일의 동작은 한 줄도 달라지지
  않는다. 자세한 이유는 studio/preview/preview-sandbox.js 상단.
*/

import {
  shouldRenderPreviewInSandbox,
  renderSandboxPreview,
  sendSandboxPreviewPostBody,
  teardownSandboxPreview,
  hasSandboxPreviewFrame,

  /*
    SANDBOX-6A — Element Inspector(Select)가 sandbox 스킨에서도
    된다. 이 문서가 하는 일은 여전히 "연결" 하나다:

      Studio -> 이 문서 : preview:inspector-mode / -select
                          (native 와 **같은 메시지**)
      이 문서 -> 프레임 : IMORY_INSPECT_MODE / IMORY_INSPECT_PICK
      프레임 -> 이 문서 : IMORY_INSPECT_* (좌표는 프레임 뷰포트)
      이 문서 -> Studio : preview:inspect-*  (좌표를 이 문서의
                          것으로 옮긴 뒤, native 와 같은 이름)

    그래서 Studio 쪽(studio/inspector/*)은 sandbox 를 거의 알지
    못한다 — 알아야 하는 것은 remote:true 한 칸뿐이다(테두리를
    프레임이 이미 그렸다는 표식).
  */
  setSandboxPreviewInspectRelay,
  setSandboxPreviewInspectMode,
  setSandboxPreviewInspectSelection,
  forwardSandboxPreviewInspectDirective,
  refreshSandboxPreviewInspectRects,
  setSandboxPreviewCanvasSelection,
  setSandboxPreviewCanvasGeometry,

  /* HOME-CANVAS-GROUP-1B — 그룹 선택 한 벌 */
  setSandboxPreviewCanvasGroup,

  /* STUDIO-LAYERS-MATERIALS-1B — 끌어다 놓을 자리를 프레임에 묻는다 */
  requestSandboxPreviewCanvasBox
} from "./preview-sandbox.js";

const PREVIEW_MSG_RENDER = "preview:render";
const PREVIEW_MSG_RENDER_BANNER = "preview:render-banner";
const PREVIEW_MSG_READY = "preview:ready";
const PREVIEW_MSG_RENDERED = "preview:rendered";
const PREVIEW_MSG_ERROR = "preview:error";

/*
  SANDBOX-5A — 저자 JS 가 오류를 냈다.

  ★ "preview:error" 와 **다른 메시지**여야 한다. 그쪽은 Studio 가
  미리보기 위에 오류 overlay 를 덮는 신호이고, 저자 JS 오류는 그런
  종류가 아니다 — HTML/CSS 는 정상으로 그려져 있고 그대로 보여야
  한다. 이 메시지를 받은 Studio 는 토스트 한 줄만 띄운다.

  ★ 문장이 오지 않는다. 프레임이 올려 준 짧은 코드 하나뿐이고
  (skin/sandbox/skin-sandbox-protocol.js SCRIPT_ERROR), 사람이 읽을
  문장은 Studio 가 자기 쪽에서 만든다.
*/

const PREVIEW_MSG_SCRIPT_ERROR = "preview:script-error";
const PREVIEW_MSG_NAVIGATE = "preview:navigate";

/* BOTTOM-DOCK-1 — 프레임 안에서 dock 을 눌렀다(설정 패널을 연다) */
const PREVIEW_MSG_DOCK_SELECT = "preview:dock-select";
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

/* TRANSITION-1 — Direct Edit 의 전환 "미리 보기" (editId 하나만 받는다) */
const PREVIEW_MSG_TRANSITION_PLAY = "preview:transition-play";

/* =========================================================
   HOME-CANVAS-SELECT-1B-1 — HOME 캔버스 선택

   canvas-select  Studio -> 이 문서
                  { editing, active, ids[], primaryId, generation }
                  `editing` 은 "지금 캔버스 편집이 켜져 있는가"다 —
                  **선택이 없어도 참일 수 있다**(HOME-CANVAS-SELECT-1B-2:
                  lasso 는 빈 상태에서 시작한다). 이 값이 runtime 과
                  vendor 를 불러오는 관문이다.

                  나머지 칸은 Studio 가 **확정한** 캔버스 선택이다.
                  무엇을 고를 수 있는가는 Studio 가 자기 draft 에서
                  정했고, 이 문서(또는 sandbox 프레임)는 받은 id 를
                  자기 DOM 에서 한 번 더 확인한 뒤에만 틀을 붙인다.

   canvas-propose 이 문서 -> Studio
                  { ids[], primaryId, mode, generation }
                  lasso · Shift 클릭의 **제안**이다. 확정이 아니다 —
                  Studio 가 자기 draft 로 모든 id 를 다시 보고,
                  하나라도 고를 수 없으면 메시지 전체를 버린다.

   canvas-frame   이 문서 -> Studio
                  { active, editId }
                  회전을 따라가는 Moveable 틀이 실제로 붙었는가.
                  Studio 는 이 신호를 받은 동안 자기 축 평행
                  overlay 를 내린다 — 둘 다 그리면 회전한 요소에서
                  상자가 덧그려져 보인다. 실패하면 active:false 가
                  올라가 예전 테두리가 그대로 fallback 이 된다.
========================================================== */
const PREVIEW_MSG_CANVAS_SELECT = "preview:canvas-select";
const PREVIEW_MSG_CANVAS_FRAME = "preview:canvas-frame";
const PREVIEW_MSG_CANVAS_PROPOSE = "preview:canvas-propose";

/* =========================================================
   HOME-CANVAS-V2-ELEMENTS-1 — v2 프레임의 **페이지 자리**

   canvas-layout  이 문서 -> Studio
                  { frames: [{ id, x, y }] }
                  단위는 **도화지 폭의 분수**다(픽셀이 아니다).
                  Studio 가 `canvas.baseWidth` 를 곱해 Canvas 좌표로
                  읽는다.

                  ★ 재는 값이 이것뿐인 이유는 계약 §28-3 이다 —
                    프레임의 폭 · 높이 · 배율은 저장값에서 계산되지만
                    흐름 안의 **자리**는 앞 블록들의 실제 높이가
                    정하므로 데이터만으로는 알 수 없다. 묶기 · 빼기가
                    화면 자리를 지키려면 그 한 값이 필요하다.
========================================================== */
const PREVIEW_MSG_CANVAS_LAYOUT = "preview:canvas-layout";

/* =========================================================
   HOME-CANVAS-TRANSFORM-1A — 단일 요소 이동

   canvas-geometry   Studio -> 이 문서
                     { active, id, x, y, baseWidth, baseHeight,
                       generation }
                     단독으로 고른 요소의 **Canvas 좌표**다.
                     canvas-select 가 일부러 싣지 않는 그 값이고,
                     이유는 DOM 에서 잴 수 없기 때문이다 — 렌더러가
                     써 넣은 백분율은 이미 잘린 값이라 거꾸로 풀면
                     원본이 아니다(skin/sandbox/skin-sandbox-protocol.js
                     의 CANVAS_GEOMETRY 주석).

                     확정 요청의 **답**이기도 하다. 승인이면 방금
                     놓은 자리가, 거부면 예전 자리가 내려온다.

   canvas-transform  이 문서 -> Studio
                     { kind, id, expected, next, generation }
                     이동의 **확정 요청**이다. 확정이 아니다 —
                     Studio 가 지금 draft 로 선택 · 순번 · expected ·
                     범위를 전부 다시 보고, 하나라도 어긋나면 쓰지
                     않는다.
========================================================== */
const PREVIEW_MSG_CANVAS_GEOMETRY = "preview:canvas-geometry";
const PREVIEW_MSG_CANVAS_TRANSFORM = "preview:canvas-transform";

/* =========================================================
   HOME-CANVAS-GROUP-1B — 그룹 전체 이동

   canvas-group       Studio -> 이 문서
                      { active, groupId, baseWidth, locked,
                        generation, revision, answering }
                      "지금 고른 것이 이 그룹이다"와 그 그룹을 끌
                      때 쓸 **도화지 자**(`baseWidth`)다. 멤버 명단도
                      좌표도 싣지 않는다 — 프레임이 옮길 것은 이미
                      고른 그 요소들이고, 무엇을 얼마나 저장할지는
                      언제나 Studio 가 정한다.

                      `answering` 은 확정 요청의 **답**일 때만 있는
                      번호다(canvas-geometry 와 같은 규칙 · 계약
                      §17-8). 거부된 이동의 임시 화면을 그 답이
                      걷는다.

   canvas-group-move  이 문서 -> Studio
                      { groupId, gestureId, phase, dx, dy,
                        generation, revision, requestId }
                      그룹 이동의 **확정 요청**이다. 확정이 아니다 —
                      Studio 가 지금 draft 로 선택 · 그룹 · 멤버 ·
                      순번 · revision 을 전부 다시 본다.

                      `phase` 는 셋뿐이다(`start` · `end` · `cancel`).
                      끄는 동안의 중간 보고는 없다 — 화면은 프레임이
                      그리고, 저장은 `end` 한 번이다.

                      `dx` · `dy` 는 **도화지 자**의 공통 delta 하나다.
                      멤버마다 자기 자로 바꾸는 환산은 Studio 가 한다
                      (계약 §39-5).
========================================================== */
const PREVIEW_MSG_CANVAS_GROUP = "preview:canvas-group";
const PREVIEW_MSG_CANVAS_GROUP_MOVE = "preview:canvas-group-move";

/* =========================================================
   STUDIO-LAYERS-MATERIALS-1B — 재료를 끌어다 놓을 자리 (계약 §36-5)

   canvas-probe  Studio -> 이 문서
                 { }
                 "지금 도화지가 화면에서 차지한 상자를 재서 올려라".
                 끌기를 **시작할 때 한 번**만 온다.

   canvas-box    이 문서 -> Studio
                 { root, blocks:[{id,rect}], frames:[{id,rect}] }
                 픽셀이다(이 문서의 뷰포트 기준). 분수를 쓰는
                 canvas-layout 과 다른 이유는 프로토콜 주석에 있다 —
                 "손가락이 도화지의 어디인가"는 화면 상자를 알아야
                 풀린다.

   ★ 재는 함수는 **세 realm 공용**이다(skin/skin-home-canvas.js
     measureSkinHomeCanvasBoxes) — native 와 sandbox 의 좌표가
     갈라지지 않게.

   ★ sandbox 가 화면을 맡고 있으면 이 문서에는 도화지가 없다.
     그때는 프레임에 묻고, 답에 안쪽 iframe 의 자리를 더해 올린다
     (studio/preview/preview-sandbox.js — inspect rects 와 같은 길).
========================================================== */
const PREVIEW_MSG_CANVAS_PROBE = "preview:canvas-probe";
const PREVIEW_MSG_CANVAS_BOX = "preview:canvas-box";

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
    data.context !== null &&
    /* SANDBOX-4 — 선택 필드. 없으면 native(지금까지의 모든 스킨). */
    (data.renderMode === undefined || typeof data.renderMode === "string") &&
    /* BOTTOM-DOCK-1 — 선택 필드 둘. null 이면 dock 없는 스킨이다.
       실제 모양 검사는 skin/skin-bottom-dock.js 의 정규화가 한다. */
    (data.dock === undefined || data.dock === null || typeof data.dock === "object") &&
    (data.dockTemplate === undefined || data.dockTemplate === null || typeof data.dockTemplate === "object")
  );

}


/* =========================================================
   SANDBOX-4 — sandbox 스킨 렌더

   ★ 실패는 언제나 조용한 native 폴백이다(공개 화면과 같은 규칙,
   skin/skin-home.js tryMountSandboxSkinHome 주석). 프레임이 안
   뜨면 같은 스킨을 이 문서에서 native 로 그린다 — 백지가 되지
   않는다. 다시 시도하지 않는다.
========================================================== */

async function handleSandboxRenderMessage(data) {

  let result;

  try {

    result =
      await renderSandboxPreview({
        root: previewRoot,
        skin: data.skin,
        context: data.context,
        onNavigate: function (href) {

          /*
            프레임 링크 → 기존 "preview:navigate" 그대로. 그 다음은
            native Preview 에서 링크를 눌렀을 때와 같은 경로다.
          */

          postToParent({
            type: PREVIEW_MSG_NAVIGATE,
            href: href
          });

        },

        /*
          SANDBOX-5A — 저자 JS 오류. 화면은 건드리지 않고 코드만
          올린다(위 PREVIEW_MSG_SCRIPT_ERROR 주석).
        */

        onScriptError: function (code) {

          postToParent({
            type: PREVIEW_MSG_SCRIPT_ERROR,
            code: typeof code === "string" ? code : ""
          });

        }
      });

  }

  catch (err) {

    console.error("[preview-bridge] sandbox render threw", err);

    result = { ok: false, reason: "threw" };

  }


  if (result && result.ok) {

    /*
      post-body region 은 프레임 안에 있어 이 문서가 볼 수 없다.
      템플릿 문자열에 그 자리가 선언되어 있는지로 답한다 —
      Studio 가 "본문 자리가 없는 POST 템플릿" overlay 를 띄우는
      판정에 쓰는 값이고, 판정 함수는 Code Editor/Import 와 같은
      것이다(skin/skin-template.js htmlHasPostBodyRegion).
    */

    postToParent({
      type: PREVIEW_MSG_RENDERED,
      hasPostBodyRegion:
        typeof window.htmlHasPostBodyRegion === "function"
          ? window.htmlHasPostBodyRegion(String(data.skin.html || ""))
          : true
    });

    return;

  }


  if (result && result.reason === "stale") {

    /* 더 새로운 렌더가 이미 진행 중이다 — 아무것도 하지 않는다 */

    return;

  }


  console.warn(
    "[preview-bridge] sandbox preview failed, falling back to native render:",
    result ? result.reason : "no-result"
  );


  if (!(result && result.keepFrame)) {
    teardownSandboxPreview();
  }


  /*
    프레임이 살아 있는데 이번 렌더만 실패했다면(keepFrame) 직전
    화면을 그대로 두고 오류만 알린다 — 그 위에 native 를 겹쳐
    그리지 않는다.
  */

  if (hasSandboxPreviewFrame()) {

    postToParent({
      type: PREVIEW_MSG_ERROR,
      message: "sandbox render failed"
    });

    return;

  }


  handleRenderMessage(data);

}


/* =========================================================
   TRANSITION-1 — Preview 의 페이지 전환

   공개 화면에서 페이지 전환은 "새 화면이 그려질 때 appear 가
   재생되는 것"이다. Preview 는 편집마다 다시 그리므로 appear 를 끄고
   (renderSkin transitionAppear:false), **보고 있는 화면이 바뀐
   경우에만** 같은 움직임을 재생한다 — 같은 화면에서 글자를 고칠
   때는 조용하다.
========================================================== */

let previewTransitionPageKey = null;

function previewTransitionPageKeyOf(context) {

  const page = (context && context.page) || {};

  const id =
    (context && context.post && context.post.id) ||
    (context && context.category && context.category.id) ||
    "";

  return String(page.type || "") + ":" + String(id);

}

function replayPreviewPageTransition(context) {

  const key = previewTransitionPageKeyOf(context);

  const changed =
    previewTransitionPageKey !== null && key !== previewTransitionPageKey;

  previewTransitionPageKey = key;

  if (!changed || typeof window.replaySkinTransitionAppear !== "function") {
    return;
  }

  const root = previewRoot.querySelector("[data-skin-root]");

  if (root) {
    window.replaySkinTransitionAppear(root);
  }

}

/* Direct Edit 의 "미리 보기" — 고른 요소(반복 clone 포함) 의 들어오기를
   한 번 재생한다. editId 형태는 Inspector 와 같은 검사를 지난다. */
function playPreviewTransition(editId) {

  if (
    typeof editId !== "string" ||
    typeof window.isValidInspectorEditId !== "function" ||
    !window.isValidInspectorEditId(editId) ||
    typeof window.playSkinTransitionEnter !== "function"
  ) {
    return 0;
  }

  let played = 0;

  previewRoot
    .querySelectorAll(`[data-imory-edit-id="${editId}"]`)
    .forEach((el) => {
      if (window.playSkinTransitionEnter(el)) {
        played += 1;
      }
    });

  return played;

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
        mode: "preview",

        /* TRANSITION-1 — 편집할 때마다(글자 하나에도) 다시 그리므로
           그때마다 화면 전체가 "들어오면" 편집을 할 수 없다. 대신
           **미리보기 화면이 바뀔 때만** 한 번 재생하고(아래
           replayPreviewPageTransition), Direct Edit 의 "미리 보기"
           버튼이 고른 요소만 재생한다(preview:transition-play). */
        transitionAppear: false
      });
    }

    replayPreviewPageTransition(data.context);

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
      HIGHLIGHT-1 후속 — 하이라이트 화면 기본 진입점을 Preview에도 그린다.

      공개 화면에서 스킨이 메모 링크를 그리지 않았을 때 플랫폼이
      얹는 바로 그 칩이다(skin/skin-highlight-entry.js, 이 문서도 같은
      파일을 읽는다). Preview에 없으면 편집자는 "내 방문자가 실제로
      보는 화면"과 다른 것을 보게 되고, 하이라이트 화면 미리보기로 들어갈
      길도 없다(§11-4 — 스킨에 링크가 없으면 닿지 못하던 제약).

      클릭은 아래의 위임 리스너가 그대로 가로채 parent에 넘긴다 —
      이 칩도 결국 평범한 <a href>다.
    */
    /*
      HIGHLIGHT-1 후속 — 하이라이트 카드의 ⋮ 를 Preview에서도 실제로 연다.
      공개 화면과 같은 UI 코드를 쓰되 저장은 하지 않는다
      (studio/preview/preview-highlight-tools.js).
    */
    if (typeof mountPreviewHighlightTools === "function") {

      mountPreviewHighlightTools({
        instance:
          renderInstance,

        context:
          data.context
      });

    }

    /*
      BOTTOM-DOCK-1 — Preview 에도 같은 dock 을 그린다.

      공개 화면과 같은 파일이 그린다(skin/skin-bottom-dock-mount.js,
      이 문서도 같은 두 파일을 읽는다). 설정과 template 은 봉투로
      온다 — Preview 문서는 SkinPackage 전체를 갖고 있지 않기
      때문이다(studio/studio-preview.js postRenderToFrame).

      dock 이 없는 스킨에서는 config 가 null 이라 아무 일도 하지
      않는다. 화면이 바뀔 때마다 옛 dock 을 내리고 새로 그리므로
      Preview 안에 dock 이 쌓이지 않는다.
    */

    if (typeof window.syncSkinBottomDockForScreen === "function") {

      const dockMount =
        window.syncSkinBottomDockForScreen({
          dock: data.dock || null,
          dockTemplate: data.dockTemplate || null,
          context: data.context,
          container: previewRoot,
          skinRoot: previewSkinRoot
        });

      /*
        Preview 에서 dock 을 누르면 **설정 패널**이 열린다
        (요구사항 12절). 공개 화면과 달리 여기서 dock 을 눌러
        화면을 옮길 이유가 없고, 편집 중에 "이걸 어디서 고치지"를
        찾아 헤매지 않게 하는 것이 낫다.

        capture 단계에서 먼저 잡아 dock 자신의 동작(패널 토글 ·
        맨 위로 · 링크)까지 막는다 — Preview 안의 dock 은 조작
        대상이 아니라 편집 대상이다.
      */

      if (dockMount && dockMount.dockRoot) {

        /*
          ★ 열기 버튼만은 예외다 — 공개 화면처럼 실제로 펼치고 접는다.
          Dock 패널이 만드는 dock 은 언제나 접힌 채로 시작하므로
          (IMORY_BOTTOM_DOCK_DESIGN.md §6), 이 버튼이 막혀 있으면
          Preview 에서는 항목을 한 번도 볼 수 없다. 펼친 뒤 항목을
          누르면 아래처럼 설정 패널이 열린다.
        */

        dockMount.dockRoot.addEventListener(
          "click",
          (event) => {

            if (
              event.target &&
              typeof event.target.closest === "function" &&
              event.target.closest('[data-imory-dock="trigger"]') &&
              dockMount.triggerEl
            ) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            postToParent({ type: PREVIEW_MSG_DOCK_SELECT });

          },
          true
        );

      }

    }

    if (typeof refreshPlatformHighlightEntry === "function") {

      refreshPlatformHighlightEntry({
        href:
          data.context?.navigation?.highlights?.href || "",

        enabled:
          data.context?.navigation?.highlights?.enabled !== false,

        label:
          data.context?.navigation?.highlights?.name || "HIGHLIGHTS",

        skinRoot:
          previewRoot,

        isHighlightsScreen:
          data.context?.page?.isHighlights === true
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

      /* DIRECT-UX-1 — 고치던 글자·끌던 요소도 사라진 DOM 위에 있었다 */
      if (window.previewInspectDirect) {
        window.previewInspectDirect.reset();
      }

      postInspectorRects();

    }

    /*
      HOME-CANVAS-SELECT-1B-1 — 캔버스 DOM 도 통째로 다시 만들어졌다.
      같은 id 의 새 요소로 target 을 옮기고, 그 요소가 사라졌으면
      틀을 걷는다.

      ★ 한 번도 만들지 않았으면 여기서 만들지 않는다 — 재렌더가
        runtime 과 vendor 를 받아 오는 계기가 되지 않게.
    */
    if (canvasFrameController) {
      canvasFrameController.onRender();
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


/* =========================================================
   inspectorNativeActive() — 이 문서가 hit-test 를 해야 하는가

   SANDBOX-6A. sandbox 스킨을 그리고 있는 동안 이 문서 안에는 스킨
   DOM 이 없다 — previewRoot 안에는 cross-origin iframe 하나뿐이다.
   그런데도 아래 리스너들이 계속 돌면 두 가지 일이 생긴다:

     1. hover/선택이 언제나 null 이라 "고를 것이 없다"를 계속 올린다.
     2. postInspectorRects() 가 selected:null 을 올리고, Studio 는
        그것을 "그 요소가 사라졌다"로 읽어 **방금 프레임에서 고른
        선택을 지운다**(studio-inspector.js rects 처리).

     2번은 실제로 그랬다 — 프레임에서 고른 직후 120ms 안에 선택이
     풀렸다. 그래서 프레임이 화면을 맡고 있는 동안 이 문서의
     Inspector 는 **아무 말도 하지 않는다**.

   ★ inspectorEnabled 자체는 그대로 둔다. 프레임이 실패해 native 로
     폴백하면 그 순간부터 이 함수가 참이 되어 지금까지의 동작이
     그대로 살아난다 — 모드 메시지를 다시 받을 필요가 없다.
========================================================== */

function inspectorNativeActive() {

  return inspectorEnabled && !hasSandboxPreviewFrame();

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


/* =========================================================
   inspectorFrameElementOf(el) — 잘린 이미지의 "보이는 사각형"

   자르기가 걸린 이미지는 프레임(<span> 래퍼)보다 크고, 넘치는
   부분은 overflow: hidden으로 잘려 안 보인다. 그 상태에서 이미지
   자신의 rect를 올려보내면 Studio는 **화면에 보이지 않는 영역**에
   테두리와 모서리 핸들을 그린다. 사용자가 보는 사각형은 프레임이
   므로, 좌표를 재는 모든 자리에서 프레임을 대신 쓴다.

   판정은 custom property 표식 하나다(studio-inspector-crop-model.js
   INSPECTOR_CROP_MARKER). custom property는 상속되므로 "자식이
   하나뿐인가"를 함께 본다 — 자르기 래퍼는 언제나 이미지 하나만
   감싸므로, 표식을 물려받았을 뿐인 다른 상자를 프레임으로 착각
   하지 않는다.
========================================================== */

function inspectorFrameElementOf(el) {

  const parent =
    el && el.parentElement;

  if (!parent || parent.nodeType !== 1 || parent.children.length !== 1) {
    return el;
  }

  try {

    const marker =
      window.getComputedStyle(parent).getPropertyValue(
        window.INSPECTOR_CROP_MARKER || "--imory-crop"
      );

    return (marker && marker.trim()) ? parent : el;

  } catch (err) {
    return el;
  }

}


function inspectorRectOf(el) {

  if (!el || !el.isConnected) {
    return null;
  }

  const target =
    inspectorFrameElementOf(el);

  const rect =
    target.getBoundingClientRect();

  /* HOME-CANVAS-V2-MANUAL-FIX-1 — 캔버스의 글자 요소는 넘친 글자까지
     감싼다(계약 §29-2). 규칙은 세 realm 공용 파일에 있다
     (skin/skin-inspect-target.js) — sandbox 프레임의 테두리와 같은
     상자가 나온다. 캔버스 요소가 아니면 그대로 돌아온다. */
  return inspectorCanvasContentRect(target, {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  });

}


/* =========================================================
   inspectorVisibleRectOf(el) — 조상 overflow까지 반영한 사각형

   자르기 프레임이 **자기 부모보다 클 수 있다.** 실제 스킨에서
   흔하다: 헤더 이미지를 감싼 <figure>가 aspect-ratio로 높이를
   못 박고 overflow: hidden을 걸어 두면, 그 안에서 프레임을 1:1로
   바꾸는 순간 프레임 아랫부분은 화면에 아예 그려지지 않는다.

   그때 프레임의 getBoundingClientRect()를 그대로 올려보내면
   Studio는 **보이지 않는 자리에** 선택 테두리와 자르기 드래그 판을
   그린다 — 사용자 눈에는 "테두리가 사진 아래 다른 영역까지
   내려온" 것으로 보이고, 그 자리를 끌어도 사진은 없다.

   그래서 프레임 rect를 잘라내는 조상(overflow가 visible이 아닌
   요소) 전부와 교집합을 낸 사각형을 함께 올려보낸다. 아무 것도
   자르지 않으면 rect와 같은 값이므로, 자르는 조상이 없는 보통
   스킨에서는 지금까지와 완전히 같다.

   ★ 스킨 DOM에는 아무 것도 쓰지 않는다 — 읽기만 한다.
========================================================== */

function inspectorVisibleRectOf(el) {

  if (!el || !el.isConnected) {
    return null;
  }

  const target =
    inspectorFrameElementOf(el);

  const rect =
    target.getBoundingClientRect();

  let left = rect.left;
  let top = rect.top;
  let right = rect.right;
  let bottom = rect.bottom;

  let node =
    target.parentElement;

  while (node && node.nodeType === 1) {

    let style;

    try {
      style = window.getComputedStyle(node);
    } catch (err) {
      break;
    }

    /* overflow가 visible이 아니면 그 상자가 자식을 잘라낸다.
       (clip / hidden / auto / scroll 모두 잘라낸다 — auto·scroll은
       스크롤로 볼 수는 있지만 **지금 보이는 자리**는 아니다.) */
    const clips =
      style.overflowX !== "visible" || style.overflowY !== "visible";

    if (clips) {

      const box =
        node.getBoundingClientRect();

      if (style.overflowX !== "visible") {
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }

      if (style.overflowY !== "visible") {
        top = Math.max(top, box.top);
        bottom = Math.min(bottom, box.bottom);
      }

    }

    node = node.parentElement;

  }

  if (right <= left || bottom <= top) {
    return { left: rect.left, top: rect.top, width: 0, height: 0 };
  }

  /* HOME-CANVAS-V2-MANUAL-FIX-1 — 위 inspectorRectOf 와 같은 규칙.
     조상이 자르지 않는 한(자르면 위에서 이미 좁혀졌다) 캔버스 글자
     요소의 테두리는 넘친 글자 바깥에 놓인다(계약 §29-2). */
  return inspectorCanvasContentRect(target, {
    left,
    top,
    width: right - left,
    height: bottom - top
  });

}


/* =========================================================
   inspectorSizeOwnerOf(img) — 이 사진의 폭을 **실제로 정하는 상자**
   (EDITORIAL-CUSTOMIZATION-1)

   ★ 무엇이 문제였나

   스킨은 사진 자리를 흔히 "바깥 상자가 폭을 정하고 안쪽 <img> 는
   그 상자를 가득 채운다"로 그린다(아이모리 기본 스킨의 HOME 사진 ·
   갤러리 카드 · 헤더가 전부 그렇다).

     .ied-photo       { width: 74%; }          ← 폭을 정하는 상자
     .ied-photo-frame { display: block; aspect-ratio: 3 / 4; }
     .ied-photo-img   { width: 100%; height: 100%; }

   그 상태에서 <img> 에 `width: 320px` 을 써도 화면은 꿈쩍도 하지
   않는다 — 크기 확정 규칙에는 늘 `max-width: 100%` 가 함께 들어가고
   (buildInspectorStylePatch "size"), 그 100% 는 부모 상자의 폭이기
   때문이다. 숫자만 커지고 사진은 그대로인, 사용자가 "무효"라고 느낀
   바로 그 길이다.

   ★ 무엇을 하는가

   사진에서 위로 올라가며 "제 부모를 가로로 가득 채우고 있는가"를
   묻는다. 가득 채우고 있으면 그 요소의 폭은 제 것이 아니라 부모의
   것이므로 한 칸 더 올라간다. 더 이상 가득 채우지 않는 첫 요소가
   **폭을 정하는 상자**다. 위 예에서는 `.ied-photo` 가 그것이다.

   ★ 어디서 멈추나 (짐작하지 않는다)

     - 사진이 둘 이상 든 상자    사진 묶음 전체이지 이 사진의 자리가
                                 아니다
     - post-body 같은 보호 영역   플랫폼이 채우는 자리다
     - 식별자가 없는 요소        CSS 규칙을 쓸 수 없다
     - 스킨 루트                 스킨 전체의 폭은 여기서 정하지 않는다
     - 네 칸                     그보다 깊으면 짐작이다
     - **제 폭을 갖지 않으면서 사진 말고 다른 글자도 담은 칸**
       (예: 제목 · 소개 · 사진이 함께 든 머리 구역) — 그 칸의 폭을
       줄이면 사진이 아니라 구역 전체가 줄어든다. 사진의 캡션은
       여기 걸리지 않는다: 캡션을 가진 칸은 대개 제 폭(`74%` 등)을
       갖고 있어 아래 첫 조건에서 이미 "주인"으로 뽑히기 때문이다.

   자른 사진에는 쓰지 않는다 — 그때 폭의 주인은 자르기 프레임이고,
   그 판정은 이미 inspectorFrameElementOf() 가 한다. 사진이 제
   크기를 스스로 갖고 있으면(`width: 64px` · `width: auto` 인 로고)
   첫 칸에서 바로 끝난다 — 그때는 지금까지처럼 사진 자신이 주인이다.
========================================================== */

const INSPECTOR_SIZE_OWNER_MAX_DEPTH = 4;


function inspectorInnerWidthOf(el) {

  const style =
    window.getComputedStyle(el);

  return (
    el.clientWidth -
    (parseFloat(style.paddingLeft) || 0) -
    (parseFloat(style.paddingRight) || 0)
  );

}


/* el 의 폭이 부모 안쪽 폭과 같은가(= 제 폭을 갖지 않는가) */
function inspectorFillsParentWidth(el) {

  const parent =
    el && el.parentElement;

  if (!parent) {
    return false;
  }

  const parentWidth =
    inspectorInnerWidthOf(parent);

  return (
    parentWidth > 0 &&
    Math.abs(el.getBoundingClientRect().width - parentWidth) <= 1
  );

}


/* skip(사진이 들어 있는 가지)을 뺀 나머지가 화면에 글자를 그리는가 */
function inspectorHasOwnRenderedText(el, skip) {

  return Array.from(el.childNodes).some((node) => {

    if (node === skip) {
      return false;
    }

    if (node.nodeType === 3) {
      return node.textContent.trim() !== "";
    }

    if (node.nodeType !== 1 || !node.textContent.trim()) {
      return false;
    }

    const rect =
      node.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0;

  });

}


function inspectorSizeOwnerOf(el) {

  if (!el || el.tagName !== "IMG") {
    return null;
  }

  const root =
    inspectorSkinRoot();

  if (!root || !root.contains(el)) {
    return null;
  }

  let current = el;

  let owner = null;

  for (let depth = 0; depth < INSPECTOR_SIZE_OWNER_MAX_DEPTH; depth += 1) {

    const parent =
      current.parentElement;

    if (!parent || parent === root || !root.contains(parent)) {
      break;
    }

    if (parent.hasAttribute("data-imory-region")) {
      break;
    }

    if (parent.querySelectorAll("img").length > 1) {
      break;
    }

    if (!inspectorEditIdOf(parent)) {
      break;
    }

    /* 지금 요소가 제 폭을 갖고 있으면 주인은 이미 정해졌다 */
    if (!inspectorFillsParentWidth(current)) {
      break;
    }

    const parentIsStretched =
      inspectorFillsParentWidth(parent);

    /* 제 폭도 없고 사진 말고 다른 글자도 담은 칸은 "사진의 자리"가
       아니다 — 좁히면 구역 전체가 좁아진다. */
    if (parentIsStretched && inspectorHasOwnRenderedText(parent, current)) {
      break;
    }

    owner = parent;

    current = parent;

    /* 제 폭을 가진 칸을 만났으면 그 칸이 주인이다 */
    if (!parentIsStretched) {
      break;
    }

  }

  return owner;

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

  /* 자른 이미지에서는 크기 컨트롤이 다루는 "너비"가 사진의 너비가
     아니라 **프레임의 너비**다 — 그래서 여기서 재는 대상도 프레임
     이고, 부모 폭도 프레임의 부모에서 잰다. */
  const frame =
    inspectorFrameElementOf(el);

  /* 자르지 않은 사진이 스킨의 바깥 상자에 폭을 맡기고 있는가
     (EDITORIAL-CUSTOMIZATION-1, inspectorSizeOwnerOf 머리말) */
  const sizeOwner =
    frame === el ? inspectorSizeOwnerOf(el) : null;

  const rect =
    frame.getBoundingClientRect();

  const parent =
    frame.parentElement;

  let parentWidth = 0;

  /* LAYOUT-1 — 자유 배치(free)의 좌표는 "부모 안쪽 상자의 비율"이다.
     그래서 폭만으로는 부족하다: 세로 좌표를 포인터 이동량에서
     되돌리려면 부모의 안쪽 **높이**도 필요하다
     (IMORY_LAYOUT_PRIMITIVE_DESIGN.md §직접 편집). 폭과 똑같이
     padding 을 뺀 값이다. */
  let parentHeight = 0;

  if (parent) {

    const parentStyle =
      window.getComputedStyle(parent);

    parentWidth =
      parent.clientWidth -
      (parseFloat(parentStyle.paddingLeft) || 0) -
      (parseFloat(parentStyle.paddingRight) || 0);

    parentHeight =
      parent.clientHeight -
      (parseFloat(parentStyle.paddingTop) || 0) -
      (parseFloat(parentStyle.paddingBottom) || 0);

  }

  return {
    width: rect.width,
    height: rect.height,
    naturalWidth: Number(el.naturalWidth) || 0,
    naturalHeight: Number(el.naturalHeight) || 0,

    /* IMAGE-CROP-PRIORITY-1 — 아직 자르지 않은 사진이 스킨이 정한
       자리를 어떻게 채우고 있는가(inspectorCropFillOf). 자르기를
       시작할 때 프레임이 같은 방식으로 그 자리를 채운다. */
    fill: frame === el ? inspectorCropFillOf(el) : null,
    parentWidth: Math.max(0, Math.round(parentWidth)),
    parentHeight: Math.max(0, Math.round(parentHeight)),
    viewportWidth: document.documentElement.clientWidth || 0,

    /* 자르기 UI가 "이미지가 없거나 로드에 실패했다"를 말해 줄 수
       있는 유일한 근거다 — 실패한 <img>는 브라우저가 alt 텍스트를
       담은 인라인 요소로 취급해서 프레임을 씌워도 아무 것도 보이지
       않는다. img가 아닌 요소에는 의미가 없으므로 null이다. */
    loaded:
      el.tagName === "IMG"
        ? !!(el.complete && Number(el.naturalWidth) > 0)
        : null,

    cropped: frame !== el,

    /* EDITORIAL-CUSTOMIZATION-1 — 지금 실제로 그려진 글자 크기.
       "기본"인 칸에 슬라이더가 어디서 시작할지의 근거다. */
    fontSize:
      Math.round(parseFloat(window.getComputedStyle(el).fontSize) || 0),

    /* =====================================================
       COMMON-SELECT-BOX-1 — 이 요소가 지금 **어떤 상자인가**

       크기 · 상자 위치 · 내용 정렬 · 여백이 실제로 듣는지는
       화면에서 잰 display/position 이 정한다(짐작하지 않는다):

         inline      너비 · 자리 · 안쪽 여백이 듣지 않는다
         absolute    바깥 간격(margin)이 뜻을 갖지 않는다
         flex/grid   내용 정렬이 text-align 이 아니라 align 계열이다

       Studio 는 이 셋만 보고 "이 요소에 실제로 작동하는 설정"만
       그린다(studio/inspector/studio-inspector-box.js).
    ====================================================== */
    display: String(window.getComputedStyle(el).display || ""),
    position: String(window.getComputedStyle(el).position || ""),
    flexDirection: String(window.getComputedStyle(el).flexDirection || ""),

    /* EDITORIAL-CUSTOMIZATION-1 — 사진의 폭을 정하는 바깥 상자.
       자르지 않은 사진에서만 본다(자른 사진의 주인은 프레임이다).
       Studio 는 이 값이 있을 때 "사진 영역 너비"를 그 상자에 쓴다. */
    sizeOwner: sizeOwner
      ? {
          editId: inspectorEditIdOf(sizeOwner),
          width: Math.round(sizeOwner.getBoundingClientRect().width),
          height: Math.round(sizeOwner.getBoundingClientRect().height),
          parentWidth: Math.max(
            0,
            Math.round(
              sizeOwner.parentElement
                ? inspectorInnerWidthOf(sizeOwner.parentElement)
                : 0
            )
          )
        }
      : null
  };

}


/* =========================================================
   inspectorCropFillOf(img) -> "absolute" | "flow" | "width" | null
   (IMAGE-CROP-PRIORITY-1)

   "자르기 프레임이 이 사진 대신 들어서면, 어떤 방식으로 그려야
   **지금 사진이 차지한 사각형과 똑같은 자리**가 되는가".

   ★ 짐작하지 않고 잰다
   부모 폭이 사진 폭과 같아 보여도, 부모가 사진 때문에 그 폭이 된
   것(shrink-to-fit)이면 width:100% 프레임은 0 으로 무너진다. 높이는
   더 그렇다. 그래서 사진을 잠깐 숨기고 **빈 상자 하나를 그 자리에
   넣어 방식별로 그려 본다** — 그 상자의 사각형이 사진의 사각형과
   같은 첫 방식이 답이다. 넣고 빼는 일은 한 작업 안에서 끝나므로
   화면에 그려지지 않는다(레이아웃만 한 번 더 계산된다).

     absolute  사진이 겹쳐 있다(position absolute) — 기준 상자를 채운다
     flow      흐름 안에서 부모 상자를 폭·높이 모두 채운다
     width     부모 폭을 채우고 높이는 비율로 정해진다

   셋 다 아니면 null — 지금처럼 px 폭 + 비율 프레임이다.

   ★ 결과는 요소·사각형·화면 폭이 같은 동안 기억해 둔다. 좌표는
     스크롤마다 다시 올라가므로 매번 그려 볼 필요가 없다.
========================================================== */

const INSPECTOR_CROP_FILL_TOLERANCE = 1;

const inspectorCropFillCache = new WeakMap();

function inspectorCropFillOf(el) {

  if (!el || el.tagName !== "IMG" || !el.isConnected || !el.parentElement) {
    return null;
  }

  const rect =
    el.getBoundingClientRect();

  if (!(rect.width > 0) || !(rect.height > 0)) {
    return null;
  }

  const key =
    [
      Math.round(rect.left), Math.round(rect.top),
      Math.round(rect.width), Math.round(rect.height),
      document.documentElement.clientWidth
    ].join(",");

  const cached =
    inspectorCropFillCache.get(el);

  if (cached && cached.key === key) {
    return cached.fill;
  }

  /* 레이아웃 상자(offset*)로 견준다 — 스킨이 사진에 transform 을
     걸어 두었어도(자르면 보호 규칙이 걷는 값이다) 자리는 같다. */
  const box = (node) => ({
    parent: node.offsetParent,
    left: node.offsetLeft,
    top: node.offsetTop,
    width: node.offsetWidth,
    height: node.offsetHeight
  });

  const layout =
    box(el);

  const same = (other) =>
    other.parent === layout.parent &&
    Math.abs(other.left - layout.left) <= INSPECTOR_CROP_FILL_TOLERANCE &&
    Math.abs(other.top - layout.top) <= INSPECTOR_CROP_FILL_TOLERANCE &&
    Math.abs(other.width - layout.width) <= INSPECTOR_CROP_FILL_TOLERANCE &&
    Math.abs(other.height - layout.height) <= INSPECTOR_CROP_FILL_TOLERANCE;

  let position = "";

  try {
    position = window.getComputedStyle(el).position;
  } catch (err) {
    return null;
  }

  const candidates =
    (position === "absolute")
      ? [["absolute", "display:block;position:absolute;inset:0;margin:0;padding:0;border:0"]]
      : (position === "fixed" ? [] : [
          ["flow", "display:block;position:relative;width:100%;height:100%;margin:0;padding:0;border:0"],
          ["width", `display:block;position:relative;width:100%;aspect-ratio:${layout.width / Math.max(1, layout.height)};margin:0;padding:0;border:0`]
        ]);

  let fill = null;

  if (candidates.length) {

    const parent =
      el.parentElement;

    const probe =
      document.createElement("span");

    /* 사진의 style 속성은 건드리지 않는다 — 잠깐 자리를 비켜 줄
       뿐이다(스킨 DOM 에 흔적이 남지 않게). 이미 불러온 <img> 는
       다시 넣어도 다시 받지 않는다. */
    parent.replaceChild(probe, el);

    try {

      for (const [mode, css] of candidates) {

        probe.setAttribute("style", css);

        if (same(box(probe))) {
          fill = mode;
          break;
        }

      }

    } finally {

      parent.replaceChild(el, probe);

    }

  }

  inspectorCropFillCache.set(el, { key, fill });

  return fill;

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

  if (!inspectorNativeActive()) {
    return;
  }

  const selected =
    inspectorReviveSelection();

  postToParent({
    type: PREVIEW_MSG_INSPECT_RECTS,
    hover:
      (inspectorHoverElement && inspectorHoverElement.isConnected)
        ? {
            editId: inspectorEditIdOf(inspectorHoverElement),
            rect: inspectorRectOf(inspectorHoverElement),
            visibleRect: inspectorVisibleRectOf(inspectorHoverElement)
          }
        : null,
    selected:
      selected
        ? {
            editId: inspectorSelectedEditId,
            rect: inspectorRectOf(selected),
            visibleRect: inspectorVisibleRectOf(selected),
            metrics: inspectorMetricsOf(selected)
          }
        : null
  });

}


function scheduleInspectorRects() {

  if (!inspectorNativeActive() || inspectorRectFrame) {
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
    rect: inspectorRectOf(el),
    visibleRect: inspectorVisibleRectOf(el)
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
    visibleRect: inspectorVisibleRectOf(el),
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

  /* 재렌더로 떨어져 나간 노드는 되돌릴 것도, 되돌릴 필요도 없다
     (임시로 만든 자르기 래퍼도 그 DOM과 함께 사라진다). */
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

  /* EDITORIAL-CUSTOMIZATION-1 — 폭을 정하는 바깥 상자에 임시로 쓴
     선언도 같은 방식으로 되돌린다(그 상자는 스킨의 것이므로 지우지
     않고 style 속성만 원래대로 둔다). */
  if (restore.owner && restore.owner.element && restore.owner.element.isConnected) {

    const owner =
      restore.owner.element;

    owner.style.cssText = "";

    if (typeof restore.owner.style === "string" && restore.owner.style.trim()) {
      owner.setAttribute("style", restore.owner.style);
    } else {
      owner.removeAttribute("style");
    }

  }

  if (!restore.crop) {
    return;
  }

  /* 자르기 미리보기가 만든 래퍼는 통째로 걷어낸다. 이미 스킨에
     있던 래퍼(= 이전에 자른 적이 있는 이미지)는 지우지 않고 inline
     선언만 원래대로 되돌린다 — 그 래퍼는 확정된 결과물이라 임시
     편집을 취소했다고 사라져서는 안 된다. */
  const wrapper =
    restore.crop.wrapper;

  if (!wrapper || !wrapper.isConnected) {
    return;
  }

  if (!restore.crop.created) {

    wrapper.style.cssText = "";

    if (typeof restore.crop.style === "string" && restore.crop.style.trim()) {
      wrapper.setAttribute("style", restore.crop.style);
    } else {
      wrapper.removeAttribute("style");
    }

    return;

  }

  if (wrapper.parentNode) {
    wrapper.parentNode.insertBefore(node, wrapper);
    wrapper.remove();
  }

}


/* 선언 묶음을 inline style로 얹는다 — 값이 null인 것은 건너뛴다.
   custom property(--imory-crop)도 함께 실려야 하므로 setProperty를
   쓴다(node.style.foo = ... 로는 custom property가 들어가지 않는다). */
function applyInspectorInlineDeclarations(node, declarations, important) {

  Object.keys(declarations || {}).forEach((property) => {

    const value =
      declarations[property];

    if (value === null || value === undefined || value === "") {
      return;
    }

    node.style.setProperty(property, String(value), important ? "important" : "");

  });

}


/* =========================================================
   자르기 임시 미리보기 — 필요하면 래퍼를 **하나만** 만든다

   이미 자른 적이 있는 이미지에는 스킨 HTML에 래퍼가 들어 있다.
   그때는 그 래퍼를 그대로 쓴다 — 미리보기가 또 감싸면 재편집할
   때마다 래퍼가 겹겹이 쌓인다(요구사항 3절).
========================================================== */

function ensureInspectorCropWrapper(node, restore) {

  if (restore.crop) {
    return restore.crop.wrapper;
  }

  const existing =
    inspectorFrameElementOf(node);

  if (existing !== node) {

    restore.crop = {
      wrapper: existing,
      created: false,
      style: existing.getAttribute("style")
    };

    return existing;

  }

  if (!node.parentNode) {
    return null;
  }

  /* <span>이다 — <div>로 감싸면 <p> 안의 이미지에서 문단이 쪼개진다.
     <a> 안의 이미지면 래퍼도 <a> 안쪽에 들어가므로 링크 클릭
     범위가 그대로다. */
  const wrapper =
    document.createElement("span");

  node.parentNode.insertBefore(wrapper, node);

  wrapper.appendChild(node);

  restore.crop = {
    wrapper,
    created: true,
    style: null
  };

  return wrapper;

}


/* =========================================================
   pinInspectorCropFrame(wrapper, anchor)

   자유 비율로 변을 끄는 동안 **고정하기로 한 변을 제자리에 붙여
   둔다.** Studio가 "이 변이 이 좌표에 있어야 한다"만 보내고, 얼마나
   되밀지는 여기서 정한다.

   ★ 왜 여기서 재는가
   프레임은 보통 흐름 안에 있고 폭이 바뀌면 **정렬 규칙이 자리를
   다시 정한다** — 가운데 정렬이면 양쪽이 반씩 벌어지고, 오른쪽
   정렬이면 왼쪽 변이 움직인다. 그 규칙을 Studio가 알아낼 방법이
   없다(부모의 margin/flex/grid/text-align 조합 전부를 읽어야 한다).
   대신 **새 폭으로 한 번 배치한 결과를 재서** 어긋난 만큼 되밀면
   정렬이 무엇이든 같은 결과가 나온다.

   ★ transform이 아니라 translate 속성이다 — 스킨이 그 요소에
     transform을 걸어 뒀더라도 덮어쓰지 않고 그 위에 얹힌다.
     레이아웃을 밀지 않으므로 주변 글도 움직이지 않는다.

   ★ 임시 미리보기에만 남는다. clearInspectorPreview()가 wrapper의
     style을 통째로 되돌리므로 확정 CSS에는 한 글자도 가지 않고,
     "적용"을 누르면 프레임은 새 크기 그대로 **스킨의 정렬 규칙이
     정한 자리**로 앉는다.
========================================================== */

function pinInspectorCropFrame(wrapper, anchor) {

  if (!wrapper) {
    return;
  }

  if (!anchor || typeof anchor !== "object") {
    wrapper.style.translate = "";
    return;
  }

  /* 되민 값을 걷고 나서 재야 "정렬이 정한 자리"가 나온다 */
  wrapper.style.translate = "";

  const rect =
    wrapper.getBoundingClientRect();

  /* low/high는 붙여 둘 자리, at/to는 지금 배치된 자리.
     "left"/"top"은 시작 쪽 변, "right"/"bottom"은 끝 쪽 변이다 —
     축마다 이름이 다를 뿐 계산은 하나다. */
  const shift = (side, low, high, at, to) => {

    if (side === "left" || side === "top") return low - at;
    if (side === "right" || side === "bottom") return high - to;
    if (side === "center") return (low + high) / 2 - (at + to) / 2;

    return 0;

  };

  const dx =
    shift(anchor.x, anchor.left, anchor.right, rect.left, rect.right);

  const dy =
    shift(anchor.y, anchor.top, anchor.bottom, rect.top, rect.bottom);

  wrapper.style.translate =
    (dx || dy)
      ? `${Math.round(dx * 100) / 100}px ${Math.round(dy * 100) / 100}px`
      : "";

}


/* COMMON-SELECT-BOX-1 — 임시 미리보기가 받는 상자 선언.
   부모(studio/studio-preview.js INSPECTOR_PREVIEW_STYLE_PROPERTIES)가
   이미 한 번 걸렀고, 여기서도 아는 이름과 모양만 받는다. */
const INSPECTOR_PREVIEW_BOX_PROPERTIES = [
  "width", "max-width", "height", "min-height",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border", "border-radius",
  "text-align", "justify-content", "align-items", "justify-items", "align-content"
];

const INSPECTOR_PREVIEW_BOX_VALUE = /^[0-9a-z.%#(), -]{1,40}$/i;


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
      style: selected.getAttribute("style"),
      crop: null
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

  /* EDITORIAL-CUSTOMIZATION-1 — 선언 임시 반영(글자 크기 슬라이더).
     부모가 이름과 값 모양을 이미 걸렀고, 여기서도 아는 속성만
     받는다. 되돌리기는 위에서 기억해 둔 style 속성 원본이 한다. */
  if (data.style && typeof data.style === "object") {

    if (typeof data.style["font-size"] === "string") {
      selected.style.fontSize = data.style["font-size"];
    }

    /* COMMON-SELECT-BOX-1 — 크기 · 여백 · 정렬은 확정 규칙에
       !important 가 붙는다(studio-inspector-box-model.js 머리말).
       끄는 동안 보이는 그림이 확정 뒤와 같으려면 임시 선언도 같은
       무게여야 한다. 아는 이름만 받는다. */
    INSPECTOR_PREVIEW_BOX_PROPERTIES.forEach((property) => {

      const value =
        data.style[property];

      if (typeof value === "string" && INSPECTOR_PREVIEW_BOX_VALUE.test(value)) {
        selected.style.setProperty(property, value, "important");
      }

    });

  }

  if (typeof data.width === "number" && Number.isFinite(data.width)) {

    /* 세 가지 대상이 있다.

         "frame"      자른 사진의 프레임(래퍼) — 안쪽 사진에 px 를
                      박으면 프레임 안이 어긋나 빈틈이 생긴다
         "sizeOwner"  스킨이 폭을 정해 둔 바깥 상자
                      (EDITORIAL-CUSTOMIZATION-1) — 비율·높이는
                      스킨이 정한 그대로 두고 폭만 바꾼다
         그 밖        사진 자신 */
    const sizeOwner =
      data.target === "sizeOwner" ? inspectorSizeOwnerOf(selected) : null;

    const sizeTarget =
      sizeOwner ||
      ((data.target === "frame" && inspectorFrameElementOf(selected) !== selected)
        ? ensureInspectorCropWrapper(selected, inspectorPreviewRestore)
        : selected);

    if (sizeTarget) {

      /* 바깥 상자는 선택한 요소가 아니라 그 조상이다 — 임시 반영을
         걷을 때 되돌릴 수 있게 style 속성 원본을 따로 기억한다. */
      if (sizeOwner && !inspectorPreviewRestore.owner) {
        inspectorPreviewRestore.owner = {
          element: sizeOwner,
          style: sizeOwner.getAttribute("style")
        };
      }

      /* 바깥 상자의 확정 규칙에는 !important 가 붙는다
         (studio-inspector-model.js frameSize) — 끄는 동안 보이는
         그림이 확정 뒤와 같으려면 임시 선언도 같은 무게여야 한다. */
      if (sizeOwner) {
        sizeTarget.style.setProperty("width", `${Math.round(data.width)}px`, "important");
        sizeTarget.style.setProperty("max-width", "100%", "important");
      } else {
        sizeTarget.style.width = `${Math.round(data.width)}px`;
        sizeTarget.style.maxWidth = "100%";
      }

      if (sizeTarget === selected) {
        sizeTarget.style.height = "auto";
      }

      /* 바깥 상자의 비율은 스킨의 것이다 — 덮어쓰지 않는다 */
      if (!sizeOwner) {

        sizeTarget.style.aspectRatio =
          (typeof data.ratio === "number" && Number.isFinite(data.ratio) && data.ratio > 0)
            ? String(data.ratio)
            : "";

      }

    }

  }

  /* =====================================================
     LAYOUT-1 — 자유 배치의 좌표 임시 미리보기

     Studio 가 보내는 것은 확정될 값 그대로(0~1 비율)이고, 여기서는
     그것을 skin/skin-layout.css 가 읽는 **바로 그 custom property**
     에 써 넣는다. 그래서 끄는 동안 보이는 자리와 손을 뗀 뒤
     확정되어 다시 그려진 자리가 같은 계산에서 나온다.

     되돌리기는 따로 없다 — 위에서 이 요소의 style 속성 원본을 이미
     기억해 뒀고(inspectorPreviewRestore.style), clearInspectorPreview()
     가 그것을 되돌린다.
  ====================================================== */
  if (data.layoutPosition && typeof data.layoutPosition === "object") {

    const ratio = (value) => {

      const parsed = Number(value);

      return Number.isFinite(parsed)
        ? String(Math.min(1, Math.max(0, parsed)))
        : null;

    };

    const x = ratio(data.layoutPosition.x);
    const y = ratio(data.layoutPosition.y);

    if (x !== null) {
      selected.style.setProperty("--imory-it-x", x);
    }

    if (y !== null) {
      selected.style.setProperty("--imory-it-y", y);
    }

  }

  if (data.crop && typeof window.buildInspectorCropDeclarations === "function") {

    const wrapper =
      ensureInspectorCropWrapper(selected, inspectorPreviewRestore);

    if (wrapper) {

      const declarations =
        window.buildInspectorCropDeclarations(data.crop, {
          frameWidth: data.crop.frameWidth,
          fixedWidth: !!data.crop.fixedWidth,
          fill: data.crop.fill
        });

      /* 프레임 방식이 바뀌면(상자 채우기 → 비율, IMAGE-CROP-PRIORITY-1)
         앞 방식의 자리·크기 선언이 남아 새 방식을 이긴다 — 옛
         height:100% 가 남으면 aspect-ratio 가 무시된다. 적용하면
         걷히는 값(studio-inspector-crop.js
         STUDIO_INSPECTOR_CROP_FRAME_GEOMETRY)이므로 미리보기에서도
         걷는다. 이미 확정된 프레임이면 확정 규칙의 값까지 눌러 둔다. */
      const frameDeclarations =
        declarations.frame;

      ["position", "inset", "width", "height", "aspect-ratio", "max-width"].forEach((property) => {

        if (frameDeclarations[property]) {
          return;
        }

        wrapper.style.removeProperty(property);

        if (!inspectorPreviewRestore.crop.created && (property === "height" || property === "inset")) {
          wrapper.style.setProperty(property, "auto");
        }

      });

      applyInspectorInlineDeclarations(wrapper, declarations.frame);
      applyInspectorInlineDeclarations(selected, declarations.image);

      /* =================================================
         IMAGE-CROP-PRIORITY-1 — 스킨 CSS 보다 강하게

         확정된 자르기는 렌더러가 cascade layer 안의 !important 로
         보호한다(skin/skin-render.js buildSkinCropGuardCss). 적용
         전에는 규칙이 아직 없으니 **같은 선언 묶음**을 inline
         !important 로 얹는다 — inline !important 는 스킨이 어떤
         선택자로 !important 를 걸었든 이긴다. 그래서 슬라이더를
         움직이는 동안 보이는 것과 적용한 뒤 보이는 것이 같다.
         clearInspectorPreview() 가 style 속성을 통째로 되돌리므로
         취소하면 흔적이 남지 않는다.
      ================================================== */
      const guard =
        buildSkinCropGuardDeclarations(declarations.image);

      if (guard) {
        applyInspectorInlineDeclarations(wrapper, guard.frame, true);
        applyInspectorInlineDeclarations(selected, guard.image, true);
      }

      pinInspectorCropFrame(wrapper, data.crop.anchor);

    }

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

  if (window.previewInspectDirect) {
    window.previewInspectDirect.reset();
  }

}


/* =========================================================
   HOME-CANVAS-SELECT-1B-1 — native Preview 의 캔버스 선택 틀

   ★ 실행 코드는 이 파일에 없다. sandbox 프레임과 **같은 파일
     한 벌**(skin/skin-home-canvas-editor-runtime.js)을 쓰고, 이
     문서는 "렌더 루트를 넘겨 주고, 틀이 붙었다고 Studio 에
     알리는 것"만 한다.

   ★ 언제 처음 받는가

   Studio 가 active:true 로 캔버스 선택을 내려보낸 순간이다. 그
   메시지는 HOME · 유효한 canvas · Select 모드 · 고를 수 있는
   요소를 전부 지난 뒤에만 나간다. 해제 메시지만으로는 모듈을
   받아 오지 않는다 — 아래 첫 관문이 그것이다.

   ★ native Preview 에는 CSP nonce 가 없다(sandbox 프레임에만
     있다). Moveable 의 cspNonce 기본값이 빈 문자열이므로 그대로
     빈 문자열을 넘긴다 — 코드를 두 벌로 나누지 않는다.
========================================================== */

let canvasFrameController = null;

let canvasFramePromise = null;

let canvasFrameSelection = null;

/* HOME-CANVAS-TRANSFORM-1A — 마지막으로 받은 좌표. runtime 이 아직
   없을 때(좌표가 선택보다 먼저 온 경우) 한 번 더 태우기 위해 둔다. */
let canvasFrameGeometry = null;

/* HOME-CANVAS-GROUP-1B — 마지막으로 받은 그룹 선택. runtime 이 아직
   없을 때(그룹이 선택보다 먼저 온 경우) 한 번 더 태우기 위해 둔다. */
let canvasFrameGroup = null;


function canvasEditorRuntimeUrl() {

  const path =
    "/skin/skin-home-canvas-editor-runtime.js";

  /* 저장소 규칙: 주소에 ?v=APP_BUILD_VERSION(CLAUDE.md §4). 값은
     여기에 적지 않고 build-version.js 의 전역에서 읽는다. */
  return (typeof window.APP_BUILD_VERSION === "string" && window.APP_BUILD_VERSION)
    ? `${path}?v=${encodeURIComponent(window.APP_BUILD_VERSION)}`
    : path;

}


function ensureCanvasFrameController() {

  if (canvasFrameController) {
    return Promise.resolve(canvasFrameController);
  }

  if (canvasFramePromise) {
    return canvasFramePromise;
  }

  const loading =
    import(canvasEditorRuntimeUrl()).then(
      (mod) => {

        if (typeof mod.createHomeCanvasSelectionFrame !== "function") {
          throw new Error("createHomeCanvasSelectionFrame 이 없습니다");
        }

        canvasFrameController =
          mod.createHomeCanvasSelectionFrame({

            doc: document,

            getRoot: () => previewRoot,

            /* 이 문서에는 CSP nonce 가 없다 — 라이브러리 기본값과
               같은 빈 문자열이다(위 머리말). */
            getNonce: () => "",

            onActiveChange: (active, editId) => {

              postToParent({
                type: PREVIEW_MSG_CANVAS_FRAME,
                active: active === true,
                editId: typeof editId === "string" ? editId : null
              });

            },

            /* HOME-CANVAS-V2-ELEMENTS-1 — v2 프레임의 페이지 자리.
               숫자만 올라간다(위 머리말) — 무엇에 쓸지는 Studio 가
               자기 draft 를 보고 정한다. */
            onLayout: (layout) => {

              if (!layout || !Array.isArray(layout.frames)) {
                return;
              }

              postToParent({
                type: PREVIEW_MSG_CANVAS_LAYOUT,
                /* `w` 는 HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 이 더한
                   **그려진 폭**이다(계약 §30-3) */
                frames: layout.frames.map(
                  (frame) => ({ id: frame.id, x: frame.x, y: frame.y, w: frame.w })
                ),

                /* HOME-CANVAS-V2-MANUAL-FIX-1 — 블록의 그려진 높이
                   (도화지 폭의 분수 · 계약 §29-3) */
                blocks: Array.isArray(layout.blocks)
                  ? layout.blocks.map((block) => ({ id: block.id, h: block.h }))
                  : [],

                /* HOME-CANVAS-V2-MANUAL-FIX-1 — 고른 요소가 지금
                   물려받고 있는 모양(계약 §29-6) */
                look:
                  (layout.look && typeof layout.look === "object")
                    ? { id: layout.look.id, props: { ...layout.look.props } }
                    : null
              });

            },

            /* HOME-CANVAS-SELECT-1B-2 — lasso · Shift 클릭의 제안.
               확정이 아니다(위 머리말) — Studio 가 자기 draft 로
               모든 id 를 다시 본다. */
            onPropose: (proposal) => {

              if (!proposal || !Array.isArray(proposal.ids)) {
                return;
              }

              postToParent({
                type: PREVIEW_MSG_CANVAS_PROPOSE,
                ids: proposal.ids.slice(),
                primaryId:
                  typeof proposal.primaryId === "string" ? proposal.primaryId : null,
                mode: proposal.mode === "toggle" ? "toggle" : "replace",
                generation:
                  Number.isInteger(proposal.generation) && proposal.generation >= 0
                    ? proposal.generation
                    : 0
              });

            },

            /* HOME-CANVAS-TRANSFORM-1A · 1B — 이동 · 리사이즈의 확정
               **요청**. 확정이 아니다(위 머리말) — Studio 가 자기
               draft 로 선택 · 순번 · expected · 범위를 다시 본다.

               ★ 옮기는 칸은 `kind` 가 정한다. 이동 요청에 width 칸을
                 만들어 두면 Studio 의 "정확히 이 키들" 판정에 걸려
                 메시지 전체가 거부된다(계약 §18-6). */
            onTransform: (request) => {

              if (!request || !request.expected || !request.next) {
                return;
              }

              const box =
                (value) => {

                  /* HOME-CANVAS-TRANSFORM-1C — 회전이 옮기는 것은
                     **각도 한 칸**뿐이다. 좌표를 함께 담으면 Studio
                     의 "정확히 이 키들" 판정에 걸려 메시지 전체가
                     거부된다(계약 §19-6). */
                  if (request.kind === "rotate") {
                    return { rotation: value.rotation };
                  }

                  /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록의 폭도
                     **한 칸**이다(계약 §29-4). 블록에는 좌표가 없어
                     함께 담으면 Studio 가 메시지 전체를 거부한다. */
                  if (request.kind === "width") {
                    return { width: value.width };
                  }

                  const out = { x: value.x, y: value.y };

                  if (request.kind === "resize") {
                    out.width = value.width;
                    out.height = value.height;
                  }

                  return out;

                };

              postToParent({
                type: PREVIEW_MSG_CANVAS_TRANSFORM,
                kind: request.kind,
                id: typeof request.id === "string" ? request.id : null,
                expected: box(request.expected),
                next: box(request.next),
                generation:
                  Number.isInteger(request.generation) && request.generation >= 0
                    ? request.generation
                    : 0,
                requestId:
                  Number.isInteger(request.requestId) && request.requestId >= 1
                    ? request.requestId
                    : 0
              });

            },

            /* HOME-CANVAS-GROUP-1B — 그룹 이동의 확정 **요청**.
               확정이 아니다(위 머리말) — Studio 가 자기 draft 로
               그룹 · 멤버 · 순번 · revision 을 다시 본다.

               ★ 여기서 값을 만들지 않는다. runtime 이 준 것을
                 알려진 칸만 새 리터럴로 옮긴다. */
            onGroupMove: (request) => {

              if (!request || typeof request !== "object") {
                return;
              }

              postToParent({
                type: PREVIEW_MSG_CANVAS_GROUP_MOVE,
                groupId: typeof request.groupId === "string" ? request.groupId : null,
                gestureId:
                  Number.isInteger(request.gestureId) && request.gestureId >= 1
                    ? request.gestureId
                    : 0,
                phase: typeof request.phase === "string" ? request.phase : "",
                dx: Number.isFinite(request.dx) ? request.dx : 0,
                dy: Number.isFinite(request.dy) ? request.dy : 0,
                generation:
                  Number.isInteger(request.generation) && request.generation >= 0
                    ? request.generation
                    : 0,
                revision:
                  Number.isInteger(request.revision) && request.revision >= 0
                    ? request.revision
                    : 0,
                requestId:
                  Number.isInteger(request.requestId) && request.requestId >= 1
                    ? request.requestId
                    : 0
              });

            }

          });

        return canvasFrameController;

      }
    );

  canvasFramePromise = loading;

  loading.catch(
    () => {

      /* 다음 선택이 다시 시도할 수 있게 표에서 뺀다 */
      if (canvasFramePromise === loading) {
        canvasFramePromise = null;
      }

    }
  );

  return loading;

}


function applyNativeCanvasSelection(selection) {

  canvasFrameSelection =
    selection || null;

  /*
    HOME-CANVAS-SELECT-1B-2 — 관문이 `editing` 으로 옮겨졌다.
    편집이 꺼진 상태에서 아직 한 번도 만들지 않았으면 만들지
    않는다(공개 비용 0 과 Canvas 없는 스킨의 요청 0 이 여기서
    지켜진다).
  */
  if (!canvasFrameController && !(selection && selection.editing === true)) {
    return;
  }

  ensureCanvasFrameController()
    .then(
      (controller) => {

        controller.apply(
          canvasFrameSelection ||
          { editing: false, active: false, ids: [], primaryId: null, generation: 0 }
        );

        /* HOME-CANVAS-TRANSFORM-1A — 좌표가 선택보다 먼저 왔거나
           runtime 이 이제 막 올라온 경우다(같은 값이면 아무 일도
           하지 않는다). */
        if (canvasFrameGeometry) {
          controller.setGeometry(canvasFrameGeometry);
        }

        /* HOME-CANVAS-GROUP-1B — 그룹도 같은 사정이다(위 ★) */
        if (canvasFrameGroup) {
          controller.setGroup(canvasFrameGroup);
        }

      }
    )
    .catch(
      (err) => {

        console.warn(
          "[preview-bridge] 캔버스 선택 틀을 불러오지 못했습니다 — " +
          "기존 테두리로 표시합니다.",
          err && err.message ? err.message : err
        );

        /* Studio 의 축 평행 overlay 가 그대로 남아야 한다 */
        postToParent({
          type: PREVIEW_MSG_CANVAS_FRAME,
          active: false,
          editId: null
        });

      }
    );

}


/*
  Studio 가 보낸 것을 sandbox 프레임 / 이 문서 중 화면을 맡은
  쪽으로 보낸다. **판단은 없다** — 어느 쪽이 그리고 있는가만 본다.
*/

function routeCanvasSelectionMessage(data) {

  const ids =
    Array.isArray(data.ids)
      ? data.ids.filter((id) => typeof id === "string" && window.isValidInspectorEditId(id))
      : [];

  const primaryId =
    (typeof data.primaryId === "string" && window.isValidInspectorEditId(data.primaryId))
      ? data.primaryId
      : null;

  const selection = {
    editing: data.editing === true,
    active: data.active === true && !!primaryId && ids.indexOf(primaryId) !== -1,
    ids: ids,
    primaryId: primaryId,
    generation: Number.isInteger(data.generation) && data.generation >= 0 ? data.generation : 0
  };

  if (!selection.active) {
    selection.ids = [];
    selection.primaryId = null;
  }

  /* 고른 것이 있으면 편집 중인 것이 당연하다 */
  if (selection.active) {
    selection.editing = true;
  }

  if (hasSandboxPreviewFrame()) {

    setSandboxPreviewCanvasSelection(selection);

    /* sandbox 에서는 테두리도 프레임이 그린다 — Studio 는 이미
       자기 overlay 를 내려 두었다(studioInspectorRemoteOverlay).
       그래서 canvas-frame 신호를 올려보내지 않는다. */
    return;

  }

  applyNativeCanvasSelection(selection);

}


/* =========================================================
   HOME-CANVAS-TRANSFORM-1A — 단일 선택의 Canvas 좌표를 화면 쪽으로

   ★ 여기서도 판단하지 않는다. 무엇을 옮길 수 있는가는 Studio 가
     자기 draft 로 정했고(studio-canvas-selection.js), 이 함수는 어느
     문서가 화면을 맡고 있는가만 본다.

   ★ 이 메시지만으로는 runtime 을 불러오지 않는다. 좌표는 선택과
     짝지어 오고, 켜는 관문은 여전히 canvas-select 의 `editing` 이다.
========================================================== */

/* HOME-CANVAS-V2-EDITOR-1B — pin 장식의 `origin` 분수(선택 칸) */
function previewCanvasOriginOk(value) {

  return (
    value === undefined ||
    value === null ||
    (Number.isFinite(value) && value >= 0 && value <= 1)
  );

}


/* =========================================================
   STUDIO-LAYERS-MATERIALS-1B — 이 문서의 도화지 상자를 올린다
   (위 canvas-probe 주석 · 계약 §36-5)

   ★ 도화지가 없으면 `root:null` 로 답한다. 답을 아예 보내지 않으면
     끌기를 시작한 쪽이 "아직 안 왔다"와 "여기에는 놓을 수 없다"를
     가를 수 없다.
========================================================== */
function postCanvasBoxToParent() {

  const measured =
    (typeof window.measureSkinHomeCanvasBoxes === "function")
      ? window.measureSkinHomeCanvasBoxes(document)
      : null;

  postToParent({
    type: PREVIEW_MSG_CANVAS_BOX,
    root: (measured && measured.root) ? measured.root : null,
    blocks: (measured && Array.isArray(measured.blocks)) ? measured.blocks : [],
    frames: (measured && Array.isArray(measured.frames)) ? measured.frames : []
  });

}


function routeCanvasGeometryMessage(data) {

  const active =
    data.active === true &&
    typeof data.id === "string" &&
    window.isValidInspectorEditId(data.id) &&
    Number.isFinite(data.x) &&
    Number.isFinite(data.y) &&
    /* HOME-CANVAS-TRANSFORM-1B — 크기가 없으면 조작할 수 있는 단독
       선택이 아니다. `height` 는 숫자이거나 `"auto"` 다. */
    Number.isFinite(data.width) && data.width > 0 &&
    (data.height === "auto" || (Number.isFinite(data.height) && data.height > 0)) &&
    /* HOME-CANVAS-TRANSFORM-1C — 각도가 없으면 회전을 시작할 수
       있는 단독 선택이 아니다(크기와 같은 자리) */
    Number.isFinite(data.rotation) &&
    /* HOME-CANVAS-V2-EDITOR-1B — 자의 기준 상자(`scopeId`)와
       `origin` 은 **선택 칸**이다. v1 요소 · v2 overlay 는 도화지
       자에 origin 0 이라 없어도 같은 뜻이다(계약 §26-2). */
    previewCanvasOriginOk(data.originX) &&
    previewCanvasOriginOk(data.originY) &&
    data.baseWidth > 0 &&
    data.baseHeight > 0;

  const geometry = {
    active: active,
    id: active ? data.id : null,
    x: active ? data.x : 0,
    y: active ? data.y : 0,
    width: active ? data.width : 0,
    height: active ? data.height : 0,
    rotation: active ? data.rotation : 0,
    scopeId:
      (active && typeof data.scopeId === "string" && data.scopeId)
        ? data.scopeId
        : null,
    originX: (active && Number.isFinite(data.originX)) ? data.originX : 0,
    originY: (active && Number.isFinite(data.originY)) ? data.originY : 0,

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 고른 것이 흐름 블록인가
       (계약 §29-4). sandbox 프로토콜과 **같은 한 값**이고, 모르는
       값은 자유 배치 요소로 읽는다. */
    mode: (active && data.mode === "block") ? "block" : null,
    baseWidth: active ? data.baseWidth : 0,
    baseHeight: active ? data.baseHeight : 0,
    generation:
      Number.isInteger(data.generation) && data.generation >= 0
        ? data.generation
        : 0,

    /* 확정의 답일 때만 있는 번호다(위 머리말) */
    answering:
      Number.isInteger(data.answering) && data.answering >= 1
        ? data.answering
        : 0
  };

  if (hasSandboxPreviewFrame()) {
    setSandboxPreviewCanvasGeometry(geometry);
    return;
  }

  /* ★ 기억해 두는 값에는 답 번호를 남기지 않는다 — runtime 이 늦게
     올라왔을 때 한 번 더 태우는 자리가 있고(ensureCanvasFrameController),
     거기서 옛 답이 다시 답으로 읽히면 안 된다. */
  canvasFrameGeometry =
    { ...geometry, answering: 0 };

  /* 아직 한 번도 만들지 않았으면 여기서 만들지 않는다 — 좌표
     하나가 vendor 를 받아 오는 계기가 되지 않게 한다. */
  if (!canvasFrameController) {
    return;
  }

  canvasFrameController.setGeometry(geometry);

}


/* =========================================================
   HOME-CANVAS-GROUP-1B — 그룹 선택을 화면 쪽으로

   ★ 여기서도 판단하지 않는다. 무엇이 그룹이고 지금 고른 것이 그
     그룹인지는 Studio 가 자기 draft 로 정했다
     (studio/inspector/studio-canvas-selection.js). 이 함수는 어느
     문서가 화면을 맡고 있는가만 본다.
========================================================== */

function routeCanvasGroupMessage(data) {

  const active =
    data.active === true &&
    typeof data.groupId === "string" &&
    window.isValidInspectorEditId(data.groupId) &&
    Number.isFinite(data.baseWidth) && data.baseWidth > 0;

  const group = {
    active: active,
    groupId: active ? data.groupId : null,
    baseWidth: active ? data.baseWidth : 0,
    locked: data.locked === true,
    generation:
      Number.isInteger(data.generation) && data.generation >= 0
        ? data.generation
        : 0,
    revision:
      Number.isInteger(data.revision) && data.revision >= 0
        ? data.revision
        : 0,
    answering:
      Number.isInteger(data.answering) && data.answering >= 1
        ? data.answering
        : 0
  };

  if (hasSandboxPreviewFrame()) {
    setSandboxPreviewCanvasGroup(group);
    return;
  }

  /* ★ 기억해 두는 값에는 답 번호를 남기지 않는다(위 geometry 의 ★) */
  canvasFrameGroup =
    { ...group, answering: 0 };

  if (!canvasFrameController) {
    return;
  }

  canvasFrameController.setGroup(group);

}


/*
  진단용 — e2e 가 이 문서 안에서 "인스턴스가 몇 개인가 · 틀이
  회전을 따라가는가"를 잰다. 읽기 전용이고, 이 창구로 선택을
  바꿀 수는 없다(sandbox 프레임의 같은 이름과 짝이다).
*/

window.__imoryCanvasFrameState =
  function () {

    return canvasFrameController ? canvasFrameController.debugState() : null;

  };


/* DIRECT-UX-1 — 직접 조작 모듈에 이 문서의 Inspector 상태를 빌려준다
   (studio/preview/preview-inspect-direct.js). 그 파일은 이 함수들로만
   읽고 쓴다. */
if (window.previewInspectDirect) {

  window.previewInspectDirect.install({
    isActive: inspectorNativeActive,
    root: inspectorSkinRoot,
    selected: inspectorReviveSelection,
    editIdOf: inspectorEditIdOf,
    resolveTarget: resolveInspectableTarget,
    rectOf: inspectorRectOf,
    visibleRectOf: inspectorVisibleRectOf,
    post: postToParent,
    hover(el) {
      setInspectorHover(el);
    },
    select(el) {
      setInspectorSelection(el);
      window.previewInspectDirect.syncMovableMark();
    }
  });

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

    if (!inspectorNativeActive()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    /* DIRECT-UX-1 — 실제 포인터 클릭은 "그 자리에 겹친 것" 중에서
       우선순위로 고른다(겹쳤으면 Studio 가 메뉴로 묻는다). 좌표가 없는
       합성 이벤트만 아래 예전 규칙으로 간다
       (studio/preview/preview-inspect-direct.js). */
    if (window.previewInspectDirect && window.previewInspectDirect.handleClick(event)) {
      return;
    }

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

    if (!inspectorNativeActive()) {
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

    if (!inspectorNativeActive()) {
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

    if (!inspectorNativeActive()) {
      return;
    }

    if (window.previewInspectDirect && window.previewInspectDirect.pointerOver(event)) {
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

    if (!inspectorNativeActive() || event.relatedTarget) {
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

    if (!inspectorNativeActive() || event.key !== "Escape") {
      return;
    }

    /* 글자를 고치는 중의 Escape 는 "그 입력만 취소"다 — 편집 요소의
       리스너가 받는다. 여기서 올리면 Studio 가 선택까지 풀어 버린다. */
    if (window.previewInspectDirect && window.previewInspectDirect.isEditing()) {
      return;
    }

    /* 좌우 영역의 모바일 패널이 열려 있으면 이 Escape 는 "패널 닫기"다
       (skin/skin-sides.js 가 받는다) — 선택까지 한 번에 풀지 않는다. */
    if (document.querySelector('[data-imory-sides-phase="open"]')) {
      return;
    }

    postToParent({ type: PREVIEW_MSG_INSPECT_ESCAPE });

  },
  true
);


window.addEventListener("scroll", scheduleInspectorRects, true);

window.addEventListener("resize", scheduleInspectorRects);


/* SANDBOX-SELECT-PARITY-1 — sandbox 프레임이 화면을 맡고 있으면 이
   문서가 스크롤돼도 프레임 안 좌표는 그대로다. 마지막 사각형을 지금
   iframe 자리로 다시 옮겨 올린다(studio/preview/preview-sandbox.js
   refreshSandboxPreviewInspectRects). 한 프레임에 한 번. */
let sandboxInspectScrollFrame = 0;

function scheduleSandboxInspectRects() {

  if (!inspectorEnabled || !hasSandboxPreviewFrame() || sandboxInspectScrollFrame) {
    return;
  }

  sandboxInspectScrollFrame =
    window.requestAnimationFrame(() => {
      sandboxInspectScrollFrame = 0;
      refreshSandboxPreviewInspectRects();
    });

}

window.addEventListener("scroll", scheduleSandboxInspectRects, true);

window.addEventListener("resize", scheduleSandboxInspectRects);


/* =========================================================
   SANDBOX-6A — 프레임이 올려보낸 inspect 결과를 Studio 로

   preview-sandbox.js 가 좌표를 **이 문서의 것으로** 이미 옮겨
   놓았다. 여기서 하는 일은 그것을 지금까지 쓰던 통로로 흘려
   보내는 것 하나다 — 메시지 이름도, 키도 native 와 같다.

   ★ 여기서 값을 다시 만들지 않는다. postToParent 는 봉투를
     그대로 보내고, 최종 판정(그 식별자가 지금 draft template 에
     실제로 있는가)은 Studio 가 한다.
========================================================== */

setSandboxPreviewInspectRelay(function (message) {

  if (!message || typeof message.type !== "string") {
    return;
  }

  postToParent(message);

});


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

  /* TRANSITION-1 — 패널을 여닫는 링크(data-imory-toggle)는 스킨 루트가
     이미 처리했다(skin/skin-transition.js). 미리보기 페이지를 옮기지
     않는다 — 공개 화면의 skin-link-nav 가 defaultPrevented 를 존중하는
     것과 같은 결이다. */
  if (event.defaultPrevented && anchor.hasAttribute("data-imory-toggle")) {
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

    /*
      SANDBOX-4 — 분기는 여기 한 곳이다. 거짓이면(= renderMode 가
      없거나 native 인 지금까지의 모든 스킨) 아래 줄로 그대로
      떨어져 이 파일의 원래 경로를 탄다.
    */

    if (shouldRenderPreviewInSandbox(data.renderMode, data.context)) {

      handleSandboxRenderMessage(data);
      return;

    }


    /*
      sandbox → native 로 돌아온 경우(Import/AI/되돌리기로
      renderMode 가 사라졌다). 프레임을 먼저 치운다 — 안 그러면
      native 렌더가 그 위에 얹힌다.
    */

    teardownSandboxPreview();

    handleRenderMessage(data);
    return;

  }

  if (data.type === PREVIEW_MSG_RENDER_BANNER) {

    if (!isValidBannerMessage(data)) {
      postToParent({ type: PREVIEW_MSG_ERROR, message: "malformed preview:render-banner payload" });
      return;
    }

    /*
      SANDBOX-4 — 이 경로는 templates.banner 가 **없는** 스킨의
      배너 카테고리다(Skin template 시스템 밖의 read-only adapter).
      sandbox 스킨이라도 그 template 이 없으면 여기로 온다.

      handleBannerMessage() 는 previewRoot 를 통째로 비우므로
      프레임 요소는 어차피 사라지지만, 그것만으로는 부모 쪽
      message 리스너가 남는다. 먼저 제대로 내린다.
    */

    teardownSandboxPreview();

    handleBannerMessage(data);
    return;

  }

  if (data.type === PREVIEW_MSG_INSPECTOR_MODE) {

    setInspectorEnabled(data.enabled === true);

    /*
      SANDBOX-6A — sandbox 스킨이면 프레임에도 알린다.

      ★ 위 setInspectorEnabled() 를 건너뛰지 않는다. 그 함수가
      켜는 것은 **이 문서의** hit-test 인데, sandbox 렌더에서는
      이 문서에 스킨 DOM 이 없어(previewRoot 안은 iframe 하나다)
      그 리스너들이 고를 것을 찾지 못한다 — 켜 두어도 아무 일이
      없고, 프레임이 native 로 폴백했을 때 그대로 동작한다.
    */

    setSandboxPreviewInspectMode(data.enabled === true);

    return;

  }

  if (data.type === PREVIEW_MSG_INSPECTOR_SELECT) {

    /*
      SANDBOX-6A — sandbox 스킨이면 프레임이 선택의 주인이다.
      (아래 native 경로는 inspectorEnabled 가 꺼져 있으면 어차피
       빠져나간다.)
    */

    if (hasSandboxPreviewFrame()) {

      setSandboxPreviewInspectSelection(
        (typeof data.editId === "string" && window.isValidInspectorEditId(data.editId))
          ? data.editId
          : null
      );

      return;

    }

    if (!inspectorNativeActive()) {
      return;
    }

    const root =
      inspectorSkinRoot();

    const picked =
      (root && typeof data.editId === "string" && window.isValidInspectorEditId(data.editId))
        ? root.querySelector(`[data-imory-edit-id="${data.editId}"]`)
        : null;

    setInspectorSelection(picked, { silent: true });

    /* =====================================================
       STUDIO-LAYERS-MEDIA-1 — 부모가 시킨 선택에도 **좌표를 한 번
       올린다**(setInspectorSelection 머리말이 이미 약속한 그 보고다).

       silent 는 "선택했다는 말을 되돌려 보내지 않는다"는 뜻이지
       "좌표를 숨긴다"가 아니다. 그런데 이 경로에서는 아무도
       postInspectorRects() 를 부르지 않아, Layers 처럼 **부모가
       고르는 입구**로 고른 요소는 부모가 좌표를 영영 모른 채로
       남았다 — 캔버스의 축 평행 테두리와 이름표는 그 좌표가 있어야
       그려지므로 화면에 아무것도 표시되지 않았다(§5). Moveable 틀이
       붙는 종류는 그 틀이 대신 보여서 가려져 있었을 뿐이다.

       ★ 고른 것이 없을 때는 보내지 않는다. selected:null 보고는
         "프레임이 그 요소를 놓았다"는 뜻으로 읽히는 자리가 있어
         (studio/inspector/studio-inspector.js 의 rects 처리) 부모가
         방금 푼 선택에 그 말을 되풀이할 이유가 없다.
    ====================================================== */
    if (picked) {
      postInspectorRects();
    }

    return;

  }

  if (data.type === PREVIEW_MSG_CANVAS_SELECT) {

    routeCanvasSelectionMessage(data);

    return;

  }

  if (data.type === PREVIEW_MSG_CANVAS_GEOMETRY) {

    routeCanvasGeometryMessage(data);

    return;

  }

  /* HOME-CANVAS-GROUP-1B — 그룹 선택(위 머리말) */
  if (data.type === PREVIEW_MSG_CANVAS_GROUP) {

    routeCanvasGroupMessage(data);

    return;

  }

  /* STUDIO-LAYERS-MATERIALS-1B — 재료를 끌어다 놓을 자리를 묻는다
     (계약 §36-5). sandbox 가 화면을 맡고 있으면 그 프레임이
     답한다 — 이 문서에는 도화지가 없다. */
  if (data.type === PREVIEW_MSG_CANVAS_PROBE) {

    if (hasSandboxPreviewFrame()) {
      requestSandboxPreviewCanvasBox();
      return;
    }

    postCanvasBoxToParent();

    return;

  }

  if (data.type === PREVIEW_MSG_TRANSITION_PLAY) {

    playPreviewTransition(data.editId);

    return;

  }

  /* SANDBOX-SELECT-PARITY-1 — sandbox 프레임이 화면을 맡고 있으면
     직접 조작 지시(caps · choose · parent · 임시 미리보기)는 그
     프레임으로 간다(studio/preview/preview-sandbox.js). 이 문서에는
     고를 요소가 없다. */
  if (hasSandboxPreviewFrame() && forwardSandboxPreviewInspectDirective(data)) {
    return;
  }

  /* DIRECT-UX-1 — preview:inspector-caps / -choose / -parent
     (studio/preview/preview-inspect-direct.js). sandbox 프레임이 화면을
     맡고 있으면 이 문서에 고를 요소가 없으므로 그 파일이 아무 일도
     하지 않는다(isActive = inspectorNativeActive). */
  if (window.previewInspectDirect && window.previewInspectDirect.handleMessage(data)) {
    return;
  }

  if (data.type === PREVIEW_MSG_INSPECT_PREVIEW) {

    if (!inspectorNativeActive()) {
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

    /*
      SANDBOX-4 — sandbox 로 그리는 중이면 본문도 프레임으로 간다.
      내용은 native 경로와 **같은 것**이다(parent 가 공개 POST
      Viewer 와 같은 파이프라인으로 이미 만든 결과물).
    */

    if (hasSandboxPreviewFrame()) {

      sendSandboxPreviewPostBody({
        html: data.html,
        containerStyle: data.containerStyle,
        isHtmlContent: data.isHtmlContent
      });

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
