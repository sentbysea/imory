# IMORY HOME CANVAS — 데이터 계약

> 상태: **CURRENT CONTRACT**. 여기 적힌 것 중 **§1~§10 은 지금 코드가 강제한다**.
> **§11 은 아직 구현되지 않았다** — 앞으로 Renderer 와 편집 UI 가 지켜야 할
> 약속과 남은 차이다. 그 절을 구현된 것으로 읽지 않는다.
>
> 라운드: `HOME-CANVAS-CONTRACT-1B`(2026-09-21).
> 로드맵: [IMORY_HOME_CANVAS_ROADMAP.md](../plans/IMORY_HOME_CANVAS_ROADMAP.md) — **PLAN**.

관련 코드

| 무엇 | 파일 |
| --- | --- |
| 계약 · 검증 · 실행 payload(**단일 원천**) | [skin/skin-home-canvas.js](../../skin/skin-home-canvas.js) |
| 저장 경계 — 표시 위치 속성 | [skin/skin-sanitize.js](../../skin/skin-sanitize.js) |
| Import 검증 입구 | [skin/skin-package-import.js](../../skin/skin-package-import.js) |
| 렌더 재료에 싣는 자리 | [skin/skin-template.js](../../skin/skin-template.js) `resolveSkinTemplate` |
| sandbox 봉투의 strict allowlist | [skin/sandbox/skin-sandbox-protocol.js](../../skin/sandbox/skin-sandbox-protocol.js) `isSandboxHomeCanvas` |

관련 테스트: `node skin/skin-home-canvas-test.mjs` ·
`node studio/studio-home-canvas-e2e-test.mjs` — [TESTS.md](../TESTS.md) §13.

---

## 0. 이번 라운드가 실제로 한 일

HOME 을 한 폭짜리 디자인 캔버스로 꾸미는 기능의 **데이터 계약만** 만들었다.

- 캔버스 요소는 **아직 화면에 그려지지 않는다.**
- Moveable / Selecto 는 저장소에 **들어오지 않았다.**
- 드래그 · 크기 · 회전 · Inspector · Undo · preset · 스티커 업로드 UI 는 **없다.**

지금 성립하는 것은 이것뿐이다: 캔버스 데이터가 SkinPackage 안에 있을 수 있고,
Import · Export · Save · 다시 열기 · Publish · AI 수정 · sandbox 봉투를 지나도
**한 칸도 잃지 않으며**, 잘못된 데이터가 조용히 고쳐지거나 지워지지 않는다.

---

## 1. 소유권 — 플랫폼과 Canvas

캔버스에 HOME 전체와 좌우 패널의 여닫기 · 칼럼 배치를 넘기지 않는다.

| 누가 | 무엇을 |
| --- | --- |
| **플랫폼** | 1 · 2 · 3단 배치 · 데스크톱 좌우 칼럼 · 모바일 패널 열기/닫기 · 패널 스크롤 · 포커스 · Escape · 바깥 클릭 |
| **Canvas** | 각 표시 영역 **안의** 사진 · 텍스트 · 로고 · 카테고리 · 스티커 · 도형 · 향후 위젯의 배치 |

1 · 2 · 3단은 지금처럼 [IMORY_SIDES_DESIGN.md](./IMORY_SIDES_DESIGN.md) 가 갖는다.
캔버스는 그 안의 한 칸(HOME 본문)에 놓이는 면이다.

v1 에서 구현한 것은 `home_canvas` 하나다.

---

## 2. 저장 위치 — 새 최상위 필드를 만들지 않는다

기존 `SkinPackage.regions` 안의 이름 붙은 항목이다. 좌우 영역
(`left_sidebar` · `right_sidebar`)과 주인의 스킨 설정(`theme_colors` ·
`home_photos` · `dday`)이 이미 쓰는 그 배열이다.

```json
{
  "regions": [
    { "name": "left_sidebar", "enabled": true },
    {
      "name": "home_canvas",
      "enabled": true,
      "canvas": {
        "version": 1,
        "baseWidth": 390,
        "elements": []
      }
    }
  ]
}
```

`regions` 가 원래부터 갖고 있던 성질을 그대로 유지한다.

| 경로 | 지금 동작 |
| --- | --- |
| Import | 새 파일의 `home_canvas` 만 검증하고, 나머지 항목은 읽지 않고 보존 |
| Export | `regions` 를 깊은 복사로 **통째로** 싣는다(모르는 칸 포함) |
| Save | `normalizeSkinPackageForDraft()` 가 templates/css 만 손대고 regions 는 그대로 |
| Publish | draft 포인터를 옮길 뿐 content 를 다시 만들지 않는다 |
| AI 수정 | 서버가 `currentPackage.regions` 를 **그대로** 되돌려 준다 |
| Preview / 공개 / sandbox | `resolveSkinTemplate()` 이 **실행용 payload** 를 만들어 싣는다(§8) |

- 이름이 `home_canvas` 가 아닌 항목은 읽지 않고 그대로 보존한다.
- `enabled: false` 는 **데이터를 지우지 않는다.** 껐다 켜도 요소가 그대로 남는다.
- 같은 이름이 둘이면 **앞의 것**이 이긴다(sides 와 같은 규칙). 다만 Import
  검증은 둘 다 본다 — 뒤의 것이 깨진 파일을 통과시키면 나중에 앞의 것을
  지웠을 때 갑자기 드러난다.
- `regions: []`(= 지금까지의 모든 스킨)는 "캔버스 없음"이고 렌더 결과가 한
  byte도 바뀌지 않는다.

---

## 3. Template 표시 위치

캔버스를 보여 주는 스킨 템플릿은 HOME 안에 **정확히 하나**의 표시 위치를 둔다.

```html
<div data-imory-canvas-root></div>
```

- 저장 경계(`skin/skin-sanitize.js`)가 이 속성을 안다. 판정 표는
  `skin/skin-home-canvas.js` 한 곳에 있고, 허용되는 값은 **빈 값 하나**뿐이다.
- **기존 스킨에 이 표식 · 속성 · 리스너를 자동으로 넣지 않는다.**

fallback 표 — 지금 코드가 그대로 따른다.

| 상태 | 결과 |
| --- | --- |
| `home_canvas` 없음 | 기존 HOME 을 그대로 렌더 |
| `home_canvas` 있음 + 표식 없음 | 기존 HOME 을 그대로 렌더 |
| 표식이 둘 이상 | 기존 HOME 을 그대로 렌더 |
| 표식 있음 + `elements: []` | **빈 Canvas 면**으로 취급(실행 데이터가 실린다) |
| 표식 있음 + 잘못된 Canvas 데이터 | 기존 HOME 을 그대로 렌더(원본은 남는다) |
| 표식 있음 + 모르는 `canvas.version` | 기존 HOME 을 그대로 렌더(원본은 남는다) |

"기존 HOME 을 그대로 렌더" 는 코드에서 **`template.canvas` 키를 만들지 않는
것**으로 성립한다 — 그래서 캔버스가 없는 스킨에서는 Preview 메시지와 sandbox
봉투가 지금까지와 byte 단위로 같다.

`HOME-CANVAS-CONTRACT-1B` 는 이 요소 **안에 DOM 을 만들지 않는다.**

---

## 4. 좌표

| 규칙 | 값 |
| --- | --- |
| `baseWidth` | `390` 고정 |
| `x` · `y` | Canvas 왼쪽 위 기준 |
| `width` | 양수 |
| `height` | §6 |
| `rotation` | 요소 **중심** 기준 시계 방향 각도 |
| 앞뒤 순서 | 배열 앞쪽이 뒤, 뒤쪽이 앞. **별도 `z` 필드를 두지 않는다** |
| 절대 한계 | 좌표 ±100000 · 크기 0 초과 100000 이하 |

`baseWidth: 390` 은 화면 폭을 390px 로 고정한다는 뜻이 **아니다.** 저장 좌표의
기준 자만 390 으로 통일한다는 뜻이다. 실제 화면 폭 변환은 후속 Renderer 의 몫이다
(§11).

데스크톱 전용 별도 좌표와 breakpoint override 는 이번에 만들지 않았다
(`HOME-CANVAS-RESPONSIVE-1`).

---

## 5. 요소 공통 필드

```json
{
  "id": "canvas_a1b2c3d4-5e6f-7890-abcd-ef1234567890",
  "type": "photo",
  "x": 20,
  "y": 120,
  "width": 260,
  "height": 320,
  "rotation": 0,
  "hidden": false,
  "locked": false,
  "props": { "slot": "photo_1" }
}
```

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `id` | ✔ | §5-1 |
| `type` | ✔ | §7 의 여섯 중 하나 |
| `x` · `y` | ✔ | 유한한 숫자 |
| `width` | ✔ | 양수 |
| `height` | ✔ | §6 |
| `rotation` | | 유한한 숫자. 빠지면 `0` |
| `hidden` | | boolean. 빠지면 `false` |
| `locked` | | boolean. 빠지면 `false` |
| `props` | | 객체. 빠지면 `{}`(타입별 필수 칸은 §7) |

뒤 넷을 선택으로 둔 이유: 안전한 기본값이 하나뿐이라 "빠뜨린 것"과 "기본값을
적은 것"이 같은 뜻이다. 앞 여섯은 그렇지 않아서 필수다. **들어 있으면 모양은
맞아야 한다** — 조용히 고치지 않는다.

- 요소 순서를 임의로 정렬하지 않는다.
- 입력 객체와 배열을 직접 mutate 하지 않는다.

### 5-1. id — `data-imory-edit-id` 와 같은 규칙

```
/^[A-Za-z][A-Za-z0-9_-]{0,63}$/
```

**함정.** §8 은 각 요소가 후속 Renderer 에서 안정적인
`data-imory-edit-id="<element.id>"` 를 받아야 한다고 적는다. 그런데 저장 경계의
edit-id 규칙(`skin/skin-sanitize.js` `SKIN_SANITIZE_EDIT_ID_PATTERN`)은 **점이
없고, 64자 이하이고, 글자로 시작**해야 한다. `crypto.randomUUID()` 는
`0e02b2c3-…` 처럼 **숫자로 시작할 수 있어서** 그 규칙을 통과하지 못한다.

그래서 `createSkinHomeCanvasElementId()` 는 `canvas_` 를 앞에 붙인다
(`canvas_` + UUID = 43자, 항상 글자로 시작). 검증도 같은 규칙을 쓴다 — 맞지
않는 id 는 새 Import 에서 **거부**한다. 저장은 됐는데 나중에 그 요소만 고를 수
없는 상태를 파일만 보고 구분할 수 없게 두지 않는다.

- id 는 저장 · 다시 열기 · Export/Import 이후에도 바뀌지 않는다.
- **중복 id 를 임의로 새 id 로 고치지 않는다** — 새 Import 에서 거부한다.

---

## 6. 높이

모든 요소는 사용자가 가로와 세로를 **직접 조정할 수 있는** 구조여야 한다.

| 종류 | `height` |
| --- | --- |
| `photo` · `logo` · `sticker` · `shape` | 양수 |
| `text` · `category_nav` | 양수 **또는** `"auto"` |

`"auto"` 는 **높이 조정 불가라는 뜻이 아니다.** 후속 Inspector 에서 세로
손잡이를 조작하면 `"auto"` 를 실제 숫자 높이로 바꿀 수 있어야 하고,
`내용에 맞추기` 를 고르면 다시 `"auto"` 로 돌아갈 수 있어야 한다.
그 손잡이와 Inspector UI 는 이번에 만들지 않았다(§11).

---

## 7. 요소 종류 — v1 은 이 여섯이 전부

### photo

```json
{ "type": "photo", "props": { "slot": "photo_1" } }
```

`slot` 은 이미지 슬롯 이름이고, 규칙은 `skin/skin-package-images.js` 의
`SKIN_IMAGE_SLOT_NAME_PATTERN`(`/^[a-z][a-z0-9_]{0,49}$/`)과 같다 —
**snake_case 소문자**다.

### text

```json
{ "type": "text", "props": { "text": "A quiet archive.", "role": "body" } }
```

`role` — `title` · `subtitle` · `body` · `caption` · `label`. 빠지면 `body`.
`text` 는 2000자 이하.

### logo

```json
{ "type": "logo", "props": { "slot": "title_logo", "fallback": "site_title" } }
```

`fallback` 은 `site_title` 하나다. 빠지면 `site_title`.

### category_nav

```json
{ "type": "category_nav", "props": { "mode": "all", "categoryIds": [] } }
```

`mode` — `all` · `selected`. 빠지면 `all`. `categoryIds` 는 50개 이하의
빈 문자열이 아닌 문자열 배열(각 64자 이하). 빠지면 `[]`.

### sticker

```json
{ "type": "sticker", "props": { "slot": "sticker_1" } }
```

### shape

```json
{ "type": "shape", "props": { "kind": "rect" } }
```

`kind` — `rect` · `ellipse` · `line`.

---

## 8. 내용 · 스타일의 소유권

Canvas JSON 이 갖는 것

- 요소 종류 · 실제 내용 · 이미지 슬롯 · 위치 · 가로·세로 크기 · 회전 ·
  숨김 · 잠금 · 의미 역할

**시각 스타일은 기존 스킨 CSS 가 갖는다**

- 글꼴 · 글자 크기 · 글자색 · 배경색 · 테두리 · 모서리 · 그림자 · 여백 ·
  정렬 · shape 의 fill/stroke · sticker 의 외곽선과 칼선

후속 Renderer 는 각 요소에 안정적인 `data-imory-edit-id="<element.id>"` 를
주어야 한다. Studio Inspector 가 나중에 그 선택자로 CSS 를 고친다(§5-1 의
함정이 그래서 중요하다).

**이번 계약에 넣지 않은 필드**: `canvas.background` · 요소별 `style` ·
`shape.fill` · `shape.stroke` · `sticker.outline` · `z`.

---

## 9. 검증 · 보존 · fallback — 세 경우를 가른다

### (1) 새 Import 가 잘못된 경우 → 막는다

Import 는 사용자가 **그 자리에서 고칠 수 있는** 경로를 문장에 담아 거부한다.

```
regions[2].canvas.elements[1].width — width는 0보다 크고 100000 이하인 숫자여야 합니다.
regions[0].canvas.elements[3].id — id "canvas_a"가 두 번 쓰였습니다. …
```

실패의 모양은 다른 거부와 같다: `reason: "home-canvas"` · `message` ·
`canvasErrorPath`. 중복 id · 잘못된 타입 · 잘못된 숫자 · 허용되지 않은
`"auto"` 는 **조용히 고치지 않는다.**

### (2) 이미 저장된 데이터가 잘못된 경우 → 삭제하지 않고 fallback

- 원본 데이터를 삭제하거나 덮어쓰지 않는다.
- 문제 요소만 조용히 제거하지 않는다(payload 자체를 만들지 않는다).
- Canvas 를 실행하지 않고 **기존 HOME** 을 그린다.
- Save · Export 에서 원본을 잃지 않는다.

★ **AI 경로가 여기 걸린다.** AI 응답도 `validateSkinPackageImport()` 를 지나는데,
그 응답의 `regions` 는 사용자가 쓴 것이 아니라 **서버가 지금 draft 의 regions 를
그대로 되돌려 준 것**이다. 이미 저장된 캔버스가 깨져 있을 때 거기서 막으면,
그 사람은 캔버스와 무관한 AI 수정조차 영영 못 하게 된다(지금은 캔버스를 고칠
UI 도 없다). 그래서 `validateSkinPackageImport(raw, { canvasSource })` 가 둘을
가른다.

| `canvasSource` | 누가 쓰는가 | 잘못된 캔버스 |
| --- | --- | --- |
| `"file"`(기본) | Import 창 | **거부** + 필드 경로 |
| `"draft"` | `studio/ai/studio-ai-panel.js` | 통과 + 보존. 실행만 안 된다 |

### (3) 미래 버전 · 모르는 필드 → 보존

- storage 경계(Import · Export · Save · Publish · AI)는 **모르는 필드를 보존**한다 —
  `regions` 의 모르는 항목, `canvas` 의 모르는 칸, 요소의 모르는 칸 전부.
- 지원하지 않는 미래 `canvas.version` 은 **거부가 아니다.** 파일은 통과하고,
  그 elements 를 이 배포의 v1 규칙으로 검사하지도 않으며, 실행만 하지 않는다.
- sandbox 로 보내는 **실행 데이터는 strict allowlist** 다.

### 보존용 원본 ↔ 실행용 payload

두 길이 다르다. 이것이 §9 의 핵심이다.

| | 보존용 원본 | 실행용 payload |
| --- | --- | --- |
| 어디 | `SkinPackage.regions` 의 항목 그대로 | `resolveSkinTemplate()` 결과의 `template.canvas` |
| 모르는 칸 | **남는다** | **없다**(allowlist) |
| 미래 version | 남는다 | 만들어지지 않는다 |
| 깨진 데이터 | 남는다 | 만들어지지 않는다 |
| 기본값 | 적힌 그대로 | `rotation:0` · `hidden:false` · `locked:false` · 타입별 기본값이 채워진다 |

`buildSkinCanvasRenderPayload()` 의 결과는 항상 **새 리터럴**이다 — `props` 까지
새로 만들어서, 입력의 어떤 객체도 프레임으로 나가는 값에 그대로 실리지 않는다.

sandbox 봉투는 그 payload 를 `skin-sandbox-protocol.js` 의
`isSandboxHomeCanvas()` 로 **한 번 더** 검사한다. 그 파일은 "의존 없음"이라
값 목록을 한 벌 더 갖는데(부모 realm 과 frame realm 이 같은 파일을 각각
로드한다), 둘이 갈라지지 않게 `skin/skin-home-canvas-test.mjs` 의 `[protocol]`
절이 목록과 정규식을 **양방향으로 대조**한다.

---

## 10. 이번에 바꾼 파일

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-home-canvas.js` | **새 파일** — 계약 · 검증 · 보존 · 실행 payload 의 단일 원천 |
| `skin/skin-sanitize.js` | 표시 위치 속성을 위 파일의 표에 묻는다 |
| `skin/skin-template.js` | `resolveSkinTemplate()` 이 HOME + 표식일 때만 `canvas` 를 싣는다 |
| `skin/skin-package-import.js` | `home_canvas` 검증(+`canvasSource` 옵션) |
| `skin/sandbox/skin-sandbox-protocol.js` | 봉투의 `canvas` 칸 strict allowlist |
| `skin/sandbox/skin-sandbox-host.js` | 봉투에 싣는 자리 |
| `skin/sandbox/skin-sandbox-frame.js` | 프레임이 받아 `skin.canvas` 로 옮긴다 |
| `studio/ai/studio-ai-panel.js` | `canvasSource: "draft"` |
| `core/lib/skin-sandbox-server.js` | sandbox origin allowlist |
| `index.html` · `studio/index.html` · `studio/preview/preview-frame.html` · `skin/sandbox/frame.html` · `studio/studio-lifecycle-scenario.html` | 새 파일을 **sanitize 보다 먼저** 로드 |

Export(`skin/skin-package-export.js`)와 Save(`skin/skin-package-normalize.js`)는
고치지 않았다 — 둘 다 원래부터 `regions` 를 통째로 보존한다(Export 는 깊은 복사,
Save 는 스프레드). 테스트가 그 사실을 못박는다.

`APP_BUILD_VERSION` 은 이번에 올리지 않았다(배포하지 않았다).

---

## 11. 아직 구현하지 않은 것 · 남은 차이

**이 절은 계약이 아니라 앞으로의 약속과 빈 곳이다.**

### 11-1. Renderer 가 지켜야 할 것 (`HOME-CANVAS-RENDER-1`)

- `data-imory-canvas-root` 안에 요소 DOM 을 만든다.
- 각 요소에 `data-imory-edit-id="<element.id>"` 를 준다(§5-1).
- 배열 순서가 곧 앞뒤 순서다(`z` 필드를 새로 만들지 않는다).
- `baseWidth: 390` 저장 좌표를 실제 화면 폭으로 변환한다 — 변환 규칙 자체가
  아직 정해지지 않았다(§11-3).
- Studio native / Studio sandbox / 공개 native / 공개 sandbox **네 화면**이 같은
  결과여야 한다.

### 11-2. UI (`SELECT-1` · `HISTORY-1` · `ELEMENTS-1` 이후)

Moveable · Selecto · 드래그 · 크기 · 회전 · 세로 손잡이 · Inspector ·
Undo/Redo · preset · 사진 자동 매핑 · sticker 업로드 · widget · 그룹 선택 —
**하나도 없다.** `HOME-CANVAS-SPIKE-1`(Moveable/Selecto 적합성)도 아직
결론이 없다.

### 11-3. 남은 차이

| 빈 곳 | 어디서 정하나 |
| --- | --- |
| 390 저장 좌표 → 데스크톱 폭 변환 규칙 | `HOME-CANVAS-RESPONSIVE-1` |
| 모바일/데스크톱 좌표 override 를 둘 것인가 | `HOME-CANVAS-RESPONSIVE-1` |
| 좌우 패널(`left_sidebar` · `right_sidebar`) 안의 Canvas | `HOME-CANVAS-SIDES-1` |
| `canvas.background` · 요소별 `style` · `shape.fill/stroke` · `sticker.outline` | `DECOR-1` · `STICKER-1` |
| 캔버스를 고치는 Studio 패널(지금은 UI 가 없어서, 깨진 캔버스를 사람이 고칠 길이 Import 창뿐이다) | `HOME-CANVAS-SELECT-1` 이후 |
| 캔버스 요소가 카테고리 Context 를 실제로 읽는 방법(`category_nav` 는 지금 데이터만 있고 바인딩이 없다) | `HOME-CANVAS-ELEMENTS-1` |
| `logo.fallback` 에 "아무것도 안 그림" 같은 값이 필요한가 | 아직 요청 없음 — 지금은 `site_title` 하나 |

### 11-4. 확장 방향 (기록만)

같은 `canvas` 데이터 구조를 `left_sidebar` · `right_sidebar` 항목 안에도 붙일
수 있게 만들어 두었다. `skin/skin-home-canvas.js` 의 `validateSkinCanvasData()` ·
`buildSkinCanvasRenderPayload()` 는 region 이름을 모른다 — 찾는 이름을 늘리는
것만으로 좌우 Canvas 를 붙일 수 있다. **이번 라운드는 붙이지 않았다.**
