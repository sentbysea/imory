# PHASE AI-6D — 직접 편집: 이미지 자르기

Select mode에서 이미지를 고른 뒤 **원본 파일은 그대로 두고** 스킨에
보이는 범위와 구도만 바꾼다. 업로드한 파일도, 그 URL도, 이미지 슬롯
연결도, Settings 프로필 사진 연결도 이 기능은 건드리지 않는다.

앞 라운드: [AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md](./AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md)
(텍스트 내용 · 이미지 너비). 임시/확정을 나누는 구조, Undo 한 번,
Escape 정리 규칙은 그 문서 그대로이고 여기서는 **다른 점만** 적는다.

---

## 1. 사용자 흐름 (현재 구현)

```
이미지 선택 → 직접 수정 → 자르기
  프레임 비율   현재 비율 / 1:1 / 4:3 / 3:2 / 16:9
  확대          100% ~ 400% 슬라이더
  위치          Preview 안의 사진을 드래그
  적용 / 취소 / 자르기 초기화
```

- 자르기를 **누른 직후에는 화면이 전혀 바뀌지 않는다** — 시작 프레임은
  "지금 보이는 크기와 비율"이다. 사용자가 무언가 잃었다고 느끼지 않게
  하기 위해서다.
- 비율을 바꾸면 **프레임 너비는 그대로**이고 높이만 바뀐다
  (`width` 고정 + `aspect-ratio`).
- 적용 전에는 임시 미리보기뿐이다. SkinPackage도 dirty도 Undo도
  움직이지 않는다.
- 적용 한 번 = `applyStudioInspectorPatch()` 한 번 = 되돌리기 한 번.

---

## 2. 저장 방식 (현재 구현)

### 2.1 DOM — `<span>` 래퍼 하나

```html
<span data-imory-edit-id="e0-1-c"><img data-imory-edit-id="e0-1" ...></span>
```

- 확대는 "프레임보다 큰 사진을 프레임이 잘라 보여주는 것"이라 잘라 줄
  상자가 하나 더 있어야 한다. `object-fit`/`object-position`만으로는
  원본 비율과 프레임 비율의 **차이만큼만** 움직일 수 있고 확대는 아예
  안 된다. `object-view-box`가 정확히 이 일을 하지만 Firefox 미구현이라
  공개 스킨에 쓸 수 없다.
- `<span>`이다. `<div>`로 감싸면 `<p>` 안의 이미지에서 HTML 파서가
  문단을 쪼갠다(DOMParser도 그렇다).
- `<a>` 안의 이미지는 래퍼도 `<a>` **안쪽**에 들어간다 — 링크 클릭
  범위가 그대로다.
- 이미지의 `data-imory-edit-id`는 그대로 둔다. 래퍼는 이미지 id에서
  파생한 자기 id(`<이미지id>-c`, 비어 있는 이름을 고른다)를 받는다.
  그래서 자른 뒤에도 같은 이미지를 다시 고를 수 있고, 선택 요소 AI
  수정도 계속 그 이미지를 가리킨다.
- 새 태그도 새 속성도 추가하지 않았다 — `span`과
  `data-imory-edit-id`는 이미 `skin/skin-sanitize.js` 허용 목록에
  있다. **허용 범위를 넓히지 않았다.**

### 2.2 CSS — 규칙 두 개

프레임(래퍼):

```css
--imory-crop: 1;        /* 또는 fixed — 아래 2.4 */
display: block; position: relative; overflow: hidden;
aspect-ratio: <R>; max-width: 100%; width: <W>px;
```

사진(`<img>`):

```css
position: absolute;
left: <L>%; top: <T>%; width: <Z>%; height: <Z>%;
max-width: none; min-width: 0; margin: 0;
object-fit: cover; object-position: <PX>% <PY>%;
```

값은 전부 `studio/inspector/studio-inspector-crop-model.js`의
`buildInspectorCropDeclarations()` 하나가 만든다. Studio(확정 규칙)와
Preview iframe(임시 inline style)이 **같은 함수**를 부르므로 "적용했더니
구도가 달라졌다"가 구조적으로 생기지 않는다.

### 2.3 구도를 -1~+1로 정규화한 이유

프레임 폭은 모바일에서 `max-width:100%`로 줄어든다. 구도를 px로 적어
두면 그때 어긋나 빈틈이 생긴다. 정규화하면 CSS가 전부 %가 되어 어떤
폭에서도 같은 구도가 나온다.

`x`는 두 CSS 속성으로 나뉘어 나간다. 확대가 1.0이면 상자 = 프레임이라
상자를 움직일 여지가 없지만, 그때도 cover가 잘라낸 몫(가로형 사진을
1:1 프레임에 넣었을 때의 좌우)은 움직일 수 있어야 한다. 그 몫이
`object-position`이고, 확대하면 생기는 상자 여유가 `left`/`top`이다.
둘의 부호를 맞춰 같은 방향으로 함께 움직인다.

```
x = -1  왼쪽 끝    left = 0        object-position-x = 0%
x =  0  가운데     left = -여유/2  object-position-x = 50%
x = +1  오른쪽 끝  left = -여유    object-position-x = 100%
```

### 2.4 빈틈이 생기지 않는 근거 — 두 겹

1. **상자가 프레임을 항상 덮는다.** 상자 크기 = `zoom*100%`,
   `left`/`top`은 `-(zoom*100-100)% ~ 0%`로 clamp된다.
2. **그 상자 안은 `object-fit: cover`가 채운다.** 원본 비율을 몰라도
   되고, 나중에 **다른 비율의 사진으로 교체해도** 빈틈이 없다 —
   그래서 원본 비율을 CSS에 구워 넣는 방식을 쓰지 않았다.

### 2.5 표식이 custom property인 이유

"이 부모가 자르기 프레임인가"를 알아야 한다(재편집에서 래퍼를 중복
생성하지 않기 위해, 그리고 좌표를 프레임 기준으로 재기 위해).

- 새 `data-*` 속성 → sanitizer 허용 목록을 넓혀야 한다. 안 한다.
- 클래스 이름 → 스킨 작성자가 쓰는 이름과 부딪힐 수 있다.
- **custom property `--imory-crop`** → 저장 CSS에 그대로 남고
  `skin/skin-css-validate.js`를 그대로 통과하며, iframe에서는
  `getComputedStyle().getPropertyValue()`로 바로 읽을 수 있다.

custom property는 상속되므로 **"자식이 하나뿐인가"를 함께 본다** —
자르기 래퍼는 언제나 이미지 하나만 감싸므로, 표식을 물려받았을 뿐인
다른 상자를 프레임으로 착각하지 않는다.

---

## 3. 크기 조절과 자르기가 서로 덮어쓰지 않는 이유

자른 뒤에는 **"바깥 상자"의 주인이 래퍼로 바뀐다.**

| 컨트롤 | 자르기 전 | 자른 뒤 |
| --- | --- | --- |
| 너비(size) · 모양(shape) · 정렬(imageAlign) | 이미지 규칙 | **프레임 규칙** |
| 그 외 | 이미지 규칙 | 이미지 규칙 |

- 읽기: `studioInspectorCropDeclarationsFor(control, resolved)`
- 쓰기: `studioInspectorCropAwareCss(css, control, value, element)`
  (`commitStudioInspectorStyle()`이 부르는 유일한 지점)
- 실측: `preview-bridge.js`의 `inspectorMetricsOf()`가 자른 이미지에서는
  **프레임**의 크기와 프레임 부모의 폭을 올려보낸다(`cropped: true`).
  그래서 슬라이더 초기값·상한·모서리 핸들·선택 테두리가 전부 "사용자가
  보는 사각형"을 가리킨다.

한 속성을 두 규칙이 동시에 갖는 상태가 아예 만들어지지 않는다.

프레임의 **구조 선언은 스타일 확정 때마다 다시 못 박는다**. "기본"
버튼이 `aspect-ratio`(너비 기본)나 `display`(정렬 해제)를 지우면
프레임이 통째로 무너지기 때문이다(inline `<span>`은 `width`도
`aspect-ratio`도 받지 않는다).

---

## 4. 자르기 초기화

래퍼를 걷어내고 두 규칙에서 자르기 선언만 지운다.

- 프레임이 들고 있던 **사용자가 정한 것**(모서리 둥글기·테두리·정렬)은
  이미지로 돌려준다. 자르기만 푼 것이지 그 설정까지 없앤 것은 아니다.
- 너비는 표식 값으로 가른다. `--imory-crop: fixed`(사용자가 직접 정한
  너비)면 이미지에 돌려주고, `1`(그냥 그때 보이던 크기)이면 아무 것도
  돌려주지 않는다 — 그래야 스킨 CSS가 정하던 **원래 표시 방식으로
  정확히** 돌아간다.
- `display: block`은 되돌리지 않는다. 프레임에는 늘 붙어 있지만 그건
  자르기가 만든 값이지 사용자가 정한 값이 아니다(정렬을 지정한
  경우에만 margin과 함께 되살린다).

---

## 5. 파일

| 파일 | 책임 |
| --- | --- |
| `studio/inspector/studio-inspector-crop-model.js` | 순수 계산(값 clamp · CSS 선언 생성/되읽기 · 래퍼 id). **Studio와 Preview iframe 양쪽에 로드된다.** |
| `studio/inspector/studio-inspector-crop.js` | 자르기 UI · 임시 편집 · 확정 · 초기화 · 드래그 · 대상 규칙 전환 |
| `studio/inspector/studio-inspector-overlay.js` | 드래그 판 DOM(`#studioInspectorCropSurface`)과 위치. 자르는 동안 모서리 핸들을 내린다 |
| `studio/preview/preview-bridge.js` | 임시 미리보기(래퍼 생성/복원) · 프레임 기준 좌표·실측 · 로드 실패 판정 |
| `studio/studio-preview.js` | `postInspectorPreviewToFrame()`에 `crop`/`target` 필드 추가 |
| `functions/api/skin-ai.js` | selectionContext capability 이름에 `crop` 추가(fail closed) |

로드 순서는 `studio/index.html` · `studio/studio-lifecycle-scenario.html`
· `studio/preview/preview-frame.html` 세 문서가 함께 갖는다.

---

## 6. 지켜야 할 원칙

- 자르기는 **선택한 이미지 하나**에만 적용된다. 반복 목록 안의
  이미지를 자르면 그 자리 전체에 적용된다(반복 template이 하나이기
  때문 — 팝오버가 이미 그 사실을 안내한다).
- 확대 하한은 1.0이다. 그 아래로 내려가면 프레임 안에 빈틈이 생긴다.
- 임시 편집은 `sendStudioInspectorPreview()`만 지난다. 저장 경로
  (`applyStudioInspectorPatch`)를 절대 지나지 않는다.
- Escape / 취소 / 선택 변경 / 페이지 전환은
  `clearStudioInspectorTransient()` 하나에서 정리된다.
- 이미지가 없거나 로드에 실패하면(`metrics.loaded === false`) 이유를
  적고 자르기 버튼을 아예 내린다.
- 보호 영역(`data-imory-region="post-body"`) 안의 이미지는 자를 수
  없다 — `capabilities.crop`이 기존 `canStyle`을 그대로 따른다.

---

## 7. 남은 차이 (이번 라운드 범위 밖)

- **CSS 배경 이미지**(`background-image`)는 자를 수 없다. 이 기능은
  `<img>` 요소만 다룬다.
- **회전**은 없다. 프레임 비율 · 확대 · 위치 셋뿐이다.
- **자유 비율 프레임**(숫자로 직접 입력)은 없다. 프리셋 다섯 개와
  "현재 비율"뿐이다.
- 자르기 Undo는 여전히 **한 단계**다(Direct Edit 공통 한계, AI-6A
  13절). AI Undo와 통합되지 않았다.
- 확대 상한 400%는 임의 값이다. 원본 해상도가 낮은 사진에서 화질이
  나빠지는 것을 경고하지 않는다.
- 선택 요소 AI 수정에 `crop` capability 이름은 전달되지만, AI가
  자르기 값을 이해하는 전용 프롬프트는 없다(capability는 제한 목록이
  아니라 "사용자가 AI 없이도 할 수 있는 일" 안내라는 6B.1의 계약
  그대로다).

---

## 8. 테스트

`studio/studio-crop-e2e-test.mjs` (포트 8946, 39 검사).

```
node studio/studio-crop-e2e-test.mjs
node studio/studio-crop-e2e-test.mjs --only=ratio      # 정사각/가로/세로 비율
node studio/studio-crop-e2e-test.mjs --only=compose    # 확대·드래그·Escape
node studio/studio-crop-e2e-test.mjs --only=temp       # 임시/취소/Undo
node studio/studio-crop-e2e-test.mjs --only=coexist    # 크기 조절 공존·초기화·재편집
node studio/studio-crop-e2e-test.mjs --only=geometry   # 좌표·모바일
node studio/studio-crop-e2e-test.mjs --only=persist    # Save/재로드/Export·Import
node studio/studio-crop-e2e-test.mjs --only=guard      # 보호·로드 실패·이미지 교체
```

fixture 이미지는 **자연 크기가 서로 다른 진짜 PNG**를 만들어 물려
준다(테스트 안에서 생성). 1x1 하나로만 재면 "원본이 정사각형일 때만
맞는 코드"도 통과해 버리기 때문이다.

Studio Preview는 매 렌더마다 `renderSkin()`을 지나고 그 함수가
`sanitizeSkinHTML()` + `validateAndScopeSkinCss()`를 다시 돌린다 —
그래서 Preview에 자르기가 그려진다는 사실 자체가 "저장 결과가 기존
sanitizer와 CSS validator를 통과한다"의 증거다.

`skin/skin-crop-published-e2e-test.mjs` (포트 8947, 13 검사)는 그
산출물을 **공개 화면**에서 다시 본다.

```
node skin/skin-crop-published-e2e-test.mjs
node skin/skin-crop-published-e2e-test.mjs --browser=webkit
```

한 파일에서 두 단계를 잇는다 — Studio 시나리오에서 실제로 자르고
Save + Export한 `.json`을 그대로 `get_published_skin` 응답으로
돌려주고, 저장소의 실제 `index.html`로 공개 HOME을 렌더한다. 중간에
사람이 옮겨 적는 값이 없다.

sanitizer/validator 생존은 화면이 맞다는 것으로 넘기지 않고 직접
읽어서 확인한다 — 공개 DOM의 `span[data-imory-edit-id]` 개수와,
스코프된 `<style>` 안의 `--imory-crop` / `overflow` /
`aspect-ratio` / `object-position` 규칙이다.
