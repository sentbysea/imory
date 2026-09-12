# Imory — 본문 장식과 캔버스 배경 (기준 문서)

형광펜 높이 · 문단 강조선 · 캔버스 배경 사진 · 에디터 컬러피커의
**기준 문서**다. 관련 규칙은 여기서만 관리하고 다른 문서에는 링크를
둔다(CLAUDE.md §5).

관련 문서
- 렌더 일치(폭·줄바꿈·문단 간격·페이지 분할): [IMORY_QUOTE_PRESET_RENDER_AUDIT.md](./IMORY_QUOTE_PRESET_RENDER_AUDIT.md)
- 본문 사진: [IMORY_POST_BODY_IMAGE_DESIGN.md](./IMORY_POST_BODY_IMAGE_DESIGN.md)

---

## 0. 한 줄 요약

| 기능 | 저장되는 것 | 그리는 곳 |
| --- | --- | --- |
| 형광펜 높이 | 프리셋의 `highlightHeight`(%) | `applyPostHighlightHeight` |
| 문단 강조선 | 본문 HTML의 마커 span 하나 | `applyPostParagraphRules` |
| 출처 강조선 | 프리셋의 `sourceRule*` | `applyPostSourceRule` |
| 캔버스 배경 | 프리셋의 공개 URL + 정규화 중심 + 배율 | `applyPostPageBackground` |

네 화면(Quote Preset 미리보기 · 에디터 PREVIEW · export · 발행 본문)이
**같은 파일**을 쓴다.

```
posts/style/posts-body-layout.js      설정 정규화 · 본문 스타일 · 문단 간격
posts/style/posts-body-decor.js       형광펜 높이 · 중첩 정리 · 문단/출처 강조선   ← 이번 라운드
posts/style/posts-canvas-background.js 배경 구도 계산 · 레이어 · 흐림 굽기        ← 이번 라운드
posts/preview/posts-page-layout.js    페이지 한 장 · 페이지 나누기
```

---

## 1. 컬러피커 (요구사항 1)

**구현**: `posts/editor/posts-color-picker.js` (팝오버) +
`posts/editor/posts-highlight-toolbar.js`의 `openEditorFormatColorPicker`.

`<input type="color">`를 전부 걷어냈다. OS 피커는 한 번 누르면 닫히고,
열리는 동안 본문 선택과 포커스를 가져가며, `change`마다 undo가 쌓였다.

지금의 계약:

| 동작 | 결과 |
| --- | --- |
| 스와치 `pointerdown` | `preventDefault()` + 선택 저장 → 선택이 유지된다 |
| 팝오버 열기 | undo 스냅샷을 **한 번만** 찍는다 |
| 스펙트럼 드래그 | 창은 열린 채, 색은 본문에 실시간 반영, undo는 쌓이지 않는다(live) |
| `apply` | 지금 색으로 확정. 이 전체가 **undo 한 칸** |
| `cancel` · 바깥 클릭 · `Escape` | 열기 전 상태로 복원하고 그 스냅샷도 없앤다(undo 기록에 흔적 없음) |
| `clear` / `remove` | 선택 범위에서 **그 서식만** 걷어낸다(b/i/u·다른 색은 남는다) |

셋이 같은 컨트롤을 쓴다: HIGHLIGHT · POINT COLOR · 강조선(RULE).
모바일 플로팅 메뉴도 같은 함수를 탄다.

Redo가 이번에 생겼다(`posts/editor/posts-editor-undo.js`) —
`Ctrl/Cmd+Shift+Z`, `Ctrl+Y`, 툴바 `redo` 버튼. 새 변경이 생기면 redo
스택을 비운다.

---

## 2. 형광펜이 겹치지 않는다 (요구사항 2)

**원인**: 예전 `applyEditorHighlight`는 "선택 전체가 하나의 span 안"일
때만 색을 바꾸고, 그 밖에는 무조건 새 span으로 감쌌다. 칠해진 구간의
**일부만** 다시 칠하면 span 안에 span이 생겨 두 배경이 겹쳤다.

**지금**(`applyEditorInlineColor`):

1. `range.extractContents()` — 걸쳐 있던 span은 브라우저가 쪼개 준다.
2. 꺼낸 조각 안의 같은 종류 span을 전부 벗긴다.
3. 새 span 하나로 감싸 다시 넣는다.
4. 넣은 자리가 또 다른 형광펜 **안**이면 `flattenNestedPostHighlights`가
   바깥을 [앞][안][뒤]로 쪼갠다 — **안쪽(방금 고른 색)이 이긴다.**
5. 글자 없는 껍데기는 `removeEmptyPostHighlights`가 걷어낸다.

- 부분 선택 → 선택한 부분만 새 색, 양옆은 기존 색.
- 여러 하이라이트 + 일반 텍스트에 걸친 선택 → 새 색이 한 번만.
- 굵게/기울임/밑줄/글자색/글꼴은 그대로.

**이미 중첩된 옛 데이터**는 일괄 마이그레이션하지 않는다.
`sanitizeRichHTML`(= 저장할 HTML을 읽을 때)과
`getPostContentAsSafeHTML`(= 그릴 때)이 지나갈 때만 펴진다. 그래서 그 글을
실제로 저장하는 순간에만 정리된 모양으로 다시 저장된다.

---

## 3. 형광펜 높이 (요구사항 3)

`highlightHeight` — **글자 크기에 대한 비율(%)**, 30~100. 없으면 100
(= 지금 발행된 글과 같은 모양).

- 100 → 예전 그대로 `background-color`로 인라인 상자를 가득 칠한다.
- 100 미만 → `background-color: transparent` +
  `linear-gradient(to bottom, 투명 0 (100-N)%, 색 (100-N)% 100%)`.
  퍼센트 기준이 **인라인 상자 높이**(= font-size에 비례, line-height와 무관)라
  글자 위치·줄 간격·줄바꿈·페이지 높이가 전혀 변하지 않는다.
- 모서리는 **직각으로 통일**(`border-radius: 0`). 옵션을 두지 않는다.
- 여러 줄은 이미 걸려 있던 `box-decoration-break: clone`이 줄마다 따로 칠한다.

**export**: html2canvas의 여러 줄 하이라이트 버그를 피하려고 글자 단위로
다시 감싸는 기존 우회(`bakeHighlightSpansForCapture`)가 이제
`background-image`(그라디언트)까지 들고 간다 — 색만 복사하면 높이 설정이
export에서만 사라졌다.

---

## 4. 지문 · 대사 · 출처가 각각 독립 섹션 (요구사항 4)

Quote Preset의 섹션이 `BODY / NARRATION / DIALOGUE / SOURCE`로 갈라졌다.

- **저장 구조는 그대로다** — `actionColor` · `actionWeight` ·
  `actionItalic` · `dialogue*` 키와 판별 방식(`*지문*` · `"대사"`)이 전혀
  바뀌지 않았다. 화면 자리만 옮겼다.
- 모바일 탭은 그대로 5개이고 NARRATION/DIALOGUE는 `body` 탭에 들어간다.
- 두 섹션 헤더의 보조 문구가 서식 기호(`*text*` · `"text"`)다.

---

## 5. 강조선 — 문단 왼쪽 세로선 (요구사항 5)

### 저장되는 것은 마커 하나뿐

```html
<span class="post-para-rule" data-rule="on" data-rule-color="#ee9fbd"></span>
```

실제로 선을 그리는 상자(`.post-para-rule-box`)는 **그릴 때마다 새로 만들고
저장하지 않는다** — 문단 간격 블록과 같은 방식이다. 굵기 기본값이 나중에
바뀌어도 이미 저장된 글이 따라온다.

### 상태가 셋이다

| 마커 | 뜻 |
| --- | --- |
| 없음 | 상속 — 대사 자동 강조선이 켜져 있고 이 문단이 대사면 붙는다 |
| `data-rule="on"` | 개별 적용 — 대사가 아니어도 붙는다 |
| `data-rule="off"` | 개별 해제 — 대사여도 붙지 않는다 |

`off`가 있어야 "자동으로 붙은 선을 지웠는데 다음 렌더에서 다시 생기는" 일이
없다. 에디터에서 해제할 때 **대사 문단이면 `off` 마커를 남기고**, 대사가
아니면 마커째 지운다(되살아날 자리가 없으므로).

### 규칙

- 문단 경계는 본문 흐름 최상위의 `<br><br>`(→ 문단 간격 블록)과 PAGE break.
- 문단 **일부만** 선택해도 그 문단 전체에 걸린다. 선택이 여러 문단에
  걸치면 그 문단들 전부.
- 상자가 문단당 하나라, 수동과 자동이 겹쳐도 **선은 하나**다(수동이 이긴다).
- 색: 마커의 `data-rule-color` → 없으면 프리셋 기본값(BODY/DIALOGUE).
  굵기: 프리셋에서만. 에디터는 적용·해제와 색만 다룬다.
- 선과 글자 사이 여백은 `POST_RULE_GAP = 12px` 하나로 고정(옵션 없음).
- 대사 자동 적용의 **기본값은 꺼짐**이다 — 켜진 채로 들어오면 이미 저장된
  모든 프리셋의 외형이 한 번에 바뀐다.
- 출처 강조선은 요소 하나라 그 요소에 직접 테두리를 건다. 에디터는 이번
  발췌만 켜고/끄고 색을 바꿀 수 있다(세션 오버라이드).

### 편집창의 표시 — 의도한 차이

편집창에서는 **본문 DOM을 건드리지 않고** contenteditable 바깥 레이어에
선만 그린다(`posts/editor/posts-rule-overlay.js`). 본문 사진의 '대표'
버튼과 같은 방식이다.

왜: 이 에디터의 문단은 `<br><br>`로만 나뉜다. 편집창 안에서 문단을 블록으로
감싸면 그 `<br><br>`이 상자 바깥에 남아 **빈 줄이 하나 더 생기고**, 저장되는
HTML의 문단 구조도 달라진다.

그래서 편집창의 선은 글자 **왼쪽 여백**에 그려지고 글자를 밀지 않는다.
실제 발췌/발행 본문에서는 선과 글자 사이에 12px이 들어가 문단이 그만큼
들여쓰기된다. 최종 모양은 바로 아래 발췌 PREVIEW에서 확인한다.

---

## 6·7. 캔버스 배경 사진과 구도 (요구사항 6·7)

### 저장하는 것은 "원본 위의 한 점"과 "배율"이다

```
backgroundImageUrl     공개 URL(임시 주소 아님)
backgroundImageScale   1 = 캔버스를 빈틈없이 덮는 최소 크기(cover), 최대 3
backgroundImageFocusX  원본 이미지 기준 정규화 좌표(0~1)
backgroundImageFocusY
backgroundImageBlur    px (0~40)
backgroundOverlayColor
backgroundOverlayOpacity 0~1
```

픽셀 이동량을 저장하지 않는 이유: 프리셋의 예시 텍스트와 실제 발췌문은
길이도 캔버스 비율도 다르다. "왼쪽으로 120px"은 세로로 긴 발췌에서 전혀
다른 자리를 가리킨다. 최종 캔버스 크기가 정해진 **뒤에** 그 점이 한가운데로
오도록 계산한다. 비율이 달라지면 잘리는 영역까지 같을 수는 없다(전제).

### ~~빈 공간이 생기지 않는다~~ → **철회됨 (§9-2)**

원래 규칙은 "배율 1 = cover가 최소이고, 사진이 언제나 캔버스를 빈틈없이
덮는다"였다. 지금은 0.5까지 줄일 수 있고 드러난 둘레는 캔버스 배경색이다.
새 규칙은 §9-2에 있다.

남아 있는 부분: 배율 1은 여전히 cover이고(기준점), 원본 비율은 어느 쪽으로도
유지되며, 중심은 유효 범위로 잘려서 드래그가 그 끝에서 멈춘다. 다만 그
"유효 범위"의 뜻이 사진 크기에 따라 뒤집힌다(§9-2).

### 흐림이 가장자리를 갉아먹지 않는다

`filter: blur(r)`는 요소 가장자리에서 바깥의 "없음"과 섞여 투명해진다.
그래서 덮어야 할 상자를 **`ceil(3r)`만큼 키워서** 계산하고, 그 초과분을
`overflow: hidden` 상자가 잘라낸다.

**변경됨(§9-2):** 그 여유는 "사진이 어차피 캔버스를 덮는" 경우에만 준다.
크기를 고정했거나 사용자가 사진을 줄였으면 여유를 주지 않는다 — 흐림이
사용자가 정한 크기를 키우면 안 되기 때문이다.

### 레이어와 쌓임 순서

```
.post-editor-preview-page (position: relative)
  └ .post-page-background (absolute, inset 0, overflow hidden, z-index 0)
      ├ img.post-page-background-image   ← filter: blur()가 걸리는 유일한 요소
      └ .post-page-background-overlay    ← 덮개 색/농도
  └ title / body / source (position: relative, z-index 1)
```

글자는 흐려지지 않는다. 본문 요소를 `position: relative`로 올린 이유는
positioned인 배경이 static인 본문보다 **나중에 칠해지기** 때문이다(레이아웃은
변하지 않는다).

### export에서 흐림을 굽는다 — 실측으로 확인된 함정 둘

1. **html2canvas는 CSS filter를 구현하지 않는다.** 화면은 흐린데 저장된
   PNG만 또렷했다. 캡처 직전에 흐림을 입힌 이미지로 바꿔 끼우고, CSS
   filter는 뗀다(`bakePostBackgroundForCapture`).
2. **바꿔 끼운 그림이 다 실린 뒤에 캡처해야 한다.** html2canvas는
   `img.currentSrc`를 읽고, 그 값은 새 주소를 다 읽어들인 뒤에야 바뀐다.
   `src`만 갈아 끼우고 곧바로 캡처하면 **예전 주소**가 그려진다(구운 이미지
   자체에는 흐림이 들어 있는데도 export만 또렷했다 — 실측). 그래서
   `bakePostBackgroundForCapture`는 async이고 `image.decode()`를 기다린다.
3. **`ctx.filter` 지원 판정은 대입하기 전에 해야 한다.** WebKit에는
   `ctx.filter`가 아예 없다(읽으면 `undefined`). 그런데 **대입은 조용히
   받는다** — 인터페이스에 없는 이름이라 평범한 JS 프로퍼티가 하나 붙을
   뿐이고, 그 뒤에 읽으면 방금 넣은 문자열이 그대로 나온다. 그리기에는
   아무 영향이 없다. 그래서 "넣고 읽어서 확인"하면 **지원한다고 잘못
   판정한다**(이번에 실제로 이렇게 틀렸다가 e2e에서 잡혔다). 대입 전
   `typeof`가 유일하게 믿을 수 있는 신호다.

### 흐림 폴백 — `ctx.filter`가 없는 환경 (Safari/WebKit)

`ctx.filter` 하나에만 기대면 그게 없는 브라우저에서는 "화면은 흐린데 저장본만
또렷한" 결과가 남는다. export가 성공해도 미리보기와 저장 결과가 다르면 이
기능은 완성이 아니다. 그래서 브라우저 필터에 기대지 않는 길을 하나 더 둔다
(`posts/style/posts-canvas-background.js` §5).

- **무엇을 쓰나.** 박스 블러 3회로 표준편차 σ의 가우시안을 근사한다(폭은
  Wells 1986의 계산). 누적합이라 반지름이 커져도 픽셀당 비용이 일정하다.
- **CSS와 같은 가장자리.** CSS `blur()`는 요소 바깥을 "없음"(투명)으로 보고
  섞는다. 그래서 창 밖을 0으로 둔다(가장자리 복제 아님). 알파가 섞이므로
  **미리 곱한 상태로** 흐린 뒤 되돌린다 — 안 그러면 투명한 가장자리의 색이
  안쪽으로 번져 테두리가 생긴다.
- **모바일의 큰 사진.** 흐린 그림은 저주파라, 반지름에 비해 충분히 작은
  축소는 눈에 보이는 차이를 만들지 않는다. 픽셀 수가 예산(1.2M)을 넘고
  반지름이 충분하면 1/2~1/4로 줄여서 흐린 뒤 되돌린다(반지름도 같은 비율로
  줄이고, 축소 뒤 반지름이 2px 아래로는 내려가지 않게 막는다).
- **건드리는 것은 배경 `<img>` 하나뿐이다.** 글·덮개·사진의 자리와 크기는
  그대로다 — 바뀌는 것은 그 `<img>`의 `src`와 `style.filter`뿐이고, 구운
  그림은 원래와 같은 픽셀 크기라 레이아웃이 움직이지 않는다.

**검증**(`posts/posts-editor-decor-e2e-test.mjs --only=export`, chromium ·
webkit 양쪽 13/13). WebKit에서 건너뛰던 SKIP을 없앴다.

- 흐림 전후의 실제 픽셀 차이(경계에서 섞인 색: 0 → 123,000).
- **미리보기 대비**: 화면(CSS filter)을 Playwright로 찍어 디코드하고, export
  PNG와 경계 번짐 폭을 같은 규칙으로 재서 비교한다 — 네이티브 경로 1.0%,
  폴백 경로 4.1% 차이.
- 폴백 자체를 직접 불러서 σ만큼 흐리는지(계단 경계의 섞임 띠 폭 ≈ 1.51σ),
  가장자리가 CSS처럼 투명하게 잦아드는지.

### 저장 경로 — migration 없음

`user-banners/{user_id}/quote-backgrounds/{uuid}.{ext}`
(`core/lib/quote-background-upload.js`).

기존 `user-banners` 버킷의 정책이 이미 정확히 필요한 모양이다:
own-folder 쓰기(`(storage.foldername(name))[1] = auth.uid()`) + 버킷 전체
공개 읽기. own-folder 규칙은 한 단계 더 깊은 경로에도 그대로 적용된다
(`20260906110000_create_user_avatars_bucket.sql` 주석의 같은 근거).
**그래서 DB migration이 필요 없다.**

경로는 매번 새로 만든다(`upsert:false`) — 고정 경로에 덮어쓰면 다른 프리셋이
보고 있던 그림까지 같이 바뀐다. 모든 업로드 경로 공용
`prepareImoryUploadImage`를 지나므로 메타데이터 제거·압축도 그대로 적용된다.

---

## 8. Editor의 배경 조작 UI (요구사항 8)

**변경됨(§9-8):** 여닫는 패널을 없앴다. 세 버튼이 발췌 설정의 마지막 줄에
바로 있다. 프리뷰 위에 상시로 뜨는 버튼은 여전히 없다.

| 버튼 | 하는 일 |
| --- | --- |
| `change image` | 이미지 교체(업로드) — 새 사진이면 구도는 가운데에서 새로 시작 |
| `move` | 위치 조정 모드 — **이 모드에서만** 드래그가 배경을 움직인다 |
| `reset` | 프리셋 기본 이미지·위치로 복원 |

- 확대/흐림/덮개/크기 정책의 상세 설정은 Quote Preset에만 있다. **사진을
  교체해도 그 값들은 그대로 남는다** — 이 화면이 view에 넣는 것은 사진 주소와
  구도(url·focusX·focusY·pages)뿐이다.
- 조정 모드는 `Escape`로도, move를 다시 눌러도 끝난다.
- 조정용 테두리는 **무대(stage)**에 있다 — 캡처 대상인 페이지 바깥이라
  저장 이미지에 들어갈 자리가 없다.
- 평소에는 모바일 스크롤·핀치·본문 선택 등 기존 제스처를 전혀 건드리지
  않는다(핸들러가 `previewBackgroundMoveMode`일 때만 동작한다).

### 이번 발췌 전용 설정 — 프리셋을 고치지 않는다

`posts/preview/posts-preview-background.js`의 세션 오버라이드. 정렬/비율
오버라이드(`posts-preview-css-vars.js`)와 완전히 같은 규칙이다 — `null`이면
"프리셋 값을 따르는 중", 글 하나를 열 때 전부 `null`로 되돌아간다.

### 여러 장

- **1쪽**에서 끌면 기본 구도가 바뀐다 → 개별 보정이 없는 모든 장에 적용.
- **2쪽 이후**에서 끌면 그 장만의 보정으로 저장된다
  (`previewBackgroundPageFocus`).
- 본문이 바뀌어 장이 줄면 **사라진 장의 보정은 버린다**
  (`prunePreviewBackgroundPageFocus`). 지금의 페이지 식별 구조가 "몇 번째
  장"뿐이라 그 이상으로 따라갈 근거가 없고, 남겨두면 엉뚱한 장에 붙는다.

---

## 9. 실기기(아이폰) 확인 뒤 라운드 — 요구사항 1~9

첫 라운드는 실기기에서 확인하지 않은 채 배포됐다. 아이폰에서 실제로 써 보고
나온 수정이다. 아래 번호는 그 요구사항 번호다.

### 10-1. Quote Preset CANVAS를 Size / Background로 나눔

- **Size** — 비율·내보내기 너비·안쪽/위아래/좌우 여백.
- **Background** — 배경색과 사진 고르기가 **같은 줄**, 그 아래 덮개(색+농도),
  확대, 흐림, 이미지 크기 고정.
- 사진을 써도 그 아래에는 배경색이 깔린다. 사진을 지우면 배경색만 남는다.
- **슬라이더를 남긴 항목은 `[라벨][슬라이더][값]`이 가로 한 줄**이다
  (`.quote-setting-row--slider`). 라벨 아래로 컨트롤이 내려가던 형태를
  없앴다 — 좁은 화면에서 설정 화면이 두 배로 길어지던 가장 큰 원인이었다.
- 덮개 농도·형광펜 높이·강조선 굵기/거리는 **슬라이더 대신 네모 숫자 칸**이다.

**덮개 농도의 새 기본값 50%** — `POST_STYLE_DEFAULTS`는 **0 그대로 둔다**.
그 값은 이미 저장된 프리셋을 읽는 기준이라, 여기서 0.5로 바꾸면 이 필드가
생기기 전에 저장된 모든 프리셋의 외형이 배포 한 번으로 달라진다. 50%는 폼의
시작값으로만 주고, **저장된 값이 없고 배경 사진도 없을 때**만 준다
(`quoteOverlayOpacityForForm`). 그래서:

| 프리셋 | 폼에 보이는 값 | 이유 |
| --- | --- | --- |
| 명시적 0% 저장됨 | 0% | 사용자의 선택 — 보존 |
| 값 없음 + 사진 있음 | 0% | 열기만 했는데 외형이 달라지면 안 됨 |
| 값 없음 + 사진 없음 | 50% | 덮개가 그려질 자리가 없으므로 차이 없음. 사진을 새로 넣는 순간이 곧 "신규" |

### 10-2. 확대 50~150% · 축소 허용 · 이미지 크기 고정

**"언제나 빈틈없이 덮는다"는 규칙을 철회한다.**

- 확대 슬라이더는 **50~150%**, 가운데가 100%(= cover).
- 사진이 캔버스보다 작아도 된다. 드러난 둘레는 **캔버스 배경색**이다.
- 덮개는 **사진 위에만** 깔린다(예전에는 상자 전체 `inset:0`이었다) —
  그러지 않으면 "드러난 자리는 배경색"이 깨진다.
- 원본 비율은 어느 쪽으로도 유지된다.

**중심 자르기의 식이 뒤집힌다.** `m = box / (2·drawn)`일 때

| | 유효 구간 | 뜻 |
| --- | --- | --- |
| 사진 ≥ 캔버스 (m ≤ 0.5) | `[m, 1−m]` | 빈틈이 생기지 않는 범위 |
| 사진 < 캔버스 (m > 0.5) | `[1−m, m]` | 사진이 삐져나가지 않는 범위 |

두 경우 모두 0.5를 품으므로 한 식(`min/max`)으로 쓴다. 예전 코드는 후자를
`[0.5, 0.5]`로 눌러버려서 사진을 줄이면 드래그가 죽었다(그때는 줄일 수도
없었으므로 드러나지 않던 자리).

**흐림이 크기를 바꾸지 않는다.** 여유(overhang)는 "여유 없이 재 봤을 때 사진이
이미 캔버스를 덮는" 경우에만 준다.

**이미지 크기 고정(`backgroundImageFixedSize`)**

- 켜면 표시 너비를 **캔버스 너비에 대한 비율**(`backgroundImageWidthRatio`)로
  잡는다. 식에 상자 **높이**가 없으므로, 같은 너비라면 페이지 높이가 달라져도
  사진 속 사물 크기가 같다(1200×912와 1200×2160에서 동일). 첫 페이지 높이를
  기준으로 삼지 않으므로 첫 장의 글 길이가 바뀌어도 그대로다.
- 출력 너비가 달라지면 같은 비율로 함께 조정된다.
- 확대 배율은 여기에 **곱해진다** — 슬라이더가 두 모드에서 같은 뜻을 유지한다.
- 기본 위치는 가운데, 기존 드래그로 옮길 수 있다.
- 끄면 예전 cover 동작 그대로다(단 50% 축소와 배경색 노출은 허용).
- **기본값 false** — 이미 저장된 프리셋을 이 옵션이 생겼다는 이유로 켜지 않는다.
- 켜는 순간의 기준은 "고정이 아니었다면 지금 그려졌을 너비"를 **계산**해서
  잡는다(`quoteLooseBackgroundWidthRatio`). 그려진 `<img>`를 재면 두 군데서
  어긋난다 — 원본 크기가 비동기로 도착하고, 같은 change에 걸린 다른 리스너가
  먼저 프리뷰를 다시 그려서 이미 "고정된 뒤의 크기"가 그려져 있다.

**옛 확대 값(150% 초과)의 호환 처리** — 렌더/저장이 받아들이는 범위는
`0.5~3`으로 넓게 둔다(폼 슬라이더는 50~150). 150%를 넘는 값이 저장된
프리셋을 열면 그 세션 동안만 슬라이더의 최대치를 그 값까지 늘린다
(`applyQuoteSettings`). **열기만으로 저장값이 깎이지 않는다.** 사용자가
슬라이더를 150 이하로 내리면 그 뒤로는 보통 구간에서 움직인다.

### 10-3. 강조선 거리 (`bodyRuleGap` / `dialogueRuleGap` / `sourceRuleGap`)

- 색 + 굵기가 한 줄, 거리는 바로 다음 줄(좁은 화면에서 셋을 한 줄에 넣으면
  비좁다). 굵기·거리는 네모 숫자 칸(px).
- **값이 없는 옛 프리셋은 12px** — 예전에 `POST_RULE_GAP` 상수로 박혀 있던
  바로 그 값이다. 그래서 이 옵션이 생겨도 이미 발행된 글의 모양은 그대로다.
- BODY / DIALOGUE / SOURCE가 각자 자기 값을 쓴다. 뷰어·발췌·export 공통.

### 10-4. SOURCE 강조선이 출처 글자를 따라간다

예전에는 출처 요소(블록)에 `border-left`를 걸었다. 그 블록은 캔버스 폭을 다
차지하므로 오른쪽 정렬이면 **글자는 오른쪽, 선은 본문 왼쪽 끝**에 남았다.

지금은 글자를 `<span class="post-source-rule-box">`(inline-block)로 감싸고 그
상자에 선을 건다. 상자가 글자 폭만큼만 차지하므로 선이 글자를 따라가고,
바깥 블록의 `text-align`이 좌/가운데/우 정렬을 그대로 결정한다 — 선을
절대좌표로 옮기는 것이 아니라 **글자 묶음의 실제 크기와 정렬을 따른다**.

- 오른쪽 정렬이어도 선은 글자 **왼쪽**에 남는다.
- 여러 줄이 되면 상자가 그만큼 높아질 뿐, 선이 멀어지거나 글자와 겹치지 않는다.
- 꺼지면 상자를 걷어내 예전과 같은 DOM으로 되돌린다(겹쳐 쌓이지 않는다).

### 10-5. Editor 툴바 정확히 세 줄 + 취소선

```
1행  page break · H · P · L · clear
2행  FORMAT · B · I · U · S · photo · preset
3행  (오른쪽) undo · redo
```

- 바깥 상자가 세로 방향이고 각 행(`.post-editor-tool-line`)이 자기 안에서만
  정렬한다. 예전에는 버튼 묶음 여덟 개가 하나의 `flex-wrap` 줄에서 화면 폭에
  따라 제멋대로 갈렸다.
- 라벨을 `H`/`P`/`L` 한 글자로 줄이고 뜻은 `aria-label`·`title`에 남겼다.
  중복이던 `RULE`+`line`, `PHOTO`+`사진`을 하나로 합쳤다 — **`photo` 버튼
  자체가 사진 삽입**이다.
- 좁은 화면에서는 간격과 드롭다운 폭만 줄인다. 버튼은 더 깎지 않고, 그래도
  넘치면 행이 가로로 밀린다(`overflow-x`).
- **취소선**: `<s>`로 저장한다. sanitizer가 `s`/`strike`/`del`을 모두 받아
  `<s>`로 통일한다. B/I/U와 같은 `toggleEditorInlineTag` 구조라 혼합·undo/redo·
  저장 왕복·공개 뷰어·발췌가 자동으로 따라온다.

### 10-6. 컬러피커 — 아이폰에서 Apply/Cancel이 안 눌리던 진짜 원인

**원인(실측).** 본문 선택을 지키려고 팝오버가 `pointerdown`에서
`preventDefault()`를 건다. WebKit은 **터치**에서 그 preventDefault를 "이
제스처의 합성 마우스 이벤트를 만들지 말라"로 해석해서 뒤따르는 `click`을 아예
만들지 않는다. Chromium은 만든다.

| | 발생한 이벤트 |
| --- | --- |
| webkit / touch | `pointerdown(prevented)`, `pointerup` |
| webkit / mouse | `pointerdown(prevented)`, `pointerup`, `click` |
| chromium / touch | `pointerdown(prevented)`, `pointerup`, `click` |
| chromium / mouse | `pointerdown(prevented)`, `pointerup`, `click` |

apply/cancel/remove가 `click`만 듣고 있었으므로 아이폰에서는 눌리지 않았고,
바깥 클릭 감지는 팝오버 안을 건너뛰므로 창도 닫히지 않았다. **mock 테스트가
chromium이라 이 차이를 못 잡았다.**

**해법.** 공용 `bindImoryTapButton`(`posts/editor/posts-color-picker.js`) —
`pointerup`으로 실행하고 키보드를 위해 `click`도 듣되 같은 누름을 두 번
처리하지 않는다. 누른 버튼에서 떼야 실행된다. 같은 함정에 걸려 있던 다른
버튼도 함께 옮겼다: 색 견본 셋(H/P/L), 강조선 토글, page break, photo,
대표 사진 지정.

**기본 피커(`<input type="color">`)로 돌아가지 않은 이유.** ~~취소 채널이
없고 undo 한 칸을 보장할 수 없어서~~ → **철회됨 (§10-9)**. 원인 후보로만
적어 둔 "`pointerdown`/`change`마다 contenteditable DOM과 선택을 다시 쓴다"가
실제 원인이었고, 그것을 고치면 나머지 제약도 함께 사라진다.

**폭.** `width: min(232px, calc(100vw - 32px))`. 예전에는 400px 이하에서
`calc(100vw - 24px)`로 오히려 **늘려서**, 390px 아이폰에서 366px짜리 전면
시트처럼 보였다.

### 10-7. 발췌 설정 정리

- 발췌 설정의 **출처 강조선 색 견본을 제거**했다. 이 화면에서는 켜고 끄기만
  하고 색은 프리셋의 SOURCE 값을 따른다. **본문 툴바의 H/P/L 색 견본은
  그대로다** — 다른 컨트롤이다.
- 크기 모드가 한 줄: `size · uniform · auto · custom` (custom 입력칸 유지).
- `1200 × 912` 같은 출력 크기 표시를 설정 항목에서 빼고 **발췌 대지 우측 상단
  바깥**(`.post-editor-preview-stage-meta`)으로 옮겼다. 페이지를 넘기면 그
  페이지 크기로 갱신되고, 대지 바깥이므로 저장 이미지에는 들어가지 않는다.

### 10-8. 배경 조작 UI와 사진 교체

- 여닫는 패널을 없애고 `change image · move · reset`을 설정 마지막 줄에 바로
  뒀다. 패널이 사라지면서 "패널을 열 때 함께 일어나던" 버튼 활성화 동기화가
  없어졌으므로, `updateEditorPreview()` 끝에서 `syncPreviewBackgroundControls()`
  를 부른다.
- **사진 교체가 프리셋 설정을 덮어쓰지 않는다.** 이 화면이 view에 넣는 값은
  `url · focusX · focusY · pages`뿐이고, 덮개·흐림·확대·크기 정책은
  `resolvePostBackgroundView()`가 언제나 프리셋에서 읽는다. 구도만 가운데로
  되돌리는 이유는 새 사진에서 옛 중심이 전혀 다른 자리를 가리키기 때문이다.

### 10-9. 기본 피커를 다시 기본값으로 — 원인을 먼저 고친 뒤

사용자의 우선순위는 둘이다. **아이폰 기본 색상 선택기를 쓰는 것**, 그리고
**색을 조정하는 동안 앱 때문에 그 창이 닫히지 않는 것**. 그래서 §10-6에서
기본 피커를 배제했던 판단을 되돌리고, 원인부터 고쳤다.

**원인 1 — 색 한 번에 본문이 다시 만들어지고 선택이 두 번 갈아끼워진다.**
`applyEditorInlineColor()`는 호출될 때마다 `getEditorRange()`(→
`restoreEditorSelection()` = `removeAllRanges` + `addRange`) →
`range.extractContents()` → `insertNode()` → `selectWrappedContent()`(두 번째
`removeAllRanges` + `addRange`)를 돌았다. 커스텀 팝오버는 우리가 그린 div라
본문이 바뀌어도 사라지지 않아 눈에 띄지 않았지만, OS가 띄우는 창에게는
치명적이다.

→ **한 번의 조정 = 하나의 세션**으로 바꿨다(`posts/editor/format/posts-editor-highlight.js`
§live). 세션의 첫 색만 전체 경로를 지나고, 그 뒤로는 만들어 둔 span의
`dataset`/`style`만 바꾼다. DOM 구조도 문서 선택도 건드리지 않는다. 세션이
없거나 기억해 둔 span이 본문에서 사라졌으면(Undo 등) 전체 경로로 안전하게
되돌아간다. 강조선도 같은 이유로 마커를 기억한다 — 그러지 않으면 창이 열려
선택이 사라진 뒤 "강조선을 넣을 문단에 커서를 두세요"만 반복된다.

**원인 2 — 선택이 있는 것만으로 `selectionchange`가 초당 1만 번 넘게 돌았다
(실측: 300ms에 3,800여 회).** 고리는 이렇다.

```
selectionchange
  → saveEditorSelection            (posts/editor/posts-richtext-events.js)
  → updateEditorToolbarState
  → syncEditorRuleToggleState
  → editorParagraphRunsInSelection
  → restoreEditorSelection         (removeAllRanges + addRange)
  → selectionchange …
```

`restoreEditorSelection()`이 **자리가 그대로여도** 선택을 다시 설정한 것이
전부다. 이건 이번 라운드가 만든 것이 아니라 이미 있던 고리다. 화면에는 잘
드러나지 않지만, 선택이 끊임없이 재설정되는 문서에서 OS 색상 선택기가 열려
있을 수는 없다.

→ **바꿀 게 없으면 건드리지 않는다.** 현재 선택이 `savedEditorRange`와 같은
자리면 그대로 두고 돌아온다(`posts/editor/format/posts-editor.js`). 고친 뒤
같은 측정에서 **0회**다.

**어느 쪽 피커를 쓰나.** `window.IMORY_COLOR_PICKER_MODE`로 강제할 수 있고
(`native` / `custom`), 정하지 않으면 **`<input type="color">`를 쓸 수 있고
손가락이 주 입력인 기기**에서만 기본 피커를 쓴다. 데스크톱은 지금까지처럼
커스텀 팝오버다. **커스텀 피커는 제거하지 않았다** — 대안으로 그대로 남아
있고, 기본 피커를 열지 못하면 그쪽으로 이어진다.

**기본 피커의 의도된 차이 — Cancel이 없다.** OS 창에는 "취소하고 원래대로"가
없다. 그 자리를 **Undo 한 번**이 대신한다: 피커를 여는 순간 스냅샷을 한 번만
찍고 조정 중에는 쌓지 않으므로, 조정 전체가 정확히 undo 한 칸이다. 창이 열릴
때 선택이 사라지므로, **선택이 아직 살아 있는 여는 순간에** 지금 색을 한 번
발라 자리를 만들어 둔다(씨앗).

### 10-10. 사진 교체 뒤 덮개 — 재현 실패 · 원인 미확정

현재 상태는 **원인 미확정**이다. cover 확대(§10-2) 때문이라는 추정으로
해결 처리하지 않는다. 하네스에서 data: URL · 느린 원격 URL · 실제 UI 경로
어느 쪽으로도 재현되지 않았고, 코드 경로상 덮개를 건드리는 자리도 없다.
§10-8의 상속 회귀 테스트는 그대로 두되, 추가 재현 근거가 나오기 전에는
관련 코드를 더 바꾸지 않는다.

---

## 10. 남은 차이 / 확인하지 않은 것

- **실기기(아이폰)에서 직접 확인하지 않았다.** 이번 라운드의 검증은 Playwright
  chromium과 **webkit(터치 켜짐)** 에뮬레이션이다. 기본 색상 선택기(§10-9)에서
  **이 하네스로는 만들 수 없는 값**이 있다 — Playwright WebKit 빌드에는
  `<input type="color">`가 없고(`input.type`이 `"text"`로 떨어진다), `hasTouch`를
  켜도 `navigator.maxTouchPoints`가 0이다. 그래서 아래는 아이폰에서만 확인된다.

  1. 손가락 기기에서 자동 판정이 실제로 `native`로 떨어지는가
     (`imoryColorPickerMode()`가 `supported && touch`를 본다).
  2. `pointerup` 안에서 부른 `input.click()`이 아이폰 Safari에서 실제로 OS
     색상 선택기를 띄우는가(사용자 제스처로 인정되는가).
  3. **띄운 창이 색을 조정하는 내내 열려 있는가** — 앱 쪽 원인 둘은 제거하고
     0회까지 확인했지만(§10-9), 그 밖의 이유가 남아 있는지는 실기기에서만
     보인다.
  4. 창을 닫을 때 `change`(또는 `blur`)가 실제로 오는가 — 세션을 끝내는 신호다.
  5. 숨은 1px 칸에 포커스가 갈 때 툴바가 튀지 않는가.

  **되지 않으면**: `window.IMORY_COLOR_PICKER_MODE = "custom"` 한 줄로 지금의
  커스텀 팝오버로 되돌아간다(제거하지 않고 대안으로 보존했다).
- **"발췌에서 사진을 교체하면 프리셋 덮개가 사라진다"는 재현 실패 · 원인
  미확정이다**(§10-10). data: URL·느린 원격 URL·실제 UI 경로(파일 선택 →
  업로드 mock → change 핸들러) 모두에서 덮개 농도·색·흐림이 그대로 남았다.
  코드 경로상 덮개를 건드리는 자리가 없다는 것은 확인했고(§10-8), 그 성질을
  지키는 회귀 테스트는 유지한다. cover 확대(§10-2) 때문이라는 추정은 **추정일
  뿐이며 해결로 처리하지 않는다.**
- **편집창의 강조선은 글자를 밀지 않는다**(§5 마지막). 의도한 차이다.
- **배경 이미지는 프리셋/세션 단위**다. 글 하나에 영구히 박아두는 자리
  (`posts` 테이블의 칼럼)는 만들지 않았다 — 그 글의 `quote_preset_id`가
  가리키는 프리셋을 따른다.
- **프리셋 import/export**는 이 저장소에 없다(스킨 쪽에만 있다). 프리셋은
  DB의 `quote_presets.settings` JSON 하나이고, 이번 필드도 그 안에 그대로
  들어간다.
- 여러 장 배경 보정의 식별자는 **장 번호**다. 본문을 크게 고치면 같은 번호가
  다른 내용을 가리킬 수 있다.
