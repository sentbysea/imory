# PHASE AI-6E — 자르기 프레임 좌표 · 팝오버 자리 · 구도 이동

Select mode 이미지 편집에서 **손과 화면이 어긋나던 네 가지**를 고친
라운드다. 자르기 자체의 저장 방식(래퍼 + 두 규칙, `--imory-crop`
표식, x/y 정규화)은 그대로다 —
[AI_SKIN_PHASE_AI6D_IMAGE_CROP.md](./AI_SKIN_PHASE_AI6D_IMAGE_CROP.md)
가 계속 그 계약의 기준 문서이고, 여기서는 **바뀐 지점만** 적는다.

계기: 사용자 스킨(quiet-frame v5, HOME 헤더)에서 나온 네 가지 증상.

```
1  사진을 줄여도 바깥 회청색 헤더 상자가 그대로 남는다
2  너비 슬라이더를 만지는 동안 팝오버가 따라 움직여 손이 놓친다
3  자르기 테두리가 사진 아래 "최근 글" 영역까지 내려온다
4  좌우로만 움직이고 상하 구도를 맞추기 어렵다
```

넷 중 **1번만 스킨 쪽 문제**이고 나머지 셋은 공용 편집기 문제였다.
그래서 고친 자리도 그렇게 나뉜다(아래 5절).

---

## 1. 프레임의 "레이아웃 사각형"과 "보이는 사각형"을 나눈다

### 무엇이 문제였나

자르기 프레임은 **자기 부모보다 클 수 있다.** 실제 스킨에서 흔하다 —
헤더 이미지를 감싼 `<figure>`가 `aspect-ratio`로 높이를 못 박고
`overflow: hidden`을 걸어 두면, 그 안에서 프레임 비율을 1:1로 바꾸는
순간 프레임 아랫부분은 화면에 아예 그려지지 않는다.

그때까지는 프레임의 `getBoundingClientRect()`를 그대로 Studio로
올려보냈다. Studio는 **보이지 않는 자리에** 선택 테두리와 자르기
드래그 판을 그렸다. 사용자 눈에는 "테두리가 사진 아래 다른 영역까지
내려온" 것으로 보이고(증상 3), 그 자리를 끌어도 사진은 없다.

### 어떻게 고쳤나 — `visibleRect`를 함께 올려보낸다

`studio/preview/preview-bridge.js`의 `inspectorVisibleRectOf(el)`가
프레임 rect를 잘라내는 조상(`overflow`가 `visible`이 아닌 요소) 전부와
교집합을 낸다. 그 값이 `preview:inspect-hover` / `inspect-select` /
`inspect-rects` 메시지에 `visibleRect`로 함께 실린다.

```
rect         레이아웃 사각형 (지금까지와 같은 값)
visibleRect  조상 overflow까지 반영한, 실제로 화면에 보이는 사각형
```

- 자르는 조상이 없으면 **둘은 같은 값**이다 — 보통 스킨에서는
  지금까지와 완전히 같다.
- 스킨 DOM에는 아무 것도 쓰지 않는다. 읽기만 한다.

Studio 쪽 쓰임(`studio/inspector/studio-inspector-overlay.js`):

| 그리는 것 | 쓰는 사각형 | 이유 |
| --- | --- | --- |
| hover 테두리 · 선택 테두리 | `visibleRect` | 안 보이는 자리에 선을 긋지 않는다 |
| 자르기 드래그 판 | `visibleRect` | 그 자리를 끌어도 사진이 없다 |
| 모서리 핸들 **좌표** | `rect` | 크기 조절이 반대쪽 모서리를 기준점으로 쓴다 |
| 모서리 핸들 **표시 여부** | `visibleRect` | 잘려서 안 보이는 모서리는 잡을 수 없다 |

핸들만 `rect`를 쓰는 이유가 요점이다 — 잘린 좌표로 크기를 계산하면
기준점이 화면 경계로 끌려와 드래그가 튄다(AI-6A부터의 이유 그대로).

### 잘라내고 있다는 사실을 말해 준다

프레임을 키워도 잘린 쪽은 화면에 나타나지 않는데, 그건 **스킨 쪽
레이아웃**이라 편집기가 고칠 수 없다. 그래서 자르기 폼에 한 줄
안내를 띄운다(`#studioInspectorCropClipped`).

판정은 `rect`와 `visibleRect`의 차이 하나다(`studioInspectorClipped`).
`metrics`에 담지 않은 이유가 있다 — 임시 미리보기가 떠 있는 동안에는
Studio가 `metrics`를 아예 받아들이지 않으므로(AI-6C부터의 규칙),
자르는 도중에는 늘 한 박자 늦은 값이 된다. 좌표는 그동안에도
갱신되므로 좌표로 판정한다.

---

## 2. 구도 이동을 "실제로 움직일 수 있는 거리"로 나눈다

### 무엇이 문제였나

드래그는 프레임 크기를 그대로 이동 한계로 쓰고 있었다.

```js
nextX = baseX - (2 * dx) / 프레임폭      // 예전
```

하지만 실제로 움직일 수 있는 거리는 프레임 폭이 아니다.

```
확대로 생긴 여유        (zoom - 1) * 프레임크기      → left / top 이 움직인다
cover가 잘라낸 몫       상자 안에서 넘치는 만큼       → object-position 이 움직인다
```

둘의 합이다. 확대 1.4배 · 213px 프레임이면 세로로 움직일 수 있는
거리는 85px인데 213px로 나누고 있었으니, 손이 80px를 끌어도 사진은
32px밖에 따라오지 않았다. 그게 "상하 구도 조절이 어렵다"의 정체다
(증상 4).

### 어떻게 고쳤나

`studio/inspector/studio-inspector-crop-model.js`에 순수 함수를
하나 더 둔다.

```js
inspectorCropTravelPx(crop, { width, height, naturalWidth, naturalHeight })
  -> { x, y }   // 한쪽 끝에서 반대쪽 끝까지 = 2만큼의 이동에 해당하는 px
```

드래그는 시작할 때 한 번만 재서 그 값으로 나눈다(확대·비율은 드래그
중에 바뀌지 않는다). **결과적으로 포인터와 사진이 1:1로 움직인다.**

프레임 크기는 draft 값이 아니라 **지금 그려진 사각형**에서 잰다
(`studioInspectorCropFrameBox`) — 프레임에는 `max-width: 100%`가 늘
함께 붙어서 Mobile Preview나 좁은 부모에서는 실제 폭이 draft 값보다
작기 때문이다.

### 여유가 없는 축

`travel`이 2px 미만이면 그 축은 "움직일 수 없다"로 본다
(`STUDIO_INSPECTOR_CROP_TRAVEL_MIN`). 원본 비율과 프레임 비율이
소수점 아래에서만 다를 때 cover가 1px도 안 되는 여유를 남기는데,
그걸 살려 두면 슬라이더는 끝에서 끝까지 가는데 화면은 그대로인
상태가 된다 — 제일 헷갈리는 경우다.

그때는 슬라이더/버튼을 비활성으로 두고 **이유를 적는다**.

```
지금은 좌우로만 움직일 수 있어요 — 확대하면 위아래로도 이동할 수 있어요.
지금은 위아래로만 움직일 수 있어요 — 확대하면 좌우로도 이동할 수 있어요.
사진이 프레임에 꼭 맞아 움직일 여유가 없어요 — 확대하거나 프레임 비율을 바꾸면 …
```

---

## 3. 위치 조절 UI — 슬라이더 두 개 + 방향 버튼 네 개

팝오버는 자르는 동안 프레임 **옆으로** 비켜 앉지만(4절), 좁은
화면에서는 겹칠 수 있고 프레임이 작으면 끌 자리 자체가 몇 십 px밖에
안 된다. 그래서 사진을 잡지 않고도 구도를 옮기는 길을 함께 둔다.

```
위치   [←] ────●──── [→]
       [↑] ──●────── [↓]
```

- 드래그와 **같은 상태 하나**(`draft.x` / `draft.y`)를 바꾼다 —
  슬라이더로 옮기고 이어서 끌어도 그 자리에서 이어진다.
- 확대 슬라이더와 같은 규칙: 끄는 동안에는 미리보기만(`silent`),
  손을 뗐을 때 한 번 폼을 다시 그린다.
- 방향 버튼 한 번은 화면에서 16px이다
  (`STUDIO_INSPECTOR_CROP_NUDGE_PX`). 고정 px로 정하고 그 축의
  여유로 나눠 -1~+1 단위로 바꾼다 — 여유가 작은 축에서 한 번에
  끝까지 튀지 않는다.

---

## 4. 팝오버 자리 — 손이 잡고 있는 동안에는 움직이지 않는다

### 무엇이 문제였나

팝오버는 선택 사각형 **아래**에 붙어 있었고, 좌표가 갱신될 때마다
다시 앉았다. 너비 슬라이더를 끄는 동안 이미지가 커지면 팝오버가 따라
내려가고, 그러면 **손이 잡고 있는 슬라이더가 밑으로 도망간다**
(증상 2). 실측으로 200px → 640px 한 번에 224.5px 움직였다.

### 규칙

```
손이 무언가를 만지고 있는 동안        움직이지 않는다
  (임시 미리보기가 떠 있는 동안 =
   슬라이더 · 숫자칸 · 모서리 드래그 · 자르기 전 과정)

손을 뗀 뒤                            자리는 그대로. 단 두 경우만 다시 고른다
  - stage 밖으로 밀려났다
  - 지금 편집 중인 요소를 덮고 있다

선택이 바뀌었다 / 폼 모양이 바뀌었다   새로 고른다 (force)
```

- "덮고 있으면 다시 고른다"가 없으면 안 된다. 팝오버가 그대로 있는
  사이 이미지가 커지면 **모서리 핸들이 팝오버 밑으로 들어가 잡히지
  않는다**(이 라운드에서 실제로 한 번 만들었다가 e2e가 잡았다).
  판정에는 핸들 반지름만큼 여유를 둔다
  (`STUDIO_INSPECTOR_HANDLE_HIT_PAD`).
- "폼 모양"은 `선택 id | 요소 종류 | 직접 수정 열림 | 자르기 열림`
  네 가지다(`studioInspectorPopoverShapeOf`). 자르기 확대/구도가
  바뀌어 내용만 다시 그리는 경우는 여기 들어가지 않는다.
- **자르는 동안에는 프레임 옆에 앉힌다.** 자르기는 프레임 위를 직접
  끄는 조작이라, 아래에 붙으면 큰 프레임에서 드래그 영역을 덮는다.
  좌우에 자리가 없을 때만 위/아래로 돌아간다.
- 선택 테두리와 모서리 핸들은 이 고정과 **무관하게** 늘 실제 프레임을
  따라간다 — 그쪽은 "무엇이 선택돼 있는가"를 보여주는 선이고,
  팝오버는 손이 올라가 있는 판이라서 요구가 반대다.

---

## 5. 공용 편집기 수정과 스킨 수정의 경계

이 라운드에서 **공용 편집기는 부모 컨테이너를 건드리지 않는다.**
읽어서 좌표를 맞추고, 잘라내고 있다는 사실을 안내할 뿐이다.
"이미지가 작아졌으니 부모도 줄인다"를 편집기가 자동으로 하면
여러 요소를 담는 컨테이너까지 함께 줄어든다 — 그건 스킨 저자의
결정이다.

증상 1(바깥 회청색 상자가 그대로 남는다)은 그래서 **스킨 CSS**에서
고쳤다. 산출물: `skin/test-skins/imory-quiet-frame-v6-header-recent.json`
(v5에서 **CSS 규칙 세 줄만** 바뀌고 하나가 추가됐다. templates ·
imageSlots · 폴더 목록/이어읽기는 한 글자도 바뀌지 않았다).

```css
/* v5 — 상자가 스스로 16:9 높이를 정하고 자식을 잘라낸다 */
.finder-hero { width: 100%; aspect-ratio: 16 / 9; overflow: hidden;
               border: 1px solid #e1e3e6; background: #edf0f3; }
.finder-hero-image { width: 100%; height: 100%; object-fit: cover; }
.finder-recent-section { margin-top: auto; }

/* v6 — 상자는 배치만 하고, 높이는 이미지(또는 자르기 프레임)가 정한다 */
.finder-hero { width: 100%; overflow: visible; border: 0; background: transparent; }
.finder-hero > :only-child { display: block; max-width: 100%;
               margin-left: auto; margin-right: auto; border-radius: 3px;
               background: #edf0f3; outline: 1px solid #e1e3e6; outline-offset: -1px; }
.finder-hero-image { width: 100%; max-width: 100%; height: auto; object-fit: cover; }
.finder-recent-section { margin-top: 0; }
```

세 가지가 의도적이다.

- **`width`는 100%로 남긴다.** `fit-content`로 줄이면 이미지의 부모
  안쪽 폭이 곧 이미지 폭이 되어, 너비 슬라이더의 상한(부모 폭)이 지금
  폭에 붙어 **이미지를 다시 키울 수 없다**
  (`inspectorMetricsOf`의 `parentWidth`). 상자는 가로로 늘 꽉 차되
  투명하고, 안의 이미지가 `margin: auto`로 가운데 온다.
- **테두리는 `border`가 아니라 `outline`이다.** `border`를 주면
  자르기 프레임의 안쪽 상자가 2px 줄어 그만큼 사진이 프레임을 덜
  덮는다(빈틈 판정과 좌표가 같이 어긋난다). `outline`은 레이아웃에
  전혀 영향을 주지 않으면서 같은 1px 선을 그린다.
- **`:only-child`를 쓴 이유** — 자르기 전에는 `<img>`가, 자른 뒤에는
  프레임 `<span>`이 그 자리의 유일한 자식이다. 둘 중 무엇이든 같은
  테두리와 배경을 받으므로 기존 모양이 유지되면서 빈 공간만 사라진다.
- `margin-top: auto`를 없애 최근 글이 헤더 높이에 따라 자연스럽게
  위아래로 움직인다. 최근 글의 글자 크기·간격은 그대로다.

---

## 6. 파일

| 파일 | 이 라운드에서 바뀐 것 |
| --- | --- |
| `studio/preview/preview-bridge.js` | `inspectorVisibleRectOf()` 신설 · 세 메시지에 `visibleRect` 추가 |
| `studio/inspector/studio-inspector.js` | 선택 상태에 `visibleRect` · `studioInspectorRectIsClipped()` · 잘림 상태가 뒤집힐 때만 폼 다시 그리기 |
| `studio/inspector/studio-inspector-state.js` | `studioInspectorClipped` |
| `studio/inspector/studio-inspector-overlay.js` | 테두리/판은 `visibleRect`, 핸들은 `rect` + 보이는 범위로 표시 판정 · 팝오버 자리 고정/보정/옆으로 비켜 앉기 |
| `studio/inspector/studio-inspector-controls.js` | 팝오버 "모양" 시그니처로 재배치 시점 결정 |
| `studio/inspector/studio-inspector-crop-model.js` | `inspectorCropTravelPx()` |
| `studio/inspector/studio-inspector-crop.js` | 드래그 기어비 · 위치 슬라이더/방향 버튼 · 이동 안내 · 잘림 안내 |
| `studio/inspector/studio-inspector.css` | 위치 조절 한 줄 UI |
| `skin/test-skins/imory-quiet-frame-v6-header-recent.json` | 헤더 상자 레이아웃 수정본(스킨 쪽) |

Preview iframe에도 로드되는 파일은 `studio-inspector-crop-model.js`
하나 그대로다 — 새 계산은 Studio에서만 쓰므로 iframe 쪽 로드 목록은
바뀌지 않았다.

---

## 7. 지켜야 할 원칙

- 편집기는 선택한 요소의 **부모를 고치지 않는다.** 좌표를 맞추고
  사실을 안내할 뿐이다.
- 좌표를 재는 자리는 두 종류다 — 무엇이 보이는가(`visibleRect`)와
  어디를 기준으로 계산하는가(`rect`). 섞지 않는다.
- 구도 이동은 언제나 **실제로 움직일 수 있는 px**로 정규화한다.
  프레임 크기로 나누지 않는다.
- 손이 무언가를 잡고 있는 동안 그 손 밑의 UI를 옮기지 않는다.
  다만 옮기지 않은 결과로 조작 대상을 덮게 되면 그때는 옮긴다.
- 스킨에서 고칠 수 있는 문제를 편집기의 자동 보정으로 우회하지
  않는다. 대신 왜 그렇게 보이는지 사용자에게 말한다.

---

## 8. 남은 차이

- 이미지가 **뒤늦게 로드되면** 그 사이에 잰 `metrics`(`loaded:false`,
  `naturalWidth:0`)가 그대로 남는다. 다시 선택하면 갱신되지만,
  load 이벤트로 좌표를 다시 올려보내지는 않는다.
- `visibleRect`는 조상의 `overflow`만 본다. `clip-path`나 `mask`로
  잘라내는 경우는 반영하지 않는다.
- 위치 조절은 두 축뿐이다. 회전은 여전히 없다(AI-6D 7절 그대로).
- 자르기 Undo는 여전히 한 단계다(AI-6A 13절 그대로).

---

## 9. 테스트

`studio/studio-crop-e2e-test.mjs`의 **M 절**(포트 8946,
`--only=frame`). fixture `.y-hero-box`는 스스로 높이를 못 박고
자식을 `overflow: hidden`으로 잘라내는 바깥 상자다 — 사용자 스킨의
헤더가 정확히 이 모양이다.

```
node studio/studio-crop-e2e-test.mjs --only=frame
```

| 검사 | 재는 것 |
| --- | --- |
| M1 | 테두리·드래그 판이 **보이는 자리**에만 그려지고 아래 문단을 침범하지 않는다 |
| M1b | 바깥 상자가 잘라내고 있다는 안내 |
| M1c | 자르는 동안 팝오버가 드래그 판을 덮지 않는다 |
| M2 | 세로로 40px 끌면 사진도 40px 움직인다(포인터와 1:1) |
| M3 / M3b | 방향 버튼 · 위치 슬라이더로 구도를 옮겨도 빈틈이 없다 |
| M4 | 여유가 없는 축은 비활성 + 이유 안내 |
| M5 | 너비 슬라이더를 끄는 동안 팝오버가 한 번도 움직이지 않는다 |
| M5b | 손을 뗀 뒤 팝오버가 모서리 핸들을 덮지 않는다 |

함께 돌린 회귀(전부 통과):
`studio/studio-crop-e2e-test.mjs` 48/48 ·
`studio/studio-direct-edit-e2e-test.mjs` 37/37 ·
`studio/studio-inspector-e2e-test.mjs` 34/34 ·
`skin/skin-crop-published-e2e-test.mjs` 13/13 ·
`studio/studio-selected-ai-e2e-test.mjs` 99/99 ·
`studio/studio-file-ux-e2e-test.mjs` 42/42.

스킨 쪽(v6)은 저장소 e2e가 아니라 사용자 스킨을 그대로 넣은 임시
하네스로 확인했다 — Studio에서 자르고 Save/Export한 `.json`을
`get_published_skin` 응답으로 돌려 실제 `index.html`로 공개 HOME을
렌더했고, 프레임 크기 · 사진 위치 · `object-position`이 Studio
Preview와 같았다(모바일 포함). 그 하네스는 저장소에 넣지 않았다.
