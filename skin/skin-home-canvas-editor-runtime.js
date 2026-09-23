/* =========================================================
   HOME CANVAS — 프레임 안 편집 runtime
   (HOME-CANVAS-SELECT-1B-1 · 1B-2 · TRANSFORM-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §15 · §16 · §17
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ── 이 파일이 하는 것 / 하지 않는 것 ────────────────────
   한다:   1) 부모가 **확정해 내려 준** 캔버스 선택을 받아, 그 요소들이
             지금 이 문서의 DOM 에 실제로 있는지 다시 확인한 뒤
             Moveable 로 테두리를 그린다(하나면 회전을 따라가는 틀,
             여럿이면 그룹 틀 하나).
           2) Selecto 로 끌어서 고른 결과와 Shift 클릭을 **제안**으로
             올려보낸다.
           3) TRANSFORM-1A — 단독으로 고른 요소 하나를 마우스 · 펜으로
             끌어 옮기고, 그 결과를 **확정 요청**으로 올려보낸다.

   안 한다: 크기 · 회전 조작 · 손잡이 · 그룹 이동 · 손가락 이동 ·
           Canvas JSON 수정 · Undo · **최종 선택과 최종 좌표의
           확정**. 끄는 동안 이 문서에서 움직이는 것은 custom
           property 두 칸뿐이고, 무엇을 실제로 저장할지는 언제나
           부모가 자기 draft 를 보고 정한다.

   ── 누가 정하는가 ───────────────────────────────────────
   프레임은 "이것들이 잡혔다"까지만 말한다. 무엇이 최종 선택인지 ·
   어떤 순서인지 · 무엇이 primary 인지는 **언제나 부모(Studio)**가
   지금 draft 를 보고 정하고, 승인한 결과를 다시 내려 준다
   (studio/inspector/studio-canvas-selection.js
    proposeStudioCanvasSelection).

   ── 왜 프레임 안에서 도는가 ─────────────────────────────
   Canvas DOM 이 있는 문서가 둘이다.

     native  studio/preview/preview-frame.html
     sandbox skin/sandbox/frame.html   (별도 origin · cross-origin)

   sandbox 쪽 DOM 은 부모가 아예 볼 수 없다. 그리고 native 쪽도,
   요소가 rAF 로 움직이거나 늦게 온 이미지로 자리가 바뀌면 부모가
   그리는 테두리는 한 프레임씩 늦는다. 그래서 **선택의 주인은 부모
   (Studio)**, **그리는 실행자는 프레임**으로 나눈다 — 기존 sandbox
   Inspector 테두리가 이미 쓰는 경계와 같다.

   부모는 ID 를 내려 줄 뿐 무엇을 그릴지 정하지 않고, 프레임은
   받은 ID 를 **자기 DOM 에서 다시 확인**하기 전에는 아무 것도
   그리지 않는다. 없는 ID 를 다른 요소로 바꿔 주지 않는다.

   ── 왜 두 문서가 같은 파일을 읽는가 ─────────────────────
   같은 기능을 두 벌로 두면 한쪽만 고쳐지는 날이 온다. 그래서
   실행 코드는 이 파일 하나이고, 두 문서는 **연결만** 다르다:

     native  studio/preview/preview-bridge.js   가 import() 한다
     sandbox skin/sandbox/skin-sandbox-frame.js 가 import() 한다

   ── 왜 정적 <script> 가 아니라 동적 import 인가 ─────────
   skin/sandbox/frame.html 은 **공개 화면**이기도 하다. 거기에 이
   파일을 정적으로 걸면 캔버스를 편집하지 않는 모든 방문자가 이
   파일을 받는다. 그래서 두 문서 다 **캔버스 편집이 실제로 켜졌을
   때** 처음 부른다 — 공개 비용이 0 이다(VENDOR-1 이 UMD 에 대해
   세운 것과 같은 원칙, 계약 §13).

   ★ 그 "켜졌을 때"가 1B-2 에서 한 칸 앞으로 왔다. 1B-1 에서는 첫
     요소를 고른 순간이었지만, lasso 는 **아무것도 고르지 않은
     상태에서** 시작돼야 하므로 이제 "Canvas 가 있는 HOME 에서
     Select 모드를 켠 순간"이다(계약 §16-2). Canvas 가 없는 스킨과
     공개 화면은 여전히 요청 0 이다.

   그 동적 import 주소에는 부르는 쪽이 `?v=APP_BUILD_VERSION` 을
   붙인다(CLAUDE.md §4). 이 파일은 **정적 import 가 하나도 없다** —
   그래서 어느 문서의 import map 에도 올릴 것이 없다.

   ── 모듈 상태는 문서마다 따로다 ─────────────────────────
   ES 모듈 인스턴스는 realm 마다 하나다. native 프레임과 sandbox
   프레임은 서로 다른 realm 이므로 아래 vendorLoaderPromise 도,
   controller 도 각자 자기 것을 갖는다 — 전역을 공유한다고 가정하지
   않는다.
========================================================== */


/* 렌더러가 붙이는 이름과 같다(skin/skin-home-canvas-render.js).
   "그 id 를 가진 **캔버스 요소**가 지금 이 DOM 에 있는가"를 묻는
   선택자가 이 둘의 조합이다 — 평범한 스킨 요소는 앞 속성이 없어
   걸리지 않는다. */
const CANVAS_ELEMENT_ATTR = "data-imory-canvas-element";

const CANVAS_EDIT_ID_ATTR = "data-imory-edit-id";

/* 도화지(표시 위치) 자신 — lasso 를 시작할 수 있는 범위다(§3) */
const CANVAS_ROOT_ATTR = "data-imory-canvas-root";

/* =========================================================
   HOME-CANVAS-V2-EDITOR-1B — 자의 기준이 되는 상자

   v1 에서는 그 상자가 언제나 도화지였다. v2 의 `main_visual` 내부
   요소는 **프레임 상자** 위에 놓이므로(백분율도 배율도 그 상자에서
   풀린다 — 계약 §24-3), 부모가 내려 주는 `scopeId` 로 그 상자를
   찾는다. `scopeId` 가 없으면 지금까지처럼 도화지다.

   ★ 프레임 블록은 자유 배치 요소가 아니라 `data-imory-canvas-block`
     이다(§25-2). 그래서 요소를 찾는 선택자와 자를 찾는 선택자가
     다르다.
========================================================== */
const CANVAS_BLOCK_ATTR = "data-imory-canvas-block";

const CANVAS_LOCKED_ATTR = "data-imory-canvas-locked";

/* =========================================================
   HOME-CANVAS-V2-ELEMENTS-1 — `main_visual` 프레임의 표식

   ★ 같은 속성을 둘이 쓴다(계약 §25-2). 값 `"1"` 은 이 파일이
     Moveable control box 에 붙이는 것이고, 렌더러가 v2 프레임
     블록에 붙이는 것은 빈 값이다. 그래서 프레임을 세는 자리는
     **값과 `data-imory-canvas-block` 을 함께** 본다.
========================================================== */
const CANVAS_FRAME_ATTR = "data-imory-canvas-frame";

const CANVAS_CONTROL_BOX_VALUE = "1";

/* =========================================================
   HOME-CANVAS-V2-MANUAL-FIX-1 — 요소가 쓰는 **자**의 표식

   렌더러가 v2 의 페이지 자유 장식에만 붙인다(계약 §29-1 ·
   skin/skin-home-canvas-render.js SKIN_CANVAS_RENDER_UNIT_ATTR).
   그 요소만 도화지 폭의 자(`100cqw`)를 쓰고, 그래서 그 요소만
   render.css §7 의 "화면 밖으로 밀리지 않는다" 규칙을 받는다.
   이름을 여기 한 번 더 적는 이유는 이 파일이 렌더러 없이도
   로드될 수 있어야 하기 때문이다(§0-1 의 그 규칙과 같다).
========================================================== */
const CANVAS_UNIT_ATTR = "data-imory-canvas-unit";

const CANVAS_UNIT_CQW = "cqw";

/* 창 폭이 바뀐 뒤 프레임의 자리 · 폭을 몇 프레임이나 다시 재는가
   (HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 후속 · 계약 §30-3-1).
   전환이 한 프레임에 끝나지 않을 수 있어 넉넉히 두되, 값이 그대로면
   메시지는 나가지 않으므로 헛도는 비용이 없다. */
const CANVAS_LAYOUT_SETTLE_FRAMES = 20;

/* skin/skin-home-canvas.js SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN 과
   같은 규칙. 이 값이 querySelector 의 문자열이 되므로 관문을 겹친다. */
const CANVAS_ELEMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/* Shift + 클릭이 "끌기"가 아니라고 보는 움직임의 상한(px). 이보다
   더 움직였으면 그 입력은 Shift + lasso 다. */
const SHIFT_CLICK_SLOP = 5;

/* =========================================================
   HOME-CANVAS-TRANSFORM-1A — 이동

   ★ 그 단계가 켠 조작은 `draggable` **하나**였다. 손잡이는
     `TRANSFORM-1B`(크기 여덟) · `1C`(회전 하나)가 더했고, 확정
     경로 한 벌을 셋이 함께 쓴다.

   ★ 저장 단위는 소수점 셋째 자리까지다. 390 자 도화지에서 0.001 은
     실제 화면의 1/1000 px 보다 작고, 그보다 더 적으면 같은 자리를
     여러 번 끌었을 때 문자열이 계속 길어진다.

   ★ 확정을 올려보낸 뒤 **답을 기다리는 동안**에도 임시 위치를
     유지한다. 부모가 승인하면 그 값이 그대로 남고, 거부하면 부모가
     내려 준 현재 값으로 되돌아간다(§9). 답이 아예 오지 않는 경우
     (프레임 교체 · 부모 오류)를 위해 상한을 하나 둔다 — 그때는
     마지막으로 알고 있던 값으로 돌아간다.
========================================================== */

const CANVAS_MOVE_KIND = "move";

/* HOME-CANVAS-TRANSFORM-1B */
const CANVAS_RESIZE_KIND = "resize";

/*
  손잡이 여덟. 순서가 곧 DOM 순서이므로 **시계 방향 한 바퀴**로
  적는다 — 테스트가 `data-direction` 으로 찾으므로 순서에 기대지는
  않지만, 읽는 사람이 빠진 것을 바로 알 수 있다.
*/
const CANVAS_RESIZE_DIRECTIONS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/* =========================================================
   HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록의 폭(계약 §29-4)

   블록은 자리를 좌표로 갖지 않는다(순서 · 정렬 · margin). 그래서
   이동도 회전도 없고, 손으로 잡을 수 있는 것은 **좌우 두 손잡이**로
   바꾸는 폭 한 칸뿐이다. 부모가 geometry 에 `mode:"block"` 을
   실어 주면 그때만 이 제스처가 열린다.
========================================================== */
const CANVAS_WIDTH_KIND = "width";

/* 그 두 손잡이. 여덟 중 좌우만 그린다 — 잡을 수 없는 손잡이를
   화면에 두지 않는다(§27 의 그 결정과 같다). */
const CANVAS_WIDTH_DIRECTIONS = ["w", "e"];

/* HOME-CANVAS-TRANSFORM-1C */
const CANVAS_ROTATE_KIND = "rotate";

/*
  회전 손잡이를 **그릴 자리**. 0.53.0 의 `rotationPosition` 이고,
  `"none"` 이면 손잡이를 아예 만들지 않는다(번들 실측 — Ji()
  첫 줄이 빈 배열을 돌려준다). 리사이즈의 `renderDirections: []`
  과 같은 자리다: able 은 처음부터 켜 두고 **그릴 것**으로 여닫는다.
*/
const CANVAS_ROTATION_POSITION = "top";
const CANVAS_ROTATION_POSITION_NONE = "none";

/* =========================================================
   HOME-CANVAS-MANUAL-UX-FIX-1 — 30° 자석

   양자화가 **아니다**. 가장 가까운 30° 배수와의 차이가 흡착 범위
   안일 때만 그 각도에 붙고, 그 밖에서는 자유 회전 그대로다
   (계약 §21-1).
========================================================== */
const CANVAS_ROTATION_SNAP_STEP = 30;
const CANVAS_ROTATION_SNAP_RANGE = 4;

/* Canvas 좌표 기준 최소 크기(계약 §18-2). 0 을 허용하면 그 요소는
   다시 잡을 수 없고, 계약의 `width > 0` 도 어긴다. */
const CANVAS_MIN_SIZE = 1;

const CANVAS_COMMIT_TIMEOUT_MS = 4000;

/* `height:"auto"` 를 나타내는 그 문자열 하나(계약 §6) */
const CANVAS_AUTO_HEIGHT = "auto";

/* =========================================================
   HOME-CANVAS-MANUAL-UX-FIX-1 — 순수 helper 둘

   이 두 함수는 DOM · Moveable · 상태를 **한 줄도** 보지 않는다.
   그래서 module 밖으로 내보내고, 경계값은 브라우저 없는 단위
   테스트가 직접 검사한다(skin/skin-home-canvas-test.mjs
   [ux-fix] 절). 제스처 쪽은 같은 함수를 부르므로 두 벌이 되지
   않는다.
========================================================== */

/* =========================================================
   HOME-CANVAS-MANUAL-UX-FIX-1 — 30° 자석 (계약 §21-1)

   snapCanvasRotation(deg) -> deg

   **양자화가 아니다.** 가장 가까운 30° 배수와의 차이가 ±4° 안일
   때만 그 배수로 붙고, 그 밖에서는 받은 각도를 **그대로** 돌려
   준다.

     25 -> 25      26 -> 30      34 -> 30      35 -> 35
     56 -> 60      86 -> 90      356 -> 360(= 저장 0)
     -26 -> -30    380 -> 380(390 까지 10 이라 자유)

   ★ 접기(normalizeCanvasRotation) 전의 **연속 각도**에 건다.
     그래서 356° 는 360° 로 붙고 접히면서 0° 가 되며, 350° 에서
     조금 더 돌린 385° 는 자유 회전 그대로다 — 어느 쪽도 화면이
     반대로 튀지 않는다(붙는 양이 최대 4° 다).

   ★ 음수도 같은 식이다. Math.round 가 0 쪽으로 반올림하는
     경계(±15°)에서도 차이가 15° 라 흡착 범위 밖이므로, 어느
     쪽으로 반올림하든 결과가 같다.

   ★ 판정만 하고 반올림 · 접기는 하지 않는다 — 자릿수와 한 바퀴의
     표현을 정하는 곳은 아래 한 곳이다(normalizeCanvasRotation).
========================================================== */

export function snapCanvasRotation(deg) {

  if (!Number.isFinite(deg)) {
    return deg;
  }

  const nearest =
    Math.round(deg / CANVAS_ROTATION_SNAP_STEP) * CANVAS_ROTATION_SNAP_STEP;

  return (
    Math.abs(deg - nearest) <= CANVAS_ROTATION_SNAP_RANGE ? nearest : deg
  );

}


/* =========================================================
   HOME-CANVAS-MANUAL-UX-FIX-1 — 모서리 손잡이의 비율 유지
   (계약 §21-2)

   canvasResizeKeepRatioBox(startW, startH, width, height,
                            ratioW, ratioH) -> [w, h] | null

   Moveable 이 자기 계산으로 낸 다음 크기(width · height, 요소
   **px**)를 받아, 우리가 저장할 네 칸이 시작 비율을 지키도록 그
   짝을 다시 정한다. `onBeforeResize` 에서 `setSize()` 로 돌려
   주므로 그 뒤의 `dist` 와 `drag.beforeTranslate` 가 **둘 다**
   이 값에서 나온다 — 삼각함수를 새로 적지 않아도 회전한 요소의
   반대편 기준점이 유지된다(§18-4 의 그 성질을 그대로 쓴다).

   ── 왜 절대값이 아니라 시작값 + 변화인가 ──────────────
   우리가 저장하는 것은 Canvas 좌표의 네 칸이고, 그 계산은
   `시작값 + dist / 배율` 이다(§18-4). 그래서 비율을 지켜야 하는
   것은 **px 상자의 비율이 아니라 dist 의 비율**이다.

     dist[1] / dist[0] = ratioH / ratioW

   px 상자의 비율로 맞추면 안 된다 — `offsetWidth` 에는 저자
   CSS 의 border · padding 이 섞여 있고, `height:"auto"` 요소의
   시작 세로는 우리가 재는 computed height 와 소수점이 다르다.
   dist 로 맞추면 그 차이가 **양쪽에서 상쇄된다**(시작 px 는
   U - startW 에만 들어간다).

   ── 어느 축이 끄는가 — 어느 쪽도 아니다 ───────────────
   변화량 `(dw, dh)` 를 **대각선 방향 `(ratioW, ratioH)` 에 정사영**
   한다.

     k   = (dw·ratioW + dh·ratioH) / (ratioW² + ratioH²)
     dw' = k · ratioW
     dh' = k · ratioH

   한 축을 고르는 방식은 두 가지가 다 나쁘다.

     · 언제나 가로(0.53.0 의 `keepRatio` 가 모서리에서 그렇게
       한다 — `isWidth` 가 참이다): se 손잡이를 **아래로만** 끌면
       아무 일도 일어나지 않는다.
     · 상대 변화가 큰 축: 납작한 글자 상자(120×21)에서 대각선으로
       30px 끌면 세로가 이겨 **가로가 171px 튄다**. 게다가 두 축이
       비길 때 결과가 끊긴다.

   정사영은 끊긴 자리가 없고 손이 간 방향을 따라간다. 축에 평행한
   드래그도 자연스럽게 들어온다(위 120×21 에 (30,30) 이면
   가로 +34.2 · 세로 +6.0).

   ratioW · ratioH 는 **Canvas 좌표의 시작 가로와 실제 세로**다
   (`height:"auto"` 면 그 순간 렌더된 세로 — §18-3 과 같은 자).
   정사영은 방향만 쓰므로 px 와 Canvas 좌표를 섞어도 된다 — 두 축의
   배율이 같기 때문이다(§12-2).
========================================================== */

export function canvasResizeKeepRatioBox(startW, startH, width, height, ratioW, ratioH) {

  if (
    !(startW > 0) || !(startH > 0) ||
    !(ratioW > 0) || !(ratioH > 0) ||
    !Number.isFinite(width) || !Number.isFinite(height)
  ) {
    return null;
  }

  const dw =
    width - startW;

  const dh =
    height - startH;

  const k =
    (dw * ratioW + dh * ratioH) / (ratioW * ratioW + ratioH * ratioH);

  const box =
    [startW + k * ratioW, startH + k * ratioH];

  /*
    한계까지 줄인 그 순간에는 비율이 깨질 수 있다 — Moveable 은
    0 에서, 우리는 Canvas 좌표 1 에서 멈추므로(§18-2 의 그 주석)
    여기서도 px 0 이하로는 내려 보내지 않는다. 실사용 범위가
    아니므로 맞추지 않았다.
  */
  return [Math.max(1, box[0]), Math.max(1, box[1])];

}


/* =========================================================
   HOME-CANVAS-MANUAL-UX-FIX-1 — 편집 chrome 의 시각적 여유

   글자를 직접 보여 주는 요소에서 선택선 · 손잡이가 **글자 바깥**에
   놓이게 하는 여유다(계약 §21-4). 저장되는 상자에는 한 픽셀도
   더해지지 않는다 — Moveable 의 `padding` 은 renderPoses 만 밖으로
   밀고 pos1~pos4 · state.width/height 는 건드리지 않는다(번들 실측).

   단위는 **요소 자기 좌표계의 px** 다. 부모 Preview 에 scale 이
   걸려 있으면 화면에서는 그만큼 함께 줄고 늘어난다.
========================================================== */
const CANVAS_EDIT_CHROME_GAP = 5;

/* 그 여유를 받을 요소 — 글자를 **직접** 보여 주는 것들이다.
   종류 이름이 아니라 렌더러가 붙인 표식으로 가른다(프레임은 JSON
   type 을 모른다 — 계약 §21-4). */
const CANVAS_TEXT_CONTENT_SELECTOR =
  "[data-imory-canvas-text],[data-imory-canvas-nav],[data-imory-canvas-logo-text]";

/* 규칙표를 못박을 때 쓰는 수. 한 화면에 이만큼의 컴포넌트가 동시에
   붙었다 떨어지는 일은 없다(위 pinEditorStyleSheets). */
const STYLE_PIN_COUNT = 1000000;


/* =========================================================
   HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 이동 손잡이
   (계약 §30-2)

   ── 왜 필요한가 ────────────────────────────────────────
   본체 끌기는 **요소 자신**에 붙은 gesto 다(0.53.0 은 단일 target
   에서 target 요소에 mousedown 을 건다). 그래서 앞에 그려진 다른
   요소가 그 자리를 덮고 있으면 mousedown 이 그쪽으로 가고, 고른
   요소는 **끌 수 없다**. 실측(2026-09-22)에서는 그 누름이 클릭으로
   이어져 선택까지 앞의 요소로 넘어갔다.

   ── 왜 이 방법인가 ─────────────────────────────────────
   · 앞 요소에 `pointer-events: none` 을 주지 않는다. 그러면 그
     요소를 고르거나 끌 수 없게 되고, 문제를 반대쪽으로 옮길 뿐이다.
   · `dragArea` 를 켜지 않는다. 선택 상자 전체가 입력을 먹으면 그
     안쪽을 누른 클릭이 스킨 DOM 에 닿지 않아 "겹친 것을 눌러 고른다"
     (DIRECT-UX-1)가 통째로 죽는다.
   · 그래서 **손잡이 하나**다. 리사이즈 · 회전 손잡이가 이미 쓰는
     그 길(control box 안에서 pointer-events 만 되돌려 받는다)을
     그대로 쓰고, 덮는 면적은 이 정사각형뿐이다.

   ── 본체 끌기는 그대로다 ───────────────────────────────
   `dragTarget`(손잡이) + `dragTargetSelf: true` 를 함께 준다.
   0.53.0 의 gesto 목록은 그때 [control box, 손잡이, target] 이 된다
   (번들 실측 — `Rs()` 의 `!a && u && s && e!==s && dragTargetSelf`).
   덮이지 않은 자리에서는 지금까지처럼 본체를 잡으면 된다.
========================================================== */
const CANVAS_MOVE_GRIP_ATTR = "data-imory-canvas-move-grip";

const CANVAS_MOVE_GRIP_SIZE = 18;

/* 손잡이 중심이 `nw` 손잡이에서 얼마나 바깥으로 물러나 있나 */
const CANVAS_MOVE_GRIP_OFFSET = 20;


/* VENDOR-1 의 지연 로더. **이 한 파일**만 부른다 — Moveable ·
   Selecto UMD 의 주소는 그 파일이 갖는다(여기에 복사해 적지
   않는다). sandbox origin 에서는 이 경로 하나가 allowlist 에
   올라가 있어야 한다(core/lib/skin-sandbox-server.js). */
const VENDOR_LOADER_PATH = "/studio/studio-home-canvas-vendor.js";


/* 문서 하나당 한 번. 실패한 Promise 는 남기지 않는다 — 네트워크가
   한 번 끊겼다고 그 문서에서 영영 다시 시도할 수 없게 만들지
   않는다(vendor 로더와 같은 규칙). */
let vendorLoaderPromise = null;


/* 값은 여기에 적지 않고 build-version.js 의 전역에서 읽는다
   (CLAUDE.md §4). 두 프레임 문서 모두 그 파일을 먼저 받는다. */
function versionedUrl(path, win) {

  const version =
    (win && typeof win.APP_BUILD_VERSION === "string") ? win.APP_BUILD_VERSION : "";

  return version
    ? `${path}?v=${encodeURIComponent(version)}`
    : path;

}


/* =========================================================
   ensureCanvasEditorVendorLoader(doc)

   → Promise<ensureHomeCanvasEditorVendors>

   ★ 로더를 두 번 주입하지 않는다. studio/studio-home-canvas-vendor.js
     는 classic script 이고 최상위 const 를 선언하므로, 같은 문서에서
     두 번 실행되면 "already been declared" 로 통째로 죽는다.
========================================================== */

function ensureCanvasEditorVendorLoader(doc) {

  const win =
    doc.defaultView || window;


  if (typeof win.ensureHomeCanvasEditorVendors === "function") {
    return Promise.resolve(win.ensureHomeCanvasEditorVendors);
  }


  if (vendorLoaderPromise) {
    return vendorLoaderPromise;
  }


  const url =
    versionedUrl(VENDOR_LOADER_PATH, win);


  const loading =
    new Promise(
      (resolve, reject) => {

        const script =
          doc.createElement("script");

        script.src = url;
        script.async = false;

        script.addEventListener(
          "load",
          () => {

            /* 파일은 왔는데 전역이 없다 = 우리가 아는 그 파일이
               아니다(200 인 SPA fallback HTML 을 성공으로 보지 않는
               것과 같은 이유). */
            if (typeof win.ensureHomeCanvasEditorVendors !== "function") {

              reject(
                new Error(
                  `HOME Canvas 편집 로더 실패: ${VENDOR_LOADER_PATH} ` +
                  "(응답은 받았지만 ensureHomeCanvasEditorVendors 가 없다)"
                )
              );

              return;

            }

            resolve(win.ensureHomeCanvasEditorVendors);

          }
        );

        script.addEventListener(
          "error",
          () => {

            reject(
              new Error(`HOME Canvas 편집 로더 실패: ${url} 를 받지 못했다`)
            );

          }
        );

        doc.head.appendChild(script);

      }
    );


  vendorLoaderPromise = loading;

  loading.catch(
    () => {

      if (vendorLoaderPromise === loading) {
        vendorLoaderPromise = null;
      }

    }
  );


  return loading;

}


/* =========================================================
   HOME-CANVAS-SELECT-1B-2 — Selecto 설정

   ★ 1.26.3 의 실제 번들을 읽고 정한 값들이다(최신 문서가 아니라).

   selectByClick: false
     기본값이 true 다. 그대로 두면 Selecto 가 **평범한 클릭까지**
     자기 선택으로 처리해 SELECT-1A 의 단일 클릭 경로와 주인이
     둘이 된다. 클릭은 지금까지처럼 프레임 Inspector 가 맡는다 —
     여기는 **끌었을 때만** 일한다.

   hitRate: 1
     번들의 hitTest 는 `round(교집합 넓이 / 대상 넓이 * 100) >=
     hitRate` 다(단위 없는 숫자는 퍼센트). 그래서 1 이 "1% 이상
     겹치면 선택"이다.

   selectFromInside: true · preventDragFromInside: false
     기본값은 preventDragFromInside:true 라, 요소 **위에서** 시작한
     드래그가 lasso 가 되지 않는다. 실제 스킨의 HOME 은 도화지
     전체를 덮는 배경 사진을 흔히 쓰므로 그대로 두면 lasso 를 시작할
     빈 자리가 없다. ★ 요소 본체 끌기(이동)가 들어오는
     HOME-CANVAS-TRANSFORM-1 에서 이 둘을 다시 정해야 한다 —
     그때는 "위에서 끌면 이동, 빈 자리에서 끌면 lasso"를 갈라야 한다.

   rootContainer 를 주지 않는다
     번들은 rootContainer 가 있으면 선택 사각형을 `position:absolute`
     로, 없으면 `fixed` 로 놓는다. fixed 가 뷰포트 좌표 그대로라
     프레임 스크롤·부모 scale 에서 계산이 한 겹 줄어든다.

   toggleContinueSelect 를 주지 않는다
     Shift 의 뜻(더하기/빼기)은 **부모**가 정한다. Selecto 가 자기
     안에서 합치면 부모의 canonical 상태와 두 벌이 된다. 여기서는
     "이번 사각형이 잡은 것"만 올리고, 합치는 것은 부모의 몫이다.
========================================================== */

function lassoSelectoOptions(doc, getSelectable, condition, nonce) {

  return {

    /* 선택 사각형이 붙는 곳 — 스킨 DOM 이 아니라 body 다
       (Moveable control box 와 같은 자리) */
    container: doc.body,

    /*
      끌기를 듣는 곳.

      ★ 도화지 요소를 직접 주지 않는다. 재렌더마다 도화지는 **새
        노드**가 되므로 그때마다 Selecto 를 다시 만들어야 한다.
        대신 늘 같은 body 에서 듣고, "도화지 안에서 시작했는가"는
        아래 dragCondition 이 시작점 좌표로 판정한다 — 결과는 같고
        인스턴스는 하나로 유지된다(§2).

      ★ 기존 Inspector 와 부딪히지 않는다: 저쪽은 document capture
        에서 **pointerdown** 의 전파를 끊고, Selecto 의 gesto 는
        **mousedown / touchstart** 를 듣는다(번들 실측). 서로 다른
        이벤트라 한쪽이 다른 쪽을 지우지 않는다.
    */
    dragContainer: doc.body,

    /* 함수를 넣을 수 있다(번들의 getSelectableElements 가
       isFunction 을 먼저 본다) — 매 드래그마다 지금 화면의
       고를 수 있는 캔버스 요소만 새로 모은다. */
    selectableTargets: [getSelectable],

    selectByClick: false,
    selectFromInside: true,
    preventDragFromInside: false,
    clickBySelectEnd: false,
    continueSelect: false,

    hitRate: 1,
    ratio: 0,

    /* 입력 요소 위에서의 드래그를 가로채지 않는다 */
    checkInput: true,

    /* 기본 동작을 막지 않는다 — 스크롤과 링크는 프레임의 다른
       규칙이 정한다(Select 모드에서 링크는 이미 Inspector 가
       막는다) */
    preventDefault: false,

    /*
      ★ 끈 뒤에 따라오는 click 은 삼킨다.

      native Preview 의 Inspector 는 **click** 으로 고른다
      (studio/preview/preview-bridge.js 의 document capture). 끌기가
      끝나면 브라우저가 click 을 하나 만들고, 그 자리는 보통 "빈
      곳"이라 Inspector 가 **방금 만든 캔버스 선택을 지운다**
      (2026-09-21 이 라운드의 e2e 가 실제로 잡았다 —
       routeStudioInspectSelectMessage → setStudioInspectorSelection).

      gesto 가 그 한 번의 click 을 window capture 에서 막아 준다.
      **끌었을 때만** 막는다 — 끌지 않은 평범한 클릭에서는
      onDragEnd 가 곧바로 그 리스너를 떼므로(번들 실측), SELECT-1A
      의 단일 클릭 선택은 그대로 산다.
    */
    preventClickEventOnDrag: true,
    preventClickEventOnDragStart: false,
    preventRightClick: true,

    dragCondition: condition,

    cspNonce: typeof nonce === "string" ? nonce : ""

  };

}


/* =========================================================
   Moveable 설정 — 테두리, 그리고 **본체 이동 하나**

   ★ 손잡이 able 은 여전히 전부 꺼져 있다. 켜는 것은 `draggable`
     하나이고, 그것도 생성 시점에는 false 다 — 조건이 맞을 때만
     setDraggableState() 가 켠다(계약 §17-1).

   ★ 그래서 이 Moveable 은 조건이 맞을 때 target 에 pointer 리스너를
     단다(0.53.0 의 _updateEvents 는 "dragStart 를 가진 able 이 하나
     라도 있으면" targetGesto 를 만든다). 그 gesto 는 mousedown /
     touchstart 를 듣고, 기존 Select 는 document capture 의
     **pointerdown** 을 듣는다 — 서로 다른 이벤트라 한쪽이 다른 쪽을
     지우지 않는다(Selecto 와 같은 사정).

   ★ preventClickEventOnDrag: true 가 이번에 켜졌다.

     native Preview 의 Inspector 는 **click** 으로 고른다. 끌고 난 뒤
     따라오는 click 을 그대로 두면 방금 옮긴 요소를 한 번 더 고르는
     메시지가 왕복한다(선택은 그대로지만 순번이 헛돈다). gesto 가
     **끌었을 때만** 그 한 번을 막는다 — 끌지 않은 평범한 클릭에는
     손대지 않으므로 SELECT-1A 의 단일 클릭 선택은 그대로다.

   ★ renderDirections: [] 는 손잡이(모서리 · 변)를 만들지 않는다.
     hideDefaultLines 는 **끄지 않는다** — 그 네 줄이 우리가 원하는
     "회전을 따라가는 테두리"다(내부 state.renderLines 는 요소의
     네 꼭짓점 pos1~pos4 에서 나오므로 축에 평행한 상자가 아니다).

   ★ 이벤트 handler 는 **`.on()` 으로만** 건다. 옵션으로 넘기면
     한 번도 불리지 않는다.

     0.53.0 의 vanilla 래퍼는 생성자에서 옵션을 복사한 뒤 모든
     `onXxx` 칸을 **자기 emitter 로 덮어쓴다**(번들 실측:
     `su.forEach(t => u["on"+Camel(t)] = e => this.trigger(t, e))`).
     그래서 우리가 넣은 `onDragStart` 는 그 자리에서 사라진다 —
     2026-09-21 에 실제로 그렇게 만들었다가, 관문도 통과하고
     targetGesto 도 붙었는데 드래그가 **한 번도 시작되지 않는**
     상태를 보고서야 알았다.

     거절은 `e.stop()` 이다. emitter 의 `emit()` 은 listener 중
     하나라도 `stop()` 을 부르면 false 를 돌려주고, Draggable 은
     그 값을 보고 제스처를 접는다(`!1 !== (parentEvent || trigger)`).

   ★ cspNonce 는 공식 옵션이다. 전역 createElement 를 가로채지도,
     style 태그를 사후에 훑지도, CSP 를 넓히지도 않는다. 0.53.0 에서
     **작동하지만 deprecated** 라는 것이 VENDOR-1 의 판정이고, 그래서
     버전을 고정해 두었다(계약 §13).
========================================================== */

function displayOnlyMoveableOptions(target, nonce, grip) {

  const many =
    Array.isArray(target) && target.length > 1;

  return {

    target: target,

    /* =====================================================
       HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 이동 손잡이(계약 §30-2)

       ★ 둘 다 있어야 한다. `dragTarget` 만 주면 gesto 가 손잡이
         **하나**에만 붙어 본체 끌기가 사라지고, `dragTargetSelf`
         만 주면(=`dragTarget` 이 없으면) 그 줄이 아예 돌지 않는다
         (번들 실측 — `Rs()` 는 `u`(dragTarget)가 있을 때만 target
         을 목록에 더한다).

       ★ 그룹에는 주지 않는다. MoveableGroup 은 `dragTarget` 이
         없을 때 자기 `areaElement` 를 쓰고, 그 요소가 곧 그룹 틀의
         기준점이다(위 dragArea 주석의 그 사정).
    ====================================================== */
    dragTarget: (!many && grip) ? grip : null,
    dragTargetSelf: true,

    /*
      조작 — 이동 하나만. **생성 시점에 켠다.**

      ★ 처음에 끄고 조건이 맞을 때 `moveable.draggable = true` 로
        켜는 길을 먼저 만들었다가 되돌렸다. 0.53.0 의 vanilla 래퍼는
        prop 마다 setter 를 두지만 그 setter 는 `setState` 이고,
        preact 의 setState 는 **렌더를 미룬다**. able 목록과 target
        gesto 는 그 렌더 뒤의 `_updateEvents()` 에서 만들어지므로,
        켠 직후에 누르면 pointer 리스너가 아직 없다 — 2026-09-21
        실측에서 `props.draggable` 은 true 인데 `targetGesto` 가
        없었고, 드래그가 **한 번도 시작되지 않았다**.

      ★ 켜 둔 채로 두어도 "고르지 않은 요소가 끌린다"가 생기지
        않는다. Moveable 의 target 은 언제나 **부모가 확정한 선택**
        이고, 그 위에서 dragStart 가 다시 dragGate() 를 지난다
        (거기서 false 를 돌려주면 0.53.0 은 그 자리에서 제스처를
        접는다 — 번들 실측). 관문이 한 곳이라 켜고 끄는 타이밍을
        추적할 일이 없다.
    */
    draggable: true,

    /* 움직임을 반올림하지 않는다 — 우리는 Moveable 의 translate 를
       쓰지 않고 clientX/clientY 를 직접 쓴다(§17-3) */
    throttleDrag: 0,
    throttleDragRotate: 0,

    preventClickEventOnDrag: true,

    /*
      HOME-CANVAS-TRANSFORM-1B — 리사이즈.

      ★ able 은 **처음부터 켠다**(위 draggable 의 그 사정과 같다).
        able 을 나중에 켜면 그 렌더 뒤에야 손잡이의 gesto 가 만들어
        지므로, 켠 직후에 누르면 제스처가 시작되지 않는다.

      ★ 켜고 끄는 것은 able 이 아니라 **손잡이 목록**이다
        (renderDirections). 그것은 그리기에만 쓰이므로 setState 의
        지연이 문제가 되지 않는다 — 여럿을 골랐을 때 빈 배열을 주면
        잡을 손잡이가 아예 없다(§18-1).

      ★ 자유 비율이다. Shift 비율 고정 · Alt 중심 확대 · flip 은
        이번 단계에 없다(계약 §18-2).
    */
    resizable: true,
    throttleResize: 0,
    keepRatio: false,
    renderDirections:
      (Array.isArray(target) && target.length > 1) ? [] : CANVAS_RESIZE_DIRECTIONS,

    /*
      HOME-CANVAS-TRANSFORM-1C — 회전.

      ★ able 은 여기서도 **처음부터 켠다**(위 resizable 의 그 사정).
        여닫는 것은 `rotationPosition` 이다 — `"none"` 이면 손잡이를
        아예 그리지 않으므로 그룹에서는 회전이 시작될 수 없다.

      ★ `rotatable` 을 **객체로** 준다. 0.53.0 의 Rotatable 은
        `Vo(props,"rotatable")` 로 자기 옵션을 읽는데, 그 함수는
        `props.rotatable` 이 객체가 아니면 **props 를 통째로** 본다
        (번들 실측). 그러면 우리가 리사이즈용으로 준
        `renderDirections` 여덟을 **회전용 손잡이 여덟**으로 한 번 더
        그려 버린다 — `.moveable-control[data-direction]` 이 열여섯이
        되고 손잡이 계산이 통째로 어긋난다. 객체 안에서 `false` 로
        덮어 그 길을 막는다.

      ★ 각도를 반올림하지 않는다(throttleRotate 0). 우리는 Moveable
        의 transform 을 쓰지 않고 `dist` 만 쓴다.
    */
    scalable: false,
    rotatable: { renderDirections: false },
    rotationPosition:
      (Array.isArray(target) && target.length > 1)
        ? CANVAS_ROTATION_POSITION_NONE
        : CANVAS_ROTATION_POSITION,
    throttleRotate: 0,
    rotateAroundControls: false,
    warpable: false,
    pinchable: false,
    clippable: false,
    roundable: false,
    snappable: false,
    edgeDraggable: false,

    /*
      ★ 그룹에서는 dragArea 를 끄지 않는다.

      단일 target 의 기본값은 false 이고 우리도 그것을 원한다.
      그런데 MoveableGroup 의 기본값은 **true** 이고, 그것을 false 로
      덮으면 그룹이 mount 중에 죽는다(0.53.0 실측: componentDidMount
      → _updateEvents → updateRect 에서 null.style). 그룹에는 붙일
      단일 target 이 없어 그 영역 요소가 곧 기준점이기 때문이다.

      그래도 클릭을 삼키지는 않는다 — `.moveable-area` 는 control box
      의 자식이고, 우리가 그 상자에 `pointer-events: none` 을 주므로
      상속받는다(그 속성은 상속된다).
    */
    dragArea: Array.isArray(target) && target.length > 1,

    passDragArea: false,

    /* 기준점 표시 — 손잡이 목록은 위 resizable 절에 있다 */
    origin: false,
    hideDefaultLines: false,

    /* 입력에 끼어들지 않는다 */
    checkInput: false,
    preventDefault: false,
    preventClickDefault: false,

    /* 따라가기는 아래 rAF 한 곳이 맡는다 — 관측기를 두 벌 두지
       않는다(어느 것이 갱신했는지 추적할 수 없게 된다) */
    useResizeObserver: false,
    useMutationObserver: false,

    zoom: 1,

    cspNonce: typeof nonce === "string" ? nonce : ""

  };

}


/* =========================================================
   createHomeCanvasSelectionFrame(options) -> controller

   options = {
     doc            : Document
     getRoot        : () => Element|null   렌더 컨테이너
     getNonce       : () => string         이 문서의 CSP nonce
     onActiveChange : (active, editId) => void
     onLayout       : ({ frames, blocks }) => void
                                            v2 프레임의 페이지 자리와
                                            블록의 그려진 높이
                                            (도화지 폭의 분수 — §28-3)
   }

   controller = {
     apply(payload)   부모가 확정한 선택
     onRender()       다시 그렸을 때(target DOM 재생성)
     isActive()
     debugState()     진단용 — 이 realm 안에서만 읽힌다
     dispose()
   }

   payload = { active, ids, primaryId, generation }
========================================================== */

export function createHomeCanvasSelectionFrame(options) {

  const opts =
    options || {};

  const doc =
    opts.doc || document;

  const win =
    doc.defaultView || window;


  const state = {

    disposed: false,

    /* Moveable · Selecto — 이 프레임에 **각각 최대 하나**다 */
    moveable: null,
    selecto: null,
    ctor: null,
    selectoCtor: null,

    /* 캔버스 편집이 켜져 있는가(선택이 없어도 참일 수 있다 —
       lasso 는 빈 상태에서 시작한다) */
    editing: false,

    /* 지금 틀이 붙어 있는 요소들. 부모가 승인한 canonical 순서
       그대로다 — 프레임이 다시 정렬하지 않는다. */
    targetIds: [],

    /* 부모가 매긴 선택 순번. 이보다 낮은 번호의 메시지는 이미
       지나간 선택이다(늦게 도착한 것). */
    generation: -1,

    /* 마지막으로 받은 payload — 재렌더 뒤 되살릴 때 쓴다 */
    lastPayload: null,

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 지금 그려 둔 손잡이의 지문
       (syncMoveableHandles). 같은 값을 다시 쓰지 않기 위한 것이다. */
    handleKey: "",

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 지금 고른 것이 흐름 블록인가
       ("block" 또는 null). 손잡이를 다시 그릴지 가르는 지문이다
       (계약 §29-4). */
    geometryMode: null,

    /* =====================================================
       HOME-CANVAS-MANUAL-UX-FIX-1 — 편집 chrome 의 여유
       (계약 §21-4)

       Moveable 에 준 `padding` 과 그 지문. **표시 전용**이고 저장
       geometry 에는 들어가지 않는다 — 지문을 들고 있는 것은 prop
       setter 가 setState 라 같은 값을 다시 쓰지 않기 위해서다.
    ====================================================== */
    chromePadding: null,
    chromePaddingKey: "",

    /* onActiveChange 로 마지막에 알린 값 */
    reported: false,

    /* 기다리는 중인 vendor 요청이 있는가(중복 호출 방지) */
    vendorPending: false,

    /* 이 프레임에서 lasso 를 몇 번 했는가 — 진단용 */
    lassoCount: 0,

    /* HOME-CANVAS-V2-ELEMENTS-1 — 마지막으로 올려보낸 프레임 자리의
       지문. 같은 값을 다시 보내지 않기 위한 것이고, 그래서 화면이
       그대로면 메시지도 0 이다. */
    layoutShape: "",

    /* 마지막 lasso 가 시작된 자리(도화지 안이었는가) */
    dragAllowed: false,

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 이동

       geometry  부모가 내려 준 **단일 선택 요소의 Canvas 좌표**.
                 프레임은 JSON 을 갖고 있지 않으므로 이 값 없이는
                 "무엇에서 얼마나 움직였는가"를 말할 수 없다.
                 DOM 의 백분율을 거꾸로 풀지 않는다 — 그 값은 이미
                 여섯 자리에서 잘린 것이라 되돌리면 원본이 아니다.

       drag      지금 진행 중인 제스처. 시작 시점의 clientX/Y 와
                 **시작 좌표**를 들고 있고, 매 프레임 그 시작값에
                 누적 이동량을 더한다(직전 프레임의 delta 를 계속
                 더하지 않는다 — §17-3).

       pending   확정을 올려보내고 답을 기다리는 중. 그동안 임시
                 위치를 유지하고 새 드래그를 받지 않는다.
    ====================================================== */

    geometry: null,
    geometryLog: [],
    drag: null,
    pending: null,
    pendingTimer: 0,

    /* 확정 요청마다 하나씩 오른다. 부모는 답에 이 번호를 달아
       돌려주고, 프레임은 **자기 번호와 같은 답**에만 반응한다 —
       좌표 메시지는 이 답 말고도 나오기 때문이다(계약 §17-8). */
    requestSeq: 0,

    /* 진단 — 마지막 이동이 어떻게 끝났는가 */
    moveCount: 0,
    lastMoveGate: "",
    lastCommit: null,
    lastSettle: "",

    /* 진단 — 마지막 드래그가 어디서 걸렸는가 · 몇 개를 잡았는가 */
    shiftPress: null,
    promoteAfter: 0,
    lastGate: "",
    lastProposed: null,
    lastProposedMode: "",
    lastHit: -1,
    lastSelectable: -1,

    listeners: [],

    /* 실패를 한 번만 적는다(중복 토스트 금지). 다시 시도하는 것
       자체는 막지 않는다 — 로더가 실패한 Promise 를 버리므로
       다음 선택에서 정상적으로 재시도된다. */
    loggedFailure: false,

    rafId: 0,
    signature: "",

    /* HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 이동 손잡이(계약 §30-2).
       문서 하나당 하나이고 control box 안에 산다. */
    moveGrip: null,

    /* 창 폭이 바뀐 뒤 프레임 자리 · 폭을 다시 재는 짧은 루프
       (계약 §30-3-1) */
    layoutRaf: 0,
    layoutSettle: 0

  };


  function renderRoot() {

    const el =
      (typeof opts.getRoot === "function") ? opts.getRoot() : null;

    return el || doc.body;

  }


  function frameNonce() {

    const value =
      (typeof opts.getNonce === "function") ? opts.getNonce() : "";

    return typeof value === "string" ? value : "";

  }


  /*
    elementFor(id)

    ★ 부모의 판정을 믿고 그리지 않는다.

    부모는 draft 의 Canvas 데이터에서 "그 id 가 있고 hidden 도
    locked 도 아니다"를 본다(studio/inspector/studio-canvas-selection.js
    studioCanvasSelectableElement). 여기서 보는 것은 **다른 것**이다 —
    "그 id 를 가진 캔버스 요소가 **지금 이 화면에** 실제로 그려져
    있는가". 둘 다 통과해야 틀이 붙는다.

    못 찾으면 null 이다. 비슷한 다른 요소로 바꿔 주지 않는다.
  */
  function elementFor(id) {

    if (typeof id !== "string" || !CANVAS_ELEMENT_ID_PATTERN.test(id)) {
      return null;
    }

    const container =
      renderRoot();

    if (!container || typeof container.querySelector !== "function") {
      return null;
    }

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 **블록**도 틀이 붙는다
       (계약 §29-4). 폭 손잡이를 달려면 Moveable 의 target 이 되어야
       하고, 잡을 것이 없는 블록에서는 틀 자체를 감춘다
       (markControlBox). lasso 후보는 지금도 자유 배치 요소뿐이다. */
    const el =
      container.querySelector(
        `[${CANVAS_ELEMENT_ATTR}][${CANVAS_EDIT_ID_ATTR}="${id}"],` +
        `[${CANVAS_BLOCK_ATTR}][${CANVAS_EDIT_ID_ATTR}="${id}"]`
      );

    return (el && el.isConnected) ? el : null;

  }


  /*
    HOME-CANVAS-V2-MANUAL-FIX-1 — 지금 붙어 있는 것이 흐름 블록인가
    (화면 기준). geometryIsBlock() 은 **부모가 뭐라고 했나**이고
    이것은 **무엇에 붙어 있나**다 — 좌표가 늦게 오거나 아예 오지
    않는 블록(예: align:"stretch")을 그 사이에 자유 요소처럼
    다루지 않기 위해 둘을 가른다.
  */
  function targetIsFlowBlock() {

    if (state.targetIds.length !== 1) {
      return false;
    }

    const el =
      elementFor(state.targetIds[0]);

    return !!(el && el.hasAttribute && el.hasAttribute(CANVAS_BLOCK_ATTR));

  }


  /* =========================================================
     HOME-CANVAS-SELECT-1B-2 — lasso 가 고를 수 있는 요소

     ★ 정확히 `[data-imory-canvas-element]` 만이다(§3).

     그래서 다음은 **애초에 후보가 아니다**: template 요소 ·
     사용자 JS 가 만든 꽃잎 · 파티클 · 효과 레이어 · Moveable 의
     control box · Selecto 자신의 사각형. 그것들에는 이 속성이
     없고, 이 속성은 저장 경계의 화이트리스트에 없어서 스킨 HTML
     에서 올 수도 없다(skin/skin-home-canvas-render.js 머리말).

     여기서 **더** 빼는 것은 셋이다.

       hidden          상자가 없어 사각형을 잴 수 없다
       locked          사용자가 "건드리지 않겠다"고 표시한 것
       도화지 밖        지금 렌더 루트 안에 없는 노드(재렌더 잔재)
  ========================================================== */

  function canvasRoot() {

    const container =
      renderRoot();

    return (container && typeof container.querySelector === "function")
      ? container.querySelector(`[${CANVAS_ROOT_ATTR}]`)
      : null;

  }


  function selectableElements() {

    const root =
      canvasRoot();

    if (!root) {
      return [];
    }

    return Array.prototype.filter.call(
      root.querySelectorAll(`[${CANVAS_ELEMENT_ATTR}]`),
      (el) =>
        el.isConnected &&
        !el.hasAttribute("hidden") &&
        el.getAttribute(CANVAS_LOCKED_ATTR) !== "true" &&
        CANVAS_ELEMENT_ID_PATTERN.test(el.getAttribute(CANVAS_EDIT_ID_ATTR) || "")
    );

  }


  /* 지금 붙어 있는 요소들. 하나라도 사라졌으면 null 을 그 자리에
     둔다 — 호출자가 "전부 살아 있는가"를 한 번에 본다. */
  function targetElements() {

    return state.targetIds.map((id) => elementFor(id));

  }


  function report(active) {

    const next =
      !!active;

    if (state.reported === next) {
      return;
    }

    state.reported = next;

    if (typeof opts.onActiveChange === "function") {

      try {
        opts.onActiveChange(next, next ? primaryId() : null);
      }
      catch (err) {
        /* 알림이 실패해도 틀은 그대로 둔다 */
      }

    }

  }


  /*
    primaryId()

    부모가 승인한 primary 다. 프레임이 스스로 고르지 않는다 —
    payload 의 primaryId 를 그대로 쓰고, 그것이 지금 목록에 없으면
    (있을 수 없지만) 첫 칸으로 떨어진다.
  */
  function primaryId() {

    const wanted =
      (state.lastPayload && typeof state.lastPayload.primaryId === "string")
        ? state.lastPayload.primaryId
        : null;

    if (wanted && state.targetIds.indexOf(wanted) !== -1) {
      return wanted;
    }

    return state.targetIds.length ? state.targetIds[0] : null;

  }


  /*
    실패 — 선택 자체는 부모가 그대로 갖고 있고, 화면에는 이 라운드
    이전의 축에 평행한 테두리가 남는다(부모 overlay · 프레임 안
    Inspector 테두리). 일반 Inspector 선택으로 바꾸지 않는다.
  */
  function fail(err) {

    if (!state.loggedFailure) {

      state.loggedFailure = true;

      console.warn(
        "[home-canvas-editor] 회전 선택 틀을 만들지 못했습니다 — " +
        "기존 테두리로 표시합니다.",
        err
      );

    }

    report(false);

  }


  /* =========================================================
     따라가기 — rAF 한 곳

     ResizeObserver 도 MutationObserver 도 켜지 않는다. 재는 값
     하나(요소의 사각형 + transform)가 바뀌었을 때만 updateRect()
     를 부른다. 스크롤 · 부모 scale · 늦게 온 이미지 · 글꼴 교체 ·
     `height:"auto"` 의 재조판이 전부 이 한 값에 나타난다.

     선택이 없으면 돌지 않는다.
  ========================================================== */

  /* =========================================================
     HOME-CANVAS-MANUAL-UX-FIX-1 — 편집 chrome 이 표시할 bounds
     (계약 §21-4)

     canvasEditChromePadding(el) -> {left,top,right,bottom} | null

     네 가지를 확실히 가른다.

       1. **저장되는 Canvas 상자**      x · y · width · height (JSON)
       2. **실제 보이는 content bounds** 아래에서 재는 자식들의 상자
       3. **편집 chrome 이 표시할 bounds** 1 ∪ 2 + 여유(이 함수의 답)
       4. **resize 확정에 쓰는 원래 geometry**  1 그대로

     3 만 Moveable 에게 준다. 0.53.0 의 `padding` prop 은
     `updateRenderPoses()` 에서 **renderPoses 와 renderLines 만**
     요소의 로컬 축 방향으로 밀고, `pos1`~`pos4` · `state.width` ·
     `state.height` 는 한 글자도 건드리지 않는다(번들 실측). 손잡이도
     그 renderPoses 위에 놓이고(`Vr()`), 회전 손잡이도 같다(`Ji()`).

     그래서 **저장 좌표 계산에 섞일 길이 없다** — dist · startRatio ·
     `drag.beforeTranslate` · `getRect()` 는 전부 pos 와 state 에서
     나온다. 고르기만 해도 JSON 이 불변이고, 여유를 넓혀도 이동 ·
     리사이즈의 변환량이 달라지지 않는다.

     ── 어떤 요소가 받는가 ────────────────────────────────
     **글자를 직접 보여 주는 것**뿐이다(text · category_nav · logo 의
     대체 글자). 사진 · 스티커 · 도형에서는 틀과 딱 붙은 테두리가
     오히려 맞다 — 그것이 그 요소의 실제 경계다. 프레임은 JSON
     type 을 모르므로 렌더러가 붙인 표식으로 가른다.

     ── 왜 재야 하는가 ────────────────────────────────────
     · `height:"auto"` 는 상자가 곧 내용이라 테두리가 글자에 **딱
       붙는다** → 여유가 필요하다.
     · 숫자 height 가 내용보다 작으면 내용이 **넘쳐 나간다** →
       그만큼 더 밀어야 선이 글자를 가로지르지 않는다.
     · 폭이 바뀌어 줄바꿈이 달라지면 내용 크기가 바뀐다 → 따라가기
       루프의 지문(signatureOf)에 이 값이 들어 있어 다시 잰다.

     자는 **offsetLeft/Top/Width/Height** 다 —
     `getBoundingClientRect()` 를 쓰지 않는다. 회전한 요소에서 그것은
     축에 정렬된 바깥 상자이고, 우리가 필요한 것은 요소 자기 축의
     넘침이다(§18-3 의 그 이유 그대로다).

     ★ 그 값은 **el 기준이 아니다** (HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1
       · 계약 §30-1). `offsetLeft/Top` 은 `offsetParent` 기준이고,
       `offsetParent` 는 **가장 가까운 위치 지정 조상**이다. v2 의
       흐름 블록은 `position: static` 이라 그 조상이 블록 자신이
       아니라 **도화지**이고, 그래서 자식의 `offsetTop` 이 "블록 안의
       자리"가 아니라 "도화지 위에서의 자리"로 들어왔다. 아래 union
       이 그 값을 그대로 넘침으로 읽어, 도화지 위쪽에 있는 블록일수록
       아래쪽 여유가 크게 잡혔다 — 글자를 고르면 파란 조작 틀이 그
       아래 메인 비주얼까지 뻗던 것이 이 한 줄이다(2026-09-22 실측:
       블록 높이 73, 자식 offsetTop 211 → 아래 여유 216).

       그래서 자식의 자리는 offsetParent 사슬을 **el 까지 되짚어**
       잰다. 값의 출처(offsetLeft/Top)는 그대로이므로 회전 요소에서
       "자기 축의 넘침"이라는 성질도 그대로다.
  ========================================================== */

  /*
    canvasChildOffsetWithin(el, child) -> { x, y } | null

    `child` 의 왼쪽 위가 `el` 의 왼쪽 위에서 얼마나 떨어져 있는가.

    두 요소가 같은 기준(`el.offsetParent`)까지 올라간 뒤 그 차이를
    본다 — `el` 자신이 위치 지정 요소라 사슬 안에 있어도(그때는
    `el.offsetLeft` 가 한 번 더해졌다가 그대로 빠진다), static 이라
    사슬이 `el` 을 건너뛰어도 같은 답이 나온다.

    사슬이 그 기준에 닿지 않으면(`position: fixed` 자식 등) null 이고,
    그런 자식은 넘침 계산에서 **빠진다** — 자리를 지어내지 않는다.
  */
  function canvasChildOffsetWithin(el, child) {

    const base =
      el.offsetParent || null;

    let node = child;
    let x = 0;
    let y = 0;
    let guard = 0;

    while (node && node !== base && guard < 64) {

      if (
        !Number.isFinite(node.offsetLeft) ||
        !Number.isFinite(node.offsetTop)
      ) {
        return null;
      }

      x += node.offsetLeft;
      y += node.offsetTop;

      node = node.offsetParent;
      guard += 1;

    }

    if (node !== base) {
      return null;
    }

    return {
      x: x - el.offsetLeft,
      y: y - el.offsetTop
    };

  }


  function canvasEditChromePadding(el) {

    if (!el || typeof el.querySelector !== "function") {
      return null;
    }

    if (!el.querySelector(CANVAS_TEXT_CONTENT_SELECTOR)) {
      return null;
    }

    const width =
      el.offsetWidth;

    const height =
      el.offsetHeight;

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }

    let left = 0;
    let top = 0;
    let right = width;
    let bottom = height;

    Array.prototype.forEach.call(
      el.children,
      (child) => {

        if (child.nodeType !== 1) {
          return;
        }

        /* el 의 왼쪽 위 기준 — offsetParent 기준이 아니다(위 ★) */
        const at =
          canvasChildOffsetWithin(el, child);

        if (!at) {
          return;
        }

        const cx = at.x;
        const cy = at.y;
        const cw = child.offsetWidth;
        const ch = child.offsetHeight;

        if (
          !Number.isFinite(cx) || !Number.isFinite(cy) ||
          !Number.isFinite(cw) || !Number.isFinite(ch)
        ) {
          return;
        }

        left = Math.min(left, cx);
        top = Math.min(top, cy);
        right = Math.max(right, cx + cw);
        bottom = Math.max(bottom, cy + ch);

      }
    );

    return {
      left: CANVAS_EDIT_CHROME_GAP + Math.max(0, -left),
      top: CANVAS_EDIT_CHROME_GAP + Math.max(0, -top),
      right: CANVAS_EDIT_CHROME_GAP + Math.max(0, right - width),
      bottom: CANVAS_EDIT_CHROME_GAP + Math.max(0, bottom - height)
    };

  }


  /* 그 여유를 Moveable 에 준다 — 값이 실제로 달라졌을 때만 쓴다
     (prop setter 는 setState 라 부를 때마다 렌더가 예약된다). */
  function applyEditChromePadding(elements) {

    if (!state.moveable) {
      return;
    }

    /* 여럿을 고르면 여유가 없다 — 그룹 틀에는 손잡이도 없고
       (§18-1) 그룹 조작은 아직 없다(계약 §21-5). */
    const padding =
      (elements && elements.length === 1)
        ? canvasEditChromePadding(elements[0])
        : null;

    const key =
      padding
        ? [padding.left, padding.top, padding.right, padding.bottom].join(",")
        : "";

    if (key === state.chromePaddingKey) {
      return;
    }

    state.chromePaddingKey = key;
    state.chromePadding = padding;

    try {
      state.moveable.padding = padding || {};
    }
    catch (err) {
      /* 여유가 없어도 틀은 그대로 둔다 */
    }

  }


  function signatureOf(elements) {

    return elements.map(
      (el) => {

        if (!el) {
          return "-";
        }

        const box =
          el.getBoundingClientRect();

        /* HOME-CANVAS-MANUAL-UX-FIX-1 — 내용 크기도 지문에 넣는다.

           줄바꿈 · 글꼴 교체 · 늦게 온 이미지로 **상자는 그대로인데
           내용만** 커지는 일이 있다(숫자 height 요소가 그렇다).
           바깥 상자만 보면 그때 chrome 여유가 옛 값에 머무르고
           선이 글자를 가로지른다(계약 §21-4). */
        const pad =
          canvasEditChromePadding(el);

        return [
          Math.round(box.left * 100),
          Math.round(box.top * 100),
          Math.round(box.width * 100),
          Math.round(box.height * 100),
          win.getComputedStyle(el).transform,
          pad ? `${pad.left}/${pad.top}/${pad.right}/${pad.bottom}` : "-"
        ].join(",");

      }
    ).join("|");

  }


  /*
    사용자 JS 가 요소를 움직여도(파티클 · 복합 모션) 이 한 값이
    바뀌므로 틀이 따라간다 — 막지 않는다(계약 §15-7-1).
  */
  function tick() {

    state.rafId = 0;

    if (state.promoteAfter > 0) {
      state.promoteAfter -= 1;
    }

    if (state.disposed || !state.moveable || !state.targetIds.length) {
      return;
    }

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 끄는 동안에는 재지 않는다.

       Moveable 은 제스처가 도는 동안 자기 control box 를 **자기
       계산으로** 그린다(우리가 target 에 transform 을 쓰지 않아도
       따라온다). 그 사이 우리가 updateRect() 를 부르면 그 계산의
       기준이 제자리에서 갈려 테두리가 요소와 어긋난다.

       우리가 옮기는 양과 Moveable 이 그리는 양은 둘 다 같은
       clientX/Y 차이에서 나오므로, 재지 않아도 둘은 붙어 있다.
    ====================================================== */
    if (state.drag) {
      state.rafId = win.requestAnimationFrame(tick);
      return;
    }

    /* =====================================================
       HOME-CANVAS-V2-MANUAL-FIX-1 — 손잡이 **목록**도 여기서 맞춘다
       (계약 §29-4)

       0.53.0 의 vanilla 래퍼는  대입을 미뤘다가 처리한다
       (2026-09-22 실측: 대입 직후 getTargets() 가 아직 비어 있다).
       그래서 "지금 붙어 있는 것이 블록인가"는 대입 그 자리에서
       물어볼 수 없고, 답이 실제로 정해지는 첫 프레임이 여기다.
       지문이 같으면 아무 일도 하지 않는다(syncMoveableHandles).
    ====================================================== */
    syncMoveableHandles();

    /* =====================================================
       HOME-CANVAS-INSPECTOR-COMPACT-1 — "붙었다"도 여기서 다시 본다

       위와 **같은 이유**다. attach() 의 report() 는 target 을 대입한
       그 자리에서 부르므로, 인스턴스가 이미 있던 경우에는 아직
       getTargets() 가 비어 있어 언제나 false 로 읽힌다(2026-09-23
       실측). 그 false 는 초기값과 같아 메시지가 나가지 않고, 다음에
       값이 정말 true 가 되어도 report() 를 부르는 곳이 없어 부모는
       **영영** 모른다 — 그러면 부모가 자기 축 평행 상자를 내리지
       않아 테두리가 둘이 된다(회전 요소에서는 어긋난 상자가 하나
       더 그려진다).

       인스턴스를 **그 자리에서 만든** 경우에는 생성자가 첫 target 을
       동기로 받으므로 attach() 의 report 가 맞았다 — 그래서 "빈 곳
       에서 곧바로 캔버스 요소를 고르는" 길에서만 우연히 맞았고,
       일반 요소를 거쳐 오는 길에서는 틀렸다.

       판정은 화면에 실제로 보이는가 하나이고(canvasFrameShouldShow),
       값이 그대로면 메시지는 나가지 않는다(report 의 지문).
    ====================================================== */
    report(canvasFrameShouldShow());

    /* HOME-CANVAS-TRANSFORM-1B — 손잡이 요소는 방향 목록이 바뀔 때
       새로 만들어진다. 우리가 되돌려 준 hit area 를 그때 잃지 않게
       매 프레임 다시 쓴다(여덟 노드 — 위 markResizeHandles) */
    markResizeHandles(controlBoxElement());

    /* HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 이동 손잡이는 `nw` 손잡이
       에서 자리를 잰다(계약 §30-2). 그 손잡이가 방금 새로 만들어
       졌을 수 있으므로 같은 프레임에서 함께 맞춘다. */
    syncMoveGrip(controlBoxElement());

    /* =====================================================
       HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 프레임의 자리 · **폭**도
       따라가기 루프에서 다시 본다(계약 §30-3).

       V2-ELEMENTS-1 의 보고는 선택이 바뀔 때와 관문 뒤에만 나갔다.
       자리와 높이는 **도화지 폭의 분수**라 창 폭이 바뀌어도 값이
       그대로였기 때문이다. 데스크톱 최대 폭이 생기면서 프레임의
       폭만은 그렇지 않다 — 도화지가 넓어지면 그 분수는 작아진다.
       그래서 화면이 달라질 수 있는 매 프레임에서 다시 잰다.

       ★ 값이 그대로면 메시지는 나가지 않는다(layoutShape 지문).
    ====================================================== */
    reportLayout();

    const elements =
      targetElements();

    if (elements.some((el) => !el)) {

      /* 재렌더 · 삭제로 하나라도 사라졌다 — 마지막 payload 를 같은
         관문에 다시 태운다(살아 있는 것만 남는다) */
      apply(state.lastPayload);

      return;

    }

    const next =
      signatureOf(elements);

    if (next !== state.signature || !sameTargets(elements)) {
      state.signature = next;
      setMoveableTarget(elements);
    }

    state.rafId =
      win.requestAnimationFrame(tick);

  }


  /* Moveable 이 지금 들고 있는 것이 이 요소들 그대로인가 */
  function sameTargets(elements) {

    const current =
      (state.moveable && typeof state.moveable.getTargets === "function")
        ? state.moveable.getTargets()
        : [];

    if (!current || current.length !== elements.length) {
      return false;
    }

    return elements.every((el, i) => current[i] === el);

  }


  function startFollow() {

    if (state.rafId || state.disposed) {
      return;
    }

    state.rafId =
      win.requestAnimationFrame(tick);

  }


  function stopFollow() {

    if (!state.rafId) {
      return;
    }

    win.cancelAnimationFrame(state.rafId);

    state.rafId = 0;

  }


  /* =========================================================
     붙이기 / 걷기

     ★ 인스턴스는 프레임당 최대 하나다. 다른 요소로 옮길 때는
       **만들지 않고 target 만 갱신**한다(§8).
  ========================================================== */

  /*
    ★ 테두리가 클릭을 삼키지 않게 한다.

    control box 자체는 1×1 이지만 네 줄(.moveable-line)은 요소 외곽
    위에 놓인다. 조작 able 이 전부 꺼져 있어 저 줄들에 리스너는
    없지만, pointer 대상이기는 하다 — 그대로 두면 요소의 테두리를
    정확히 누른 클릭이 스킨 DOM 에 닿지 않아 "가끔 선택이 안 된다"가
    된다.

    CSSOM 으로 쓰는 인라인 값은 CSP 의 style-src 검사를 받지 않는다
    (검사 대상은 마크업의 style **속성**이다). Moveable 자신도 같은
    방식으로 control box 에 좌표를 쓴다.

    ★ 단일 ↔ 그룹을 오갈 때 control box 요소가 **새로 만들어진다**
      (0.53.0 은 key 가 "single" 과 "group" 으로 갈린다 — 번들 실측).
      그래서 target 을 바꿀 때마다 다시 표시한다.
  */
  /*
    HOME-CANVAS-V2-MANUAL-FIX-1 — 지금 선택에 맞는 손잡이
    (계약 §29-4)

    setMoveableTarget 안의 그 두 줄과 **같은 규칙**이다. 여기서만
    다시 부를 수 있게 뺐다 — 좌표가 선택보다 늦게 오기 때문이다.
  */
  /*
    HOME-CANVAS-V2-MANUAL-FIX-1 — 단독 선택에 그릴 손잡이(계약 §29-4)

      자유 배치 요소   여덟
      흐름 블록        좌우 둘 — 부모가 폭의 자를 내려 줬을 때만
      그 밖             없음(그때는 틀 자체를 감춘다)
  */
  function canvasHandleDirections() {

    if (!targetIsFlowBlock()) {
      return CANVAS_RESIZE_DIRECTIONS;
    }

    return geometryIsBlock() ? CANVAS_WIDTH_DIRECTIONS : [];

  }


  /*
    틀을 보일 것인가 — "잡을 것이 없으면 틀도 없다"(§27)를 블록까지
    넓힌 판정이다. 폭을 잡을 수 없는 블록에서는 부모의 축 평행
    테두리가 그대로 그 자리를 지킨다.
  */
  function canvasFrameShouldShow() {

    if (!moveableHasTarget()) {
      return false;
    }

    return !(targetIsFlowBlock() && !geometryIsBlock());

  }


  function syncMoveableHandles() {

    if (!state.moveable || !moveableHasTarget()) {
      state.handleKey = "";
      return;
    }

    const many =
      state.targetIds.length > 1;

    /* 지금 그려야 하는 손잡이의 지문. 값이 그대로면 아무것도 하지
       않는다 — prop setter 는 setState 라 부를 때마다 렌더가
       예약된다(applyEditChromePadding 과 같은 이유). */
    const key =
      `${many ? "many" : "one"}|${targetIsFlowBlock() ? "block" : "free"}` +
      `|${geometryIsBlock() ? "sized" : "plain"}`;

    if (key === state.handleKey) {
      return;
    }

    state.handleKey = key;

    try {

      state.moveable.renderDirections =
        many ? [] : canvasHandleDirections();

      state.moveable.rotationPosition =
        (many || targetIsFlowBlock())
          ? CANVAS_ROTATION_POSITION_NONE
          : CANVAS_ROTATION_POSITION;

      /* ★ prop 만 바꾸면 손잡이는 다시 그려지지 않는다. 0.53.0 의
         vanilla 래퍼는 prop setter 를 setState 로 미루고, 손잡이
         요소는 그 다음 렌더에서 만들어진다 — setMoveableTarget 에서는
         바로 뒤의 target 대입이 그 렌더를 일으키지만 여기서는 우리가
         일으켜야 한다(2026-09-22 실측: 이 줄이 없으면 블록을 골라도
         손잡이가 0 개였다). */
      if (typeof state.moveable.forceUpdate === "function") {
        state.moveable.forceUpdate();
      }

      state.moveable.updateRect();

      markControlBox();

    }
    catch (err) {
      /* 손잡이를 못 바꿔도 틀은 그대로다 — 제스처는 관문이 막는다 */
    }

  }


  function markControlBox() {

    const box =
      (state.moveable && typeof state.moveable.getControlBoxElement === "function")
        ? state.moveable.getControlBoxElement()
        : null;

    if (!box) {
      return;
    }

    /* =====================================================
       ★ 앞서 표시해 둔 상자가 남아 있으면 걷는다.

       단일 ↔ 그룹 전환에서 control box 요소가 새로 만들어지는데,
       그때 **옛 요소가 문서에 남는 경우**가 있다(0.53.0 실측).
       그대로 두면 "인스턴스가 둘"로 보이고, 더 나쁘게는 옛 자리에
       테두리가 하나 더 남는다.

       우리가 붙인 표시만 걷고 화면에서 감춘다 — 라이브러리가 아직
       들고 있을지 모르는 요소를 DOM 에서 지우지는 않는다.
    ====================================================== */

    Array.prototype.forEach.call(
      doc.querySelectorAll('[data-imory-canvas-frame="1"]'),
      (stale) => {

        if (stale === box) {
          return;
        }

        stale.removeAttribute("data-imory-canvas-frame");
        stale.style.display = "none";

      }
    );

    box.style.pointerEvents = "none";

    box.setAttribute("data-imory-canvas-frame", "1");

    /* =====================================================
       HOME-CANVAS-V2-ADD-1 — **잡을 것이 없으면 틀도 보이지 않는다**

       Moveable 0.53.0 은 target 이 null 이어도 control box 를 만든다.
       v2 의 자동 배치 블록은 자유 배치 요소가 아니라 target 이
       될 수 없고(§26-8), 그래서 블록을 고르면 **끌어도 아무 일이
       없는 손잡이 여덟**이 화면에 남아 있었다.

       ★ 판정은 "지금 Moveable 이 무엇을 들고 있는가" 하나다 —
         v2 인지 블록인지 묻지 않는다. 들고 있는 것이 없으면
         그 틀로 할 수 있는 일도 없다(해제 · 소유권이 넘어간
         경우도 같다). v1 요소 · v2 프레임 내부 요소 · overlay 는
         target 이 있으므로 지금까지 그대로다.

       ★ 인라인 값은 CSSOM 으로 쓴다 — CSP 의 style-src 검사
         대상이 아니다(위 markControlBox 머리말과 같은 이유).
    ====================================================== */
    box.style.display =
      canvasFrameShouldShow() ? "" : "none";

    markResizeHandles(box);

    syncMoveGrip(box);

  }


  /* =========================================================
     HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 이동 손잡이(계약 §30-2)

     ensureMoveGrip()  문서 하나당 하나. Moveable 을 만들기 **전에**
                       만들어 `dragTarget` 으로 넘긴다 — prop setter
                       는 setState 라 나중에 넘기면 그 렌더 뒤에야
                       gesto 가 붙는다(위 draggable 의 그 사정).

     syncMoveGrip(box) control box 안에 두고 자리를 맞춘다. 끌 수 없는
                       상태에서는 감춘다 — 잡아도 아무 일이 없는
                       손잡이를 남기지 않는다(§27-6 과 같은 판정).

     ★ 자리는 `nw` 손잡이에서 잰다. 그 손잡이는 이미 회전과
       chrome 여유(§21-4)를 따라 움직이므로, 여기서 renderPoses 를
       다시 풀지 않아도 언제나 선택 틀의 왼쪽 위 바깥이다.

     ★ 인라인 값은 CSSOM 으로 쓴다 — CSP 의 style-src 검사 대상이
       아니다(위 markControlBox 머리말과 같은 이유).
  ========================================================== */

  function ensureMoveGrip() {

    if (state.moveGrip || state.disposed) {
      return state.moveGrip;
    }

    const grip =
      doc.createElement("div");

    grip.setAttribute(CANVAS_MOVE_GRIP_ATTR, "1");
    grip.setAttribute("aria-hidden", "true");
    grip.title = "이동";

    const px = (n) => `${n}px`;

    grip.style.setProperty("position", "absolute");
    grip.style.setProperty("left", "0");
    grip.style.setProperty("top", "0");
    grip.style.setProperty("width", px(CANVAS_MOVE_GRIP_SIZE));
    grip.style.setProperty("height", px(CANVAS_MOVE_GRIP_SIZE));
    grip.style.setProperty("box-sizing", "border-box");
    grip.style.setProperty("border-radius", "5px");
    grip.style.setProperty("background", "var(--moveable-color, #4af)");
    grip.style.setProperty("border", "2px solid #fff");
    grip.style.setProperty("box-shadow", "0 1px 3px rgba(0,0,0,0.35)");
    grip.style.setProperty("cursor", "move");
    grip.style.setProperty("touch-action", "none");
    grip.style.setProperty("display", "none");

    /* control box 는 `pointer-events: none` 이고 그 값은 상속된다 —
       손잡이만 되돌려 받는다(markResizeHandles 와 같다) */
    grip.style.setProperty("pointer-events", "auto");

    state.moveGrip = grip;

    return grip;

  }


  function hideMoveGrip() {

    if (state.moveGrip) {
      state.moveGrip.style.setProperty("display", "none");
    }

  }


  function syncMoveGrip(box) {

    const grip =
      state.moveGrip;

    if (!grip) {
      return;
    }

    /* 끌 수 없는 상태 · 흐름 블록 · 여럿 선택에는 손잡이가 없다.
       블록은 순서와 정렬이 자리를 정하므로 애초에 끌지 않는다
       (§29-4), 그룹 조작은 아직 없다(§21-5). */
    if (
      !box ||
      state.targetIds.length !== 1 ||
      geometryIsBlock() ||
      !canvasFrameShouldShow() ||
      dragGate() !== "ok"
    ) {
      hideMoveGrip();
      return;
    }

    const anchor =
      box.querySelector('.moveable-control[data-direction="nw"]');

    if (!anchor) {
      hideMoveGrip();
      return;
    }

    if (grip.parentElement !== box) {
      box.appendChild(grip);
    }

    const boxRect =
      box.getBoundingClientRect();

    const anchorRect =
      anchor.getBoundingClientRect();

    if (!anchorRect.width && !anchorRect.height) {
      hideMoveGrip();
      return;
    }

    const x =
      (anchorRect.left + anchorRect.width / 2) - boxRect.left
        - CANVAS_MOVE_GRIP_OFFSET;

    const y =
      (anchorRect.top + anchorRect.height / 2) - boxRect.top
        - CANVAS_MOVE_GRIP_OFFSET;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      hideMoveGrip();
      return;
    }

    grip.style.setProperty(
      "transform",
      `translate(-50%, -50%) translate(${Math.round(x)}px, ${Math.round(y)}px)`
    );

    grip.style.setProperty("display", "block");

  }


  /* =========================================================
     markResizeHandles(box) — 손잡이만 다시 잡을 수 있게 한다

     ★ control box 는 `pointer-events: none` 이다(위 markControlBox).

     그 값은 상속되므로 손잡이도 함께 꺼진다 — 0.53.0 의 `.control`
     규칙에는 pointer-events 가 아예 없어서 부모 값을 그대로 받는다
     (번들 실측). 그래서 리사이즈 손잡이에만 `auto` 를 되돌려 준다.

     테두리 네 줄(`.moveable-line`) · 회전 손잡이의 막대
     (`.moveable-rotation-line`) · 그룹의 `.moveable-area` 는 그대로
     꺼 둔다 — 요소의 가장자리를 정확히 누른 클릭이 스킨 DOM 에
     닿아야 하고, 그 자리는 여전히 "이 요소를 고른다"다.

     ★ CSSOM 으로 쓰는 인라인 값은 CSP 의 style-src 검사를 받지
       않는다(검사 대상은 마크업의 style **속성**이다). 우리 몫의
       `<style>` 을 새로 만들지 않는다.

     ★ 매 렌더마다 다시 해야 한다. preact 는 vnode 의 style 만
       되돌리므로 우리가 따로 쓴 이 칸은 지워지지 않지만, 손잡이
       **요소 자체**는 방향 목록이 바뀔 때 새로 만들어진다. 그래서
       target 이 바뀔 때(markControlBox)와 따라가기 루프(tick) 둘
       다에서 부른다 — 여덟 노드이고 이미 그 루프가 요소마다
       getBoundingClientRect 를 재고 있다.
  ========================================================== */

  function markResizeHandles(box) {

    if (!box) {
      return 0;
    }

    const handles =
      box.querySelectorAll(".moveable-control[data-direction]");

    Array.prototype.forEach.call(handles, (handle) => {
      handle.style.pointerEvents = "auto";
    });

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1C — 회전 손잡이도 같은 사정이다.

       ★ 되돌려 주는 것은 **손잡이 하나**다. 그것을 매달고 있는
         막대(`.moveable-rotation-line`)와 그 감싸개는 그대로 꺼
         둔다 — 요소 위쪽의 그 띠가 입력을 먹으면 바로 밑의 스킨
         DOM 을 누를 수 없게 된다.

       ★ 회전 손잡이에는 `data-direction` 이 **없다**(0.53.0 실측:
         class 가 `control rotation-control` 뿐이다). 그래서 위
         리사이즈 손잡이 셈에 섞이지 않는다.
    ====================================================== */
    Array.prototype.forEach.call(
      box.querySelectorAll(".moveable-rotation-control"),
      (handle) => {
        handle.style.pointerEvents = "auto";
      }
    );

    return handles.length;

  }


  /*
    Moveable 이 지금 **실제로** 들고 있는 것이 있는가.

    ★ 우리가 마지막으로 넘긴 목록(state.targetIds)이 아니라
      라이브러리에게 묻는다. 그 둘이 갈리는 자리가 바로 이
      문제였다 — 부모는 블록 하나를 골랐다고 하는데 이 문서에는
      그 id 를 가진 **캔버스 요소**가 없어서 target 은 null 이다.
  */
  function moveableHasTarget() {

    if (!state.moveable) {
      return false;
    }

    try {

      const targets =
        (typeof state.moveable.getTargets === "function")
          ? state.moveable.getTargets()
          : null;

      return !!(targets && targets.length);

    }
    catch (err) {
      return false;
    }

  }


  function controlBoxElement() {

    return (state.moveable && typeof state.moveable.getControlBoxElement === "function")
      ? state.moveable.getControlBoxElement()
      : null;

  }


  /*
    resizeHandleNodes(hitOnly)

    이 문서에서 **실제로 화면에 있는** 리사이즈 손잡이들. 진단이
    쓴다(위 debugState 의 ★ 주석 — DOM 에 남아 있는 것과 잡을 수
    있는 것은 다르다).
  */
  function resizeHandleNodes(hitOnly) {

    return visibleHandleNodes(".moveable-control[data-direction]", hitOnly);

  }


  /*
    rotationHandleNodes(hitOnly)

    HOME-CANVAS-TRANSFORM-1C — 회전 손잡이도 같은 자로 센다. 여럿을
    골랐을 때 "회전 손잡이가 없다"는 노드 수가 아니라 **화면에
    실제로 있는 것**으로 물어야 참이 된다(위 ★ 주석).
  */
  function rotationHandleNodes(hitOnly) {

    return visibleHandleNodes(".moveable-rotation-control", hitOnly);

  }


  function visibleHandleNodes(selector, hitOnly) {

    return Array.prototype.filter.call(
      doc.querySelectorAll(selector),
      (handle) => {

        if (!handle.getClientRects || handle.getClientRects().length === 0) {
          return false;
        }

        return hitOnly
          ? win.getComputedStyle(handle).pointerEvents !== "none"
          : true;

      }
    );

  }


  /*
    setMoveableTarget(elements)

    0개  → 틀 없음(target null)
    1개  → SELECT-1B-1 의 회전을 따라가는 단일 틀
    2개~ → Moveable 그룹 틀 하나

    ★ 0.53.0 은 `target` 에 **배열**을 받으면 스스로 그룹으로 간다
      (번들의 render: 평탄화한 길이가 1보다 크면 MoveableGroup).
      그래서 우리가 그룹 클래스를 직접 고르지 않는다.

    ★ 그룹에서는 `dragArea` 를 켠 채로 둔다 — 끄면 그룹이 mount
      중에 죽는다(displayOnlyMoveableOptions 의 주석). 그 영역이
      클릭을 삼키지 않는 것은 control box 의 `pointer-events: none`
      이 상속되기 때문이다.
  */
  /*
    ensureMoveable(first)

    ★ 첫 생성은 **반드시 단일 target** 이다.

    Moveable 의 <style> 은 첫 mount 때 한 번 주입되는데, 그 첫
    mount 가 그룹이면 nonce 가 붙지 않아 sandbox 의 style-src 에
    막힌다(2026-09-21 실측: Selecto 의 style 은 통과하고 Moveable 의
    것만 `nonce` 속성 없이 `sheet === null`). 그래서 여러 개를 한
    번에 고른 경우에도 **첫 요소 하나로 세운 뒤** 곧바로 배열로
    바꾼다 — 그때는 이미 붙은 style 을 함께 쓴다.

    고른 것이 없으면 아예 만들지 않는다. 그릴 것이 없으니 만들
    이유도 없고, "인스턴스는 최대 하나"도 그대로 지켜진다.
  */
  /* =========================================================
     pinEditorStyleSheets()

     ★ nonce 가 붙은 채로 들어간 <style> 을 **지워지지 않게** 못박는다.

     Moveable · Selecto 가 함께 쓰는 styled 헬퍼는 같은 규칙표를
     `<style data-styled-id data-styled-count>` 하나로 공유하고,
     컴포넌트가 mount 할 때 count 를 올리고 unmount 할 때 내린다.
     **0 이 되면 그 요소를 DOM 에서 지운다.**

     그런데 단일 target ↔ 그룹 target 전환은 컴포넌트를 통째로
     갈아 끼운다. 그 사이에 count 가 0 을 찍으면 규칙표가 지워지고,
     곧바로 이어지는 그룹 쪽 주입이 **nonce 없이** 새로 만든다 —
     sandbox 의 `style-src` 가 그것을 막아 선택 틀이 통째로
     무너진다(2026-09-21 실측: `nonce` 속성 없음 · `sheet === null`).

     CSP 는 **삽입 시점에** 판정하므로 나중에 nonce 를 붙여도
     되살아나지 않는다. 그래서 되살리는 대신 **처음부터 지워지지
     않게** 한다 — 이미 nonce 를 달고 정상으로 들어간 그 요소의
     count 를 크게 올려 둔다.

     ★ CSP 를 넓히지 않는다. style 을 새로 만들지도, 나중에 주입하지도
       않는다. 우리가 만든 요소 하나의 수명을 늘릴 뿐이다.
  ========================================================== */

  /* style 주입은 effect 라 만든 **직후**에는 아직 없다 — 다음 두
     프레임에 걸쳐 한 번씩 확인한다. */
  function pinEditorStyleSheetsSoon() {

    win.requestAnimationFrame(() => {
      pinEditorStyleSheets();
      win.requestAnimationFrame(pinEditorStyleSheets);
    });

  }


  function pinEditorStyleSheets() {

    try {

      Array.prototype.forEach.call(
        doc.querySelectorAll("style[data-styled-id]"),
        (el) => {

          /* 정상으로 들어간 것만 — 이미 막힌 것을 못박아 봐야
             소용이 없다(sheet 가 null 이다) */
          if (!el.sheet || el.getAttribute("data-imory-canvas-pinned")) {
            return;
          }

          el.setAttribute("data-styled-count", String(STYLE_PIN_COUNT));
          el.setAttribute("data-imory-canvas-pinned", "1");

        }
      );

    }
    catch (err) {
      /* 못박지 못해도 단일 선택은 그대로 동작한다 */
    }

  }


  function ensureMoveable(first) {

    if (state.moveable || !state.ctor || state.disposed || !first) {
      return false;
    }

    try {

      state.moveable =
        new state.ctor(
          doc.body,
          displayOnlyMoveableOptions(first, frameNonce(), ensureMoveGrip())
        );

      /* HOME-CANVAS-TRANSFORM-1A · 1B — 옵션이 아니라 여기서 건다
         (위 displayOnlyMoveableOptions 의 ★ 주석) */
      state.moveable.on("dragStart", onCanvasDragStart);
      state.moveable.on("drag", onCanvasDrag);
      state.moveable.on("dragEnd", onCanvasDragEnd);

      state.moveable.on("resizeStart", onCanvasResizeStart);

      /* HOME-CANVAS-MANUAL-UX-FIX-1 — 모서리 비율 유지는 크기가
         확정되기 전 이 한 자리에서 끼어든다(계약 §21-2) */
      state.moveable.on("beforeResize", onCanvasBeforeResize);

      state.moveable.on("resize", onCanvasResize);
      state.moveable.on("resizeEnd", onCanvasResizeEnd);

      state.moveable.on("rotateStart", onCanvasRotateStart);
      state.moveable.on("rotate", onCanvasRotate);
      state.moveable.on("rotateEnd", onCanvasRotateEnd);

      /*
        ★ 여기서 한 번 **flush** 한다.

        0.53.0 은 렌더를 미뤘다가 한꺼번에 한다(vanilla wrapper 가
        dragStart 에서 `$_timer && forceUpdate()` 를 하는 것과 같은
        사정이다). 그래서 만들자마자 같은 tick 에서 target 을 배열로
        바꾸면 **단일 mount 가 한 번도 일어나지 않고** 곧바로 그룹이
        mount 된다 — 그리고 그 경로의 첫 style 주입에는 nonce 가
        붙지 않는다(2026-09-21 sandbox 실측).

        먼저 단일로 한 번 그려 두면 style 이 nonce 와 함께 붙고,
        뒤에 그룹으로 바뀌어도 그 style 을 함께 쓴다.
      */
      if (typeof state.moveable.forceUpdate === "function") {
        state.moveable.forceUpdate();
      }

      markControlBox();

      pinEditorStyleSheetsSoon();

      return true;

    }
    catch (err) {

      state.moveable = null;

      fail(err);

      return false;

    }

  }


  function setMoveableTarget(elements) {

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 끄는 동안 같은 target 을 다시
       잡지 않는다.

       sandbox 에서는 끌기 시작과 거의 동시에 "같은 것을 골랐다"가
       한 번 더 내려온다(위 apply 의 함정 주석). 그때 updateRect()
       를 부르면 Moveable 이 제스처 도중에 기준을 다시 재어 테두리가
       요소와 어긋난다 — tick 이 끄는 동안 재지 않는 것과 같은
       이유다.
    ====================================================== */
    if (state.drag && state.moveable && sameTargets(elements)) {
      markControlBox();
      return true;
    }

    try {

      const target =
        elements.length === 0
          ? null
          : (elements.length === 1 ? elements[0] : elements.slice());

      const created =
        ensureMoveable(elements[0] || null);

      if (!state.moveable) {

        /* 아직 고른 것이 없으면 인스턴스를 만들지 않는다 —
           그릴 것이 없으니 만들 이유도 없다 */
        return elements.length === 0;

      }

      /*
        ★ 방금 만들었고 여러 개를 골랐다면, 그룹 승격을 **다음
          프레임으로 미룬다.**

        0.53.0 은 렌더를 미뤘다가 한다. 만들자마자 같은 tick 에서
        target 을 배열로 바꾸면 단일 mount 가 한 번도 일어나지
        않고 곧바로 그룹이 mount 되는데, 그 경로의 첫 style 주입에는
        nonce 가 붙지 않아 sandbox 의 style-src 에 막힌다
        (2026-09-21 실측 — 단일로 먼저 그려지면 정상이다).

        미뤄도 화면은 한 프레임 안에 맞는다 — 바로 뒤의 따라가기
        루프(tick)가 target 이 다르다는 것을 보고 그때 그룹으로
        올린다.
      */
      if (created) {

        /* 두 프레임을 준다 — 0.53.0 의 style 주입은 preact 의
           effect 이고, 그것은 렌더 **뒤**에 따로 돈다. 한 프레임만
           기다리면 아직 안 돌았을 수 있다. */
        state.promoteAfter = 2;

      }

      if (state.promoteAfter > 0 && elements.length > 1) {

        applyEditChromePadding(elements);

        markControlBox();

        return true;

      }

      /* ★ dragArea 는 target 이 바뀔 때마다 다시 정한다 — 단일과
         그룹의 요구가 다르다(위 주석). */
      state.moveable.dragArea =
        Array.isArray(target) && target.length > 1;

      /* HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 이동 손잡이도 같은
         자리에서 갈린다. 그룹에서는 `areaElement` 가 기준이어야
         하므로 넘기지 않는다(계약 §30-2). */
      state.moveable.dragTarget =
        (Array.isArray(target) && target.length > 1)
          ? null
          : ensureMoveGrip();

      /* =====================================================
         HOME-CANVAS-TRANSFORM-1B — 손잡이는 **단독 선택에만** 있다.

         그룹 이동 · 그룹 리사이즈는 이번 단계에 없다(계약 §18-13).
         able 을 끄는 대신 방향 목록을 비운다 — able 을 나중에 켜면
         그 렌더 뒤에야 gesto 가 생긴다는 그 함정이 여기에도 있고,
         방향 목록은 그리기에만 쓰이므로 안전하다. 잡을 손잡이가
         아예 없으니 그룹에서는 리사이즈가 시작될 수 없다.
      ====================================================== */
      /* HOME-CANVAS-V2-MANUAL-FIX-1 — 손잡이는 아래 target 대입
         **뒤에** 한 곳에서 정한다(syncMoveableHandles). 여기서 미리
         적어 두면 그 지문이 실제로 그려진 것과 어긋난다. */
      state.handleKey = "";

      state.moveable.renderDirections =
        (Array.isArray(target) && target.length > 1)
          ? []
          : canvasHandleDirections();

      /* HOME-CANVAS-TRANSFORM-1C — 회전 손잡이도 **단독 선택에만**
         있다. 그릴 자리를 `"none"` 으로 주면 손잡이가 아예 만들어
         지지 않는다(위 displayOnlyMoveableOptions 의 ★ 주석). */
      state.moveable.rotationPosition =
        (Array.isArray(target) && target.length > 1 || targetIsFlowBlock())
          ? CANVAS_ROTATION_POSITION_NONE
          : CANVAS_ROTATION_POSITION;

      /* HOME-CANVAS-MANUAL-UX-FIX-1 — 표시할 bounds 는 여기서
         한 번만 정한다(계약 §21-4). target 과 같은 자리에 두어
         "틀이 옮겨갔는데 여유는 앞 요소의 것"이 생기지 않게 한다. */
      applyEditChromePadding(elements);

      state.moveable.target = target;
      state.moveable.updateRect();

      /* HOME-CANVAS-V2-MANUAL-FIX-1 — target 이 정해진 **뒤에**
         손잡이를 정한다. 블록인지 아닌지는 지금 붙은 요소가
         정하고(targetIsFlowBlock), 그 요소는 이 줄 위에서 정해진다. */
      syncMoveableHandles();

      markControlBox();

    }
    catch (err) {

      fail(err);

      return false;

    }

    return true;

  }


  function attach(elements) {

    if (!state.ctor) {
      return false;
    }

    if (!setMoveableTarget(elements)) {
      return false;
    }

    state.signature =
      signatureOf(elements);

    syncSelectoSelection(elements);

    /* HOME-CANVAS-TRANSFORM-1A — 조건이 맞으면 여기서 이동이 켜진다.
       맞지 않으면(여럿 · 좌표 없음 · 잠김) 꺼진 채로 테두리만 남는다. */
    syncDraggable();

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 무엇을 골랐는지 정해진 **뒤에**
       한 번 더 보고한다(계약 §29-6). apply() 의 보고는 관문 바로
       뒤라 그때의 targetIds 는 아직 **앞 선택**이고, "고른 요소가
       물려받고 있는 모양"은 그 값으로 정해지기 때문이다. 값이
       그대로면 메시지는 나가지 않는다. */
    reportLayout();

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 틀을 감춘 선택에서는 "붙었다"고
       하지 않는다(계약 §29-4). 그 말을 들은 부모는 자기 축 평행
       테두리를 내리므로, 감춘 틀과 함께 화면에 아무 테두리도 남지
       않는다 — 폭을 잡을 수 없는 블록이 그 경우다. */
    report(canvasFrameShouldShow());

    startFollow();

    return true;

  }


  /*
    걷기 — 인스턴스는 남기고 target 만 푼다.

    Moveable 0.53.0 은 target 이 없으면 control box 를
    `display:none` 으로 렌더한다(render() 의 display 판정). 그래서
    인스턴스를 없앴다 만들었다 하지 않아도 화면에서 확실히 사라지고,
    다시 고를 때 요청도 생성도 새로 하지 않는다.
  */
  function detach() {

    cancelDrag("detach");

    stopFollow();

    state.targetIds = [];
    state.signature = "";

    if (state.moveable) {

      /* HOME-CANVAS-MANUAL-UX-FIX-1 — 다음에 고른 것이 사진이면
         앞 요소의 글자 여유가 남아 있어서는 안 된다(계약 §21-4) */
      applyEditChromePadding([]);

      try {
        state.moveable.target = null;
        state.moveable.updateRect();
      }
      catch (err) {
        /* 이미 무너진 인스턴스다 — 아래에서 알림만 맞춘다 */
      }

      /* HOME-CANVAS-V2-ADD-1 — 0.53.0 의 display 판정에 기대지
         않고 여기서도 한 번 확실히 감춘다(위 markControlBox 의 ★) */
      markControlBox();

    }

    syncSelectoSelection([]);

    report(false);

  }


  /* =========================================================
     HOME-CANVAS-TRANSFORM-1A — 단일 요소 이동

     ★ 이 프레임은 Canvas JSON 을 갖고 있지 않다.

     그래서 "지금 몇이냐"를 스스로 알 수 없다. DOM 에 적힌 백분율을
     거꾸로 풀지도 않는다 — 그 값은 렌더러가 이미 여섯 자리에서
     자른 것이라 되돌리면 원본과 미세하게 다르고, 그 차이가 그대로
     저장되면 끌지도 않은 요소가 조금씩 움직인다.

     대신 부모가 **선택과 짝지어** 좌표 하나를 내려 준다
     (setGeometry). 이동은 그 값에서 시작하고, 확정도 그 값을
     `expected` 로 달고 올라간다 — 부모는 자기 draft 의 현재 값과
     대조한 뒤에만 쓴다.

     ★ 끄는 동안 Canvas JSON 도 working draft 도 Undo 도 스킨 CSS 도
       한 글자 바뀌지 않는다. 이 프레임 안에서 custom property 두
       칸이 움직일 뿐이다(§17-4).
  ========================================================== */

  /*
    좌표를 쓰는 함수는 렌더러의 것을 그대로 쓴다
    (skin/skin-home-canvas-render.js §0-1). 이 문서가 그 파일을
    읽지 않았으면 **이동을 켜지 않는다** — 계산을 여기에 한 벌 더
    적지 않는다.
  */
  function positionApi() {

    if (
      typeof win.setSkinCanvasElementPosition !== "function" ||
      typeof win.setSkinCanvasElementBox !== "function" ||
      typeof win.setSkinCanvasElementRotation !== "function" ||
      typeof win.readSkinCanvasElementBoxVars !== "function" ||
      typeof win.restoreSkinCanvasElementBoxVars !== "function"
    ) {
      return null;
    }

    return {
      set: win.setSkinCanvasElementPosition,

      /*
        HOME-CANVAS-TRANSFORM-1B — 크기까지 쓰는 함수와,
        **네 칸을 한 벌로** 읽고 되돌리는 함수.

        ★ 읽기 · 되돌리기는 이동에서도 이 한 쌍을 쓴다. 제스처가
          무엇이었든 "시작할 때 적혀 있던 그 문자열들"로 되돌리면
          되고, 이동이 건드리지 않은 세 칸은 되돌려도 그대로다 —
          제스처마다 되돌리는 범위가 갈라지면 "크기를 바꾸다 취소한
          뒤 위치만 돌아왔다"가 생긴다.
      */
      setBox: win.setSkinCanvasElementBox,

      /* HOME-CANVAS-TRANSFORM-1C — 각도를 쓰는 함수(§0-3).
         읽기 · 되돌리기는 위 한 쌍이 각도까지 함께 한다. */
      setRotation: win.setSkinCanvasElementRotation,

      read: win.readSkinCanvasElementBoxVars,
      restore: win.restoreSkinCanvasElementBoxVars
    };

  }


  /* =========================================================
     자릿수와 한 바퀴 — 규칙은 skin/skin-home-canvas.js 한 곳이다
     (HOME-CANVAS-INSPECTOR-1A 에서 그리로 올라갔다).

     ★ 이 문서도 그 파일을 classic script 로 읽는다
       (studio/preview/preview-frame.html · skin/sandbox/frame.html).
       그래서 여기서는 **부르기만** 한다 — 같은 식을 두 벌 두면
       한쪽만 고쳐지는 날 왼쪽 패널과 손으로 끈 결과가 다른
       자릿수로 저장된다.

     ★ 없으면(옛 캐시가 남은 문서) 아무것도 접지 않는 편이
       조용히 다른 규칙으로 저장하는 것보다 낫다 — 부모가 어차피
       expected 로 다시 본다.
  ========================================================== */

  function canvasNumberRules() {

    const win =
      (typeof window !== "undefined") ? window : null;

    return {
      round:
        (win && typeof win.roundSkinHomeCanvasCoord === "function")
          ? win.roundSkinHomeCanvasCoord
          : null,
      fold:
        (win && typeof win.normalizeSkinHomeCanvasRotation === "function")
          ? win.normalizeSkinHomeCanvasRotation
          : null
    };

  }


  function roundCanvasCoord(value) {

    const round =
      canvasNumberRules().round;

    return round ? round(value) : value;

  }


  /* =========================================================
     HOME-CANVAS-TRANSFORM-1C — 확정 값의 표현을 정하는 **한 곳**

     normalizeCanvasRotation(deg)

     제스처 **도중**에는 연속 각도를 그대로 쓴다(시작 각도 + 누적
     회전량). 그래야 한 바퀴를 넘는 순간에도 화면이 반대로 튀지
     않는다 — 350° 에서 조금 더 돌린 값은 365° 이지 5° 가 아니다.

     저장할 때만 한 바퀴 안으로 접는다.

       · 화면에서 보이는 각도는 같다(365° 와 5° 는 같은 그림이다)
       · 같은 자리를 여러 번 돌려도 숫자가 계속 자라지 않는다

     ★ 이미 저장된 값을 일괄로 고치지 않는다. 여기서 접히는 것은
       **이번 제스처가 실제로 바꾼 그 요소의 새 값** 하나뿐이고,
       손대지 않은 요소의 -30 · 400 은 그대로 남는다(계약 §5 는
       "유한한 숫자"까지만 요구한다).

     ★ 자릿수 규칙은 좌표와 같다 — 소수 셋째 자리까지(위
       roundCanvasCoord). 접은 뒤에 반올림해야 359.9996 이
       360 으로 저장되지 않는다.
  ========================================================== */

  function normalizeCanvasRotation(deg) {

    const fold =
      canvasNumberRules().fold;

    return fold ? fold(deg) : deg;

  }


  /*
    frame px → Canvas 좌표의 배율.

    ★ 도화지의 **가로폭 하나**로 정한다. 세로는 렌더러가
      `aspect-ratio: baseWidth / baseHeight` 로 가로에 묶어 두었으므로
      같은 배율이다(skin/skin-home-canvas-render.css §1). 세로를 따로
      재면 스킨이 높이를 덮어썼을 때 x 와 y 가 서로 다른 자로
      움직인다.

    ★ 부모 문서의 Preview `transform: scale()` 은 여기에 들어오지
      않는다. 이 문서 안의 getBoundingClientRect 와 pointer 의
      clientX 는 둘 다 **이 프레임의 좌표계**이고, 바깥의 scale 은
      둘 다에 똑같이 적용되므로 나누면 사라진다.
  */
  /* =========================================================
     HOME-CANVAS-V2-EDITOR-1B — 자의 기준 상자

     `scopeId` 가 있으면 그 블록 상자가 기준이다(v2 `main_visual`
     내부 요소). 없으면 도화지다(v1 요소 · v2 overlay).

     ★ 못 찾으면 null 이다 — 비슷한 다른 상자로 바꿔 주지 않는다.
       그러면 canvasScale 이 0 을 돌려주고 관문이 "no-scale" 로
       제스처를 거절한다.
  ========================================================== */

  function canvasScopeBox(scopeId) {

    if (typeof scopeId !== "string" || !scopeId) {
      return canvasRoot();
    }

    if (!CANVAS_ELEMENT_ID_PATTERN.test(scopeId)) {
      return null;
    }

    const container =
      renderRoot();

    if (!container || typeof container.querySelector !== "function") {
      return null;
    }

    const el =
      container.querySelector(
        `[${CANVAS_BLOCK_ATTR}][${CANVAS_EDIT_ID_ATTR}="${scopeId}"]`
      );

    return (el && el.isConnected) ? el : null;

  }


  function canvasScale(baseWidth, scopeId) {

    const root =
      canvasScopeBox(scopeId);

    if (!root || !(baseWidth > 0)) {
      return 0;
    }

    const box =
      root.getBoundingClientRect();

    return box.width > 0 ? (box.width / baseWidth) : 0;

  }


  /* =========================================================
     HOME-CANVAS-V2-ELEMENTS-1 — 프레임의 **페이지 자리**를 알린다
     (계약 §28-3)

     ★ 여기서 재는 것은 **데이터가 줄 수 없는 한 가지**뿐이다.

     프레임의 폭 · 높이 · 배율은 렌더러가 저장값에서 계산한다(계약
     §24-3). 그러나 프레임이 흐름 안에서 **어디에 놓였는가**는 앞
     블록들의 실제 높이가 정하고, 글자 블록의 `height:"auto"` 는
     스킨 조판이 정하므로(계약 §8) 저장값만으로는 알 수 없다.
     "묶기 · 빼기 전후에 화면 자리가 유지된다"에는 그 한 값이
     필요하다 — 그래서 그것만 잰다.

     ★ 단위는 **도화지 폭의 분수**다. 부모가 `canvas.baseWidth` 를
       곱하면 곧 Canvas 좌표가 된다. 이 문서는 baseWidth 를 알 필요가
       없고 부모는 픽셀을 받지 않는다(§14 의 소유권과 같은 결).

     ★ 기준 상자는 도화지의 **padding box** 다 — 자유 배치 요소의
       백분율이 풀리는 그 상자이고, 스킨이 도화지에 테두리를 주면
       getBoundingClientRect 의 바깥 상자와 한 칸 어긋난다.

     ★ 바깥 문서의 Preview `transform: scale()` 은 나눠져 사라진다.
       레이아웃 px(`offsetWidth` · `clientLeft`)과 화면 px(rect)을
       함께 쓰므로 그 배율 하나만 맞춰 준다.
  ========================================================== */

  /* =========================================================
     HOME-CANVAS-V2-MANUAL-FIX-1 — 고른 요소가 지금 **물려받고 있는
     모양**(계약 §29-6)

     ★ 왜 필요한가.

     장식을 `main_visual` 안으로 묶으면 그 요소의 DOM 부모가 도화지
     에서 **블록**으로 바뀐다. 스킨이 블록에 글꼴 · 색을 적어 두었다면
     (흔하다 — `[data-imory-canvas-block] { font-family: … }`) 자리는
     그대로인데 글꼴과 색이 바뀐다. 2026-09-22 실측: Times New Roman
     → Georgia, #000 → #2b2723.

     플랫폼이 모든 스킨에서 그 상속을 끊을 수는 없다(프레임 안 캡션이
     블록의 조판을 따르는 것은 스킨의 의도다). 그래서 **옮기는 그
     순간의 값**을 그 요소 하나의 규칙으로 못박는다 — 그 값을 아는
     곳은 화면을 갖고 있는 이 문서뿐이다.

     ★ 올려보내는 것은 **고른 것 하나**의 고정된 목록뿐이다. 값은
       computed style 의 문자열이고, 프로토콜이 길이 · 글자 · 키를
       한 번 더 본다.
  ========================================================== */

  const CANVAS_LOOK_PROPERTIES = [
    "font-family", "font-size", "font-weight", "font-style",
    "line-height", "letter-spacing", "text-transform", "text-align",
    "color", "white-space"
  ];


  function selectedLook() {

    if (state.targetIds.length !== 1) {
      return null;
    }

    const id =
      state.targetIds[0];

    const el =
      elementFor(id);

    if (!el) {
      return null;
    }

    let style;

    try {
      style = win.getComputedStyle(el);
    }
    catch (err) {
      return null;
    }

    if (!style) {
      return null;
    }

    const props = {};

    CANVAS_LOOK_PROPERTIES.forEach(
      (name) => {

        const value =
          style.getPropertyValue(name);

        if (typeof value === "string" && value && value.length <= 120) {
          props[name] = value.trim();
        }

      }
    );

    return Object.keys(props).length ? { id: id, props: props } : null;

  }


  function reportLayout() {

    if (typeof opts.onLayout !== "function") {
      return;
    }

    const root =
      canvasRoot();

    if (!root) {
      return;
    }

    const rect =
      root.getBoundingClientRect();

    if (!(rect.width > 0) || !(root.offsetWidth > 0)) {
      return;
    }

    /* 레이아웃 px → 화면 px */
    const px =
      rect.width / root.offsetWidth;

    const left =
      rect.left + root.clientLeft * px;

    const top =
      rect.top + root.clientTop * px;

    const inner =
      root.clientWidth * px;

    if (!(inner > 0)) {
      return;
    }

    const trim =
      (value) => Math.round(value * 1000000) / 1000000;

    /* =====================================================
       HOME-CANVAS-V2-MANUAL-FIX-1 — 블록의 **그려진 높이**
       (계약 §29-3)

       `height:"auto"` 인 블록의 실제 높이는 스킨 조판이 정하므로
       저장값이 줄 수 없다(§28-3 의 그 사정 그대로다). Auto 스위치를
       끌 때 "지금 보이는 그 높이"로 굳히려면 그 한 값이 필요하다.

       단위는 프레임 자리와 같은 **도화지 폭의 분수**다 — 부모가
       `baseWidth` 를 곱하면 곧 Canvas 좌표다.
    ====================================================== */
    const blocks = [];

    Array.prototype.forEach.call(
      root.querySelectorAll(`[${CANVAS_BLOCK_ATTR}]`),
      (el) => {

        if (el.getAttribute(CANVAS_FRAME_ATTR) === CANVAS_CONTROL_BOX_VALUE) {
          return;
        }

        const id =
          el.getAttribute(CANVAS_EDIT_ID_ATTR) || "";

        if (!CANVAS_ELEMENT_ID_PATTERN.test(id)) {
          return;
        }

        const box =
          el.getBoundingClientRect();

        if (!(box.height > 0)) {
          return;
        }

        blocks.push({ id: id, h: trim(box.height / inner) });

      }
    );

    const frames = [];

    Array.prototype.forEach.call(
      root.querySelectorAll(`[${CANVAS_BLOCK_ATTR}][${CANVAS_FRAME_ATTR}]`),
      (el) => {

        /* 위 ★ — 값이 "1" 인 것은 이 파일이 만든 control box 다 */
        if (el.getAttribute(CANVAS_FRAME_ATTR) === CANVAS_CONTROL_BOX_VALUE) {
          return;
        }

        const id =
          el.getAttribute(CANVAS_EDIT_ID_ATTR) || "";

        if (!CANVAS_ELEMENT_ID_PATTERN.test(id)) {
          return;
        }

        const box =
          el.getBoundingClientRect();

        if (!(box.width > 0)) {
          return;
        }

        frames.push({
          id: id,
          x: trim((box.left - left) / inner),
          y: trim((box.top - top) / inner),

          /* =================================================
             HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 프레임의 **그려진
             폭**(계약 §30-3)

             V2-ELEMENTS-1 은 폭을 싣지 않았다 — 그때는 저장값에서
             언제나 계산할 수 있었기 때문이다(§24-3). 데스크톱 최대
             폭이 생기면서 그것이 더는 참이 아니다: 화면이 설계 폭보다
             넓으면 프레임은 저장값이 말하는 폭보다 **좁게** 그려진다.

             그래서 자리와 **같은 자**(도화지 폭의 분수)로 한 칸 더
             보낸다. 어느 쪽이 맞는가에 새 규칙이 생기지 않는다 —
             그려진 것이 맞고, 저장값은 그 상한 전의 값이다.
          ================================================== */
          w: trim(box.width / inner)
        });

      }
    );

    const look =
      selectedLook();

    const shape =
      JSON.stringify(frames) + "|" + JSON.stringify(blocks) +
      "|" + JSON.stringify(look);

    if (shape === state.layoutShape) {
      return;
    }

    state.layoutShape = shape;

    try {
      opts.onLayout({ frames: frames, blocks: blocks, look: look });
    }
    catch (err) {
      /* 알림이 실패해도 화면은 그대로다 — 다음 렌더에서 다시 보낸다 */
      state.layoutShape = "";
    }

  }


  /*
    지금 이동 · 리사이즈를 켜도 되는가 — 이유를 문자열로 돌려준다
    (§17-1 · §18-1).

    "ok" 가 아닌 값은 전부 진단용이고, 그 상태에서는 제스처가
    시작되는 그 자리(dragStart · resizeStart)에서 거절된다.

    ★ 관문은 **한 곳**이다. 이동과 리사이즈가 요구하는 것이 같기
      때문이다 — 단독 선택 · 그 요소가 화면에 있다 · 잠기지 않았다 ·
      부모가 내려 준 geometry 가 그 요소의 최신 값이다 · 렌더러의
      계산이 이 문서에 있다 · 배율을 잴 수 있다. 다른 것은 제스처가
      그 값에서 무엇을 바꾸는가뿐이다.
  */
  /* HOME-CANVAS-V2-MANUAL-FIX-1 — 지금 고른 것이 흐름 블록인가 */
  function geometryIsBlock() {

    return !!(state.geometry && state.geometry.mode === "block");

  }


  function dragGate() {

    if (state.disposed || !state.editing) {
      return "not-editing";
    }

    if (state.pending) {
      return "pending";
    }

    if (state.targetIds.length !== 1) {
      return "not-single";
    }

    const id =
      state.targetIds[0];

    if (primaryId() !== id) {
      return "not-primary";
    }

    const geometry =
      state.geometry;

    if (!geometry || geometry.id !== id) {
      return "no-geometry";
    }

    if (geometry.generation !== state.generation) {
      return "stale-geometry";
    }

    const el =
      elementFor(id);

    if (!el) {
      return "no-element";
    }

    /* 부모가 draft 에서 이미 본 것이지만 화면에서도 한 번 더 본다 —
       늦게 온 재렌더가 그 사이에 잠갔을 수 있다 */
    if (el.hasAttribute("hidden") || el.getAttribute(CANVAS_LOCKED_ATTR) === "true") {
      return "locked";
    }

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 블록은 렌더러의 좌표 API 를
       쓰지 않는다. 끄는 동안의 폭은 이 문서가 인라인으로 적고
       (아래 onCanvasWidth*), 확정된 값은 부모가 다시 그린다. */
    if (!geometryIsBlock() && !positionApi()) {
      return "no-renderer";
    }

    if (!(canvasScale(geometry.baseWidth, geometry.scopeId) > 0)) {
      return "no-scale";
    }

    return "ok";

  }


  /* =========================================================
     canvasPageDragBounds(el, geometry)
       -> { min, max } | null
     (HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 후속 · 계약 §30-4-1)

     v2 의 **페이지 자유 장식**은 화면 밖으로 나갈 자리가 없으면
     그만큼 안쪽에 그려진다(render.css §7). 그 규칙이 표시 쪽에만
     있으면, 가장자리에서 더 끌 때 **화면은 멈추고 저장 x 만 변하는**
     상태가 된다 — 확정 뒤에도 튀지 않지만 "지금 보이는 자리"와
     "저장된 자리"가 갈라진다.

     그래서 끄는 동안 저장값도 **같은 범위**로 자른다. 범위의 식은
     render.css §7 의 `clamp()` 두 끝 그대로다.

       room = max(0, (창 폭 − 도화지 안쪽 폭) ÷ 2)
       min  = −room
       max  = baseWidth + room − 요소 폭
       (뒤집히면 정렬한다 — 도화지보다 넓은 전면 배경)

     ★ 자는 **레이아웃 px** 다. `100cqw` 는 도화지의 content box 이고
       `100vw` 는 이 프레임의 뷰포트다. 바깥 Preview 의
       `transform: scale()` 은 둘 다에 들어가지 않으므로 나누지
       않는다(`canvasScale` 의 화면 px 자와 다른 자다).

     ★ 적용 범위는 그 규칙이 닿는 요소뿐이다 — `unit="cqw"` 이고
       도화지가 기준인 것. v1 요소 · 프레임 내부 장식 · 블록은 null
       이라 지금까지와 한 글자도 같다.
  ========================================================== */

  function canvasPageDragBounds(el, geometry) {

    if (
      !el ||
      !geometry ||
      geometry.scopeId ||
      typeof el.getAttribute !== "function" ||
      el.getAttribute(CANVAS_UNIT_ATTR) !== CANVAS_UNIT_CQW
    ) {
      return null;
    }

    const root =
      canvasRoot();

    if (!root || !(geometry.baseWidth > 0) || !(geometry.width > 0)) {
      return null;
    }

    const style =
      win.getComputedStyle(root);

    const basis =
      root.clientWidth -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0);

    if (!(basis > 0)) {
      return null;
    }

    const unit =
      basis / geometry.baseWidth;

    const room =
      Math.max(0, (win.innerWidth - basis) / 2) / unit;

    const lo =
      -room;

    const hi =
      geometry.baseWidth + room - geometry.width;

    return {
      min: Math.min(lo, hi),
      max: Math.max(lo, hi)
    };

  }


  /* 범위가 없으면 그대로다 — 숫자를 지어내지 않는다 */
  function clampCanvasPageX(value, bounds) {

    if (!bounds || !Number.isFinite(value)) {
      return value;
    }

    return Math.min(Math.max(value, bounds.min), bounds.max);

  }


  /*
    syncDraggable()

    able 을 켜고 끄지 않는다(위 displayOnlyMoveableOptions 주석) —
    지금 이동을 받을 수 있는지 다시 재어 진단에 남길 뿐이다. 실제
    판정은 언제나 제스처가 시작될 때 dragGate() 가 한다.
  */
  function syncDraggable() {

    if (!state.moveable) {
      return false;
    }

    const gate =
      dragGate();

    state.lastMoveGate = gate;

    return gate === "ok";

  }


  function restoreDragPosition(gesture) {

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 블록은 인라인 폭 한 칸이다
       (계약 §29-4). 걷어내면 스킨 CSS 의 규칙으로 돌아간다. */
    if (gesture && gesture.kind === CANVAS_WIDTH_KIND) {

      try {
        gesture.el.style.width = gesture.savedWidth || "";
      }
      catch (err) {
        /* 이미 사라진 노드다 — 재렌더가 제자리를 그린다 */
      }

      return;

    }

    const api =
      positionApi();

    if (!api || !gesture || !gesture.el || !gesture.saved) {
      return;
    }

    try {
      api.restore(gesture.el, gesture.saved);
    }
    catch (err) {
      /* 이미 사라진 노드다 — 재렌더가 제자리를 그린다 */
    }

  }


  function clearPendingTimer() {

    if (state.pendingTimer) {
      win.clearTimeout(state.pendingTimer);
      state.pendingTimer = 0;
    }

  }


  /*
    cancelDrag(reason)

    **끄는 중인 제스처만** 접는다 — 시작 자리로 되돌리고 부모에게는
    아무 말도 하지 않는다(확정을 보낸 적이 없다, §9).

    ★ 이미 확정을 보내 **답을 기다리는 중인 것은 건드리지 않는다.**

    승인된 확정은 곧바로 화면을 다시 그리게 하고, 그 재렌더가
    이 함수를 부른다(onRender). 거기서 기다림까지 접으면 **정상적으로
    저장된 이동이 "답을 못 받았다"가 되어** 화면만 제자리로 돌아간다
    (2026-09-21 이 라운드의 e2e 가 그렇게 잡았다). 기다림을 끝내는
    것은 번호가 붙은 답 하나, 상한 시간, 그리고 dispose() 뿐이다.
  */
  function cancelDrag(reason) {

    if (!state.drag) {
      return;
    }

    const gesture =
      state.drag;

    state.drag = null;

    gesture.cancelled = true;

    restoreDragPosition(gesture);

    if (state.moveable && typeof state.moveable.stopDrag === "function") {

      try {
        state.moveable.stopDrag("target");
      }
      catch (err) {
        /* 이미 끝난 제스처다 */
      }

    }

    state.lastMoveGate = "cancel:" + (reason || "");

  }


  /*
    abandonPendingCommit(reason)

    기다림 자체를 접는다. 이 문서가 사라지는 경우(dispose)에만
    쓴다 — 그 밖에는 답이 오거나 상한 시간이 끝낸다.
  */
  function abandonPendingCommit(reason) {

    if (!state.pending) {
      return;
    }

    const pending =
      state.pending;

    state.pending = null;

    clearPendingTimer();

    restoreDragPosition(pending);

    state.lastSettle = "cancel:" + (reason || "");

  }


  /*
    거절은 `event.stop()` 이다 — 반환값이 아니다(위
    displayOnlyMoveableOptions 의 ★ 주석). emitter 가 그 호출을 보고
    false 를 돌려주면 Draggable 이 그 자리에서 제스처를 접는다.
  */
  function refuseDrag(event, reason) {

    state.lastMoveGate = reason;

    if (event && typeof event.stop === "function") {
      event.stop();
    }

    return false;

  }


  /* 이 노드가 이동 손잡이(또는 그 안)인가(계약 §30-2) */
  function nodeIsMoveGrip(node) {

    const grip =
      state.moveGrip;

    return !!(
      grip && node &&
      (node === grip || (grip.contains && grip.contains(node)))
    );

  }


  /* 이 제스처가 이동 손잡이에서 시작했는가 */
  function dragStartedOnMoveGrip(event) {

    return nodeIsMoveGrip(
      (event && event.inputEvent) ? event.inputEvent.target : null
    );

  }


  function onCanvasDragStart(event) {

    const gate =
      dragGate();

    if (gate !== "ok") {
      return refuseDrag(event, gate);
    }

    /* =====================================================
       HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록은 **끌어서 옮기지
       않는다**(계약 §29-4).

       블록의 자리는 순서 · 정렬 · margin 이 정한다(§14-10). 본체를
       끌어 좌표를 쓰면 블록에 자유 요소의 변수가 생기고, 그 값은
       어떤 CSS 도 읽지 않으므로 화면은 그대로인 채 JSON 만 자란다.
    ====================================================== */
    if (geometryIsBlock()) {
      return refuseDrag(event, "block");
    }

    /*
      손가락으로는 본체를 끌지 않는다(§17-2).

      도화지 전체를 덮는 배경 사진이 선택된 상태에서 한 손가락
      드래그를 가로채면 모바일 Preview 가 아예 스크롤되지 않는다.
      lasso 와 같은 이유이고, 같은 판정 함수를 쓴다.

      ★ **이동 손잡이는 예외다**(HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 ·
        계약 §30-2). 그 이유가 "한 손가락 드래그가 스크롤인지 이동
        인지 가를 수 없다" 였는데, 손잡이를 짚은 손가락은 가를 것이
        없다 — 18px 짜리 그 자리를 누른 것 자체가 의사 표시다.
        손잡이에는 `touch-action: none` 이 걸려 있어 스크롤과
        겹치지도 않는다.
    */
    if (
      !dragStartedOnMoveGrip(event) &&
      isCoarsePointerEvent(event && event.inputEvent)
    ) {
      return refuseDrag(event, "coarse-pointer");
    }

    const geometry =
      state.geometry;

    const el =
      elementFor(geometry.id);

    const api =
      positionApi();

    const scale =
      canvasScale(geometry.baseWidth, geometry.scopeId);

    if (!el || !api || !(scale > 0)) {
      return refuseDrag(event, "no-basis");
    }

    state.drag = {
      kind: CANVAS_MOVE_KIND,
      id: geometry.id,
      el: el,
      scale: scale,
      startX: event.clientX,
      startY: event.clientY,
      baseX: geometry.x,
      baseY: geometry.y,
      baseW: geometry.width,
      baseH: geometry.height,

      /* 이동은 각도를 바꾸지 않는다 — 시작값을 그대로 들고 있다가
         부모의 답과 대조할 때만 쓴다(HOME-CANVAS-TRANSFORM-1C) */
      baseRot: geometry.rotation,
      nextRot: geometry.rotation,

      /* HOME-CANVAS-V2-EDITOR-1B — 이동은 크기를 바꾸지 않으므로
         origin 몫이 0 이다. 그래도 들고 있는 이유는 setGeometry 가
         "그 사이에 자가 바뀌었는가"를 이 값으로 보기 때문이다. */
      originX: geometry.originX,
      originY: geometry.originY,

      baseWidth: geometry.baseWidth,
      baseHeight: geometry.baseHeight,
      generation: state.generation,
      saved: api.read(el),

      /* HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 후속 — 이 화면에서 놓을
         수 있는 가로 범위(계약 §30-4-1). 해당 없는 요소에서는 null
         이고 그때 아래 clamp 는 한 글자도 하지 않는다. */
      pageBounds: canvasPageDragBounds(el, geometry),

      nextX: geometry.x,
      nextY: geometry.y,
      nextW: geometry.width,
      nextH: geometry.height,
      cancelled: false
    };

    state.lastMoveGate = "ok";

    return true;

  }


  /* =========================================================
     HOME-CANVAS-TRANSFORM-1B — 리사이즈

     ★ 삼각함수를 새로 적지 않는다.

     회전한 요소의 반대편 기준점을 유지하려면 요소의 중심이
     움직여야 하고(회전 중심이 중심이므로), 그 양은 Moveable 이
     이미 계산해서 준다 — `drag.beforeTranslate` 다. 그 값은
     `transform: translate(tx,ty) rotate(θ)` 의 앞 translate 이므로
     **부모 좌표계**의 양이고, 우리 요소는 그 좌표계에서 left · top
     으로 놓여 있다. 그래서 x · y 에 **그대로 더하면** 된다.

     2026-09-21 실측(20° · 45°, e · nw · n · se 손잡이)에서 그 값이
     중심 회전 공식과 소수점까지 같았고, 고정되어야 하는 반대편
     기준점은 0.5px 안에서 유지됐다(그 오차는 렌더러가 백분율을
     여섯 자리에서 자르기 때문이고, 1px 허용치 안이다).

     ★ 크기는 `dist` 다 — `width` · `height` 는 쓰지 않는다.

     0.53.0 의 resize payload 에서 `width` · `height` 는 우리가
     style 을 적용하지 않는 사용법에서는 **시작값에 머문다**(실측:
     40px 를 끌어 `dist:[40,0]` 인데 `width` 는 그대로 90). `dist` 는
     요소 **자기 축**에서의 누적 크기 변화이므로 회전과 무관하고,
     delta 라서 padding · border 같은 box model 차이도 상쇄된다.

     ★ 끄는 동안 크기를 실제로 적용해도 `dist` 는 선형이다(실측).
       Moveable 은 기준점을 resizeStart 에서 잡아 두고 그 뒤로는
       포인터 이동만 보므로 우리가 적용한 크기를 두 번 세지 않는다.
  ========================================================== */

  /*
    지금 화면에 그려진 **실제 세로 길이**를 Canvas 좌표로.

    `height:"auto"` 를 숫자로 바꿀 때의 기준 높이다(§18-3).

    ★ getBoundingClientRect() 를 쓰지 않는다. 회전한 요소에서 그것은
      축에 정렬된 바깥 상자라 요소의 세로 길이가 아니다. computed
      `height` 는 회전과 무관한 **레이아웃 값**이고, 그 값이 곧
      우리가 `--imory-canvas-height` 로 쓰는 그 칸의 단위다.
  */
  function renderedHeightIn(el, scale) {

    if (!el || !(scale > 0)) {
      return 0;
    }

    const value =
      parseFloat(win.getComputedStyle(el).height);

    return Number.isFinite(value) ? (value / scale) : 0;

  }


  /* =========================================================
     HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록의 폭 제스처(계약 §29-4)

     ★ 렌더러의 좌표 API 를 쓰지 않는다.

     블록의 폭은 `--imory-canvas-block-width` 이고 그 값은 **흐름 층
     content box 의 백분율**이다 — 이 문서는 그 자(padding 을 뺀
     baseWidth)를 모른다. 그래서 끄는 동안에는 인라인 `width` 한 칸을
     px 로 적고, 손을 놓으면 그것을 걷어낸 뒤 부모가 확정한 값으로
     다시 그린다. 인라인 값은 CSSOM 으로 쓰므로 CSP 의 style-src 에
     걸리지 않는다(markControlBox 머리말과 같은 이유).

     ★ 덕분에 **줄바꿈과 아래 블록이 끄는 동안 즉시 따라온다** —
       흐름이 그 자리에서 다시 조판되기 때문이다.
  ========================================================== */

  function onCanvasWidthStart(event) {

    /* 손가락으로는 폭도 바꾸지 않는다(§17-2 · §18-1 과 같은 판정) */
    if (isCoarsePointerEvent(event && event.inputEvent)) {
      return refuseDrag(event, "coarse-pointer");
    }

    const geometry =
      state.geometry;

    const el =
      elementFor(geometry.id);

    const scale =
      canvasScale(geometry.baseWidth, geometry.scopeId);

    if (!el || !(scale > 0)) {
      return refuseDrag(event, "no-basis");
    }

    state.drag = {
      kind: CANVAS_WIDTH_KIND,
      id: geometry.id,
      el: el,
      scale: scale,

      /* 블록에는 좌표 · 각도가 없다. 그래도 같은 이름을 둔다 —
         geometry 가 다시 내려올 때의 "그 사이에 draft 가 바뀌었나"
         비교가 이 이름들을 본다(setGeometry). */
      baseX: geometry.x,
      baseY: geometry.y,
      baseH: geometry.height,
      baseRot: geometry.rotation,
      originX: geometry.originX,
      originY: geometry.originY,
      nextX: geometry.x,
      nextY: geometry.y,
      nextH: geometry.height,
      nextRot: geometry.rotation,

      baseW: geometry.width,
      nextW: geometry.width,

      baseWidth: geometry.baseWidth,
      baseHeight: geometry.baseHeight,
      generation: state.generation,

      /* 되돌릴 것은 인라인 한 칸이다 — 없었으면 빈 문자열 */
      savedWidth: el.style.width,
      cancelled: false
    };

    state.lastMoveGate = "ok";

    return true;

  }


  function onCanvasWidth(event) {

    const gesture =
      state.drag;

    if (!gesture || gesture.cancelled || gesture.kind !== CANVAS_WIDTH_KIND) {
      return;
    }

    if (!gesture.el.isConnected) {
      cancelDrag("detached");
      return;
    }

    const dist =
      (event && Array.isArray(event.dist)) ? event.dist : [0, 0];

    if (!Number.isFinite(dist[0])) {
      return;
    }

    /* 시작값 + 누적 변화(§17-3) */
    const nextW =
      roundCanvasCoord(
        Math.max(CANVAS_MIN_SIZE, gesture.baseW + dist[0] / gesture.scale));

    gesture.nextW = nextW;

    try {
      gesture.el.style.width = (nextW * gesture.scale) + "px";
    }
    catch (err) {
      cancelDrag("write-failed");
    }

  }


  function onCanvasWidthEnd() {

    const gesture =
      state.drag;

    if (!gesture || gesture.kind !== CANVAS_WIDTH_KIND) {
      return;
    }

    state.drag = null;

    if (gesture.cancelled) {
      return;
    }

    /* 바뀐 것이 없다 — 확정도 기록도 없다(§17-6) */
    if (gesture.nextW === gesture.baseW) {
      restoreDragPosition(gesture);
      state.lastMoveGate = "no-resize";
      return;
    }

    sendTransform(
      gesture,
      { width: gesture.baseW },
      { width: gesture.nextW }
    );

  }


  function onCanvasResizeStart(event) {

    const gate =
      dragGate();

    if (gate !== "ok") {
      return refuseDrag(event, gate);
    }

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록이면 폭 한 칸이다 */
    if (geometryIsBlock()) {
      return onCanvasWidthStart(event);
    }

    /* 손가락으로는 크기도 바꾸지 않는다 — 이동과 같은 이유이고
       같은 판정 함수를 쓴다(§17-2 · §18-1) */
    if (isCoarsePointerEvent(event && event.inputEvent)) {
      return refuseDrag(event, "coarse-pointer");
    }

    const geometry =
      state.geometry;

    const el =
      elementFor(geometry.id);

    const api =
      positionApi();

    const scale =
      canvasScale(geometry.baseWidth, geometry.scopeId);

    if (!el || !api || !(scale > 0)) {
      return refuseDrag(event, "no-basis");
    }

    const direction =
      (event && Array.isArray(event.direction)) ? event.direction : [0, 0];

    /* 세로가 움직일 수 있는 제스처인가 — `"auto"` 를 숫자로 바꿀지
       가르는 첫 조건이다(§18-3). 좌우 손잡이는 direction[1] 이 0 이다. */
    const verticalHandle =
      direction[1] !== 0;

    /* =====================================================
       HOME-CANVAS-MANUAL-UX-FIX-1 — 손잡이의 뜻이 둘로 갈린다
       (계약 §21-2)

         모서리 넷(nw · ne · se · sw) : 시작 비율 유지
         변 중앙 넷(n · e · s · w)    : 한 축만 자유

       판정은 방향 한 쌍뿐이다 — 두 칸이 모두 0 이 아니면 모서리다.
    ====================================================== */
    const corner =
      direction[0] !== 0 && direction[1] !== 0;

    const autoHeight =
      geometry.height === CANVAS_AUTO_HEIGHT;

    /*
      비율 유지의 시작 px. **Moveable 이 쓰는 그 값**이어야 한다 —
      dist 는 `U - state.width` 이므로(번들 실측) 우리가 setSize 로
      돌려주는 값도 같은 자에서 나와야 dist 가 의도한 짝이 된다.
      `getRect().offsetWidth/offsetHeight` 가 곧 그 state.width /
      state.height 다(번들 실측).
    */
    let startPxW = 0;
    let startPxH = 0;

    if (corner && state.moveable && typeof state.moveable.getRect === "function") {

      try {

        const px =
          state.moveable.getRect();

        startPxW = Number(px && px.offsetWidth) || 0;
        startPxH = Number(px && px.offsetHeight) || 0;

      }
      catch (err) {
        startPxW = 0;
        startPxH = 0;
      }

    }

    state.drag = {
      kind: CANVAS_RESIZE_KIND,
      id: geometry.id,
      el: el,
      scale: scale,
      direction: [direction[0], direction[1]],
      verticalHandle: verticalHandle,

      /* HOME-CANVAS-MANUAL-UX-FIX-1 — 모서리면 비율을 지킨다 */
      corner: corner,
      startPxW: startPxW,
      startPxH: startPxH,

      /* =====================================================
         HOME-CANVAS-V2-EDITOR-1B — pin 장식의 `origin` 몫

         v2 의 `follow:"pin"` 요소는 좌표가 **자기 상자의 왼쪽
         위가 아니라 `origin` 이 놓일 자리**이고, 그 차이는 CSS 의
         백분율 translate 가 뺀다(계약 §24-4). 그래서 상자 크기가
         바뀌면 같은 좌표가 가리키는 화면 자리도 바뀐다.

         Moveable 이 준 `drag.beforeTranslate` 는 **화면 상자의
         왼쪽 위**가 얼마나 움직여야 하는가이므로, 좌표에는 크기
         변화 × origin 만큼을 더 얹어야 한다.

           새 좌표 = 시작 좌표 + 이동량 + origin × (새 크기 − 시작 크기)

         그래야 끄는 동안과 확정 뒤가 같은 자리이고(§26-5), 고정
         기준점이 손잡이를 따라간다. v1 요소와 overlay 는 origin 이
         0 이라 이 항이 사라진다 — 지금까지의 식 그대로다.
      ====================================================== */
      originX: geometry.originX,
      originY: geometry.originY,

      autoHeight: autoHeight,
      baseX: geometry.x,
      baseY: geometry.y,
      baseW: geometry.width,
      baseH: geometry.height,

      /*
        `"auto"` 인 요소의 기준 높이. 숫자로 바뀌는 순간부터 이
        값에 누적 변화를 더한다 — 저장된 값이 없으므로 화면에서
        한 번 재는 것이 유일한 출발점이다.
      */
      autoBaseH: autoHeight ? renderedHeightIn(el, scale) : 0,

      /* 리사이즈도 각도를 바꾸지 않는다(HOME-CANVAS-TRANSFORM-1C) */
      baseRot: geometry.rotation,
      nextRot: geometry.rotation,

      baseWidth: geometry.baseWidth,
      baseHeight: geometry.baseHeight,
      generation: state.generation,
      saved: api.read(el),
      nextX: geometry.x,
      nextY: geometry.y,
      nextW: geometry.width,
      nextH: geometry.height,
      cancelled: false
    };

    state.lastMoveGate = "ok";

    return true;

  }


  /* =========================================================
     HOME-CANVAS-MANUAL-UX-FIX-1 — 모서리 비율 유지가 끼어드는 곳
     (계약 §21-2)

     Moveable 0.53.0 의 `beforeResize` 는 크기를 정한 **뒤**,
     `dist` 와 `drag.beforeTranslate` 를 만들기 **전**에 돈다
     (번들 실측: dragControl 안에서 at() → onBeforeResize →
     bounds/min/max → dist = U - startOffsetWidth → kr() → drag).

     그래서 여기서 `setSize()` 로 짝을 다시 정하면 그 뒤의 모든
     것이 **우리가 정한 크기에서** 나온다.

       · dist               우리가 정한 누적 변화
       · beforeTranslate    그 크기로 반대편 기준점을 지키는 이동

     ★ 그래서 `keepRatio` prop 을 켜지 않는다. 세 가지 이유다.

       1. 그 prop 은 vanilla 래퍼의 setter 를 거치는데 그 setter 는
          **setTimeout 으로 미뤄진다**(0.53.0 실측 — draggable 의
          그 함정과 같은 사정이다, 위 displayOnlyMoveableOptions).
          제스처가 시작된 뒤에 켜면 첫 몇 프레임이 자유 비율로 돈다.
       2. 그 prop 의 기준은 `state.width / state.height` 라 저자
          CSS 의 border · padding 과 `height:"auto"` 의 소수점이
          섞인다. 우리가 지켜야 하는 것은 **저장되는 네 칸의**
          비율이다.
       3. 모서리에서 가로만 끌게 된다(`isWidth`) — 아래로만 끈
          se 손잡이가 아무 일도 하지 않는다.

     ★ 변 중앙 손잡이에서는 아무것도 하지 않는다 — 한 축 자유
       조정이 그대로 남는다.
  ========================================================== */

  function onCanvasBeforeResize(event) {

    const gesture =
      state.drag;

    if (!gesture || gesture.cancelled || gesture.kind !== CANVAS_RESIZE_KIND) {
      return;
    }

    if (!gesture.corner || !event || typeof event.setSize !== "function") {
      return;
    }

    /* 비율의 기준은 **Canvas 좌표의** 시작 가로와 실제 세로다.
       `"auto"` 면 그 순간 렌더된 세로(§18-3 과 같은 자). */
    const ratioH =
      gesture.autoHeight ? gesture.autoBaseH : gesture.baseH;

    const box =
      canvasResizeKeepRatioBox(
        gesture.startPxW,
        gesture.startPxH,
        event.boundingWidth,
        event.boundingHeight,
        gesture.baseW,
        ratioH
      );

    if (!box) {
      return;
    }

    try {
      event.setSize(box);
    }
    catch (err) {
      /* 이 판에서는 자유 비율로 돈다 — 제스처를 깨지 않는다 */
    }

  }


  function onCanvasResize(event) {

    const gesture =
      state.drag;

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록의 폭 제스처 */
    if (gesture && gesture.kind === CANVAS_WIDTH_KIND) {
      return onCanvasWidth(event);
    }

    if (!gesture || gesture.cancelled || gesture.kind !== CANVAS_RESIZE_KIND) {
      return;
    }

    if (!gesture.el.isConnected) {
      cancelDrag("detached");
      return;
    }

    const api =
      positionApi();

    if (!api) {
      cancelDrag("no-renderer");
      return;
    }

    const dist =
      (event && Array.isArray(event.dist)) ? event.dist : [0, 0];

    const translate =
      (event && event.drag && Array.isArray(event.drag.beforeTranslate))
        ? event.drag.beforeTranslate
        : [0, 0];

    if (
      !Number.isFinite(dist[0]) || !Number.isFinite(dist[1]) ||
      !Number.isFinite(translate[0]) || !Number.isFinite(translate[1])
    ) {
      return;
    }

    /* ★ 시작값 + **누적** 변화다. 직전 프레임의 값에 더하지 않으므로
       프레임 수와 무관하고 반올림이 쌓이지 않는다(§17-3). */

    const dw =
      dist[0] / gesture.scale;

    const dh =
      dist[1] / gesture.scale;

    const nextW =
      roundCanvasCoord(Math.max(CANVAS_MIN_SIZE, gesture.baseW + dw));

    gesture.nextW =
      nextW;

    /* HOME-CANVAS-V2-EDITOR-1B — pin 장식의 `origin` 몫(위 주석).
       v1 요소 · overlay 는 0 이라 이 항이 사라진다. */
    gesture.nextX =
      roundCanvasCoord(
        gesture.baseX + translate[0] / gesture.scale +
          gesture.originX * (nextW - gesture.baseW)
      );

    /* =====================================================
       `height:"auto"` — 언제 숫자가 되는가(§18-3)

       ★ 두 조건이 **모두** 참일 때만이다.

         1) 세로가 움직일 수 있는 손잡이였다(n · s · 네 모서리)
         2) 실제 세로 변화가 0 이 아니다

       (1) 만 보면 모서리를 잡고 가로로만 끌어도 숫자가 되고,
       (2) 만 보면 단순 클릭의 미세한 떨림이 숫자로 바꾼다. 한 번
       숫자가 된 요소를 자동으로 `"auto"` 로 되돌리지는 않는다 —
       그 UI 는 뒤 Inspector 단계다.
    ====================================================== */

    /*
      ★ 세로 좌표는 높이를 정한 **뒤에** 정한다 — `origin` 몫이
        새 높이를 알아야 계산되기 때문이다(위 originX 주석).

      `"auto"` 로 남는 동안에는 그 항이 0 이다. 높이를 숫자로 쓰지
      않았으므로 화면의 세로 길이는 브라우저가 내용으로 정하고,
      백분율 translate 도 그 새 상자에서 다시 풀린다 — 우리가 끼어들
      숫자가 없다(그래서 끌기 중과 확정 뒤가 같다).
    */

    let originH = 0;

    if (gesture.autoHeight && (!gesture.verticalHandle || dh === 0)) {

      gesture.nextH = CANVAS_AUTO_HEIGHT;

    }
    else {

      const baseH =
        gesture.autoHeight ? gesture.autoBaseH : gesture.baseH;

      gesture.nextH =
        roundCanvasCoord(Math.max(CANVAS_MIN_SIZE, baseH + dh));

      originH =
        gesture.originY * (gesture.nextH - baseH);

    }

    gesture.nextY =
      roundCanvasCoord(
        gesture.baseY + translate[1] / gesture.scale + originH
      );

    try {

      api.setBox(
        gesture.el,
        {
          x: gesture.nextX,
          y: gesture.nextY,
          width: gesture.nextW,
          height: gesture.nextH
        },
        gesture.baseWidth,
        gesture.baseHeight
      );

    }
    catch (err) {
      cancelDrag("write-failed");
    }

  }


  function onCanvasResizeEnd() {

    const gesture =
      state.drag;

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록의 폭 제스처 */
    if (gesture && gesture.kind === CANVAS_WIDTH_KIND) {
      return onCanvasWidthEnd();
    }

    if (!gesture || gesture.kind !== CANVAS_RESIZE_KIND) {
      return;
    }

    state.drag = null;

    if (gesture.cancelled) {
      return;
    }

    /* 바뀐 것이 없다 — 확정도, 기록도 없다(§17-6).
       ★ `"auto"` 가 그대로면 nextH 도 같은 문자열이라 이 한 줄이
         "단순 클릭은 auto 를 숫자로 바꾸지 않는다"까지 함께 본다. */
    if (
      gesture.nextX === gesture.baseX &&
      gesture.nextY === gesture.baseY &&
      gesture.nextW === gesture.baseW &&
      gesture.nextH === gesture.baseH
    ) {
      restoreDragPosition(gesture);
      state.lastMoveGate = "no-resize";
      return;
    }

    sendTransform(gesture, {
      x: gesture.baseX,
      y: gesture.baseY,
      width: gesture.baseW,
      height: gesture.baseH
    }, {
      x: gesture.nextX,
      y: gesture.nextY,
      width: gesture.nextW,
      height: gesture.nextH
    });

  }


  /* =========================================================
     HOME-CANVAS-TRANSFORM-1C — 회전

     ★ 누적 회전량은 Moveable 이 준 `dist` 다.

     0.53.0 의 rotate payload 는 `{ delta, dist, rotate, beforeDist,
     beforeDelta, beforeRotate, … }` 이고, 번들 안에서
     `rotation = 시작각 + dist` 로 만들어진다(실측: `rotate` 와
     `dist` 의 차가 제스처 내내 시작각 그대로였다). 그래서
     **우리가 쓰는 것은 `dist` 하나**다.

       최종 각도 = 시작 rotation(부모가 준 값) + dist

     · CSS transform 문자열을 파싱해 지금 각도를 역산하지 않는다 —
       그 값은 우리가 쓴 그 칸에서 나온 것이고, 되돌려 읽으면
       자릿수가 한 번 더 버려진다.
     · 축에 정렬된 바깥 상자(getBoundingClientRect)로 각도를 재지
       않는다 — 그 상자는 회전을 지운 그림자다.
     · 매 이벤트의 `delta` 를 직전 값에 더하지 않는다. 이벤트 수와
       무관하고 반올림이 쌓이지 않아야 한다(이동 · 리사이즈와 같은
       규칙 — §17-3).

     ★ 부모 Preview 의 `transform: scale()` 을 각도에 보정하지
       않는다. 균등 배율은 각도를 바꾸지 않는다 — 길이만 바꾼다.
       (배율이 축마다 다르면 각도가 달라지지만, 도화지는 가로에
       세로를 묶어 두었으므로 그런 경우가 없다 — §12-2.)

     ★ 상자는 한 칸도 바뀌지 않는다. 회전 중심이 요소 상자의
       정중앙이라(transform-origin 기본값) x · y · width · height 가
       그대로여도 화면이 맞는다 — `"auto"` 높이도 그대로다.
  ========================================================== */

  function onCanvasRotateStart(event) {

    const gate =
      dragGate();

    if (gate !== "ok") {
      return refuseDrag(event, gate);
    }

    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록은 돌리지 않는다
       (손잡이도 그리지 않지만, 관문도 함께 막는다 — 계약 §29-4) */
    if (geometryIsBlock()) {
      return refuseDrag(event, "block");
    }

    /* 손가락으로는 돌리지 않는다 — 이동 · 리사이즈와 같은 이유이고
       같은 판정 함수를 쓴다(§17-2 · §18-12) */
    if (isCoarsePointerEvent(event && event.inputEvent)) {
      return refuseDrag(event, "coarse-pointer");
    }

    const geometry =
      state.geometry;

    const el =
      elementFor(geometry.id);

    const api =
      positionApi();

    if (!el || !api) {
      return refuseDrag(event, "no-basis");
    }

    state.drag = {
      kind: CANVAS_ROTATE_KIND,
      id: geometry.id,
      el: el,

      /* 배율은 각도에 들어가지 않지만(위 ★), 상자 네 칸은 확정의
         `expected` 로 올라가지 않으므로 여기서는 시작값만 들고
         있으면 된다 */
      scale: canvasScale(geometry.baseWidth, geometry.scopeId),

      baseX: geometry.x,
      baseY: geometry.y,
      baseW: geometry.width,
      baseH: geometry.height,

      /* 시작 각도. 부모가 내려 준 값 하나이고, `rotation` 이 없는
         요소는 부모가 이미 0 으로 만들어 보냈다(계약 §5). */
      baseRot: geometry.rotation,

      /*
        이번 제스처의 **날것** 연속 각도(시작 각도 + 누적 회전량).
        자석이 붙기 전의 값이고, "돌지 않았다"를 이 값으로 판정한다
        (HOME-CANVAS-MANUAL-UX-FIX-1 — 계약 §21-1).
      */
      rawRot: geometry.rotation,

      /* 화면에 지금 적혀 있는 연속 각도(한 바퀴를 넘을 수 있다).
         자석이 붙은 뒤의 값이다 — 제스처 중에도 보정된 각도를
         보여 준다. */
      viewRot: geometry.rotation,

      /* 확정으로 올릴 값 — 한 바퀴 안으로 접은 표현이다 */
      nextRot: geometry.rotation,

      /* HOME-CANVAS-V2-EDITOR-1B — 회전도 상자를 바꾸지 않는다.
         이동과 같은 이유로 시작값만 들고 있는다. */
      originX: geometry.originX,
      originY: geometry.originY,

      baseWidth: geometry.baseWidth,
      baseHeight: geometry.baseHeight,
      generation: state.generation,
      saved: api.read(el),
      nextX: geometry.x,
      nextY: geometry.y,
      nextW: geometry.width,
      nextH: geometry.height,
      cancelled: false
    };

    state.lastMoveGate = "ok";

    return true;

  }


  function onCanvasRotate(event) {

    const gesture =
      state.drag;

    if (!gesture || gesture.cancelled || gesture.kind !== CANVAS_ROTATE_KIND) {
      return;
    }

    if (!gesture.el.isConnected) {
      cancelDrag("detached");
      return;
    }

    const api =
      positionApi();

    if (!api) {
      cancelDrag("no-renderer");
      return;
    }

    const dist =
      (event && Number.isFinite(event.dist)) ? event.dist : null;

    if (dist === null) {
      return;
    }

    /* ★ 시작값 + **누적** 회전량이다(위 머리말) */
    const raw =
      gesture.baseRot + dist;

    gesture.rawRot =
      roundCanvasCoord(raw);

    /* =====================================================
       HOME-CANVAS-MANUAL-UX-FIX-1 — 30° 자석(계약 §21-1)

       ★ 아직 돌지 않았으면(dist 0) 자석도 걸지 않는다. 걸면
         손잡이를 **누르기만 한** 요소의 저장된 31° 가 화면에서
         30° 로 슬쩍 움직이고, 손을 놓는 순간 그것이 확정돼
         "고르기만 해도 각도가 바뀐다"가 된다.

       ★ 화면과 확정값에 **같은** 보정을 쓴다. 제스처 중에 보이던
         각도와 저장된 각도가 다르면 손을 놓을 때 그림이 튄다.
    ====================================================== */
    const snapped =
      dist === 0 ? gesture.baseRot : snapCanvasRotation(raw);

    gesture.viewRot =
      roundCanvasCoord(snapped);

    gesture.nextRot =
      normalizeCanvasRotation(snapped);

    try {

      /* 끄는 동안 움직이는 것은 이 **한 칸**이다 — 상자 네 칸도
         JSON 도 draft 도 Undo 도 한 글자 바뀌지 않는다(§18-5) */
      api.setRotation(gesture.el, gesture.viewRot);

    }
    catch (err) {
      cancelDrag("write-failed");
    }

  }


  function onCanvasRotateEnd() {

    const gesture =
      state.drag;

    if (!gesture || gesture.kind !== CANVAS_ROTATE_KIND) {
      return;
    }

    state.drag = null;

    if (gesture.cancelled) {
      return;
    }

    /* =====================================================
       돌지 않았다 — 확정도, 기록도 없다(§17-6).

       ★ 판정은 **연속 각도**로 한다. 접은 값으로 보면 손잡이를
         누르기만 한 요소의 저장된 400° 가 40° 로 조용히 바뀐다 —
         이번 제스처가 실제로 돌린 것만 저장한다.

       ★ 그 연속 각도는 자석이 붙기 **전**의 날것이다
         (HOME-CANVAS-MANUAL-UX-FIX-1). 자석이 붙은 값으로 보면
         저장된 31° 를 고르고 손잡이를 누르기만 해도 30° 가
         확정된다 — 그것은 이번 제스처가 돌린 것이 아니다.
    ====================================================== */
    /* ★ 자석이 제자리로 되돌린 제스처도 여기서 멈춘다.

       25° 에서 26° 로 조금 돌렸다가 다시 25° 쪽으로 온 것이 아니라,
       **30° 요소를 32° 까지 돌렸는데 자석이 30° 로 붙인** 경우다.
       확정 값이 시작 값과 같으므로 보낼 것이 없고, 보내면 아무것도
       바뀌지 않는 Undo 한 칸이 생긴다(계약 §21-1). */
    if (
      gesture.rawRot === gesture.baseRot ||
      gesture.nextRot === gesture.baseRot
    ) {
      restoreDragPosition(gesture);
      state.lastMoveGate = "no-rotate";
      return;
    }

    sendTransform(
      gesture,
      { rotation: gesture.baseRot },
      { rotation: gesture.nextRot }
    );

  }


  function onCanvasDrag(event) {

    const gesture =
      state.drag;

    if (!gesture || gesture.cancelled || gesture.kind !== CANVAS_MOVE_KIND) {
      return;
    }

    if (!gesture.el.isConnected) {
      cancelDrag("detached");
      return;
    }

    const api =
      positionApi();

    if (!api) {
      cancelDrag("no-renderer");
      return;
    }

    /*
      ★ 시작값 + **누적** 이동량이다.

      직전 프레임의 delta 를 계속 더하면 반올림이 매 프레임 쌓여
      한 번의 드래그 안에서도 어긋난다. 여기서는 언제나 시작
      clientX/Y 와의 차이를 쓰므로 프레임 수와 무관하다(§17-3).
    */
    const dx =
      (event.clientX - gesture.startX) / gesture.scale;

    const dy =
      (event.clientY - gesture.startY) / gesture.scale;

    /* =====================================================
       HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 후속 — 화면 가장자리에서
       **화면과 저장값이 함께** 멈춘다(계약 §30-4-1).

       render.css §7 이 표시 쪽에서 이미 이 범위로 자른다. 저장값을
       자르지 않으면 가장자리에서 더 끄는 동안 화면은 멈추고 x 만
       계속 바뀐다 — 확정 뒤에도 튀지는 않지만 "지금 보이는 자리"가
       저장된 자리가 아니게 된다.

       ★ 누적 식(`baseX + dx`)은 그대로 두고 **결과만** 자른다.
         매 프레임 기준을 옮기면 반올림이 쌓인다(§17-3).
    ====================================================== */
    gesture.nextX =
      roundCanvasCoord(
        clampCanvasPageX(gesture.baseX + dx, gesture.pageBounds));

    gesture.nextY = roundCanvasCoord(gesture.baseY + dy);

    try {

      api.set(
        gesture.el,
        gesture.nextX,
        gesture.nextY,
        gesture.baseWidth,
        gesture.baseHeight
      );

    }
    catch (err) {
      cancelDrag("write-failed");
    }

  }


  function onCanvasDragEnd() {

    const gesture =
      state.drag;

    if (!gesture || gesture.kind !== CANVAS_MOVE_KIND) {
      return;
    }

    state.drag = null;

    if (gesture.cancelled) {
      return;
    }

    /* 움직이지 않았다 — 확정도, 기록도 없다(§17-6) */
    if (gesture.nextX === gesture.baseX && gesture.nextY === gesture.baseY) {
      restoreDragPosition(gesture);
      state.lastMoveGate = "no-move";
      return;
    }

    sendTransform(
      gesture,
      { x: gesture.baseX, y: gesture.baseY },
      { x: gesture.nextX, y: gesture.nextY }
    );

  }


  /* =========================================================
     sendTransform(gesture, expected, next)

     제스처가 끝난 뒤의 **확정 요청** — 이동과 리사이즈가 함께 쓴다.
     다른 것은 `kind` 와 `expected` · `next` 의 칸뿐이고, 기다림 ·
     요청 번호 · 상한 시간 · 진단은 한 벌이다.

     ★ 임시 값을 **그대로 둔 채** 답을 기다린다.

     여기서 먼저 시작 값으로 되돌리면 승인된 경우에도 한 프레임
     제자리로 튀었다가 다시 간다. 부모의 답(새 geometry)이 그
     기다림을 끝낸다 — 승인이면 방금 값을 그대로 확정하고, 거부면
     부모가 내려 준 현재 값으로 되돌아간다.
  ========================================================== */

  function sendTransform(gesture, expected, next) {

    if (typeof opts.onTransform !== "function") {
      restoreDragPosition(gesture);
      state.lastMoveGate = "no-channel";
      return;
    }

    state.requestSeq += 1;

    gesture.requestId = state.requestSeq;

    state.pending = gesture;

    state.moveCount += 1;

    state.lastCommit = {
      kind: gesture.kind,
      id: gesture.id,
      expected: expected,
      next: next,
      generation: gesture.generation,
      requestId: gesture.requestId
    };

    state.lastSettle = "pending";

    syncDraggable();

    try {

      opts.onTransform({
        kind: gesture.kind,
        id: gesture.id,
        expected: expected,
        next: next,
        generation: gesture.generation,
        requestId: gesture.requestId
      });

    }
    catch (err) {
      /* 보내지 못했으면 기다릴 것도 없다 — 그 자리로 되돌린다 */
      state.pending = null;
      restoreDragPosition(gesture);
      state.lastSettle = "cancel:send-failed";
      syncDraggable();
      return;
    }

    clearPendingTimer();

    /* 답이 아예 오지 않는 경우(프레임 교체 · 부모 오류)에도 임시
       값이 영영 남지 않게 한다 */
    state.pendingTimer =
      win.setTimeout(
        () => {

          state.pendingTimer = 0;

          if (state.pending === gesture) {
            state.pending = null;
            restoreDragPosition(gesture);
            state.lastSettle = "timeout";
            syncDraggable();
          }

        },
        CANVAS_COMMIT_TIMEOUT_MS
      );

  }


  /* =========================================================
     setGeometry(payload) — 부모가 내려 준 단일 선택의 Canvas geometry

     payload = { active, id, x, y, width, height,
                 baseWidth, baseHeight, generation }

     ★ 두 가지 일을 한다.

       1) 다음 제스처의 **시작 값**을 정한다(이동은 x · y, 리사이즈는
          거기에 width · height 까지).
       2) 확정을 기다리는 중이었다면 그 기다림을 **끝낸다** —
          승인이면 받은 값이 방금 놓은 값과 같고, 거부면 예전
          값이라 화면이 제자리로 돌아간다. 프레임은 둘을 구분해
          행동하지 않는다: 언제나 "부모가 말한 값"으로 맞춘다.

     ★ `height` 는 숫자이거나 `"auto"` 다(계약 §6). 프레임은 그 둘을
       그대로 들고 있다가 리사이즈에서 가른다 — 여기서 숫자로
       바꿔치기하지 않는다.
  ========================================================== */

  /* 조작의 시작값이 될 수 있는 높이인가 */
  function usableGeometryHeight(value) {

    return (
      value === CANVAS_AUTO_HEIGHT ||
      (Number.isFinite(value) && value > 0)
    );

  }


  function setGeometry(payload) {

    if (state.disposed) {
      return;
    }

    const value =
      (payload && typeof payload === "object" && payload.active === true)
        ? {
            id: typeof payload.id === "string" ? payload.id : "",
            x: payload.x,
            y: payload.y,
            width: payload.width,
            height: payload.height,

            /* HOME-CANVAS-TRANSFORM-1C — 시작 각도. 요소에 `rotation`
               이 없으면 부모가 0 으로 만들어 보낸다(계약 §5) */
            rotation: payload.rotation,

            /* =================================================
               HOME-CANVAS-V2-EDITOR-1B — 자의 기준 상자와 origin

               ★ **선택 칸이다.** v1 요소와 v2 overlay 의 자는
                 도화지이고 origin 은 0 이라, 부모가 그 칸을 싣지
                 않아도 지금까지와 똑같이 움직여야 한다. 그래서
                 여기서 기본값을 채운다 — 없는 것과 "도화지 · 0" 을
                 적은 것이 같은 뜻이다(계약 §5 의 그 규칙).
            ================================================== */
            scopeId:
              (typeof payload.scopeId === "string" && payload.scopeId)
                ? payload.scopeId
                : "",
            originX: Number.isFinite(payload.originX) ? payload.originX : 0,
            originY: Number.isFinite(payload.originY) ? payload.originY : 0,

            /* HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록이면 "block"
               (계약 §29-4). 모르는 값은 자유 배치 요소로 읽는다. */
            mode: payload.mode === "block" ? "block" : null,

            baseWidth: payload.baseWidth,
            baseHeight: payload.baseHeight,
            generation:
              Number.isInteger(payload.generation) ? payload.generation : -1
          }
        : null;

    /* 진단 — 마지막 몇 개의 geometry 메시지. "승인인데 왜 되돌아갔나"를
       다시 재현하지 않고 읽을 수 있게 남긴다. */
    state.geometryLog.push(
      value
        ? `${value.id}${value.scopeId ? "/" + value.scopeId : ""}` +
            `@${value.x},${value.y} ${value.width}x${value.height}` +
            `r${value.rotation}#${value.generation}${state.pending ? "*" : ""}`
        : `off${state.pending ? "*" : ""}`
    );

    if (state.geometryLog.length > 8) {
      state.geometryLog.shift();
    }

    const usable =
      !!value &&
      CANVAS_ELEMENT_ID_PATTERN.test(value.id) &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      Number.isFinite(value.width) && value.width > 0 &&
      usableGeometryHeight(value.height) &&
      /* 각도 없이는 회전을 시작할 수 없다 — 크기와 같은 이유로
         **선택 칸이 아니다**(계약 §19-6) */
      Number.isFinite(value.rotation) &&
      /* HOME-CANVAS-V2-EDITOR-1B — 자의 기준 상자가 지정됐으면 그
         상자가 **지금 화면에 있어야** 한다. 없으면 자를 만들 수
         없으므로 조작을 켜지 않는다(§26-2). origin 은 자기 상자
         안의 분수다. */
      (!value.scopeId || !!canvasScopeBox(value.scopeId)) &&
      value.originX >= 0 && value.originX <= 1 &&
      value.originY >= 0 && value.originY <= 1 &&
      value.baseWidth > 0 &&
      value.baseHeight > 0 &&
      value.generation >= 0;

    state.geometry =
      usable ? value : null;

    /* =====================================================
       HOME-CANVAS-V2-MANUAL-FIX-1 — 무엇을 고르든 **손잡이가 그
       선택에 맞아야** 한다(계약 §29-4).

       좌표는 선택 **뒤에** 따로 내려오므로(§17), setMoveableTarget
       이 돌 때 이 문서는 아직 "블록인가"를 모른다. 그래서 그 값이
       실제로 달라졌을 때 한 번 더 맞춘다 — 손잡이 여덟이 블록에
       남거나, 자유 요소에 좌우 둘만 남는 일이 없게.
    ====================================================== */
    state.geometryMode =
      (usable && value.mode === "block") ? "block" : null;

    /* 끄는 동안에는 손대지 않는다 — 제스처 도중에 손잡이를 다시
       만들면 잡고 있던 그 노드가 사라진다. */
    if (!state.drag) {
      syncMoveableHandles();
    }


    /* =====================================================
       끌고 있는 중에 좌표가 왔다.

       ★ 시작 좌표가 그대로면 **같은 선택을 다시 확정한 것**이다
         (위 apply 의 함정 주석). 진행 중인 제스처가 새 순번을
         받아 간다 — 확정이 그 순번으로 올라가야 부모의 관문을
         지난다.

       ★ 시작 좌표가 달라졌으면 그 사이에 draft 가 바뀐 것이다
         (Undo · Import · AI 적용). 지금 끌고 있는 값은 더 이상
         근거가 없으므로 접는다(§9).
    ====================================================== */

    if (state.drag) {

      /* ★ **다섯 칸을 모두** 본다(1C 에서 각도가 늘었다). 이동 중에
         폭이나 각도가 달라졌다는 것도 "그 사이에 draft 가 바뀌었다"
         이고, 그때의 제스처는 이미 옛 화면을 근거로 한 것이다. */
      /* HOME-CANVAS-V2-EDITOR-1B — 자까지 함께 본다. 같은 요소라도
         자의 기준 상자나 origin 이 달라졌다면(프레임 크기를 바꾼
         편집 · Undo) 지금 끌고 있는 값은 더 이상 근거가 없다. */
      if (
        usable &&
        value.id === state.drag.id &&
        value.x === state.drag.baseX &&
        value.y === state.drag.baseY &&
        value.width === state.drag.baseW &&
        value.height === state.drag.baseH &&
        value.rotation === state.drag.baseRot &&
        value.originX === state.drag.originX &&
        value.originY === state.drag.originY
      ) {
        state.drag.generation = value.generation;
      }
      else {
        cancelDrag("geometry");
      }

    }


    /* =====================================================
       ★ 답은 **번호가 붙은 것 하나**다.

       좌표 메시지는 이 답 말고도 나온다 — 선택이 바뀔 때, 다시
       그린 뒤, draft 가 바뀔 때마다. 실제로 확정이 부모에 닿기
       **전에** 확정 전 값을 그대로 담은 좌표가 한 번 더 내려왔고,
       그것을 답으로 읽었더니 승인된 이동이 "거부됐다"가 되어
       제자리로 돌아갔다(2026-09-21 이 라운드의 e2e 가 잡았다).

       그래서 기다리는 동안에는 **자기 요청 번호를 단 메시지**만
       답으로 받는다. 나머지는 다음 이동의 시작점만 갱신한다.
    ====================================================== */

    const pending =
      (state.pending && payload && payload.answering === state.pending.requestId)
        ? state.pending
        : null;

    if (pending) {

      const api =
        positionApi();

      const el =
        elementFor(pending.id);

      state.pending = null;

      clearPendingTimer();

      /* =================================================
         HOME-CANVAS-V2-MANUAL-FIX-1 — 블록의 답(계약 §29-4)

         블록에는 좌표 네 칸이 없다. 여기서 api.setBox 를 부르면
         **블록에 자유 요소의 변수와 height 속성**을 쓰게 되고,
         그 한 줄이 `data-imory-canvas-height` 를 "auto" 로 바꿔
         저장된 숫자 높이를 화면에서 지운다. 그래서 블록의 답은
         인라인 폭을 걷어내는 것뿐이고, 승인이든 거부든 부모가
         다시 그린 DOM 이 정답을 그린다.
      ================================================= */
      if (pending.kind === CANVAS_WIDTH_KIND) {

        restoreDragPosition(pending);

        state.lastSettle =
          (usable && value.id === pending.id && value.width === pending.nextW)
            ? "accepted"
            : "restored";

      }
      else if (usable && value.id === pending.id) {

        /* =================================================
           ★ 판정은 **값**으로 한다 — 그릴 수 있었는가가 아니라.

           승인된 확정 뒤에는 부모가 화면을 다시 그린다. 그래서 이
           메시지를 처리하는 순간 우리가 끌던 노드가 이미 새 노드로
           갈려 있을 수 있다. 그것을 "되돌렸다"로 적으면 정상적으로
           저장된 이동이 실패로 보인다(2026-09-21 이 라운드의 e2e 가
           실제로 그렇게 읽었다).

           부모가 말한 값이 우리가 부탁한 값과 같으면 승인이다.
           화면은 새 DOM 이 이미 그 자리에 그려 놓았거나, 아래
           한 줄이 맞춰 준다.
        ================================================= */

        if (api && el) {

          try {

            /* ★ 네 칸을 한 벌로 맞춘다. 이동의 답에서도 그렇게 한다 —
               부모가 말한 값이 곧 지금 draft 이고, 그 중 세 칸이
               이동 때문에 달라질 일이 없으니 같은 값을 다시 쓰는
               것뿐이다(§18-5). */
            api.setBox(
              el,
              {
                x: value.x,
                y: value.y,
                width: value.width,
                height: value.height
              },
              value.baseWidth,
              value.baseHeight
            );

            /* HOME-CANVAS-TRANSFORM-1C — 각도도 같은 한 벌로 맞춘다.
               회전의 답에서는 접힌 값이 내려오고(365° → 5°), 이동 ·
               리사이즈의 답에서는 시작값이 그대로 내려온다. */
            api.setRotation(el, value.rotation);

          }
          catch (err) {
            /* 이미 갈린 노드다 — 새 DOM 이 제자리를 그린다 */
          }

        }

        state.lastSettle =
          (
            value.x === pending.nextX &&
            value.y === pending.nextY &&
            value.width === pending.nextW &&
            value.height === pending.nextH &&
            value.rotation === pending.nextRot
          )
            ? "accepted"
            : "restored";

      }
      else {

        restoreDragPosition(pending);

        state.lastSettle = "restored";

      }

    }

    syncDraggable();

  }


  /*
    topCanvasElementAt(x, y)

    그 자리에서 **가장 위에 있는** 캔버스 요소. lasso 와 본체 이동을
    가르는 판정이다(§17-2).

      고를 수 있는 요소가 위에 있다  → 그 요소(= lasso 금지)
      잠긴 요소가 위에 있다          → null (배경처럼 본다)
      도화지 바탕                    → null (lasso)

    숨긴 요소는 상자가 없어 애초에 이 목록에 오지 않고, `pointer-events:
    none` 인 것(사용자 JS 효과 레이어 · Moveable control box)도 오지
    않는다 — 브라우저의 elementsFromPoint 가 이미 걸러 준다.
  */
  function topCanvasElementAt(x, y) {

    const root =
      canvasRoot();

    if (!root || typeof doc.elementsFromPoint !== "function") {
      return null;
    }

    const stack =
      doc.elementsFromPoint(x, y) || [];

    for (let i = 0; i < stack.length; i += 1) {

      let el =
        stack[i];

      while (el && el.nodeType === 1) {

        /* 도화지 바탕에 먼저 닿았다 — 이 자리에는 요소가 없다 */
        if (el === root) {
          return null;
        }

        if (
          typeof el.hasAttribute === "function" &&
          el.hasAttribute(CANVAS_ELEMENT_ATTR) &&
          root.contains(el)
        ) {

          return el.getAttribute(CANVAS_LOCKED_ATTR) === "true" ? null : el;

        }

        el = el.parentElement;

      }

    }

    return null;

  }


  /* =========================================================
     HOME-CANVAS-SELECT-1B-2 — Selecto (lasso)

     ★ 프레임은 **제안만** 한다. 확정은 부모다.
  ========================================================== */

  function syncSelectoSelection(elements) {

    if (!state.selecto || typeof state.selecto.setSelectedTargets !== "function") {
      return;
    }

    try {
      state.selecto.setSelectedTargets(elements.filter(Boolean));
    }
    catch (err) {
      /* 내부 상태 동기화 실패는 화면에 영향이 없다 */
    }

  }


  function propose(ids, primary, mode) {

    if (typeof opts.onPropose !== "function") {
      return;
    }

    state.lastProposed = ids.slice();
    state.lastProposedMode = mode;

    try {

      opts.onPropose({
        ids: ids.slice(),
        primaryId: primary,
        mode: mode,
        generation: state.generation < 0 ? 0 : state.generation
      });

    }
    catch (err) {
      /* 제안이 실패해도 화면은 지금 상태 그대로다 */
    }

  }


  /*
    포인터 정책(§4)

    손가락으로는 lasso 를 시작하지 않는다 — 한 손가락 드래그가
    세로 스크롤인지 선택 상자인지 가를 방법이 없고, 가로채면 모바일
    Preview 가 스크롤되지 않는다. 모바일에서는 SELECT-1A 의 단일
    탭 선택이 그대로 남는다.

    ★ `(pointer: fine)` 만 믿지 않는다 — 터치와 마우스가 함께 있는
      기기에서 그 질의는 참이고, 그래도 그 순간의 입력은 손가락일
      수 있다. **실제 이벤트의 종류**를 먼저 본다.
  */
  function isCoarsePointerEvent(event) {

    if (!event) {
      return false;
    }

    if (typeof event.pointerType === "string") {
      return event.pointerType === "touch";
    }

    return typeof event.type === "string" && event.type.indexOf("touch") === 0;

  }


  /* 그 자리가 도화지 안인가 — 도화지 요소를 dragContainer 로 주지
     않는 대신 좌표로 판정한다(위 lassoSelectoOptions 주석) */
  function pointInsideCanvas(x, y) {

    const root =
      canvasRoot();

    if (!root || typeof x !== "number" || typeof y !== "number") {
      return false;
    }

    const box =
      root.getBoundingClientRect();

    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

  }


  /* 마지막 드래그가 어디서 걸렸는가 — 진단용 한 줄. 이 realm
     안에서만 읽힌다(debugState). */
  function gate(reason) {

    state.lastGate = reason;

    return reason === "ok";

  }


  function lassoDragCondition(event) {

    state.dragAllowed = false;

    if (state.disposed || !state.editing) {
      return gate("not-editing");
    }

    const input =
      event ? event.inputEvent : null;

    if (isCoarsePointerEvent(input)) {
      return gate("coarse-pointer");
    }

    /* 보조 버튼으로는 시작하지 않는다 */
    if (input && typeof input.button === "number" && input.button !== 0) {
      return gate("not-primary-button");
    }

    if (!pointInsideCanvas(event.clientX, event.clientY)) {
      return gate("outside-canvas");
    }

    /*
      ★ Moveable 의 control 요소에서 시작한 드래그는 Selecto 의
        것이 아니다.

      이번 단계에는 핸들이 없지만(전부 꺼 두었다), 조작이 들어오는
      HOME-CANVAS-TRANSFORM-1 에서 핸들을 잡고 끄는 순간 lasso 가
      같이 시작되면 둘이 싸운다. Spike 가 확인한 충돌 방지 계약을
      지금 넣어 둔다.
    */
    const target =
      input ? input.target : null;

    if (
      target &&
      state.moveable &&
      typeof state.moveable.isMoveableElement === "function" &&
      state.moveable.isMoveableElement(target)
    ) {
      return gate("moveable-control");
    }

    /* ★ 이동 손잡이도 같다(HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 ·
       계약 §30-2). 위 판정은 요소의 **class** 에 `moveable-` 이
       들어 있는가인데(번들 실측 — `isMoveableElement`), 우리 손잡이는
       라이브러리가 만든 것이 아니라 그 이름이 없다. 이 줄이 없으면
       손잡이를 짚은 드래그가 lasso 로도 읽혀 **방금 고른 것이
       풀린다**(2026-09-22 실측: 이동은 저장됐는데 선택이 비었다). */
    if (nodeIsMoveGrip(target)) {
      return gate("move-grip");
    }

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 요소 위에서 시작한 끌기는
       lasso 가 아니다(§17-2).

       ★ SELECT-1B-2 에서는 `preventDragFromInside:false` 로 두어
         **요소 위에서도** lasso 가 시작됐다. 도화지 전체를 덮는
         배경 사진이 흔해서 시작할 빈 자리가 없었기 때문이다. 이제
         그 자리에서 시작한 끌기는 "이 요소를 옮긴다"는 뜻이 될 수
         있으므로 둘을 갈라야 한다.

         고를 수 있는 요소 위     lasso 시작 금지
                                  (고른 요소면 Moveable 이 옮기고,
                                   아니면 아무 일도 없다 — 먼저
                                   클릭해서 고른다)
         잠긴 요소 위             배경처럼 보고 lasso 허용
         빈 도화지                lasso

       그래서 배경 사진 위에서 lasso 를 하려면 그 사진을 잠근다 —
       "건드리지 않겠다"는 표시가 곧 "배경으로 쓰겠다"가 된다.
    ====================================================== */

    if (topCanvasElementAt(event.clientX, event.clientY)) {
      return gate("canvas-element");
    }

    state.dragAllowed = true;

    return gate("ok");

  }


  function onLassoEnd(event) {

    if (state.disposed || !state.editing || !state.dragAllowed) {
      return;
    }

    /*
      끌지 않은 클릭이다 — 여기서는 아무 일도 하지 않는다. 단일
      클릭은 지금까지처럼 프레임 Inspector 가 맡는다(SELECT-1A).
      이것을 빼먹으면 평범한 클릭 하나가 "아무것도 못 잡은 lasso"가
      되어 방금 만든 선택을 지운다.
    */
    if (event && event.isClick) {
      state.lastGate = "click-not-drag";
      return;
    }

    state.lassoCount += 1;

    const hit =
      (event && Array.isArray(event.selected)) ? event.selected : [];

    state.lastHit = hit.length;
    state.lastSelectable = selectableElements().length;

    const ids =
      hit
        .map((el) => (el && el.getAttribute) ? el.getAttribute(CANVAS_EDIT_ID_ATTR) : null)
        .filter((id, index, list) =>
          typeof id === "string" &&
          CANVAS_ELEMENT_ID_PATTERN.test(id) &&
          list.indexOf(id) === index
        );

    const shift =
      !!(event && event.inputEvent && event.inputEvent.shiftKey);

    if (!ids.length) {

      /* Shift + 빈 lasso 는 기존 선택을 그대로 둔다(§5) */
      if (shift) {
        return;
      }

      propose([], undefined, "replace");

      return;

    }

    propose(ids, ids[ids.length - 1], shift ? "toggle" : "replace");

  }


  function ensureSelecto() {

    if (state.selecto || !state.selectoCtor || state.disposed) {
      return;
    }

    try {

      state.selecto =
        new state.selectoCtor(
          lassoSelectoOptions(doc, selectableElements, lassoDragCondition, frameNonce())
        );

      state.selecto.on("selectEnd", onLassoEnd);

      pinEditorStyleSheetsSoon();

      /* 지금 선택을 내부 상태에도 맞춰 둔다 */
      syncSelectoSelection(targetElements().filter(Boolean));

    }
    catch (err) {

      state.selecto = null;

      fail(err);

    }

  }


  function destroySelecto() {

    if (!state.selecto) {
      return;
    }

    try {
      state.selecto.destroy();
    }
    catch (err) {
      /* 이미 사라진 문서일 수 있다 */
    }

    state.selecto = null;

  }


  /* =========================================================
     Shift + 클릭 (§5)

     ★ 왜 window capture 인가

     두 프레임의 Inspector 는 **document capture** 에서 pointerdown
     을 받아 그 자리에서 전파를 끊는다(skin/sandbox/skin-sandbox-inspect.js ·
     studio/preview/preview-inspect-direct.js). capture 경로는
     Window → Document → … 이므로 window 에 건 capture 리스너가
     **먼저** 돈다. 거기서 전파를 끊으면 Inspector 의 "하나만 고르기"가
     아예 돌지 않는다.

     ★ 그래도 캔버스 요소 위의 Shift 클릭에서만 끊는다. 그 밖의
       모든 입력은 손대지 않고 지금까지의 경로로 흘려보낸다.
  ========================================================== */

  function shiftPickAt(event) {

    if (typeof win.pickInspectableAtPoint !== "function") {
      return null;
    }

    const container =
      renderRoot();

    if (!container || typeof doc.elementsFromPoint !== "function") {
      return null;
    }

    const stack =
      doc.elementsFromPoint(event.clientX, event.clientY);

    const found =
      win.pickInspectableAtPoint(
        stack,
        container,
        (el) => (el && el.getAttribute) ? el.getAttribute(CANVAS_EDIT_ID_ATTR) : null,
        win
      );

    const el =
      found ? found.primary : null;

    if (!el || !el.hasAttribute(CANVAS_ELEMENT_ATTR)) {
      return null;
    }

    const id =
      el.getAttribute(CANVAS_EDIT_ID_ATTR);

    return (typeof id === "string" && CANVAS_ELEMENT_ID_PATTERN.test(id)) ? id : null;

  }


  /*
    ★ 뒤따라오는 click 하나를 삼킨다.

    native Preview 의 Inspector 는 **click** 으로 고른다. pointerdown
    의 전파를 끊어도 click 은 따로 오므로, 그것까지 막지 않으면
    Shift 로 더한 선택이 곧바로 "하나만 고르기"로 덮인다. gesto 가
    끌기 뒤에 하는 것과 같은 방식이다(window capture · 한 번만).
  */
  function swallowNextClick() {

    const once =
      (clickEvent) => {

        win.removeEventListener("click", once, true);

        clickEvent.stopPropagation();

        if (typeof clickEvent.stopImmediatePropagation === "function") {
          clickEvent.stopImmediatePropagation();
        }

        clickEvent.preventDefault();

      };

    win.addEventListener("click", once, true);

    /* click 이 아예 오지 않는 경우(취소 · 포커스 이동)를 위해 한
       박자 뒤에 스스로 걷는다 — 다음 클릭을 잘못 삼키지 않게. */
    win.setTimeout(() => win.removeEventListener("click", once, true), 700);

  }


  function onShiftPointerDown(event) {

    state.shiftPress = null;

    if (state.disposed || !state.editing || !event.shiftKey) {
      return;
    }

    if (isCoarsePointerEvent(event)) {
      return;
    }

    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }

    /* 도화지 밖은 우리 일이 아니다 — 평범한 Inspector 선택이
       그대로 간다(소유권이 넘어가는 길). */
    if (!pointInsideCanvas(event.clientX, event.clientY)) {
      return;
    }

    /* =====================================================
       여기부터는 이 입력의 주인이 우리다.

       요소 위든 빈 자리든 **Shift + 도화지 안**은 캔버스 편집의
       입력이다. Inspector 의 "하나만 고르기"가 돌면 방금 더한
       선택이 곧바로 덮이고, 빈 자리에서는 통째로 지워진다
       (§5 "Shift + 빈 곳은 기존 선택 유지").
    ====================================================== */

    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    swallowNextClick();

    const id =
      shiftPickAt(event);

    if (!id) {
      return;
    }

    /*
      ★ 제안은 **누를 때가 아니라 뗄 때** 낸다.

      Shift 를 누른 채 끌면 그것은 Shift + lasso 다(§5). 누르는
      순간 토글해 버리면 lasso 결과와 두 번 겹쳐 엉뚱한 집합이
      된다. 그래서 여기서는 기억만 하고, 움직이지 않은 채 뗐을
      때만 토글한다.
    */
    state.shiftPress = {
      id: id,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId
    };

  }


  function onShiftPointerUp(event) {

    const press =
      state.shiftPress;

    state.shiftPress = null;

    if (!press || state.disposed || !state.editing) {
      return;
    }

    if (press.pointerId !== undefined && event.pointerId !== press.pointerId) {
      return;
    }

    /* 끌었으면 lasso 의 몫이다 */
    const moved =
      Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y);

    if (moved > SHIFT_CLICK_SLOP) {
      return;
    }

    /* 그 요소가 아직 거기 있는가 */
    if (!elementFor(press.id)) {
      return;
    }

    propose([press.id], press.id, "toggle");

  }


  function on(target, type, handler) {

    target.addEventListener(type, handler, true);

    state.listeners.push([target, type, handler]);

  }


  /* =========================================================
     apply(payload) — 부모가 확정한 선택

     ★ vendor 는 여기서 **처음** 불린다. 그것도 위 세 관문
       (active · primaryId · 지금 DOM 에 그 캔버스 요소가 있다)을
       전부 지난 뒤에만이다. 그래서

         공개 HOME · 공개 sandbox HOME · Studio 를 열기만 한 상태 ·
         Select 모드만 켠 상태 · 일반 template 요소 선택 ·
         Canvas 가 없는 스킨

       은 전부 요청 0 이다 — 이 controller 가 아예 만들어지지 않거나,
       만들어져도 이 줄에 닿지 않는다.
  ========================================================== */

  function apply(payload) {

    if (state.disposed) {
      return false;
    }


    const value =
      (payload && typeof payload === "object") ? payload : null;


    const generation =
      (value && Number.isInteger(value.generation)) ? value.generation : 0;

    /* 이미 지나간 선택의 메시지다(늦게 도착) */
    if (generation < state.generation) {
      return false;
    }

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 선택이 갈리면 제스처도 끝이다(§9).

       ★ 순번이 올랐다고 취소하지 않는다. **같은 요소를 다시
         확정한 것**이면 이어 간다.

       함정: sandbox 프레임의 Inspector 는 **pointerdown** 에서
       고른다(skin/sandbox/skin-sandbox-inspect.js). 그래서 이미
       고른 요소를 끌기 시작하는 그 순간에도 "이것을 골랐다"가 한
       번 더 올라가고, 부모는 같은 선택을 새 순번으로 확정해 내려
       준다. 그 메시지는 언제나 dragStart **뒤에** 도착한다
       (postMessage 는 비동기다). 그것을 취소로 읽으면 sandbox 에서는
       이동이 **한 번도 성립하지 않는다**(2026-09-21 실측).

       그래서 가르는 기준을 순번이 아니라 **무엇을 골랐는가**로
       둔다. 같은 단독 선택이면 진행 중인 제스처가 새 순번을
       받아 간다(아래) — 확정도 그 순번으로 올라가므로 부모의
       "최신 순번인가" 관문을 그대로 지난다.
    ====================================================== */

    const stillSame =
      !!state.drag &&
      !!value &&
      value.active === true &&
      Array.isArray(value.ids) &&
      value.ids.length === 1 &&
      value.ids[0] === state.drag.id &&
      value.primaryId === state.drag.id;

    if (generation !== state.generation && !stillSame) {
      cancelDrag("generation");
    }

    state.generation = generation;

    state.lastPayload = value;


    /* =====================================================
       HOME-CANVAS-SELECT-1B-2 — 편집 모드가 관문이다

       1B-1 에서는 "첫 요소를 골랐을 때"가 vendor 를 켜는 자리였다.
       이제 lasso 가 **아무것도 고르지 않은 상태에서** 시작돼야
       하므로 관문이 한 칸 앞으로 온다: 부모가 editing:true 를
       내려보낸 순간이다.

       그 판정은 전부 부모가 한다 — Studio 안의 Preview · HOME ·
       유효하고 활성화된 home_canvas · 표식 하나 · Select 모드.
       Canvas 가 없는 스킨에서는 editing 이 참이 되지 않으므로
       거기서는 여전히 요청 0 이다.
    ====================================================== */

    const editing =
      !!(value && value.editing === true);


    state.editing = editing;


    if (!editing) {

      state.geometry = null;

      state.layoutShape = "";

      detach();

      destroySelecto();

      return false;

    }


    /* HOME-CANVAS-V2-ELEMENTS-1 — 지금 화면에서 프레임이 어디에
       놓였는가. 선택과 무관하므로(묶을 프레임은 고르지 않은 채로도
       고를 수 있다) 이 관문 바로 뒤에서 한 번 본다. 값이 그대로면
       메시지는 나가지 않는다. */
    reportLayout();


    /* 부모가 승인한 목록 — 지금 화면에 실제로 있는 것만 남긴다.
       비슷한 다른 요소로 바꿔 주지 않는다(없으면 그냥 빠진다). */

    const wanted =
      (value && value.active === true && Array.isArray(value.ids))
        ? value.ids.filter((id) => !!elementFor(id))
        : [];


    /* 끌고 있던 요소가 더 이상 **단독 선택**이 아니다 — 제스처를
       접는다(선택 변경 · 삭제 · 다중 선택으로 넓힘, §9) */
    if (
      state.drag &&
      (wanted.length !== 1 || wanted[0] !== state.drag.id)
    ) {
      cancelDrag("selection");
    }


    state.targetIds = wanted;


    if (state.ctor) {

      ensureMoveable(selectableElements()[0] || null);
      ensureSelecto();

      if (!wanted.length) {
        detach();
        return false;
      }

      return attach(targetElements());

    }


    /* vendor 를 아직 받지 않았다 — 이 문서에서 처음이다 */

    if (state.vendorPending) {
      return false;
    }

    state.vendorPending = true;

    ensureCanvasEditorVendorLoader(doc)
      .then((ensure) => ensure())
      .then(
        (vendors) => {

          state.vendorPending = false;

          /* 기다리는 사이에 편집이 꺼졌다 */
          if (state.disposed || !state.editing) {
            return;
          }

          if (!vendors || typeof vendors.Moveable !== "function") {
            fail(new Error("Moveable 생성자를 받지 못했습니다"));
            return;
          }

          state.ctor = vendors.Moveable;

          state.selectoCtor =
            (typeof vendors.Selecto === "function") ? vendors.Selecto : null;

          ensureMoveable(selectableElements()[0] || null);
      ensureSelecto();

          /* 기다리는 사이에 선택이 갈렸을 수 있다 — 지금 값으로
             다시 판정한다(늦게 온 vendor 가 옛 선택을 그리지 않게) */
          const current =
            targetElements();

          if (!state.targetIds.length || current.some((el) => !el)) {
            detach();
            return;
          }

          attach(current);

        }
      )
      .catch(
        (err) => {

          state.vendorPending = false;

          if (state.disposed) {
            return;
          }

          fail(err);

        }
      );

    return false;

  }


  /*
    onRender() — 이 문서가 화면을 다시 그렸다.

    같은 id 의 요소가 새 DOM 으로 다시 만들어졌을 수 있고, 아예
    사라졌을 수도 있다(캔버스 제거 · HOME 이탈 · 요소 삭제).
    마지막 payload 를 같은 관문에 한 번 더 태운다 — generation 은
    그대로이므로 위 "늦게 도착" 판정에 걸리지 않는다.
  */
  function onRender() {

    if (state.disposed) {
      return;
    }

    /* 화면이 다시 그려졌다 — 끌고 있던 노드는 이미 없다(§9).
       확정을 기다리는 중이었다면 그 답은 곧 새 좌표로 온다. */
    cancelDrag("render");

    if (!state.lastPayload) {
      detach();
      return;
    }

    apply(state.lastPayload);

  }


  function dispose() {

    cancelDrag("dispose");

    abandonPendingCommit("dispose");

    state.disposed = true;

    stopFollow();

    destroySelecto();

    if (state.moveable) {

      try {
        state.moveable.destroy();
      }
      catch (err) {
        /* 이미 사라진 문서일 수 있다 */
      }

      state.moveable = null;

    }

    /* 이동 손잡이는 control box 의 자식이라 대개 함께 사라지지만,
       라이브러리가 그 상자를 남겨 두는 경우가 있다(markControlBox 의
       ★) — 우리가 만든 것은 우리가 걷는다. */
    if (state.moveGrip && state.moveGrip.parentElement) {
      state.moveGrip.parentElement.removeChild(state.moveGrip);
    }

    state.moveGrip = null;

    if (state.layoutRaf) {
      win.cancelAnimationFrame(state.layoutRaf);
      state.layoutRaf = 0;
    }

    state.layoutSettle = 0;

    state.listeners.forEach(
      ([target, type, handler]) => {
        target.removeEventListener(type, handler, true);
      }
    );

    state.listeners = [];

    clearPendingTimer();

    state.targetIds = [];
    state.lastPayload = null;
    state.geometry = null;
    state.editing = false;

    report(false);

  }


  /* Shift + 클릭 — window capture(위 머리말). controller 가 살아
     있는 동안 한 번만 등록하고, 첫 줄에서 editing 을 확인해
     빠져나간다("껐는데 하나가 남아 있다"를 만들지 않는다). */
  on(win, "pointerdown", onShiftPointerDown);
  on(win, "pointerup", onShiftPointerUp);

  on(win, "pointercancel", function () {

    state.shiftPress = null;

    /* HOME-CANVAS-TRANSFORM-1A — 손을 놓은 것이 아니라 입력이
       끊긴 것이다(§9). 확정하지 않고 시작 자리로 돌린다. */
    cancelDrag("pointercancel");

  });


  /* =========================================================
     HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 후속 — 창 폭이 바뀌면
     프레임의 자리 · 폭을 다시 알린다(계약 §30-3-1)

     ★ 따라가기 루프만으로는 모자란다. 그 루프는 **선택이 있을 때만**
       돌기 때문에, 아무것도 고르지 않은 채 창 폭을 바꾸거나
       MOBILE/DESKTOP 을 전환하면 부모가 든 `w` 는 앞 화면의 것이다.
       그 상태에서 곧바로 묶기 · 빼기를 누르면 옛 폭으로 변환된다
       (2026-09-22 실측: 1280 시절의 0.234375 가 960 화면에 남아
       있었다).

     ★ **여러 프레임에 걸쳐** 다시 잰다. 전환이 한 프레임에 끝나지
       않을 수 있고(레이아웃 · 애니메이션), 값이 그대로면 메시지는
       나가지 않는다(`layoutShape` 지문). 그래서 헛도는 비용이 없다.

     ★ ResizeObserver 를 켜지 않는다 — 관측기를 두 벌 두지 않는다는
       이 파일의 규칙 그대로다(displayOnlyMoveableOptions 의 ★).
       `resize` 는 이 프레임 문서의 뷰포트가 바뀔 때 오고, 그것이
       곧 `100vw` · `100cqw` 가 바뀌는 때다.
  ========================================================== */

  on(win, "resize", function () {
    scheduleLayoutResettle();
  });


  function scheduleLayoutResettle() {

    if (state.disposed || !state.editing) {
      return;
    }

    state.layoutSettle = CANVAS_LAYOUT_SETTLE_FRAMES;

    if (state.layoutRaf) {
      return;
    }

    const step = () => {

      state.layoutRaf = 0;

      if (state.disposed || !state.editing) {
        state.layoutSettle = 0;
        return;
      }

      reportLayout();

      state.layoutSettle -= 1;

      if (state.layoutSettle > 0) {
        state.layoutRaf = win.requestAnimationFrame(step);
      }

    };

    state.layoutRaf = win.requestAnimationFrame(step);

  }


  /* =========================================================
     HOME-CANVAS-TRANSFORM-1A — Escape 는 이동을 취소한다(§9)

     ★ 끄는 동안에만 가로챈다. 그때는 이 키의 뜻이 "지금 옮기던
       것을 없던 일로"이고, 그대로 흘려보내면 Inspector 가 **선택
       까지** 풀어 버린다(skin/sandbox/skin-sandbox-inspect.js ·
       studio/preview/preview-inspect-direct.js 의 Escape). 끌고
       있지 않을 때는 손대지 않는다 — 그 키의 기존 뜻 그대로다.
  ========================================================== */

  on(win, "keydown", function (event) {

    if (!state.drag || event.key !== "Escape") {
      return;
    }

    cancelDrag("escape");

    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    event.preventDefault();

  });


  return {

    apply: apply,
    onRender: onRender,
    setGeometry: setGeometry,
    dispose: dispose,

    isActive: function () {
      return !!(state.moveable && state.targetIds.length);
    },

    /* 진단용 — 같은 realm 안에서만 읽힌다. 이 창구로 선택을 바꿀
       수는 없다(읽기 전용). */
    debugState: function () {

      const box =
        controlBoxElement();

      let rect = null;

      if (state.moveable && state.targetIds.length) {

        try {

          const value =
            state.moveable.getRect();

          rect = {
            left: value.left,
            top: value.top,
            width: value.width,
            height: value.height,
            rotation: value.rotation,
            pos1: value.pos1,
            pos2: value.pos2,
            pos3: value.pos3,
            pos4: value.pos4
          };

        }
        catch (err) {
          rect = null;
        }

      }

      const targets =
        (state.moveable && typeof state.moveable.getTargets === "function")
          ? state.moveable.getTargets()
          : [];

      return {
        /* 1B-1 과의 호환 — 단일 선택에서는 같은 값을 읽는다 */
        targetId: primaryId(),
        targetIds: state.targetIds.slice(),
        primaryId: primaryId(),
        editing: state.editing,
        generation: state.generation,
        hasInstance: !!state.moveable,

        /*
          ★ "인스턴스가 몇 개인가"는 **우리가 표시한 바깥 상자**로
            센다. `.moveable-control-box` 의 DOM 수로 세면 안 된다 —
            MoveableGroup 은 감싸는 상자 하나에 **자식 target 당 하나**
            를 더 그리므로, 둘을 고르면 정상 동작에서도 3 이 된다
            (0.53.0 실측). 아래 controlBoxes 가 그 날것의 수다.
        */
        instances: doc.querySelectorAll('[data-imory-canvas-frame="1"]').length,
        controlBoxes: doc.querySelectorAll(".moveable-control-box").length,
        moveableTargets: targets ? targets.length : 0,
        /* HOME-CANVAS-TRANSFORM-1A — "지금 끌면 옮겨지는가".
           able 은 언제나 켜져 있고, 판정은 이 관문 하나다. */
        draggable: dragGate() === "ok",
        dragGate: dragGate(),
        dragging: !!state.drag,
        dragKind: state.drag ? state.drag.kind : "",
        pendingCommit: !!state.pending,

        /* =================================================
           HOME-CANVAS-TRANSFORM-1B — 지금 이 **문서 전체**에서
           실제로 잡을 수 있는 리사이즈 손잡이.

           ★ control box 하나만 세지 않는다. MoveableGroup 은 감싸는
             상자 말고 자식 target 마다 상자를 하나 더 그리므로
             (§15 의 controlBoxes 주석), "여럿을 골랐을 때 잡을
             손잡이가 없다"는 문서 전체로 세어야 참이 된다.

           ★ DOM 에 남아 있는 것과 잡을 수 있는 것은 다르다.

           0.53.0 은 target 을 풀면 control box 를 `display:none` 으로
           만들 뿐 **자식 손잡이를 지우지 않는다**(2026-09-21 실측:
           선택이 비었는데 노드는 여덟 그대로였다). 그래서 노드 수로
           세면 "고른 것이 없는데 손잡이가 여덟"이 된다. 실제로 화면에
           있는 것만 세려면 상자를 물어봐야 한다 —
           `getClientRects().length` 는 display:none 인 조상 밑에서 0 이다.

           `hit` 는 거기에 더해 pointer-events 까지 살아 있는 것의
           수다(control box 의 `none` 을 되돌려 받았는가 — §18-11).
        ================================================= */
        resizeHandles: resizeHandleNodes(false).length,
        resizeHandleDirections:
          resizeHandleNodes(false).map(
            (handle) => handle.getAttribute("data-direction")
          ),
        resizeHandleHit: resizeHandleNodes(true).length,

        /* HOME-CANVAS-TRANSFORM-1C — 회전 손잡이는 **하나**이고,
           같은 자로 센다(화면에 있는 것 · 잡을 수 있는 것) */
        rotationHandles: rotationHandleNodes(false).length,
        rotationHandleHit: rotationHandleNodes(true).length,

        /* HOME-CANVAS-MANUAL-UX-FIX-1 — 편집 chrome 이 표시할
           여유. **표시 전용**이고 저장 geometry 와는 무관하다
           (계약 §21-4). */
        chromePadding:
          state.chromePadding
            ? {
                left: state.chromePadding.left,
                top: state.chromePadding.top,
                right: state.chromePadding.right,
                bottom: state.chromePadding.bottom
              }
            : null,

        geometry:
          state.geometry
            ? {
                id: state.geometry.id,
                x: state.geometry.x,
                y: state.geometry.y,
                width: state.geometry.width,
                height: state.geometry.height,
                rotation: state.geometry.rotation,
                generation: state.geometry.generation
              }
            : null,
        moveCount: state.moveCount,

        /* HOME-CANVAS-V2-MANUAL-FIX-1 — 지금 고른 것이 흐름 블록인가
           (부모가 내려 준 값 · 계약 §29-4) */
        geometryMode: state.geometryMode,
        targetIsBlock: targetIsFlowBlock(),

        lastMoveGate: state.lastMoveGate,
        lastCommit: state.lastCommit,
        lastSettle: state.lastSettle,
        geometryLog: state.geometryLog.slice(),

        hasSelecto: !!state.selecto,
        selectoInstances: doc.querySelectorAll(".selecto-selection").length,
        lassoCount: state.lassoCount,
        lastGate: state.lastGate,
        lastProposed: state.lastProposed,
        lastProposedMode: state.lastProposedMode,
        lastHit: state.lastHit,
        lastSelectable: state.lastSelectable,
        controlBoxDisplay: box ? box.style.display : null,
        /* 테두리 **네 줄**. 회전 손잡이의 막대
           (`.moveable-rotation-line`)는 외곽이 아니므로 빼고 센다
           (HOME-CANVAS-TRANSFORM-1C). */
        lines: box
          ? box.querySelectorAll(".moveable-line:not(.moveable-rotation-line)").length
          : 0,
        rect: rect
      };

    }

  };

}
