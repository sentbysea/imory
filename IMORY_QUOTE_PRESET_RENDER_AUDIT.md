# Quote Preset 렌더링 실측 (2026-09-12)

Quote Preset 미리보기 · 에디터 PREVIEW · export가 같은 결과를 그리는지 실측한 기록과,
canvas 설정을 Preview로 옮기고 `uniform`을 도입하기 위한 최소 변경안.

- **측정일** 2026-09-12
- **방법** 저장소의 실제 파일(`admin/quote/*`, `posts/preview/*`, `posts/export/*`, 실제 CSS 전부)을
  한 문서에 그대로 로드하고 Supabase만 stub한 하네스 + Playwright.
  Chromium(데스크톱 1280×900 · 모바일 390×844 @3x)과 WebKit.
  Pretendard는 CDN에서 실제로 로드된 뒤(`document.fonts.ready` 이후) 측정.
- **실기기 확인** 하지 않음. 아래 §4 (F)는 그래서 미확인으로 남는다.
- 이 조사 라운드에서 코드·DB 변경은 없었다.
- **2026-09-12 후속:** 아래 §6 단계 1과 "공통 렌더링"을 실제로 구현했다. §1~§4는
  **고치기 전** 실측 기록으로 그대로 두고, 무엇이 어떻게 바뀌었는지는 §10에 적는다.
  단계 2·3(canvas를 Preview로 · uniform)은 §11, 단계 4(UI 정리 · 한국어 라벨)와
  auto export 치수는 §12다.

관련 문서: [IMORY_POST_BODY_IMAGE_DESIGN.md](./IMORY_POST_BODY_IMAGE_DESIGN.md) (발췌의 본문 사진),
[CLAUDE.md](./CLAUDE.md) §3 (테스트 규약).

---

## 1. 현재 구현 — 저장 → 렌더링 → export

### 1.1 저장

canvas 관련 설정은 `quote_presets.settings` (jsonb) 하나에 통째로 들어간다.
수집은 [`collectQuoteSettings()`](./admin/quote/admin-quote-live-inputs.js),
되채우기는 [`applyQuoteSettings()`](./admin/quote/admin-quote-apply-preset.js),
저장은 [`admin-quote-preset-crud.js`](./admin/quote/admin-quote-preset-crud.js)의
`createQuotePreset` / `updateQuotePreset`.

| 항목 | 입력 | 저장 필드 | 수집 기본값 | 적용 기본값 |
| --- | --- | --- | --- | --- |
| 비율 | `data-ratio` 버튼 | `ratio` | — (전역 `currentQuoteRatio`) | `"1:1"` |
| 사용자 비율 | `quoteRatioWidth` / `Height` | `ratioWidth` · `ratioHeight` | 4 / 5 | 4 / 5 |
| 출력 너비 | `quoteWidth` | `exportWidth` | 1080 | 1080 |
| 배경 | `quoteBackground` | `background` | `#ffffff` | `#ffffff` |
| 안쪽 여백 | `quotePadding` | `padding` | **0** | **48** |
| 위아래 추가 | `quoteVerticalPadding` | `verticalPadding` | 0 | 0 |
| 좌우 추가 | `quoteHorizontalPadding` | `horizontalPadding` | 0 | 0 |
| 제목 아래 여백 | `quoteTitleSpacing` | `titleSpacing` | **0** | **28** |
| 출처 위 여백 | `quoteSourceSpacing` | `sourceSpacing` | **0** | **28** |

굵게 표시한 세 줄은 **수집·적용의 기본값이 서로 다르다**. 값이 없는 legacy 프리셋을 열면
48/28/28이 채워지지만, 그대로 저장하면 0이 된다.

### 1.2 세 화면이 값을 어디서 가져오는가

| 화면 | 값의 출처 | 비율 결정 | 파일 |
| --- | --- | --- | --- |
| Quote Preset 미리보기 | **폼 입력칸을 직접 읽음** (DB도 settings 객체도 안 거침) | `getQuoteRatio()` | `admin/quote/admin-quote-preview-update.js`, `admin-quote-ratio-parser.js` |
| 에디터 PREVIEW | 전역 `postStyleSettings` (DB의 **활성** 프리셋) + 세션 오버라이드 | `getPostPreviewRatio(settings)` | `posts/preview/posts-preview*.js` |
| export / copy | 같은 settings + **PREVIEW가 만든 그 DOM 그대로** | `getPostPreviewRatio(settings)` | `posts/export/posts-preview-export*.js` |
| 발행된 글 본문 | 같은 settings — **canvas 계열은 참조하지 않음** | — | `posts/style/posts-style-render.js` |

`postStyleSettings`는 `loadPostStylePreset()`(`posts/style/posts-style-preset.js`)이
`is_active = true` 프리셋을, 없으면 이름이 `"Vibe"`인 프리셋을 읽어 채운다.

### 1.3 우선순위

1. 프리셋 미리보기와 에디터 PREVIEW는 **서로를 참조하지 않는다.**
   왼쪽은 지금 폼에 떠 있는 값(저장 안 해도 즉시 반영), 오른쪽은 DB의 *활성* 프리셋.
   편집 중인 프리셋이 활성이 아니거나 아직 저장 전이면 두 화면은 원래 다른 것을 그린다.
2. PREVIEW 안에서는 **세션 오버라이드 > 프리셋**이다 —
   `previewRatioMode`, `previewVerticalAlign`, `previewBodyAlign`,
   `previewSourceBottomOffset`, `previewSourceSpacing`,
   `previewTitleVisible`, `previewSourceVisible`
   (`posts/preview/posts-preview-css-vars.js`).
   전부 `openEditorPreview()`가 열 때마다 `resetPreviewVisibilityOverrides()`로 초기화된다.
3. `exportWidth`는 **레이아웃에 전혀 영향이 없다.** 페이지는 항상 520px로 레이아웃되고,
   export는 `scale = exportWidth / 520`으로만 쓴다
   (`posts/export/posts-preview-export-capture.js`).

### 1.4 발행 본문 영향 (확인 완료)

`ratio` · `exportWidth` · `padding` · `verticalPadding` · `horizontalPadding` · `background`는
preview·export 밖에서 참조되는 곳이 **없다**(grep 확인).
→ **canvas 필드를 Preview로 옮겨도 발행된 글의 모양은 바뀌지 않는다.**

---

## 2. 실측표

조건: `4:5` · `exportWidth 1200` · 여백 `0 / 60 / 60` · `bodySize 16` · `lineHeight 1.8` ·
`paragraphSpacing 14` · `lineBreak keep` · 제목 off · 출처 on.

| 측정 | Quote Preset 미리보기 | 에디터 PREVIEW | 판정 |
| --- | --- | --- | --- |
| 레이아웃 너비 | 520px | 520px | 일치 |
| 레이아웃 높이(4:5) | 650px | 650px | 일치 |
| 테두리 | 없음 | `1px solid #eeeeee` (border-box) | **차이** |
| **본문 가용 너비** | **400px** | **398px** | **차이** |
| font-size | 16px | 16px | 일치 |
| 적용 글꼴 | `Pretendard, sans-serif` | `Pretendard, sans-serif` | 일치 |
| font-weight | 500 | 500 | 일치 |
| line-height | 28.8px | 28.8px | 일치 |
| letter-spacing | normal | normal | 일치 |
| word-break / overflow-wrap (keep) | keep-all / break-word | keep-all / break-word | 일치 |
| **text-size-adjust** | **auto** | **100%** | **차이** |
| **문단 사이 간격** | **42.5px** (28.8 + 14) | **57.6px 고정** | **차이** |
| 본문 시작 y | 60 | 61 | 테두리 1px |
| 출처 y | 719 (캔버스 밖, 잘림) | 576 (하단 여백 위 고정) | **차이** |
| 한 캔버스에 담기는 줄 | 19줄을 다 그리고 **650px에서 잘림** (scrollHeight 796) | **11줄** + 다음 장 8줄 | **차이** |
| 페이지 수 | 1 (분할 없음) | 2 | **차이** |
| 표시 배율 · 데스크톱(1280) | **0.450** | **0.762** | **차이** |
| 표시 배율 · 모바일(390) | **0.409** | **0.585** | **차이** |
| 표시 너비 | 234px / 212.8px | 396px / 304px | **차이** |
| export PNG | — | **1200 × 1499** | 1px 부족 |

### 2.1 줄바꿈

**데스크톱·모바일 모두, 두 화면의 줄바꿈 위치가 문자 단위로 완전히 일치했다.**

```
a0/e0  창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 창밖을
a1/e1  바라보고 있었다.
a2/e2  거리에는 늦은 오후의 햇빛이 비스듬히 내려앉았고, 지나가는
...
```

### 2.2 "작아 보이는 것" vs "기준이 다른 것"

- **작아 보이는 것** — 프리셋 미리보기의 대지(`.quote-preview-stage`)가 데스크톱에선 2단 레이아웃의
  오른쪽 칸(폭 234px), 모바일에선 `height: calc(32vh + 22px)`로 작다. 에디터 PREVIEW의 대지는
  데스크톱 전체 폭, 모바일 `90dvh`다. 그래서 같은 520px 캔버스가 0.45배 vs 0.76배로 그려진다.
  **글자 크기·줄바꿈 자체는 같다.**
- **기준이 다른 것** — 본문 폭 400 vs 398, 문단 간격 14 vs 29 고정, 출처 자리 확보 유무,
  페이지 분할 유무.

### 2.3 문단 간격 — 설정이 먹지 않는다

`paragraphSpacing`을 바꿔가며 문단 첫 줄의 y를 쟀다.

| paragraphSpacing | Quote Preset 미리보기 | 에디터 PREVIEW |
| --- | --- | --- |
| 0 | 28.8 | **57.6** |
| 7 | 35.8 | **57.6** |
| 14 | 42.8 | **57.6** |
| 28 | 56.8 | **57.6** |
| 40 | 68.8 | **57.6** |

마크업은 의도대로 만들어진다. 공통 렌더러 · 프리뷰 페이지 · 발행 화면 세 경로의 DOM이 모두 같다:

```html
첫 번째 문단입니다.<br><br style="display: block; height: 14px;">두 번째 문단입니다.
```

그런데 `<br>`은 레이아웃 엔진이 줄바꿈 전용 인라인 객체로 다루기 때문에 `display`·`height`가
적용되지 않는다. **Chromium과 WebKit 둘 다 동일** — 데스크톱/모바일 차이가 아니라 렌더 경로의 차이다.
`renderStyledPostContentInto`(`posts/style/posts-style-render.js`)의
"연속 `<br>` 두 개에 `display:block; height:Npx`" 보정은 DOM에는 정확히 들어가지만 무효다.
이 경로는 발행된 글 본문과 같은 함수이므로 **발행 화면의 문단 간격도 같은 이유로 설정을 못 따른다.**

---

## 3. auto pagination — 현재 동작 (실측)

같은 본문에 사진 1장과 수동 PAGE break 하나를 넣고 돌린 결과.

| | 고정 비율 4:5 | AUTO |
| --- | --- | --- |
| 페이지 수 | **4** | **2** |
| 페이지 높이 | 650 / 650 / 650 / 650 | **980 / 480** |
| 페이지별 줄 수 | 6 / 3 / 2 / 8 | 11 / 8 |
| 사진 | 2번 장에 통째로 (398×299) | 1번 장에 그대로 |
| 출처 y | 576 (네 장 모두 고정) | 906 / 406 (본문 뒤 흐름) |
| content-group | 있음 | 없음 |

- **AUTO는 높이를 무제한으로 늘린다** (`page.style.height = "auto"`, `posts/preview/posts-preview.js`).
  넘칠 일이 없으므로 길이 기준 분할이 아예 일어나지 않는다.
  **AUTO에서 장을 나누는 유일한 기준은 수동 PAGE break다.**
- 고정 비율의 분할 기준은 글자 수나 문단 수가 아니라 **실제 넘침**이다.
  `previewCurrentPageIsOverflowing()`이 `page`와 `contentGroup` 양쪽의
  `scrollHeight > clientHeight`를 본다. 텍스트는 `/\S+\s*|\s+/` 단위(단어)로 하나씩 넣어보고
  넘치면 되돌려 새 장으로 옮긴다.
- **PAGE break** — `isEditorPageBreakNode` → 남은 자리와 무관하게 `startNewPage()`, `openChain = []`.
  첫 장이 비어 있으면 빈 장을 만들지 않는다. AUTO에서도 동작한다.
- **사진은 쪼개지 않는다.** ① 본문 폭으로 넣어보고 ② 넘치면 통째로 다음 장으로
  ③ 그래도 안 들어가면 이분 탐색(`shrinkPreviewImageToFit`, 하한 24px)으로 폭을 줄인다.
  AUTO에서는 ②③이 발생하지 않는다.
- **사진은 분할 전에 정지 raster로 굳혀 둔다**(`posts/preview/posts-preview-images.js`).
  `updateEditorPreview()`가 `document.fonts.ready` → `preparePostBodyImagesForPreview(html)`를
  먼저 기다린 뒤 `renderEditorPreviewPages()`를 동기로 돌리므로, 분할 계산 도중 높이가 바뀔 자리가 없다.
  렌더 세대(`editorPreviewRenderVersion`)로 늦은 응답이 최신 화면을 덮지 못하게 한다.
- **PREVIEW / export / copy가 공유하는 것은 DOM 자체다.**
  `ensurePreviewPagesRendered()`는 이미 그려진 `.post-editor-preview-page`가 있으면 다시 그리지 않고
  그대로 쓰고, `captureVisiblePageAsBlob(page, 520, ratio)`가 그 엘리먼트를 캡처한다.
  계산(`getPostPreviewRatio`, `resolveExportPageHeight`)도 공유한다.
  캡처 직전의 임시 보정(CSS 변수 인라인화, 하이라이트 span 글자 단위 재감싸기,
  조상 transform·overflow 제거, clone 폰트 대기)만 export 전용이다.
- **`uniform`은 코드·마크업 어디에도 없다.** 현재 비율 옵션은 `4:5 / 4:6 / 1:1 / 4:3 / auto / custom`.

---

## 4. 확인된 원인 / 아직 확인하지 못한 것

> **처리 결과는 §10.7.** (F)를 뺀 나머지는 2026-09-12에 해소됐다.

### 확인된 것

- **(A) 본문 폭 2px 차이** — `.post-editor-preview-page`의 `border: 1px`(border-box). 실측 400 vs 398.
- **(B) 문단 간격** — §2.3. 설정값 5개 전부에서 재현, Chromium·WebKit 동일.
- **(C) 출처 자리 + 페이지 분할** — 프리셋 미리보기는 출처 자리를 비워두지 않고 넘치면 잘라낸다
  (`overflow:hidden` + 안내 문구). 에디터는 `.post-editor-preview-content-group`
  (`flex:1 1 auto; overflow:hidden`)으로 출처 자리를 확보하고 넘치면 장을 넘긴다.
  같은 조건에서 19줄 vs 11줄.
- **(D) 표시 배율** — 0.45 vs 0.762(데스크톱), 0.409 vs 0.585(모바일). 대지 크기 차이.
- **(E) legacy fallback 기본값 불일치** — `bodyColor`(#333333 vs #555555),
  `bodyWeight`(500 vs 400), `lineHeight`(1.8 vs 1.9), `padding`(수집 0 / 적용 48).
  키가 빠진 옛 프리셋에서만 갈라진다.
- **(G) `lineBreak: "char"`** — 프리셋은 `overflow-wrap: anywhere`, 에디터·발행은 `break-word`
  (`posts-style-render.js` 주석에 의도된 것이라고 적혀 있음). keep·word는 동일.
- **(H) export 높이 1px 부족** — 1200×1499(기대 1500). `1200/520` 반올림.

### 확인하지 못한 것

- **(F) `text-size-adjust`** — 프리셋 캔버스는 `auto`, 에디터 페이지는 `100%`(CSS 선언 유무 차이).
  데스크톱 Chromium 에뮬레이션에서는 차이가 나지 않는다.
  **iOS Safari 실기기에서 자동 텍스트 확대가 프리셋 미리보기에만 걸리는지는 확인하지 못했다.**
  실기기 확인이 필요하다.
- 사용자가 보낸 화면의 실제 DB 프리셋 값 — 확인하지 않음.
  (실측 기준으로는 두 화면이 서로 다른 settings를 보고 있었다는 뜻이지만, 추론이다.)
- 실기기(iPhone) 검증 전반 — 하지 않음.

---

## 5. 앞으로 지켜야 할 원칙

- **Quote Preset은 서식, Preview는 출력.** 글꼴·색·행간·제목·출처·배경·여백은 프리셋이,
  실제 출력 비율과 출력 너비는 Preview가 정한다.
- **기존 canvas 필드는 지우지 않는다.** UI에서 숨기더라도 `collectQuoteSettings`는 읽어 온 값을
  그대로 되쓴다 — 기존 프리셋 JSON과 `getPostPreviewRatio`의 프리셋 fallback 경로가 그대로 살아야 한다.
- **텍스트 제한은 입력 제한이 아니라 분할 보조 기준으로만.** 사진이 섞이면 글자 수로 나눌 수 없으므로
  "실제 넘침" 기준을 유지한다.
- **uniform은 auto와 같은 분할 결과를 써야 한다.** 높이를 통일한 뒤 재분할하지 않는다.
- **높이 측정은 폰트·사진 로딩이 끝난 뒤에.** 이미 `updateEditorPreview()`가 보장한다.
- **PREVIEW · export · copy는 같은 DOM을 쓴다.** 페이지 구성이 갈라질 자리를 새로 만들지 않는다.

---

## 6. 최소 변경안

지금 두 미리보기는 **코드를 전혀 공유하지 않는다**(프리셋은 폼→DOM 직접, 에디터는 settings→공용 렌더러).
그래서 A·B·E·G 같은 차이가 계속 생긴다.
근본 해법은 프리셋 미리보기가 `collectQuoteSettings()`의 결과를 그대로
`renderStyledPostContentInto` + `createEditorPreviewPage`에 넘기고,
프리셋 전용 테스트 문법(`*지문*` `"대사"` `==형광펜==` `^강조^`)만 얇은 어댑터로 변환하는 것이다.
아래는 그보다 작은 단계별 변경이다.

### 단계 1 — 기준 맞추기 (DB·JSON 변경 없음)

| # | 변경 | 위치 | 기존 출력 영향 |
| --- | --- | --- | --- |
| 1 | 문단 간격을 `<br>`이 아니라 간격 전용 블록으로 | `posts/style/posts-style-render.js` | **있음.** 29px 고정이던 간격이 설정값(기본 14)대로 줄어 한 장에 더 들어간다. 기존 글의 페이지 나눔과 발행 본문이 함께 바뀐다 |
| 2 | 프리셋 캔버스에 `border: 1px solid transparent` | `admin/admin-quote.css` | 본문 폭 400 → 398. 경계값에서만 줄바꿈이 바뀜 |
| 3 | 프리셋 캔버스에 `-webkit-text-size-adjust: 100%` | `admin/admin-quote.css` | 데스크톱 0. iOS에서 (F) 해소 여부 확인용 |
| 4 | 프리셋 미리보기에도 출처 자리 확보(content-group 방식) | `admin/quote/admin-quote-preview-update.js` | 프리셋 미리보기에 보이는 본문 양이 줄고 에디터 1페이지와 같아짐 |
| 5 | fallback 기본값 통일 | `collectQuoteSettings` / `applyQuoteSettings` / `applyPostBodyStyles` | 키가 빠진 legacy 프리셋만 영향 |

**1번이 기존 출력이 실제로 바뀌는 유일한 항목이다.**
어느 쪽을 "맞는 것"으로 삼을지가 결정 사항 — 설정값을 따르게 할지(프리셋 미리보기 기준),
지금 발행 화면이 보여주던 29px을 유지할지.

> **결정: 설정값(paragraphSpacing)을 따른다.** 단계 1은 2026-09-12에 전부 적용했다 — §10.

### 단계 2 — canvas를 Preview로

- `ratio` · `ratioWidth` · `ratioHeight` · `exportWidth`를 Quote Preset UI에서 **숨기기만** 한다.
  필드는 그대로 두고 `collectQuoteSettings`가 읽어 온 값을 되쓴다.
- `background` · `padding` · `verticalPadding` · `horizontalPadding`은 **서식이므로 프리셋에 남긴다.**
- `previewRatioMode`가 이미 프리셋보다 우선이므로 `uniform`을 한 값 더 추가한다.
  `getPostPreviewRatio`의 반환 계약(`{ width, height, auto }`)에 `{ uniform: true }`를 더하는 형태.

### 단계 3 — uniform (재분할하지 않는 구현)

1. `renderEditorPreviewPages`를 **auto 모드로 한 번** 돌린다(분할은 PAGE break만).
2. 각 페이지의 `offsetHeight`를 잰다 — 실측대로 페이지마다 다르다(980 / 480).
3. 최대값을 모든 페이지의 `style.height`에만 적용한다.
   **이미 만들어진 DOM을 그대로 두므로 분할 결과가 절대 바뀌지 않는다.**
4. 중앙 정렬은 auto에서 안 만들던 `contentGroup`을 uniform에서는 만들고
   `justify-content: center`. 제목·출처는 그룹 밖이라 자동으로 제외된다.
5. export는 `resolveExportPageHeight`가 auto일 때 `offsetHeight`를 쓰므로 **손댈 필요가 없다.**
   단 `captureVisiblePageAsBlob`의 `ratio.auto ? {} : { height }` 분기는
   uniform도 auto와 같이 취급해야 한다(클론 레이아웃 초과분 잘림 방지 주석 참고).
6. `custom`과 기존 사용자 선택값(`previewCustomRatioWidth/Height`)은 그대로.

### 단계 4 — UI 정리

| 변경 | 마크업 | CSS | JS / 상태 |
| --- | --- | --- | --- |
| 부유 PREVIEW 버튼 → 일반 흐름 고스트 버튼 | `posts/posts.html` `#postEditorPreviewToggle` | `posts-preview-export.css`(데스크톱 `display:none`), `posts-mobile.css`(`position:sticky; bottom:10px; border-radius:999px`) | 없음 |
| 같은 버튼으로 여닫기 | — | — | **이미 그렇다**(`posts/editor/posts-toolbar-toggles.js`). 단 데스크톱은 `is-open`을 안 쓰므로(`syncEditorPreviewMode`가 제거) 데스크톱 접기를 원하면 그 분기를 손봐야 한다 |
| 패널 왼쪽 위 중복 PREVIEW 문구 제거 | `.post-editor-preview-label` | 같은 이름 | 없음. 헤더에 남는 건 닫기 버튼 하나 |
| ratio 열기 버튼 제거, 선택 상시 표시 | `#postEditorPreviewRatioTrigger` | `.post-editor-preview-ratio-trigger`, `.post-editor-preview-ratio-controls[hidden]` | `previewRatioRowExpanded` 상태 + `posts-toolbar-toggles.js` 리스너 + `syncPreviewRatioControls()` 세 곳 |
| custom일 때만 상세 표시 | `#postEditorPreviewRatioCustomInputs` | `[hidden]` | **이미 그렇다**(`isCustom`) |
| 접었다 펼쳐도 옵션 유지 | — | — | **여기가 걸린다.** `openEditorPreview()`가 매번 `resetPreviewVisibilityOverrides()`를 부른다. 초기화를 **에디터 진입 시 1회**로 옮겨야 한다 |
| 모바일 확대 유지 | — | `touch-action` | `posts/preview/posts-preview-mobile.js` 핀치/팬. `resetMobilePreviewZoomPan()` 호출 지점을 건드리지 말 것 |
| gallery 발췌 UI 숨김 유지 | — | — | `syncEditorExcerptControls()`가 `postEditorPreviewToggle.hidden`을 제어. 버튼을 옮겨도 유지되는지 확인 |

부수 의존성: 모바일 export는 프리뷰 섹션이 닫혀 있으면
`forceOpenSectionIfNeeded()`(`posts/export/posts-preview-export-section.js`)가 `is-open`을 임시로 붙여
레이아웃을 만들어 쓴다. `is-open`의 의미나 `display:none` 구조를 바꾸면 이 경로도 같이 봐야 한다.

---

## 7. 필요한 검증

> 단계 1의 실제 검증 결과는 §10.6. 전용 e2e는
> `admin/quote/quote-render-parity-e2e-test.mjs`(포트 8950)다.

| 단계 | 검증 |
| --- | --- |
| 1 | `node skin/skin-gallery-e2e-test.mjs --only=excerpt` (문단 간격을 고치면 기대값이 바뀐다) + 발행된 글 한 편 눈으로 확인 |
| 2 | 기존 프리셋 JSON 왕복(저장 → 재로드 → 값 보존) · `--only=excerpt` · `node admin/admin-settings-e2e-test.mjs` |
| 3 | **새 검증 필요** — auto와 분할 결과가 완전히 동일한지(페이지 수 · 각 장의 줄 수 · 사진 위치), 최대 높이 적용 후 재분할이 없는지, 중앙 정렬이 제목·출처를 건드리지 않는지, export PNG 높이가 uniform 높이와 같은지 |
| 4 | 모바일 핀치 확대 유지 · gallery에서 버튼 숨김 유지 · 접었다 펼쳐도 옵션 유지 · 모바일 export 강제 오픈 경로 |

---

## 8. 남은 차이

> **이 목록은 고치기 전 기준이다. 지금 남은 것은 §10.8.**

- (F) `text-size-adjust`의 iOS 실기기 영향 — 미확인.
- 두 미리보기가 여전히 코드를 공유하지 않는다. 단계 1~4를 다 해도 서식 필드를 새로 추가할 때는
  두 곳을 고쳐야 한다. 공용 렌더러로의 통합은 별도 라운드.
- `lineBreak: "char"`의 `anywhere` vs `break-word` 차이는 의도된 것으로 남아 있다.
- export PNG가 기대 높이보다 1px 부족한 반올림.

---

## 9. 한국어 라벨 후보

탭 5개(CONTENT / CANVAS / TITLE·SOURCE / BODY / PRESET)는 영어 유지.
저장 키와 내부 `value=`는 번역하지 않는다.

| 구역 | 현재 | 한국어 후보 |
| --- | --- | --- |
| CANVAS | RATIO | 비율 |
| | AUTO / CUSTOM | 자동 / 직접 입력 |
| | RATIO WIDTH / HEIGHT | 가로 비 / 세로 비 |
| | EXPORT WIDTH | 내보내기 너비 |
| | BACKGROUND | 배경색 |
| | PADDING | 안쪽 여백 |
| | VERTICAL / HORIZONTAL EXTRA | 위아래 / 좌우 추가 여백 |
| BODY | FONT | 글꼴 |
| | COLOR | 글자색 |
| | HIGHLIGHT / POINT COLOR | 형광펜 / 강조색 |
| | FONT SIZE | 글자 크기 |
| | WEIGHT | 굵기 |
| | light / regular / medium / semibold / bold | 가늘게 / 보통 / 조금 굵게 / 굵게 / 아주 굵게 |
| | LINE HEIGHT | 줄 간격 |
| | LETTER SPACING | 자간 |
| | PARAGRAPH | 문단 사이 간격 |
| | HORIZONTAL | 가로 정렬 — 왼쪽 / 가운데 / 오른쪽 / 양쪽 |
| | VERTICAL | 세로 정렬 — 위 / 가운데 / 아래 |
| | LINE BREAK | 줄바꿈 방식 — 단어 지키기 / 단어 단위 / 글자 단위 |
| | FIRST INDENT | 첫 줄 들여쓰기 |
| ACTION / DIALOGUE | ACTION / DIALOGUE / ITALIC | 지문 / 대사 / 기울임 |
| TITLE · SOURCE | DISPLAY / ALIGN | 표시 / 정렬 |
| | BOTTOM SPACE | 아래 여백 (제목) |
| | SOURCE TEXT | 출처 문구 |
| | BOTTOM MARGIN | 바닥에서 띄우기 |
| | TOP SPACE | 위 여백 (출처) |
| PRESET | PRESET NAME / SAVED PRESETS | 프리셋 이름 / 저장된 프리셋 |
| | new / save / delete | 새로 만들기 / 덮어쓰기 / 삭제 |
| Preview 패널 | uniform / auto / custom | 같은 높이 / 자동 높이 / 직접 지정 |
| | align / body / title / source / margin / ratio | 세로 정렬 / 본문 정렬 / 제목 / 출처 / 바닥 여백 / 비율 |

---

## 10. 1단계 적용 — 렌더링 기준 통일 (2026-09-12)

canvas 설정 이동 · `uniform` · 버튼 디자인 · 한국어 번역은 **이번 범위가 아니다**.

### 10.1 무엇을 공통으로 만들었는가

두 미리보기가 코드를 전혀 공유하지 않던 것(§6 머리말)이 이번 라운드의 핵심이었다.
지금은 **설정 · 콘텐츠 · 출력 조건을 인자로만 받는** 공용 계산 세 덩이를 admin과
index 양쪽 문서가 함께 로드한다.

| 새 파일 | 하는 일 | 읽는 문서 |
| --- | --- | --- |
| `posts/style/posts-body-layout.js` | settings 정규화(`normalizePostStyleSettings`) · 본문 서식(`applyPostBodyStyles`) · 줄바꿈 모드 · **문단 간격**(`applyPostParagraphSpacing`) | index · admin · studio |
| `posts/preview/posts-page-layout.js` | 페이지 한 장(`createPostPageCanvas`) · 페이지 나누기(`paginatePostPages`) · 본문 가용 너비 · **출력 픽셀 크기**(`resolveExportPixelWidth/Height`) | index · admin |
| `posts/posts-page-canvas.css` | `.post-editor-preview-page` / -title / -content / 문단 간격 블록의 모양 | index · admin |

전역 상태를 읽는 자리는 **호출부에만** 남겼다.

- 에디터 — `resolveEditorPreviewView()`(`posts/preview/posts-preview.js`)가
  `postStyleSettings` + 세션 오버라이드 + 제목 입력칸을 읽어 `view`를 만든다.
- Quote Preset — `updateQuotePreview()`(`admin/quote/admin-quote-preview-update.js`)가
  `collectQuoteSettings()`(= 저장될 바로 그 객체)와 폼의 비율/제목을 읽어 `view`를 만든다.
  **에디터의 전역 상태는 읽지도 쓰지도 않는다** — 관리 패널에는 그 전역이 존재하지도 않는다.

프리셋 전용 샘플 문법은 얇은 입력 어댑터(`buildQuoteSampleSource()`) 하나로만 남았다.
`==형광펜==` → `.post-inline-highlight`, `^강조색^` → `.post-inline-color`,
줄바꿈 → `<br>`. `*지문*`과 `"대사"`는 **실제 본문과 같은 표기**라 바꾸지 않고 공용
`applyActionDialogueStyles()`에 그대로 맡긴다. 그 뒤의 서식 · 본문 폭 · 제목/출처 자리 ·
페이지 분할은 전부 공유한다.

관리 패널에서 없어진 코드: `renderStyledQuoteText` · `applySpecialQuoteStyles` ·
`renderQuoteBody` · `applyLineBreakMode` · `applyVerticalAlignment` ·
`applyCanvasPadding`, 그리고 `.quote-preview-title/-text/-source` static 마크업과 CSS.

### 10.2 문단 간격 — (B) 해소

`<br>`에 `display:block; height`를 주던 방식(§2.3)을 버리고, **문단 경계(연속 `<br>` 두 개)를
높이를 가진 빈 블록 하나**(`.post-body-paragraph-gap`)로 바꾼다. 렌더링 단계에서만
일어나므로 DB의 본문 HTML은 그대로다(일괄 변환 없음).

네 가지를 구분한다.

| 입력 | 결과 |
| --- | --- |
| `<br>` 한 개 | 그대로 — 일반 줄바꿈 |
| `<br>` 두 개 | 간격 블록 하나 = `paragraphSpacing` |
| `<br>` 세 개 이상 | 간격 블록 + 남은 `<br>` (의도적인 빈 줄이 그 수만큼 남는다) |
| `.post-editor-page-break` | 건드리지 않는다 — 그대로 장을 나눈다 |

모든 깊이를 훑되 `<br>`만 바꾸므로 굵게/기울임/형광펜/강조색 span과 사진 앞뒤 문단이
그대로 보존된다.

**실측(에디터 PREVIEW · `bodySize 16` · `lineHeight 1.8` → 줄 높이 28.8px)**

| paragraphSpacing | 고치기 전 | 고친 뒤 | 기대(줄 높이 + 설정) |
| --- | --- | --- | --- |
| 0 | 57.6 | **28.8** | 28.8 |
| 7 | 57.6 | **35.8** | 35.8 |
| 14 | 57.6 | **42.8** | 42.8 |
| 28 | 57.6 | **56.8** | 56.8 |
| 40 | 57.6 | **68.8** | 68.8 |

같은 규칙이 **발행된 글 본문**에도 적용된다(같은 `renderStyledPostContentInto`).
두 문단짜리 본문 높이: 간격 0 → 58px, 14 → 72px, 40 → 98px.

**기존 출력에 미치는 영향**

- 문단 사이가 "줄 높이 두 개"에서 "줄 높이 + paragraphSpacing"으로 바뀐다.
  기본 프리셋(14)에서는 57.6 → 42.8px, 즉 **문단마다 약 15px씩 줄어든다.**
- 그만큼 한 장에 더 들어간다. 실측(문단 8개 샘플 · 4:5 · 여백 0/60/60 ·
  bodySize 16 · lineHeight 1.8): **첫 장에 12줄 → 14줄**, 이 샘플에서는 페이지 수가
  2장으로 같았다. 경계에 걸린 글에서는 **페이지 수가 줄어들 수 있다** — 발췌를
  이미 나눠 둔 글은 장 구성이 달라질 수 있다.
  (이 "고치기 전" 값은 추정이 아니라, 지금 코드에 `paragraphSpacing = 줄 높이`를 넣어
  옛 간격(줄 높이 × 2)을 그대로 재현해서 잰 값이다 —
  `--only=paragraph`의 `before/after` 절.)
- AUTO는 페이지 수가 그대로이고 높이만 줄어든다.
- 발행된 글의 본문도 같이 촘촘해진다.
- `paragraphSpacing`이 **0**인 프리셋에서는 문단 사이 빈 줄이 아예 사라지고 다음 문단이
  바로 이어진다(28.8px = 줄 높이 하나). 예전에는 0이어도 빈 줄이 한 줄 보였다.

### 10.3 너비 · 줄바꿈 · 기본값

- **(A) 본문 폭 400 vs 398 해소.** 페이지의 장식 테두리를 `border` → `outline` +
  `outline-offset: -1px`로 바꿨다. outline은 레이아웃에 참여하지 않으므로 본문 가용 폭이
  **양쪽 다 `520 - 여백*2`**다. 화면에 보이는 자리는 예전 테두리와 같다.
  `postPreviewPageBodyWidth()`의 "테두리 2px 빼기"도 함께 없앴다.
- **(G) `lineBreak: "char"` 해소.** 프리셋만 쓰던 `overflow-wrap: anywhere`를 버리고
  세 모드 모두 `break-word`로 통일했다. `word-break: break-all`이 이미 글자 단위로 끊으므로
  `anywhere`가 더 해주는 일이 없고, 구형 모바일 Safari 지원도 불안정하다.
  세 모드의 의도는 `keep`=어절 지키기 / `word`=브라우저 기본(UAX#14) / `char`=글자 단위
  강제로 확인했고, 이 규칙을 양쪽에 같이 적용한다.
- **명시적 0과 누락의 구분.** `Number(x) || fallback`을 전부 `postStyleNumber(x, fallback)`로
  바꿨다 — 빈 값/undefined/NaN만 기본값이고 `0`은 0이다.
- **(E) 기본값 불일치 해소.** 기본값을 `normalizePostStyleSettings()` **한 곳**으로 모았고,
  그 값은 **지금 발행 본문과 에디터 PREVIEW가 실제로 그리던 값**을 그대로 옮긴 것이다
  (`bodyColor #555555` · `bodyWeight 400` · `lineHeight 1.9` · `padding 0` ·
  `titleSpacing 0` · `sourceSpacing 0` · `paragraphSpacing 0`).
  `applyQuoteSettings()`도 이 값으로 폼을 채우므로 **폼에 보이는 값 = 미리보기 = 발행 본문**이다.
  → 키가 빠진 옛 프리셋을 열면 예전과 다른 숫자가 보일 수 있다. 그 숫자가 실제로 그려지던
  값이다. (HTML `value=` 속성의 "새 프리셋 기본값" 48/28/14 등은 건드리지 않았다.)
- **왕복 확인.** 폼에 채운 뒤 다시 수집하면 값이 바뀌지 않는다(§10.6 `--only=legacy`).
  선언된 fallback이 다르다는 이유만으로 값이 바뀐다고 단정하지 않았고, 실제로 재서 확인했다.
- **알 수 없는 필드 보존.** `collectQuoteSettings()`가 마지막으로 불러온 프리셋의 settings
  (`loadedQuotePresetSettings`)를 밑바탕에 깔고 그 위에 폼 값을 덮어쓴다. 이 화면에 입력칸이
  없는 필드와 canvas 저장값이 저장 한 번으로 사라지지 않는다.

### 10.4 모바일과 export

- **(F) `text-size-adjust`** — 공용 `.post-editor-preview-page`에 `100%`를 두어 두 화면이
  같은 정책을 쓴다. `100%`는 브라우저의 **자동** 확대만 끄고 사용자의 핀치 확대는 막지 않는다
  (`none`과 다르다). **iOS 실기기 확인은 여전히 하지 않았다.**
- **표시 배율** — 레이아웃(520px)과 표시 배율(transform)의 분리는 그대로 두고, 모바일
  프리셋 대지 높이만 `calc(32vh + 22px)` → `calc(48vh + 22px)`로 올렸다. 축소는 여전히
  contain(가로·세로 둘 다 고려)이라 비율을 왜곡하거나 세로를 잘라내지 않는다.
  실측(390×844, 4:5): 프리셋 미리보기 212.8px → **320.0px**, 에디터 PREVIEW 304.0px.
- **(H) export 1px 해소** — html2canvas가 캔버스 크기를 `floor(길이 × scale)`로 잡아
  `650 × (1200/520) = 1499.9999999999998` → 1499가 되던 문제. 기대 픽셀을
  `resolveExportPixelWidth/Height`(반올림)로 먼저 정하고, 캡처 결과가 다르면 그 크기로 한 번
  옮겨 그린다(`normalizeExportCanvasSize`). AUTO는 클론이 더 필요로 하는 높이를 잘라내면
  안 되므로 폭만 맞추고 높이는 같은 배율로 따라가게 둔다.
  실측: `4:5 @1200` → **1200×1500**, `1:1 @1080` → 1080×1080, `4:5 @1080` → 1080×1350,
  `4:6 @1000` → 1000×1500.
- 사진 준비 · 정지 raster · 렌더 세대(`editorPreviewRenderVersion`) ·
  PREVIEW/export/copy가 같은 DOM을 쓰는 구조는 **그대로 유지**했다
  (`skin-gallery-e2e-test.mjs --only=excerpt` 62/62 통과).

### 10.5 auto pagination — 이번 라운드에서 바꾸지 않은 것

`AUTO`는 페이지 높이가 콘텐츠 높이라 넘칠 자리가 없고, **장을 나누는 유일한 기준은 수동
PAGE break다**(§3). 이번에 새 분할 제한을 넣지 않았다. 나중에 분할 보조 기준을 더하더라도
`auto`와 `uniform`은 같은 기준을 써야 한다.

> **2026-09-12 §12.2 변경** — 분할 기준은 그대로지만, 나누기가 **끝난 뒤** auto도
> uniform과 같은 방법으로 페이지 높이를 정수로 확정한다(`applyDefinitePostPageHeights`).
> 분할 결과(페이지 수·각 장의 내용)는 바뀌지 않는다.

### 10.6 검증

`node admin/quote/quote-render-parity-e2e-test.mjs` — 90 PASS / 0 FAIL (chromium).
`--only=paragraph`은 WebKit에서도 22/22 통과.
저장소의 실제 `admin/index.html`·`index.html`·실제 CSS/JS를 그대로 띄우고 Supabase만 mock한다.

| 절 | 확인 |
| --- | --- |
| `paragraph` | 0/7/14/28/40 · 일반 줄바꿈/문단 구분/연속 빈 줄/PAGE break · 인라인 서식 · 사진 앞뒤 문단 |
| `parity` | Desktop/Mobile × 고정 비율/AUTO에서 본문 폭 · **줄바꿈 위치(글자 단위)** · 문단 간격 · 본문 시작 y · 출처 y · 페이지 수 · 제목 자리 · 넘치는 샘플의 페이지 이동 · 표시 배율(contain) |
| `legacy` | 설정이 빠진 프리셋 열기 → 저장 → 다시 열기, 명시적 0 · 알 수 없는 필드 · canvas 값 보존 |
| `export` | 고정 비율 4종의 실제 PNG 픽셀 크기 |
| `published` | 발행 본문의 문단 간격과 전체 높이 |

실측 일치(Desktop 1280 · 4:5 · 여백 0/60/60 · bodySize 16 · lineHeight 1.8 ·
paragraphSpacing 14 · 제목 off · 출처 on):

| 측정 | 고치기 전 (프리셋 / 에디터) | 고친 뒤 (프리셋 / 에디터) |
| --- | --- | --- |
| 본문 가용 너비 | 400 / 398 | **400 / 400** |
| 페이지 높이 | 650 / 650 | 650 / 650 |
| 문단 간격 | 42.5 / 57.6 고정 | **14 / 14**(블록 높이) |
| 본문 시작 y | 60 / 61 | **60 / 60** |
| 출처 y | 719(잘림) / 576 | **575 / 575** |
| 페이지 수 | 1(잘라냄) / 2 | **같음**(넘치면 양쪽 다 장을 나눔) |
| 줄바꿈 위치 | 일치 | 일치(글자 단위) |

함께 돌린 회귀:

| 스위트 | 결과 |
| --- | --- |
| `skin/skin-gallery-e2e-test.mjs --only=excerpt` | 62 PASS / 0 FAIL |
| `skin/skin-gallery-e2e-test.mjs --only=body` | 88 PASS / 0 FAIL |
| `skin/skin-write-manage-e2e-test.mjs` | 155 passed / 0 failed |
| `skin/skin-banner-page-e2e-test.mjs` | 226 passed / 0 failed |
| `skin/skin-folder-page-e2e-test.mjs` | 61 passed / 0 failed |
| `admin/admin-settings-e2e-test.mjs` | 38 PASS / 0 FAIL |
| `studio/studio-inspector-e2e-test.mjs` | 34 PASS / 0 FAIL |

**mock 테스트만 했다** — 실제 DB · 배포 · 실기기 확인은 하지 않았다.

### 10.7 §4 · §6 항목 처리

| 항목 | 상태 |
| --- | --- |
| (A) 본문 폭 2px | 해소 — outline |
| (B) 문단 간격 | 해소 — 간격 블록 |
| (C) 출처 자리 + 페이지 분할 | 해소 — 프리셋 미리보기도 같은 `paginatePostPages`를 쓴다 |
| (D) 표시 배율 | 완화 — 모바일 대지 48vh, 축소는 contain 유지 |
| (E) fallback 기본값 | 해소 — `normalizePostStyleSettings` 하나 |
| (F) `text-size-adjust` | 정책은 통일, **iOS 실기기 미확인** |
| (G) `lineBreak: "char"` | 통일 — `break-word` |
| (H) export 1px | 해소 — 출력 픽셀 반올림 |
| §6 단계 1 (1~5) | 전부 적용 |
| §6 단계 2~4 | **하지 않음**(canvas 이동 · uniform · UI 정리 · 번역) |

### 10.8 남은 제한

- `uniform`은 아직 없다. 추가할 때 `auto`와 **같은 분할 결과**를 써야 한다(§5).
- canvas 설정(`ratio`/`ratioWidth`/`ratioHeight`/`exportWidth`)은 아직 Quote Preset UI에
  남아 있다. 필드 자체는 `collectQuoteSettings`가 보존하므로 단계 2를 그대로 진행할 수 있다.
- (F) iOS 실기기 확인 · 실제 DB · 배포 확인은 하지 않았다.
- 관리 패널(`admin/index.html`)은 여전히 `Date.now()` 캐시 버스터와 고정 URL `<link>`를 쓴다.
  새 CSS/JS도 그 파일의 기존 방식을 따랐다 — `APP_BUILD_VERSION` 적용은 별도 라운드다.
- 문단 간격 블록은 인라인 서식 span **안에서** 문단이 나뉘면 block-in-inline이 된다.
  Chromium/WebKit과 html2canvas 캡처에서 문제없는 것을 확인했지만, 드문 구조라 눈으로도
  한 번 볼 만하다.

---

## 11. 2단계 적용 — canvas를 Preview로 · uniform (2026-09-12)

§6 단계 2·3과 단계 4의 일부(세 옵션 상시 노출 · 상태 보존)를 적용했다.
**고스트 버튼 디자인과 한국어 라벨(§9)은 이번 범위가 아니다.**

### 11.1 역할 분리 — 어디에 무엇이 있는가

| | 담당 | 코드 |
| --- | --- | --- |
| Quote Preset | **본문 서식** — 배경 · 여백 · 글꼴 · 문단 간격 · 제목/출처 서식 | `admin/quote/*` + 공용 `normalizePostStyleSettings` |
| Preview | **출력 조건** — uniform / auto / custom · 출력 너비 | `posts/preview/posts-preview-settings.js` |

- `ratio` · `ratioWidth` · `ratioHeight` · `exportWidth` 입력 UI는 Quote Preset 화면에서
  **감췄다**(`#quoteCanvasOutputCompat[hidden]`). 필드는 폼에 그대로 남아 있어
  `applyQuoteSettings`가 저장값을 되채우고 `collectQuoteSettings`가 그대로 다시 수집한다 —
  **숨겨진 폼의 기본값이 저장값을 덮어쓰지 않는다**(§11.5 `legacy` 절에서 실제로 확인).
- Quote Preset 미리보기는 그 저장값을 **호환용 출력 조건**으로만 읽는다. 통로는
  `getQuoteRatio()` / `getQuoteExportWidth()` 둘뿐이고
  (`admin/quote/admin-quote-ratio-parser.js`), 본문 서식 계산과 섞이지 않는다.

### 11.2 Preview 옵션 — uniform / auto / custom

세 옵션을 **이 순서로 상시 표시**한다. `ratio` 버튼을 눌러야 펼쳐지던 단계는 없앴다
(`#postEditorPreviewRatioTrigger`와 `previewRatioRowExpanded` 삭제).

| 옵션 | 하는 일 |
| --- | --- |
| `uniform` | auto와 **완전히 같은 방법**으로 나눈 뒤, 가장 높은 페이지의 높이를 모든 페이지에 입힌다 |
| `auto` | 지금까지와 같다 — 수동 PAGE break로만 나누고 페이지마다 자기 높이. **이번에 새 분할 제한을 넣지 않았다** |
| `custom` | 사용자 지정 비율의 고정 크기 캔버스. 이때만 상세 비율 입력이 보인다 |

**옛 고정 비율은 custom으로 손실 없이 온다.** 프리셋의 `"4:5"` · `"9:16"` · `"custom"+ratioWidth/Height`가
전부 custom의 비율 값이 된다(`getPresetPreviewRatioMode` / `getPresetPreviewRatioParts`).
`"auto"`만 auto로 온다. uniform은 프리셋에 없는 새 값이라 사용자가 고를 때만 생긴다 —
**옵션 순서가 바뀌었다는 이유로 기존 값을 uniform으로 초기화하지 않는다.**

### 11.3 uniform 구현 — 재분할하지 않는다는 보장

1. `createPostPageCanvas`가 `auto`와 `uniform`을 **구분하지 않는다**(`flexibleHeight`).
   나누는 동안 uniform 페이지는 auto와 똑같이 "넘칠 자리가 없는" 높이 auto 박스다.
2. 그래서 `paginatePostPages`의 분할 코드는 한 줄도 갈라지지 않는다 — 페이지 수와 각 장의
   내용이 같다는 것이 **구조적으로** 보장된다.
3. 다 나눈 뒤 마지막에 `applyUniformPostPageHeights(pages)` 하나만 더 돈다
   (`posts/preview/posts-page-layout.js`). 이 함수는 **이미 만들어진 DOM의 height만** 바꾼다.
4. 재계산 전에 `style.height = "auto"`로 **이전 통일 높이를 먼저 지우고** 자연 높이를 다시
   잰다 — 그래서 모든 페이지가 짧아지면 통일 높이도 함께 줄어든다.

**세로 정렬.** auto·uniform 경로에 본문 묶음 `.post-editor-preview-body-area`를 하나 넣었다
(`flex: 1 1 auto; justify-content: center`). 제목은 묶음 **바깥 위**, 출처는 **바깥 아래**라
정렬 계산에서 자동으로 빠진다 — 사진을 포함한 본문 묶음이 "제목·출처가 차지하는 공간을
제외한 영역"의 세로 가운데에 온다. auto는 남는 공간이 0이라 이 묶음이 아무 것도 바꾸지
않는다(**여분 높이를 만들지 않는다**). 고정 비율(custom)은 예전 그대로
`.post-editor-preview-content-group`을 쓴다.

출처 위치 입력칸도 여기에 맞췄다 — uniform은 페이지에 정해진 아래쪽 경계가 있으므로
고정 비율과 같은 `margin`(바닥에서 띄우기)을 보여주고, 순수 auto만 `gap`을 보여준다.

### 11.4 출력 너비

- Preview에 입력칸(`#postEditorPreviewExportWidth`)과 크기 표시(`1080 × 1350`)를 뒀다.
- **레이아웃 너비(520px)와 다른 축이다.** 출력 너비를 바꿔도 줄바꿈·페이지 수는 바뀌지
  않는다(§11.5 `export width` 절에서 글자 단위로 확인).
- 캡처는 `getPostPreviewExportWidth(settings)`를 쓴다 — 세션에서 고른 값이 있으면 그것,
  없으면 프리셋의 `exportWidth`.
- uniform은 페이지 높이가 인라인으로 박혀 있어 **정확한 픽셀**로 캡처된다
  (`hasDefinitePageHeight`). 순수 AUTO만 예전처럼 높이를 비워 둔다(§10.4의 잘림 방지).

### 11.5 상태 보존

`null` = "아직 안 골랐다 = 프리셋 값을 따르는 중"이다. 그래서

- 초기값이 그 글의 프리셋 canvas 값이고, Preview에서 고른 값이 우선한다.
- 편집 도중 프리셋을 바꾸면 **아직 손대지 않은 항목만** 새 프리셋을 따라간다
  (`renderEditorPreviewPages`가 매번 컨트롤을 다시 맞춘다).
- 초기화(`resetPreviewVisibilityOverrides`)를 `openEditorPreview()`에서
  **`prepareEditorUI()`로 옮겼다** — 접었다 펴도 비율·정렬·제목/출처·출력 너비가
  유지되고, 다른 글로 이동하면 거기서 다시 초기화되어 이전 글의 임시 설정이 새어
  들어가지 않는다.
- gallery의 발췌 UI 숨김(`syncEditorExcerptControls`)은 건드리지 않았다.

### 11.6 캐시

- `admin/index.html`이 `core/lib/build-version.js`를 읽고(`?t=<Date.now()>`),
  이번 라운드의 두 CSS를 `loadVersionedStyles()`로 건다 —
  `../posts/posts-page-canvas.css` · `./admin-quote.css`. 고정 URL `<link>`였던 공용
  페이지 CSS가 CDN의 4시간 캐시에 걸려 **관리 화면만 옛 CSS**로 그려지던 경로가 없어졌다.
  글쓰기 화면과 **같은 절대 URL**이라 캐시 항목도 하나다.
- 관리 화면의 동적 스크립트 로더는 `../posts/**` 공용 렌더러만 `?v=APP_BUILD_VERSION`으로
  받는다(`resolveDependencyVersion`). 이 문서 안에 Studio가 iframe으로 들어오는데 그쪽도
  같은 `posts-body-layout.js`를 `?v=`로 받으므로, 맞춰 두지 않으면 **한 화면에서 같은
  파일을 두 번**(서로 다른 캐시 항목으로) 받게 된다. 실측으로 확인했다(§11.7 `cache`).
- `APP_BUILD_VERSION`을 `2026-09-12-4`로 올렸다.
- admin 전용 파일과 `core/*` · `admin-shell.css` · `admin-settings.css`는 **그대로 뒀다** —
  이번에 건드리지 않은 자산까지 함께 바꾸지 않는다(§11.8).

### 11.7 검증

`node admin/quote/quote-render-parity-e2e-test.mjs` — **140 PASS / 0 FAIL** (chromium).
저장소의 실제 `admin/index.html` · `index.html` · 실제 CSS/JS를 그대로 띄우고 Supabase만 mock.

| 절 | 확인한 것 |
| --- | --- |
| `uniform` | auto와 페이지 수·각 장의 글자·노드 구성이 같다(3장 fixture) · 자연 높이 164/278/164 → 전부 278 · 짧아지면 164로 줄어듦 · 빈 본문 1장 · 한 장뿐이면 auto와 같은 높이 · 제목 켜기/출처 끄기(278→263) · 프리셋 변경(278→471) · 실제 `<img>`가 든 글의 장·순서 동일, 사진 삭제 후 2116→207 · 본문이 묶음 안에서 위/아래 같은 간격(57.09/57.11) |
| `options` | uniform/auto/custom 순서로 상시 표시 · 펼치기 버튼 없음 · 프리셋 `9:16` → custom 9:16 + 실제 924px 캔버스 · 출력 너비 초기값 1440 · AUTO 프리셋은 auto로 옴 · 접었다 펴도 전부 유지 · 새 세션에서 전부 null · gallery 숨김 유지 |
| `export` | 고정 비율 4종 정확 일치 · 출력 너비 1080→1600에서 줄바꿈/페이지 수 불변, PNG 1600×2000 · uniform 3장이 전부 1040×556 · auto는 328/558/328 — **여기 적었던 "클론 재레이아웃 몫 +2px"는 틀린 설명이었다. 실제 원인과 해소는 §12.1 · §12.2** |
| `cache` | 관리 화면 `posts-page-canvas.css?v=2026-09-12-4` 1회 · `admin-quote.css?v=...` 1회 · `build-version.js?t=` 1회 · 버전 없는 고정 URL 0건 · iframe까지 합쳐도 `posts-body-layout.js` URL이 하나 · 글쓰기 화면이 같은 CSS URL |
| `paragraph` `parity` `legacy` `published` | 1단계 기준 그대로 유지(canvas 저장값 보존 포함) |

함께 돌린 회귀:

| 스위트 | 결과 |
| --- | --- |
| `skin/skin-gallery-e2e-test.mjs --only=excerpt` | 62 PASS / 0 FAIL |
| `skin/skin-gallery-e2e-test.mjs --only=body` | 88 PASS / 0 FAIL |
| `skin/skin-write-manage-e2e-test.mjs` | 155 passed / 0 failed |
| `admin/admin-settings-e2e-test.mjs` | 38 PASS / 0 FAIL |

**mock 테스트만 했다** — 실제 DB · 배포 · 실기기 확인은 하지 않았다.

### 11.8 남은 제한

- 옛 프리셋에 저장된 canvas 값은 그대로 보존되지만, **이제 어느 화면에서도 고칠 수 없다**
  (Preview의 선택은 세션 한정이라 저장되지 않는다). 글마다 늘 같은 비율을 쓰던 사람은
  매번 Preview에서 고르게 된다 — 출력 조건을 글/프리셋에 저장할지는 다음 라운드 결정 사항.
- `uniform`에서 세로 정렬은 항상 가운데다. Preview의 `align`(top/center) 선택은 고정 비율
  (custom)에만 적용된다. → **§12.4에서 auto·uniform일 때 그 컨트롤을 아예 숨겼다.**
- 관리 화면의 나머지 CSS(`core/*` · `admin-shell.css` · `admin-settings.css`)와 admin 전용
  JS는 여전히 고정 URL / `Date.now()`다. 이번 라운드에서 건드린 자산만 버전 규칙으로 옮겼다.
- `index.html`의 posts 모듈 로더도 여전히 `Date.now()`다(항상 최신이라 옛 파일이 남지는
  않지만, `APP_BUILD_VERSION` 한 축으로 모으려면 별도 라운드).
- 고스트 버튼 디자인 · 한국어 라벨(§9) → **§12.3 · §12.5에서 적용됨.**
  두 미리보기의 완전한 코드 통합은 그대로 남아 있다.
- iOS 실기기 확인은 여전히 하지 않았다(§10.8).

---

## 12. 3단계 적용 — Preview UI 정리 · 한국어 라벨 · auto export 치수 (2026-09-12)

§6 단계 4(UI 정리 · §9 번역)와, §11.7 `export` 절에 남아 있던 **auto의 +2px**을
처리했다.

### 12.1 auto export의 2px — 원인 (클론 재레이아웃이 아니다)

§11.7에서 auto 3장 export가 328 / **558** / 328이었다(레이아웃 높이 164 / 278 / 164,
2배 기대값 328 / 556 / 328). "클론이 다시 레이아웃해서 몇 px 더 크다"고 적어 뒀는데,
**틀린 설명이었다.**

실제 캡처 경로에 계측을 붙여(`html2canvas`를 감싸 `onclone`에서 클론과 라이브를 같이
잼) 확인한 결과:

| 측정 | 라이브 | html2canvas 클론 |
| --- | --- | --- |
| `getBoundingClientRect().height` | 278.1875 | **278.1875** |
| 본문 높이 | 143.1875 | **143.1875** |
| 출처 위치(페이지 위에서) | 203.1875 | **203.1875** |
| 줄 수 · 줄바꿈 위치(글자 단위) | 18줄 | **18줄, 전부 동일** |
| 본문 글자 | — | **동일** |

클론의 레이아웃은 라이브와 **완전히 같았다.** 벌어진 것은 두 개의 반올림 규칙이다.

    페이지의 자연 높이            278.1875px  (줄 상자 때문에 소수)

    offsetHeight                  반올림 → 278   ← 우리가 기대값을 계산하던 값
    html2canvas 1.4.1             올림   → 279   ← options.height를 주지 않으면
                                                   Math.ceil(bounds.height)
    캔버스 픽셀                   floor(279 × 2) = 558   (기대 556)

`html2canvas@1.4.1`의 실제 코드도 그대로다 —
`height: options.height ?? Math.ceil(bounds.height)` 그리고
`canvas.height = Math.floor(height × scale)`. 1px 차이가 2배 출력에서 2px이 된다.

**고정 비율과 uniform에는 이 문제가 없었다.** 둘 다 `page.style.height`가 실제로
박혀 있어 rect가 정수이기 때문이다(§11.4의 `hasDefinitePageHeight`). 순수 auto만
높이를 비워 두고 있었다.

### 12.2 고친 방법 — 나눈 뒤 페이지 높이를 정수로 확정

허용 오차를 넓히지 않았고, 콘텐츠를 잘라내거나 이미지를 늘이지도 않았다.
**나누기가 전부 끝난 뒤** 페이지의 자연 높이를 재서 정수 CSS 픽셀로 못박는다
(`applyDefinitePostPageHeights` — [posts/preview/posts-page-layout.js](./posts/preview/posts-page-layout.js)).

| | 무엇을 박는가 | 왜 |
| --- | --- | --- |
| `auto` | `min-height` | 상한이 아니라 **하한**이다. 화면 높이는 자연 높이와 같아지고, 그래도 클론이 라이브보다 더 필요로 하면 여전히 늘어난다(§10.4의 잘림 방지가 그대로 산다) |
| `uniform` | `height` (가장 높은 페이지 값) | 예전과 같다. 모든 페이지가 같은 높이여야 하므로 상한이기도 하다 |
| 고정 비율(custom) | 건드리지 않음 | 비율에서 이미 확정된 높이가 나온다 |

- **올림이다.** 내림/반올림은 실제로 그려진 박스의 아래쪽 소수분을 덜어낸다.
  올림은 여백이 1px 미만 늘 뿐, 그려진 것을 깎지 않는다.
- **auto와 uniform이 같은 측정·같은 올림을 쓴다**(§5) — 한 장뿐인 글에서 두 모드의
  높이가 갈리지 않는다.
- **배율을 역산해서 잰다.** 두 미리보기 모두 캔버스를 통째로 `scale()`해서 보여주므로
  `getBoundingClientRect()`를 그냥 쓰면 **화면에 보이는 크기**를 재게 된다(실측:
  278.1875 대신 264.3 → 265px이 박혔다). 페이지 폭은 레이아웃상 항상 정수(520px)이므로
  `rect.width / offsetWidth`가 지금 걸린 배율이고, 그걸로 되돌린 뒤 올린다
  (`measurePostPageNaturalHeight`).

**결과(실측).** auto 3장의 레이아웃 높이가 164 / **279** / 164가 되고, 1040px 출력의
PNG가 정확히 328 / **558** / 328이다 — 모든 장에서 `PNG 높이 = 레이아웃 높이 × 배율`.
e2e의 auto 허용 오차(±4px)는 **없앴다**(정확 일치).

### 12.3 Preview 여닫기 — 부유 알약 → 흐름 속 고스트 버튼

| | 예전 | 지금 |
| --- | --- | --- |
| 자리 | 모바일만, `position: sticky` + 그림자 + `backdrop-filter`의 알약 | 두 화면 모두 에디터 바로 아래 **일반 문서 흐름** |
| 모양 | 알약(`border-radius: 999px`) | `.post-editor-button`과 **같은 선·색·글자 크기**(#e8e8e8 · 각진 모서리 · 그림자 없음) |
| 데스크톱 | 접을 수 없음(버튼 자체가 `display: none`) | 같은 버튼으로 접고 편다 |
| 라벨 | `PREVIEW` + ↑/↓ | **미리보기 ▾** / **미리보기 접기 ▴** |

- 펼침의 유일한 표시는 섹션의 `is-open` 클래스이고, 보이기/숨기기는 CSS가 그 클래스로만
  정한다(데스크톱·모바일 공통).
- **기본값은 예전과 같다** — 데스크톱 펼침 · 모바일 접힘. `syncEditorPreviewMode()`가
  정하고, 사용자가 한 번이라도 직접 여닫으면 그 선택이 우선이다
  (`previewOpenChosenByUser`). 그 선택은 **글 단위**라 다른 글을 열면 초기화된다
  (`resetEditorPreviewOpenChoice()` ← `prepareEditorUI`).
- `aria-expanded`는 실제 상태에서 한 자리(`syncEditorPreviewToggleButton()`)에서 정하고,
  `aria-controls`는 실제로 펼쳐지는 `#postEditorPreviewSection`을 가리킨다.
- **Escape는 모바일에서만** 접는다. 데스크톱은 예전에 섹션에 `is-open`이 붙지 않아 이
  핸들러가 아예 돌지 않았으므로, 그 감각을 그대로 뒀다.
- **접은 채로 export/copy가 된다.** 기존 경로(`forceOpenSectionIfNeeded` —
  [posts/export/posts-preview-export-section.js](./posts/export/posts-preview-export-section.js))를
  그대로 쓰되, 판정 기준이 "모바일인가"에서 **"지금 접혀 있는가"**로 바뀌어 데스크톱에서도
  돈다. 이미 펼쳐져 있으면 예전처럼 아무 것도 건드리지 않는다.
- HTML 모드·gallery에서 발췌 UI를 숨겼다가 되돌아올 때 프리뷰도 원래 상태로 돌아온다
  (`syncEditorExcerptControls`) — 예전에는 데스크톱이 접히지 않아 드러나지 않던 자리다.
- 모바일 핀치 확대·이동, 시트 높이 드래그, gallery의 발췌 UI 숨김은 **건드리지 않았다**.

### 12.4 Preview 패널 정리

- 패널 왼쪽 위의 중복 `PREVIEW` 문구와 닫기 `×`, 그리고 이미 두 화면 모두
  `display: none`이던 모바일 배경(backdrop)을 **마크업에서 없앴다**. 헤더가 차지하던
  높이·아래 여백도 함께 사라졌다. 접는 길은 고스트 버튼 하나뿐이다.
- 패널과 버튼 사이에 줄이 두 번 그어지지 않게 섹션의 `border-top`을 뺐다.
- `uniform / auto / custom`은 이 순서로 **상시 표시**(§11.2 그대로).
- **세로 정렬(align)은 custom에서만 보인다.** auto·uniform은 공용 레이아웃이 세로 정렬을
  항상 `center`로 못박으므로(`flexibleHeight` 분기), 눌러도 아무 일도 일어나지 않는
  컨트롤을 남기지 않는다. 값 자체는 지우지 않아 custom으로 돌아오면 다시 쓰인다.
- **상세 비율도 custom에서만 실제로 보인다.** `syncPreviewRatioControls()`는 예전부터
  `hidden`을 켜고 있었지만 CSS의 `.post-editor-preview-ratio-custom-inputs{display:flex}`가
  UA의 `[hidden]{display:none}`(명시도 0,0,1,0)을 이겨서 **한 번도 숨겨지지 않았다.**
  같은 명시도의 `[hidden]` 규칙을 더해 고쳤다.
- 출력 너비 입력과 결과 크기(`1200 × 1500`)는 세 옵션 바로 옆에 그대로 두고, 모바일에서는
  줄 단위로 자연스럽게 감싼다(가로 넘침 0 — §12.6).
- 새 카드·탭·설정 팝업을 만들지 않았다.

### 12.5 Quote Preset 한국어 라벨

**경계는 "헤더 행이냐, 펼쳤을 때 나오는 것이냐"다.**

    헤더 행        영어      큰 탭 · 왼쪽 구역 제목 · **오른쪽 보조 문구**
                             (한 줄 안에서 언어가 갈리지 않게 한 쌍으로 본다)
    펼친 내용      한국어    설정명 · 선택값 · 동작 버튼

**영어로 남긴 것**

| | 그대로 두는 문구 |
| --- | --- |
| 큰 탭 | `CONTENT` · `CANVAS` · `TITLE·SOURCE` · `BODY` · `PRESET` |
| 화면 헤더 | `QUOTE PRESET` + 부제 `image style` |
| 구역 헤더(제목 + 보조 문구) | `TEST CONTENT`+`preview text` · `CANVAS`+`image` · `GENERAL`+`font` · `TITLE`+`typography` · `BODY`+`text` · `SOURCE`+`footer` · `PRESET`+`save` |
| 미리보기 패널 헤더 | `PREVIEW` + `1080 × 1080` |
| 그 밖 | 글꼴 이름(`Pretendard`) · 서식 기호(`*text*` · `"text"`) · 비율 숫자(`1:1` · `4:5` …) · 단위 `px` · 공용 `← back`(admin·studio가 함께 쓰는 버튼이라 범위 밖) · Preview 패널의 `uniform / auto / custom` |

**바꾼 것** — 설정명 44개 + 선택값 + 동작 버튼(전부 구역을 펼쳤을 때 나오는 것).

| 구역 | 영어 | 한국어 |
| --- | --- | --- |
| TEST CONTENT | TITLE · BODY | 제목 · 본문 |
| CANVAS | RATIO · AUTO · CUSTOM | 비율 · 자동 · 직접 입력 |
| | RATIO WIDTH · RATIO HEIGHT · EXPORT WIDTH | 가로 비 · 세로 비 · 내보내기 너비 |
| | BACKGROUND · PADDING | 배경색 · 안쪽 여백 |
| | VERTICAL EXTRA · HORIZONTAL EXTRA | 위아래 추가 여백 · 좌우 추가 여백 |
| GENERAL | FONT | 글꼴 |
| TITLE | DISPLAY · COLOR | 표시 · 글자색 |
| | FONT SIZE · WEIGHT · ALIGN | 글자 크기 · 굵기 · 정렬 |
| | LETTER SPACING · BOTTOM SPACE | 자간 · 아래 여백 |
| BODY | COLOR · HIGHLIGHT · POINT COLOR | 글자색 · 형광펜 · 강조색 |
| | FONT SIZE · WEIGHT · LINE HEIGHT | 글자 크기 · 굵기 · 줄 간격 |
| | LETTER SPACING · PARAGRAPH | 자간 · 문단 간격 |
| | HORIZONTAL · VERTICAL · LINE BREAK | 가로 정렬 · 세로 정렬 · 줄바꿈 방식 |
| | FIRST INDENT | 첫 줄 들여쓰기 |
| | ACTION · DIALOGUE · ITALIC | 지문 · 대사 · 기울임 |
| SOURCE | SOURCE TEXT · DISPLAY | 출처 문구 · 표시 |
| | BOTTOM MARGIN · TOP SPACE | 바닥에서 띄우기 · 위 여백 |
| | COLOR · FONT SIZE · WEIGHT · ALIGN | 글자색 · 글자 크기 · 굵기 · 정렬 |
| PRESET | PRESET NAME · SAVED PRESETS | 프리셋 이름 · 저장된 프리셋 |
| | new · save (버튼) | 새로 만들기 · 덮어쓰기 |
| | "saved preset 없음" | 저장된 프리셋 없음 |

선택값:

| 선택 | 한국어 |
| --- | --- |
| light / regular / medium / semibold / bold | 가늘게 / 보통 / 조금 굵게 / 굵게 / 아주 굵게 |
| left / center / right / justify | 왼쪽 / 가운데 / 오른쪽 / 양쪽 |
| top / center / bottom | 위 / 가운데 / 아래 |
| keep / word / char | 단어 지키기 / 단어 단위 / 글자 단위 |

**`value=` · 내부 키 · enum · 저장 필드 · API 계약은 하나도 바꾸지 않았다** — 화면에
보이는 글자만 바꿨다(§12.6 `labels` 절에서 폼 왕복으로 확인).
이번 번역은 **Quote Preset 화면 안에서만** 했다. 다른 관리자 탭과 공통 에디터로 넓히지
않았다.

### 12.6 검증

`node admin/quote/quote-render-parity-e2e-test.mjs` — **191 PASS / 0 FAIL** (chromium).
저장소의 실제 `admin/index.html` · `index.html` · 실제 CSS/JS를 그대로 띄우고 Supabase만
mock한다. 새 절 두 개를 더했다.

| 절 | 확인한 것 |
| --- | --- |
| `panel` | 버튼이 `position: static`(부유 아님) · 그림자/둥근 모서리/backdrop-filter 없음 · 선 색이 `#postEditorCancelButton`과 동일 · 라벨 `미리보기 ▾` ↔ `미리보기 접기 ▴` · `aria-expanded`가 실제 상태와 일치하고 `aria-controls`가 실재 · 중복 PREVIEW/닫기 ×/backdrop 0개 · 접었다 펴도 비율·출력 너비·정렬·제목·출처가 그대로 · 세로 정렬과 상세 비율이 **그려진 크기로** custom에서만 보임 · 출력 너비는 세 옵션 모두 보임 · **접힌 채 export가 펼친 상태와 장 수·픽셀까지 동일**하고 끝나면 다시 접힘 · 모바일 기본 접힘 + 같은 버튼으로 펼침 + 가로 넘침 0 + 핀치 경로 유지 |
| `labels` | 큰 탭·구역 제목·**헤더 행의 오른쪽 보조 문구 7개**·화면 부제가 영어 · 설정명 44/44 한국어 · 선택값 한국어(Pretendard만 예외) · 동작 버튼 · 비율 버튼 숫자 보존 · 서식 기호 보존 · 데스크톱과 **모바일 탭 5개 각각**에서 잘림/겹침/가로 넘침 0 · `applyQuoteSettings → collectQuoteSettings` 왕복에서 저장값 전부 일치, enum이 여전히 `"500"`/`"left"`/`"top"`/`"keep"`/`"pretendard"` |
| `export` | auto·uniform 모두 `PNG = 레이아웃 높이 × 배율` **정확 일치**(허용 오차 제거) + 페이지 높이가 정수로 확정됐는지(`data-definite-height`) |
| `paragraph` `parity` `legacy` `published` `uniform` `options` `cache` | 1·2단계 기준 그대로 유지 |

함께 돌린 회귀:

| 스위트 | 결과 |
| --- | --- |
| `skin/skin-gallery-e2e-test.mjs --only=excerpt` | 62 PASS / 0 FAIL |
| `skin/skin-gallery-e2e-test.mjs --only=body` | 88 PASS / 0 FAIL |
| `skin/skin-gallery-e2e-test.mjs --only=protect` | 17 PASS / 0 FAIL |
| `skin/skin-write-manage-e2e-test.mjs` | 155 passed / 0 failed |
| `skin/skin-banner-page-e2e-test.mjs` | 226 passed / 0 failed |
| `admin/admin-settings-e2e-test.mjs` | 38 PASS / 0 FAIL |

**눈으로 확인** — 데스크톱(1280) 펼침/접힘/custom/auto/uniform, 모바일(390) 펼침/접힘,
그리고 Quote Preset 패널을 데스크톱 한 장 + 모바일 탭 5개로 캡처해서 봤다.

**mock 테스트만 했다** — 실제 DB · 배포 · 실기기 확인은 하지 않았다.

`APP_BUILD_VERSION`을 `2026-09-12-5`로 올렸다.

### 12.7 설정 저장 범위 (이번 라운드에서 바꾸지 않은 것)

- DB에도 localStorage에도 **새 영구 저장을 만들지 않았다.** Preview에서 고른 출력 조건은
  지금처럼 **같은 글의 편집 세션 안에서만** 남는다(§11.5).
- 옛 프리셋의 canvas 저장값(`ratio` · `ratioWidth` · `ratioHeight` · `exportWidth`)은
  호환용으로 **그대로 보존**된다 — 폼에 남아 있고 `collectQuoteSettings`가 다시 수집한다
  (§11.1, `legacy` 절).
- §11.8의 "이제 어느 화면에서도 고칠 수 없다"는 **그 저장 필드를 직접 고치는 길**이
  없다는 뜻이다. 실제 출력 조건은 Preview에서 언제든 바꿀 수 있다.

### 12.8 남은 제한

- Preview 패널의 나머지 라벨(`align` · `body` · `title` · `source` · `margin` · `gap` ·
  `width`)은 **영어 그대로 뒀다.** 이번 번역 범위는 Quote Preset 화면이고, 공통 에디터로
  넓히지 말라는 요구가 있었다(§9의 "Preview 패널" 줄은 아직 후보로 남는다).
- 구역 헤더는 **제목과 오른쪽 보조 문구를 한 쌍으로** 영어로 둔다(사용자 결정,
  2026-09-12). 한쪽만 번역하면 같은 줄 안에서 언어가 갈린다 — 초안에서 보조 문구만
  한국어로 바꿨다가 되돌렸다. `labels` 절이 이 경계를 지킨다.
- `auto`의 페이지 높이가 이제 자연 높이보다 최대 1px 크다(올림). 화면에서도 export에서도
  같은 값이라 어긋나지는 않지만, 아래 여백이 1px 미만 넓어진 것은 사실이다.
- 옛 프리셋의 canvas 값은 여전히 **Preview에서 골라도 저장되지 않는다**(§11.8). 출력
  조건을 글/프리셋에 저장할지는 다음 라운드 결정 사항이다.
- 관리 화면의 나머지 CSS/JS 캐시 규칙, iOS 실기기 확인, 두 미리보기의 완전한 코드 통합은
  그대로 남아 있다(§10.8 · §11.8).
