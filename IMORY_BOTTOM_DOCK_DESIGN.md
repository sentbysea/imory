# Imory Bottom Dock — 기준 문서 (BOTTOM-DOCK-1)

화면 아래에서 주요 기능에 닿는 자리. Imory 의 기본 navigation
primitive 중 하나지만 **모양은 규격화하지 않는다**.

이 문서는 "현재 구현" · "앞으로 지켜야 할 원칙" · "남은 차이"를 구분해
적는다(CLAUDE.md §5).

| 무엇 | 어디 |
| --- | --- |
| 설정 정규화 · Context 조립 · 기본 template (순수 함수) | [skin/skin-bottom-dock.js](./skin/skin-bottom-dock.js) |
| 접기 상태 기계 · 다섯 가지 동작 (DOM) | [skin/skin-bottom-dock-actions.js](./skin/skin-bottom-dock-actions.js) |
| 자리 · 여백 · 수명 (DOM) | [skin/skin-bottom-dock-mount.js](./skin/skin-bottom-dock-mount.js) |
| 자리 계약 CSS (생김새는 한 줄도 없다) | [skin/skin-bottom-dock.css](./skin/skin-bottom-dock.css) |
| Studio 설정 패널 | [studio/dock/dock-panel.js](./studio/dock/dock-panel.js) |
| AI 처리 규칙 | [functions/api/skin-ai.js](./functions/api/skin-ai.js) `buildSkinAiSystemPrompt` / `sanitizeSkinAiBottomDock` |
| 단위 테스트 (브라우저 없이) | `node skin/skin-bottom-dock-test.mjs` |
| 공개 화면 E2E | `node skin/skin-bottom-dock-e2e-test.mjs` (8962) |
| Studio 패널 E2E | `node studio/dock/studio-dock-panel-e2e-test.mjs` (8963) |

---

## 1. 정체성

Imory Bottom Dock 의 시그니처는 특정 색도 특정 모양도 아니다. 다음
여섯 가지가 전부다.

- 화면 하단에서 주요 기능에 접근할 수 있다.
- 스킨 분위기에 따라 **완전히 다른 모습**으로 표현할 수 있다.
- 단순 메뉴가 아니라 화면·기능·동작에 연결된다.
- 필요하면 작은 오브젝트 하나로 접을 수 있다.
- 한 화면에 들어오는 스킨에서는 자연스럽게 fixed 를 쓴다.
- 긴 화면에서는 콘텐츠 흐름에 맞게 자리를 바꿀 수 있다.

### 금지 (플랫폼 코드에 들어가면 안 되는 것)

- 항상 같은 pill 형태
- 항상 iOS Dock 같은 디자인
- 항상 같은 icon size
- 항상 rounded square icon
- 항상 같은 배경/blur
- 순검정 `#000000` 을 기본값으로 쓰기

그래서 [skin/skin-bottom-dock.css](./skin/skin-bottom-dock.css) 에는
배경·테두리·반지름·그림자·blur·아이콘 크기·색이 **한 줄도 없다**. 거기
있는 것은 자리(fixed/sticky/static) · 공간(safe area · 콘텐츠 여백 ·
가로 넘침 0) · 상태(접힘 전환) · 손가락(최소 hit area) 넷뿐이다.

### 허용

icon-only · text-only · image based · object based · transparent ·
blurred · full width · floating · taskbar style · minimal line style ·
skin-specific custom design.

---

## 2. 둘로 나뉜다 — 설정과 디자인

| | 무엇 | 어디에 저장 | 누가 고치나 |
| --- | --- | --- | --- |
| **설정** | 어떤 항목이 있고 무엇을 하는가, 접히는가, 어디 놓이는가 | `SkinPackage.bottomDock` | 블로그 주인 (Studio 의 Dock 패널) · AI |
| **디자인** | 그것을 어떻게 그리는가 | `SkinPackage.templates.dock` + 공용 `css` | 스킨 제작자 (Code Editor) · AI |

갈라 둔 이유: 한 덩어리 HTML 이면 스킨을 바꾸는 순간 사용자가 고른
항목이 사라지고, 항목 하나를 더하려면 HTML 을 고쳐야 한다. 이것은
`navigation.categories` 를 스킨이 반복해 그리는 것과 정확히 같은 결이다.

`templates.dock` 은 **선택**이다. 없으면 플랫폼 기본 template 으로
그려진다(갤러리·하이라이트 화면과 같은 폴백).

---

## 3. 저장되는 모양 (현재 구현)

```jsonc
"bottomDock": {
  "visible": true,
  "position": "auto",          // auto | fixed | sticky | static
  "collapsible": true,
  "defaultState": "expanded",  // expanded | collapsed
  "transition": "fade",        // none | fade | slide | scale | fade-slide | fade-scale
  "trigger": { "type": "emoji", "value": "♡", "label": "메뉴 열기" },
  "items": [
    {
      "id": "gallery",
      "label": "gallery",
      "audience": "all",       // all | owner | visitor
      "visual": { "type": "icon", "value": "camera" },
      "action": { "type": "navigate", "target": "gallery" }
    }
  ]
}
```

- `schemaVersion` 은 **1 그대로**다. 2로 올리면 이 필드를 모르는 기존
  배포가 그 스킨을 통째로 legacy 화면으로 폴백시킨다(renderMode · js 와
  같은 판단).
- 이 필드를 모르는 옛 배포는 그냥 무시하고 지금까지처럼 그린다 —
  dock 이 없는 화면이 나온다.
- 항목은 최대 12개. 개수를 강제하지는 않지만 무한도 아니다.

### visual.type

| 값 | value | 렌더 |
| --- | --- | --- |
| `icon` | 소문자 토큰 (`camera`) | `data-kind="camera"` → 스킨 CSS 가 그린다 |
| `emoji` | `♡` (8자 이하) | 글자 그대로 |
| `text` | `HOME` (24자 이하) | 글자 그대로 |
| `image` | `https://…` | `<img src>` |
| `asset` | 이미지 슬롯 이름 | `context.images[<이름>]` → `<img src>` |
| `svg` | `https://….svg` | `<img src>` |

아이콘 토큰 목록은 **닫지 않는다** — 스킨이 자기 낱말(`cassette`,
`ribbon`, `flower`)을 쓸 수 있어야 한다. 형태(소문자로 시작, 32자)만
강제한다.

### action.type / target

| type | target | 결과 |
| --- | --- | --- |
| `navigate` | `home` · `highlights` · `gallery` · `banner` | 그 화면 |
| `navigate` | `category:<id>` | 그 카테고리 |
| `navigate` | `path:/<블로그 안 경로>` | 그 주소 |
| `open` | `panel:<이름>` | dock 루트의 `data-imory-dock-open` 을 토글 |
| `action` | `write` · `admin` · `manage` | 소유자 도구(주소가 있는 동작) |
| `action` | `share` · `theme` · `top` | 주소 없는 동작 |

**스킨도 사용자도 주소를 만들지 않는다.** 위 target 을 실제 주소로
바꾸는 것은 언제나 플랫폼이다(`resolveSkinDockItemHref`) —
`navigation.*` 과 같은 원칙이다. 주소를 만들 수 없는 항목(없는
카테고리, 방문자의 `write`)은 **Context 에서 빠진다**: 눌러도 아무 일이
없는 빈 껍데기를 남기지 않는다.

### audience — 방문자와 주인장

`owner` 항목은 방문자에게 **재료 자체가 가지 않는다**(숨기는 게 아니다).
스킨이 `data-imory-if` 를 빠뜨려도 방문자 화면에 주인장 항목이 그려질
수 없다 — `viewer.writeHref` 가 방문자에게 `null` 인 것과 같은 결이다.

---

## 4. 템플릿이 받는 재료 (`dock` namespace)

```
dock.hasDock · dock.hasItems · dock.itemCount
dock.position · dock.collapsible · dock.defaultState
dock.isCollapsedByDefault · dock.transition
dock.trigger.{isIcon,isEmoji,isText,isImage,iconKind,text,imageUrl,label,accessibleLabel}
dock.items[]
  item.id · item.label · item.hasLabel · item.accessibleLabel
  item.href · item.hasHref · item.isActive
  item.actionType · item.isNavigate · item.isOpen · item.isAction · item.panelId
  item.visual.{isIcon,isEmoji,isText,isImage,iconKind,text,imageUrl}
```

`data-imory-if` 는 비교 연산을 지원하지 않으므로 종류마다 boolean 을
미리 발급한다(`page.isHome` 과 같은 판단).

> `dock.position` 은 **사용자가 적은 값**이다(`"auto"` 일 수 있다).
> 이번 화면에 실제로 적용된 자리는 렌더 뒤에 찍히는
> `data-imory-dock-position` 속성에 있다 — CSS 는 그쪽을 본다.
>
> `item.isActive` 는 그 항목의 주소가 **지금 문서의 주소**와 같은가다.
> Studio Preview 에서는 문서 주소가 Studio 자신이라 사실상 언제나
> false 다(남은 차이 §12).

### 스킨이 표시하는 자리 둘

```html
<nav class="my-dock">
  <span data-imory-dock="trigger" data-imory-bind="dock.trigger.text"></span>
  <ul data-imory-dock="items">
    <li data-imory-repeat="dock.items">
      <a data-imory-href="item.href"
         data-imory-kind="item.visual.iconKind"
         data-imory-bind="item.label"></a>
    </li>
  </ul>
</nav>
```

- `data-imory-dock="trigger"` — 눌러서 접고 펴는 자리. **모양은 스킨이
  정한다**(하트 · 리본 · 별 · 카세트 · 작은 사진 · 작은 tab handle).
- `data-imory-dock="items"` — 접힐 때 사라지는 덩어리.

둘 다 선택이다. trigger 가 없으면 접기 기능이 없는 dock 이고, items 가
없으면 접혀도 아무것도 사라지지 않는다. 그 외 값은 sanitizer 가 지운다
([skin/skin-sanitize.js](./skin/skin-sanitize.js)).

### 플랫폼이 렌더 뒤에 얹는 상태 속성 넷

```
data-imory-dock-position    fixed | sticky | static
data-imory-dock-state       expanded | collapsed
data-imory-dock-transition  none | fade | slide | ...
data-imory-dock-open        지금 열린 패널 이름 (없으면 속성 없음)
```

저장되는 HTML 에는 들어갈 수 없다(sanitizer 화이트리스트에 없다) —
런타임에만 찍힌다.

### ★ 스킨 CSS 는 `:root[...]` 로 받는다

```css
:root[data-imory-dock-open="pair"]     .my-panel  { display: block; }
:root[data-imory-dock-state="collapsed"] .my-items { gap: 0; }
:root[data-imory-dock-position="fixed"]  .my-dock  { background: #fdfbfb; }
```

스킨 CSS 는 저장/렌더 시점에 인스턴스 scope class 가 selector 앞에
붙는다([skin/skin-css-validate.js](./skin/skin-css-validate.js)
`scopeSkinCssSelector`). 그냥 `[data-imory-dock-open="pair"] .my-panel`
이라고 쓰면 `.imory-skin-root-iN [data-…] .my-panel` 이 되어 **그 속성이
찍힌 루트 자신**은 매치되지 않는다. `:root` 로 시작하면 그 자리에 scope
class 가 들어가므로 루트의 상태를 받을 수 있다 — PHASE 1H 가
`data-imory-post-focus` 에 쓴 것과 **같은 형태**다.

흐름(sticky/static) dock 은 스킨 루트 **안**에 있어 우연히 두 형태가
모두 동작하지만, `fixed` dock 은 `document.body` 의 플랫폼 자리에 있어
스킨 루트의 자손이 아니다 — 그때 `:root` 없이 쓴 규칙은 **조용히 안
먹는다**. 그래서 언제나 `:root[...]` 로 쓴다.

### 항목 표식 — `data-imory-dock-item`

주소가 없는 동작(패널 · 공유 · 맨 위로)을 눌렀을 때 "어느 항목인가"를
아는 유일한 근거다. 스킨 HTML 은 이 속성을 적을 수 없고, 렌더러가
clone 을 만드는 그 자리에서 플랫폼이 찍는다
([skin/skin-render.js](./skin/skin-render.js) `onRepeatItem`) —
`data-imory-region-key` 와 정확히 같은 사정이다.

---

## 5. 자리 (position)

| 값 | 어디에 | 무엇이 고정되나 |
| --- | --- | --- |
| `fixed` | `document.body` 의 플랫폼 자리(`#imoryBottomDockFixed`) | 그 자리가 `position: fixed` |
| `sticky` | 흐름 자리 | dock 루트가 `position: sticky; bottom: 0` |
| `static` | 흐름 자리 | 아무것도 하지 않는 것이 계약 |

흐름 자리는 두 가지다.

1. 스킨이 `data-imory-region="bottom-dock"` 을 그렸으면 **그 자리**다.
2. 없으면 플랫폼이 스킨 루트 **바로 뒤**에 자리를 하나 만든다. 스킨 DOM
   안에는 한 글자도 넣지 않는다.

### auto 규칙 (현재 구현)

> 콘텐츠가 한 viewport 안에 들어오고 실질적인 세로 스크롤이 없으면
> `fixed`, 스크롤이 있으면 `sticky`.

`sticky` 를 고르는 이유: 읽는 중에도 닿을 수 있으면서(고정과 같은 자리)
글의 맨 끝에서는 흐름 안으로 들어와 마지막 줄을 가리지 않는다.

**사용자가 명시한 position 은 auto 판단보다 우선한다** — 명시했으면
재지 않는다.

#### 두 번 잰다

화면이 실제로 보이는 시점은 렌더보다 늦다 — CATEGORY/POST 는
`#postArea` 가 열리면서 비로소 높이를 갖는다. 그래서 (1) 붙이기 전 한
번, (2) 레이아웃이 한 번 돌고 난 다음 프레임 + `ResizeObserver` 로 다시
잰다. 판정이 달라지면 **다시 그리지 않고 DOM 노드만 옮긴다** — 접힘
상태도 패널 상태도 그대로다.

#### 진동하지 않는다

재는 순간에만 dock 과 그 여백을 잠시 걷어낸다. 빼지 않으면 "fixed →
여백이 생겨 스크롤 → sticky → 여백이 사라짐 → fixed" 가 끝없이 돈다.
한 번의 동기 블록 안에서 끝나므로 중간에 그려지는 화면은 없다.

### 콘텐츠가 가리지 않게

fixed 일 때만 플랫폼이 dock 높이를 실측해
`--imory-bottom-dock-height` 로 넘기고, 스크롤 담당 요소
(`#themeMount.theme-mount--skin` / `.post-area`)에 그만큼 아래 여백을
준다. **스킨 CSS 에는 손대지 않는다** — 여백은 플랫폼이 소유한
컨테이너에 준다.

---

## 6. 접기 / 펼치기

- `collapsible: true` 일 때만 trigger 가 동작한다.
- 접히면 `[data-imory-dock="items"]` 가 사라지고 **trigger 는 항상
  남는다** — 다시 펼 수단이 없는 상태를 만들지 않는다.
- 전환이 끝난 뒤에 `hidden` 을 얹는다(전환 중에 레이아웃에서 사라지면
  애니메이션이 보이지 않는다).
- `prefers-reduced-motion` 이거나 `transition: "none"` 이면 기다리지
  않는다.

### 방문자의 선택은 어디 저장되나

**저장하지 않는다.** 모듈 변수 하나다 — 새로고침하면 스킨이 정한
`defaultState` 로 돌아가고, 한 세션 안에서 화면을 옮기는 동안에만
방문자의 선택이 유지된다. 저장소 권한(사생활 보호 창 · 차단 설정)에
기대지 않으면서 "눌렀는데 다음 화면에서 도로 펴지는" 불편은 없앤다.

### collapsed dock ≠ hamburger menu

trigger 의 외형은 고정하지 않는다. 작은 점 · 화살표 · 하트 · 별 ·
리본 · 폴더 · 카메라 · 카세트 · 작은 이미지 · SVG · 작은 tab handle —
스킨 분위기에 맞는 작은 오브젝트 자체가 trigger 가 될 수 있다.

시각적으로 작아도 실제 hit area 는 44px 아래로 내려가지 않는다
(플랫폼 CSS 가 최소값만 보장하고, 더 크게 그리는 것은 스킨의 자유다).

---

## 7. 동작

| 종류 | 누가 처리하나 |
| --- | --- |
| `navigate` | **기존 SPA 라우터**. dock 은 `renderSkin()` 이 그리므로 루트에 `.imory-skin-root` 가 붙고, 그 안의 `<a href>` 클릭은 [skin/skin-link-nav.js](./skin/skin-link-nav.js) 가 이미 가져간다. 별도 라우터를 만들지 않는다. |
| `open` | 플랫폼이 dock 루트의 `data-imory-dock-open` 값만 바꾼다. 무엇이 어떻게 보일지는 **전적으로 스킨 CSS** 다: `:root[data-imory-dock-open="pair"] .my-panel { display: block }` (§4 의 `:root` 규칙). 같은 항목을 다시 누르면 닫힌다. |
| `share` | `navigator.share` → 없으면 클립보드 복사 |
| `theme` | 기존 `#startThemeToggle` 을 누른다(Imory 시스템 UI 테마). 그 버튼이 없으면 아무 일도 하지 않는다 — dock 이 자기 테마 상태를 따로 갖지 않는다. |
| `top` | 스크롤 담당 요소를 맨 위로 |

주소 없는 항목과 trigger 는 `<a href>` 가 아니므로 플랫폼이 렌더 뒤에
`role="button"` · `tabindex="0"` 을 얹고 Enter/Space 를 받는다(스킨
HTML 은 `tabindex` 를 쓸 수 없다 — sanitizer 가 전면 금지한다).

---

## 8. 수명 — 화면마다 dock 하나

공개 화면 여섯 진입 모듈(HOME · CATEGORY · POST · BANNER · FOLDER ·
HIGHLIGHTS)이 렌더 직후 `syncSkinBottomDockForScreen()` 을 부른다. 그
함수는 **먼저 옛 dock 을 내리고** 새로 그린다 — 리스너 · 타이머 ·
플랫폼이 만든 자리 · 문서에 얹은 여백 클래스까지 전부 되돌린다
(SANDBOX-5B 가 프레임에서 배운 것과 같다: "가려진 것"이 아니라
"없어진 것"이어야 한다).

두 가지 예외 지점이 따로 있다.

- **HOME 복귀** — HOME 은 다시 그려지지 않고 표시 공간만 접힌다. 그래서
  HOME 을 그릴 때 재료를 기억해 두었다가 `restoreSkinBottomDockForHome()`
  으로 다시 그린다(하이라이트 진입점 칩이 같은 자리에서 다시 판정하는
  것과 같은 사정).
- **플랫폼 화면 진입** — 에디터 · 관리 패널을 열 때
  `enterPlatformScreen()` 이 `hideSkinBottomDock()` 을 부른다. fixed dock
  은 `document.body` 에 떠 있는 chrome 이라 `#postArea` 를 치워도 저절로
  사라지지 않는다.

---

## 9. Studio (§12 직접 수정 모드)

Top Dock 의 **Dock** 버튼, 또는 **Preview 안의 dock 을 클릭**하면
설정 패널이 열린다(`preview:dock-select`).

패널에서 고치는 것:

- 표시 — 보이기 / 숨기기
- 자리 — 자동 / 화면에 고정 / 따라오다 멈춤 / 콘텐츠 흐름 안
- 접기 — 사용 / 사용 안 함
- 처음 상태 — 펼친 채로 / 접은 채로
- 접는 표식 — 종류 + 값 + 읽히는 이름
- 전환 — 여섯 중 하나
- 항목 — 순서 변경(끌기 · ↑↓) · 추가 · 삭제 · 라벨 · 그림 · 동작 ·
  보이는 사람

**생김새 칸은 없다**(색 · 크기 · 글꼴). 그건 `templates.dock` 과 스킨
CSS 이고, Code Editor 와 AI 가 그 길이다. 패널에 그 칸을 만들면
"스킨마다 자유롭게"가 무너진다.

DB 는 건드리지 않는다. 패널은 자기 **사본**에서 작업하고, 적용을
누르면 `setStudioBottomDock()` 하나만 부른다 — 그쪽이 working draft ·
dirty · Preview 재렌더의 주인이고, 실제 기록은 Save 가 새 버전 row 에
할 때뿐이다. 취소는 정말로 아무 일도 일어나지 않은 것과 같다.

적용 시 `normalizeSkinBottomDock()` 을 반드시 통과시킨다 — Save 와
Export 와 공개 렌더가 전부 같은 모양을 본다.

---

## 10. sandbox 스킨과의 관계

`renderMode: "sandbox"` 스킨에서도 **dock 은 부모가 native 로 그린다**.

이유: dock 은 플랫폼 동작(라우팅 · 공유 · 테마 · 맨 위로)에 연결된
chrome 이고, 그 동작들은 프레임 안에서 실행될 수 없다. 프레임 안의
저자 JS 도 dock 을 건드릴 수 없다 — 다른 origin 이다.

그때 스킨 루트는 프레임 **안**에 있어 부모에서 닿지 않으므로, 흐름
자리 판정은 컨테이너(iframe 이 들어 있는 자리)를 기준으로 한다. 스킨이
프레임 안에 그린 `bottom-dock` region 은 부모가 볼 수 없다 — sandbox
스킨에서 흐름 dock 은 언제나 프레임 **다음**에 온다.

---

## 11. AI 처리 (§13)

AI 는 dock 관련 자연어 요청을 **기존 primitive 의 property 변경**으로
처리한다. 임의의 JavaScript 를 새로 쓰지 않는다.

| 요청 | 처리 |
| --- | --- |
| "독이 너무 커. 평소에는 작은 하트만 보이고 누르면 펼쳐지게 해줘" | `collapsible: true` · `defaultState: "collapsed"` · `trigger: {type:"emoji", value:"♡"}` · `transition: "fade"` |
| "이 스킨은 한 화면에 다 들어오니까 아래 메뉴는 계속 떠 있게 해줘" | `position: "fixed"` |
| "글이 길어서 아래 메뉴가 따라다니는 게 거슬려" | `position: "static"` |
| "독에서 하트를 누르면 페어 화면이 열렸으면 좋겠어" | 항목의 `action: {type:"open", target:"panel:pair"}` + `templates.dock` 안의 패널 마크업 + `:root[data-imory-dock-open="pair"] .panel { display:block }` |

### 설정 하나 때문에 수정 전체가 실패하지 않는다

서버는 모델이 돌려준 `bottomDock` 을 **칸 단위로 걸러 받는다**
(`sanitizeSkinAiBottomDock`) — 모르는 값이면 그 칸만 현재 값으로
되돌리고, 모양이 틀린 항목만 버린다. 거부하면 "색을 바꿔 달라"는 요청이
통째로 실패한다.

값 목록(enum)은 응답 스키마에도 박혀 있어 모델이 오탈자를 낼 자리가
거의 없다. 목록의 원본은 [skin/skin-bottom-dock.js](./skin/skin-bottom-dock.js)
이고, Pages Function 은 브라우저 전역을 쓸 수 없어 **값 목록만** 옮겨
적는다 — 목록이 바뀌면 두 곳을 함께 고친다.

---

## 12. 남은 차이 (아직 없는 것)

- **인라인 SVG** — sanitizer 가 `<svg>` 를 통째로 지운다
  ([skin/skin-sanitize.js](./skin/skin-sanitize.js)). 그래서 이 계약에서
  SVG 는 "주소로 불러오는 그림"(`visual.type: "svg"`, https URL)이다.
  인라인 마크업을 허용하려면 sanitizer 에 SVG 서브셋 화이트리스트가
  먼저 생겨야 한다.
- **`search` 동작** — 제품에 검색 기능이 없다. 그래서 action target 에
  넣지 않았다(넣으면 눌러도 아무 일이 없는 항목이 생긴다).
- **`profile` / `pair` 같은 전용 화면** — 그런 라우트가 아직 없다.
  `open` + `panel:<이름>` 으로 dock 안에 스킨이 그린 패널을 여는 것이
  현재 할 수 있는 전부다. 진짜 화면이 생기면 `navigate` 타깃 목록에
  이름을 더한다.
- **desktop / mobile 별 다른 항목 구성** — 현재는 같은 data/action 을
  쓰고 **responsive style 만** 스킨 CSS 로 달라진다(§15 요구사항의
  "동일한 dock data/action 구조를 유지하면서"). 항목 자체를 화면 크기별로
  다르게 두는 계약은 없다.
- **접힘 상태의 영구 저장** — 세션 안에서만 유지된다(§6).
- **모바일 길게 눌러 끌기로 항목 순서 바꾸기** — Studio 패널의 끌기는
  HTML5 drag & drop 하나다. 모바일에서는 ↑↓ 버튼을 쓴다(같은 일을
  한다). 관리 화면의 메모 폴더 차례처럼 터치 끌기를 넣으려면 그쪽
  구현을 따라야 한다.
- **Studio Preview 의 `item.isActive`** — Preview 문서의 주소는 Studio
  자신이라 항목의 주소와 맞지 않는다. "지금 보고 있는 항목"을 강조하는
  스킨은 공개 화면에서만 그 표시가 보인다.
- **Preview 안에서 dock 을 실제로 조작해 보기** — Studio Preview 의
  dock 은 누르면 설정 패널이 열린다(편집 대상이지 조작 대상이 아니다).
  접힘/패널 동작을 실제로 확인하려면 공개 화면에서 본다.

---

## 13. 완료 기준에 대한 기록

- 단위 테스트(브라우저 없이) 66건 — 설정 정규화 · Context 조립 ·
  template 선택.
- 공개 화면 E2E 69건 — **진짜 `index.html`** 로 연다(supabase 만 mock).
  렌더 · 자리(auto 실측 포함) · 여백 · 접기 · 동작 · 화면 전환 ·
  소유자/방문자 · 스킨 자체 dock · 390px · dock 없는 스킨 회귀.
- Studio E2E 43건 — production 과 같은 스크립트 구성의 시나리오
  하네스에서 패널 열기 · 적용 · 설정 · 항목 · 거부 · 취소 · 삭제 ·
  Preview 클릭 · Export→Import 왕복 · 390px.
- 회귀 확인(전부 통과): 8934 공개 프레임(64) · 8935 배너(248) ·
  8936 WRITE/관리(155) · 8939 Inspector(52) · 8942 폴더 트리(71) ·
  8943 파일 UX(42) · 8945 직접 편집(37) · 8956 재료 일치(58) ·
  8957/8958 sandbox(559) · 8959/8960 Studio sandbox preview(165) ·
  8937 AI 패널(142) · sandbox 단위(262) · 본문 서식 allowlist(98).
- 8938 AI 패널 레이아웃의 "O0. 없는 카테고리…" 1건(89/90)은 **이
  라운드 이전부터 실패한다** — 이 변경을 stash 하고 돌려서 같은
  결과를 확인했다.
- **실제 DB 검증 / 배포 확인 / 실기기 확인은 하지 않았다.**
  migration 이 필요 없는 변경이다(`bottomDock` 은 기존
  `skin_versions.content` JSON 안의 새 키다).
