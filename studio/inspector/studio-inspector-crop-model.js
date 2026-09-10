/* =========================================================
   SKIN STUDIO — 이미지 자르기 모델 (순수 계산)

   studio-inspector-model.js와 같은 성격의 파일이다 — DOM 이벤트도
   postMessage도 SkinPackage도 모른다. Studio(studio/inspector/
   studio-inspector-crop.js)와 Preview iframe(studio/preview/
   preview-bridge.js)이 **같은 숫자**를 만들어야 하므로, 두 문서에
   각각 로드되는 이 한 파일에만 계산을 둔다(전역을 공유하지 않는
   두 browsing context라서 파일을 나눠 둘 수밖에 없다).

   ★ 자르기 값은 네 개뿐이다
       ratio  프레임 가로/세로 (aspect-ratio 문자열)
       zoom   확대 배율 1.0 ~ 4.0
       x, y   구도 -1 ~ +1 (0 = 가운데)

     x/y가 px가 아니라 -1~+1인 이유: 프레임 폭은 모바일에서
     max-width:100%로 줄어든다. px로 적어 두면 그때 구도가 어긋나고
     프레임 밖으로 사진이 빠져 빈틈이 생긴다. 정규화해 두면 CSS가
     전부 %로 표현되므로 어떤 폭에서도 같은 구도가 나온다.

   ★ 왜 래퍼가 필요한가
     확대(zoom)는 "프레임보다 큰 사진을 프레임이 잘라 보여주는 것"
     이라 잘라 줄 상자가 하나 더 있어야 한다. object-fit/
     object-position만으로는 원본 비율과 프레임 비율의 차이만큼만
     움직일 수 있고 확대는 아예 안 된다. object-view-box는 이 일을
     정확히 하지만 Firefox가 아직 구현하지 않아 공개 스킨에 쓸 수
     없다. 그래서 래퍼(overflow:hidden) + 그 안의 절대배치 <img>다.

   ★ 빈틈이 생기지 않는 이유 — 두 겹으로 막는다
     1) 사진 상자 자체가 프레임을 항상 덮는다.
        상자 크기 = zoom*100%, 왼쪽/위 = -(zoom*100-100) ~ 0 사이로
        clamp하므로 상자의 네 변이 프레임 밖에 있거나 같다.
     2) 그 상자 안은 object-fit: cover가 채운다.
        원본 비율을 몰라도 되고, 나중에 **다른 비율의 사진으로
        교체해도** 빈틈이 생기지 않는다(그래서 원본 비율을 CSS에
        구워 넣는 방식을 쓰지 않았다).

   ★ x/y가 두 CSS 속성으로 나뉘어 나가는 이유
     확대가 1.0이면 상자 = 프레임이라 상자를 움직일 여지가 없다.
     하지만 그때도 cover가 잘라낸 만큼(가로형 사진을 1:1 프레임에
     넣었을 때의 좌우)은 움직일 수 있어야 한다 — 그 몫이
     object-position이다. 확대하면 상자 여유(left/top)가 생기고,
     두 몫이 **같은 방향으로 함께** 움직이도록 부호를 맞춰 둔다.

       x = -1  왼쪽 끝    left = 0        object-position-x = 0%
       x =  0  가운데     left = -여유/2  object-position-x = 50%
       x = +1  오른쪽 끝  left = -여유    object-position-x = 100%

   classic script — 아래 전역 함수로 노출된다. 의존:
   studio/inspector/studio-inspector-model.js(inspectorAspectRatio)
   가 먼저 로드되어 있어야 한다(호출 시점 의존).
========================================================== */


/* 래퍼임을 알아보는 표식. 값으로 "프레임 폭이 사용자가 정한
   것인가"까지 같이 담는다 — 자르기 초기화가 폭을 되돌려 줄지
   말지를 이 한 글자로 가른다(아래 readInspectorCrop 참고).

     "1"      폭이 그냥 그때 화면에 보이던 크기였다
     "fixed"  사용자가 너비를 직접 정했다 */
const INSPECTOR_CROP_MARKER = "--imory-crop";

const INSPECTOR_CROP_ZOOM_MIN = 1;

const INSPECTOR_CROP_ZOOM_MAX = 4;

/* 프레임 비율 선택지. 앞의 둘은 숫자가 아니라 **뜻**이다.

     "free"     비율을 고정하지 않는다 — 프레임의 네 변과 모서리를
                끌어 가로/세로를 따로 정한다(자유 비율 라운드).
                고른 순간에는 지금 비율 그대로라 화면이 바뀌지
                않는다. 바뀌는 것은 "변 핸들이 나타난다" 하나다.
     "current"  지금 화면에 보이는 비율을 그대로 쓴다. */
const INSPECTOR_CROP_RATIO_PRESETS = [
  ["free", "자유", "free"],
  ["current", "현재 비율", null],
  ["1:1", "1:1", 1],
  ["4:3", "4:3", 4 / 3],
  ["3:2", "3:2", 3 / 2],
  ["16:9", "16:9", 16 / 9]
];


/* 자유 비율에서 프레임을 끌 때의 하한(px). 이보다 작아지면 변
   핸들끼리 겹쳐 프레임을 다시 잡을 수조차 없다. */
const INSPECTOR_CROP_FRAME_MIN = 24;


function inspectorCropRound(value) {

  return Math.round(Number(value) * 10000) / 10000;

}


function inspectorCropClampZoom(value) {

  const zoom =
    Number(value);

  if (!Number.isFinite(zoom)) {
    return INSPECTOR_CROP_ZOOM_MIN;
  }

  return inspectorCropRound(
    Math.min(Math.max(zoom, INSPECTOR_CROP_ZOOM_MIN), INSPECTOR_CROP_ZOOM_MAX)
  );

}


function inspectorCropClampOffset(value) {

  const offset =
    Number(value);

  if (!Number.isFinite(offset)) {
    return 0;
  }

  return inspectorCropRound(Math.min(Math.max(offset, -1), 1));

}


function inspectorCropNumberFrom(raw, unit) {

  const parsed =
    new RegExp(`^(-?[0-9]*\\.?[0-9]+)${unit}$`).exec(String(raw || "").trim());

  return parsed ? Number(parsed[1]) : null;

}


/* =========================================================
   normalizeInspectorCrop(crop) -> { ratio, zoom, x, y }

   ratio가 없으면 null 그대로 둔다 — 호출자가 "지금 보이는 비율"을
   넣어 줄 수 있게 하기 위해서다(프레임 비율이 없는 자르기는
   만들지 않는다).
========================================================== */

function normalizeInspectorCrop(crop) {

  const source =
    crop || {};

  return {
    ratio:
      (typeof window !== "undefined" && typeof window.inspectorAspectRatio === "function")
        ? window.inspectorAspectRatio(source.ratio)
        : (source.ratio ? String(source.ratio) : null),
    zoom: inspectorCropClampZoom(source.zoom),
    x: inspectorCropClampOffset(source.x),
    y: inspectorCropClampOffset(source.y)
  };

}


/* =========================================================
   buildInspectorCropDeclarations(crop, options)
     -> { frame: {...}, image: {...} }

   options.frameWidth  프레임 가로 px (없으면 width를 쓰지 않는다)
   options.fixedWidth  그 폭이 사용자가 정한 값인가

   두 곳이 이 결과를 쓴다:
     - Studio  확정 CSS 규칙의 선언으로(= 저장된다)
     - iframe  임시 미리보기의 inline style로(= 저장되지 않는다)

   image 쪽에 margin: 0을 함께 넣는 이유 — 절대배치라 left/top이
   상자의 자리를 정하는데, 스킨이 그 이미지에 margin을 줘 뒀으면
   그만큼 밀려 빈틈이 생긴다.
========================================================== */

function buildInspectorCropDeclarations(crop, options) {

  const value =
    normalizeInspectorCrop(crop);

  const settings =
    options || {};

  const zoomPercent =
    inspectorCropRound(value.zoom * 100);

  /* 상자가 프레임보다 큰 만큼(%). 확대 1.0이면 0이다. */
  const slack =
    Math.max(0, zoomPercent - 100);

  const frame = {};

  frame[INSPECTOR_CROP_MARKER] =
    settings.fixedWidth ? "fixed" : "1";

  frame.display = "block";
  frame.position = "relative";
  frame.overflow = "hidden";
  frame["aspect-ratio"] = value.ratio;
  frame["max-width"] = "100%";

  if (Number.isFinite(Number(settings.frameWidth)) && Number(settings.frameWidth) > 0) {
    frame.width = `${Math.round(Number(settings.frameWidth))}px`;
  }

  return {
    frame,
    image: {
      position: "absolute",
      left: `${inspectorCropRound(-slack * (1 + value.x) / 2)}%`,
      top: `${inspectorCropRound(-slack * (1 + value.y) / 2)}%`,
      width: `${zoomPercent}%`,
      height: `${zoomPercent}%`,
      "max-width": "none",
      "min-width": "0",
      margin: "0",
      "object-fit": "cover",
      "object-position":
        `${inspectorCropRound(50 + 50 * value.x)}% ${inspectorCropRound(50 + 50 * value.y)}%`
    }
  };

}


/* =========================================================
   inspectorCropTravelPx(crop, frame) -> { x, y }

   "이 구도를 한쪽 끝에서 반대쪽 끝까지 옮기면 사진이 실제로 몇 px
   움직이는가". x/y는 -1~+1이므로 이 값이 곧 **2만큼의 이동에
   해당하는 px**이다.

   ★ 왜 필요한가
   드래그는 원래 프레임 폭을 그대로 이동 한계로 썼다(x -= 2*dx/폭).
   하지만 실제로 움직일 수 있는 거리는 프레임 폭이 아니라

       확대로 생긴 여유            (zoom - 1) * 프레임크기
     + cover가 잘라낸 몫           상자 안에서 넘치는 만큼

   둘의 합이다. 확대 1.4배·213px 프레임이면 세로로 실제 움직일 수
   있는 거리는 85px인데 213px로 나누고 있었으니, 손은 80px를 끌어도
   사진은 32px밖에 따라오지 않았다("상하 구도 조절이 어렵다").
   이 함수로 나누면 **포인터와 사진이 1:1로 움직인다.**

   ★ 0이면 그 축은 아예 움직일 수 없다 — 확대가 1.0이고 원본 비율이
   프레임 비율과 같은 축이 그렇다. 그때는 안내 문구를 띄운다
   (studio-inspector-crop.js).

   frame: { width, height, naturalWidth, naturalHeight }
   원본 크기를 모르면 cover 몫은 0으로 둔다 — 확대 여유만 남으므로
   "실제보다 덜 움직인다"가 아니라 "덜 움직일 수 있다고 본다"라서
   빈틈이 생기는 쪽으로는 틀리지 않는다.
========================================================== */

function inspectorCropTravelPx(crop, frame) {

  const value =
    normalizeInspectorCrop(crop);

  const box =
    frame || {};

  const frameWidth =
    Number(box.width) > 0 ? Number(box.width) : 0;

  const frameHeight =
    Number(box.height) > 0 ? Number(box.height) : 0;

  if (!frameWidth || !frameHeight) {
    return { x: 0, y: 0 };
  }

  const boxWidth =
    frameWidth * value.zoom;

  const boxHeight =
    frameHeight * value.zoom;

  /* 확대로 생긴 여유 — 상자가 프레임보다 큰 만큼 */
  let travelX =
    Math.max(0, boxWidth - frameWidth);

  let travelY =
    Math.max(0, boxHeight - frameHeight);

  const naturalWidth =
    Number(box.naturalWidth) > 0 ? Number(box.naturalWidth) : 0;

  const naturalHeight =
    Number(box.naturalHeight) > 0 ? Number(box.naturalHeight) : 0;

  /* object-fit: cover가 상자 안에서 잘라낸 몫 — object-position이
     움직이는 거리다. 둘 중 한 축만 0이 아니다. */
  if (naturalWidth && naturalHeight) {

    const scale =
      Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);

    travelX += Math.max(0, naturalWidth * scale - boxWidth);
    travelY += Math.max(0, naturalHeight * scale - boxHeight);

  }

  return {
    x: inspectorCropRound(travelX),
    y: inspectorCropRound(travelY)
  };

}


/* =========================================================
   자유 비율 — 프레임을 바꿔도 사진이 제자리에 남게 하는 계산

   ★ 왜 필요한가
   자르기 값(zoom, x, y)은 전부 **프레임에 대한 비율**이다. 그래서
   프레임 높이를 절반으로 줄이면 확대 1.0인 사진도 함께 절반이
   된다 — 사용자가 기대하는 것은 "사진은 그대로 두고 아래위를 더
   잘라낸다"인데 실제로는 "사진이 작아진다"가 된다.

   그래서 변 핸들을 끌 때는 값 세 개를 그대로 두지 않고,
     (1) 바꾸기 **전** 프레임에서 사진이 차지하던 사각형을 재고
     (2) 바뀐 프레임에서 그 사각형이 그대로 남도록 zoom/x/y를 다시
         계산한다.
   원본 비율은 손대지 않는다(사진 상자는 항상 원본 비율 그대로
   커지고 작아진다) — 늘어나거나 찌그러지는 경우가 없다.

   ★ 좌표계
   inspectorCropPhotoRect()가 돌려주는 값은 **프레임 왼쪽 위를
   원점으로 한 px**이다. 프레임을 완전히 덮고 있으면 left/top은
   0 이하, right/bottom은 프레임 크기 이상이다.

     photoLeft = -(photoW - frameW) * (1 + x) / 2
       x = -1  왼쪽 끝을 맞춘다      left = 0
       x = +1  오른쪽 끝을 맞춘다    left = frameW - photoW

   left/top이 buildInspectorCropDeclarations의 두 CSS 속성
   (상자의 left/top + object-position)을 합친 결과와 같다는 것이
   이 계산의 근거다 — 두 몫이 같은 방향으로 함께 움직이도록 부호를
   맞춰 뒀기 때문에 합이 하나의 선형식이 된다(위 머리말 참고).
========================================================== */

/* 지금 확대에서 사진 상자가 실제로 그리는 크기(px). 원본 크기를
   모르면 cover 몫을 뺀 상자 자체를 사진으로 본다 — 그래야 "덜
   움직인다"로 틀리지, 빈틈이 생기는 쪽으로는 틀리지 않는다
   (inspectorCropTravelPx와 같은 태도다). */
function inspectorCropPhotoSize(zoom, frame, natural) {

  const frameWidth =
    Number(frame && frame.width) > 0 ? Number(frame.width) : 0;

  const frameHeight =
    Number(frame && frame.height) > 0 ? Number(frame.height) : 0;

  const boxWidth =
    frameWidth * zoom;

  const boxHeight =
    frameHeight * zoom;

  const naturalWidth =
    Number(natural && natural.width) > 0 ? Number(natural.width) : 0;

  const naturalHeight =
    Number(natural && natural.height) > 0 ? Number(natural.height) : 0;

  if (!naturalWidth || !naturalHeight) {
    return { width: boxWidth, height: boxHeight };
  }

  const scale =
    Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);

  return {
    width: naturalWidth * scale,
    height: naturalHeight * scale
  };

}


function inspectorCropPhotoRect(crop, frame, natural) {

  const value =
    normalizeInspectorCrop(crop);

  const frameWidth =
    Number(frame && frame.width) > 0 ? Number(frame.width) : 0;

  const frameHeight =
    Number(frame && frame.height) > 0 ? Number(frame.height) : 0;

  if (!frameWidth || !frameHeight) {
    return null;
  }

  const size =
    inspectorCropPhotoSize(value.zoom, frame, natural);

  return {
    left: -(size.width - frameWidth) * (1 + value.x) / 2,
    top: -(size.height - frameHeight) * (1 + value.y) / 2,
    width: size.width,
    height: size.height
  };

}


/* =========================================================
   inspectorCropFromPhotoRect(rect, frame, natural, previous)
     -> { ratio, zoom, x, y }

   위 계산의 역방향. "이 프레임에서 사진이 이 사각형에 오게 하려면
   zoom/x/y가 얼마여야 하는가".

   ★ 확대는 두 번 제한된다
     - 프레임을 덮지 못하는 크기는 애초에 들어오지 않는다(호출자가
       먼저 키운다). 그래도 계산 오차로 1 미만이 나오면 1로 올린다
       — 빈틈이 생기느니 사진이 조금 커지는 편이 낫다.
     - 상한(4배)에 걸리면 사진이 요청보다 작아진다. 그때는 작아진
       크기로 x/y를 다시 계산해야 프레임 밖으로 빠지지 않는다.

   ★ 움직일 여유가 없는 축은 이전 값을 그대로 둔다. 0으로 나눌 수
     없기도 하고, 여유가 없다가 다시 생겼을 때 구도가 가운데로
     튀지 않게 하기 위해서다(요구: 자유 ↔ 고정 전환에서 구도가
     초기화되지 않는다).
========================================================== */

function inspectorCropFromPhotoRect(rect, frame, natural, previous) {

  const base =
    normalizeInspectorCrop(previous);

  const frameWidth =
    Number(frame && frame.width) > 0 ? Number(frame.width) : 0;

  const frameHeight =
    Number(frame && frame.height) > 0 ? Number(frame.height) : 0;

  if (!rect || !frameWidth || !frameHeight) {
    return base;
  }

  const naturalWidth =
    Number(natural && natural.width) > 0 ? Number(natural.width) : 0;

  const naturalHeight =
    Number(natural && natural.height) > 0 ? Number(natural.height) : 0;

  /* 확대 1.0에서 사진이 그려지는 크기 — 원하는 크기를 이걸로
     나누면 곧 확대 배율이다. */
  const unit =
    inspectorCropPhotoSize(1, { width: frameWidth, height: frameHeight }, natural);

  const zoom =
    inspectorCropClampZoom(
      unit.width > 0
        ? Math.max(rect.width / unit.width, rect.height / unit.height)
        : 1
    );

  /* 상한에 걸렸을 수 있으므로 **실제로 그려질 크기**를 다시 잰다. */
  const actual =
    (naturalWidth && naturalHeight)
      ? inspectorCropPhotoSize(zoom, { width: frameWidth, height: frameHeight }, natural)
      : { width: frameWidth * zoom, height: frameHeight * zoom };

  const travelX =
    actual.width - frameWidth;

  const travelY =
    actual.height - frameHeight;

  return {
    ratio: base.ratio,
    zoom,
    x:
      travelX > 0.01
        ? inspectorCropClampOffset(-(2 * rect.left) / travelX - 1)
        : base.x,
    y:
      travelY > 0.01
        ? inspectorCropClampOffset(-(2 * rect.top) / travelY - 1)
        : base.y
  };

}


/* =========================================================
   inspectorCropResizeFrame(crop, from, to, anchor, natural)
     -> { ratio, zoom, x, y }

   변/모서리 핸들 하나가 만드는 값 전부. from -> to로 프레임이
   바뀌었을 때 **사진은 그 자리에 그대로 두고** 보이는 범위만
   바뀌게 한다.

   anchor는 "끌지 않은 쪽" — 그 변에서 잰 사진까지의 거리를 그대로
   유지한다. 오른쪽 변을 끌면 anchor.x는 "left"다.

     anchor.x  "left" | "right" | "center"
     anchor.y  "top"  | "bottom" | "center"

   ★ 늘릴 때만 확대를 보정한다. 프레임이 사진보다 커지면 빈틈이
     생기므로, 덮는 데 필요한 **최소 배율**만큼만 키운다(그 이상
     키우면 사용자가 정한 배율을 마음대로 바꾸는 것이 된다).
     확대는 고정된 변 쪽을 기준으로 한다 — 잡고 있는 변만 움직이고
     반대쪽은 가만히 있는 것으로 보인다.
========================================================== */

function inspectorCropResizePlan(crop, from, to, anchor, natural) {

  const rect =
    inspectorCropPhotoRect(crop, from, natural);

  const width =
    Number(to && to.width);

  const height =
    Number(to && to.height);

  if (!rect || !(width > 0) || !(height > 0)) {
    return null;
  }

  const side =
    anchor || {};

  const ax =
    side.x === "left" ? 0 : (side.x === "right" ? 1 : 0.5);

  const ay =
    side.y === "top" ? 0 : (side.y === "bottom" ? 1 : 0.5);

  /* 고정된 변에서 잰 거리를 그대로 옮긴다. 왼쪽이 고정이면(ax=0)
     사진의 left는 그대로, 오른쪽이 고정이면(ax=1) 프레임이 커진
     만큼 사진이 프레임 안에서 오른쪽으로 밀린 것으로 본다. */
  const growWidth =
    width - Number(from.width);

  const growHeight =
    height - Number(from.height);

  let left =
    rect.left + growWidth * ax;

  let top =
    rect.top + growHeight * ay;

  let photoWidth =
    rect.width;

  let photoHeight =
    rect.height;

  const cover =
    Math.max(1, width / photoWidth, height / photoHeight);

  if (cover > 1) {

    const pivotX =
      ax * width;

    const pivotY =
      ay * height;

    left = pivotX + (left - pivotX) * cover;
    top = pivotY + (top - pivotY) * cover;

    photoWidth *= cover;
    photoHeight *= cover;

  }

  /* 이 프레임에서 **그 크기의 사진**을 그리려면 확대가 얼마여야
     하는가. 상한(4배)을 넘으면 그 프레임은 만들 수 없다 — 만들면
     사진이 조용히 작아진다(아래 inspectorCropFitFrame). */
  const unit =
    inspectorCropPhotoSize(1, { width, height }, natural);

  const zoomNeeded =
    unit.width > 0 ? photoWidth / unit.width : 1;

  return {
    rect: { left, top, width: photoWidth, height: photoHeight },
    zoomNeeded: inspectorCropRound(zoomNeeded),
    limited: zoomNeeded > INSPECTOR_CROP_ZOOM_MAX + 0.0001
  };

}


function inspectorCropResizeFrame(crop, from, to, anchor, natural) {

  const plan =
    inspectorCropResizePlan(crop, from, to, anchor, natural);

  if (!plan) {
    return normalizeInspectorCrop(crop);
  }

  return inspectorCropFromPhotoRect(plan.rect, to, natural, crop);

}


/* =========================================================
   inspectorCropFitFrame(crop, from, to, anchor, natural)
     -> { width, height, limited }

   "요청한 프레임까지 갈 수 있는가, 없다면 어디까지 갈 수 있는가".

   ★ 왜 필요한가
   확대 상한은 4배다. 프레임을 아주 작게 줄이면서 사진 배율을
   그대로 두려면 그보다 큰 확대가 필요해지는데, 그때 그냥 상한에서
   자르면 **사진이 조용히 작아진다**(사용자는 프레임만 줄였는데
   사진 크기와 구도가 함께 바뀐다). 그래서 값을 자르는 대신
   **프레임을 그 지점에서 멈춘다** — 핸들이 손을 따라오지 않는
   순간이 곧 "여기가 한계다"라는 신호이고, UI가 함께 이유를 말한다
   (studio-inspector-crop.js 자르기 한계 안내).

   from -> to 선분 위에서 갈 수 있는 가장 먼 지점을 이분법으로
   찾는다. 상한 판정은 볼록(두 선형식의 max)이라 0쪽 구간이 곧
   답이고, 반복 횟수를 늘려도 값이 흔들리지 않는다.

   ★ 멈춘 지점은 **요청 반대쪽으로** 반올림한다 — 반올림 때문에
     한계를 반 픽셀 넘어가면 그만큼 사진이 작아진다.
========================================================== */

function inspectorCropFitFrame(crop, from, to, anchor, natural) {

  const start = {
    width: Number(from && from.width),
    height: Number(from && from.height)
  };

  const target = {
    width: Number(to && to.width),
    height: Number(to && to.height)
  };

  if (!(start.width > 0) || !(start.height > 0) || !(target.width > 0) || !(target.height > 0)) {
    return { width: target.width, height: target.height, limited: false };
  }

  const at = (t) => ({
    width: start.width + (target.width - start.width) * t,
    height: start.height + (target.height - start.height) * t
  });

  const fits = (t) => {

    const plan =
      inspectorCropResizePlan(crop, from, at(t), anchor, natural);

    return !plan || !plan.limited;

  };

  if (fits(1)) {
    return { width: target.width, height: target.height, limited: false };
  }

  let low =
    0;

  let high =
    1;

  for (let step = 0; step < 24; step += 1) {

    const mid =
      (low + high) / 2;

    if (fits(mid)) {
      low = mid;
    } else {
      high = mid;
    }

  }

  const box =
    at(low);

  const back = (value, origin) =>
    (value >= origin ? Math.floor(value) : Math.ceil(value));

  return {
    width: back(box.width, start.width),
    height: back(box.height, start.height),
    limited: true
  };

}


/* 자르기가 걸리면서 이미지 쪽 규칙에서 **빠져야 하는** 속성들.
   너비/비율은 이제 프레임이 갖는다(둘 다 갖고 있으면 "크기 조절과
   자르기가 서로 덮어쓴다"가 된다). */
const INSPECTOR_CROP_IMAGE_DROP =
  ["width", "height", "aspect-ratio", "max-width"];

/* 자르기가 걸리면 **프레임으로 옮겨 가는** 속성들 — 바깥 상자의
   생김새라서 이미지에 남아 있으면 잘린 뒤에 안 보인다. */
const INSPECTOR_CROP_FRAME_MOVE =
  ["border-radius", "border", "display", "margin-left", "margin-right", "text-align"];

/* 자르기를 풀 때 이미지 쪽에서 걷어내야 하는 속성들 — 위
   buildInspectorCropDeclarations(image)가 만든 것 전부. */
const INSPECTOR_CROP_IMAGE_CLEAR =
  [
    "position", "left", "top", "width", "height",
    "max-width", "min-width", "margin", "object-fit", "object-position"
  ];


/* =========================================================
   readInspectorCrop(frameDeclarations, imageDeclarations)
     -> { ratio, zoom, x, y, frameWidth, fixedWidth } | null

   저장된 CSS 선언에서 지금 자르기 값을 되읽는다. 다시 자르기를
   열었을 때 슬라이더와 비율 버튼이 지금 상태로 채워지는 근거이고,
   "래퍼가 중복으로 생기지 않는다"의 판정 근거이기도 하다.

   x/y는 object-position에서만 읽는다 — left/top에도 같은 값이
   들어 있지만 확대 1.0에서는 둘 다 0%라 값을 되찾을 수 없다.
   object-position은 확대와 무관하게 늘 x/y를 그대로 담고 있다.
========================================================== */

function readInspectorCrop(frameDeclarations, imageDeclarations) {

  const frame =
    frameDeclarations || {};

  const image =
    imageDeclarations || {};

  const marker =
    frame[INSPECTOR_CROP_MARKER];

  if (!marker) {
    return null;
  }

  const position =
    String(image["object-position"] || "50% 50%").trim().split(/\s+/);

  const percentX =
    inspectorCropNumberFrom(position[0], "%");

  const percentY =
    inspectorCropNumberFrom(position.length > 1 ? position[1] : position[0], "%");

  const widthPercent =
    inspectorCropNumberFrom(image.width, "%");

  return {
    ratio:
      (typeof window !== "undefined" && typeof window.inspectorAspectRatio === "function")
        ? window.inspectorAspectRatio(frame["aspect-ratio"])
        : (frame["aspect-ratio"] || null),
    zoom: inspectorCropClampZoom((widthPercent === null ? 100 : widthPercent) / 100),
    x: inspectorCropClampOffset(((percentX === null ? 50 : percentX) - 50) / 50),
    y: inspectorCropClampOffset(((percentY === null ? 50 : percentY) - 50) / 50),
    frameWidth: inspectorCropNumberFrom(frame.width, "px"),
    fixedWidth: String(marker).trim() === "fixed"
  };

}


/* =========================================================
   buildInspectorCropWrapperId(editId, isUsed) -> id

   래퍼도 CSS 규칙을 받아야 하므로 자기 식별자가 필요하다. 이미지
   id에서 파생시키되 실제로 비어 있는 이름만 고른다 — 파생 이름이
   우연히 다른 요소의 승격된 id와 같으면 두 요소가 같은 규칙을
   받는다.

   skin/skin-sanitize.js의 SKIN_SANITIZE_EDIT_ID_PATTERN(영문
   시작 / 최대 64자)을 넘지 않도록 앞을 먼저 자른다 — 넘으면 저장
   시점에 속성째 버려져 래퍼가 식별자를 잃는다.
========================================================== */

function buildInspectorCropWrapperId(editId, isUsed) {

  const base =
    `${String(editId || "e").slice(0, 58)}-c`;

  let candidate =
    base;

  let suffix =
    0;

  while (typeof isUsed === "function" && isUsed(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }

  return candidate;

}


if (typeof window !== "undefined") {

  window.INSPECTOR_CROP_MARKER = INSPECTOR_CROP_MARKER;
  window.INSPECTOR_CROP_ZOOM_MIN = INSPECTOR_CROP_ZOOM_MIN;
  window.INSPECTOR_CROP_ZOOM_MAX = INSPECTOR_CROP_ZOOM_MAX;
  window.INSPECTOR_CROP_RATIO_PRESETS = INSPECTOR_CROP_RATIO_PRESETS;
  window.INSPECTOR_CROP_FRAME_MIN = INSPECTOR_CROP_FRAME_MIN;
  window.INSPECTOR_CROP_IMAGE_DROP = INSPECTOR_CROP_IMAGE_DROP;
  window.INSPECTOR_CROP_FRAME_MOVE = INSPECTOR_CROP_FRAME_MOVE;
  window.INSPECTOR_CROP_IMAGE_CLEAR = INSPECTOR_CROP_IMAGE_CLEAR;

  window.inspectorCropClampZoom = inspectorCropClampZoom;
  window.inspectorCropClampOffset = inspectorCropClampOffset;
  window.normalizeInspectorCrop = normalizeInspectorCrop;
  window.buildInspectorCropDeclarations = buildInspectorCropDeclarations;
  window.inspectorCropTravelPx = inspectorCropTravelPx;
  window.inspectorCropPhotoSize = inspectorCropPhotoSize;
  window.inspectorCropPhotoRect = inspectorCropPhotoRect;
  window.inspectorCropFromPhotoRect = inspectorCropFromPhotoRect;
  window.inspectorCropResizePlan = inspectorCropResizePlan;
  window.inspectorCropResizeFrame = inspectorCropResizeFrame;
  window.inspectorCropFitFrame = inspectorCropFitFrame;
  window.readInspectorCrop = readInspectorCrop;
  window.buildInspectorCropWrapperId = buildInspectorCropWrapperId;

}
