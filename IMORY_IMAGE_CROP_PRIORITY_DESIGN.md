# IMAGE-CROP-PRIORITY-1 — 스킨 CSS 가 강해도 자르기가 이긴다

Studio 이미지 자르기(확대 · 위치 · 프레임)의 결과가 **스킨 CSS 의
`!important` 에 밀려 화면에 나타나지 않던 문제**를 고친 라운드의 기준
문서다. 자르기 자체의 데이터 모델은 앞 라운드 문서를 따른다.

- 자르기 모델 · 래퍼 · 두 규칙: [AI_SKIN_PHASE_AI6D_IMAGE_CROP.md](./docs/ai-skin/AI_SKIN_PHASE_AI6D_IMAGE_CROP.md)
- 프레임 좌표 · 구도 이동 기어비: [AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md](./docs/ai-skin/AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md)
- 자유 비율: [AI_SKIN_PHASE_AI6F_FREE_CROP_AND_SLIDERS.md](./docs/ai-skin/AI_SKIN_PHASE_AI6F_FREE_CROP_AND_SLIDERS.md)

---

## 1. 원인 (2026-09-19 실측)

FOREVER, MY FOE 스킨(`skin/test-skins/imory-skin-forever-my-foe.json`)을
Import 하고 `header` 슬롯에 세로 사진을 넣은 뒤 MOBILE(390px) Preview
에서 확대를 181% 로 올렸을 때:

| 무엇 | 값 |
| --- | --- |
| 자르기가 사진에 얹은 선언(임시 미리보기 inline) | `left:-40.5%; top:-40.5%; width:181%; height:181%; object-position:50% 50%` — **계산은 맞다** |
| 사진의 computed style | `width:362px`(=100%) · `left:0` · `object-position:50% 30%` — **자르기 값이 하나도 안 먹었다** |

이긴 선언은 스킨 CSS 의 `!important` 셋이다(스코프가 붙은 모양 그대로).

```css
.imory-skin-root-i1 .foe-photo img { width:100%!important; max-width:none!important; height:100%!important;
                                     object-fit:cover!important; object-position:center 29%!important }
@media (max-width:720px) { .imory-skin-root-i1 .foe-photo img { object-position:center 30%!important } }
.imory-skin-root-i1 [data-imory-edit-id="e0-0-1-1-0-0-0"] { position:absolute!important; inset:0!important;
                                     width:100%!important; height:100%!important; object-fit:fill!important;
                                     object-position:center!important }   /* 스킨의 v11 규칙 */
```

- 임시 미리보기는 **보통 inline style** 이다 — stylesheet 의 `!important`
  를 이기지 못한다.
- 적용 후 규칙 `[data-imory-edit-id="X"][data-imory-edit-id="X"]` 는
  specificity 를 올린 **보통 선언**이다 — 역시 `!important` 를 이기지
  못한다(적용 전 · 적용 후 · 저장 · 공개 화면 모두 같은 이유로 무시).

즉 **확대가 계산되지 않은 것이 아니라, 계산된 값이 CSS 우선순위에서
밀렸다.** 위치 슬라이더 · 사진 드래그도 같은 이유로 무시됐다.

같은 실측에서 두 번째 문제도 보였다. 자르기 프레임이 "그때 화면에 보이던
폭"을 px 로 굽는다(`width:362px`). hero 처럼 **스킨이 영역 전체를
채우게 한 사진**을 390px 에서 자르면 데스크톱에서 hero 가 362px
기둥이 된다.

---

## 2. 렌더 구조 (현재 구현)

역할은 그대로 둘이다.

| 요소 | 누가 정하나 |
| --- | --- |
| 바깥 프레임(`<span>` 래퍼, `--imory-crop` 표식) | 스킨이 배치 · 크기 · 모서리 · 테두리. 자르기 규칙은 **잘라 주는 것**과 프레임 방식(아래 4절)만 |
| 안쪽 사진(`<img>`) | 자르기가 확대 · 위치 · 맞춤(cover). 스킨의 장식(filter · 그림자 등)은 그대로 |

### 2.1 보호 규칙 — cascade layer 안의 `!important`

`skin/skin-render.js` `buildSkinCropGuardCss()` 가 렌더할 때마다 **저장된
자르기 규칙을 읽어** 한 벌을 더 싣는다.

```css
@layer imory-crop-guard;               /* <style> 맨 앞 — 가장 먼저 선언된 layer */
/* …스킨 CSS(스코프됨) 그대로… */
@layer imory-crop-guard {
  .imory-skin-root-i1 [W][W] { overflow:hidden!important; contain:paint!important }
  .imory-skin-root-i1 [W][W] > [I][I] {
    position:absolute!important; left:L!important; top:T!important; right:auto!important; bottom:auto!important;
    width:Z!important; height:Z!important; min-width:0!important; min-height:0!important;
    max-width:none!important; max-height:none!important; margin:0!important; padding:0!important;
    transform:none!important; translate:none!important; rotate:none!important; scale:none!important;
    aspect-ratio:auto!important; object-fit:cover!important; object-position:PX PY!important }
}
```

근거는 CSS Cascade 5 다: `!important` 끼리는 **layer 안의 선언이 layer
밖(스킨이 쓴 모든 규칙)을 specificity · 순서와 무관하게 이긴다.** 그리고
layer 끼리는 먼저 선언된 쪽이 이긴다 — 그래서 layer 이름을 `<style>` 맨
앞에서 먼저 선언한다. 스킨이 자기 `@layer` 를 써도 이 layer 가 먼저다.

- **저장되지도 Export 되지도 않는다.** 저장된 자르기 규칙(1절의 두
  규칙)이 곧 자르기 데이터이고, 보호 규칙은 렌더할 때 거기서 다시
  만든다. 스킨 CSS 는 한 글자도 바뀌지 않는다.
- 공개 화면 · Studio Preview · sandbox 프레임(공개 · Studio) 이 모두
  `renderSkin()` 하나를 지나므로 네 곳이 같은 규칙을 받는다. sandbox 는
  같은 `<style>`(nonce 가 붙은) 안에 들어가므로 CSP 를 넓히지 않았다.
- 대상은 `--imory-crop` 표식을 가진 프레임이 **`<img>` 하나만** 감싼
  경우뿐이다. 값은 자르기가 만드는 모양(전부 `%`, 맞춤은 cover/contain)
  일 때만 싣는다 — 알 수 없는 값을 `!important` 로 올리지 않는다.
- 자르기가 하나도 없으면 layer 선언도 붙지 않는다 — `<style>` 내용이
  이 라운드 이전과 한 글자도 다르지 않다.
- 프레임 쪽은 `position` 을 강제하지 않는다. `contain: paint` 가 곧
  절대배치 기준(containing block)이자 잘라 주는 경계라서, 스킨이
  프레임을 absolute 로 옮겨 두었든 static 으로 눌렀든 같다.
- 읽는 곳: `skin/skin-css-validate.js` `collectSkinEditIdRules()` 가
  repair 를 지난 AST 에서 **최상위** `[data-imory-edit-id="X"][…="X"]`
  규칙만 모은다(같은 id 면 뒤의 것 — Studio 의
  `readInspectorEditDeclarations` 와 같은 규칙).

### 2.2 적용 전 임시 미리보기

`studio/preview/preview-bridge.js` `applyInspectorPreview()` 가 **같은
함수**(`buildSkinCropGuardDeclarations`, `skin-render.js` 에서 import)
의 결과를 inline `!important` 로 얹는다. inline `!important` 는 스킨이
어떤 선택자로 `!important` 를 걸었든 이긴다(layer 보다도 앞이다). 그래서
슬라이더를 끄는 동안 보이는 것과 적용한 뒤 보이는 것이 같은 값 · 같은
우선순위에서 나온다. 취소하면 style 속성을 통째로 되돌리므로 흔적이
없다.

금지한 방식: Studio overlay 위에만 transform 을 걸고 저장 · 공개
화면에서는 사라지는 것. 이 구조에서 Preview 의 사진은 **공개 화면과 같은
CSS** 로 그려진다.

---

## 3. 저장되는 자르기 데이터

바뀌지 않았다(AI6D 2절). 사진 규칙의 `left/top/width/height/object-fit/
object-position` 과 프레임 규칙의 `--imory-crop` · 프레임 방식 선언이
전부다. 이번 라운드에서 늘어난 것은 **표식 값 셋**(4절)뿐이다.

```css
[data-imory-edit-id="e0-0-1-1-0-0-0-c1"][data-imory-edit-id="e0-0-1-1-0-0-0-c1"] {
  display:block; margin-left:auto; margin-right:auto;
  --imory-crop: fill-absolute; position:absolute; inset:0; overflow:hidden; }
[data-imory-edit-id="e0-0-1-1-0-0-0"][data-imory-edit-id="e0-0-1-1-0-0-0"] {
  margin:0; object-fit:cover; object-position:70% 35%; position:absolute;
  left:-56.7%; top:-28.35%; width:181%; height:181%; max-width:none; min-width:0; }
```

---

## 4. 프레임이 스킨의 자리를 채우는 방식

자르기를 시작할 때 Preview 가 "사진이 부모가 정한 자리를 어떻게 채우고
있는가"를 **재서**(`inspectorCropFillOf`, `metrics.fill`) 프레임도 그
자리를 같은 방식으로 채운다. 사진을 잠깐 빈 상자로 바꿔 끼워 방식별로
그려 보고, 그 상자의 레이아웃 상자(`offset*` — 스킨의 transform 과
무관)가 사진과 같은 첫 방식을 고른다. 한 작업 안에서 되돌리므로 화면에
그려지지 않고, 사진의 style 속성도 건드리지 않는다.

| 표식 | 언제 | 프레임 선언 |
| --- | --- | --- |
| `fill-absolute` | 사진이 겹쳐 있고(absolute) 기준 상자를 꽉 채운다(FOE hero) | `position:absolute; inset:0` |
| `fill` | 흐름 안에서 부모 상자를 폭·높이 모두 채운다 | `width:100%; height:100%` |
| `fill-width` | 부모 폭을 채우고 높이는 비율 | `width:100%; aspect-ratio:R` |
| `1` / `fixed` | 그 밖(예전 그대로) | `width:<px>; aspect-ratio:R; max-width:100%` |

- 셋 다 폭을 사용자가 정한 것이 아니므로 자르기를 풀면 아무 것도
  돌려주지 않는다(`1` 과 같다).
- 모양을 바꾸면 이어지는 방식(`studioInspectorCropFillAfterReshape`):
  "현재 비율"은 그대로, 다른 비율 버튼 · 위아래 변 끌기는 `fill`/
  `fill-width` → `fill-width`, 좌우 변 끌기와 `fill-absolute` 의 모양
  변경은 보통 프레임(px). 너비 컨트롤로 px 를 정해도 보통 프레임이다.
- 적용할 때 프레임의 자리·크기 선언(`position inset width height
  aspect-ratio max-width`)은 이번 방식의 것만 남긴다 — 앞 방식의
  `height:100%` 가 남으면 aspect-ratio 가 무시된다. 임시 미리보기도 같은
  속성을 걷는다.

---

## 5. 기본값 보존

- 자르지 않은 사진 · 아이콘 · SVG · 배경 이미지는 스킨 디자인
  그대로다(보호 규칙 없음 — `[keep]` 절이 `<style>` 에 layer 선언조차
  없음을 본다).
- 자르는 순간부터는 그 사진의 자르기 값이 이긴다. 자르기의 맞춤은
  cover 다(AI6D 2.4 "빈틈이 생기지 않는 근거") — 스킨이 contain 을
  `!important` 로 걸어 두었어도 자른 사진은 cover 로 그려진다.
- 이미지 교체(Images 패널)는 자르기를 유지한다 — 자르기는 슬롯이
  아니라 그 요소의 CSS 규칙이다(AI6D 계약 그대로).
- 스킨이 사진에 건 transform · translate · rotate · scale 은 **자른
  사진에서만** 걷힌다.

---

## 6. 남은 차이

- **sandbox 프레임 안의 `vh`**: FOE 의 hero 는 높이를 `vh` 로 정한다.
  sandbox 프레임은 높이가 내용을 따라가는 iframe 이라 그 안의 `vh` 가
  공개 native 와 다르다(1280px 에서 hero 691 → 778px, 390px 에서는
  보고 상한 120회까지 자란다 — [IMORY_SANDBOX_SKIN_DESIGN.md](./IMORY_SANDBOX_SKIN_DESIGN.md)
  H-9). 자르기 값(프레임 대비 비율)은 두 화면에서 같지만 프레임 크기가
  달라 보이는 부분이 다르다. 자르기와 무관한 기존 차이이고 이 라운드
  범위 밖이다.
- sandbox 스킨의 Studio Select 는 이미지 크기/자르기가 여전히 잠겨
  있다(SANDBOX-SELECT-PARITY-1). 자르기는 native Preview 에서 하고, 그
  결과는 sandbox 에서도 같게 그려진다.
- 스킨 작성자가 **직접** `@layer imory-crop-guard { … !important }` 를
  쓰면 같은 layer 안에서 specificity 로 겨룬다. 보호 규칙은 스코프 +
  속성 선택자 넷(0,5,0)이라 보통은 이기지만, 일부러 겨루는 스킨까지
  막지는 않는다.
- 브라우저 지원: `@layer`(Chrome 99 · Safari 15.4 · Firefox 97),
  `contain: paint`, 개별 transform 속성(Safari 14.1). 그보다 오래된
  브라우저에서는 보호 규칙이 무시되어 이 라운드 이전과 같다.

---

## 7. 테스트

`studio/studio-crop-priority-e2e-test.mjs` (포트 8974 + 8975, 두 실제
origin · 배포되는 middleware). 사진은 가로 = 빨강, 세로 = 초록
그러데이션이라 **찍힌 색이 곧 "원본의 어느 자리가 그려졌는가"** 다.
기하(`getBoundingClientRect`)와 픽셀(프레임 스크린샷 다섯 점)을 함께
본다 — 숫자만 바뀌고 픽셀이 그대로면 실패다.

```
node studio/studio-crop-priority-e2e-test.mjs
node studio/studio-crop-priority-e2e-test.mjs --browser=webkit
node studio/studio-crop-priority-e2e-test.mjs --only=foe   # strong live positions cancel persist mobile foe keep
```

이 라운드 이전 코드(daefe2c)에 이 테스트를 돌리면 `strong` 의 !important
변형 다섯 · `live` 의 실시간 확대/위치/드래그 · `foe` 의 181% · 위치 ·
데스크톱 hero · 공개 화면이 실패한다(대조 확인).
