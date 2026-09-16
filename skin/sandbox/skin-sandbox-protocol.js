/* =========================================================
   SKIN SANDBOX - PROTOCOL (classic script, 의존 없음)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §D-2
   단계: SANDBOX-2 — 허용 메시지는 **아홉 개뿐**이다.

     frame  -> parent   IMORY_FRAME_READY  { contract }
     parent -> frame    IMORY_FRAME_ACK    { contract }
     parent -> frame    IMORY_RENDER_HOME  { contract, pageType,
                                             renderSeq, template, data }
     frame  -> parent   IMORY_RENDERED     { contract, pageType,
                                             renderSeq, height }
     frame  -> parent   IMORY_HEIGHT       { contract, renderSeq, height }
     frame  -> parent   IMORY_FRAME_ERROR  { contract, code }

   SANDBOX-2에서 더해진 셋:

     parent -> frame    IMORY_RENDER_PAGE  { contract, pageType,   // home|category|post|banner|highlights
                                             renderSeq, template, data }
     parent -> frame    IMORY_POST_BODY    { contract, renderSeq, html,
                                             containerStyle, isHtmlContent }
     frame  -> parent   IMORY_NAVIGATE     { contract, renderSeq, navId }

   ★ IMORY_NAVIGATE 에 href 가 없다. 프레임은 주소를 보내지 않고
     부모가 발급한 정수 navId 만 돌려보낸다 — 그 표는 부모 realm의
     skin/sandbox/skin-sandbox-nav.js 가 갖는다.

   (설계 문서 §D-2는 같은 신호들을 IMORY_READY / IMORY_INIT /
    IMORY_ERROR 로 적고 있다. SANDBOX-0 지시문의
    IMORY_FRAME_READY/ACK 와 SANDBOX-1 지시문의 IMORY_RENDER_HOME /
    IMORY_RENDERED / IMORY_HEIGHT / IMORY_FRAME_ERROR 가 정본이다 —
    §D-2 표를 이 이름으로 맞췄다.)

   ★ renderSeq — 늦게 도착한 응답이 최신 화면을 덮지 않게

   봉투의 seq 는 "이 채널에서 몇 번째 메시지인가"이고, payload 의
   renderSeq 는 "어느 렌더에 대한 것인가"다. 부모는 렌더를 새로
   보낼 때마다 renderSeq 를 올리고, 자기가 기다리는 값이 아닌
   RENDERED/HEIGHT 를 **버린다**. 프레임도 자기가 받은 마지막
   renderSeq 만 그린다(기존 mountToken/postPageRequestSeq 와 같은
   장치 — 설계 문서 §F#5).

   ---------------------------------------------------------
   ★ 왜 한 파일인가

   부모 문서와 frame 문서는 서로 다른 origin의 서로 다른 browsing
   context다 — 전역을 공유하지 않는다. 그래서 **같은 파일을 양쪽에
   각각 로드**한다. 검증 로직을 복붙하면 두 쪽이 서서히 달라지고,
   달라지는 쪽이 늘 느슨한 쪽이다. 이 패턴은 저장소에 선례가 있다
   (studio/inspector/studio-inspector-model.js를 Studio와
    preview-frame.html이 각각 로드한다).

   ★ 검증 순서 (실패하면 그 자리에서 끝, 조용히)

     1. event.origin 이 기대한 origin과 **정확히** 같은가
     2. event.source 가 기대한 window와 같은가
     3. data.imory === 1  (다른 라이브러리 noise 1차 차단)
     4. data.type 이 이번 라운드가 아는 여섯 개 중 하나인가
     5. 방향이 맞는가 (parent가 IMORY_FRAME_ACK을 받지 않는다)
     6. seq 가 정수인가
     7. payload가 plain object이고 **알려진 키만** 있는가
     8. 타입별 값 검사(spec.check) — height 범위·pageType·template

   ★ 알려진 키만 읽는다 / 알려진 키만 만든다

   payload를 `{...data.payload}`로 받지 않는다. 모르는 키가 하나라도
   있으면 거부한다(reject-unknown-keys). 나중에 필드가 늘어도
   "조용히 흘러 들어오는" 경로가 생기지 않는다 —
   skin/skin-package-import.js가 SkinPackage에 쓰는 원칙과 같다.

   ★ 실패는 조용하다

   검증에 걸린 메시지에 응답하지 않는다. 화면에도 쓰지 않는다.
   프로빙하는 쪽에 "무엇이 틀렸는지"를 알려 주지 않기 위해서다
   (호출자가 진단이 필요하면 돌려받은 reason을 자기 로그에만 쓴다).
========================================================== */


var SANDBOX_MESSAGE_ENVELOPE = 1;

var SANDBOX_MESSAGE_CONTRACT = 1;


var SANDBOX_MESSAGE_TYPES = {
  FRAME_READY: "IMORY_FRAME_READY",
  FRAME_ACK: "IMORY_FRAME_ACK",

  /* SANDBOX-1 — HOME 한 장 */
  RENDER_HOME: "IMORY_RENDER_HOME",
  RENDERED: "IMORY_RENDERED",
  HEIGHT: "IMORY_HEIGHT",
  FRAME_ERROR: "IMORY_FRAME_ERROR",

  /* =======================================================
     SANDBOX-2 — CATEGORY/POST 와 안전한 페이지 이동

     RENDER_PAGE : RENDER_HOME 과 같은 봉투에 pageType 이 셋으로
                   늘어난 것. HOME 도 이제 이 메시지로 간다 —
                   RENDER_HOME 은 SANDBOX-1 하네스와의 호환을 위해
                   남아 있고, **home 외의 pageType 을 절대 받지
                   않는다**(아래 spec 참고).
     POST_BODY   : 글 본문 한 덩어리. Context 로는 본문에 닿을 수
                   없다는 계약(PHASE1C 7-2절)을 프레임 경계에서도
                   그대로 지키려고 채널을 나눈 것이다 — Studio
                   Preview 의 preview:post-body 와 같은 shape.
     NAVIGATE    : 프레임이 부모에게 "이동해 달라"고 청한다.
                   ★ 주소가 아니라 **부모가 발급한 정수 navId** 다
                     (skin/sandbox/skin-sandbox-nav.js 상단 주석).
  ======================================================= */

  RENDER_PAGE: "IMORY_RENDER_PAGE",
  POST_BODY: "IMORY_POST_BODY",
  NAVIGATE: "IMORY_NAVIGATE",

  /* =======================================================
     SANDBOX-5A — 저자 JS 가 오류를 냈다

     ★ FRAME_ERROR 와 **다른 메시지**인 것이 핵심이다.

     FRAME_ERROR 는 "이 화면을 그리지 못했다"는 뜻이고, 부모는
     그것을 받으면 렌더를 실패로 접는다(공개 화면은 native 로
     폴백한다). 저자 JS 의 오류는 그것과 다르다 — HTML/CSS 는
     이미 그려져 있고 그대로 남아야 한다. 그래서 이 메시지는
     렌더 결과를 바꾸지 않는다.

     ★ 문장이 없다. 정해진 짧은 코드 하나뿐이다.

     저자의 코드에서 나온 오류 문구와 stack 에는 blob/파일 경로와
     내부 사정이 섞일 수 있다. 그것을 부모 realm 으로 올리지
     않는다 — 자세한 내용은 프레임 콘솔에만 남는다(공개 화면에는
     아무것도 표시하지 않고, Studio 는 짧은 안내 한 줄을 띄운다).
  ======================================================= */

  SCRIPT_ERROR: "IMORY_SCRIPT_ERROR",


  /* =======================================================
     SANDBOX-6A — Element Inspector (Select)

     Studio 의 Select 는 지금까지 native Preview 에서만 됐다.
     프레임 안 DOM 은 cross-origin 이라 Studio 가 읽을 수 없어
     버튼을 잠가 뒀다. 그 다섯 줄이 이 다섯 메시지다.

       INSPECT_MODE   parent -> frame  { renderSeq, enabled }
                      지시문의 INSPECT_START / INSPECT_STOP 이
                      **한 메시지**다(enabled 로 가른다) —
                      기존 native 계약(preview:inspector-mode)과
                      같은 모양을 유지하려고 이렇게 뒀다.

       INSPECT_PICK   parent -> frame  { renderSeq, editId? }
                      부모가 선택을 정한다. editId 가 **없으면**
                      해제다 — 지시문의 INSPECT_CLEAR 가 이것이다.

       INSPECT_HOVER  frame -> parent  { renderSeq, editId?, rect? }
       INSPECT_SELECT frame -> parent  { renderSeq, editId?, tagName?, rect? }
                      editId 가 없으면 "아무것도 고르지 않았다"
                      (프레임 안 Escape · 빈 자리 클릭).
       INSPECT_RECTS  frame -> parent  { renderSeq, hover?, selected? }
                      좌표만 다시 보낸다. 저자 JS 의 애니메이션·
                      이미지 로드·높이 변화로 사각형이 움직이면
                      부모의 팝오버가 따라가야 한다. native 의
                      preview:inspect-rects 와 같은 성격이다.

       INSPECT_ERROR  frame -> parent  { renderSeq, code }
                      진단용 코드 하나. 화면에 오류를 띄우는
                      신호가 아니다(SCRIPT_ERROR 와 같은 결).

     ★ 올라가는 것은 **식별자 문자열 · 태그 이름 · 사각형 네 개**
       뿐이다. DOM 노드도, innerHTML 도, 사용자 글 본문도, computed
       style 덤프도 없다 — native Inspector 가 올려보내는 것과
       정확히 같은 최소값이다(studio/preview/preview-bridge.js
       PHASE AI-6A 주석). 고른 요소가 **무엇인지**(바인딩·보호
       영역·가능한 수정)는 부모가 자기 SkinPackage 에서 그 id 로
       다시 찾아 판단한다. 그래서 프레임이 descriptor 를 위조해도
       얻는 것이 없다: 존재하지 않는 id 는 부모의 대조에서 떨어진다.
  ======================================================= */

  INSPECT_MODE: "IMORY_INSPECT_MODE",
  INSPECT_PICK: "IMORY_INSPECT_PICK",
  INSPECT_HOVER: "IMORY_INSPECT_HOVER",
  INSPECT_SELECT: "IMORY_INSPECT_SELECT",
  INSPECT_RECTS: "IMORY_INSPECT_RECTS",
  INSPECT_ERROR: "IMORY_INSPECT_ERROR"
};


/* =========================================================
   ★ SANDBOX-1에서 더해진 값 제한

   높이: 부모가 iframe.style.height에 그대로 쓰는 숫자다. 정수가
   아니거나 범위를 벗어나면 **메시지 자체를 버린다** — 화면이
   0이 되거나(콘텐츠가 사라진다) 브라우저가 감당 못 할 크기로
   자라는 것을 프로토콜 층에서 막는다.

   pageType: 이번 라운드는 HOME 한 장뿐이다. 다른 값이 오면
   거부한다 — "모르는 것을 sandbox로 추측하지 않는다"는 규칙을
   메시지 층에서도 지킨다.

   오류 코드: 프레임이 부모에게 돌려줄 수 있는 문장은 없다.
   **정해진 짧은 코드만** 보낸다(민감한 원문·stack 금지).
========================================================== */

var SANDBOX_MIN_FRAME_HEIGHT = 1;

var SANDBOX_MAX_FRAME_HEIGHT = 200000;

var SANDBOX_MAX_TEMPLATE_CHARS = 2000000;

/*
  SANDBOX-3 — banner / highlights 가 더해졌다. 이 배열은 **새 메시지
  (RENDER_PAGE)와 그 짝인 RENDERED 에만** 쓰인다 — 아래
  SANDBOX_HOME_PAGE_TYPE 은 여전히 home 하나다(옛 RENDER_HOME 은 옛
  약속 그대로).

  folder(Series Viewer)는 아직 들어오지 않았다 — 그 화면은 계속
  native 로 그려진다(IMORY_SANDBOX_SKIN_DESIGN.md 남은 차이). 여기
  이름을 적지 않은 pageType 은 메시지 단계에서 거부된다 — 모르는
  화면을 sandbox 로 추측하지 않는다.
*/

var SANDBOX_PAGE_TYPES =
  ["home", "category", "post", "banner", "highlights"];


/*
  ★ RENDER_HOME 은 여전히 home 한 값만 받는다.

  SANDBOX-1 의 단위 테스트가 "pageType 이 home 이 아니면 거부"를
  이 메시지로 확인한다. 페이지가 늘었다고 그 메시지를 넓히면 옛
  계약이 조용히 느슨해진다 — 넓어진 것은 새 메시지(RENDER_PAGE)
  쪽이고, 옛 메시지는 옛 약속 그대로 둔다.
*/

var SANDBOX_HOME_PAGE_TYPE = "home";


/*
  본문 문자열 상한. 글 하나가 이보다 길면 프레임에 보내지 않는다 —
  화면은 그려지고 본문 자리만 비며, 부모 콘솔에 사유가 남는다.
*/

var SANDBOX_MAX_POST_BODY_CHARS = 2000000;

/*
  ★ SANDBOX-3.1 — containerStyle 이 bodyCss 로 바뀐 자리.

  프레임 CSP 에는 style-src 'unsafe-inline' 이 없다. 그래서 본문의
  inline style 은 프레임에서 **적용되지 않는다**(2026-09-15
  chromium·webkit 실측). 부모가 그 선언들을 검증해서 stylesheet
  텍스트 하나로 바꿔 보내고, 프레임은 그것을 nonce 가 붙은
  <style> 에 넣는다(posts/style/posts-body-style-extract.js).

  컨테이너(본문 region) 의 선언도 그 텍스트 안에 들어 있으므로
  containerStyle 이라는 칸은 더 이상 없다.

  상한이 본문보다 훨씬 작은 이유: 이 텍스트는 요소 하나당 규칙
  한 줄이고, 값은 전부 allowlist 를 통과한 짧은 선언들이다.
*/

var SANDBOX_MAX_BODY_CSS_CHARS = 400000;


/*
  navId — 부모가 발급한 정수. 프레임은 이 값만 돌려보낸다
  (skin/sandbox/skin-sandbox-nav.js).
*/

var SANDBOX_MAX_NAV_ID = 1000000;


/* =========================================================
   SANDBOX-5A — 저자 JS 문자열의 상한

   프레임에서 실제로 실행되는 코드다. 상한을 두는 이유는 두
   가지다: (1) postMessage 로 옮기는 값이고, (2) 상한이 없으면
   "얼마까지 되는가"가 브라우저 사정에 따라 달라진다.

   128 KiB 는 이 라운드가 여는 용도(탭 전환·창 열고 닫기·파티클·
   드래그)에 넉넉하고, 외부 라이브러리를 통째로 붙여 넣기에는
   모자란 크기다 — 그 방향은 이 라운드가 열지 않는다(요구사항 7).

   같은 값을 SkinPackage Import 도 쓴다(skin/skin-template.js 의
   SKIN_PACKAGE_MAX_JS_CHARS) — 두 곳이 어긋나면 "저장은 됐는데
   프레임에 안 간다"가 조용히 생긴다.
========================================================== */

var SANDBOX_MAX_AUTHOR_JS_CHARS = 131072;


/*
  프레임이 저자 JS 에 대해 부모에게 돌려줄 수 있는 코드.
  문장도 stack 도 없다(위 SCRIPT_ERROR 주석).

    "script-error"    실행 중 예외가 났다(문법 오류 포함 —
                      브라우저가 둘을 같은 error 이벤트로 준다)
    "script-blocked"  실행 자체가 막혔다(kill switch 가 꺼져 있거나
                      이 realm 에서 이미 한 번 실행했다)
*/

var SANDBOX_SCRIPT_ERROR_CODES = [
  "script-error",
  "script-blocked"
];


/* =========================================================
   SANDBOX-6A — Inspector 값 제한

   ★ editId — skin/skin-sanitize.js 의 SKIN_SANITIZE_EDIT_ID_PATTERN,
   studio/inspector/studio-inspector-model.js 의
   INSPECTOR_EDIT_ID_PATTERN 과 **같은 형태**여야 한다. 셋 중 하나가
   느슨해지면 그 틈으로만 값이 흐른다. 값을 바꿀 땐 세 파일을 함께
   고친다.

   ★ tagName — 소문자 알파벳/숫자만. 부모는 이 값을 화면 라벨에만
   쓰고 selector 로 쓰지 않지만, 그래도 여기서 모양을 못박는다.

   ★ rect — 부모가 overlay 좌표로 그대로 쓰는 숫자 넷이다. 유한하지
   않거나 범위를 벗어나면 **메시지 자체를 버린다**(NaN/Infinity 가
   style 에 들어가 팝오버가 화면 밖으로 날아가는 것을 프로토콜
   층에서 막는다).
========================================================== */

var SANDBOX_INSPECT_EDIT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

var SANDBOX_INSPECT_TAG_PATTERN = /^[a-z][a-z0-9]{0,19}$/;

var SANDBOX_INSPECT_MAX_COORD = 100000;


/*
  프레임이 Inspector 에 대해 부모에게 돌려줄 수 있는 코드.
  문장도 stack 도 없다.

    "no-root"        렌더 컨테이너가 없다(아직 안 그렸다)
    "stale-render"   지금 화면의 렌더가 아니다
    "not-inspectable" 고를 수 있는 요소가 없는 자리를 눌렀다
                      (부모는 이것으로 화면을 바꾸지 않는다 —
                       "빈 선택을 만들지 않는다"의 진단 신호다)
*/

var SANDBOX_INSPECT_ERROR_CODES = [
  "no-root",
  "stale-render",
  "not-inspectable"
];


function isSandboxInspectEditId(value) {

  return (
    typeof value === "string" &&
    SANDBOX_INSPECT_EDIT_ID_PATTERN.test(value)
  );

}


function isSandboxInspectCoord(value) {

  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -SANDBOX_INSPECT_MAX_COORD &&
    value <= SANDBOX_INSPECT_MAX_COORD
  );

}


/* rect = { left, top, width, height } — 알려진 네 키만, 전부 숫자.
   width/height 는 음수일 수 없다. */

function isSandboxInspectRect(value) {

  return (
    isPlainSandboxObject(value) &&
    hasOnlyKnownSandboxKeys(value, ["left", "top", "width", "height"]) &&
    isSandboxInspectCoord(value.left) &&
    isSandboxInspectCoord(value.top) &&
    isSandboxInspectCoord(value.width) &&
    isSandboxInspectCoord(value.height) &&
    value.width >= 0 &&
    value.height >= 0
  );

}


/* hover/selected 한 칸 — { editId, rect } 또는 { editId, rect, tagName } */

function isSandboxInspectTarget(value, allowTagName) {

  if (!isPlainSandboxObject(value)) {
    return false;
  }

  const keys =
    allowTagName
      ? ["editId", "tagName", "rect"]
      : ["editId", "rect"];

  if (!hasOnlyKnownSandboxKeys(value, keys)) {
    return false;
  }

  if (!isSandboxInspectEditId(value.editId)) {
    return false;
  }

  if (!isSandboxInspectRect(value.rect)) {
    return false;
  }

  if (value.tagName === undefined) {
    return true;
  }

  return (
    typeof value.tagName === "string" &&
    SANDBOX_INSPECT_TAG_PATTERN.test(value.tagName)
  );

}


var SANDBOX_ERROR_CODES = [
  "no-renderer",      /* frame이 renderSkin을 못 받았다 */
  "no-root",          /* 렌더 컨테이너가 없다 */
  "bad-payload",      /* data/template이 계약과 다르다 */
  "render-failed",    /* renderSkin()이 던졌다 */
  "no-body-region"    /* POST template 에 post-body 자리가 없다 */
];


function isSandboxHeight(value) {

  return (
    Number.isInteger(value) &&
    value >= SANDBOX_MIN_FRAME_HEIGHT &&
    value <= SANDBOX_MAX_FRAME_HEIGHT
  );

}


function isSandboxRenderSeq(value) {

  return Number.isInteger(value) && value >= 1;

}


/* =========================================================
   isSandboxTemplate(value)

   ★ SANDBOX-5A 에서 **선택 키 js 하나**가 늘었다.

   html/css 와 같은 봉투에 실어 보내는 이유는 순서다. 저자 JS 는
   "그 렌더의 DOM 이 선 뒤에" 돌아야 하는데, 별도 메시지로 보내면
   렌더와 JS 사이에 왕복이 하나 더 생기고 그 사이 상태를 따로
   관리해야 한다. 같은 메시지에 실으면 프레임이 한 핸들러 안에서
   **그리고 나서 실행**한다 — 순서가 코드 모양으로 보장된다.

   없으면 지금까지와 완전히 같다. 있으면 문자열이어야 하고
   상한(SANDBOX_MAX_AUTHOR_JS_CHARS)을 넘지 않아야 한다 — 넘으면
   메시지 자체가 거부된다(프레임은 잘린 코드를 실행하지 않는다).
========================================================== */

function isSandboxTemplate(value) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(value, ["html", "css", "js"]) ||
    typeof value.html !== "string" ||
    typeof value.css !== "string" ||
    value.html.length > SANDBOX_MAX_TEMPLATE_CHARS ||
    value.css.length > SANDBOX_MAX_TEMPLATE_CHARS
  ) {
    return false;
  }


  if (value.js === undefined) {
    return true;
  }


  return (
    typeof value.js === "string" &&
    value.js.length <= SANDBOX_MAX_AUTHOR_JS_CHARS
  );

}


/*
  type -> { direction, keys, check(payload) }

  direction 은 "이 메시지를 받을 자격이 있는 쪽"이다.
    "to-parent" : frame 이 보내고 parent 가 받는다
    "to-frame"  : parent 가 보내고 frame 이 받는다

  check 는 keys 검사(알려진 키만)를 통과한 payload의 **값**을 본다.
  없으면 contract 검사만 한다.
*/

var SANDBOX_MESSAGE_SPEC = {

  IMORY_FRAME_READY: {
    direction: "to-parent",
    keys: ["contract"]
  },

  IMORY_FRAME_ACK: {
    direction: "to-frame",
    keys: ["contract"]
  },

  /*
    부모 -> frame. 이번 라운드가 실제로 데이터를 옮기는 유일한
    메시지다. data 의 내부 shape은 여기서 "plain object"까지만
    보고, 알려진 키만 남기는 일은 skin/sandbox/skin-sandbox-context.js
    의 투영 함수가 **보내는 쪽과 받는 쪽 양쪽에서** 한 번씩 한다.
  */
  IMORY_RENDER_HOME: {
    direction: "to-frame",
    keys: ["contract", "pageType", "renderSeq", "template", "data"],
    check: function (payload) {
      return (
        payload.pageType === SANDBOX_HOME_PAGE_TYPE &&
        isSandboxRenderSeq(payload.renderSeq) &&
        isSandboxTemplate(payload.template) &&
        isPlainSandboxObject(payload.data)
      );
    }
  },


  /*
    SANDBOX-2 — 세 페이지 공용 렌더 메시지. RENDER_HOME 과 같은
    키 집합이고 pageType 만 넓다. data 안쪽(nav 표 포함)은 여기서
    "plain object"까지만 보고, 알려진 키만 남기는 일은 투영 함수가
    보내는 쪽과 받는 쪽에서 한 번씩 한다.
  */

  IMORY_RENDER_PAGE: {
    direction: "to-frame",
    keys: ["contract", "pageType", "renderSeq", "template", "data"],
    check: function (payload) {
      return (
        SANDBOX_PAGE_TYPES.indexOf(payload.pageType) !== -1 &&
        isSandboxRenderSeq(payload.renderSeq) &&
        isSandboxTemplate(payload.template) &&
        isPlainSandboxObject(payload.data)
      );
    }
  },


  /*
    SANDBOX-2 — 글 본문. 부모가 공개 뷰어와 **같은 파이프라인**으로
    이미 서식·sanitize를 끝낸 결과물이다(posts/view/posts-view-detail.js
    renderPostBodyInto). 프레임은 이것을 post-body region 에 넣기만
    한다 — Studio Preview 의 preview:post-body 와 같은 책임 분리.

    ★ SANDBOX-3.1 — 서식은 html 이 아니라 bodyCss 로 온다.
    inline style 은 프레임 CSP 에 막히므로, 부모가
    posts/style/posts-body-style-extract.js 로 검증·변환한
    stylesheet 텍스트를 따로 싣는다. html 안에는 style 속성이
    **하나도 없다**.
  */

  IMORY_POST_BODY: {
    direction: "to-frame",
    keys: ["contract", "renderSeq", "html", "bodyCss", "isHtmlContent"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        typeof payload.html === "string" &&
        payload.html.length <= SANDBOX_MAX_POST_BODY_CHARS &&
        typeof payload.bodyCss === "string" &&
        payload.bodyCss.length <= SANDBOX_MAX_BODY_CSS_CHARS &&
        typeof payload.isHtmlContent === "boolean"
      );
    }
  },


  /*
    SANDBOX-2 — 이동 요청.

    ★ 여기에 href 가 없다는 것이 이 계약의 핵심이다. 프레임은
    부모가 발급한 정수 하나만 돌려보내고, 그 정수를 route 로 바꾸는
    표는 부모 realm 에만 있다(skin/sandbox/skin-sandbox-nav.js).
    renderSeq 는 "어느 화면에서 누른 것인가"다 — 부모는 최신 렌더의
    것이 아니면 버린다.
  */

  IMORY_NAVIGATE: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "navId"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        Number.isInteger(payload.navId) &&
        payload.navId >= 1 &&
        payload.navId <= SANDBOX_MAX_NAV_ID
      );
    }
  },

  IMORY_RENDERED: {
    direction: "to-parent",
    keys: ["contract", "pageType", "renderSeq", "height"],
    check: function (payload) {
      return (
        SANDBOX_PAGE_TYPES.indexOf(payload.pageType) !== -1 &&
        isSandboxRenderSeq(payload.renderSeq) &&
        isSandboxHeight(payload.height)
      );
    }
  },

  IMORY_HEIGHT: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "height"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        isSandboxHeight(payload.height)
      );
    }
  },

  IMORY_FRAME_ERROR: {
    direction: "to-parent",
    keys: ["contract", "code"],
    check: function (payload) {
      return SANDBOX_ERROR_CODES.indexOf(payload.code) !== -1;
    }
  },


  /*
    SANDBOX-5A — 저자 JS 의 오류. renderSeq 가 붙어 있어서 옛
    화면에서 늦게 도착한 것을 부모가 버릴 수 있다.
  */

  IMORY_SCRIPT_ERROR: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "code"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        SANDBOX_SCRIPT_ERROR_CODES.indexOf(payload.code) !== -1
      );
    }
  },


  /* =======================================================
     SANDBOX-6A — Element Inspector

     다섯 메시지 전부 renderSeq 를 갖는다. "어느 화면에서 고른
     것인가"를 양쪽이 대조할 수 있어야 하기 때문이다 — 페이지를
     옮긴 뒤 늦게 도착한 선택은 버려진다.
  ======================================================= */

  IMORY_INSPECT_MODE: {
    direction: "to-frame",
    keys: ["contract", "renderSeq", "enabled"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        typeof payload.enabled === "boolean"
      );
    }
  },


  /* editId 가 없으면 "해제하라"는 뜻이다(지시문의 INSPECT_CLEAR). */

  IMORY_INSPECT_PICK: {
    direction: "to-frame",
    keys: ["contract", "renderSeq", "editId"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        (
          payload.editId === undefined ||
          isSandboxInspectEditId(payload.editId)
        )
      );
    }
  },


  /* editId/rect 가 함께 없으면 "hover 가 없어졌다"는 뜻이다. */

  IMORY_INSPECT_HOVER: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "editId", "rect"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (payload.editId === undefined && payload.rect === undefined) {
        return true;
      }

      return (
        isSandboxInspectEditId(payload.editId) &&
        isSandboxInspectRect(payload.rect)
      );

    }
  },


  /* editId 가 없으면 "아무것도 고르지 않았다"(Escape · 빈 자리). */

  IMORY_INSPECT_SELECT: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "editId", "tagName", "rect"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (
        payload.editId === undefined &&
        payload.tagName === undefined &&
        payload.rect === undefined
      ) {
        return true;
      }

      return isSandboxInspectTarget(
        {
          editId: payload.editId,
          tagName: payload.tagName,
          rect: payload.rect
        },
        true
      );

    }
  },


  /*
    좌표만 다시 보낸다. 둘 다 없을 수 있다(hover 도 선택도 없는
    상태에서 화면이 움직인 경우) — 그때는 부모가 테두리를 지운다.
  */

  IMORY_INSPECT_RECTS: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "hover", "selected"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (
        payload.hover !== undefined &&
        !isSandboxInspectTarget(payload.hover, false)
      ) {
        return false;
      }

      if (
        payload.selected !== undefined &&
        !isSandboxInspectTarget(payload.selected, true)
      ) {
        return false;
      }

      return true;

    }
  },


  IMORY_INSPECT_ERROR: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "code"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        SANDBOX_INSPECT_ERROR_CODES.indexOf(payload.code) !== -1
      );
    }
  }

};


/* =========================================================
   isPlainSandboxObject(value)

   배열·null·Date·window 프록시 따위를 걸러 낸다. cross-origin
   메시지는 structured clone을 거쳐 오므로 프로토타입이 이쪽
   realm의 Object.prototype이다 — 그 점을 이용해 판정한다.
========================================================== */

function isPlainSandboxObject(value) {

  if (!value || typeof value !== "object") {
    return false;
  }


  if (Array.isArray(value)) {
    return false;
  }


  const proto =
    Object.getPrototypeOf(value);


  return proto === Object.prototype || proto === null;

}


/* =========================================================
   hasOnlyKnownSandboxKeys(payload, keys)
========================================================== */

function hasOnlyKnownSandboxKeys(payload, keys) {

  const own =
    Object.keys(payload);


  for (let i = 0; i < own.length; i += 1) {

    if (keys.indexOf(own[i]) === -1) {
      return false;
    }

  }


  return true;

}


/* =========================================================
   buildSandboxMessage(type, payload, seq)

   봉투를 만든다. 모르는 type이면 null(보내지 않는다).
   payload도 **알려진 키만** 새 리터럴에 담는다 — 보내는 쪽에서도
   실수로 무엇을 흘리지 않기 위해서다.
========================================================== */

function buildSandboxMessage(type, payload, seq) {

  const spec =
    SANDBOX_MESSAGE_SPEC[type];

  if (!spec) {
    return null;
  }


  const source =
    isPlainSandboxObject(payload) ? payload : {};

  const clean =
    {};


  for (let i = 0; i < spec.keys.length; i += 1) {

    const key =
      spec.keys[i];

    if (Object.prototype.hasOwnProperty.call(source, key)) {
      clean[key] = source[key];
    }

  }


  if (clean.contract === undefined) {
    clean.contract = SANDBOX_MESSAGE_CONTRACT;
  }


  return {
    imory: SANDBOX_MESSAGE_ENVELOPE,
    type: type,
    seq: Number.isInteger(seq) && seq >= 1 ? seq : 1,
    payload: clean
  };

}


/* =========================================================
   validateSandboxMessage(event, expect) -> result

   expect = {
     originAllowList : string[]   // 허용 origin (정확 일치)
     source          : Window     // 기대한 window (있으면 대조)
     direction       : "to-parent" | "to-frame"
     isOriginAllowed : (origin, allowList) => boolean   // 선택
   }

   result = { ok: true,  type, seq, payload }
          | { ok: false, reason }

   reason 값(진단용, 상대에게 돌려주지 않는다):
     "no-event" "bad-origin" "bad-source" "bad-envelope"
     "unknown-type" "wrong-direction" "bad-seq"
     "bad-payload" "unknown-payload-key" "bad-contract"
     "bad-payload-value"   (SANDBOX-1: 타입별 값 검사 실패 —
       pageType이 home이 아님 / height가 정수가 아니거나 범위 밖 /
       template이 {html,css} 문자열 쌍이 아님 / data가 plain object가
       아님 / 모르는 오류 코드)
========================================================== */

function validateSandboxMessage(event, expect) {

  if (!event || typeof event !== "object") {
    return { ok: false, reason: "no-event" };
  }


  const rules =
    expect || {};


  /* --- 1. origin --------------------------------------- */

  const allowList =
    Array.isArray(rules.originAllowList) ? rules.originAllowList : [];

  const originOk =
    typeof rules.isOriginAllowed === "function"
      ? rules.isOriginAllowed(event.origin, allowList) === true
      : (
        typeof event.origin === "string" &&
        event.origin !== "" &&
        event.origin !== "null" &&
        allowList.indexOf(event.origin) !== -1
      );

  if (!originOk) {
    return { ok: false, reason: "bad-origin" };
  }


  /* --- 2. source ---------------------------------------- */

  /*
    같은 origin에서 온 **다른 window**(예: 공격자가 연 팝업, 또는
    같은 부모가 띄운 두 번째 iframe)를 걸러 낸다. origin만 보면
    이것을 못 잡는다.
  */

  if (rules.source && event.source !== rules.source) {
    return { ok: false, reason: "bad-source" };
  }


  /* --- 3. 봉투 ------------------------------------------ */

  const data =
    event.data;

  if (!isPlainSandboxObject(data)) {
    return { ok: false, reason: "bad-envelope" };
  }

  if (data.imory !== SANDBOX_MESSAGE_ENVELOPE) {
    return { ok: false, reason: "bad-envelope" };
  }

  if (typeof data.type !== "string") {
    return { ok: false, reason: "bad-envelope" };
  }


  /* --- 4. type ------------------------------------------ */

  const spec =
    SANDBOX_MESSAGE_SPEC[data.type];

  if (!spec) {
    return { ok: false, reason: "unknown-type" };
  }


  /* --- 5. 방향 ------------------------------------------ */

  if (rules.direction && spec.direction !== rules.direction) {
    return { ok: false, reason: "wrong-direction" };
  }


  /* --- 6. seq ------------------------------------------- */

  if (!Number.isInteger(data.seq) || data.seq < 1) {
    return { ok: false, reason: "bad-seq" };
  }


  /* --- 7. payload --------------------------------------- */

  if (!isPlainSandboxObject(data.payload)) {
    return { ok: false, reason: "bad-payload" };
  }

  if (!hasOnlyKnownSandboxKeys(data.payload, spec.keys)) {
    return { ok: false, reason: "unknown-payload-key" };
  }

  if (data.payload.contract !== SANDBOX_MESSAGE_CONTRACT) {
    return { ok: false, reason: "bad-contract" };
  }


  /* --- 8. 타입별 값 검사 ------------------------------- */

  if (
    typeof spec.check === "function" &&
    spec.check(data.payload) !== true
  ) {
    return { ok: false, reason: "bad-payload-value" };
  }


  /* 알려진 키만 새 리터럴로 옮겨 돌려준다 */

  const clean =
    {};

  for (let i = 0; i < spec.keys.length; i += 1) {

    const key =
      spec.keys[i];

    if (Object.prototype.hasOwnProperty.call(data.payload, key)) {
      clean[key] = data.payload[key];
    }

  }


  return {
    ok: true,
    type: data.type,
    seq: data.seq,
    payload: clean
  };

}


/* =========================================================
   node(단위 테스트)에서도 같은 파일을 읽을 수 있게
========================================================== */

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SANDBOX_MESSAGE_ENVELOPE,
    SANDBOX_MESSAGE_CONTRACT,
    SANDBOX_MESSAGE_TYPES,
    SANDBOX_MESSAGE_SPEC,
    SANDBOX_MIN_FRAME_HEIGHT,
    SANDBOX_MAX_FRAME_HEIGHT,
    SANDBOX_MAX_TEMPLATE_CHARS,
    SANDBOX_PAGE_TYPES,
    SANDBOX_HOME_PAGE_TYPE,
    SANDBOX_MAX_POST_BODY_CHARS,
    SANDBOX_MAX_BODY_CSS_CHARS,
    SANDBOX_MAX_NAV_ID,
    SANDBOX_MAX_AUTHOR_JS_CHARS,
    SANDBOX_ERROR_CODES,
    SANDBOX_SCRIPT_ERROR_CODES,
    SANDBOX_INSPECT_ERROR_CODES,
    SANDBOX_INSPECT_MAX_COORD,
    isSandboxInspectEditId,
    isSandboxInspectRect,
    isSandboxInspectTarget,
    isSandboxHeight,
    isSandboxRenderSeq,
    isSandboxTemplate,
    isPlainSandboxObject,
    hasOnlyKnownSandboxKeys,
    buildSandboxMessage,
    validateSandboxMessage
  };

}
