# IMORY LAYOUT PRIMITIVE — 배치 계약 (LAYOUT-1)

Skin Studio 의 **배치 primitive** 다섯 가지를 정한다.

    panel · stack · grid · free · sidebar

목표는 하나다 — **AI 가 매번 임의의 CSS 레이아웃을 새로 발명하지 않고,
직접 수정 모드와 AI 수정이 같은 layout model 을 고치게 만드는 것.**

이 문서는 "현재 구현"이다. 아직 없는 것은 §10(남은 차이)에 따로 적는다.

| 무엇 | 어디 |
| --- | --- |
| 계약 · 값 규칙 · 컴파일러 | [skin/skin-layout.js](./skin/skin-layout.js) |
| 배치 규칙(CSS) | [skin/skin-layout.css](./skin/skin-layout.css) |
| 저장 경계 | [skin/skin-sanitize.js](./skin/skin-sanitize.js) |
| 렌더 진입 | [skin/skin-render.js](./skin/skin-render.js) `renderSkin()` |
| 직접 편집 | [studio/inspector/studio-inspector-layout.js](./studio/inspector/studio-inspector-layout.js) |
| AI 지시문 | [functions/api/skin-ai.js](./functions/api/skin-ai.js) `buildSkinAiSystemPrompt` |
| 단위 테스트 | `node skin/skin-layout-test.mjs` |
| 렌더 E2E | `node skin/skin-layout-e2e-test.mjs` (포트 8964) |
| 손으로 보는 하네스 | [skin/skin-layout-render-harness.html](./skin/skin-layout-render-harness.html) |

---

## 1. 결정 — 새 트리를 만들지 않는다

요구사항 15절은 이런 데이터 모델을 예로 든다.

```json
{ "type": "panel", "layout": { "type": "stack", "direction": "column", "gap": 16 },
  "children": [ ... ] }
```

이 저장소에서 그 트리는 **이미 존재한다** — `templates.*.html` 그 자체다.
거기에는 바인딩(`data-imory-bind`) · 반복(`data-imory-repeat`) · 보호 구역
(`data-imory-region`) · Direct Edit 식별자(`data-imory-edit-id`)가 전부 달려
있고, 공개 렌더러 · sandbox 프레임 · Studio Preview · Element Inspector · AI
가 모두 그 트리 하나를 본다.

SkinPackage 에 별도의 layout 트리를 새로 두면

- 같은 구조가 두 벌이 되고, 둘이 어긋나는 순간 **어느 쪽이 화면인지 파일만
  보고는 알 수 없다**,
- 기존 스킨 전부가 마이그레이션 대상이 된다(요구사항 14절이 금지하는 것),
- Inspector · AI · sandbox 페이로드 · Import/Export 가 전부 두 벌을 다뤄야
  한다.

**그래서 layout primitive 는 그 트리 위의 주석 층이다.**

| 개념 모델 | 이 저장소에서 |
| --- | --- |
| `type: "panel"` | `data-imory-layout="panel"` 을 단 요소 |
| `children` | 그 요소의 DOM 자식 |
| `layout: {...}` | `data-imory-layout-*` 속성들 |
| 자식의 `columnSpan` / `position` | `data-imory-item-*` 속성들 |
| sidebar 의 `sidebar` / `main` | `data-imory-slot` |

```html
<!-- { type:"panel", layout:{ type:"stack", direction:"column", gap:16 } } -->
<div data-imory-layout="stack"
     data-imory-layout-direction="column"
     data-imory-layout-gap="16">
```

결과: **SkinPackage 에 새 최상위 필드가 없다.** Import/Export/normalize/
sandbox 페이로드가 한 줄도 바뀌지 않는다 — 배치는 HTML 안에 있고, HTML 은
이미 그 경로들을 지나간다.

### structure 와 style 의 분리

primitive 는 **"어떻게 배치되는가"만** 책임진다.

- structure: 요소 순서 · 부모/자식 · layout type · 간격 · 열 수 · 좌표
- style: 색 · 테두리 · 둥글기 · 글꼴 · 그림자 — 스킨 CSS 와 Direct Edit 의
  스타일 컨트롤이 그대로 갖는다

`skin/skin-layout.css` 에 색·그림자·글꼴 선언이 **한 줄도 없다**는 것을 단위
테스트가 파일을 읽어 확인한다.

---

## 2. 왜 값이 CSS 로 바로 가지 않는가

두 단계를 거친다.

```
HTML 속성 (사용자/AI 가 쓴 데이터)
  -> skin-layout.js 가 enum/정수/비율로 정규화      <- 유일한 관문
  -> CSS custom property (CSSOM 쓰기)
  -> skin-layout.css 가 읽어 실제로 배치
```

속성 값이 CSS 문자열에 **그대로 꽂히는 일이 없다**. 정규화를 통과하지 못한
값은 저장 경계에서 이미 사라졌고, 통과한 값은 우리가 만든 정수·enum·비율
뿐이다.

### 왜 `style` 속성이 아니라 CSSOM 인가

- `style` 속성은 sanitizer 가 전면 금지한다(`SKIN_SANITIZE_DENY_ATTRS`).
- sandbox 프레임의 CSP 에는 `style-src 'unsafe-inline'` 이 없다.
- 반면 `element.style.setProperty()` 같은 **CSSOM 쓰기는 CSP 가 막지
  않는다**(2026-09-15 실측, `skin/skin-render.js` styleNonce 주석).

그래서 컴파일러(`compileSkinLayoutTree`)는 렌더가 끝난 DOM 위에서 custom
property 만 써 넣는다. 저장되는 HTML 에는 언제나 **속성만** 남는다.

### 컴파일 시점

`renderSkin()` 의 `mount()` 맨 끝, `walkSkinTree()` **뒤**다. 반복
(`data-imory-repeat`)은 clone 을 만들어 넣으므로, walk 전에 컴파일하면
반복으로 생긴 항목이 자기 자리 값을 받지 못한다(격자 안에서 반복되는 카드가
전부 span 없이 그려지는 식).

공개 HOME/CATEGORY/POST · sandbox 프레임 · Studio Preview 가 전부
`renderSkin()` 하나를 지나므로, 진입점은 **한 곳**이다.

---

## 3. 계약

### 3-1. 컨테이너

`data-imory-layout` = `panel` | `stack` | `grid` | `free` | `sidebar`

| 파라미터 (`data-imory-layout-…`) | type | 값 | 기본 |
| --- | --- | --- | --- |
| `direction` | stack | `column` `row` | `column` |
| `gap` | stack grid sidebar | 0–160 | 16 (sidebar 24) |
| `row-gap` | grid | 0–160 | `gap` |
| `align` | 전부 | `start` `center` `end` `stretch` `baseline` | `stretch` |
| `justify` | stack | `start` `center` `end` `between` `around` | `start` |
| `wrap` | stack | `wrap` `nowrap` | `wrap` |
| `columns` | grid | 1–12 | 2 |
| `columns-tablet` | grid | 1–12 | `min(columns, 3)` |
| `columns-mobile` | grid | 1–12 | `min(columns, 2)` |
| `min` | grid | 40–800 | 없음 |
| `height` | free | 0–2000 | 320 |
| `side` | sidebar | `left` `right` | `left` |
| `sidebar-width` | sidebar | 60–600 | 220 |
| `collapse` | sidebar | `480` `600` `720` `900` | 720 |
| `mobile` | sidebar | `stack` `hide` | `stack` |
| `max-width` | 전부 | 0–2000 | 없음 |
| `min-height` | 전부 | 0–2000 | 0 |
| `overflow` | 전부 | `visible` `hidden` `auto` | `visible` |

### 3-2. 자식

| 속성 | 부모 type | 값 |
| --- | --- | --- |
| `data-imory-item-span` | grid | 1–12 |
| `data-imory-item-row-span` | grid | 1–6 |
| `data-imory-item-x` | free | 0–1 비율(소수 4자리) |
| `data-imory-item-y` | free | 0–1 비율 |
| `data-imory-item-width` | free | 5–100 (%) |
| `data-imory-item-height` | free | 0–100 (%, 0 = auto) |
| `data-imory-item-z` | free | 0–99 |
| `data-imory-slot` | sidebar | `sidebar` `main` |

### 3-3. 모르는 값은 조용히 사라진다

저장 경계(`sanitizeSkinHTML`)에서 범위를 벗어난 값·모르는 파라미터·모르는
type 은 **속성만** 제거된다. 요소와 내용은 그대로 남으므로, 그 요소는 배치
선언이 없는 평범한 요소가 되어 legacy 스킨과 똑같이 그려진다 — 배치 하나가
빠질 뿐 화면이 깨지지 않는다.

`data-imory-region` / `data-imory-edit-id` 와 같은 규칙이다.

---

## 4. 다섯 primitive

### PANEL — 담기만 한다

`display: block` 이고 그 외에는 아무 것도 하지 않는다. 그룹의 기본 단위이고,
`max-width` 를 주면 가운데로 모인다. 안에 다시 stack/grid/free/sidebar 를 둔다.

> **폭 규칙의 함정(2026-09-18 실측).**
> `[data-imory-layout] { max-width: … }` (0,1,0) 은 플랫폼 폭 계약
> `.imory-skin-root :where(*):not(table)… { max-width: 100% }` 를 이기지
> 못한다 — `:not()` 안의 타입 선택자 때문에 그쪽이 (0,1,1)이다. 그래서
> panel 의 최대 폭은 속성 **둘**짜리 선택자(0,2,0)로 쓰고, 그 순간 사라지는
> "부모보다 넓어질 수 없다"는 보장을 `min(…, 100%)` 로 다시 건다.

### STACK — 한 방향으로 순서대로

`display: flex` + `flex-direction`. 자식에 `min-width: 0` 을 걸어 긴 제목
하나가 가로 스크롤을 만들지 못하게 한다.

**순서 변경은 DOM 순서를 바꾸는 것이다.** CSS `order` 를 쓰지 않는다 — order
는 화면 순서만 바꾸고 읽는 순서·키보드 순서·다음 사람이 HTML 을 읽었을 때의
순서는 그대로라 둘이 갈라진다. 배치 파라미터는 부모에 있으므로, 자식을 옮겨도
간격·정렬은 그대로다.

### GRID — 정해진 칸에

`display: grid`, 트랙은 **언제나** `minmax(0, 1fr)` — 항목이 트랙을 밀어낼 수
없다. 열 수는 breakpoint 마다 JS 가 **확정해서** 넘긴다(`repeat()` 의 반복
횟수는 정수여야 해서 CSS 안에서 `min(var(--cols), 2)` 같은 계산이 불가능하다).

`min` 을 주면 열 수를 **폭이 정한다**(`repeat(auto-fit, minmax(min(<min>px,
100%), 1fr))`). 그때 `columns*` 는 무시된다 — 둘 다 뜻을 가지면 어느 쪽이
이기는지 파일만 보고 알 수 없다.

### FREE — 자유 좌표

좌표는 px 가 아니라 **0~1 비율**이다.

```css
left:      calc(var(--imory-it-x) * 100%);      /* 컨테이너 폭의 비율 */
transform: translateX(calc(var(--imory-it-x) * -100%));  /* 자기 폭의 비율 */
```

둘을 더하면 `x * (컨테이너 폭 − 자기 폭)` 이 된다.

- `x=0` → 왼쪽 끝
- `x=0.5` → 가운데
- `x=1` → 오른쪽 끝에 **안쪽으로** 딱 붙음

즉 **어떤 폭에서도 요소가 컨테이너를 벗어날 수 없다.** 요구사항 5·6·13절이
요구하는 clamp 를 런타임 코드 없이 구조로 만족시킨다 — 창을 줄여도 다시 재서
고칠 것이 없다(e2e 가 1100/700/390px 세 폭에서 확인한다).

`anchor + offset` 대신 비율을 고른 이유가 이것이다. anchor 는 offset 이 px 라
좁은 화면에서 다시 넘칠 수 있다.

### SIDEBAR — 보조 영역 + 주요 콘텐츠

`display: grid` + 두 트랙. 본문 트랙이 `minmax(0, 1fr)` 이라 본문이 사이드바를
밀어내지 못한다. 자리는 `data-imory-slot` 이 정하고, `side` 가 어느 열인지를
정한다.

> **`grid-auto-flow: row dense` 인 이유(2026-09-18 실측).**
> 기본(sparse) 자동 배치는 커서가 앞으로만 간다 — 열이 지정된 항목이 앞
> 항목보다 왼쪽 열이면 줄을 하나 내린다. `side="right"` 처럼 사이드바가 2열
> 이고 DOM 에서 먼저 오면, 그 다음 본문(1열)이 2행으로 밀려 전체가 계단처럼
> 내려갔다. dense 는 항목마다 처음부터 빈 칸을 찾으므로 두 슬롯을 DOM 에 어느
> 순서로 적든 같은 그림이 된다.

> **사이드바는 첫 줄에 놓인다.** `grid-row: 1 / -1` 을 쓰지 않는다 — `-1` 은
> **명시 그리드**의 마지막 선인데 여기에는 명시 행이 없어서 실제로는 1행
> 하나만 잡았다(선언만 "늘어난다"고 말하고 있었다). 본문이 여러 덩어리라면
> 그것들을 본문 슬롯 **하나** 안에 stack 으로 묶는 것이 이 primitive 의
> 쓰임이고, 감사가 그때 한 줄로 알려 준다.

접히면 `display: flex; flex-direction: column` 이 되고 `order` 로 **CONTENT 가
위**에 온다. `mobile="hide"` 면 사이드바가 사라진다. 모바일 drawer 는 이번
라운드 범위 밖이다(§10).

### 중첩

전부 서로 중첩된다. e2e 가 실제로 그려서 확인하는 조합:

```
panel > sidebar > (stack | grid)
panel > free   > stack
grid  > repeat(글 목록)
```

---

## 5. 모바일 안전 (요구사항 13절)

"런타임에 재어 보고 고친다"가 아니라 **구조적으로** 넘치지 않게 만든다.

| primitive | 어떻게 |
| --- | --- |
| stack | 기본이 `wrap`, 자식에 `min-width: 0` |
| grid | 트랙이 `minmax(0, 1fr)`; 900px/600px 에서 열이 준다; **span 이 남은 열 수보다 크면 그 줄 전체를 쓴다**(그대로 두면 암시적 열이 생겨 넘친다) |
| free | 좌표가 비율이라 이미 clamp 되어 있다 |
| sidebar | collapse 아래에서 한 줄 세로 |
| panel | `max-width` 가 `min(…, 100%)` |

390px 에서 `document.documentElement.scrollWidth <= clientWidth` 와 "가장
오른쪽 요소의 right 가 화면 안"을 e2e 가 잰다.

---

## 6. 직접 편집 (Direct Edit)

> **변경됨 → [IMORY_DIRECT_UX_DESIGN.md](./IMORY_DIRECT_UX_DESIGN.md) §7 · §10 (DIRECT-UX-1).** 아래 배치 폼(배치 방식 · 열 수 · 간격 · 좌표 숫자 …)은 **일반 Select 패널에서 걷었다** — 값은 지우지 않고(모든 확정이 속성 하나만 바꾼다) 배치는 AI · Code 로 고친다. 폼과 확정 함수는 그대로 있고 개발/테스트 스위치 `window.IMORY_STUDIO_ADVANCED_INSPECTOR = true` 에서만 그려진다(`studio-layout-e2e-test.mjs` 가 켠다). 자유 배치 요소는 이제 ✥ 손잡이뿐 아니라 **본체를 끌어도** 같은 엔진으로 움직이고, 형제 순서 · 겹침 순서는 Quick Bar 의 앞으로/뒤로다. 끄는 동안의 임시 미리보기가 프레임에 닿지 않던 버그(editId · layoutPosition 누락)도 그 라운드에서 고쳤다.

[studio/inspector/studio-inspector-layout.js](./studio/inspector/studio-inspector-layout.js)

사용자 UI 에는 primitive 이름을 그대로 노출하지 않는다.

| 화면 문구 | 내부 |
| --- | --- |
| 세로 | `stack` + `direction=column` |
| 가로 | `stack` + `direction=row` |
| 격자 | `grid` |
| 자유 배치 | `free` |
| 사이드바 | `sidebar` |
| 그룹 | `panel` |
| 없음 | 속성 제거 |

Inspector capability 세 개가 늘었다(`describeInspectorElement`).

- `layout` — 자식이 있는 컨테이너. 배치는 "무엇을 어떻게 담는가"라 담을 것이
  없으면 뜻이 없다.
- `layoutItem` — 부모가 실제로 배치를 선언했고 그 배치에 자식별 파라미터가
  있을 때(격자의 칸 · 자유 배치의 좌표 · 사이드바의 영역).
- `reorder` — 형제가 둘 이상이고 부모가 순서를 읽는 배치일 때. free 는
  제외다 — 거기서는 순서가 아니라 좌표가 자리를 정한다.

보호 구역(post-body) 안에서는 전부 닫힌다. sandbox 스킨에서는 직접 편집 자체가
잠겨 있으므로(기존 계약) 배치도 잠긴다.

**드래그의 의미는 배치에 따라 다르다**(요구사항 10절).

- stack / grid / panel 자식 → 순서 변경 (팝오버의 `순서` ↑↓)
- free 자식 → 좌표 변경 (선택 테두리에 붙는 이동 손잡이 `✥`)

배치 종류를 바꿀 때는 **이전 종류에서만 뜻이 있던 파라미터를 걷어낸다**.
남겨 두면 파일에는 값이 있는데 화면에서는 아무 일도 안 일어나고, 다시 원래
종류로 돌렸을 때 지웠다고 생각한 값이 되살아난다. grid/free 를 떠날 때는
자식의 자리 속성도 함께 걷는다.

모든 확정은 기존 `applyStudioInspectorPatch()` 하나를 지난다 — 실패하면
working draft 는 한 글자도 바뀌지 않고, 성공하면 Undo 한 칸이 생긴다.

### 자유 배치 드래그의 계산

```
실제 left = x * (부모 안쪽 폭 − 내 폭)
=> dx(비율) = dx(화면 px) / scale / (부모 안쪽 폭 − 내 폭)
```

`scale` 은 Mobile Preview 의 축소·AI 패널 여닫기·창 크기 변경이 이미 반영된
값이다(`studioInspectorMapRectRaw`). 부모의 안쪽 **높이**가 필요해서
`preview-bridge.js` 의 `inspectorMetricsOf()` 에 `parentHeight` 를 더했다.

끄는 내내는 프레임 안 임시 미리보기만 바꾸고(저장 안 됨), 손을 떼는 순간 두
축을 **한 번의 편집**으로 확정한다 — 따로 확정하면 Undo 가 두 칸이 되고 가운데
상태가 저장에 남는다. 임시 미리보기는 확정될 값 그대로를
`--imory-it-x` / `--imory-it-y` 에 써 넣으므로, 끄는 동안 보이는 자리와 확정 뒤
다시 그려진 자리가 **같은 계산**에서 나온다.

---

## 7. AI (Skin Studio)

시스템 프롬프트에 primitive 절이 생겼다. 요점 셋.

1. **배치 요청은 primitive 변경으로 해석한다.**
   "순서 바꿔줘" → 형제 순서 이동, "네 개를 2열로" → `grid columns=2`,
   "메뉴는 왼쪽" → `sidebar side=left`, "오른쪽 위로 자유롭게" → 부모를 `free`
   로 바꾸고 그 자식에 `x=1 y=0`, "셋을 묶어줘" → 배치를 단 요소로 감싸기.
2. **이 다섯으로 표현되는 배치에 새 CSS 를 쓰지 않는다.** 미디어 쿼리 ·
   `position: absolute` · float · 음수 마진으로 같은 것을 재현하지 않는다 —
   반응형은 플랫폼 스타일시트가 이미 처리한다.
3. **범위**(요구사항 12절). 사용자가 컨테이너 하나를 고르고 "3열로"라고 하면
   그 요소의 배치 속성만 고친다. 페이지 전체를 다시 쓰지 않는다.

`selectionContext` 의 capability 허용 목록에도 `layout` / `layoutItem` /
`reorder` 를 더했다 — 없으면 배치를 고칠 수 있는 요소를 고른 채 보낸 요청이
서버 검증에서 통째로 거부된다.

단위 테스트가 프롬프트 원문을 읽어 다섯 primitive 이름과 "좌표는 비율"이라는
문장, capability 세 개가 실제로 들어 있는지 확인한다.

---

## 8. 기존 스킨 호환 (요구사항 14절)

**강제 마이그레이션이 없다.** 자동 변환도 하지 않는다.

- `data-imory-layout` 이 없는 요소에는 `skin-layout.css` 의 어떤 선택자도
  닿지 않는다.
- 컴파일러는 배치를 선언한 요소와 그 자식만 만진다 — 배치가 없는 스킨에서는
  **`style` 속성조차 생기지 않는다**. e2e 가 그것을 직접 확인한다(기존
  "폴더 유무에 innerHTML 동일" 회귀와 sandbox 의 native/frame outerHTML 대조가
  성립하는 이유).
- SkinPackage 에 새 필드가 없으므로 Import/Export/normalize 가 무변경이다.

새로 만들거나 고치는 스킨부터 점진적으로 쓰면 된다.

---

## 9. 감사(audit) — 거부가 아니라 경고

`auditSkinLayoutDocument()` 가 Import/Save 경고 목록에 실린다
(`skin/skin-template.js` `auditSkinPackageMaterials`). "저장은 되지만 화면에서
조용히 이상해지는" 조합만 짚는다.

- 그 배치에 뜻이 없는 파라미터(격자에 `direction` 등)
- `data-imory-slot="sidebar"` 인 자식이 없는 사이드바
- 본문 덩어리가 여럿인 사이드바(사이드바가 첫 줄에만 걸린다)
- 좌표가 하나도 없는 자유 배치(전부 같은 자리에 겹친다)

---

## 10. 남은 차이 (이번 라운드에서 하지 않은 것)

요구사항 16절이 제외한 것에 더해, 실제로 남은 것을 적는다.

- **모바일 drawer** — `mobile="hide"` 는 사이드바를 감추기만 하고, 버튼으로
  여는 UI 는 없다. 요구사항 7절이 "완전한 interaction 까지 필요 없다"고
  명시했다.
- **`rotation`** — 속성 자리를 잡아 두지 않았다. `data-imory-item-rotate` 를
  규칙표에 한 줄 더하고 CSS 의 `transform` 에 합치면 되지만, 지금
  `transform` 은 free 좌표가 통째로 쓰고 있어 합성 규칙을 먼저 정해야 한다.
- **자유 배치 요소의 크기 조절(resize)** — 요구사항 5절이 필수가 아니라고
  했다. 지금은 `width`/`height` 를 팝오버의 숫자 칸으로 바꾼다.
- **여러 요소를 골라 묶기(grouping)** — 다중 선택 변형은 제외 항목이라
  Direct Edit 에 없다. AI 는 templates HTML 을 고쳐서 한다.
- **컨테이너 기준 breakpoint** — grid 와 sidebar 의 접힘은 **뷰포트** 폭을
  본다. 좁은 컬럼 안에 놓인 격자는 화면이 넓으면 여전히 여러 열이다. container
  query 로 바꾸면 해결되지만 `@container` 이름 붙이기와 브라우저 하한을 먼저
  정해야 한다.
- **`sidebar` 의 자동 배치 dense** — 사이드바 안에서 자식의 순서를 바꾸는 것은
  화면에 영향이 없다(자리는 `slot` 과 `side` 가 정한다). Inspector 는 그래도
  ↑↓ 를 보여준다.
- **free 자식과 이미지 자르기의 transform 공존** — 자른 이미지는 래퍼를
  갖는다. 그 래퍼가 free 자식이면 좌표 transform 은 래퍼에, 자르기 변환은 안쪽
  이미지에 걸려 실제로는 겹치지 않지만, 자르지 않은 `<img>` 를 free 자식으로
  직접 두고 별도 transform 을 거는 경우는 확인하지 않았다.

---

## 11. 테스트

| 무엇 | 어떻게 |
| --- | --- |
| 값 규칙 · 정규화 · 컴파일 · 감사 · **두 파일 이름 일치** · AI 프롬프트 | `node skin/skin-layout-test.mjs` |
| 다섯 primitive 의 **실제 좌표** · 중첩 · 반복 · 모바일 · 저장 경계 · legacy 회귀 | `node skin/skin-layout-e2e-test.mjs` (`--browser=webkit`, `--only=<절>`) |
| 손으로 보기 | `skin/skin-layout-render-harness.html` (로컬 정적 서버 필요) |

단위 테스트의 `[stylesheet]` 절이 하는 일을 특히 적어 둔다 — 컴파일러가 쓰는
custom property 이름과 스타일시트가 `var()` 로 읽는 이름을 **두 파일을 실제로
읽어** 양방향으로 대조한다. 이름 하나를 고치고 다른 쪽을 잊으면 배치가 조용히
기본값으로 떨어지는데(오류도 경고도 없다) 그때 여기서 깨진다. breakpoint 숫자와
sidebar 접힘 계단도 같은 방식으로 대조한다.

E2E 는 "class 가 붙었다"가 아니라 `getBoundingClientRect()` 로 **어디에
그려졌는지**를 본다 — 배치는 눈에 보이는 결과가 전부이고, 속성만 확인하면
스타일시트가 통째로 빠져도 통과한다.

화면은 실제 `renderSkin()` 이 그린다. 공개 HOME/CATEGORY/POST · sandbox 프레임 ·
Studio Preview 가 전부 그 함수 하나를 지나므로 네 화면이 같은 계산을 쓴다. 각
화면의 **진입 경로**(라우팅 · 프레임 · Supabase)는 이 파일의 범위가 아니다 —
각 화면의 기존 e2e 가 본다.
