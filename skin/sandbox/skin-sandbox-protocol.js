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
  INSPECT_ERROR: "IMORY_INSPECT_ERROR",


  /* =======================================================
     SANDBOX-SELECT-PARITY-1 — 일반 Preview 의 "클릭하고 바로
     고치는 Select"(DIRECT-UX-1)를 프레임에서도

     native Preview 문서가 Studio 와 주고받는 preview:inspect-pick /
     -text / -drag / inspector-caps / -choose / -parent /
     inspect-preview 를 **같은 뜻 그대로** 한 번 더 옮긴 것이다.
     새 판단은 없다 — 무엇을 고칠 수 있는가는 여전히 Studio 가
     자기 draft 에서 정한다(INSPECT_CAPS 로 내려보낸다).

       INSPECT_CANDIDATES frame -> parent { point, candidates[] }
                      한 자리에 **서로를 담지 않는** 후보가 둘
                      이상일 때만. 칸 하나 = { editId, tagName,
                      rect, outer?, current? }. Studio 가 "무엇을
                      선택할까요?" 메뉴를 띄우고 고른 칸의 **순번**
                      만 돌려준다(INSPECT_CHOOSE) — 반복 항목은
                      식별자가 같아서 식별자로는 칸을 가를 수 없다.
       INSPECT_CHOOSE parent -> frame  { index }
       INSPECT_PARENT parent -> frame  {}  바깥 영역 선택
       INSPECT_CAPS   parent -> frame  { editId?, movable, textEditable }
       INSPECT_TEXT   frame -> parent  { phase, editId, text }
                      더블클릭 글자 편집. 올라가는 것은 **문구**
                      하나다 — 확정은 Studio 가 기존 patch 경로로
                      한다(그 DOM 을 저장하지 않는다).
       INSPECT_DRAG   frame -> parent  { phase, x, y }  자유 배치 본체 끌기
       INSPECT_PREVIEW parent -> frame { editId?, text?, layoutX?, layoutY?, clear? }
                      확정 전 임시 미리보기. 글자(textContent) 와
                      자유 배치 좌표(0~1 비율 두 개) **뿐**이다 —
                      CSS 문자열도 선언 목록도 받지 않는다.

     ★ 이 채널로 selector 도, HTML 도, 스크립트도 오가지 않는다.
       프레임은 여전히 "식별자 · 태그 · 사각형 · 문구 · 좌표"만
       올리고, 부모는 "식별자 · 순번 · 참/거짓 · 문구 · 비율"만
       내린다.
  ======================================================= */

  INSPECT_CANDIDATES: "IMORY_INSPECT_CANDIDATES",
  INSPECT_CHOOSE: "IMORY_INSPECT_CHOOSE",
  INSPECT_PARENT: "IMORY_INSPECT_PARENT",
  INSPECT_CAPS: "IMORY_INSPECT_CAPS",
  INSPECT_TEXT: "IMORY_INSPECT_TEXT",
  INSPECT_DRAG: "IMORY_INSPECT_DRAG",
  INSPECT_PREVIEW: "IMORY_INSPECT_PREVIEW",


  /* =======================================================
     EDITORIAL-RESPONSIVE-HOME-1 — 좌우 영역의 모바일 패널
     (IMORY_SIDES_DESIGN.md §7)

     프레임은 콘텐츠 높이만큼 늘어나 있고 스크롤은 **부모**가 한다.
     그래서 프레임 안의 position:fixed 패널은 화면이 아니라 프레임
     전체에 붙는다 — 스크롤해 내려온 사람에게 패널의 위쪽이 화면
     밖에 있다. 부모만 아는 두 가지를 주고받는다.

       SIDES_STATE    frame -> parent { renderSeq, open }
                      패널이 열렸다/닫혔다. 부모는 열린 동안 **자기
                      스크롤**을 잠근다.
       SIDES_VIEWPORT parent -> frame { renderSeq, top, height }
                      프레임 좌표로 "지금 화면에 보이는 부분". 프레임은
                      패널과 덮개를 그 안에 놓는다.
       SIDES_CLOSE    parent -> frame { renderSeq }
                      부모 쪽(프레임 바깥)을 눌렀다.

     오가는 것은 참/거짓과 정수 둘뿐이다.
  ======================================================= */

  SIDES_STATE: "IMORY_SIDES_STATE",
  SIDES_VIEWPORT: "IMORY_SIDES_VIEWPORT",
  SIDES_CLOSE: "IMORY_SIDES_CLOSE",


  /* =======================================================
     HOME-CANVAS-SELECT-1B-1 — 캔버스 선택을 프레임에 알린다

       CANVAS_SELECT  parent -> frame
         { renderSeq, editing, active, ids[], primaryId?, generation }
       CANVAS_PROPOSE frame  -> parent
         { renderSeq, ids[], primaryId, mode, generation }

     ★ HOME-CANVAS-SELECT-1B-2 에서 두 칸이 늘었다.

     `editing` 은 "지금 이 프레임에서 캔버스 편집이 켜져 있는가"다.
     선택이 **없어도** 참일 수 있다 — lasso 는 아무것도 고르지 않은
     상태에서 시작되기 때문이다(1B-1 에서는 첫 선택이 관문이었다).
     부모가 HOME · 유효한 canvas · Select 모드를 전부 보고 정한다.

     `CANVAS_PROPOSE` 는 프레임의 **제안**이다. 확정이 아니다 —
     아래 규칙을 보라.

     ★ 새 소유자를 만드는 메시지가 아니다.

     선택의 주인은 여전히 부모(Studio)다. 부모는 자기 draft 에서
     "그 id 가 지금 캔버스에 있고 hidden 도 locked 도 아니다"를
     이미 확인했고, 이 메시지는 그 **확정된 결과**만 내려보낸다.
     프레임은 받은 id 를 자기 DOM 의 [data-imory-canvas-element]
     에서 다시 확인하고, 없으면 **아무 것도 그리지 않는다**(다른
     요소로 대체하지 않는다).

     ★ 실리지 않는 것: nonce · draft · SkinPackage · CSS · 좌표.

     프레임이 아는 것은 "이 id 를 골랐다"뿐이고, 그 좌표는 자기
     DOM 에서 스스로 잰다. nonce 가 프레임 밖으로 나가지 않는다는
     계약은 그대로다(skin/sandbox/frame.html 머리말).

     ★ generation 은 부모가 매긴 선택 순번이다. 프레임은 자기가
       본 것보다 낮은 번호를 버린다 — 늦게 도착한 옛 선택이 새
       선택을 덮지 않는다. renderSeq 가 "어느 화면인가"를 가르는
       것과 같은 결의 장치이고, 둘 다 있어야 한다(같은 화면 안에서
       선택만 여러 번 바뀔 수 있다).

     ★ 프레임은 **최종 선택을 확정하지 않는다**(1B-2).

     lasso · Shift 클릭의 결과는 `CANVAS_PROPOSE` 로 올라가고, 부모가
     자기 draft 로 전부 다시 검증한 뒤 `CANVAS_SELECT` 로 **승인한
     상태**를 내려보낸다. 한 id 라도 지금 draft 에 없거나 hidden ·
     locked 면 **메시지 전체를 거부**하고 기존 선택을 유지한다 —
     "절반만 반영"이 없다.

     `mode` 는 둘뿐이다.

       replace  이 결과로 **갈아 끼운다**(일반 lasso)
       toggle   기존 선택과 **XOR** 한다(Shift + lasso · Shift + 클릭)

     정렬도 부모가 한다 — 프레임이 보낸 순서를 그대로 믿지 않고
     지금 draft 의 `canvas.elements[]` 배열 순서로 정규화한다.
  ======================================================= */

  CANVAS_SELECT: "IMORY_CANVAS_SELECT",
  CANVAS_PROPOSE: "IMORY_CANVAS_PROPOSE",


  /* =======================================================
     HOME-CANVAS-TRANSFORM-1A — 단일 요소 이동

       CANVAS_GEOMETRY  parent -> frame
         { renderSeq, active, id?, x?, y?, width?, height?, rotation?,
           baseWidth?, baseHeight?, generation, answering? }
       CANVAS_TRANSFORM frame  -> parent
         { renderSeq, kind, id, expected, next, generation, requestId }

     ★ 왜 좌표가 **내려가야** 하는가

     CANVAS_SELECT 는 일부러 id 와 순번만 싣는다 — 프레임은 자기
     DOM 에서 자리를 스스로 잰다. 그런데 **Canvas 좌표**는 DOM 에서
     잴 수 없다. 렌더러가 써 넣은 것은 여섯 자리에서 자른 백분율
     이고, 그것을 거꾸로 풀면 원본과 미세하게 다른 숫자가 나온다.
     끌지도 않은 요소가 저장될 때마다 조금씩 움직이는 일을 만들지
     않으려면, 시작 좌표는 **부모가 말해 주어야** 한다.

     그래서 이 메시지가 두 가지 일을 한다.

       1) 다음 이동의 시작 좌표(= `expected` 의 근거)
       2) 확정 요청의 **답**. 승인이면 방금 놓은 자리가, 거부면
          예전 자리가 내려온다. 프레임은 둘을 구분하지 않고 언제나
          "부모가 말한 값"으로 맞춘다(원상 복원이 곧 거부의 표현).

     단일 선택이 아닐 때(0개 · 2개 이상 · 잠김 · 숨김)는
     `active:false` 로 내려가고 그 밖의 칸은 아예 없다 —
     CANVAS_SELECT 의 해제와 같은 모양이다.

     ★ 답에는 **번호가 붙는다**(`answering` = 그 요청의 `requestId`).

     좌표 메시지는 이 답 말고도 나간다 — 선택이 바뀔 때, 화면을
     다시 그린 뒤, draft 가 바뀔 때마다. 그래서 "확정을 보낸 뒤
     처음 도착한 좌표"를 답으로 읽으면 **틀린 것을 답으로 읽는
     날**이 온다: 2026-09-21 실측에서, 확정이 부모에 닿기 전에
     확정 전 값을 그대로 담은 좌표 메시지가 한 번 더 내려왔고,
     프레임은 승인된 이동을 "거부됐다"로 읽어 제자리로 돌렸다.

     그래서 답에만 번호를 달고, 프레임은 **자기 요청 번호와 같은
     답**에만 반응한다. 번호가 없는 좌표 메시지는 다음 이동의
     시작점을 갱신할 뿐이다.

     ★ CANVAS_TRANSFORM 은 **요청**이지 확정이 아니다.

     부모는 받은 값을 그대로 쓰지 않는다. 지금 그 요소가 단독으로
     골라져 있는가 · 순번이 최신인가 · 지금 x · y 가 `expected` 와
     같은가 · `next` 가 계약 범위 안인가를 전부 다시 보고, 하나라도
     어긋나면 **쓰지 않는다**(studio/inspector/studio-canvas-selection.js
     commitStudioCanvasElementTransform).

     ★ `kind` 는 `"move"`(1A) · `"resize"`(1B) · `"rotate"`(1C)
       셋이다. 그 이름마다 `expected` · `next` 의 모양이 **하나로**
       정해져 있고(아래 IMORY_CANVAS_TRANSFORM), 서로의 자리에
       들어갈 수 없다 — 이동 메시지에 width 가, 회전 메시지에
       좌표가 섞이면 메시지 전체를 버린다. 그룹 조작은 아직 이
       목록에 없다.
  ======================================================= */

  CANVAS_GEOMETRY: "IMORY_CANVAS_GEOMETRY",
  CANVAS_TRANSFORM: "IMORY_CANVAS_TRANSFORM",


  /* =======================================================
     HOME-CANVAS-V2-ELEMENTS-1 — v2 프레임의 **페이지 자리**

       CANVAS_LAYOUT  frame -> parent
         { renderSeq, frames: [{ id, x, y }] }

     ★ 왜 이 값만 올라오는가

     프레임의 폭 · 높이 · 배율은 부모가 저장값에서 계산한다(계약
     §24-3). 그런데 `main_visual` 이 흐름 안에서 **어디에 놓였는가**
     는 앞 블록들의 실제 높이가 정하고, 글자 블록의 `height:"auto"`
     는 스킨 조판이 정하므로 저장값만으로는 알 수 없다. 묶기 · 빼기
     (계약 §28)가 "화면의 그 자리"를 지키려면 그 한 값이 필요하다.

     그래서 이 메시지는 **자리 하나**만 나른다. 크기도 배율도 싣지
     않는다 — 데이터가 주는 값을 프레임에서 한 번 더 받으면 어느
     쪽이 맞는지 가르는 규칙이 새로 생긴다.

     ★ 단위는 **도화지 폭의 분수**다. 픽셀이 올라오면 부모가 지금
       Preview 의 배율을 알아야 하고(그 값은 부모 문서의 CSS 다),
       분수면 `canvas.baseWidth` 한 번 곱해서 끝난다.

     ★ 이것은 **보고**이지 요청이 아니다. 부모는 이 값을 그대로
       저장하지 않는다 — 묶기 · 빼기를 누른 그 순간에만 자로 쓰고,
       저장되는 숫자는 부모가 자기 draft 로 계산한다.
  ======================================================= */

  CANVAS_LAYOUT: "IMORY_CANVAS_LAYOUT",


  /* =======================================================
     STUDIO-LAYERS-MATERIALS-1B — 재료를 **끌어다 놓을 자리**
     (계약 §36-5)

       CANVAS_PROBE  parent -> frame   { renderSeq }
       CANVAS_BOX    frame -> parent   { renderSeq, root, blocks, frames }

     ★ 왜 CANVAS_LAYOUT 으로는 안 되는가

     그 메시지는 **분수**를 나른다(도화지 폭으로 나눈 값). 분수는
     "저장값의 어느 자리인가"에는 맞지만, "지금 손가락이 도화지의
     어디를 가리키는가"에는 쓸 수 없다 — 그 계산에는 도화지가
     **화면에서 차지한 상자**가 있어야 하고 그것은 픽셀이다.

     ★ 왜 물어봐야 하는가

     픽셀 상자는 스크롤 · 배율마다 달라진다. CANVAS_LAYOUT 에 실어
     주기적으로 올리면 값이 늘 바뀌어 보고가 끊이지 않는다(그
     메시지는 모양이 같으면 보내지 않는 것으로 값싸게 지낸다).
     그래서 **끌기를 시작할 때 한 번** 묻는다. 끌고 있는 동안에는
     포인터가 부모에 붙들려 있어(pointer capture) 프레임이 스크롤
     되지도, 다시 그려지지도 않는다.

     ★ 좌표계

     프레임이 재는 것은 **자기 뷰포트** 기준이다. sandbox 에서는
     preview 문서가 안쪽 iframe 의 자리를 더해 올린다
     (studio/preview/preview-sandbox.js — inspect rects 와 같은 그
     한 줄). 거기서 Studio 화면 좌표로 옮기는 것은 부모의 기존
     변환 하나다(studio/inspector/studio-inspector-overlay.js).

     ★ 이것도 **보고**다. 저장되는 숫자는 하나도 없다 — 놓은 자리를
       Canvas 좌표로 바꾸는 데만 쓰이고, 실제로 쓸 값은 부모가 자기
       draft 와 순수 함수로 정한다.
  ======================================================= */

  CANVAS_PROBE: "IMORY_CANVAS_PROBE",
  CANVAS_BOX: "IMORY_CANVAS_BOX"
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


/* =========================================================
   SANDBOX-SELECT-PARITY-1 — 값 제한

   metrics  자유 배치 끌기가 비율을 세우는 기준(부모 안쪽 폭·높이)
            과 그 요소의 크기. 숫자 넷뿐이다. 이미지 자연 크기는
            없다 — 크기 조절 · 자르기는 프레임에서 열지 않는다.
   text     더블클릭 편집의 문구. Studio 의 textarea 와 같은 성격
            이라 넉넉히 두되 상한은 못 박는다.
   candidates  한 자리의 후보는 native 와 같이 최대 여섯 + 바깥 한 칸.
========================================================== */

var SANDBOX_INSPECT_METRIC_KEYS = ["width", "height", "parentWidth", "parentHeight"];

var SANDBOX_INSPECT_MAX_TEXT_CHARS = 20000;

var SANDBOX_INSPECT_MAX_CANDIDATES = 7;

var SANDBOX_INSPECT_TEXT_PHASES = ["begin", "input", "commit", "cancel"];

var SANDBOX_INSPECT_DRAG_PHASES = ["start", "move", "end", "cancel"];


/*
  HOME-CANVAS-SELECT-1B-1 — 한 번에 내려보낼 수 있는 캔버스 선택의
  상한. 지금 UI 는 단일 선택이라 실제로는 0 또는 1 이지만, 모양이
  배열이므로 상한을 못박아 둔다(뒤 단계의 다중 선택도 이 숫자를
  넘지 않는다 — 넘어야 한다면 그때 이 줄을 고친다).
*/

var SANDBOX_CANVAS_MAX_SELECTED = 64;


/* HOME-CANVAS-SELECT-1B-2 — 프레임이 올릴 수 있는 제안의 뜻은 둘뿐이다 */

var SANDBOX_CANVAS_SELECT_MODES = ["replace", "toggle"];


/*
  HOME-CANVAS-TRANSFORM-1A · 1B · 1C — 프레임이 올릴 수 있는 조작의 뜻.

  그룹 조작이 들어오면 그때 이 배열에 이름을 더한다(더하지 않은
  값은 메시지 층에서 거부된다).

  ★ kind 마다 `expected` · `next` 의 허용 키가 다르다. 아래
    CANVAS_TRANSFORM 의 check 가 그 표를 본다 — "좌표 둘" ·
    "좌표 둘 + 크기 둘" · "각도 하나"가 서로의 자리에 들어갈 수
    없다.
*/

/* HOME-CANVAS-V2-MANUAL-FIX-1 — `"width"` 는 흐름 블록의 폭 한 칸이다
   (계약 §29-4). 프레임이 보낼 수 있는 확정 요청의 이름은 이 넷뿐이고,
   그 이름이 어느 writer 를 고르는가는 언제나 부모가 정한다. */
var SANDBOX_CANVAS_TRANSFORM_KINDS = ["move", "resize", "rotate", "width"];


/*
  좌표 한 쌍 — x · y 둘뿐이고, 둘 다 계약의 좌표 범위 안이어야
  한다. **모르는 키가 하나라도 있으면 거짓**이다: width · height ·
  rotation 이 이동 메시지로 새어 들어갈 길을 여기서 막는다.
*/

function isSandboxCanvasPoint(value) {

  return (
    isPlainSandboxObject(value) &&
    hasOnlyKnownSandboxKeys(value, ["x", "y"]) &&
    isSandboxCanvasCoord(value.x) &&
    isSandboxCanvasCoord(value.y)
  );

}


/*
  HOME-CANVAS-TRANSFORM-1B — 요소 하나의 상자.

  x · y · width · height 넷뿐이고, 여기서도 **모르는 키가 하나라도
  있으면 거짓**이다 — rotation 이 리사이즈 메시지로 새어 들어갈 길을
  막는다(이번 단계는 회전을 바꾸지 않는다).

  ★ `height` 는 숫자이거나 `"auto"` 다. 어느 type 이 `"auto"` 를 쓸
    수 있는지는 부모가 자기 draft 로 본다(§6) — 메시지 층은 "그
    모양이 올 수 있다"까지만 안다.
*/

function isSandboxCanvasHeight(value) {

  return value === "auto" || isSandboxCanvasSize(value);

}


function isSandboxCanvasBox(value) {

  return (
    isPlainSandboxObject(value) &&
    hasOnlyKnownSandboxKeys(value, ["x", "y", "width", "height"]) &&
    isSandboxCanvasCoord(value.x) &&
    isSandboxCanvasCoord(value.y) &&
    isSandboxCanvasSize(value.width) &&
    isSandboxCanvasHeight(value.height)
  );

}


/*
  HOME-CANVAS-TRANSFORM-1C — 요소 하나의 각도.

  `rotation` 한 칸뿐이고, 여기서도 **모르는 키가 하나라도 있으면
  거짓**이다 — 좌표나 크기가 회전 메시지로 새어 들어갈 길을 막는다
  (회전은 상자를 바꾸지 않는다).

  ★ 범위는 계약이 이미 가진 그것 하나다 — **유한한 숫자**(§5).
    좌표의 ±100000 을 각도에 빌려 오지 않는다. 그렇게 하면 이미
    저장된 큰 각도를 가진 요소를 영영 돌릴 수 없게 된다 —
    `expected` 는 **저장된 그 값 그대로** 올라오기 때문이다.
*/

function isSandboxCanvasAngle(value) {

  return typeof value === "number" && Number.isFinite(value);

}


function isSandboxCanvasRotation(value) {

  return (
    isPlainSandboxObject(value) &&
    hasOnlyKnownSandboxKeys(value, ["rotation"]) &&
    isSandboxCanvasAngle(value.rotation)
  );

}


/* kind 가 소유하는 모양은 하나다 — 이동은 점, 리사이즈는 상자,
   회전은 각도 */

function sandboxCanvasTransformShapeCheck(kind) {

  if (kind === "resize") {
    return isSandboxCanvasBox;
  }

  /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록의 폭은 **한 칸**이다
     (계약 §29-4). 좌표가 섞이면 메시지 전체가 버려진다. */
  if (kind === "width") {
    return isSandboxCanvasWidth;
  }

  return kind === "rotate" ? isSandboxCanvasRotation : isSandboxCanvasPoint;

}


/* =======================================================
   HOME-CANVAS-V2-MANUAL-FIX-1 — 물려받은 모양(계약 §29-6)

   값이 스킨 CSS 의 선언이 되므로 **가장 좁은 자**를 쓴다.
======================================================= */

var SANDBOX_CANVAS_LOOK_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-transform", "text-align",
  "color", "white-space"
];

/* CSS 값에 쓸 수 있는 글자만 — 규칙을 탈출할 수 있는 글자는 없다 */
var SANDBOX_CANVAS_LOOK_VALUE = /^[-A-Za-z0-9 ,.%#()'"\/]{1,120}$/;


function isSandboxCanvasLook(value) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(value, ["id", "props"]) ||
    !isSandboxInspectEditId(value.id) ||
    !isPlainSandboxObject(value.props)
  ) {
    return false;
  }

  var keys =
    Object.keys(value.props);

  if (!keys.length || keys.length > SANDBOX_CANVAS_LOOK_PROPERTIES.length) {
    return false;
  }

  for (var i = 0; i < keys.length; i += 1) {

    if (SANDBOX_CANVAS_LOOK_PROPERTIES.indexOf(keys[i]) === -1) {
      return false;
    }

    var entry =
      value.props[keys[i]];

    if (typeof entry !== "string" || !SANDBOX_CANVAS_LOOK_VALUE.test(entry)) {
      return false;
    }

  }

  return true;

}


/* 폭 한 칸 — 크기의 자(0 초과 · 유한 · 상한)를 그대로 쓴다 */
function isSandboxCanvasWidth(value) {

  return (
    isPlainSandboxObject(value) &&
    hasOnlyKnownSandboxKeys(value, ["width"]) &&
    isSandboxCanvasSize(value.width)
  );

}


/*
  캔버스 식별자 목록 — 상한을 넘지 않고, 전부 형태가 맞고, **같은
  것이 두 번 오지 않는다**.

  중복을 메시지 층에서 막는 이유: 중복은 위조의 흔한 모양이고
  (길이 상한을 우회해 부모에게 큰 배열을 만들게 한다), 정상 경로가
  그것을 만들 이유가 하나도 없다.
*/

function isSandboxCanvasIdList(value) {

  if (!Array.isArray(value) || value.length > SANDBOX_CANVAS_MAX_SELECTED) {
    return false;
  }

  for (var i = 0; i < value.length; i += 1) {

    if (!isSandboxInspectEditId(value[i])) {
      return false;
    }

    if (value.indexOf(value[i]) !== i) {
      return false;
    }

  }

  return true;

}


function isSandboxInspectMetrics(value) {

  if (!isPlainSandboxObject(value)) {
    return false;
  }

  if (!hasOnlyKnownSandboxKeys(value, SANDBOX_INSPECT_METRIC_KEYS)) {
    return false;
  }

  for (let i = 0; i < SANDBOX_INSPECT_METRIC_KEYS.length; i += 1) {

    const metric =
      value[SANDBOX_INSPECT_METRIC_KEYS[i]];

    if (!isSandboxInspectCoord(metric) || metric < 0) {
      return false;
    }

  }

  return true;

}


function isSandboxInspectText(value) {

  return (
    typeof value === "string" &&
    value.length <= SANDBOX_INSPECT_MAX_TEXT_CHARS
  );

}


/* 자유 배치 좌표 — 0~1 비율 */

function isSandboxInspectRatio(value) {

  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );

}


/* hover/selected 한 칸 — { editId, rect } 또는 { editId, rect, tagName[, metrics] } */

function isSandboxInspectTarget(value, allowTagName) {

  if (!isPlainSandboxObject(value)) {
    return false;
  }

  const keys =
    allowTagName
      ? ["editId", "tagName", "rect", "metrics"]
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

  if (value.metrics !== undefined && !isSandboxInspectMetrics(value.metrics)) {
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


/* 겹친 후보 한 칸 — { editId, tagName, rect, outer?, current? } */

function isSandboxInspectCandidate(value) {

  if (!isPlainSandboxObject(value)) {
    return false;
  }

  if (!hasOnlyKnownSandboxKeys(value, ["editId", "tagName", "rect", "outer", "current"])) {
    return false;
  }

  return (
    isSandboxInspectEditId(value.editId) &&
    typeof value.tagName === "string" &&
    SANDBOX_INSPECT_TAG_PATTERN.test(value.tagName) &&
    isSandboxInspectRect(value.rect) &&
    (value.outer === undefined || typeof value.outer === "boolean") &&
    (value.current === undefined || typeof value.current === "boolean")
  );

}


function isSandboxInspectPoint(value) {

  return (
    isPlainSandboxObject(value) &&
    hasOnlyKnownSandboxKeys(value, ["x", "y"]) &&
    isSandboxInspectCoord(value.x) &&
    isSandboxInspectCoord(value.y)
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

/* =========================================================
   EDITORIAL-DEFAULT-SKIN-2 — template.settings

   주인의 스킨 설정(skin/skin-settings.js buildSkinSettingsRenderSetting).
   설정이 없는 스킨은 키가 없다(봉투가 지금까지와 같다). 있으면 정확히
   이 모양만 통과한다 — 프레임이 받는 값은 색 · 낱말 · 날짜 · 짧은 글자
   뿐이고, 색은 #rrggbb 라 CSS 선언을 벗어날 글자가 없다.

     { colors?: { background?, text?, accent?, accent2? },
       photos?: "auto" | "empty" | "hero" | "pair" | "triptych",
       dday?:   { date: "YYYY-MM-DD", label?: string(≤40) } }
========================================================== */

const SANDBOX_SETTINGS_COLOR_ROLES = ["background", "text", "accent", "accent2"];

const SANDBOX_SETTINGS_PHOTO_LAYOUTS = ["auto", "empty", "hero", "pair", "triptych"];

function isSandboxSkinSettings(value) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(value, ["colors", "photos", "dday"]) ||
    Object.keys(value).length === 0
  ) {
    return false;
  }

  if (value.colors !== undefined) {

    if (
      !isPlainSandboxObject(value.colors) ||
      !hasOnlyKnownSandboxKeys(value.colors, SANDBOX_SETTINGS_COLOR_ROLES) ||
      Object.keys(value.colors).length === 0 ||
      !Object.keys(value.colors).every((role) =>
        typeof value.colors[role] === "string" && /^#[0-9a-f]{6}$/.test(value.colors[role])
      )
    ) {
      return false;
    }

  }

  if (
    value.photos !== undefined &&
    SANDBOX_SETTINGS_PHOTO_LAYOUTS.indexOf(value.photos) === -1
  ) {
    return false;
  }

  if (value.dday !== undefined) {

    if (
      !isPlainSandboxObject(value.dday) ||
      !hasOnlyKnownSandboxKeys(value.dday, ["date", "label"]) ||
      typeof value.dday.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.dday.date) ||
      (
        value.dday.label !== undefined &&
        !(typeof value.dday.label === "string" && value.dday.label.length <= 40)
      )
    ) {
      return false;
    }

  }

  return true;

}


/* =========================================================
   HOME-CANVAS-CONTRACT-1B — template.canvas

   HOME 캔버스의 **실행용** 데이터(skin/skin-home-canvas.js
   buildSkinCanvasRenderPayload). 캔버스가 없는 스킨은 키가 없다
   (봉투가 지금까지와 같다).

   ★ 값 목록을 여기 한 번 더 적는다. 이 파일은 "의존 없음"이고
     (부모 realm 과 frame realm 이 같은 파일을 각각 로드한다),
     skin-home-canvas.js 를 부를 수 없는 문서에서도 메시지 검사는
     돌아야 한다 — SKIN_PACKAGE_EXPORT_RENDER_MODES 와 같은 판단이다.
     두 곳이 갈라지지 않게 단위 테스트가 양방향으로 대조한다
     (skin/skin-home-canvas-test.mjs [protocol] 절).

   ★ 여기가 **strict allowlist** 다. 계약에 없는 칸은 하나도 통과하지
     못한다 — 보존용 원본(regions 안의 그 객체)과 실행용 payload 를
     가르는 마지막 관문이다.
========================================================== */

var SANDBOX_CANVAS_VERSION = 1;

var SANDBOX_CANVAS_BASE_WIDTH = 390;

/* HOME-CANVAS-CONTRACT-1C — 도화지 전체의 세로 길이. baseWidth 와 달리
   고정값이 아니라 캔버스마다 다르다(0 초과 SANDBOX_CANVAS_MAX_COORD 이하).
   이 기본값은 "새 캔버스의 출발점"이고 봉투 검사에는 쓰이지 않는다 —
   계약 파일과 갈라지지 않게 값만 함께 적어 둔다. */
var SANDBOX_CANVAS_BASE_HEIGHT = 844;

var SANDBOX_CANVAS_MAX_ELEMENTS = 200;

var SANDBOX_CANVAS_MAX_TEXT_CHARS = 2000;

var SANDBOX_CANVAS_MAX_CATEGORY_IDS = 50;

var SANDBOX_CANVAS_MAX_CATEGORY_ID_CHARS = 64;

var SANDBOX_CANVAS_MAX_COORD = 100000;

var SANDBOX_CANVAS_ELEMENT_TYPES =
  ["photo", "text", "logo", "category_nav", "sticker", "shape"];

var SANDBOX_CANVAS_AUTO_HEIGHT_TYPES = ["text", "category_nav"];

var SANDBOX_CANVAS_TEXT_ROLES =
  ["title", "subtitle", "body", "caption", "label"];

var SANDBOX_CANVAS_NAV_MODES = ["all", "selected"];

var SANDBOX_CANVAS_SHAPE_KINDS = ["rect", "ellipse", "line"];

var SANDBOX_CANVAS_LOGO_FALLBACKS = ["site_title"];

/* skin/skin-sanitize.js SKIN_SANITIZE_EDIT_ID_PATTERN 과 같은 형태 */
var SANDBOX_CANVAS_ELEMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/* skin/skin-package-images.js SKIN_IMAGE_SLOT_NAME_PATTERN 과 같은 형태 */
var SANDBOX_CANVAS_SLOT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;


function isSandboxCanvasCoord(value) {

  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= SANDBOX_CANVAS_MAX_COORD
  );

}


/* =========================================================
   HOME-CANVAS-V2-EDITOR-1B — pin 의 `origin` 분수

   자기 상자 **안**의 한 점이므로 0~1 이다. 좌표의 ±100000 을 빌려
   오지 않는다 — 그 자를 쓰면 상자 밖의 값도 통과한다.

   ★ 없어도 된다(선택 칸). v1 요소와 v2 overlay 의 origin 은 0 이고,
     그때는 이 칸 자체를 만들지 않는다.
========================================================== */
function isSandboxCanvasOrigin(value) {

  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1)
  );

}


function isSandboxCanvasSize(value) {

  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= SANDBOX_CANVAS_MAX_COORD
  );

}


function isSandboxCanvasSlot(value) {

  return typeof value === "string" && SANDBOX_CANVAS_SLOT_NAME_PATTERN.test(value);

}


function isSandboxCanvasProps(type, props) {

  if (!isPlainSandboxObject(props)) {
    return false;
  }

  if (type === "photo" || type === "sticker") {
    return hasOnlyKnownSandboxKeys(props, ["slot"]) && isSandboxCanvasSlot(props.slot);
  }

  if (type === "logo") {
    return (
      hasOnlyKnownSandboxKeys(props, ["slot", "fallback"]) &&
      isSandboxCanvasSlot(props.slot) &&
      SANDBOX_CANVAS_LOGO_FALLBACKS.indexOf(props.fallback) !== -1
    );
  }

  if (type === "text") {
    return (
      hasOnlyKnownSandboxKeys(props, ["text", "role"]) &&
      typeof props.text === "string" &&
      props.text.length <= SANDBOX_CANVAS_MAX_TEXT_CHARS &&
      SANDBOX_CANVAS_TEXT_ROLES.indexOf(props.role) !== -1
    );
  }

  if (type === "category_nav") {
    return (
      hasOnlyKnownSandboxKeys(props, ["mode", "categoryIds"]) &&
      SANDBOX_CANVAS_NAV_MODES.indexOf(props.mode) !== -1 &&
      Array.isArray(props.categoryIds) &&
      props.categoryIds.length <= SANDBOX_CANVAS_MAX_CATEGORY_IDS &&
      props.categoryIds.every((id) =>
        typeof id === "string" && !!id && id.length <= SANDBOX_CANVAS_MAX_CATEGORY_ID_CHARS
      )
    );
  }

  /* shape */
  return (
    hasOnlyKnownSandboxKeys(props, ["kind"]) &&
    SANDBOX_CANVAS_SHAPE_KINDS.indexOf(props.kind) !== -1
  );

}


function isSandboxCanvasElement(value) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(
      value,
      ["id", "type", "x", "y", "width", "height", "rotation", "hidden", "locked", "props"]
    )
  ) {
    return false;
  }

  if (
    typeof value.id !== "string" ||
    !SANDBOX_CANVAS_ELEMENT_ID_PATTERN.test(value.id) ||
    SANDBOX_CANVAS_ELEMENT_TYPES.indexOf(value.type) === -1
  ) {
    return false;
  }

  if (
    !isSandboxCanvasCoord(value.x) ||
    !isSandboxCanvasCoord(value.y) ||
    !isSandboxCanvasSize(value.width)
  ) {
    return false;
  }

  const autoAllowed =
    SANDBOX_CANVAS_AUTO_HEIGHT_TYPES.indexOf(value.type) !== -1;

  if (value.height === "auto") {
    if (!autoAllowed) {
      return false;
    }
  } else if (!isSandboxCanvasSize(value.height)) {
    return false;
  }

  if (
    typeof value.rotation !== "number" ||
    !Number.isFinite(value.rotation) ||
    typeof value.hidden !== "boolean" ||
    typeof value.locked !== "boolean"
  ) {
    return false;
  }

  return isSandboxCanvasProps(value.type, value.props);

}


/* =========================================================
   HOME-CANVAS-V2-FLOW-RENDER-1 — template.canvas 의 v2 모양

   조합형 Canvas(로드맵 §14)의 **실행용** payload 다
   (skin/skin-home-canvas-v2.js buildSkinCanvasV2RenderPayload).

   ★ 위 v1 표와 같은 사정으로 값 목록을 여기 한 번 더 적는다 —
     이 파일은 의존이 없고, 단위 테스트가 계약 파일과 양방향으로
     대조한다(skin/skin-home-canvas-test.mjs [protocol] 절).

   ★ 여기도 strict allowlist 다. 다만 v1 과 달리 **빠져도 되는 칸이
     하나 있다**: `maxWidth`. 계약이 "상한 없음"을 숫자가 아니라
     부재로 적기 때문이고(§14-4), payload 빌더도 그때만 싣는다.
     블록 내부 요소의 `x` · `y` · `pin` 도 같은 뜻으로 `follow` 가
     정하는 칸이라 조건부다(§14-6).
========================================================== */

var SANDBOX_CANVAS_V2_VERSION = 2;

var SANDBOX_CANVAS_BLOCK_TYPES =
  ["logo", "category_nav", "text", "divider", "main_visual"];

var SANDBOX_CANVAS_BLOCK_AUTO_HEIGHT_TYPES =
  ["text", "category_nav", "divider", "main_visual"];

var SANDBOX_CANVAS_BLOCK_ALIGNS = ["left", "center", "right", "stretch"];

var SANDBOX_CANVAS_FLOW_DIRECTIONS = ["column"];

var SANDBOX_CANVAS_EDGES = ["top", "right", "bottom", "left"];

var SANDBOX_CANVAS_FOLLOW_MODES = ["transform", "pin"];

var SANDBOX_CANVAS_PIN_TARGETS = ["frame", "photo"];

var SANDBOX_CANVAS_PIN_POINTS = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right"
];


/* padding · margin — 네 칸이 **전부** 숫자로 들어 있다(payload 가 채운다) */
function isSandboxCanvasEdges(value) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(value, SANDBOX_CANVAS_EDGES)
  ) {
    return false;
  }

  for (let i = 0; i < SANDBOX_CANVAS_EDGES.length; i += 1) {
    if (!isSandboxCanvasCoord(value[SANDBOX_CANVAS_EDGES[i]])) {
      return false;
    }
  }

  return true;

}


function isSandboxCanvasPin(value) {

  return (
    isPlainSandboxObject(value) &&
    hasOnlyKnownSandboxKeys(value, ["target", "anchor", "origin", "offset"]) &&
    SANDBOX_CANVAS_PIN_TARGETS.indexOf(value.target) !== -1 &&
    SANDBOX_CANVAS_PIN_POINTS.indexOf(value.anchor) !== -1 &&
    SANDBOX_CANVAS_PIN_POINTS.indexOf(value.origin) !== -1 &&
    isSandboxCanvasPoint(value.offset) &&
    hasOnlyKnownSandboxKeys(value.offset, ["x", "y"])
  );

}


/*
  main_visual 내부의 자유 요소 하나.

  v1 요소와 같은 칸에 `follow` 와 `pin` 이 더 있고, `x` · `y` 는
  `follow:"transform"` 일 때만 실린다(§14-6). 종류는 v1 의 여섯이다 —
  `main_visual` 과 `container` 는 그 목록에 없으므로 중첩이 여기서도
  막힌다(§14-12).
*/
function isSandboxCanvasFrameElement(value) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(
      value,
      ["id", "type", "follow", "x", "y", "width", "height",
       "rotation", "hidden", "locked", "pin", "props"]
    )
  ) {
    return false;
  }

  if (
    typeof value.id !== "string" ||
    !SANDBOX_CANVAS_ELEMENT_ID_PATTERN.test(value.id) ||
    SANDBOX_CANVAS_ELEMENT_TYPES.indexOf(value.type) === -1 ||
    SANDBOX_CANVAS_FOLLOW_MODES.indexOf(value.follow) === -1
  ) {
    return false;
  }

  if (value.follow === "transform") {

    if (!isSandboxCanvasCoord(value.x) || !isSandboxCanvasCoord(value.y)) {
      return false;
    }

  } else if (value.x !== undefined || value.y !== undefined) {

    /* pin 요소의 자리는 anchor 가 정한다 — 좌표가 함께 오면 받는
       쪽이 둘 중 어느 것이 자리인지 고르게 된다 */
    return false;

  }

  if (value.pin !== undefined && !isSandboxCanvasPin(value.pin)) {
    return false;
  }

  if (value.follow === "pin" && value.pin === undefined) {
    return false;
  }

  if (!isSandboxCanvasSize(value.width)) {
    return false;
  }

  const autoAllowed =
    SANDBOX_CANVAS_AUTO_HEIGHT_TYPES.indexOf(value.type) !== -1;

  if (value.height === "auto") {
    if (!autoAllowed) {
      return false;
    }
  } else if (!isSandboxCanvasSize(value.height)) {
    return false;
  }

  if (
    typeof value.rotation !== "number" ||
    !Number.isFinite(value.rotation) ||
    typeof value.hidden !== "boolean" ||
    typeof value.locked !== "boolean"
  ) {
    return false;
  }

  return isSandboxCanvasProps(value.type, value.props);

}


function isSandboxCanvasMainVisualProps(value, seen) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(value, ["baseWidth", "baseHeight", "primaryId", "elements"]) ||
    !isSandboxCanvasSize(value.baseWidth) ||
    !isSandboxCanvasSize(value.baseHeight) ||
    typeof value.primaryId !== "string" ||
    !Array.isArray(value.elements) ||
    value.elements.length === 0 ||
    value.elements.length > SANDBOX_CANVAS_MAX_ELEMENTS
  ) {
    return false;
  }

  let primary = null;

  for (let i = 0; i < value.elements.length; i += 1) {

    const element = value.elements[i];

    if (!isSandboxCanvasFrameElement(element) || seen[element.id]) {
      return false;
    }

    seen[element.id] = true;

    if (element.id === value.primaryId) {
      primary = element;
    }

  }

  return !!primary && primary.type === "photo" && primary.hidden === false;

}


function isSandboxCanvasBlockProps(type, props, seen) {

  if (type === "divider") {
    return isPlainSandboxObject(props) && hasOnlyKnownSandboxKeys(props, []);
  }

  if (type === "main_visual") {
    return isSandboxCanvasMainVisualProps(props, seen);
  }

  return isSandboxCanvasProps(type, props);

}


function isSandboxCanvasBlock(value, seen) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(
      value,
      ["id", "type", "width", "height", "align", "margin",
       "maxWidth", "hidden", "locked", "props"]
    )
  ) {
    return false;
  }

  if (
    typeof value.id !== "string" ||
    !SANDBOX_CANVAS_ELEMENT_ID_PATTERN.test(value.id) ||
    seen[value.id] ||
    SANDBOX_CANVAS_BLOCK_TYPES.indexOf(value.type) === -1
  ) {
    return false;
  }

  seen[value.id] = true;

  /* width 에 "auto" 는 없다 — 가용 폭 전부는 align:"stretch" 다 */
  if (!isSandboxCanvasSize(value.width)) {
    return false;
  }

  const autoAllowed =
    SANDBOX_CANVAS_BLOCK_AUTO_HEIGHT_TYPES.indexOf(value.type) !== -1;

  if (value.height === "auto") {
    if (!autoAllowed) {
      return false;
    }
  } else if (!isSandboxCanvasSize(value.height)) {
    return false;
  }

  if (
    SANDBOX_CANVAS_BLOCK_ALIGNS.indexOf(value.align) === -1 ||
    !isSandboxCanvasEdges(value.margin) ||
    typeof value.hidden !== "boolean" ||
    typeof value.locked !== "boolean"
  ) {
    return false;
  }

  if (value.maxWidth !== undefined && !isSandboxCanvasSize(value.maxWidth)) {
    return false;
  }

  return isSandboxCanvasBlockProps(value.type, value.props, seen);

}


function isSandboxCanvasFlow(value, seen) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(value, ["direction", "padding", "gap", "blocks"]) ||
    SANDBOX_CANVAS_FLOW_DIRECTIONS.indexOf(value.direction) === -1 ||
    !isSandboxCanvasEdges(value.padding) ||
    !isSandboxCanvasCoord(value.gap) ||
    !Array.isArray(value.blocks) ||
    value.blocks.length > SANDBOX_CANVAS_MAX_ELEMENTS
  ) {
    return false;
  }

  for (let i = 0; i < value.blocks.length; i += 1) {
    if (!isSandboxCanvasBlock(value.blocks[i], seen)) {
      return false;
    }
  }

  return true;

}


/*
  ★ id 는 canvas 하나 안에서 **전부** 유일하다 — 블록 · 프레임 내부
    요소 · overlay 가 한 이름 공간이다(§14-5). 렌더러가 셋 다
    `data-imory-edit-id` 로 내보내기 때문이다.
*/
function isSandboxHomeCanvasV2(value) {

  if (
    !hasOnlyKnownSandboxKeys(value, ["version", "baseWidth", "baseHeight", "flow", "overlays"]) ||
    value.baseWidth !== SANDBOX_CANVAS_BASE_WIDTH ||
    !isSandboxCanvasSize(value.baseHeight) ||
    !Array.isArray(value.overlays) ||
    value.overlays.length > SANDBOX_CANVAS_MAX_ELEMENTS
  ) {
    return false;
  }

  const seen = Object.create(null);

  if (!isSandboxCanvasFlow(value.flow, seen)) {
    return false;
  }

  for (let i = 0; i < value.overlays.length; i += 1) {

    const overlay = value.overlays[i];

    if (!isSandboxCanvasElement(overlay) || seen[overlay.id]) {
      return false;
    }

    seen[overlay.id] = true;

  }

  return true;

}


function isSandboxHomeCanvas(value) {

  if (!isPlainSandboxObject(value)) {
    return false;
  }

  /* version 이 어느 표를 쓸지 고른다(HOME-CANVAS-V2-FLOW-RENDER-1) */
  if (value.version === SANDBOX_CANVAS_V2_VERSION) {
    return isSandboxHomeCanvasV2(value);
  }

  if (
    !hasOnlyKnownSandboxKeys(value, ["version", "baseWidth", "baseHeight", "elements"]) ||
    value.version !== SANDBOX_CANVAS_VERSION ||
    value.baseWidth !== SANDBOX_CANVAS_BASE_WIDTH ||
    /* baseHeight 는 고정값이 아니다 — 양수이기만 하면 된다(1C) */
    !isSandboxCanvasSize(value.baseHeight) ||
    !Array.isArray(value.elements) ||
    value.elements.length > SANDBOX_CANVAS_MAX_ELEMENTS
  ) {
    return false;
  }

  const seen = Object.create(null);

  for (let i = 0; i < value.elements.length; i++) {

    const element = value.elements[i];

    if (!isSandboxCanvasElement(element)) {
      return false;
    }

    if (seen[element.id]) {
      return false;
    }

    seen[element.id] = true;

  }

  return true;

}


function isSandboxTemplate(value) {

  if (
    !isPlainSandboxObject(value) ||
    !hasOnlyKnownSandboxKeys(value, ["html", "css", "js", "sides", "settings", "canvas"]) ||
    typeof value.html !== "string" ||
    typeof value.css !== "string" ||
    value.html.length > SANDBOX_MAX_TEMPLATE_CHARS ||
    value.css.length > SANDBOX_MAX_TEMPLATE_CHARS
  ) {
    return false;
  }


  /* 좌우 영역 설정 — { left: boolean, right: boolean } 정확히 그 모양만.
     EDITORIAL-DEFAULT-SKIN-2: 모바일에서 끈 쪽이 있으면 mobile 도
     { left: boolean, right: boolean } 로 온다. */
  if (
    value.sides !== undefined &&
    !(
      isPlainSandboxObject(value.sides) &&
      hasOnlyKnownSandboxKeys(value.sides, ["left", "right", "mobile"]) &&
      typeof value.sides.left === "boolean" &&
      typeof value.sides.right === "boolean" &&
      (
        value.sides.mobile === undefined ||
        (
          isPlainSandboxObject(value.sides.mobile) &&
          hasOnlyKnownSandboxKeys(value.sides.mobile, ["left", "right"]) &&
          typeof value.sides.mobile.left === "boolean" &&
          typeof value.sides.mobile.right === "boolean"
        )
      )
    )
  ) {
    return false;
  }


  if (value.settings !== undefined && !isSandboxSkinSettings(value.settings)) {
    return false;
  }


  /* HOME 캔버스 실행 데이터 — 캔버스가 없는 스킨은 키가 없다 */
  if (value.canvas !== undefined && !isSandboxHomeCanvas(value.canvas)) {
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
    keys: ["contract", "renderSeq", "editId", "tagName", "rect", "metrics"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (
        payload.editId === undefined &&
        payload.tagName === undefined &&
        payload.rect === undefined &&
        payload.metrics === undefined
      ) {
        return true;
      }

      const target = {
        editId: payload.editId,
        tagName: payload.tagName,
        rect: payload.rect
      };

      if (payload.metrics !== undefined) {
        target.metrics = payload.metrics;
      }

      return isSandboxInspectTarget(target, true);

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
  },


  /* =======================================================
     SANDBOX-SELECT-PARITY-1 — 직접 조작 (위 INSPECT_* 와 같은 봉투)
  ======================================================= */

  IMORY_INSPECT_CANDIDATES: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "point", "candidates"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq) || !isSandboxInspectPoint(payload.point)) {
        return false;
      }

      const list =
        payload.candidates;

      if (
        !Array.isArray(list) ||
        list.length < 1 ||
        list.length > SANDBOX_INSPECT_MAX_CANDIDATES
      ) {
        return false;
      }

      for (let i = 0; i < list.length; i += 1) {
        if (!isSandboxInspectCandidate(list[i])) {
          return false;
        }
      }

      return true;

    }
  },


  IMORY_INSPECT_CHOOSE: {
    direction: "to-frame",
    keys: ["contract", "renderSeq", "index"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        Number.isInteger(payload.index) &&
        payload.index >= 0 &&
        payload.index < SANDBOX_INSPECT_MAX_CANDIDATES
      );
    }
  },


  IMORY_INSPECT_PARENT: {
    direction: "to-frame",
    keys: ["contract", "renderSeq"],
    check: function (payload) {
      return isSandboxRenderSeq(payload.renderSeq);
    }
  },


  /* editId 가 없으면 "고른 요소가 없다" — 둘 다 false 로 본다 */

  IMORY_INSPECT_CAPS: {
    direction: "to-frame",
    keys: ["contract", "renderSeq", "editId", "movable", "textEditable"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        (payload.editId === undefined || isSandboxInspectEditId(payload.editId)) &&
        typeof payload.movable === "boolean" &&
        typeof payload.textEditable === "boolean"
      );
    }
  },


  IMORY_INSPECT_TEXT: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "phase", "editId", "text"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        SANDBOX_INSPECT_TEXT_PHASES.indexOf(payload.phase) !== -1 &&
        isSandboxInspectEditId(payload.editId) &&
        isSandboxInspectText(payload.text)
      );
    }
  },


  IMORY_INSPECT_DRAG: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "phase", "x", "y"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        SANDBOX_INSPECT_DRAG_PHASES.indexOf(payload.phase) !== -1 &&
        isSandboxInspectCoord(payload.x) &&
        isSandboxInspectCoord(payload.y)
      );
    }
  },


  /*
    clear:true 면 그것 하나만(다른 칸이 같이 오면 거부). 아니면
    editId 가 반드시 있고, text / layoutX / layoutY 중 하나 이상.
  */

  IMORY_INSPECT_PREVIEW: {
    direction: "to-frame",
    keys: ["contract", "renderSeq", "editId", "text", "layoutX", "layoutY", "clear"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (payload.clear !== undefined) {
        return (
          payload.clear === true &&
          payload.editId === undefined &&
          payload.text === undefined &&
          payload.layoutX === undefined &&
          payload.layoutY === undefined
        );
      }

      if (!isSandboxInspectEditId(payload.editId)) {
        return false;
      }

      if (
        payload.text === undefined &&
        payload.layoutX === undefined &&
        payload.layoutY === undefined
      ) {
        return false;
      }

      return (
        (payload.text === undefined || isSandboxInspectText(payload.text)) &&
        (payload.layoutX === undefined || isSandboxInspectRatio(payload.layoutX)) &&
        (payload.layoutY === undefined || isSandboxInspectRatio(payload.layoutY))
      );

    }
  },


  /* 좌우 영역 — 위 SIDES_* 주석 */

  IMORY_SIDES_STATE: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "open"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        typeof payload.open === "boolean"
      );
    }
  },

  IMORY_SIDES_VIEWPORT: {
    direction: "to-frame",
    keys: ["contract", "renderSeq", "top", "height"],
    check: function (payload) {
      return (
        isSandboxRenderSeq(payload.renderSeq) &&
        Number.isInteger(payload.top) &&
        payload.top >= 0 &&
        payload.top <= SANDBOX_MAX_FRAME_HEIGHT &&
        Number.isInteger(payload.height) &&
        payload.height >= 0 &&
        payload.height <= SANDBOX_MAX_FRAME_HEIGHT
      );
    }
  },

  IMORY_SIDES_CLOSE: {
    direction: "to-frame",
    keys: ["contract", "renderSeq"],
    check: function (payload) {
      return isSandboxRenderSeq(payload.renderSeq);
    }
  },


  /* =======================================================
     HOME-CANVAS-SELECT-1B-1 — 캔버스 선택 (위 CANVAS_SELECT 주석)

     active:false 면 ids 는 빈 배열이고 primaryId 는 없다. 그것이
     "풀어라"다. active:true 면 primaryId 가 반드시 있고 ids 안에
     들어 있어야 한다 — "골랐다는데 무엇을 골랐는지 없는" 모양을
     메시지 층에서 막는다.

     식별자 규칙은 Inspector 와 **같은 것**을 쓴다
     (SANDBOX_INSPECT_EDIT_ID_PATTERN) — 캔버스 요소의 id 규칙과
     같은 글자 집합이고, 둘을 따로 두면 느슨한 쪽이 생긴다.
  ======================================================= */

  IMORY_CANVAS_SELECT: {
    direction: "to-frame",
    keys: [
      "contract", "renderSeq", "editing", "active", "ids", "primaryId", "generation"
    ],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (typeof payload.active !== "boolean") {
        return false;
      }

      /* HOME-CANVAS-SELECT-1B-2 — 편집 모드. 선택이 없어도 참일 수
         있고(lasso 는 빈 상태에서 시작한다), 거짓이면 선택도 없다. */
      if (typeof payload.editing !== "boolean") {
        return false;
      }

      if (payload.active && !payload.editing) {
        return false;
      }

      if (!Number.isInteger(payload.generation) || payload.generation < 0) {
        return false;
      }

      if (!isSandboxCanvasIdList(payload.ids)) {
        return false;
      }

      if (!payload.active) {
        return payload.ids.length === 0 && payload.primaryId === undefined;
      }

      return (
        isSandboxInspectEditId(payload.primaryId) &&
        payload.ids.indexOf(payload.primaryId) !== -1
      );

    }
  },


  /* =======================================================
     HOME-CANVAS-SELECT-1B-2 — 프레임의 선택 **제안**

     ★ 이것은 확정이 아니다. 부모가 자기 draft 로 모든 id 를 다시
       보고, 하나라도 없거나 hidden · locked 면 **메시지 전체를
       거부**한다(위 CANVAS_PROPOSE 주석).

     빈 제안(`ids: []`)도 뜻이 있다 — "아무것도 못 잡은 일반 lasso"
     이고, 그것은 `replace` 로 오면 **전체 해제**다. `toggle` 로
     오는 빈 제안은 아무 일도 하지 않으므로 거부한다(뜻이 없는
     메시지를 받지 않는다).
  ======================================================= */

  IMORY_CANVAS_PROPOSE: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "ids", "primaryId", "mode", "generation"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (SANDBOX_CANVAS_SELECT_MODES.indexOf(payload.mode) === -1) {
        return false;
      }

      if (!Number.isInteger(payload.generation) || payload.generation < 0) {
        return false;
      }

      if (!isSandboxCanvasIdList(payload.ids)) {
        return false;
      }

      if (!payload.ids.length) {
        return payload.mode === "replace" && payload.primaryId === undefined;
      }

      return (
        isSandboxInspectEditId(payload.primaryId) &&
        payload.ids.indexOf(payload.primaryId) !== -1
      );

    }
  },


  /* =======================================================
     HOME-CANVAS-TRANSFORM-1A — 단일 선택 요소의 Canvas 좌표
     (위 CANVAS_GEOMETRY 주석)

     active:false 면 나머지 칸이 **하나도 없다**. 그것이 "지금은
     옮길 수 있는 단독 선택이 없다"이고, 프레임은 그 말을 받으면
     이동을 끈다 — CANVAS_SELECT 의 해제와 같은 모양이다.
  ======================================================= */

  IMORY_CANVAS_GEOMETRY: {
    direction: "to-frame",
    keys: [
      "contract", "renderSeq", "active", "id",
      "x", "y", "width", "height", "rotation",
      /* HOME-CANVAS-V2-EDITOR-1B — 자의 기준 상자와 pin 의 origin.
         **선택 칸**이다(v1 요소 · v2 overlay 에는 없다). */
      "scopeId", "originX", "originY",
      /* HOME-CANVAS-V2-MANUAL-FIX-1 — 고른 것이 **흐름 블록**인가
         (계약 §29-4). 있으면 값은 "block" 하나뿐이고, 프레임은 그때
         좌우 손잡이만 그리며 폭 한 칸만 바꾼다. */
      "mode",
      "baseWidth", "baseHeight", "generation", "answering"
    ],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (typeof payload.active !== "boolean") {
        return false;
      }

      if (!Number.isInteger(payload.generation) || payload.generation < 0) {
        return false;
      }

      /* 답일 때만 있는 칸이다 — 있으면 양의 정수여야 한다 */
      if (
        payload.answering !== undefined &&
        (!Number.isInteger(payload.answering) || payload.answering < 1)
      ) {
        return false;
      }

      if (!payload.active) {

        return (
          payload.id === undefined &&
          payload.mode === undefined &&
          payload.x === undefined &&
          payload.y === undefined &&
          payload.width === undefined &&
          payload.height === undefined &&
          payload.rotation === undefined &&
          payload.scopeId === undefined &&
          payload.originX === undefined &&
          payload.originY === undefined &&
          payload.baseWidth === undefined &&
          payload.baseHeight === undefined
        );

      }

      /* =====================================================
         HOME-CANVAS-V2-EDITOR-1B — 자의 기준 상자와 origin

         ★ **선택 칸이다.** v1 요소와 v2 overlay 의 자는 도화지이고
           origin 은 0 이라, 그 칸이 아예 없는 메시지가 지금까지의
           그 메시지다. 있으면 모양을 본다 — `scopeId` 는 편집
           식별자, origin 은 0~1 의 분수다(자기 상자 안의 점이므로
           좌표의 ±100000 을 빌려 오지 않는다).
      ====================================================== */
      if (
        payload.scopeId !== undefined &&
        !isSandboxInspectEditId(payload.scopeId)
      ) {
        return false;
      }

      /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록 표시(계약 §29-4).
         **선택 칸**이고 값이 있으면 "block" 하나뿐이다. */
      if (payload.mode !== undefined && payload.mode !== "block") {
        return false;
      }

      if (
        !isSandboxCanvasOrigin(payload.originX) ||
        !isSandboxCanvasOrigin(payload.originY)
      ) {
        return false;
      }

      return (
        isSandboxInspectEditId(payload.id) &&
        isSandboxCanvasCoord(payload.x) &&
        isSandboxCanvasCoord(payload.y) &&
        /* HOME-CANVAS-TRANSFORM-1B — 크기도 함께 온다. 프레임은 이
           값 없이는 리사이즈를 시작할 수 없으므로 **선택 칸이
           아니다** — active 면 반드시 있다. */
        isSandboxCanvasSize(payload.width) &&
        isSandboxCanvasHeight(payload.height) &&
        /* HOME-CANVAS-TRANSFORM-1C — 각도도 같은 이유로 반드시
           있다. 요소에 `rotation` 이 없으면 부모가 0 을 싣는다. */
        isSandboxCanvasAngle(payload.rotation) &&
        isSandboxCanvasSize(payload.baseWidth) &&
        isSandboxCanvasSize(payload.baseHeight)
      );

    }
  },


  /* =======================================================
     HOME-CANVAS-TRANSFORM-1A — 프레임의 이동 **확정 요청**

     ★ 확정이 아니다. 부모가 자기 draft 로 전부 다시 본다
       (위 CANVAS_TRANSFORM 주석).

     ★ `expected` 와 `next` 의 허용 키는 **kind 가 정한다**.

         move     x · y
         resize   x · y · width · height  (height 는 숫자 또는 "auto")
         rotate   rotation                (유한한 숫자 하나)
         width    width                   (흐름 블록의 폭 한 칸 —
                                           HOME-CANVAS-V2-MANUAL-FIX-1)

       그 밖의 키가 섞인 메시지는 여기서 통째로 버려진다 — 이동
       메시지에 width 가, 리사이즈 메시지에 rotation 이, 회전
       메시지에 좌표가 들어갈 수 없다는 계약이 메시지 층에도
       있어야 한다. 반대 방향도 막는다: 리사이즈 요청에 좌표 둘만
       오면 그것도 거부다.
  ======================================================= */

  IMORY_CANVAS_TRANSFORM: {
    direction: "to-parent",
    keys: [
      "contract", "renderSeq", "kind", "id", "expected", "next",
      "generation", "requestId"
    ],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (SANDBOX_CANVAS_TRANSFORM_KINDS.indexOf(payload.kind) === -1) {
        return false;
      }

      if (!isSandboxInspectEditId(payload.id)) {
        return false;
      }

      /* 답을 이 번호로 돌려받는다(위 CANVAS_GEOMETRY 의 ★ 주석) */
      if (!Number.isInteger(payload.requestId) || payload.requestId < 1) {
        return false;
      }

      if (!Number.isInteger(payload.generation) || payload.generation < 0) {
        return false;
      }

      const shapeOk =
        sandboxCanvasTransformShapeCheck(payload.kind);

      return (
        shapeOk(payload.expected) &&
        shapeOk(payload.next)
      );

    }
  },


  /* =======================================================
     HOME-CANVAS-V2-ELEMENTS-1 — v2 프레임의 페이지 자리
     (위 CANVAS_LAYOUT 주석)

     ★ 값은 **분수**다. 도화지 폭으로 나눈 값이므로 ±1 을 크게
       벗어날 일이 없지만, 상한은 좌표와 같은 자(±100000)를 빌려
       쓴다 — 새 숫자 표를 만들지 않는다.

     ★ 프레임이 하나도 없는 캔버스에서는 **빈 배열**이 올라온다.
       "프레임이 없다"는 뜻이 하나뿐이므로 거부하지 않는다.
  ======================================================= */

  IMORY_CANVAS_LAYOUT: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "frames", "blocks", "look"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (
        !Array.isArray(payload.frames) ||
        payload.frames.length > SANDBOX_CANVAS_MAX_ELEMENTS
      ) {
        return false;
      }

      /* =====================================================
         HOME-CANVAS-V2-MANUAL-FIX-1 — 블록의 그려진 높이
         (계약 §29-3)

         ★ 값은 프레임 자리와 **같은 자**(도화지 폭의 분수)이고
           같은 상한을 쓴다. 블록이 하나도 없는 캔버스에서는 빈
           배열이 올라온다 — 뜻이 하나뿐이라 거부하지 않는다.
      ====================================================== */
      if (payload.blocks !== undefined) {

        if (
          !Array.isArray(payload.blocks) ||
          payload.blocks.length > SANDBOX_CANVAS_MAX_ELEMENTS
        ) {
          return false;
        }

        const seenBlocks = [];

        const blocksOk =
          payload.blocks.every(
            (block) => {

              if (
                !isPlainSandboxObject(block) ||
                !hasOnlyKnownSandboxKeys(block, ["id", "h"]) ||
                !isSandboxInspectEditId(block.id) ||
                seenBlocks.indexOf(block.id) !== -1 ||
                !isSandboxCanvasCoord(block.h)
              ) {
                return false;
              }

              seenBlocks.push(block.id);

              return true;

            }
          );

        if (!blocksOk) {
          return false;
        }

      }

      /* =====================================================
         HOME-CANVAS-V2-MANUAL-FIX-1 — 고른 요소가 물려받고 있는
         모양(계약 §29-6)

         ★ 이 값은 **스킨 CSS 로 들어간다**(묶기 · 빼기가 모양을
           유지하는 방법). 그래서 여기서 가장 좁게 본다 — 키는
           아래 표에 적힌 것만, 값은 짧은 문자열이고 `;` `{` `}`
           `<` `>` `@` `\\` 같은 글자는 하나도 없다. 규칙 하나를
           탈출해 다른 선택자를 쓰는 길을 메시지 층에서 막는다.
      ====================================================== */
      if (payload.look !== undefined && !isSandboxCanvasLook(payload.look)) {
        return false;
      }

      const seen = [];

      return payload.frames.every(
        (frame) => {

          if (
            !isPlainSandboxObject(frame) ||
            !hasOnlyKnownSandboxKeys(frame, ["id", "x", "y", "w"]) ||
            !isSandboxInspectEditId(frame.id) ||
            seen.indexOf(frame.id) !== -1 ||
            !isSandboxCanvasCoord(frame.x) ||
            !isSandboxCanvasCoord(frame.y)
          ) {
            return false;
          }

          /* =================================================
             HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 프레임의 **그려진
             폭**(계약 §30-3). 자도 상한도 자리와 같고, 없어도
             거부하지 않는다 — 옛 프레임 문서가 보내지 않을 수 있고
             그때는 부모가 저장값에서 계산하던 그 길로 간다.
          ================================================== */
          if (frame.w !== undefined && !isSandboxCanvasCoord(frame.w)) {
            return false;
          }

          seen.push(frame.id);

          return true;

        }
      );

    }
  },


  /* =======================================================
     STUDIO-LAYERS-MATERIALS-1B — 끌어다 놓을 자리를 묻는다
     (위 CANVAS_PROBE · CANVAS_BOX 주석)

     ★ 요청에는 실을 것이 없다. "지금 화면의 상자를 재서 올려라"가
       전부이고, 어느 화면인가는 renderSeq 가 정한다.
  ======================================================= */

  IMORY_CANVAS_PROBE: {
    direction: "to-frame",
    keys: ["contract", "renderSeq"],
    check: function (payload) {

      return isSandboxRenderSeq(payload.renderSeq);

    }
  },


  /* =======================================================
     그 답 — 픽셀 상자 셋(프레임 뷰포트 기준)

       root    도화지의 안쪽 상자
       blocks  흐름 블록마다 하나(순서는 화면 순서 = draft 순서)
       frames  `main_visual` 마다 하나

     ★ 상자 모양은 Inspector 의 그 자다(isSandboxInspectRect) —
       사각형을 나르는 자를 두 벌 만들지 않는다.

     ★ 도화지가 없는 화면에서는 `root` 가 없다. "캔버스가 아니다"는
       뜻이 하나뿐이므로 거부하지 않는다 — 부모가 그때 놓을 자리를
       찾지 못했다고 읽는다.
  ======================================================= */

  IMORY_CANVAS_BOX: {
    direction: "to-parent",
    keys: ["contract", "renderSeq", "root", "blocks", "frames"],
    check: function (payload) {

      if (!isSandboxRenderSeq(payload.renderSeq)) {
        return false;
      }

      if (payload.root !== undefined && !isSandboxInspectRect(payload.root)) {
        return false;
      }

      const listOk =
        (list) => {

          if (list === undefined) {
            return true;
          }

          if (!Array.isArray(list) || list.length > SANDBOX_CANVAS_MAX_ELEMENTS) {
            return false;
          }

          const seen = [];

          return list.every(
            (item) => {

              if (
                !isPlainSandboxObject(item) ||
                !hasOnlyKnownSandboxKeys(item, ["id", "rect"]) ||
                !isSandboxInspectEditId(item.id) ||
                seen.indexOf(item.id) !== -1 ||
                !isSandboxInspectRect(item.rect)
              ) {
                return false;
              }

              seen.push(item.id);

              return true;

            }
          );

        };

      return listOk(payload.blocks) && listOk(payload.frames);

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
    SANDBOX_INSPECT_MAX_TEXT_CHARS,
    SANDBOX_INSPECT_MAX_CANDIDATES,
    SANDBOX_CANVAS_MAX_SELECTED,
    SANDBOX_CANVAS_SELECT_MODES,
    SANDBOX_CANVAS_TRANSFORM_KINDS,
    isSandboxCanvasIdList,
    isSandboxCanvasPoint,
    isSandboxCanvasHeight,
    isSandboxCanvasBox,
    isSandboxCanvasAngle,
    isSandboxCanvasRotation,
    isSandboxInspectEditId,
    isSandboxInspectRect,
    isSandboxInspectTarget,
    isSandboxInspectMetrics,
    isSandboxInspectCandidate,
    isSandboxHeight,
    isSandboxRenderSeq,
    isSandboxTemplate,
    isSandboxSkinSettings,
    SANDBOX_CANVAS_VERSION,
    SANDBOX_CANVAS_BASE_WIDTH,
    SANDBOX_CANVAS_BASE_HEIGHT,
    SANDBOX_CANVAS_MAX_ELEMENTS,
    SANDBOX_CANVAS_MAX_TEXT_CHARS,
    SANDBOX_CANVAS_MAX_CATEGORY_IDS,
    SANDBOX_CANVAS_MAX_CATEGORY_ID_CHARS,
    SANDBOX_CANVAS_MAX_COORD,
    SANDBOX_CANVAS_ELEMENT_TYPES,
    SANDBOX_CANVAS_AUTO_HEIGHT_TYPES,
    SANDBOX_CANVAS_TEXT_ROLES,
    SANDBOX_CANVAS_NAV_MODES,
    SANDBOX_CANVAS_SHAPE_KINDS,
    SANDBOX_CANVAS_LOGO_FALLBACKS,
    SANDBOX_CANVAS_ELEMENT_ID_PATTERN,
    SANDBOX_CANVAS_SLOT_NAME_PATTERN,
    isSandboxCanvasElement,
    isSandboxHomeCanvas,

    /* HOME-CANVAS-V2-FLOW-RENDER-1 — 조합형 Canvas 의 값 목록 */
    SANDBOX_CANVAS_V2_VERSION,
    SANDBOX_CANVAS_BLOCK_TYPES,
    SANDBOX_CANVAS_BLOCK_AUTO_HEIGHT_TYPES,
    SANDBOX_CANVAS_BLOCK_ALIGNS,
    SANDBOX_CANVAS_FLOW_DIRECTIONS,
    SANDBOX_CANVAS_EDGES,
    SANDBOX_CANVAS_FOLLOW_MODES,
    SANDBOX_CANVAS_PIN_TARGETS,
    SANDBOX_CANVAS_PIN_POINTS,
    isSandboxCanvasBlock,
    isSandboxHomeCanvasV2,
    isPlainSandboxObject,
    hasOnlyKnownSandboxKeys,
    buildSandboxMessage,
    validateSandboxMessage
  };

}
