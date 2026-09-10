# PHASE AI-6F — 자유 비율 자르기 · Inspector 슬라이더 정리

두 가지를 한 라운드에 넣었다. 둘 다 **공용 Inspector** 기능이다 —
특정 스킨(quiet-frame v6)에 맞춘 코드는 하나도 없다.

```
1  자르기 프레임 비율에 "자유"를 더한다
   프레임의 네 변과 네 모서리를 직접 끌어 가로·세로를 따로 정한다.
2  너비·확대·위치 X/Y 슬라이더를 한 모양으로 통일한다
   얇은 연회색 트랙 + 중간 회색 채움 + 흰 손잡이.
```

자르기의 **저장 방식은 그대로다** — 래퍼 `<span>` 하나 + CSS 규칙
두 개, `--imory-crop` 표식, x/y 정규화. 그 계약의 기준 문서는 계속
[AI_SKIN_PHASE_AI6D_IMAGE_CROP.md](./AI_SKIN_PHASE_AI6D_IMAGE_CROP.md)
이고 좌표 쪽은
[AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md](./AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md)
다. 여기에는 **이번에 바뀐 지점만** 적는다.

---

## 1. 자유 비율은 새 저장 형식이 아니다

프레임은 지금까지도 `width` + `aspect-ratio` 두 값으로 크기가 정해져
있었다. 고정 비율 버튼은 그중 `aspect-ratio`만 정해진 값으로
바꿨을 뿐이다.

```
고정 비율   aspect-ratio = 1 / 1.7778 / ...   (width는 그대로)
자유 비율   aspect-ratio = 지금 끌어 만든 가로/세로
```

그래서 **저장 형식도, 공개 렌더 경로도, sanitizer/CSS validator도
하나도 바뀌지 않았다.** Save / Export / Import / `get_published_skin`
전부 지금까지와 같은 문자열을 주고받는다.

`free`는 SkinPackage에 **저장되지 않는다.** 편집 중에만 존재하는
"비율을 잠그지 않는다"는 상태이고, 값 자체는 이미 `aspect-ratio`에
들어 있다. 다시 자르기를 열면 그 비율이 "현재 비율"로 채워진다.

---

## 2. 왜 프레임만 바꾸면 안 되는가 — 사진이 함께 커진다

자르기 값 셋은 전부 **프레임에 대한 비율**이다.

```
zoom   사진 상자 = 프레임 * zoom
x, y   -1 ~ +1   (프레임 안에서의 구도)
```

그래서 프레임 높이를 절반으로 줄이면 `zoom`이 1.0이어도 사진이 함께
절반이 된다. 사용자가 기대하는 것은 "사진은 그대로 두고 아래위를 더
잘라낸다"인데 실제로는 "사진이 작아진다"가 된다.

### 고친 방법 — 사진 사각형을 재고, 그대로 남도록 되계산한다

`studio/inspector/studio-inspector-crop-model.js`에 순수 함수 넷을
더했다(DOM도 postMessage도 모른다 — Studio와 Preview iframe이 **같은
숫자**를 만들어야 하므로 계산은 이 한 파일에만 둔다).

| 함수 | 하는 일 |
| --- | --- |
| `inspectorCropPhotoSize(zoom, frame, natural)` | 그 확대에서 사진이 실제로 그려지는 크기 |
| `inspectorCropPhotoRect(crop, frame, natural)` | 프레임 좌표계에서 사진이 차지하는 사각형 |
| `inspectorCropFromPhotoRect(rect, frame, natural, prev)` | 그 사각형이 되도록 하는 zoom/x/y (역방향) |
| `inspectorCropResizeFrame(crop, from, to, anchor, natural)` | 위 둘을 이어 붙인 것 — 변 핸들 하나가 만드는 값 전부 |

핵심은 `photoRect`의 한 줄이다. 상자의 `left/top`과 `object-position`
두 몫이 같은 방향으로 함께 움직이도록 부호를 맞춰 뒀기 때문에
(AI-6D 머리말), 둘의 합이 **하나의 선형식**이 된다.

```
photoLeft = -(photoW - frameW) * (1 + x) / 2

  x = -1  왼쪽 끝을 맞춘다     left = 0
  x = +1  오른쪽 끝을 맞춘다   left = frameW - photoW
```

역방향은 이 식을 x에 대해 풀면 된다. 움직일 여유(`photoW - frameW`)가
0인 축은 이전 값을 그대로 둔다 — 0으로 나눌 수 없기도 하고, 여유가
없다가 다시 생겼을 때 구도가 가운데로 튀지 않게 하기 위해서다.

### anchor — 잡지 않은 변이 기준점이다

```
오른쪽 변을 끈다  anchor.x = "left"   왼쪽 변에서 잰 거리를 유지
왼쪽 변을 끈다    anchor.x = "right"  오른쪽 변에서 잰 거리를 유지
아래 변          anchor.y = "top"
위 변            anchor.y = "bottom"
모서리           두 축 모두
```

**사진 계산과 프레임의 임시 위치가 같은 기준점을 쓴다**(아래 3절).
둘이 다르면 "프레임은 가만히 있는데 사진만 미끄러진다"가 된다.

### 늘릴 때만 확대를 보정한다

프레임이 사진보다 커지면 빈틈이 생긴다. 그때만, **덮는 데 필요한
최소 배율**만큼 키운다(그 이상 키우면 사용자가 정한 배율을 마음대로
바꾸는 것이 된다). 확대의 기준점도 고정된 변 쪽이라 잡고 있는 변만
움직이는 것으로 보인다.

줄일 때는 아무 것도 보정하지 않는다 — 사진 배율도 화면 위 자리도
그대로이고, 프레임만 작아져 보이는 범위가 줄어든다.

### 원본 비율은 어디서도 바뀌지 않는다

사진 상자 안은 계속 `object-fit: cover`다. 프레임을 어떤 모양으로
만들어도 사진은 **원본 비율 그대로** 커지고 작아지기만 한다 —
늘어나거나 찌그러지는 경로가 코드에 아예 없다.

### 비율 버튼도 같은 계산을 지난다

비율만 갈아 끼우면(처음에는 그랬다) zoom/x/y 숫자는 그대로여도
**화면의 사진은 함께 커지고 작아진다.** 자유 ↔ 고정을 오갈 때
구도가 흔들리던 것이 이 때문이다.

그래서 비율 버튼도 `inspectorCropResizeFrame()`을 지난다. 기준점은
**왼쪽 위**다 — 비율 버튼은 프레임 너비를 그대로 두고 높이만
바꾸므로 보통 흐름에서 프레임의 왼쪽 위는 제자리에 있고, 그 점을
기준으로 붙들면 화면 위 사진이 정확히 그대로 남는다. 프레임이
사진보다 커질 때만 덮는 데 필요한 최소 배율이 더해진다.

> zoom/x/y 숫자가 같다는 것은 구도 보존의 증거가 **되지 못한다** —
> 그 셋은 전부 프레임에 대한 비율이다. 그래서 테스트도 실제로
> 그려진 사진의 자리·크기로 판정한다(9절 P7 / 6).

### 확대 상한(4배)에 닿으면 프레임이 멈춘다

프레임을 아주 작게 줄이면서 사진 배율을 그대로 두려면 4배보다 큰
확대가 필요해진다. 그때 값을 상한에서 자르면 **사진이 조용히
작아진다** — 사용자는 프레임만 줄였는데 사진 크기와 구도가 함께
바뀐다.

그래서 값을 자르는 대신 **프레임을 그 지점에서 멈춘다**
(`inspectorCropFitFrame`). from → to 선분 위에서 갈 수 있는 가장 먼
지점을 이분법으로 찾고, 반올림은 요청 반대쪽으로 한다(반올림 때문에
반 픽셀 넘어가면 그만큼 사진이 작아진다). 핸들이 손을 따라오지 않는
순간이 곧 "여기가 한계다"라는 신호이고, 팝오버가 함께 이유를 말한다:

```
확대 한계(400%)에 닿아 여기까지만 줄일 수 있어요
— 더 줄이면 사진이 함께 작아져요.
```

한 축만 줄일 때는 대개 걸리지 않는다 — 다른 축이 `cover`를 잡아
주기 때문이다. 걸리는 것은 두 축을 함께 줄일 때다.

---

## 2-1. 잡은 변은 포인터를, 반대쪽 변은 제자리를

### 무엇이 문제였나

프레임은 보통 흐름 안에 있고, **폭이 바뀌면 정렬 규칙이 자리를 다시
정한다.**

```
가운데 정렬   폭을 10px 늘리면 양쪽 변이 5px씩 벌어진다
              → 잡은 변은 손의 절반만 따라온다
오른쪽 정렬   오른쪽 변을 끌어도 왼쪽 변이 움직인다
```

이동량을 2배로 키우는 방식은 **잡은 변만** 맞추고 반대쪽 변은 여전히
흔들리므로 답이 아니다.

### 어떻게 고쳤나 — 재고 그만큼 되민다

자르는 동안에만 프레임에 `translate`를 얹어 **고정하기로 한 변을
시작 자리에 붙여 둔다.** 정렬 규칙을 알아낼 필요가 없다 — 부모의
margin/flex/grid/text-align 조합을 전부 읽는 대신, iframe이 새 폭으로
한 번 배치한 **결과를 재서** 어긋난 만큼 되민다.

```
studio  crop.anchor = { x, y, left, top, right, bottom }
        "이 변이 이 좌표에 있어야 한다" (iframe 문서 좌표)
iframe  pinInspectorCropFrame(wrapper, anchor)
        translate를 걷고 → 재고 → 어긋난 만큼 다시 얹는다
```
(`studio/preview/preview-bridge.js`)

그러면 `잡은 변 = 고정된 변 ± 폭`이므로, 폭이 포인터를 따라오는 한
잡은 변도 포인터를 **1:1로** 따라온다. 정렬이 왼쪽이든 가운데든
오른쪽이든 같은 결과다.

### 임시 위치와 레이아웃 정렬은 다른 것이다

| | 자르는 동안 | 적용한 뒤 |
| --- | --- | --- |
| 자리를 정하는 것 | `translate`(임시 위치) | 스킨의 정렬 규칙 |
| 저장 CSS | 한 글자도 안 들어간다 | 크기(width·aspect-ratio)만 |
| 주변 글 | 밀리지 않는다(transform) | 새 높이만큼 따라 움직인다 |

`translate`는 임시 미리보기에만 얹힌다. "적용"을 누르면
`clearStudioInspectorPreview()`가 그것을 걷고, 프레임은 **새 크기
그대로 스킨의 정렬 규칙이 정한 자리**에 앉는다. `transform`이 아니라
`translate` 속성을 쓰는 이유는 스킨이 그 요소에 `transform`을 걸어
뒀더라도 덮어쓰지 않기 위해서다.

### 팝오버가 모서리 핸들을 덮지 않는다

자유 비율 핸들은 프레임 **밖으로** 나온다(변 막대 10px, 모서리
12px). 팝오버가 평소의 8px 간격만 두면 그 자리를 덮어 모서리 핸들이
눌리지 않는다(팝오버가 먼저 받는다). 자유 비율이 켜져 있는 동안에만
`STUDIO_INSPECTOR_CROP_HANDLE_REACH`(16px)만큼 더 비켜 앉는다
(`studioInspectorPopoverClearance`).

---

## 3. 핸들 — 짧고 얇은 막대, 넉넉한 판

핸들 8개는 Studio overlay의 자식이다(스킨 DOM에는 아무 것도 붙이지
않는다 — Inspector의 원칙). 좌표는 자르기 드래그 판과 **같은
`studioInspectorMapRect`(= 보이는 사각형)**를 쓴다. 조상 `overflow`가
프레임을 잘라내고 있으면 레이아웃 사각형에는 화면에 그려지지 않는
부분이 들어 있고, 그 자리에 손잡이를 두면 아무 것도 없는 곳을 잡게
된다(AI-6E가 드래그 판에 대해 같은 판단을 했다).

```
보이는 막대   변 3x26 / 26x3,  모서리 10x10
잡는 판       변 20x44 / 44x20, 모서리 24x24  (투명)
```

막대는 `::before`가 그린다. **얇게 만든 것은 보이는 막대뿐이고 잡는
자리는 그대로**라 터치에서도 3px짜리 선을 겨눌 필요가 없다.

핸들은 자르기 판보다 **뒤에 붙어 위에 온다** — 변을 잡으려던 손이
사진 드래그로 새지 않는다. 반대로 고정 비율에서는 8개 전부 내린다:
고정 비율에서 변을 끌면 방금 고른 1:1이 조용히 1.03:1이 된다.

### 크기 조절(비율 유지)과 자유 조절의 경계

| 조작 | 어디서 | 비율 |
| --- | --- | --- |
| 이미지 크기 조절(모서리 핸들 4개) | 자르지 않은 이미지 · 자른 프레임의 **너비** | 유지 |
| 자유 비율(변·모서리 8개) | 자르기 모드의 "자유" | 가로·세로 따로 |

둘은 동시에 화면에 나오지 않는다 — 자르는 동안에는 기존 모서리
핸들이 내려간다(`paintStudioInspectorHandles`, AI-6D부터 그랬다).

---

## 4. 삼등분 가이드선

자르기 드래그 판의 **자식**이다. 판이 `hidden`이면 함께 사라지므로
"자르는 동안에만 보이고 적용하면 숨는다"를 따로 켜고 끌 코드가 없다.

선은 두 벌을 겹쳐 그린다 — 흰 선 위에 옅은 검은 선을 1px 비켜 두면
밝은 사진에서도 어두운 사진에서도 보인다. `pointer-events: none`이라
선 위를 끌어도 사진 드래그가 그대로 시작된다.

---

## 5. 슬라이더 — 넷이 한 규칙을 쓴다

`.studio-inspector-range` 하나가 너비 · 확대 · 위치 X · 위치 Y를
전부 그린다.

```
트랙      3px, --system-border-strong (#dddddd)
채움      --imory-gray-400 (#aaaaaa)
손잡이    12px 원, --system-bg 배경 + --imory-gray-300 (#cccccc) 테두리
비활성    트랙 #eeeeee · 채움 #dddddd · 테두리 #dddddd
```

전부 기존 디자인 토큰이다(`core/design-tokens.css`). 없앤 것:
`accent-color: var(--system-accent)` — 브라우저 기본 range에 핑크
채움을 얹던 한 줄이다.

### 왜 브라우저 기본을 껐나

`accent-color`로는 트랙 두께도 손잡이 크기도 정할 수 없고, Chromium과
WebKit의 기본 모양이 서로 다르다. `appearance: none` 뒤에 트랙과
손잡이를 직접 그리는 수밖에 없었다.

### 채워진 구간 — `--imory-range-fill`

채움을 그려 주는 표준은 Firefox의 `::-moz-range-progress` 하나뿐이다.
그래서 Chromium/WebKit에서는 트랙 배경을 **가로 그라디언트**로 그리고
경계 위치만 JS가 넣어 준다.

```js
studioInspectorRangeFill(range)   // --imory-range-fill: <값 비율>%
bindStudioInspectorRange(range)   // input/change에 위 함수를 건다
```
(둘 다 `studio/inspector/studio-inspector-controls.js`)

값이 바뀌는 자리는 셋이다 — 끄는 중(`input`), 손을 뗀 뒤(`change`),
그리고 **프로그램이 값을 넣는 경우**. 셋째가 모서리 드래그다:
드래그가 너비 슬라이더를 따라 움직이게 하는
`syncStudioInspectorSizeInputs()`가 `studioInspectorRangeFill()`을
직접 부른다(값만 넣으면 `input` 이벤트가 나지 않아 막대가 얼어붙는다).

### 얇은 것은 막대뿐 — 조작 영역은 그대로

`input` 자체는 18px 높이를 유지하고, 3px 막대는 그 안에
`background-size: 100% 3px` + `background-position: center`로
세로 가운데에 그린다. 음수 `margin-top`으로 손잡이를 끌어올리는
흔한 방식보다 두 엔진 사이 차이가 적다(손잡이는 `margin-top: 3px`).

### 키보드 — 다시 그리기가 포커스를 먹던 문제

방향키 한 번마다 `change`가 나고, `change`는 팝오버를 다시 그린다.
그러면 잡고 있던 슬라이더 요소가 통째로 교체되어 **포커스가
사라지고, 화살표를 한 번 누른 뒤로는 값을 이어서 바꿀 수 없었다.**

`renderStudioInspectorPopover()`가 다시 그리기 **전에** 팝오버 안에
있던 포커스의 id를 기억하고, 같은 id의 컨트롤이 다시 만들어졌으면
포커스를 돌려준다. 팝오버 밖(예: AI 입력칸)에 있던 포커스는 건드리지
않는다. 슬라이더뿐 아니라 팝오버의 모든 컨트롤에 함께 적용된다.

포커스 표시는 `:focus-visible`에서 **손잡이에만** accent 링을 준다 —
input 전체에 `outline`을 주면 18px 판이 통째로 사각형에 둘러싸여
슬라이더처럼 보이지 않는다.

---

## 6. 파일

| 파일 | 이번 라운드에서 바뀐 것 |
| --- | --- |
| `studio/inspector/studio-inspector-crop-model.js` | `free` 프리셋 · `INSPECTOR_CROP_FRAME_MIN` · 사진 사각형 계산(`inspectorCropPhotoSize/PhotoRect/FromPhotoRect`) · `inspectorCropResizePlan/ResizeFrame` · 확대 상한에서 멈추는 `inspectorCropFitFrame` |
| `studio/inspector/studio-inspector-crop.js` | 자유 버튼 · 비율 버튼의 재계산(`chooseStudioInspectorCropRatio`) · 변/모서리 드래그 · 임시 위치 anchor · 한계 안내 · `paintStudioInspectorCropHandles()` |
| `studio/inspector/studio-inspector-overlay.js` | 핸들 8개 DOM · 가이드선 DOM · 변 드래그를 busy로 · `studioInspectorPopoverClearance()` |
| `studio/inspector/studio-inspector-state.js` | `studioInspectorCropSideDrag` · `studioInspectorCropHandles` · `studioInspectorCropLimited/LimitNote` · `STUDIO_INSPECTOR_CROP_HANDLE_EDGES` |
| `studio/inspector/studio-inspector-controls.js` | `studioInspectorRangeFill()` · `bindStudioInspectorRange()` · 포커스 복원 · 팝오버 shape에 `crop-free` |
| `studio/inspector/studio-inspector-image-size.js` | 너비 슬라이더에 bind + 드래그 중 채움 갱신 |
| `studio/inspector/studio-inspector.js` | 정리/Escape에 변 드래그 · 상태 창구에 `cropSizing` / `cropLimited` |
| `studio/inspector/studio-inspector.css` | 슬라이더 전체 · 핸들 8종 · 가이드선 · `.is-crop-sizing` · 한계 안내 |
| `studio/preview/preview-bridge.js` | `pinInspectorCropFrame()` — 임시 위치를 재고 되민다 |
| `studio/studio-preview.js` | 임시 미리보기 payload allowlist에 `crop.anchor` |

자르기의 **저장 형식**은 그대로다 — 자유 비율도 결국 `ratio` 문자열
하나이고, `translate`는 임시 미리보기에만 얹혀 확정 CSS에는 한 글자도
들어가지 않는다.

---

## 7. 지켜야 할 원칙

- 자유 비율은 **`aspect-ratio` 값 하나**다. 새 CSS 속성도 새 속성
  이름도 만들지 않는다 — 만드는 순간 sanitizer 허용 목록과 공개
  렌더 경로가 함께 넓어진다.
- 프레임을 바꿀 때 사진을 만지지 않는다. 바뀌는 것은 zoom/x/y 셋뿐
  이고, 그 셋은 **사진이 제자리에 남도록** 되계산된 값이다.
- **구도가 보존됐는지는 숫자가 아니라 화면으로 판단한다.** zoom/x/y는
  프레임에 대한 비율이라 같은 숫자로도 화면이 달라진다.
- 한계에 닿으면 **값을 자르지 말고 조작을 멈춘다.** 값을 자르면
  사용자가 만지지 않은 것(사진 배율·구도)이 조용히 바뀐다. 멈추고
  이유를 말하면 사용자가 다음 수를 고를 수 있다.
- **임시 위치와 레이아웃 정렬을 섞지 않는다.** 자르는 동안의
  `translate`는 미리보기에만 있고, 확정된 것은 크기뿐이다.
- 빈틈은 두 겹으로 막던 그대로다(AI-6D) — 상자가 프레임을 덮고,
  그 안을 `cover`가 채운다. 자유 비율이 더한 것은 "늘릴 때 최소
  확대 보정" 한 겹뿐이다.
- 핸들·드래그 판·선택 테두리는 **같은 사각형**(보이는 사각형)을
  쓴다. 하나만 다른 rect를 쓰면 그 순간 손과 화면이 어긋난다.
- 잡을 수 있어야 하는 것을 팝오버가 덮지 않는다 — 핸들이 프레임
  밖으로 나오면 팝오버도 그만큼 물러난다.
- 슬라이더는 `.studio-inspector-range` 한 규칙만 고친다. 컨트롤마다
  따로 스타일을 두지 않는다.
- 얇게 만드는 것은 **보이는 막대와 선**이고, 잡는 판은 줄이지 않는다.

---

## 8. 남은 차이

- **`free` 상태는 저장되지 않는다.** 자유 비율로 자른 이미지를 다시
  열면 "현재 비율"이 켜져 있고, 변을 다시 끌려면 "자유"를 한 번 더
  누른다. 값(비율·구도)은 그대로 살아 있다. (사용자 확인 — 이번
  라운드에서는 이대로 둔다.)
- **확대 상한 4배는 그대로다.** 다만 이제 상한에 걸리면 값을 자르지
  않고 프레임이 그 지점에서 멈추고 이유를 안내한다(2절). "더 줄이고
  싶으면 사진 배율을 포기해야 한다"는 선택은 사용자에게 남는다 —
  그 선택지를 UI로 주지는 않았다.
- **기존 이미지 크기 조절(모서리 핸들 4개)에는 임시 위치 보정이
  없다.** 그쪽은 비율 유지 조절이라 반대쪽 모서리를 기준점으로
  잡는 계산이 이미 있고, 이번 라운드의 범위는 자르기 안이다 —
  가운데 정렬된 이미지를 모서리로 조절할 때는 지금까지처럼 잡은
  모서리가 포인터의 절반만 따라온다.
- **모바일 터치 제스처(핀치 확대)는 없다.** 확대는 슬라이더,
  구도는 드래그/슬라이더/방향 버튼 그대로다.

---

## 9. 테스트

```
node studio/studio-crop-e2e-test.mjs --only=free
node studio/studio-crop-e2e-test.mjs --only=freegeo
node studio/studio-crop-e2e-test.mjs --only=freealign
node studio/studio-crop-e2e-test.mjs --only=freelimit
node studio/studio-crop-e2e-test.mjs --only=sliders
```

| 검사 | 재는 것 |
| --- | --- |
| P1 / P1b | 자유를 고르면 화면 그대로 + 핸들 8개, 좌표가 변 가운데·모서리와 일치, 잡는 판이 18px 이상 |
| P2 / P2b | 아래 변 — 높이만 바뀌고, 사진 배율·화면 위 자리가 그대로 |
| P3 / P4 | 오른쪽 변은 너비만 · 모서리는 두 축 따로(비율 유지 아님) |
| P5 | 자유에서도 확대·구도 이동 |
| P6 | 변 드래그 중 Escape = 끌기 전 프레임으로 |
| P7 / P7b | 자유 ↔ 고정 — **그려진 사진**의 자리·크기로 판정. 사진은 작아지지 않고, 커졌다면 `coverNeeded`와 정확히 같은 배율만. 되돌아오면 한 픽셀도 안 움직인다 |
| P8 | 삼등분 가이드선이 자르는 동안만 |
| P9 / P10 | 적용 전 SkinPackage 무변경 · 적용 한 번 = Undo 한 번 |
| P11 / P12 / P13 | Save→재로드 · Export→Import · 자르기 초기화 |
| Q1~Q5 | 핸들 좌표(Desktop / AI 패널 / Mobile 축소) · 1:1 반영 · 모바일 가로 넘침 |
| **S0 / S** | **왼쪽·가운데·오른쪽 정렬 × 네 변 + 두 모서리** — 잡은 변이 포인터가 간 화면 px 그대로 움직이고 **반대쪽 변은 한 픽셀도 안 움직인다**(케이스마다 프레임을 원래 크기로 되돌리고 시작) |
| **S-mobile** | 축소 배율(0.815)에서도 같은 값 |
| **S-apply** | 적용하면 `translate`가 사라지고 크기는 그대로인 채 정렬 규칙이 자리를 정한다 · 저장 CSS에 `translate` 없음 |
| **T1~T4** | 확대 상한 — 요청한 크기까지 가지 않고 멈춘다 · 사진 배율/구도 그대로 · 안내 표시 · 다시 키우면 사라진다 |
| R1~R4 | 슬라이더 토큰·조작 영역 · 방향키 · 채움 비율 · 비활성 구분 |

모든 절에서 함께 재는 것: 사진 비율 == 원본 비율(왜곡 없음),
`coversFrame`(빈틈 없음).

> **오른쪽 정렬만 Mobile Preview에서 잰다.** fixture의 프레임 부모가
> iframe 폭을 꽉 채우므로 오른쪽 정렬이면 프레임의 오른쪽 변이 창의
> 끝 픽셀에 붙고, 그 자리의 핸들은 절반이 창 밖이라 테스트 포인터가
> 누를 수 없다(브라우저 한계이지 제품 동작이 아니다). Mobile
> Preview는 iframe이 stage 가운데에 놓여 사방에 여백이 생긴다.

### 결과

Chromium · WebKit **양쪽에서**:

```
studio/studio-crop-e2e-test.mjs         104/104  (기존 48 + 이번 56)
studio/studio-direct-edit-e2e-test.mjs   37/37
studio/studio-inspector-e2e-test.mjs     34/34
skin/skin-crop-published-e2e-test.mjs    13/13
```

Chromium에서만(팝오버 다시 그리기에 포커스 복원이 들어갔으므로
팝오버를 쓰는 나머지 동선도 한 번씩 돌렸다):

```
studio/studio-selected-ai-e2e-test.mjs         99/99
studio/studio-file-ux-e2e-test.mjs             42/42
studio/images/skin-image-library-e2e-test.mjs  95/95
```

### 실제 v6 스킨 확인 (저장소 밖 하네스)

`skin/test-skins/imory-quiet-frame-v6-header-recent.json`을 그대로
Studio에 심고 그 헤더 이미지를 자르는 일회성 하네스로 Chromium ·
WebKit **각각 22/22**를 확인했다(헤더 슬롯 이름만 `header` → `cover`로
바꿔 scenario y의 이미지 라이브러리가 채우게 했고, 템플릿·CSS·자르기
래퍼는 v6 원본 그대로다). v6 헤더 프레임은 `margin: auto`로 **가운데
정렬**돼 있어 "폭이 바뀌면 양쪽 변이 함께 움직이는" 바로 그 경우다.
확인 항목:

- 네 변과 두 모서리 — **잡은 변이 포인터가 간 만큼 정확히, 반대쪽
  변은 한 픽셀도 안 움직인다** · 사진 왜곡·빈틈 없음
- 프레임을 줄이면 사진 배율·화면 위 자리 유지
- 자유에서도 확대·상하좌우 구도 이동
- 자유 ↔ 고정(16:9) 전환 — **그려진 사진**의 자리·크기로 판정,
  덮는 데 필요한 최소 배율만 더해진다
- 확대 상한에서 핸들이 멈추고 안내가 뜬다 · 사진 배율·구도 그대로
- Mobile Preview + AI 패널을 연 상태에서 프레임·선택 테두리·드래그
  판·핸들 좌표 일치(축소 배율 반영)
- 적용하면 임시 위치가 걷히고 가운데 정렬이 자리를 정하며, "최근
  글"은 실제 프레임 높이만큼 따라 올라온다 · 저장 CSS에 `translate`
  없음
- 적용 한 번 = Undo 한 번
- Save → 재로드 · Export → Import 뒤에도 자유 비율·구도 유지
- 공개 화면(`index.html` + `skin-render.js`, sanitizer/CSS validator
  통과 뒤)에서 Studio와 같은 프레임 크기·`object-position`, 모바일
  에서도 빈틈·가로 넘침 없음

3px 막대와 12px 흰 손잡이가 **실제로 그렇게 그려지는지**는 두 엔진의
스크린샷으로 확인했다 — `::-webkit-slider-runnable-track` /
`-thumb`의 계산값은 `getComputedStyle`이 돌려주지 않아 e2e에서 잴 수
없기 때문이다(R1/R4는 요소 자신에서 확인 가능한 것만 잰다).

그 하네스는 저장소에 넣지 않았다(AI-6E와 같은 판단).
