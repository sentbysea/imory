# IMORY SIDES — HOME 좌우 영역 (EDITORIAL-RESPONSIVE-HOME-1)

잡지 표지형 반응형 HOME 의 바탕. 좌우 영역은 편집면도 별도 페이지도 아닌
**웹사이트의 사이드 영역**이다.

| 화면 | 좌우 영역 |
| --- | --- |
| 데스크톱(폭이 충분) | 본문 옆에 처음부터 보이는 칼럼 |
| 모바일(폭이 부족) | 평소엔 숨었다가 상단 버튼으로 좌/우에서 나오는 오프캔버스 패널 |

이 문서는 "현재 구현" · "앞으로 지킬 원칙" · "남은 차이"(§14)를 나눠 적는다.

| 무엇 | 어디 |
| --- | --- |
| 설정 읽기/쓰기 · 저장 경계 값 표 · 런타임(칼럼/패널 · 포커스 · 스크롤 잠금) | [skin/skin-sides.js](./skin/skin-sides.js) |
| 자리 CSS(구조는 `!important`, 보기는 명시도 0) | [skin/skin-sides.css](./skin/skin-sides.css) |
| 렌더 진입 | [skin/skin-render.js](./skin/skin-render.js) `renderSkin()` · [skin/skin-template.js](./skin/skin-template.js) `resolveSkinTemplate()` |
| sandbox 봉투 · 메시지 | [skin/sandbox/skin-sandbox-protocol.js](./skin/sandbox/skin-sandbox-protocol.js) `SIDES_*` · [skin-sandbox-host.js](./skin/sandbox/skin-sandbox-host.js) · [skin-sandbox-frame.js](./skin/sandbox/skin-sandbox-frame.js) |
| Studio 단 구성 패널 | [studio/sides/sides-panel.js](./studio/sides/sides-panel.js) · `getStudioHomeSides` / `setStudioHomeSides`([studio/studio-preview.js](./studio/studio-preview.js)) |
| AI 지시문 | [functions/api/skin-ai.js](./functions/api/skin-ai.js) "Side areas" 절 |
| 예시 스킨(잡지 표지형) | [skin/test-skins/build-editorial-home-v1.mjs](./skin/test-skins/build-editorial-home-v1.mjs) → `imory-editorial-home-v1.json` |
| 단위 테스트 | `node skin/skin-sides-test.mjs` |
| 렌더 E2E(하네스) | `node skin/skin-sides-e2e-test.mjs` (8976) · [skin/skin-sides-render-harness.html](./skin/skin-sides-render-harness.html) |
| 공개 화면 E2E | `node skin/sandbox/skin-sandbox-e2e-test.mjs --only=sides` (8957+8958) |
| Studio E2E | `node studio/studio-sides-e2e-test.mjs` (8977) · `node studio/studio-sandbox-preview-e2e-test.mjs --only=sides` (8959+8960) |

---

## 1. 기존 구조 조사 (2026-09-19)

| 물음 | 실제 |
| --- | --- |
| `templates.home` | `{ html, css? }`. 렌더 재료는 `resolveSkinTemplate()` 이 고른 한 장 `{ html, css, js }` 이고, 공개 다섯 화면 · Studio Preview · sandbox 봉투가 전부 이 객체를 들고 다닌다. |
| `css` | 공용 한 벌. 렌더 때마다 `validateAndScopeSkinCss` 가 인스턴스 클래스(`.imory-skin-root-iN`)를 앞에 붙인다. |
| `imageSlots` | `{name,…}[]` → Context `images.<name>`. 비어 있으면 `null`. |
| `regions` | **최상위 배열이지만 지금까지 아무도 읽지 않았다**(생성기가 `[]` 만 채움). 그러나 Import · Export · Save · Publish · AI 응답이 모두 **그대로 통과**시킨다. |
| `data-imory-region` | 이름은 비슷하지만 전혀 다른 것 — **플랫폼이 채우는 자리**(post-body · owner-tools · bottom-dock …)이고 안쪽을 렌더러가 비운다. |
| HOME 데이터 | `site` · `profile` · `navigation.categories[]` · `navigation.highlights` · `home.recentPosts[]` · `home.highlights` · `images.*` (skin/skin-context.js). |
| 렌더 경로 | 공개 HOME: `skin-home.js` → `renderSkin()` 을 `#themeMount` 에. **`#themeMount` 가 스크롤한다**(home-base.css) — 문서가 아니다. sandbox 면 같은 자리에 별도 origin iframe 하나. |
| native ↔ sandbox 차이 | sandbox 프레임은 **콘텐츠 높이만큼 늘어나 있고** 스크롤은 부모가 한다. 프레임 CSP 에는 `style-src 'unsafe-inline'` 이 없다(CSSOM 쓰기는 된다). 프레임 안의 `vh` 는 프레임 높이다. |
| 외부 스킨 JS | sandbox 전용 opt-in(SANDBOX-5A). 기본 스킨이 기댈 수 없다 → **플랫폼 스크립트**로 동작해야 한다. |
| 재사용할 수 있던 것 | LAYOUT-1 `sidebar`(두 칸 · 접히면 세로 · drawer 없음) · TRANSITION-1 `data-imory-panel/toggle`(닫힌 채 시작 · 데스크톱 상시 노출 불가 · 포커스 가두기/스크롤 잠금 없음) · Bottom Dock 의 "설정 ↔ 디자인" 분리 · 렌더 뒤 CSSOM 컴파일 자리 · sanitize 가 기능 파일에 묻는 구조 |

## 2. 결정

### 2-1. 둘로 나눈다 — 설정과 디자인 (Bottom Dock 과 같은 결)

| | 무엇 | 어디 | 누가 |
| --- | --- | --- | --- |
| **설정** | 어느 쪽을 켜는가(1·2·3단) | `SkinPackage.regions` | 블로그 주인(Studio Layout) · 나중의 가입 문답 |
| **디자인** | 영역이 어디 있고 무엇을 어떻게 그리는가 | `templates.*.html` 의 `data-imory-sides*` + 스킨 CSS | 스킨 제작자 · AI |

- **새 최상위 필드를 만들지 않았다.** 이미 모든 경로를 그대로 지나가던
  `regions` 가 요구사항이 말한 자리 그 자체다.
- `data-imory-region` 을 쓰지 않은 이유: 그 속성은 "안쪽을 플랫폼이 채운다"는
  뜻이라 렌더러가 비운다. 좌우 영역의 안쪽은 스킨이 그린다.
- LAYOUT-1 `sidebar` 를 늘리지 않은 이유: 세 칸 · 설정에 따라 켜고 끔 · 패널
  상태 기계 · 포커스/스크롤 제어가 전부 새로 붙어야 하고, "배치만 책임진다"는
  그 primitive 의 경계를 넘는다. 두 계약은 공존한다.
- TRANSITION-1 패널을 쓰지 않은 이유: 닫힌 채 시작해 `display:none` 으로
  감추는 모델이라 "데스크톱에서는 처음부터 보인다"와 맞지 않고, 모달 동작
  (포커스 가두기 · 배경 잠금 · 복원)이 없다.

### 2-2. 새 위젯 시스템을 만들지 않는다

영역 안의 내용은 **기존 Context 바인딩**으로 스킨이 그린다(카테고리 ·
최근 글 · 하이라이트 · 프로필). 데이터 · DB · CATEGORY/POST 는 한 줄도
바뀌지 않았다.

## 3. 계약

### 3-1. 설정 — `regions`

```json
"regions": [
  { "name": "left_sidebar",  "enabled": true },
  { "name": "right_sidebar", "enabled": true }
]
```

| 규칙 | |
| --- | --- |
| 읽는 이름 | `left_sidebar` · `right_sidebar` 둘뿐. 나머지 항목은 읽지 않고 **자리 그대로 보존** |
| 켜짐 | 항목이 있고 `enabled !== false` |
| 같은 이름 둘 | 앞의 것 |
| 영역 항목이 하나도 없음(`[]`) | 설정 없음 = 둘 다 꺼짐. 틀이 없는 기존 스킨은 어차피 아무것도 바뀌지 않는다 |
| 쓰기(`writeSkinSidesSetting`) | 항목을 **지우지 않고** `enabled` 만 바꾼다(항목의 다른 칸도 보존) — 숨겼다 다시 켜도 같은 자리 |
| 1 · 2 · 3단 | `{}` · `{right}` · `{left,right}`. 2단은 오른쪽(요구사항 2절). 왼쪽만 켠 설정은 데이터로는 허용되고 렌더도 되지만 Studio 의 세 선택지에는 없다 |

렌더 재료: `resolveSkinTemplate()` 이 `sides: { left, right }` 를 싣는다 —
**영역 항목이 없는 스킨이면 키 자체를 만들지 않는다**(sandbox 봉투 ·
Preview 메시지가 기존 스킨에서 byte 단위로 같다).

### 3-2. 디자인 — 마크업

```html
<div data-imory-sides="frame">
  <aside data-imory-sides-area="left" aria-label="목차">
    <span data-imory-sides-close aria-label="목차 닫기"></span> …
  </aside>
  <main data-imory-sides-area="main">
    <span data-imory-sides-open="left" aria-label="목차 열기">…</span> …
  </main>
  <aside data-imory-sides-area="right">…</aside>
</div>
```

| 속성 | 값 |
| --- | --- |
| `data-imory-sides` | `frame` |
| `data-imory-sides-area` | `left` `main` `right` — **틀의 직계 자식** |
| `data-imory-sides-open` | `left` `right` — 어디든(보통 main 머리) |
| `data-imory-sides-close` | 빈 값 · `left` · `right` — 영역 안 |

저장 경계(`sanitizeSkinHTML`)는 이 표에 묻는다. 모르는 값은 속성만 사라진다.

### 3-3. 런타임 상태 (저장되지 않는다 — 표에 없어 sanitize 가 지운다)

| 어디 | 속성 | 값 | 스킨 CSS 가 읽어도 되는가 |
| --- | --- | --- | --- |
| 틀 | `data-imory-sides-layout` | `columns` `drawer` | ○ |
| 틀 | `data-imory-sides-on` | `"left right"` · `"right"` · `""` | ○ (`~=`) |
| 틀 | `data-imory-sides-count` | 1 · 2 · 3 | ○ |
| 틀 | `data-imory-sides-active` / `-phase` | 보이는 패널 쪽 / `open` `closing` | ○ |
| 영역 | `data-imory-sides-state` | `off` `column` `closed` `open` `closing` | ○ |
| 영역 | `inert` · `role="dialog"` · `aria-modal` · `id` | 패널일 때 | — |
| 여는 것 | `aria-expanded` · `aria-controls` · (버튼이 아니면) `role="button"` `tabindex="0"` · (이름이 없으면) `aria-label` | | — |
| 틀 안 | `[data-imory-sides-backdrop]` · `[data-imory-sides-probe]` | 덮개 · 폭 탐침 | 덮개만 |

- 스킨이 여는 것/닫기를 **안 그렸으면** 플랫폼이 하나씩 채운다
  (`data-imory-sides-fallback`, 기호 + 접근 이름). 그렸으면 끼어들지 않는다.
- 이름 판정: 글자나 숫자가 없는 버튼(☰ · × 기호만)은 이름이 없는 것으로 본다.

### 3-4. 스킨이 바꾸는 값 (custom property)

| 변수 | 기본 | 뜻 |
| --- | --- | --- |
| `--imory-sides-width` · `-left-width` · `-right-width` | 264px | 칼럼 폭 |
| `--imory-sides-main-min` | 560px | 본문 **최소 가독 폭** — 칼럼/패널 판정의 기준 |
| `--imory-sides-main-max` | 760px | 칼럼일 때 본문 최대 폭 |
| `--imory-sides-drawer-width` | `min(86vw, 340px)` | 모바일 패널 폭 |
| `--imory-sides-distance` | 100% | 등장 거리(24px 로 주면 짧게 미끄러진다) |
| `--imory-sides-duration` · `-easing` | 280ms · `cubic-bezier(.22,1,.36,1)` | 움직임 |
| `--imory-sides-backdrop` | `rgba(24,24,27,.32)` | 덮개 색 |
| `--imory-sides-z` | 1000 | 겹침 순서(dock · 하이라이트 칩 위) |

값은 어떤 CSS 길이든 된다(`clamp()` · `rem` · `%`) — 플랫폼이 **탐침 요소에
실제로 그려서** 잰다. 보기 규칙은 전부 `:where()`(명시도 0)라 스킨의 어떤
선언이든 이긴다. 구조 규칙(fixed · 좌/우 · 보이는 높이 · 닫힘의 hidden)은
`!important` — 데스크톱용 `position: sticky` 한 줄이 모바일 패널을 문서
흐름에 주저앉히지 않게.

## 4. 칼럼인가 패널인가 — 폭 판정

기기 이름이 아니라 폭이다.

```
필요한 폭 = 본문 최소 가독 폭 + 켜진 영역들의 폭
틀 안쪽 폭 ≥ 필요한 폭  → 칼럼
그 밖                  → 패널      (1단은 늘 칼럼 = 본문만)
```

- **560px 을 고른 근거**: 15–16px 본문에서 한 줄 약 32–36 자(한글)와 잡지
  표지의 세로 축(4:5 사진 + 여백)이 찌그러지지 않는 최소 폭. 이보다 좁으면
  칼럼을 두는 대신 본문을 온전히 쓰고 영역을 패널로 뺀다.
- 기본값 경계: 2단 **824px**, 3단 **1088px**. 예시 스킨(칼럼 248px):
  2단 **808px**, 3단 **1056px** — iPad 세로(820)는 2단 칼럼 · 3단 패널,
  1100 이상 데스크톱은 3단 칼럼.
- 판정은 틀의 폭만 보는 **높이 0 인 감지 요소**를 ResizeObserver 로 본다
  (틀을 직접 보면 칼럼↔패널 전환이 틀 높이를 바꿔 "ResizeObserver loop"
  경고가 났다 — WebKit 실측). **첫 두 프레임**(판정이 아직 없을 때 포함)
  의 변화는 곧바로 적용한다 — 공개 HOME 의 `#themeMount` 는 렌더 직후
  한 순간 콘텐츠 폭으로 줄어 있다가 넓어지므로, 미루면 데스크톱 첫 화면에
  패널 배치가 한 프레임 보인다. 그 뒤의 변화(창 크기 · Studio
  Desktop/Mobile)는 다음 프레임에 적용한다 — 콜백 안에서 곧바로 바꾸면
  더 얕은 관찰자(sandbox 프레임의 높이 보고)의 알림이 밀려 경고가 난다.
- 판정 전 한 순간(렌더 직후)에는 좌우 영역을 감춘다 — 모바일 우선.

## 5. 데스크톱 (칼럼)

- 틀이 `display:grid` 이고 세 트랙 `좌 | minmax(0, main-max) | 우`,
  `justify-content:center`. 화면이 넓어져도 본문은 main-max 를 넘지 않고
  세 칸이 가운데에 붙어 한 덩어리로 보인다.
- 꺼진 쪽은 트랙이 0px. 좌우 칸은 `grid-row:1` 에 고정 → 길이가 달라도 같은
  줄에서 시작하고, 긴 쪽이 문서 전체 스크롤을 만든다(칸 안 스크롤 없음).
- 여는 버튼 · 닫기는 칼럼일 때 `display:none`.

## 6. 모바일 (패널)

| 동작 | 구현 |
| --- | --- |
| 자리 | `position:fixed`, 왼쪽은 `left:0`, 오른쪽은 `right:0`, 높이 = 보이는 부분. 본문 폭은 그대로(겹쳐 열린다) |
| 모션 | 기본은 `transform` 전환(거리·속도·easing 변수). 스킨이 transform/opacity/transition 을 무엇으로 바꿔도 된다 — 플랫폼은 **닫히는 움직임이 끝나기를** `transitionend`/`animationend`(없으면 계산된 최장 시간, 1.2s 상한)로 기다린 뒤 `closed` 로 둔다 |
| 열기 | 여는 것 클릭 · Enter/Space(버튼이 아닌 요소). 반대쪽이 열려 있으면 그것을 조용히 닫고 연다 |
| 닫기 | 닫기 버튼 · 덮개(바깥) 클릭 · Escape · 패널 안 링크(이동은 그대로, 패널은 즉시) · 뒤로가기(가로채지 않고 닫기만) · 폭이 넓어져 칼럼이 됨 |
| 포커스 | 열면 패널 안 첫 초점 요소(없으면 패널)로. Tab/Shift+Tab 은 **매번 직접** 패널 안에서 옮긴다(WebKit 은 기본값에서 링크를 Tab 순서에 넣지 않아 "끝에서만 감싸기"로는 새어 나갔다). 닫으면 연 버튼으로 |
| 배경 | 본문 `inert`, 패널 `role=dialog aria-modal`, 닫힌 패널 `inert` + `visibility:hidden` |
| 스크롤 | 틀에서 위로 올라가며 **실제로 스크롤 중인 조상**(공개 HOME 은 `#themeMount`)과 `html` 을 `overflow:hidden`. 위치는 그대로이고 닫을 때 다시 적는다. 사라지는 스크롤바 폭은 padding 으로 메운다(안 메우면 넓어진 폭이 판정을 뒤집어 패널이 스스로 닫힌다). `body` 는 잠그지 않는다 — 높이가 정해진 body(Studio Preview)가 내용을 잘라 위치가 0 으로 밀렸다(실측) |
| 패널 안 긴 내용 | 패널 자체가 `overflow-y:auto` + `overscroll-behavior:contain` |
| 기록 | history 를 만들지 않는다. Studio dirty · Undo 기록에 들지 않는다(화면 상태일 뿐) |
| 다시 그리기 | `renderSkin()` 은 그리기 **전** `disposeSkinSides(container)` 로 옛 틀의 잠금을 풀고, 열려 있던 쪽을 새 틀에서 **움직임 없이 · 포커스를 옮기지 않고** 다시 연다(Studio 가 글자 하나마다 다시 그려도 패널이 닫히지 않고 입력칸을 빼앗지 않는다) |
| reduced motion | 기본 전환 없음, 닫기를 기다리지 않는다 |

## 7. sandbox (공개 · Studio Preview)

프레임은 콘텐츠 높이만큼 늘어나 있어 프레임 안 `fixed` 는 화면이 아니라
**프레임 전체**에 붙는다. 부모만 아는 두 가지를 세 메시지로 주고받는다.

| 메시지 | 방향 | 내용 |
| --- | --- | --- |
| `IMORY_SIDES_STATE` | frame → parent | `{ renderSeq, open }` — 부모가 **자기 쪽** 스크롤을 같은 함수(`lockSkinSidesScroll(iframe)`)로 잠근다 |
| `IMORY_SIDES_VIEWPORT` | parent → frame | `{ renderSeq, top, height }` — 프레임 좌표의 "보이는 부분". 프레임은 `--imory-sides-viewport-top/-height` 로 패널 · 덮개를 거기에 세운다. 창 크기가 바뀌면 다시 |
| `IMORY_SIDES_CLOSE` | parent → frame | `{ renderSeq }` — 프레임 바깥(부모)을 눌렀다 |

- 봉투 `template.sides` 는 `{left:boolean, right:boolean}` 정확히 그 모양만 통과.
- 프레임이 내려가면(화면 전환 · 실패) 부모 잠금은 `destroySandboxSkinFrame`
  에서 반드시 풀린다. 옛 `renderSeq` 의 알림은 버린다.
- Studio sandbox Preview 에서는 부모가 Preview 문서다 — 같은 코드가 그 문서를
  잠근다.

## 8. Studio — HOME 단 구성

- 버튼 **Layout**(Select · Images · Dock 옆 — 같은 왼쪽 패널을 여는 무리.
  좁은 화면에서는 첫 줄이 꽉 차 있어 둘째 줄 ↶ ↷ 다음) → 왼쪽 패널
  "HOME LAYOUT"(좁은 화면은 아래 시트, 내용 보기 단계).
- 세 선택지(1단 · 2단 · 3단, 작은 도식) · radiogroup · 방향키. **고르는
  순간 적용** — Undo 한 칸 · dirty. 되돌리기는 상단 ↶ 하나. 같은 값을 다시
  고르면 아무 일도 없다.
- 틀이 없는 스킨: 세 선택지 잠김 + "좌우 영역을 둘 자리가 없어서 고를 수
  없어요". 한쪽 칸만 그린 스킨: 그 칸까지만.
- 화면에 개발자 낱말(regions · data-imory …)이 없다.
- Inspector 이름: "왼쪽 영역" · "가운데 HOME" · "오른쪽 영역" ·
  "왼쪽/오른쪽 영역 여는 버튼" · "영역 닫기 버튼".
- Preview 안에서 패널이 열려 있을 때의 Escape 는 "패널 닫기"다 — Select 의
  선택 해제로 함께 올려 보내지 않는다(native Preview).
- 모양 · 폭 · 모션은 Code · AI 로 고친다(패널에 칸을 만들지 않았다).

## 9. AI

"Side areas" 절: 틀 · 세 칸 · 여는 것/닫기 계약, **언제 보이는가는 플랫폼**
(미디어 쿼리 · fixed · transform · JS 로 좌우를 감추거나 보이지 말 것),
**모양은 스킨**(변수 목록), 런타임 속성은 HTML 에 쓰지 말 것, "2단으로" ·
"왼쪽 없애줘"는 주인의 설정이지 마크업이 아니다. `regions` 는 AI 가 만들지
않는다(요청의 현재 값을 그대로 돌려준다 — 기존 규칙).

## 10. 예시 스킨 — 잡지 표지형 HOME

`node skin/test-skins/build-editorial-home-v1.mjs`. 특정 레퍼런스의 장식을
옮기지 않고 편집 디자인 문법만 쓴다.

- 가운데 세로축 조판 · 대표 사진(이미지 슬롯 `cover`, 4:5)이 중심 · 그 위
  작은 가운데 제목(가는 포인트 선 둘) · 사진 아래 이탤릭 byline · 알약이
  아닌 글자 카테고리(번호 `01` · 넷 이상이면 두 줄 — 수량 선택자) · 얇은
  선 · 작은 번호/날짜 · 흰 바탕.
- 왼쪽 "Contents"(Home · 카테고리 목차 · 하이라이트 링크), 오른쪽
  "Notes"(프로필 · 최근 글 · 하이라이트 한 장).
- 겹침 없애기: 왼쪽이 **칼럼**으로 보이면 표지 아래 카테고리를 숨기고(모바일
  에서는 표지가 보여 준다), 오른쪽이 켜져 있으면 표지 아래 최근 글을 숨긴다.
- 모바일 패널일 때 머리(여는 버튼 줄)는 위에 붙는다(sticky) — 내려간 뒤에도
  손이 닿는다.
- **빈 홈**: 사진이 없으면 틀도 없고 제목이 커진다(`.ed-photo[hidden] +
  .ed-title`). 글이 없으면 목록 · 카드 · 오른쪽 이름표가 사라져 빈 칸이 여백이
  된다. 가짜 글 · 깨진 이미지 없음.
- **색**: `--skin-background` · `--skin-text` · `--skin-accent` 세 값에서
  `--skin-surface` · `--skin-muted` · `--skin-line` · `--skin-accent-ink` 가
  `color-mix` 로 나온다. 어두운 배경은 세 값만 바꾼다(빌드 스크립트의
  `DARK_PALETTE`). 대비 실측(§13): 글자 ≥7 · 보조 ≥4.5 · 번호 ≥4.5 · 선 ≥1.2.
- **스크롤 원칙**: 첫 화면을 한 폭으로 조판하되 강제하지 않는다. 사진은
  `clamp(220px, 46vh, 560px)` 높이 — 낮은 화면에서도 하한 아래로 줄지 않고
  문서가 스크롤된다. 스크롤바를 숨기지 않는다. `vh` 는 전부 px 상한이 있는
  `clamp()` 안(sandbox 프레임에서 vh = 프레임 높이라 상한이 없으면 서로를
  키운다).
- 미디어 쿼리가 **한 줄도 없다** — 칼럼/패널 전환은 플랫폼 몫이다.

## 11. 가입 문답과의 연결 (이번에 구현하지 않음)

문답 결과가 바꿀 곳은 두 군데뿐이다.

1. 단 구성 → `writeSkinSidesSetting(regions, skinSidesSettingForCount(n))`
2. 색 → 스킨 CSS 첫 규칙의 세 값(`--skin-background/-text/-accent`).
   글자색은 배경 밝기로 정한다(밝으면 짙은 글자).

가입 뒤에는 Studio Layout(1·2·3단)과 Code/AI(색)로 언제든 바꾼다.

## 12. 앞으로의 편집 확장

`regions` 항목은 지우지 않고 보존되므로, 나중에 영역별 설정을 같은 항목에
덧붙일 수 있다(예: `{ "name": "right_sidebar", "enabled": true, "items":
["profile", "recent", "highlight"] }`). 지금 렌더러는 `name`/`enabled` 만
읽고 나머지는 보존만 한다 — 드래그 편집기가 생기면 그 칸을 읽는 곳이 하나
늘 뿐 저장 모양이 바뀌지 않는다.

## 13. 기존 스킨 호환 · 테스트 기록 (2026-09-19)

- 틀(`data-imory-sides="frame"`)이 없으면 `compileSkinSides` 는 아무 요소도
  건드리지 않는다 — 속성 · 요소 · 리스너 · 잠금 0(e2e `[legacy]`).
- `regions: []` 이면 `resolveSkinTemplate` 결과에 `sides` 키가 없다 → sandbox
  봉투가 byte 단위로 같다(단위 `[template]`).
- `skin-sides.css` 는 틀이 없으면 어떤 선택자도 맞지 않는다.

| 무엇 | 결과 |
| --- | --- |
| `node skin/skin-sides-test.mjs` | 55/55 |
| `skin/skin-sides-e2e-test.mjs` chromium / webkit | 216/216 · 216/216 |
| `skin/sandbox/skin-sandbox-e2e-test.mjs --only=sides` chromium / webkit | 22/22 · 22/22 |
| `studio/studio-sides-e2e-test.mjs` chromium / webkit | 40/40 · 40/40 |
| `studio/studio-sandbox-preview-e2e-test.mjs --only=sides` chromium / webkit | 11/11 · 11/11 |

회귀는 커밋 메시지와 CLAUDE.md 표의 각 테스트 행을 본다.

## 14. 남은 차이

- **스킨 CSS 의 `:has()`** — 스코프가 `:has()`/`:not()` 안의 선택자마다 루트
  클래스를 끼워 넣어 `:has(> .x)` 같은 상대 선택자는 영영 맞지 않는다
  (skin/skin-css-validate.js 의 기존 동작). 예시 스킨은 형제 선택자와 수량
  선택자로 우회했다. 스코프를 고치는 것은 별도 작업이다.
- **sandbox 프레임 안의 sticky** — 프레임 문서는 스크롤하지 않으므로 모바일
  머리 sticky 는 sandbox 에서 효과가 없다(내려간 뒤에는 버튼까지 올라가야
  한다). 부모가 보이는 부분을 늘 내려보내면 풀 수 있지만 이번에는 열린
  동안만 보낸다.
- **iOS Safari 실기기** — `html{overflow:hidden}` 잠금 · `overscroll-behavior`
  · 주소창 높이 변화는 Playwright WebKit 으로만 보았다. 실기기 확인 전이다.
- 틀은 화면당 하나를 전제로 한다(둘이면 각각 동작하지만 복원은 첫 틀만).
- 영역 안 **내용 · 순서의 편집 UI** 는 없다(§12). 폭 · 색은 Code/AI 로만.
- 가입 문답 · 기존 스킨 일괄 변환 · CATEGORY/POST 재설계는 범위 밖.
- 예시 스킨의 CATEGORY/POST 는 같은 종이의 최소 짝이다(좌우 영역 없음).
