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

### 빈 공간이 생기지 않는다

1. 배율 1이 cover다 — 높이에만 맞춰 양옆이 비거나 비율을 찌그러뜨리지 않는다.
2. 중심 자체를 유효 범위로 자른다:
   `boxWidth/(2·drawnWidth) ≤ focusX ≤ 1 − boxWidth/(2·drawnWidth)`.
   드래그가 그 범위 끝에서 자연스럽게 멈춘다.

### 흐림이 가장자리를 갉아먹지 않는다

`filter: blur(r)`는 요소 가장자리에서 바깥의 "없음"과 섞여 투명해진다.
그래서 덮어야 할 상자를 **`ceil(3r)`만큼 키워서** 계산하고, 그 초과분을
`overflow: hidden` 상자가 잘라낸다.

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
   PNG만 또렷했다. 캡처 직전에 캔버스 2D의 `ctx.filter`로 흐림을 입힌
   이미지로 바꿔 끼우고, CSS filter는 뗀다(`bakePostBackgroundForCapture`).
   `ctx.filter`를 지원하지 않는 환경에서는 아무 것도 하지 않는다 — 배경이
   또렷할 뿐 export가 실패하지는 않는다.
2. **바꿔 끼운 그림이 다 실린 뒤에 캡처해야 한다.** html2canvas는
   `img.currentSrc`를 읽고, 그 값은 새 주소를 다 읽어들인 뒤에야 바뀐다.
   `src`만 갈아 끼우고 곧바로 캡처하면 **예전 주소**가 그려진다(구운 이미지
   자체에는 흐림이 들어 있는데도 export만 또렷했다 — 실측). 그래서
   `bakePostBackgroundForCapture`는 async이고 `image.decode()`를 기다린다.

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

프리뷰 **바깥**의 `background` 버튼 하나가 작은 패널을 연다. 프리뷰 위에
상시로 뜨는 버튼은 없다.

| 버튼 | 하는 일 |
| --- | --- |
| `image` | 이미지 교체(업로드) — 새 사진이면 구도는 가운데에서 새로 시작 |
| `move` | 위치 조정 모드 — **이 모드에서만** 드래그가 배경을 움직인다 |
| `reset` | 프리셋 기본 이미지·위치로 복원 |

- 확대/흐림/오버레이의 상세 설정은 Quote Preset에만 있다.
- 조정 모드는 `Escape`로도, 패널을 닫아도 끝난다.
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

## 9. 남은 차이 / 확인하지 않은 것

- **편집창의 강조선은 글자를 밀지 않는다**(§5 마지막). 의도한 차이다.
- **배경 이미지는 프리셋/세션 단위**다. 글 하나에 영구히 박아두는 자리
  (`posts` 테이블의 칼럼)는 만들지 않았다 — 그 글의 `quote_preset_id`가
  가리키는 프리셋을 따른다.
- **프리셋 import/export**는 이 저장소에 없다(스킨 쪽에만 있다). 프리셋은
  DB의 `quote_presets.settings` JSON 하나이고, 이번 필드도 그 안에 그대로
  들어간다.
- 여러 장 배경 보정의 식별자는 **장 번호**다. 본문을 크게 고치면 같은 번호가
  다른 내용을 가리킬 수 있다.
