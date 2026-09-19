# IMORY TRANSITION PRIMITIVE — 전환 계약 (TRANSITION-1)

나타나고 사라지는 모든 움직임을 **하나의 primitive** 로 만든다.

    none · fade · slide · scale · fade-slide · fade-scale
    × duration · easing · direction(up/down/left/right)

목표는 LAYOUT-1 과 같다 — **AI 나 기능마다 제각각 animation CSS/JS 를
새로 만들지 않고, 직접 수정과 AI 가 같은 속성을 고치게 하는 것.**

이 문서는 "현재 구현"이다. 아직 없는 것은 §10(남은 차이)에 따로 적는다.

| 무엇 | 어디 |
| --- | --- |
| 계약 · 값 규칙 · 정규화 · 컴파일러 · show/hide 런타임 · 패널 | [skin/skin-transition.js](./skin/skin-transition.js) |
| appear · 클릭 차단 · 가로 넘침(CSS) | [skin/skin-transition.css](./skin/skin-transition.css) |
| 저장 경계 | [skin/skin-sanitize.js](./skin/skin-sanitize.js) |
| 렌더 진입 | [skin/skin-render.js](./skin/skin-render.js) `renderSkin({ transitionAppear })` |
| HOME 복귀 재생 | [posts/view/posts-view-transition.js](./posts/view/posts-view-transition.js) `closePostArea` |
| Bottom Dock 접기 | [skin/skin-bottom-dock-actions.js](./skin/skin-bottom-dock-actions.js) `setSkinDockCollapsed` · `runSkinDockOpenPanel` |
| 직접 편집 | [studio/inspector/studio-inspector-transition.js](./studio/inspector/studio-inspector-transition.js) · Dock 패널 [studio/dock/dock-panel.js](./studio/dock/dock-panel.js) |
| Preview | [studio/preview/preview-bridge.js](./studio/preview/preview-bridge.js) `replayPreviewPageTransition` · `preview:transition-play` |
| AI 지시문 · 응답 스키마 | [functions/api/skin-ai.js](./functions/api/skin-ai.js) |
| 단위 테스트 | `node skin/skin-transition-test.mjs` |
| 렌더 · 공개 화면 E2E | `node skin/skin-transition-e2e-test.mjs` (8966) |
| Studio E2E | `node studio/studio-transition-e2e-test.mjs` (8967) |
| sandbox 프레임 | `node skin/sandbox/skin-sandbox-e2e-test.mjs --only=transition` |
| 예시 스킨 | [skin/test-skins/imory-transitions-v1.json](./skin/test-skins/imory-transitions-v1.json) (빌더 `build-transitions-v1.mjs`) |

---

## 1. 결정 — 새 트리도 새 필드도 만들지 않는다

LAYOUT-1 과 같은 판단이다(그 문서 §1). 전환은 `templates.*.html` 위의
**속성 층**이다.

```html
<main data-imory-transition="fade-slide"
      data-imory-transition-duration="240"
      data-imory-transition-easing="smooth"
      data-imory-transition-direction="up">
```

HTML 이 아닌 설정(Bottom Dock)에서는 **같은 네 칸의 객체**가 된다.

```json
"bottomDock": { "transition": { "type": "fade-slide", "duration": 240, "easing": "smooth", "direction": "up" } }
```

두 모양은 `normalizeSkinTransition()` 하나를 지난다. SkinPackage 에 새
최상위 필드가 없고 `schemaVersion` 도 그대로다.

### 수명(lifecycle)은 합치지 않는다

primitive 가 정하는 것은 **움직임**뿐이다. "언제 나타나는가"는 각 기능이
그대로 갖는다.

| 누가 | 언제 보이고 감추는가 | 움직임 |
| --- | --- | --- |
| 화면 전환 | 기존 SPA 라우터(새 화면을 그린다 / HOME 은 표시 공간을 접는다) | appear |
| 패널 | `data-imory-toggle` 클릭 · dock 의 `open` 항목 | show / hide |
| Bottom Dock | 자기 접기 상태 기계(세션 기억 · trigger aria · `data-imory-dock-state`) | show / hide |
| 플랫폼 코드 일반 | `setSkinTransitionVisible(el, visible)` | show / hide |

---

## 2. 계약

| 속성 (`data-imory-transition…`) | 값 | 기본 |
| --- | --- | --- |
| (type) `data-imory-transition` | `none` `fade` `slide` `scale` `fade-slide` `fade-scale` | 없음 = 움직이지 않음 |
| `-duration` | 정수 ms. 저장 경계에서 **80–1000 으로 자른다** | 200 |
| `-easing` | `ease` `ease-in` `ease-out` `ease-in-out` `linear` `smooth` | `ease` |
| `-direction` | `up` `down` `left` `right` — **나타날 때 움직이는 쪽** | `up` |
| `data-imory-panel` | 이름 `^[a-z][a-z0-9-]{0,31}$` | — |
| `data-imory-toggle` | 같은 이름 | — |

- `smooth` = `cubic-bezier(0.22, 1, 0.36, 1)`. 이름만 저장되고 실제
  곡선은 코드의 표에서 온다 — 임의 `cubic-bezier()` 는 저장될 수 없다.
- 값은 CSS 문자열로 곧장 가지 않는다(LAYOUT-1 §2 와 같은 두 단계):
  속성 → 정규화 → custom property(CSSOM) → 스타일시트.
- **duration 만 LAYOUT-1 과 규칙이 다르다**: 범위 밖이면 버리지 않고
  **자른다**(요구사항 "안전한 범위로 normalize/clamp"). 숫자 모양이
  아니면(`200ms`, `1e3`, `-5`) 버린다.
- 모르는 type/easing/direction 은 저장 경계에서 **그 속성만** 사라진다.
- Import 가 보는 `bottomDock.transition` 은 엄격한 문이다
  (`validateSkinTransitionInput`) — 모르는 값은 거부, duration 은 자른다.
  렌더는 관대한 문(`normalizeSkinTransition`)이다.

### 자세(pose) — 무엇이 어떻게 움직이나

전환은 언제나 **"보이지 않을 때의 자세" ↔ 원래 모습**이다. 원래 모습은
스킨 CSS 가 정한 값이라 적지 않는다(opacity 0.8 인 카드는 0.8 로
돌아온다).

| type | opacity | translate | scale |
| --- | --- | --- | --- |
| fade | 0 | — | — |
| slide | 1 | 12px (direction 반대편) | — |
| scale | 1 | — | 0.92 (direction 반대편 가장자리에서 자란다) |
| fade-slide | 0 | 12px | — |
| fade-scale | 0 | — | 0.92 |

`up` = 아래(+12px)에서 올라온다 · `down` = 위에서 · `left` = 오른쪽에서 ·
`right` = 왼쪽에서. scale 의 origin 은 up→아래 가장자리, down→위,
left→오른쪽, right→왼쪽.

### 왜 `transform` 이 아니라 `translate`/`scale` 속성인가

요구사항은 "slide 는 transform 기반". 개별 변환 속성은 transform 과 같은
합성 단계(레이아웃 없음)이면서 **transform 을 덮어쓰지 않는다**. free
배치(LAYOUT-1)는 자리를 `transform` 으로 잡고 스킨도 hover 에 transform
을 쓴다 — transform 으로 전환하면 그 값이 전환 동안 사라져 요소가
튄다. e2e `[types]` 가 free 자식(`x=1`)이 전환 뒤에도 오른쪽 끝에 붙어
있는지 잰다. 단위 테스트는 스타일시트에 `transform:` 선언이 없음을 본다.

---

## 3. 두 엔진 — 왜 CSS 하나가 아닌가

| | appear | show / hide |
| --- | --- | --- |
| 엔진 | CSS `@keyframes imory-transition-in` | Web Animations(`el.animate`) |
| 언제 | 요소가 **박스를 얻는 순간** | 플랫폼이 부를 때 |
| 이유 | 공개 화면은 떨어진 스크래치에 먼저 그리고 나중에 붙인다(posts-view-transition.js) — "지금 보이게 됐다"를 아는 것은 CSS 뿐이다 | 중간에 방향이 바뀌면 **지금 자리에서** 되돌아가야 한다 |

두 엔진은 같은 정규화 값을 읽는다(appear 는 compile 이 쓴 custom
property, show/hide 는 `buildSkinTransitionKeyframes`). 스킨 CSS 와의
명시도 싸움이 없다: CSS 애니메이션과 WAAPI 는 둘 다 애니메이션
origin 이라 스킨의 평범한 선언보다 우선한다.

### 상태 속성(런타임 전용)

`data-imory-transition-state` = `appear` · `showing` · `shown` · `hiding`
· `hidden`. 저장 경계 규칙표에 없어 HTML 에 들어갈 수 없다.

- `appear` — CSS 애니메이션을 재생할 자리
- `hiding` — `pointer-events: none !important` + `inert`
- `hidden` — `display: none !important` + `hidden` + `inert`
  (`!important` 인 이유: 스코프 클래스 때문에 명시도가 높은 스킨
  `display:flex` 가 브라우저 기본 `[hidden]` 을 이긴다 — dock 이 이미
  한 번 겪은 일)

---

## 4. show / hide 상태 기계

`setSkinTransitionVisible(el, visible, { spec, animate })`

- 요소마다 Web Animation **하나**. 보일 때는 앞으로(`playbackRate 1`),
  감출 때는 뒤로(`-1`). 반대 요청이 중간에 오면 새로 만들지 않고 방향만
  바꾼다 → 튀지 않는다(e2e: 1초 선형 페이드 한가운데서 뒤집어 opacity
  차이 < 0.08).
- **최종 상태 = 마지막 요청.** finish 는 지금 방향의 끝에서만 일어나고
  그 끝이 곧 마지막 요청의 상태다. finish 가 안 오는 경우(요소가
  떨어짐)를 위해 `duration + 120ms` 타이머가 하나 더 있고, 먼저 온 쪽만
  확정한다.
- 이미 그 상태면 아무것도 하지 않는다(보이는 요소를 다시 "보이게"
  하면서 자세로 튀지 않는다).
- **감추기가 시작되는 순간** `inert` + `hiding` — 사라지는 중인 요소가
  클릭을 가로채지 않는다. 끝나면 `hidden`.
- `prefers-reduced-motion` · type `none` · `animate:false` · WAAPI 없음
  → 기다리지 않고 즉시.

`playSkinTransitionEnter(el)` / `replaySkinTransitionAppear(root)` 는 이미
보이는 요소의 들어오기를 한 번 더 재생한다(HOME 복귀, Studio 미리
보기). 닫힌 패널 안쪽은 건너뛴다.

---

## 5. 화면 전환 (HOME / CATEGORY / POST / …)

**템플릿 맨 바깥 요소에 전환을 달면 그 화면으로 올 때마다 들어온다.**
새 규칙이 아니라 appear 그 자체다.

- CATEGORY · POST · BANNER · FOLDER · HIGHLIGHTS: 새로 그려져 붙는 순간
  CSS appear 가 재생된다(직접 접속 · 뒤로가기 포함).
- HOME 복귀: HOME 은 다시 그려지지 않는다(표시 공간만 접는다). 그래서
  `closePostArea()` 가 **다른 화면에서 돌아올 때만**
  `replaySkinTransitionAppear()` 를 부른다 — 첫 로드에서 부르면 막
  시작된 CSS appear 를 끊는다(실측: 첫 로드에도 closePostArea 가 돈다).
  "돌아오는가"는 그 순간 `#postArea` 가 보이는가로 가른다.
- sandbox 스킨: 화면마다 프레임이 새로 떠서 프레임 안에서 저절로
  재생된다(부모는 프레임 안에 닿지 않는다).
- **들어오기만 있다.** 옛 화면의 나가기 애니메이션은 없다 — §10.
- 라우팅 · 늦은 응답 · 스크롤 정책은 한 줄도 바뀌지 않는다. 움직임은
  새 화면이 이미 붙은 **뒤**의 일이다.

### 가로 넘침 0

left/right 로 미끄러지는 요소는 전환 동안 12px 옆에 있다. 폭이 꽉 찬
요소면 그만큼 스크롤 영역이 생겨 좁은 화면이 옆으로 흔들린다. 그런
전환이 있는 **스킨 루트만** `overflow-x: clip` 을 받는다
(`data-imory-transition-clip`, compile 이 찍는다). `clip` 은 스크롤
컨테이너를 만들지 않아 sticky 가 그대로다. e2e 가 t=0 에 멈춰 세워
390/320px 에서 재고, **대조군으로 clip 을 떼면 실제로 넘치는 것**까지
확인한다.

---

## 6. Bottom Dock

- `bottomDock.transition` 은 §2 의 객체다. 옛 문자열(`"fade"`)도 그대로
  받는다(그 type + 기본값). 정규화 결과는 언제나 객체다.
- 접기/펴기 움직임은 `setSkinTransitionVisible(itemsEl, …, { spec })` —
  dock CSS 의 전환 규칙과 220ms 타이머는 걷었다. **상태**(접힘 ·
  trigger aria · `data-imory-dock-state` · 세션 기억)는 dock 것 그대로다.
- dock 루트의 `data-imory-dock-transition` 과 Context `dock.transition`
  에는 **종류 이름만** 나간다(스킨 CSS 가 읽는 옛 계약).
- 옆으로 접히는 dock 루트도 가로 자르기를 받는다.
- dock template 안의 `data-imory-panel="<이름>"` 은 `open` 항목이 전환과
  함께 연다(스킨 안 토글과 **같은 함수** `setSkinPanelOpen`).
  `data-imory-dock-open` 도 그대로 찍혀 CSS 로 여는 옛 스킨이 동작한다.

---

## 7. 패널 (일반 UI 의 열고 닫기)

스킨은 JS 를 쓰지 않는다. 버튼에 `data-imory-toggle="menu"`, 덩어리에
`data-imory-panel="menu"`.

- 패널은 **닫힌 채로** 시작한다.
- 클릭은 스킨 루트 하나에 위임하고, 버튼이 속한 **가장 가까운 스킨
  루트** 안의 패널만 연다 — bottom-dock region 처럼 루트 안에 루트가
  있어도 같은 클릭을 두 번 처리하지 않는다.
- `<a>`/`<button>` 이 아니면 `role="button"` · `tabindex="0"` 을 얹고
  Enter/Space 를 받는다. `aria-expanded` 를 맞춘다.
- 링크에 단 토글은 페이지를 옮기지 않는다(`preventDefault` — 공개
  화면의 skin-link-nav 도, Preview 의 링크 가로채기도 존중한다).
- sandbox 프레임 안에서도 **저자 JS 없이** 동작한다(플랫폼 스크립트).

---

## 8. 직접 편집 (Direct Edit)

> **변경됨 → [IMORY_DIRECT_UX_DESIGN.md](./IMORY_DIRECT_UX_DESIGN.md) §11 (DIRECT-UX-1).** 아래 전환 폼(효과 · 속도 · 방향 · 움직임)은 **일반 Select 패널에서 걷었다.** 효과가 있는 요소에는 "움직임 효과 적용됨 [미리보기]" 한 줄만 보이고, 값은 그대로 보존된다. 효과를 더하거나 바꾸는 것은 AI · Code 다. 폼은 개발/테스트 스위치 `window.IMORY_STUDIO_ADVANCED_INSPECTOR = true` 에서만 그려진다(`studio-transition-e2e-test.mjs` 가 켠다).

[studio/inspector/studio-inspector-transition.js](./studio/inspector/studio-inspector-transition.js)

capability `transition` — 보호 구역(post-body) 밖이면 어떤 요소든.
배치 폼 바로 다음에 **전환 효과** 칸이 나온다.

| 칸 | 값 |
| --- | --- |
| 전환 효과 | 없음 · 페이드 · 슬라이드 · 확대 · 페이드+슬라이드 · 페이드+확대 |
| 속도 | 빠르게(140) · 보통(기본) · 느리게(360) · 아주 느리게(600) (+ 지금 값이 이 넷이 아니면 그 값) |
| 방향 | 방향이 뜻을 갖는 효과에서만 |
| 움직임 | 기본 · 부드럽게 · 끝을/시작을/양끝을 천천히 · 일정하게 |
| ▶ 미리 보기 | Preview 의 그 요소(반복 clone 포함)를 한 번 재생 |

- "없음"은 속성 넷을 **전부** 걷는다. 방향이 뜻을 잃는 효과(fade)로
  바꾸면 방향을 걷는다 — 배치 종류를 바꿀 때와 같은 판단.
- 확정은 `applyStudioInspectorPatch()` 하나 — Undo 한 칸.
- Preview 는 편집마다 다시 그리므로 appear 를 끈다
  (`renderSkin({ transitionAppear:false })`). 대신 **값을 바꾸면 한 번**,
  그리고 **보고 있는 화면이 바뀔 때** 재생한다.
- Dock 패널의 전환도 같은 네 칸이다(속도 · 움직임 · 방향 추가).
- sandbox 스킨은 직접 편집 자체가 잠겨 있다(기존 계약) — AI 와 Code
  Editor 로 고친다.

---

## 9. AI

시스템 프롬프트에 **Transition primitives** 절이 생겼다.

| 요청 | 처리 |
| --- | --- |
| "페이드되게" | `data-imory-transition="fade"` |
| "아래에서 살짝 올라오게" | `fade-slide` + `direction="up"` |
| "독 펼칠 때 더 부드럽게" | `bottomDock.transition` 의 type 유지 · duration 320–400 · easing `smooth` |
| "애니메이션 없애줘" | 속성 제거(dock 은 `type:"none"`) + 같은 일을 하던 옛 @keyframes/animation CSS 제거 |

- `@keyframes` · `animation:` · `transition: opacity/transform` 으로 나타나기를
  만들지 말라고 명시한다. hover/focus 효과는 여전히 CSS 다.
- 선택 요소 모드: capability 허용 목록에 `transition` 을 더했다(없으면
  거의 모든 선택 요청이 서버 검증에서 거부된다 — fail closed).
- 응답 스키마의 `bottomDock.transition` 은 네 칸 required 객체다.
  서버는 칸 단위로 걸러 받는다(`sanitizeSkinAiTransition`): 모르는
  칸은 현재 값, duration 은 자른다.
- 값 목록은 Pages Function 에 **옮겨 적었다**(브라우저 전역을 못 쓴다).
  단위 테스트가 두 파일을 읽어 같은지 대조한다.

---

## 10. 남은 차이 (이번 라운드에서 하지 않은 것)

요구사항이 제외한 것: scroll animation · parallax · spring/physics ·
keyframe editor · shared element transition · particles · floating window.

실제로 남은 것:

- **화면 전환은 들어오기만 있다.** 옛 화면을 붙잡아 두고 나가기를
  재생하려면 라우터의 "늦은 응답은 버린다 / 이전 화면을 유지한다"
  계약과 얽힌다(두 화면이 동시에 있어야 한다 — shared element 쪽 일).
- **appear 는 박스가 새로 생길 때마다 재생된다.** 스킨 CSS 가
  `display:none → block` 으로 여는 요소, auto 자리 판정으로 fixed ↔
  흐름 자리를 옮겨 가는 dock 안의 요소는 그때마다 다시 들어온다.
- **스킨이 같은 요소에 자기 `animation` 을 쓰면 그쪽이 이긴다**(스킨
  스타일시트가 뒤에 붙는다). 감사가 잡지 못한다.
- **거리 · 확대 비율 · 순차(stagger)** 파라미터가 없다(12px / 0.92 고정).
- **패널을 열린 채로 시작**하는 선언이 없다. 스킨 안 토글이 다른 스킨
  루트(fixed dock)의 패널을 열 수 없다.
- 저자 JS(sandbox)에 `imorySkin.show/hide` 같은 API 를 열지 않았다 —
  `data-imory-toggle` 로 된다.
- Studio "▶ 미리 보기"는 native Preview 에만 닿는다(sandbox Preview 는
  직접 편집이 잠겨 있다).
- 오래된 엔진: `translate`/`scale` 속성이 없으면(Chrome <104, Safari
  <14.1) 움직임 없이 페이드만, `overflow-x: clip` 이 없으면(Safari <16)
  옆으로 미끄러지는 동안 잠깐 가로 넘침이 생길 수 있다.

---

## 11. 테스트 · 완료 기준 기록 (2026-09-19)

| 무엇 | 결과 |
| --- | --- |
| `node skin/skin-transition-test.mjs` — 값 규칙 · 자르기 · 24 조합 자세 · 키프레임 · **CSS↔JS 이름 양방향 대조** · 서버 값 목록 대조 · 프롬프트 · dock 정규화 · 진입 문서/sandbox allowlist · 예시 스킨 | 231/231 |
| `skin-transition-e2e-test.mjs` chromium / webkit — [types][showhide][rapid][reduced][mobile][sanitize][legacy] + 실제 index.html [routes][dock][routes-reduced][routes-mobile] | 134/134 · 134/134 |
| `studio-transition-e2e-test.mjs` chromium / webkit | 34/34 · 34/34 |
| sandbox `--only=transition` | 9/9 |

회귀(전부 이 브랜치에서): Bottom Dock 단위 66 · 공개 E2E 69 · Dock 패널 43 ·
LAYOUT 단위 55 · 렌더 E2E 61 · Studio 배치 50 · Direct Edit 37 · 공개 프레임 64 ·
배너 248 · WRITE/관리 155 · 폴더 트리 71 · 재료 일치 58 · 파일 UX 42 ·
AI 패널 142 · sandbox 단위 262 · sandbox E2E 559 · Studio sandbox Preview 165 ·
Inspector(`mode`~`ai` 29 · `mobile` 2 · `identity` 12 · `narrow` 8) ·
선택 요소 AI(`codes` 7, 나머지 101).

이 라운드 이전부터 실패하던 것(기준 커밋에서 같은 결과를 확인):

- `studio-inspector-e2e-test.mjs` 의 `route` 절 — origin/main `d34e8f6` 에서도
  같은 자리(runRoute, Preview 링크 이동 대기)에서 멈춘다.
- `studio-selected-ai-e2e-test.mjs` 의 `repeat` 절 H1 — 선택이 1ms 만에
  풀리는 경쟁이 기준 커밋에도 있다(같은 메시지 순서를 기록해 확인).
  기준 · 이 브랜치 모두 3번 중 1번만 통과한다.

**실제 DB 검증 · 배포 확인 · 실기기 확인은 하지 않았다.** migration 이
필요 없다(`bottomDock.transition` 은 기존 `skin_versions.content` JSON
안의 값이고, 나머지는 HTML 속성이다).
