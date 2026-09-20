# IMORY — 스킨 CSS 판정 · SkinPackage 공용 파이프라인 · 이미지 슬롯 정규화 (IMPORT-CSS-IMAGE-1)

이 문서가 기준이다. 코드: [skin/skin-css-validate.js](../../skin/skin-css-validate.js) `analyzeSkinCss` ·
[skin/skin-package-images.js](../../skin/skin-package-images.js) `normalizeSkinPackageImageSlots` ·
[skin/skin-package-import.js](../../skin/skin-package-import.js) `runSkinPackageContentPipeline`.

---

## 1. 왜 바뀌었나 — 재현한 원인

첨부 스킨 `FOREVER, MY FOE`(`skin/test-skins/imory-skin-forever-my-foe.json`)를 Import 하면
"CSS에 문제가 있어 가져올 수 없습니다: Unexpected input" 으로 멈췄다.

- **어디서**: `validateSkinPackageImport` → `validateAndScopeSkinCss` → csstree `parse()` 의 `onParseError`.
  예전 규칙은 "파싱 경고가 **하나라도** 나오면 CSS 전체를 버린다(ok:false, css:"")" 였고,
  Import 는 그 경고의 영어 문장만 이어 붙여 보여 줬다.
- **무엇이**: CSS 129행 11열 — `.finder-nav-icon[data-kind="quote"]:before{ content:"“”; … }`.
  여는 `"` 뒤에 둥근 따옴표 두 개만 있고 **닫는 `"` 가 없다**. 진짜 문법 오류다(검사기가 안전한
  표준 CSS 를 막은 것이 아니다).
- **브라우저는 어떻게 읽나**: 닫히지 않은 문자열은 그 줄 끝까지를 bad-string 으로 삼키고, 선언은
  **다음 `;` 까지** 이어진다. 그래서 `content:"“”;↵ position:absolute` 가 한 선언으로 버려지고
  규칙의 나머지(`inset` 등)는 산다. 스킨 전체가 버려지는 일은 브라우저에서는 없다.
  (e2e `C3` 가 원문과 잘라낸 CSS 를 브라우저 CSSOM 으로 각각 읽어 275개 규칙이 글자 단위로 같음을 잰다.)
- **같은 이유로 공개/미리보기 렌더도 망가져 있었다**: 렌더 경로(`validateAndScopeSkinCss`)가 같은
  규칙이라, 이런 선언이 하나라도 있으면 스킨이 **CSS 없이** 그려졌다.

수정 예: `content:"“”";`

---

## 2. 공용 파이프라인 (현재 구현)

SkinPackage 가 Studio working draft 로 들어오는 **모든 입구**가 같은 함수를 지난다.

| 입구 | 호출 |
| --- | --- |
| Import 창 Validate / Apply to Draft | `validateSkinPackageImport` → `runSkinPackageContentPipeline` — Apply 는 Validate 가 돌려준 **그 결과**를 적용한다(다시 검사하지 않는다) |
| AI 전체 · AI 선택 요소 | `studio/ai/studio-ai-panel.js` → `validateSkinPackageImport(…, { attachments })` |
| Code 적용 | `studio/studio-preview.js` `applyCodeEditorChanges` → `runSkinPackageContentPipeline` (편집기는 sanitize/검사를 더 이상 직접 하지 않는다) |
| Export → 다시 Import | Import 와 같다. Export 는 CSS 를 repair 로 한 번 더 걸러 싣는다 |
| Save | `normalizeSkinPackageForDraft` — sanitize + `analyzeSkinCss(repair)`, **잘라낸 CSS 를 저장** |
| 렌더(Studio Preview · 공개 · sandbox 프레임) | `validateAndScopeSkinCss` = `analyzeSkinCss(repair)` + 스코프 |

파이프라인 순서는 고정이다.

1. **이미지 슬롯 정규화** (`normalizeSkinPackageImageSlots`) — sanitize **전에**.
   AI 의 `src="imory-attachment:1"` 은 https 가 아니라 sanitizer 가 지워 버리기 때문이다.
2. **HTML sanitize** (`sanitizeSkinHTML`)
3. **CSS 판정** (`analyzeSkinCss`, strict) — 문제된 부분만 잘라낸 CSS 가 draft 에 들어간다.

Direct Edit(Inspector)은 이 파이프라인을 타지 않는다 — 사람이 쓴 CSS 가 아니라 Inspector 가 만든
선언만 넣는 경로라서다(§6).

---

## 3. CSS 판정 기준

### 3-1. 결과 세 가지

| 판정 | 뜻 | strict (Import · Code · AI) | repair (Save · Export · 렌더) |
| --- | --- | --- | --- |
| `error` | 가져오지 않는다 | 창을 닫지 않고 위치·이유 표시 | 구조 오류만 error(CSS 없이 그림 — 예전 동작) |
| `removed` | **그 부분만** 빼고 가져온다 | 목록으로 알림 | 조용히 뺀다(경고 배열) |
| 통과 | 원문 그대로 | | |

### 3-2. 무엇이 어디에

| 구분 | 예 | strict | repair |
| --- | --- | --- | --- |
| 구조 — 중괄호/괄호 짝 | `.a{color:red`(파일 끝까지 열림) · 짝 없는 `}` · `calc(` 안에서 끝난 블록 | error | error |
| 구조 — 선택자 / @규칙 머리를 읽을 수 없음 | `.a:::b{…}` · `@media (max-width:{` | error | error |
| 선언 하나의 문법 오류 | 닫히지 않은 문자열 · `foo` 처럼 `:` 없는 선언 · 읽을 수 없는 값 | removed | removed |
| 보안 — 실행/외부 스타일시트 | `@import` · `javascript:`/`vbscript:` 주소(따옴표 유무, custom property 안 포함) · `expression()` · `behavior` · `-moz-binding` | **error** | removed |
| 허용 안 되는 주소 | `url(data:…)` · `url(http:…)` · `blob:`/`file:` · custom property 안의 `url(http:…)` · `image-set("http:…")` | removed(선언 통째) | removed |
| 보호 선택자 | `#postDetailContent` · `.post-detail-content` · `.post-dialogue` · `.post-action` · `.post-inline-*` | removed(그 선택자만, 목록은 남는 선택자로 다시 씀) | removed |

- **보안 위반을 strict 에서 막는 이유**: 조용히 지우면 공격 시도(또는 `@import` 로 검사 안 된 CSS 를
  들이려는 시도)가 사용자에게 보이지 않는다. repair 에서 지우기만 하는 이유: 이미 저장된 옛 draft 를
  렌더/Save 가 거부하면 화면이 통째로 스킨 없이 나오거나 저장이 막힌다(예전에도 렌더는 지웠다).
- **허용 안 되는 주소를 선언째 빼는 이유**: 예전에는 값에서 `url()` 노드만 빼서
  `background: no-repeat, linear-gradient(…)` 처럼 **다른 값**이 남았다.
- **통과하는 현대 CSS**(e2e `C6`): custom property · `calc/min/max/clamp` · `vh/svh/dvh` · `@media` ·
  `@keyframes`+`animation` · `transform` · 여러 겹 gradient(`linear/radial/conic`) · `filter`/`backdrop-filter` ·
  `object-fit/position` · grid/flex · `aspect-ratio`/`inset` · `::before/::after` · `@supports` · `:is()/:has()`.
- `https://` 와 상대 경로 `url()` 은 예전처럼 통과한다(§6 남은 차이).

### 3-3. 잘라내기

- 원문에서 **그 구간만** 잘라낸다(선언은 뒤의 `;` 까지). AST 를 다시 찍어내지 않으므로 사용자의 줄바꿈 ·
  주석 · 들여쓰기가 남는다.
- 잘라낸 결과를 **다시 검사해 아무것도 걸리지 않을 때만** 쓴다(고정점). 아니면 `cleanup-unstable` 로 막는다.
- 짝 검사는 파서와 따로 토큰 단위로 센다 — csstree 는 `.a{color:red` 에 오류조차 내지 않고, `.a{color:red↵.b{…}`
  는 두 번째 규칙을 첫 규칙 **안으로** 넣은 채 통과시킨다.

### 3-4. 오류 문장

`CSS 129행 11열 · 문법 오류: 문자열의 닫는 따옴표가 없습니다(…) — content:"“”; position:absolute`
+ `수정 방법: 따옴표를 닫아 주세요. 예: content:"“”";`

- 행/열은 1부터, **CSS 필드 안에서** 센다(JSON 파일의 줄이 아니다).
- 분류: `문법 오류` · `보안 정책 차단`(strict error) · `보안 정책`(repair) · `허용되지 않는 값`.
- 여러 개면 메시지는 첫 오류 + `(오류 N개 중 첫 번째)`, Import 창 목록에 전부. Code 편집기는 첫 오류 +
  수정 방법 + 남은 개수. AI 결과가 CSS 로 거부되면 AI 상태 문장에도 첫 오류가 붙는다.
- 함수: `formatSkinCssIssue` · `summarizeSkinCssReport`(skin-css-validate.js) 한 곳.

---

## 4. 이미지 슬롯 정규화 (`normalizeSkinPackageImageSlots`)

| 규칙 | 동작 |
| --- | --- |
| 올바른 `data-imory-src="images.xxx"` | 그대로 |
| HTML 은 `images.xxx` 를 쓰는데 선언이 없음 | 슬롯 선언을 만든다(`label` = 그 `<img>` 의 alt, `required:false`) + "비어 있는 슬롯" 안내 |
| 같은 이름 선언이 둘 | 하나로(앞의 값이 이기고 빈 칸만 채움, `required` 는 하나라도 true 면 true) |
| 이름이 DB 규칙 `^[a-z][a-z0-9_]*$`(50자)에 안 맞음 | 선언과 HTML 의 `images.<이름>` 을 **함께** snake_case 로(`heroPhoto` → `hero_photo`). 그대로 두면 연결한 이미지를 Save 할 때 `skin_version_image_slots.slot_name` check 에 걸려 저장 전체가 실패한다 |
| 이름 없는 선언 | 뺀다 |
| `<img src="imory-attachment:N">` | 슬롯을 만들고 `data-imory-src`/`data-imory-if="images.<슬롯>"` 로 바꾼다. src 는 지운다. `required:true`, `aspectRatioHint` 는 첨부의 실제 픽셀에서 |
| 평범한 `<img src="https://…">` · data: 그림 · 아이콘 · 장식 | 건드리지 않는다. 외부 그림을 Imory 저장소로 복사하지 않는다(data: 는 sanitizer 가 지운다) |

- **슬롯 이름 짓기**: 그 `<img>` 의 class · aria-label · alt 와 조상 4단계의 class 낱말에서 역할(profile ·
  logo · hero/main/visual · cover · banner · gallery · background · thumbnail · header)과 종류(photo 낱말이
  있으면 `photo`, 아니면 `image`)를 찾아 `hero_photo`, `profile_image`, `banner_image` 처럼 붙인다.
  못 찾으면 `photo`, 그것도 없으면 `image_1`, `image_2`… 이미 쓰인 이름이면 `_2` 를 붙인다.
- **라벨**: alt(40자 이하)가 있으면 그것, 없으면 `메인 사진` 같은 역할 이름.
- **두 번 돈다**: 모든 template 의 `images.*` 를 먼저 모아 이름을 차지한 뒤 첨부 자리에 이름을 준다.
- 같은 첨부를 두 자리에 쓰면 슬롯도 하나다. 이미 `data-imory-src="images.x"` 가 있는 `<img>` 에 첨부
  자리표시자가 붙으면 그 슬롯 x 에 연결한다.
- **CSS background-image 는 슬롯으로 바꾸지 않는다** — 엔진에 편집 가능한 배경 슬롯이 없다(style 속성은
  sanitizer 가, CSS 의 `images.*` 는 해석기가 없다). 그래서 AI 에게 첨부 사진은 반드시 `<img>` 층
  (`position:absolute; inset:0; object-fit:cover`)으로 두라고 시킨다. CSS 의 `url(imory-attachment:…)` 은
  §3 에 따라 그 선언째 빠진다.
- 독립 JSON Import 에는 첨부가 없다 — 자리표시자는 슬롯 **선언만** 복구하고 "비어 있는 이미지 슬롯: …
  Images 패널에서 이미지를 넣어 주세요" 로 알린다.

---

## 5. AI 첨부 이미지 흐름 (현재 구현)

```
사용자 첨부(PNG/JPEG/WebP, 최대 2장 — 크기를 재 둔다)
→ /api/skin-ai : 기본은 "참고만". 사용자가 스킨 안에 넣으라고 했을 때만
   모델이 <img src="imory-attachment:N" alt=… class=…> 를 쓴다(functions/api/skin-ai.js 참고 이미지 규칙)
→ validateSkinPackageImport(…, { attachments:[{aspectRatioHint}] }) — 공용 파이프라인이 슬롯을 만들고
   slotReport.attachmentSlots = [{ slot, attachmentIndex }] 를 돌려준다
→ uploadStudioAiAttachmentsToSlots : **그 첨부만** skinImageLibrary.upload(Images 패널과 같은 경로 —
   메타데이터 제거·압축·새 경로)로 "내 이미지"에 올린다
→ applyAiSkinPackage(skinPackage, { imageSlotBindings: 기존 + 새 연결 }) — 스킨 교체와 슬롯 연결이 Undo 한 칸
→ Preview 에 바로 보이고, Images 패널에서 바꾸기 · Select 의 자르기/위치 조정을 그대로 쓴다
```

- 모델이 자리표시자를 쓰지 않은 요청은 아무것도 올리지 않는다(예전 "참고 이미지" 동작 그대로).
- 업로드가 실패하거나 이미지 라이브러리가 없는 배포면 스킨은 적용하고 그 슬롯만 비워 둔 채 알린다.
- 업로드 중 사용자가 중단을 누르면 적용하지 않는다.
- 서버는 여전히 imageSlots · Storage · DB 를 건드리지 않는다(모델이 만든 imageSlots 는 받지도 않는다).
- 첨부 안내 문장: "참고 이미지는 AI 요청에 쓰입니다. AI가 스킨 안에 넣은 이미지만 내 이미지에 저장되어
  이미지 슬롯에 연결됩니다."

---

## 6. 남은 차이

- **외부 https 이미지·웹폰트**: CSS `url(https://…)` 는 여전히 통과한다(sandbox 프레임은 CSP 로 막아 그 그림만
  빠진다 — `core/lib/skin-sandbox-server.js` ③ · 설계 문서 §F#6). 허용 출처 목록은 이번에 정하지 않았다.
- **선택자/@규칙 머리의 문법 오류는 막는다**. 브라우저는 그 규칙 하나만 버리지만, csstree 의 복구 경계가
  브라우저와 같다고 보장할 수 없어 잘라서 고치지 않는다.
- **Direct Edit(Inspector)** 는 파이프라인을 타지 않는다. 사람이 쓴 CSS 가 아니라 Inspector 가 만든 선언만
  넣는다.
- **이 규칙 이전에 저장된 draft** 는 불러올 때 다시 검사하지 않는다. 렌더 · Save · Export 가 repair 로 걸러
  내므로 화면과 저장 결과에는 들어가지 않지만, working draft 의 글자에는 Save 전까지 남아 있다.
- **AI 첨부 업로드 뒤 적용이 취소된 경우**(그 사이 draft 가 바뀌어 stale, 또는 ↶ 로 되돌림) 올린 이미지는
  "내 이미지"에 남는다. 자동 정리는 없다(Images 패널에서 지울 수 있다 — SKIN_IMAGE_LIBRARY_PLAN.md 7절과 같은 정책).
- **배경 이미지 슬롯**은 없다(§4). 만들려면 sanitizer · 렌더러 · Images 패널 · Select 자르기가 함께 바뀌어야 한다.
- `skin/skin-css-validate.js` 는 약 1,370줄이다. 분석기(scan/cut/analyze)만 떼면 모듈 정적 import 가 하나
  늘어 모든 진입 문서의 import map 과 sandbox 프레임 allowlist 가 함께 바뀌어야 해서, 이번에는 한 파일로 뒀다.

---

## 7. 테스트

- `studio/studio-import-css-image-e2e-test.mjs` (8973) — `css` · `import` · `errors` · `code` · `slots` · `ai`
- `studio/studio-sandbox-preview-e2e-test.mjs --only=slots` (8959+8960) — 자동 슬롯이 native 와 sandbox 프레임에서
  같은 주소 · 크기 · object-fit/position
- `skin/skin-css-validate-test.html` — 렌더 경로(repair) 계약
