# PHASE AI-6A — Element Inspector + Direct Edit 기반

Skin Studio Preview 안의 요소를 F12 Inspector처럼 직접 고르고, 간단한 수정은
OpenAI를 전혀 부르지 않고 Studio 자체 기능으로 끝내는 단계.

이 문서는 이 라운드의 **기록**이다(CLAUDE.md §5). 계약 성격의 규칙 중
"앞으로 계속 지켜야 하는 것"은 아래 3·7·8절에 모아 두었고, 아직 못 한 것은
10절(남은 차이)에 있다.

> **후속**: 선택 요소를 실제 AI 요청에 연결하는 것은
> [PHASE AI-6B](./AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md)에서 했다.
> 아래 10절 1번이 그 라운드에서 해소됐다.

---

## 1. 이번 라운드의 경계

| 했다 | 하지 않았다 |
| --- | --- |
| Inspector mode(Select) 진입점 · hover/선택 overlay · 팝오버 | Selected Element **AI 실제 호출**(다음 Phase) |
| 요소 종류별 Direct Edit(텍스트/이미지/링크/컨테이너) | Dynamic imageSlot 생성 |
| 안정 식별자(`data-imory-edit-id`) + 생성 CSS 규칙 | capability manifest · unsupported request feedback |
| runtime binding / imageSlot / owner·admin / POST region 보호 | multi-turn chat history · 전체 history timeline |
| Direct Edit 1-step undo | DB migration · 새 CMS 기능 |

OpenAI 호출은 이 라운드 전체에서 **0회**다(e2e 검사 N이 `/api/skin-ai`를
가로채 호출 횟수를 직접 센다).

---

## 2. element identity 전략 (요구사항 3절)

### 결론

**`data-imory-edit-id` 하나만 쓴다.** `:nth-child(3)` / `div > div > span`
같은 구조 selector는 어디에도 저장하지 않는다 — 스킨 HTML이 한 줄만
바뀌어도 다른 요소를 가리키기 때문이다.

### 조사 결과 — 기존 마크업에 쓸 수 있는 것이 있었나

| 후보 | 결론 |
| --- | --- |
| `id` 속성 | **불가**. `skin/skin-sanitize.js`의 `SKIN_SANITIZE_DENY_ATTRS`가 v0.1부터 전면 금지(스킨이 표준 id로 system root를 spoof하지 못하게). |
| `class` | 살아남지만 **유일하지 않다**. `.quiet-post-title`처럼 반복/의미 단위로 쓰이는 이름이라, 한 요소만 가리킬 수 없고 스킨 저자의 CSS와 이름이 충돌한다. |
| `data-imory-bind` / `src` / `href` / `repeat` / `if` | 있는 요소에만 있고, 같은 값이 여러 곳에 올 수 있다. 식별자가 아니라 **바인딩 경로**다. |
| `data-imory-region` | `"post-body"` 하나만 허용되는 고정 식별자(PHASE1C 7절). 편집 대상이 아니라 보호 대상이다. |

그래서 새 속성 하나를 최소로 추가했다.

### 값 형태와 sanitizer 영향

```js
/* skin/skin-sanitize.js */
const SKIN_SANITIZE_EDIT_ID_ATTR = "data-imory-edit-id";
const SKIN_SANITIZE_EDIT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
```

- 첫 글자는 영문, 이후 영문/숫자/`_`/`-`만, 최대 64자. 따옴표·대괄호·공백·
  역슬래시가 원천적으로 못 들어가므로, 이 값이 그대로 꽂히는 두 문자열
  (`[data-imory-edit-id="X"]` attribute selector, 같은 모양의
  `querySelector`)에서 구문을 깨거나 벗어날 수 없다.
- 형태가 틀린 값은 조용히 버린다(다른 `data-imory-*` 속성과 동일한 처리).
- 렌더러는 이 값을 **해석하지 않는다** — `skin/skin-render.js`의
  `walkSkinTree()`는 이 속성을 아예 보지 않는다. 순수 표식이다.

### 각 경로에 준 영향 (조사 결과)

| 경로 | 영향 |
| --- | --- |
| sanitizer | 화이트리스트에 한 줄 추가. 값 검증은 위 패턴 하나. |
| CSS validator | **변경 없음**. `skin/skin-css-validate.js`는 attribute selector를 이미 정상 처리하고, `SKIN_CSS_PROTECTED_SELECTOR_PATTERN`에도 걸리지 않는다. scope class는 평소대로 앞에 붙는다. |
| import / export | **변경 없음**. 속성은 `templates.*.html` 문자열 안에 그대로 실려 다니고, `validateSkinPackageImport()`가 부르는 `sanitizeSkinHTML()`이 이제 보존한다. |
| AI validator | **변경 없음**(같은 sanitize 경로). AI가 임의의 edit id를 만들어 넣어도 위험하지 않다 — 최악의 경우 Direct Edit 규칙 하나가 예상 밖 요소에 붙는 정도이고, 사용자가 그 요소를 다시 고르면 그대로 덮어쓴다. |
| published skin | **변경 없음**. `renderSkin()`이 매 렌더마다 sanitize를 다시 돌리므로 공개 화면에도 이 속성이 남고, 그래야 Direct Edit CSS 규칙이 공개 화면에서도 동일하게 적용된다(Preview↔공개 일치). |
| DB | **변경 없음**(migration 없음). |

### "선택만 해도 HTML이 바뀌지 않는다"

아직 한 번도 편집되지 않은 요소에는 이 속성이 없다. 그래서:

1. Inspector가 켜져 있는 동안에만, Preview로 보내는 **사본**에 구조 경로
   기반 임시 id(`e0-2-1`)를 찍는다 — `stampInspectorEditIds()`
   (`studio/inspector/studio-inspector-model.js`). `currentWorkingSkin`은
   이 경로에서 절대 바뀌지 않는다.
2. 사용자가 그 요소를 **실제로 고쳤을 때만** 그 id 하나를 SkinPackage에
   승격시킨다 — `commitInspectorEditId(stamped, keepEditId)`가 나머지
   임시 id를 전부 걷어낸다.
3. 승격된 id는 HTML 안에 남으므로, 그 뒤로는 구조가 바뀌어도 계속 같은
   요소를 가리킨다. 다음 렌더의 stamp는 기존 id를 먼저 수집한 뒤
   나머지에만 새 id를 찍으므로 충돌하지 않는다(충돌 시 `-x1` 접미사).

e2e 검사 **T**가 "편집한 요소 하나에만 id가 남는다 + 그 id가 선택과 같다"를
확인하고, **D2**가 "Inspector를 껐다 켜기만 해서는 dirty가 오르지 않는다"를
확인한다.

---

## 3. iframe ↔ Studio selection protocol

`studio/preview/preview-bridge.js` ↔ `studio/studio-preview.js` 계약에 네
메시지를 더했다. **DOM 노드도 HTML 문자열도 올라가지 않는다** — 식별자
문자열 하나, 태그 이름, 사각형 좌표 넷뿐이다.

```
parent -> iframe  "preview:inspector-mode"    { enabled }
parent -> iframe  "preview:inspector-select"  { editId }
iframe -> parent  "preview:inspect-hover"     { editId, tagName, rect }
iframe -> parent  "preview:inspect-select"    { editId, tagName, rect }
iframe -> parent  "preview:inspect-rects"     { hover, selected }
iframe -> parent  "preview:inspect-escape"    { }
```

- **고른 요소가 무엇인지는 parent가 판단한다.** iframe은 "여기 이 id가
  눌렸다"만 올린다. capability/바인딩/보호 여부는 Studio가 자기가 들고 있는
  SkinPackage에서 그 id로 다시 찾아 계산한다
  (`describeInspectorElement()`).
- `preview:inspect-rects`는 iframe 안 스크롤/리사이즈와 **재렌더 직후**에
  나간다. 재렌더 후 그 id를 못 찾으면 `selected: null`이 올라가고 Studio가
  선택을 정리한다.
- iframe은 선택 요소를 **element 참조**로 들고 있다(id만으로는 부족).
  `data-imory-repeat` 복제 항목들은 같은 template 요소에서 나와 id가 서로
  같기 때문이다 — 세 번째 글 항목을 눌렀는데 첫 항목에 테두리가 그려지면
  안 된다. 재렌더로 참조가 끊어졌을 때만 id로 다시 찾는다(그때는 같은 id의
  첫 요소).

### Inspector가 꺼져 있을 때

- `postRenderToFrame()`이 `payload.skin`을 그대로 보낸다(임시 id 없음) —
  지금까지의 Preview와 byte 단위로 동일.
- iframe의 Inspector 리스너는 전부 첫 줄에서 `inspectorEnabled`를 확인하고
  빠져나간다. 기존 앵커 가로채기 리스너도 첫 줄에 같은 확인을 넣어
  **전파 제어 한 가지에만 기대지 않는다**.

e2e 검사 **A / D3**가 "Inspector OFF에서 링크 클릭이 그대로 CATEGORY로
이동한다"를 두 번(켜기 전 / 끄고 난 뒤) 확인한다.

---

## 4. hover / selection overlay

- **overlay는 Studio(부모 문서)에 그린다.** 스킨 DOM에는 클래스도 스타일도
  붙이지 않는다 — layout shift가 원천적으로 없고, 스킨 CSS와 충돌하지 않으며,
  스킨 HTML 저장에 섞여 들어갈 위험도 없다. e2e 검사 **B2**가 확인한다.
- `#studioInspectorLayer`는 `pointer-events: none`이라 hover/click이 그대로
  iframe에 도달한다. 팝오버만 `pointer-events: auto`다.
- 좌표 변환은 `studioInspectorFrameGeometry()` 하나가 담당한다. Mobile
  모드의 `transform: scale()`은 **"실제로 그려진 폭 / 레이아웃 폭"**으로
  배율을 구해 자동으로 반영된다 — 배율 값을 따로 읽어오지 않으므로 나중에
  다른 변환이 붙어도 식이 그대로 맞는다. 모바일 프레임의 1px border만큼
  원점을 보정한다.
- 테두리는 항상 Preview 영역과의 **교집합**만 그린다 — iframe 안에서
  스크롤로 밀려난 부분이 Top Dock/AI 패널 위로 삐져나오지 않는다.
- 선택 단위는 `isInspectableElement()` 하나가 정한다(Studio와 iframe이
  **같은 파일**을 각자 로드해서 규칙이 갈라지지 않게 한다). `br`/`hr`과
  "자식도 텍스트도 바인딩도 없는 빈 장식 요소"는 건너뛰고 부모로 올라간다.

e2e 검사 **B**(테두리가 Preview 안쪽에 그려진다) · **U**(Mobile에서 배율까지
맞고 팝오버가 stage 안에 머문다).

---

## 5. 팝오버 구조

```
┌────────────────────────────────┐
│ HOME · 텍스트 <h1> · Recent... │  ← 무엇을 골랐는지
│ [ 직접 수정 ] [ ✦ AI 수정 ]     │
│ (안내문: 왜 어떤 옵션이 없는지) │
│ ─────────────────────────────  │
│ 내용      [입력칸]              │  ← 직접 수정을 눌렀을 때만
│ 글자 크기 [ 28 ] 기본           │
│ ...                            │
│ [ 되돌리기 ]                    │
└────────────────────────────────┘
```

- 위치는 선택 요소 rect 기준 아래 → 넘치면 위 → 그래도 넘치면 클램프.
  기준 영역은 뷰포트가 아니라 **Preview stage**다(AI 패널이 열려 있을 때
  팝오버가 그 아래로 숨지 않게).
- 다른 요소를 새로 고르면 폼은 접힌 상태에서 시작한다(Preview를 덜 가리게).
- 마크업은 `studio/index.html`과 `studio/studio-lifecycle-scenario.html`에
  중복해 두지 않고 `studio-inspector.js`가 만들어 넣는다(AI 패널의 참고
  이미지 UI와 같은 방식).

---

## 6. 요소별 Direct Edit 옵션

`describeInspectorElement()`가 돌려주는 `capabilities`가 곧 화면에 그려지는
컨트롤 목록이다. UI는 그 결과만 보고 그리고, "이건 되나?"를 스스로 다시
판단하지 않는다.

| 종류 | 옵션 |
| --- | --- |
| TEXT | 내용(정적 텍스트만) · 글자 크기 · 굵기 · 글자색 · 정렬 |
| IMAGE | 이미지 변경/제거(연결된 슬롯에만) · 가로 크기 · 모양(사각형/약간 둥글게/원형) · 정렬 |
| LINK / BUTTON | 표시 텍스트 · 링크 주소(정적 href만) · 글자색 · 배경색 · 모서리 · 정렬 |
| CONTAINER | 배경색 · 테두리(두께+색) · 모서리 · 안쪽 여백 · 정렬 · 글자색 |

옵션이 빠진 자리는 빈칸으로 두지 않고 **이유를 한 줄로 말해 준다**
(`studioInspectorNoteFor()`) — 사용자는 빈칸을 고장으로 읽는다.

> **버튼에 대해**: 스킨 sanitizer는 `<button>`을 허용하지 않는다
> (`SKIN_SANITIZE_REMOVE_WITH_CONTENT_TAGS`). 그래서 실제 스킨의 "버튼"은
> 항상 `<a>`이고, 이 라운드의 LINK 옵션이 그대로 버튼을 덮는다.

---

## 7. HTML / CSS patch 방식

### 결정

- **내용(텍스트 / 정적 링크 주소)만 HTML을 고친다.**
- **나머지 모든 스타일은 CSS 규칙으로 쓴다.** inline style은 만들지 않는다 —
  `skin/skin-sanitize.js`가 `style` 속성을 전면 금지하고 있어 저장/공개
  어느 단계에서든 그대로 사라진다.

### 생성 규칙의 모양

```css
[data-imory-edit-id="e0-0"][data-imory-edit-id="e0-0"] { font-size: 28px; text-align: center; }
```

같은 속성을 **두 번** 쓰는 건 오타가 아니라 specificity를 한 칸 올리기 위한
것이다(0,2,0 → 0,3,0). 실제 스킨 CSS는 `.quiet-main .quiet-banner-list`처럼
클래스 두 개짜리 규칙과 `@media` 안의 덮어쓰기를 흔히 쓰는데, 한 번만 쓰면
그것들과 같거나 낮은 specificity라 "직접 수정했는데 화면이 안 바뀐다"가 된다.
`!important`를 쓰지 않는 이유는 다음 단계(AI 수정 / Code Editor)가 이 값을
다시 덮어쓸 여지를 남기기 위해서다. e2e 검사 **G**가 스킨의
`.y-home .y-heading { font-size: 20px }` + `@media` 덮어쓰기를 실제로 이기는지
확인한다.

### 왜 기존 class를 고치지 않았나

- 스킨 저자의 class는 **여러 요소가 공유**한다 — 하나만 고치려는 편집이
  같은 클래스의 다른 요소까지 바꾼다.
- 새 class를 만들어 붙이면 스킨 저자/AI가 쓰는 이름과 충돌할 수 있고,
  `class` 속성을 편집이 건드리기 시작하면 스킨 CSS가 조용히 깨진다.
- attribute selector는 스킨 CSS가 절대 쓰지 않는 네임스페이스라 충돌이
  구조적으로 없다.

### 값의 안전성

CSS 값은 전부 `buildInspectorStylePatch()`가 닫힌 집합에서 만든다 —
색은 `#rrggbb`만, 길이는 정수 px(상한 있음)만, 나머지는 열거된 키워드만.
사용자가 CSS 문자열을 직접 쓰는 입구는 없다. 규칙 갱신은 같은 selector의
기존 규칙을 찾아 통째로 갈아끼우므로(없으면 뒤에 붙임) 요소당 규칙은 항상
하나다.

### 상태 변경 경로

Direct Edit은 **`applyWorkingSkinChanges()` 하나만** 지난다(Code Apply와
같은 함수). 그래서 POST region 검사, legacy top-level html 폴백, dirty/
revision/버튼 갱신, "보던 화면 그대로 다시 그리기"가 전부 자동으로 같은
규칙을 따른다. 새 mutation 경로를 만들지 않은 것은 나중에 AI edit과 direct
edit을 하나의 edit history로 합칠 때 막히지 않기 위해서다(요구사항 13절).

---

## 8. 보호 계약

| 대상 | 처리 |
| --- | --- |
| `data-imory-bind` 텍스트 | "내용" 컨트롤 자체를 만들지 않는다. 스타일은 허용. 바인딩 속성은 그대로 보존된다(e2e **F**). |
| `data-imory-href` 링크 | "링크 주소" 컨트롤 자체를 만들지 않는다. `viewer.*`(write/manage/admin)는 안내문도 다르게 준다(e2e **L**). |
| `data-imory-src`가 슬롯이 아닌 이미지 | "이미지 변경/제거" 없음(교체 대상이 스킨이 아니라 글/배너 데이터라서). |
| imageSlot 이미지 | 그 **슬롯 하나만** 교체/비우기(`setStudioImageSlot`). `required: true` 슬롯은 비우기 비활성(e2e **I / J**). |
| `data-imory-region="post-body"` | 자기 자신도, 그 안도 직접 수정 옵션이 **하나도 없다**. region 선언은 그대로 남는다(e2e **V**). |
| 정적 href 입력 | `isSafeSkinUrl()`을 통과한 값만 반영(e2e **K2**). |
| 반복 항목 | 막지 않되 "같은 자리 전체에 적용된다"고 안내한다(template 편집이므로 그게 올바른 의미다). |

imageSlot 판정은 Skin Context가 슬롯 값을 노출하는 두 경로만 인정한다:
`images.<slotName>` 과 `profile.avatarUrl`(→ `profile` 슬롯). 새 이미지 영역을
만드는 기능은 이번 라운드에 없다(Dynamic imageSlots는 별도 Phase).

---

## 9. dirty / Save 연동 · undo

- 직접 수정 → Preview 즉시 반영 + `dirty=true` + Save 활성. **자동 Save는
  하지 않는다** — DB에 가는 것은 사용자가 Save를 누를 때뿐이다(e2e **O / P1**).
- Publish도 회귀 없음(e2e **P2**).
- Direct Edit 1-step undo: 바꾸기 직전의 template `html`/`css` 한 벌을 들고
  있다가 같은 `applyStudioDirectEdit()`로 되돌린다(e2e **G2**).
- 이미지 슬롯 교체/비우기는 이 undo에 포함되지 않는다 — 그건 html/css가
  아니라 슬롯 연결 상태이고, 기존 Images 기능의 소관이다(10절 참고).

---

## 10. 남은 차이

1. ~~**Selected Element AI 실제 호출이 없다.**~~ — **해소됨 →
   [AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md](./AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md)**.
   이 라운드에서는 "AI 수정"이 AI 패널을 열고 선택 요소를 chip으로 보여준 뒤
   "다음 단계에서 지원됩니다"까지만 했다. AI-6B에서 그 자리가 실제
   `selectionContext` 전송으로 바뀌었고, 함께 달라진 것:
   - chip의 주인이 이 파일(Inspector)에서 `studio/ai/studio-ai-selection.js`로
     옮겨졌다(`#studioInspectorAiChip` → `#studioAiSelectionChip`). Inspector는
     이제 window 이벤트 `"studio-inspector-selection"`만 쏜다.
   - `window.getStudioInspectorSelection()`에 `isViewerBinding` /
     `repeatPath` / `isInsideRepeat` / `text`가 더해졌다.
2. **정적 `src` 이미지는 교체할 수 없다.** 슬롯에 연결되지 않은
   `<img src="https://...">`에는 "이미지 변경"이 비활성으로 표시된다 —
   URL 입력 UI를 새로 만들지 않았다(기존 Images/slot picker 재사용 원칙).
3. **Direct Edit undo와 AI undo가 아직 하나가 아니다.** 둘 다
   `applyWorkingSkinChanges()`를 지나므로 통합을 막지는 않지만, 지금은
   각자 1-step이다.
4. **이미지 슬롯 변경은 Direct Edit undo 밖이다**(위 9절).
5. **좁은 화면(≤720px)에서는 Select 버튼을 감춘다.** Top Dock은 원래도 그
   폭에서 오른쪽 actions가 뷰포트를 넘치는데(Studio는 데스크톱 전용 도구),
   버튼을 하나 더 얹으면 "AI Assistant"가 아예 화면 밖으로 나간다. AI
   패널이 overlay로 바뀌는 것과 같은 breakpoint를 쓴다. Preview를 Mobile
   폭으로 보는 것과는 무관하다(그건 Studio 창은 넓은 채로 iframe만 390px).
6. **Direct Edit이 만든 CSS를 적용 시점에 따로 validate하지 않는다.**
   값이 닫힌 집합이라 실패할 여지가 없고, 저장 시점
   (`normalizeSkinPackageForDraft`)과 렌더 시점(`renderSkin`)에 기존
   검증이 그대로 돈다.
7. **반복 항목의 재렌더 후 선택**은 같은 id의 첫 항목으로 붙는다(3절).

---

## 11. 테스트

> **일부 변경됨 →**
> [AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md](./AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md)
> — 텍스트 내용 입력(한 줄 input → 여러 줄 textarea + 적용/취소)과 이미지
> 크기(숫자 하나 → 슬라이더 + 숫자 + 모서리 드래그, 비율 유지)가 그 라운드에서
> 바뀌었다. 아래 fixture(scenario y)에도 요소 두 개와 Images 버튼이 더해졌다.

`studio/studio-inspector-e2e-test.mjs` (포트 8939, `?scenario=y`).
mock 대상은 Supabase 하나뿐이고 HTML/CSS/JS는 저장소의 실제 파일이다.

```
node studio/studio-inspector-e2e-test.mjs
node studio/studio-inspector-e2e-test.mjs --only=text
```

`--only=` 이름: `mode / text / image / link / container / state / ai /
route / mobile`.

fixture(scenario y)는 요구사항 16절의 대표 요소 여덟 가지를 한 SkinPackage에
담고 있다 — 정적 heading / runtime-bound 글 제목 / imageSlot 이미지 두 개
(하나는 `required`) / 정적 링크 / owner·admin 바인딩 링크 / 버튼처럼 쓰는
링크 / 컨테이너 / POST의 protected region.

### 이 라운드에서 함께 고친 테스트 하네스

- `studio/studio-lifecycle-scenario.html`의 mock `auth.getSession()`이
  `session.user.id`를 함께 돌려준다. 예전에는 `access_token`만 있어
  `skin/skin-context.js`의 `resolveSkinViewerId()`가 항상 `null`을 받았고,
  그 결과 Studio Preview의 `viewer.*`가 늘 "비소유자"였다(실제 Studio는
  언제나 소유자 화면이므로 사실과 달랐다).
- 같은 문서에 최소 `window.skinImageLibrary` mock을 뒀다. fixture가
  `imageLibrary`를 선언한 시나리오에서만 "준비됨"으로 답하므로, 기존
  시나리오는 지금까지와 동일한 폴백을 탄다(콘솔 에러 하나만 사라진다).
