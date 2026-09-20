# IMORY HOME CANVAS — 데이터 계약

> 상태: **CURRENT CONTRACT**. 여기 적힌 것 중 **§1~§10 과 §12 · §13 은 지금
> 코드가 강제한다**. **§11 은 아직 구현되지 않았다** — 앞으로 편집 UI 가
> 지켜야 할 약속과 남은 차이다. 그 절을 구현된 것으로 읽지 않는다.
>
> 라운드: `HOME-CANVAS-CONTRACT-1B`(2026-09-21) · `1C`(2026-09-21, `baseHeight` 추가 — §4-1) ·
> `HOME-CANVAS-RENDER-1A`(2026-09-21, **정적 Renderer** — §12) ·
> `HOME-CANVAS-RENDER-1B`(2026-09-21, **sandbox 프레임까지 · 네 화면** — §12-6) ·
> `HOME-CANVAS-VENDOR-1`(2026-09-21, **Moveable · Selecto 고정과 지연 로더** — §13).
> 로드맵: [IMORY_HOME_CANVAS_ROADMAP.md](../plans/IMORY_HOME_CANVAS_ROADMAP.md) — **PLAN**.

관련 코드

| 무엇 | 파일 |
| --- | --- |
| 계약 · 검증 · 실행 payload(**단일 원천**) | [skin/skin-home-canvas.js](../../skin/skin-home-canvas.js) |
| 저장 경계 — 표시 위치 속성 | [skin/skin-sanitize.js](../../skin/skin-sanitize.js) |
| Import 검증 입구 | [skin/skin-package-import.js](../../skin/skin-package-import.js) |
| 렌더 재료에 싣는 자리 | [skin/skin-template.js](../../skin/skin-template.js) `resolveSkinTemplate` |
| sandbox 봉투의 strict allowlist | [skin/sandbox/skin-sandbox-protocol.js](../../skin/sandbox/skin-sandbox-protocol.js) `isSandboxHomeCanvas` |
| **정적 Renderer**(DOM 생성 · 갱신 · 제거) | [skin/skin-home-canvas-render.js](../../skin/skin-home-canvas-render.js) `compileSkinHomeCanvas` |
| **좌표 구조 CSS**(색 · 글꼴 없음) | [skin/skin-home-canvas-render.css](../../skin/skin-home-canvas-render.css) |
| Renderer 를 부르는 자리 | [skin/skin-render.js](../../skin/skin-render.js) `renderSkin` mount 끝 |
| 렌더러를 로드하는 **세** 문서 | [index.html](../../index.html) · [studio/preview/preview-frame.html](../../studio/preview/preview-frame.html) · [skin/sandbox/frame.html](../../skin/sandbox/frame.html) |
| sandbox origin allowlist | [core/lib/skin-sandbox-server.js](../../core/lib/skin-sandbox-server.js) `SANDBOX_ALLOWED_PATHS` |
| Studio sandbox 로 `canvas` 를 옮기는 자리 | [studio/preview/preview-sandbox.js](../../studio/preview/preview-sandbox.js) |
| **고정한 편집기 라이브러리**(Moveable · Selecto UMD · MIT) | [studio/vendor/home-canvas/](../../studio/vendor/home-canvas/) — 출처 · 해시 · 보관 규칙은 그 폴더의 `README.md` |
| **그 둘을 부를 때만 받는 로더** | [studio/studio-home-canvas-vendor.js](../../studio/studio-home-canvas-vendor.js) `ensureHomeCanvasEditorVendors` |

관련 테스트: `node skin/skin-home-canvas-test.mjs` ·
`node skin/skin-home-canvas-render-e2e-test.mjs` ·
`node skin/skin-home-canvas-sandbox-e2e-test.mjs` ·
`node studio/studio-home-canvas-e2e-test.mjs` ·
`node studio/studio-home-canvas-vendor-e2e-test.mjs` — [TESTS.md](../TESTS.md) §13.

---

## 0. 지금까지 실제로 된 것

| 라운드 | 무엇 |
| --- | --- |
| `CONTRACT-1B` | 데이터 계약 — 캔버스 데이터가 SkinPackage 안에 있을 수 있고, Import · Export · Save · 다시 열기 · Publish · AI 수정 · sandbox 봉투를 지나도 **한 칸도 잃지 않으며**, 잘못된 데이터가 조용히 고쳐지거나 지워지지 않는다 |
| `CONTRACT-1C` | 도화지 전체의 세로 길이 `baseHeight` 한 칸(§4-1). 그 말고는 `1B` 계약이 그대로다 |
| `RENDER-1A` | **정적 Renderer**(§12) — 저장된 Canvas 가 **공개 native HOME** 과 **Studio native Preview** 에서 같은 DOM · 같은 좌표로 그려진다 |
| `RENDER-1B` | 그 **같은 렌더러**가 cross-origin sandbox 프레임에서도 돈다(§12-6). **네 화면 정적 parity 가 검증됐다** — 공개 native · Studio native Preview · 공개 sandbox · Studio sandbox Preview |
| `VENDOR-1` | Moveable 0.53.0 · Selecto 1.26.3 UMD 를 **저장소에 바이트 그대로 고정**하고, Studio 전용 **지연 로더**와 sandbox allowlist 두 줄을 두었다(§13). **아직 Canvas 요소에 연결되지 않았다** |

아직 **없는 것** — 이것을 구현된 것으로 읽지 않는다.

- 선택 · 이동 · 크기 · 회전 조작 UI · 멀티 선택 · Inspector · Undo/Redo ·
  preset · 스티커 업로드 · widget — **하나도 없다**(§11).
- `VENDOR-1` 은 라이브러리를 **놓아두었을 뿐**이다. 아무도
  `ensureHomeCanvasEditorVendors()` 를 부르지 않으므로 지금은 어느 화면에서도
  두 UMD 가 내려오지 않는다(§13-4).

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
        "baseHeight": 844,
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

이 요소 **안의 DOM 은 전부 Renderer 가 만든다**(§12). 스킨이 표식 안에 직접
적어 둔 자식이 있으면 그것은 지워지지 않는다.

---

## 4. 좌표

| 규칙 | 값 |
| --- | --- |
| `baseWidth` | `390` 고정 |
| `baseHeight` | 양수(고정값 아님). 새 캔버스 기본 `844` — §4-1 |
| `x` · `y` | Canvas 왼쪽 위 기준 |
| `width` | 양수 |
| `height` | §6 |
| `rotation` | 요소 **중심** 기준 시계 방향 각도 |
| 앞뒤 순서 | 배열 앞쪽이 뒤, 뒤쪽이 앞. **별도 `z` 필드를 두지 않는다** |
| 절대 한계 | 좌표 ±100000 · 크기 0 초과 100000 이하 |

`baseWidth: 390` 은 화면 폭을 390px 로 고정한다는 뜻이 **아니다.** 저장 좌표의
기준 자만 390 으로 통일한다는 뜻이다. 실제 화면 폭으로 어떻게 바뀌는지는 §12-2.

데스크톱 전용 별도 좌표와 breakpoint override 는 이번에 만들지 않았다
(`HOME-CANVAS-RESPONSIVE-1`).

### 4-1. `baseHeight` — 도화지 전체의 세로 길이 (`CONTRACT-1C`)

`1B` 에는 요소마다의 `height` 는 있었지만 **도화지 자체가 어디까지인가**가
없었다. 그래서 다음을 안정적으로 정할 수 없었다.

- 요소가 하나도 없는 빈 Canvas 의 높이
- HOME 의 의도된 마지막 지점과 아래쪽 디자인 여백
- 한 화면형 Canvas 와 긴 스크롤형 Canvas 의 구분
- 편집기에서 도화지 전체 높이를 늘리거나 줄이는 기능

| 규칙 | |
| --- | --- |
| 타입 | 유한한 **양수**(상한은 좌표와 같은 100000 — 요소가 못 나가는데 도화지만 클 이유가 없다) |
| 필수 여부 | **v1 필수 필드** |
| 새 Canvas 기본값 | `844`(390×844 = 한 화면형) |
| 요소의 `height` 와 | **별개다.** `baseHeight` 는 "캔버스가 어디까지인가", 요소 `height` 는 "그 요소가 얼마나 큰가" |
| 요소가 없을 때 | 그래도 캔버스는 `baseHeight` 를 갖는다 |
| 오류 경로 | `regions[n].canvas.baseHeight` |

- **요소의 가장 아래 좌표로 자동 계산하지 않는다.** 그렇게 하면 아래쪽에 일부러
  둔 여백이 사라지고, 요소를 하나 옮길 때마다 페이지 전체 높이가 예기치 않게
  바뀐다.
- **요소가 Canvas 경계를 일부 벗어나는 것을 데이터 계약이 금지하지 않는다.**
  넘친 것을 어떻게 다룰지(자르기 · 늘리기 · 스크롤)는 Renderer 의 몫이고,
  `RENDER-1A` 는 그것을 **스킨 CSS 에 남겼다** — 플랫폼 CSS 가 도화지에
  `overflow` 를 정하지 않는다(§12-2).
- 실제 viewport 에 맞춰 확대·축소하거나 스크롤하게 만드는 방식도 §12-2 다.
- 향후 Studio 에서 주인이 이 값을 직접 조정할 수 있다 — 그 UI 는 아직 없다.
- **데스크톱·모바일별 별도 높이는 이번에 추가하지 않았다**(`RESPONSIVE-1`).

**왜 필수인가.** 지금까지 저장된 실제 사용자 Canvas 데이터가 **하나도 없다.**
그래서 옵션으로 둘 이유가 없고, 빠진 것을 조용히 `844` 로 채우면 "한 화면형으로
만든 캔버스"와 "높이를 안 적은 캔버스"가 파일만 보고 구분되지 않는다. 누락된
새 Import 는 위 경로와 함께 **거부**한다.

`baseHeight` 는 보존용 원본과 실행용 payload **양쪽 모두**에 실린다. 실행용
payload 는 `baseWidth` 와 달리 상수가 아니라 **저장된 그 값**을 그대로 싣는다.

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

**함정.** 각 요소는 Renderer 에서 안정적인
`data-imory-edit-id="<element.id>"` 를 받는다(§8 · §12-3). 그런데 저장 경계의
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

## 10. 라운드마다 바꾼 파일

### `VENDOR-1` (Moveable · Selecto 고정)

| 파일 | 무엇 |
| --- | --- |
| `studio/vendor/home-canvas/moveable-0.53.0.min.js` | **새 파일** — npm tarball 의 UMD 를 바이트 그대로 |
| `studio/vendor/home-canvas/selecto-1.26.3.min.js` | **새 파일** — 같음 |
| `studio/vendor/home-canvas/licenses/*.txt` | **새 파일** — MIT 전문 둘 |
| `studio/vendor/home-canvas/README.md` | **새 파일** — 출처 · 크기 · SHA-256 · 보관 규칙의 **단일 원천** |
| `studio/vendor/home-canvas/.gitattributes` | **새 파일** — `-text`. 이 저장소는 `core.autocrlf=true` 라 없으면 checkout 때 LF→CRLF 로 바이트가 바뀌어 위 해시가 틀어진다 |
| `studio/studio-home-canvas-vendor.js` | **새 파일** — `ensureHomeCanvasEditorVendors()` 지연 로더 |
| `studio/index.html` · `studio/studio-lifecycle-scenario.html` | 로더 **한 파일**을 읽는다(UMD 둘은 아니다) |
| `core/lib/skin-sandbox-server.js` | allowlist 에 vendor JS **두 줄** — 프레임 HTML 은 안 고쳤다 |
| `studio/studio-home-canvas-vendor-e2e-test.mjs` | **새 파일** — 파일 · 로더 · `cspNonce` 대조군 넷 · allowlist · 공개 비용 0 |

`VENDOR-1` 은 그 외 어떤 파일도 고치지 않았다. 특히 **CSP 를 한 글자도
바꾸지 않았고**(`script-src 'self'` 가 이미 허용한다), `skin/` 의 렌더러 ·
계약 · sanitize · 프레임 문서는 **한 줄도 바뀌지 않았다.**

`APP_BUILD_VERSION` 은 이번에 올리지 않았다(배포하지 않았다).

### `RENDER-1B` (sandbox 프레임)

**새 렌더러를 만들지 않았다.** `RENDER-1A` 의 파일 두 장을 프레임이
읽게 하고, 한 곳에서 빠지던 칸 하나를 채운 것이 전부다.

| 파일 | 무엇 |
| --- | --- |
| `skin/sandbox/frame.html` | 렌더러를 로드한다(`skin-home-canvas.js` 바로 뒤 · sanitize 보다 먼저) |
| `core/lib/skin-sandbox-server.js` | allowlist 에 렌더러 **JS 와 좌표 CSS 둘 다** — 하나만 넣으면 프레임에서만 좌표가 없다 |
| `studio/preview/preview-sandbox.js` | **template.canvas 를 옮긴다** — 아래 ★ |
| `skin/sandbox/skin-sandbox-frame.js` | 주석만(이제 `renderSkin()` 이 그 키를 읽는다) |
| `skin/skin-sandbox-test.html` | 재는 쪽이 fixture · Context 를 끼우는 창구 · `?pageType=` · `?linkNav=1`(테스트 하네스 전용) |
| `studio/studio-lifecycle-scenario.html` | `sb` 의 `skin_image_slot_values` 주입 창구(기본은 빈 배열) |
| `skin/skin-home-canvas-sandbox-e2e-test.mjs` | **새 파일** — 실물 서버 · 실물 CSP 로 재는 E2E |
| `skin/skin-home-canvas-test.mjs` | `[docs]` 절 — 세 문서 로드 · allowlist 두 칸 · 아래 ★ |

★ **Studio sandbox Preview 만 캔버스가 빠지던 자리.**
`preview-sandbox.js` 는 부모가 보낸 template 을 **알려진 키만** 새
리터럴로 옮겨 프레임에 보낸다(`html` · `css` · `js` · `sides` ·
`settings`). 거기에 `canvas` 줄이 없으면 공개 화면도, Studio native
Preview 도, 공개 sandbox 도 멀쩡한데 **그 한 화면에서만** 표시 위치가
빈 채로 그려진다. 그 파일이 `js` 에 대해 같은 함정을 주석으로 적어
두었는데 캔버스가 정확히 같은 데 걸렸다. 칸 목록을 한 벌 더 만들지
않으려고 판정과 복사는 `coerceSkinHomeCanvasRenderPayload()` 에 맡긴다.

`RENDER-1B` 는 **CSP 를 한 글자도 바꾸지 않았다** — 렌더러 JS 는
`script-src 'self'`, 좌표 CSS 는 `style-src 'self'` 가 이미 허용한다.
`skin/skin-home-canvas-render.js` · `.css` · `skin/skin-render.js` 는
**한 줄도 고치지 않았다.**

### `RENDER-1A` (정적 Renderer)

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-home-canvas-render.js` | **새 파일** — `compileSkinHomeCanvas()`. DOM 생성 · 갱신 · 제거 |
| `skin/skin-home-canvas-render.css` | **새 파일** — 좌표 구조만(색 · 글꼴 · 테두리 0줄) |
| `skin/skin-render.js` | `renderSkin()` mount **끝**에서 캔버스를 그린다 + 그때만 위 CSS 를 건다 |
| `index.html` · `studio/preview/preview-frame.html` | 렌더러를 로드한다 — **이 둘뿐**이다 |
| `skin/skin-home-canvas-render-harness.html` | **새 파일** — 공개 화면과 같은 `renderSkin()` 으로 그리는 하네스(테스트용) |
| `skin/skin-home-canvas-render-e2e-test.mjs` | **새 파일** — 정적 Renderer E2E(TESTS.md §13) |
| `skin/skin-home-canvas-test.mjs` | `[docs]` 절에 로드 위치 · 좌표 CSS 에 색이 없음 · 렌더러와 계약 파일의 규칙 대조 |
| `studio/studio-lifecycle-scenario.html` | `lay` 의 `skin_image_slot_values` 를 주입할 수 있게(기본은 지금까지와 같은 빈 배열) |

`RENDER-1A` 는 그 외 어떤 파일도 고치지 않았다. 특히 **`skin/skin-home-canvas.js`
(데이터 계약)와 `skin/skin-template.js` 는 한 줄도 바뀌지 않았다** — 렌더러는
이미 있던 실행 payload 를 받기만 한다. `skin/sandbox/*` 와
`core/lib/skin-sandbox-server.js` 도 그대로다(§12-6).

### `1C` (baseHeight)

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-home-canvas.js` | `SKIN_HOME_CANVAS_BASE_HEIGHT`(844) · 필수 검증 · 실행 payload · 빈 캔버스 기본값 |
| `skin/sandbox/skin-sandbox-protocol.js` | 봉투 allowlist 에 `baseHeight` 추가 — **이걸 빼면 봉투가 캔버스를 통째로 거부한다**(strict allowlist 라서 새 칸이 곧 거부 사유가 된다) |
| `skin/skin-home-canvas-test.mjs` · `studio/studio-home-canvas-e2e-test.mjs` | `[baseheight]` 절과 왕복 검증 |

`1C` 는 그 외 어떤 파일도 고치지 않았다 — `regions` 를 통째로 보존하는
Import·Export·Save·Publish·AI 경로는 새 칸이 생겨도 그대로 지나간다.

### `1B` (계약 전체)

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

### 11-1. 정적 Renderer 는 끝났다 — 남은 것은 조작이다

**네 화면 전부 구현됐고 parity 가 검증됐다**(§12 · §12-6).

| 화면 | 상태 |
| --- | --- |
| 공개 native | **구현됨**(`RENDER-1A`) |
| Studio native Preview | **구현됨**(`RENDER-1A`) |
| 공개 sandbox | **구현됨**(`RENDER-1B`) |
| Studio sandbox Preview | **구현됨**(`RENDER-1B`) |

E2E 가 네 화면을 실제로 띄워 **DOM 을 글자 단위로, 좌표를 1px · 회전을
0.75° 안에서** 대조한다(TESTS.md §13).

남은 것은 **조작**이다 — 다음 절.

### 11-2. UI (`SELECT-1` · `HISTORY-1` · `ELEMENTS-1` 이후)

드래그 · 크기 · 회전 · 세로 손잡이 · Inspector · Undo/Redo · preset ·
사진 자동 매핑 · sticker 업로드 · widget · 그룹 선택 — **하나도 없다.**

Moveable · Selecto 는 **저장소에 들어왔지만 아직 아무것도 조작하지 않는다**
(`VENDOR-1` — §13). 파일 · 로더 · allowlist · `cspNonce` 회귀 테스트는 있고,
**Canvas 요소와의 연결과 프레임 조건부 load 메시지가 없다.** 채택 조건과
좌표 측정값은
[IMORY_HOME_CANVAS_ROADMAP.md](../plans/IMORY_HOME_CANVAS_ROADMAP.md) §8-1 ·
§8-2 에 있다. **그 Spike 를 다시 실행하지 않는다.**

### 11-3. 남은 차이

| 빈 곳 | 어디서 정하나 |
| --- | --- |
| **Moveable · Selecto 가 고정됐지만 Canvas 요소에 연결되지 않았다**(파일 · 로더 · allowlist · nonce 테스트는 있다 — §13) | `HOME-CANVAS-SELECT-1` |
| **sandbox 프레임 안에서 vendor 를 조건부로 받는 메시지**(지금 프레임은 로더조차 읽지 않는다 — §13-5) | `HOME-CANVAS-SELECT-1` |
| 390 저장 좌표 → 데스크톱 폭 변환 규칙 | `HOME-CANVAS-RESPONSIVE-1` |
| 모바일/데스크톱 좌표 override 를 둘 것인가 | `HOME-CANVAS-RESPONSIVE-1` |
| 좌우 패널(`left_sidebar` · `right_sidebar`) 안의 Canvas | `HOME-CANVAS-SIDES-1` |
| `canvas.background` · 요소별 `style` · `shape.fill/stroke` · `sticker.outline` | `DECOR-1` · `STICKER-1` |
| 캔버스를 고치는 Studio 패널(지금은 UI 가 없어서, 깨진 캔버스를 사람이 고칠 길이 Import 창뿐이다) | `HOME-CANVAS-SELECT-1` 이후 |
| `logo.fallback` 에 "아무것도 안 그림" 같은 값이 필요한가 | 아직 요청 없음 — 지금은 `site_title` 하나 |

### 11-4. 확장 방향 (기록만)

같은 `canvas` 데이터 구조를 `left_sidebar` · `right_sidebar` 항목 안에도 붙일
수 있게 만들어 두었다. `skin/skin-home-canvas.js` 의 `validateSkinCanvasData()` ·
`buildSkinCanvasRenderPayload()` 는 region 이름을 모른다 — 찾는 이름을 늘리는
것만으로 좌우 Canvas 를 붙일 수 있다. **이번 라운드는 붙이지 않았다.**

---

## 12. 정적 Renderer (`HOME-CANVAS-RENDER-1A` · `1B`)

**이 절은 지금 코드가 강제한다.** 조작 UI 는 여기 없다 — 그리기만 한다.

**렌더러는 한 벌뿐이다.** 네 화면이 같은 파일을 읽는다 — sandbox 전용
렌더러도, 화면별로 복제한 타입별 DOM 생성 코드도 없다.

| 무엇 | 파일 |
| --- | --- |
| DOM 생성 · 갱신 · 제거 | `skin/skin-home-canvas-render.js` `compileSkinHomeCanvas(root, canvas, context)` |
| 좌표 구조 CSS | `skin/skin-home-canvas-render.css` |
| 부르는 자리 | `skin/skin-render.js` `renderSkin()` mount **끝** |

### 12-1. 언제 그리는가 · 어디서 그리는가

다섯이 전부 맞을 때만 그린다.

1. HOME 화면이다
2. 지원하는 v1 실행 payload 가 있다
3. `enabled !== false`
4. HOME template 안에 `[data-imory-canvas-root]` 가 **정확히 하나**
5. 그 표식이 지금 그린 HOME template 의 것이다

앞 셋은 `resolveSkinTemplate()` 이, 넷째는 그 함수와 렌더러가 **둘 다**,
다섯째는 렌더러가 `renderSkin` 이 만든 root 안에서만 찾는 것으로 성립한다.
하나라도 어긋나면 **기존 HOME DOM 을 한 글자도 건드리지 않는다**(§3 의
fallback 표). 표식을 자동으로 만들지 않는다.

그리는 화면은 **넷**이다.

| 화면 | 어디서 도는가 |
| --- | --- |
| 공개 native HOME | `index.html` |
| Studio native Preview | `studio/preview/preview-frame.html` |
| 공개 sandbox HOME | `skin/sandbox/frame.html`(다른 origin) |
| Studio sandbox Preview | 같은 프레임 문서 — Studio Preview 안에 한 겹 더 |

넷 다 같은 `renderSkin()` 의 같은 자리에서 같은 파일을 부른다. 그래서
"어디에 그렸는가"만 다르고 결과는 같다(§12-6).

### 12-2. 좌표 — ResizeObserver 도 매 프레임 재계산도 없다

표식의 가로폭은 **template 와 스킨 CSS** 가 정한다. 플랫폼은 세로를 가로에
묶기만 한다.

```css
[data-imory-canvas-active="true"] {
  position: relative;
  aspect-ratio: var(--imory-canvas-base-width) / var(--imory-canvas-base-height);
}
```

요소의 네 값은 **백분율**이다. 백분율은 표식 상자를 기준으로 풀리므로 표식이
넓어지면 네 값이 **같은 배율로** 함께 커진다.

| CSS | 값 |
| --- | --- |
| `left` | `x / baseWidth * 100%` |
| `top` | `y / baseHeight * 100%` |
| `width` | `width / baseWidth * 100%` |
| `height` | `height / baseHeight * 100%` (숫자 height 일 때만) |
| `transform` | `rotate(<rotation>deg)` — `transform-origin` 기본값이 요소 **중심**이라 §4 가 그대로 성립한다 |

- 값은 `element.style.setProperty()` 로 쓴다(CSSOM 쓰기는 CSP 가 막지 않는다 —
  `skin/skin-layout.js` 와 같은 이유). **사용자 문자열이 CSS 문자열에 섞이지
  않는다** — 실행 payload 가 검증한 숫자만 간다.
- Renderer 가 정하지 **않는** 것: `max-width` · 가운데 정렬 · viewport 높이 ·
  `overflow` · 배경. 경계를 넘친 요소를 자를지 보일지는 **스킨 CSS** 가 고른다.
- 요소 위치로 도화지 높이를 다시 계산하지 않는다(§4-1).
- **글자 크기는 배율에 따라 바뀌지 않는다.** 이 단계는 상자를 비례로 키울 뿐
  조판을 바꾸지 않으므로, `height:"auto"` 요소의 실제 높이는 **스킨의 조판**이
  정한다. 390 저장 좌표를 데스크톱 폭으로 옮기는 규칙은 `RESPONSIVE-1` 이다.

### 12-3. 요소 DOM

최상위는 **항상 `div`** 다. 종류마다 바깥 상자의 태그가 달라지면 좌표 · 회전 ·
앞뒤 순서 규칙이 종류마다 갈라지고, 나중에 붙을 조작 손잡이도 대상 태그를 하나로
못 잡는다. 의미가 있는 태그(`p` · `ul` · `a` · `img`)는 그 안에 넣는다.

```html
<div data-imory-canvas-element
     data-imory-canvas-type="photo"
     data-imory-canvas-height="fixed"
     data-imory-edit-id="canvas_a1b2c3d4-…"></div>
```

| 속성 | 뜻 |
| --- | --- |
| `data-imory-canvas-element` | **렌더러가 만든 자식**이라는 표시(§12-5) |
| `data-imory-canvas-type` | 여섯 종류 |
| `data-imory-canvas-height` | `fixed` · `auto` |
| `data-imory-edit-id` | `element.id`. Studio Inspector 가 이 선택자로 CSS 를 고친다(§8) |
| `data-imory-canvas-hidden` | `hidden:true` 일 때. `hidden` 속성도 함께 붙어 **실제로 그려지지 않는다** |
| `data-imory-canvas-locked` | `locked:true` 일 때. **공개 화면의 모양은 바뀌지 않는다** |
| `data-imory-canvas-role` | `text` 의 의미 역할. 플랫폼이 이 값으로 글자 크기도 색도 주지 않는다 |
| `data-imory-canvas-shape` | `rect` · `ellipse` · `line` |
| `data-imory-canvas-nav-mode` | `all` · `selected` |

**배열 순서가 곧 DOM 순서이고 그것이 앞뒤 순서다** — `z-index` 를 만들지 않는다.

이 `data-imory-canvas-*` 들은 저장 경계의 화이트리스트에 **없다**
(`data-imory-canvas-root` 하나만 있다) — 그래서 스킨 HTML 에서 올 수 없고,
런타임 흔적이 저장되는 HTML 에 섞일 수도 없다.

### 12-4. 종류별로 무엇을 그리는가

| 종류 | 그리는 것 |
| --- | --- |
| `photo` · `sticker` | 슬롯에 이미지가 있으면 `<img alt="">`. **빈 슬롯이어도 wrapper 는 남고 플랫폼 placeholder 를 넣지 않는다** |
| `logo` | 이미지가 있으면 `<img>`(alt 는 **지금 블로그의 실제 제목**). 비었고 `fallback:"site_title"` 이면 제목을 `<span>` 에 `textContent` 로. 제목이 비면 아무것도 안 그린다 |
| `text` | `<p>` 하나에 `textContent`. 줄바꿈은 `white-space: pre-wrap` 이 살린다 |
| `category_nav` | `<ul><li><a href>`. `all` 은 표시 가능한 카테고리 전체, `selected` 는 `categoryIds` **순서대로**(없는 id 는 건너뛰고 **저장 데이터는 고치지 않는다**). 결과가 비면 wrapper 만 |
| `shape` | 속성 하나. **칠하지 않는다** — `ellipse` 의 `border-radius:50%` 만이 "타원이게" 하는 구조다 |

- 이미지는 **기존 이미지 슬롯**(`context.images[slot]`), 카테고리는 **기존
  Context**(`context.navigation.categories`), 제목은 `context.site.title` 이다.
  새 저장 방식도 새 라우터도 만들지 않는다.
- `href` 와 `src` 는 `isSafeSkinUrl()` 을 지난 값만 붙는다(`skin-render.js` 의
  URL 바인딩과 **같은 단일 판정 함수**). 막히면 링크와 wrapper 는 남고 주소만
  붙지 않는다.
- 사용자 문자열은 **어디에도 `innerHTML` 로 들어가지 않는다.**
- 카테고리 링크는 버튼이 아니라 실제 `<a href>` 이고, 클릭은 기존 공통 라우팅
  (`skin/skin-link-nav.js`)이 가져간다 — 별도 라우터를 만들지 않는다.

플랫폼 CSS 가 생김새에 손대는 곳은 **셋뿐**이고 전부 구조다: 이미지의
`object-fit: cover`(세로가 정해진 틀에서 사진이 눌리지 않게), 생성한 `p`/`ul` 의
`margin`·`list-style` 초기화(UA 기본값이 좌표를 밀어내지 않게), `ellipse` 의
`border-radius`. 셋 다 선택자가 0,1,x 라 스킨 CSS(0,2,x)가 언제든 덮어쓴다.

### 12-5. 다시 그리기 · 정리

- 같은 표식에 여러 번 그려도 **요소가 중복되지 않는다** — 자기가 만든 자식
  (`[data-imory-canvas-element]`)만 걷어내고 다시 만든다.
- **표식 자체와 스킨이 표식에 준 class · 속성 · 스킨이 표식 안에 직접 적어 둔
  자식은 지우지 않는다.**
- 캔버스가 사라지거나 꺼지면 만든 DOM 과 활성 표시(`data-imory-canvas-active` ·
  `-version` · 도화지 custom property)만 정리한다.
- **입력 Canvas 데이터와 Context 를 mutate 하지 않는다.**
- 늦게 도착한 응답이 최신 화면을 덮지 않게 하는 것은 이 파일이 아니라 화면을
  여는 쪽의 기존 요청 순번이다(`skin/skin-home.js` 등) — 렌더러는 `renderSkin()`
  이 mount 를 끝내는 동기 시점에만 돈다.

### 12-6. sandbox — 같은 렌더러가 프레임 안에서도 돈다 (`RENDER-1B`)

프레임 문서(`skin/sandbox/frame.html`)가 `skin-home-canvas-render.js` 를
**공개 문서와 같은 자리**(`skin-home-canvas.js` 뒤 · sanitize 앞)에서
로드한다. 그 뒤는 프레임 안에서도 `renderSkin()` 이 같은 조건으로 같은
전역을 부른다.

| 무엇 | 어디 |
| --- | --- |
| 렌더러 JS | `SANDBOX_ALLOWED_PATHS` 의 `/skin/skin-home-canvas-render.js` |
| 좌표 CSS | 같은 목록의 `/skin/skin-home-canvas-render.css` |
| 실행 데이터 | 이미 있던 봉투 — `skin-sandbox-host.js` 가 싣고 `isSandboxHomeCanvas()` 가 strict allowlist 로 다시 검사하며 `skin-sandbox-frame.js` 가 `skin.canvas` 로 옮긴다(§9) |
| Studio sandbox 경로 | `preview-sandbox.js` 가 template 의 `canvas` 를 옮긴다(§10 의 ★) |

- **둘 다** allowlist 에 있어야 한다. JS 만 넣으면 요소는 생기지만 좌표가
  없고, CSS 만 넣으면 아무것도 생기지 않는다. allowlist 는 **pathname 만**
  보므로 `?v=APP_BUILD_VERSION` 이 붙어도 같은 판정이다.
- **CSP 는 한 글자도 바뀌지 않았다.** 렌더러 JS 는 `script-src 'self'`,
  좌표 CSS 는 `style-src 'self'` 가 이미 허용한다. 좌표는
  `element.style.setProperty()`(CSSOM)로 쓰므로 `style-src` 에
  `'unsafe-inline'` 이 없어도 걸리지 않는다 — E2E 가 실제 CSP 아래에서
  위반 0건과 적용된 좌표를 함께 잰다.
- **부모는 frame DOM 에 손대지 않는다.** 캔버스 때문에 생긴 새 메시지도
  없다 — 데이터는 기존 봉투로, 링크 클릭은 기존 `IMORY_NAVIGATE`(주소가
  아니라 부모가 발급한 정수 `navId` 하나)로 간다.
- 이미지 슬롯 주소는 프레임 CSP 의 `img-src` 가 허용하는 출처여야 한다
  (배포에서는 Supabase Storage). 투영 함수가 루트 상대 주소를 부모 origin
  기준 절대 주소로 바꿔 보내는 기존 규칙 그대로다.

### 12-7. 기존 스킨

- `home_canvas` 가 없는 스킨: **DOM 변화 0.** 플랫폼 CSS link 조차 붙지 않는다
  (`renderSkin` 이 `skin.canvas` 가 있을 때만 건다).
- 표식이 없는 스킨: 렌더 결과가 **글자 단위로** 캔버스 이전과 같다.
- CATEGORY · POST · BANNER 는 표식이 있어도 그리지 않는다(v1 의 캔버스는 HOME
  한 장이다).
- 기존 스킨에 표식 · 요소 · 리스너를 자동으로 넣지 않는다. 기본 editorial 스킨도
  변환하지 않는다.
- **리스너를 하나도 만들지 않는다** — 정적 렌더러라 전역 이벤트가 없다.
- 위 전부가 **네 화면에서 같다** — sandbox 프레임에서도 캔버스가 없는
  스킨은 DOM 이 한 글자도 바뀌지 않고, CATEGORY · POST · BANNER 는 표식이
  있어도 그리지 않는다.

`APP_BUILD_VERSION` 은 이번에 올리지 않았다(배포하지 않았다).

---

## 13. 편집기 라이브러리 고정 (`HOME-CANVAS-VENDOR-1`)

**이 절은 지금 코드가 강제한다.** 다만 강제하는 것은 "어떻게 놓여 있는가"
뿐이다 — **조작은 한 줄도 없다**(§13-4).

### 13-1. 무엇이 고정됐나

| 라이브러리 | 버전 | 형태 | 라이선스 | 파일 |
| --- | ---: | --- | --- | --- |
| Moveable | **0.53.0** | UMD minified | MIT | `studio/vendor/home-canvas/moveable-0.53.0.min.js` |
| Selecto | **1.26.3** | UMD minified | MIT | `studio/vendor/home-canvas/selecto-1.26.3.min.js` |

공식 npm registry tarball 의 `dist/*.min.js` 를 **바이트 그대로** 두었다.
재번들 · 재압축 · 재minify 하지 않았고 첫 줄의 MIT 배너도 그대로다. ESM
빌드는 넣지 않았다 — bare specifier 가 남아 있고 이 저장소에는 번들러가
없다(CLAUDE.md §1).

정확한 크기 · SHA-256 · tarball integrity · 보관 규칙은
[studio/vendor/home-canvas/README.md](../../studio/vendor/home-canvas/README.md)
가 **단일 원천**이고, `studio/studio-home-canvas-vendor-e2e-test.mjs` 가
그 표를 읽어 실제 파일과 대조한다. 값을 다른 문서에 복사해 적지 않는다.

버전을 파일 이름에 적는다. 주소가 그대로면 버전이 바뀐 것을 아무도 눈치채지
못하기 때문이다.

### 13-2. 어떻게 받는가 — 부를 때만

```js
const { Moveable, Selecto } = await ensureHomeCanvasEditorVendors();
```

[studio/studio-home-canvas-vendor.js](../../studio/studio-home-canvas-vendor.js)
가 주는 전역 하나다. 규칙:

- 같은 문서에서 몇 번을 불러도 **UMD 당 요청 한 번**.
- 동시에 불러도 **같은 Promise**.
- 하나라도 실패하면 **어떤 파일이 실패했는지 적힌 Error** 로 거절한다.
  실패한 Promise 는 표에 남기지 않는다 — 다시 시도할 수 있다.
- 로드 뒤 전역 `Moveable` · `Selecto` 가 실제로 생겼는지 확인한다. 200 인
  SPA fallback HTML 을 성공으로 보지 않으려는 것과 같은 관문이다.
- 주소는 **절대 경로 + `?v=${APP_BUILD_VERSION}`**. 값을 복사해 적지 않고
  `core/lib/build-version.js` 의 전역에서 읽는다(CLAUDE.md §4).

★ `loadVersionedScripts()` 를 쓰지 않는다. 그 loader 넷은 전부
`document.write` 라 문서를 **파싱하는 동안에만** 쓸 수 있고, 이 로더는
사람이 편집을 켠 뒤에 불린다. 같은 일을 동적 `<script>` 로 하되 붙이는
주소는 똑같다. **어떤 HTML 에도 고정 URL vendor `<script>` 를 만들지
않는다**(테스트가 다섯 문서에서 이것을 검사한다).

### 13-3. `cspNonce` — 부르는 쪽이 넘긴다

두 라이브러리는 런타임에 `<style data-styled-id="…">` 를 만들어 붙인다.
sandbox 프레임의 CSP 는 `style-src 'self' 'nonce-…'` 라(§12-6 · SANDBOX-1)
nonce 를 넘기지 않으면 그 style 이 통째로 막힌다. 로더는 이것을 대신해 주지
않는다 — **생성자에 `cspNonce` 를 넘기는 것은 부르는 쪽의 몫**이다.

`studio/studio-home-canvas-vendor-e2e-test.mjs --only=nonce` 가 **배포되는 그
`buildSandboxCsp()`** 로 만든 정책 아래에서 대조군 넷을 실측한다(2026-09-21).

| 대조군 | Moveable nonce | Selecto nonce | style-src 위반 | 실측 결과 |
| --- | --- | --- | ---: | --- |
| `both` | 전달 | 전달 | **0** | 두 style 적용 · Moveable 핸들 **14×14** · Selecto 영역 `fixed` · `1px` 테두리 · `rgba(68,170,255,0.5)` · 드래그 정상 |
| `moveableOnly` | 전달 | 미전달 | 1 | **Selecto** 의 style 만 막힘 |
| `selectoOnly` | 미전달 | 전달 | 1 | **Moveable** 의 style 만 막힘 · 핸들 **91×0 으로 붕괴** |
| `neither` | 미전달 | 미전달 | 2 | 둘 다 막힘 |

귀속은 위반 **건수가 아니라** 각 `<style data-styled-id>` 요소의
`el.sheet` 로 가른다. CSP 는 요소의 삽입이 아니라 **적용**을 막으므로 막힌
style 은 DOM 에 남고 `sheet` 만 `null` 이 된다.

금지한 것은 그대로다 — `unsafe-inline` 없음 · CSP 완화 없음 ·
`document.createElement` monkey patch 없음 · UMD 파일 수정 없음 · 런타임
style 에 사후적으로 nonce 를 심는 짓 없음.

★ **Moveable 0.53.0 의 `cspNonce` 는 작동하지만 deprecated 다.** 그것이
버전을 정확히 고정하는 이유다 — 근거는 이 패키지가 끌어오는
`react-moveable@0.56.0` 의 `declaration/types.d.ts` 에 붙은 `@deprecated`
이고, 대체 옵션은 확인되지 않았다. 버전을 올리면 그 옵션이 조용히 사라져
프레임 안에서 핸들이 CSP 에 막힐 수 있으므로, 올리기 전에 위 대조군 넷을
새 파일로 다시 돌린다.

### 13-4. 지금 아무도 부르지 않는다

`studio/index.html` 과 `studio/studio-lifecycle-scenario.html` 이 **로더
한 파일**(3KB)을 읽는다. UMD 둘(약 300KB)은 `ensureHomeCanvasEditorVendors()`
를 부른 뒤에야 온다. **이 라운드에는 부르는 곳이 없다.**

| 화면 | 로더 | UMD 둘 |
| --- | --- | --- |
| 공개 `index.html` | 안 읽음 | **요청 0** |
| 공개 native HOME | 안 읽음 | **요청 0** |
| 공개 sandbox 프레임 | 안 읽음 | **요청 0** |
| Studio(열기만) | 읽음 | **요청 0** |

**공개 화면의 전송 비용 증가는 0 이다.** 운영 HOME Renderer(§12)는 vendor 의
존재를 모른 채 그대로 돈다.

### 13-5. sandbox 는 길만 열어 두었다

`core/lib/skin-sandbox-server.js` 의 `SANDBOX_ALLOWED_PATHS` 에 **두 vendor
JS 경로 정확히 두 줄**이 올라가 있다. 그래서 sandbox origin 에서 직접
요청하면 올바른 Content-Type 으로 200 이 나오고(`?v=` 가 붙어도 같다 —
allowlist 는 pathname 만 본다), 평상시 공개 sandbox 렌더에서는 **요청 자체가
생기지 않는다.**

**프레임 HTML 에 vendor `<script>` 를 정적으로 넣지 않았다.** 프레임 안의
조건부 load 와 Studio→frame 메시지는 `HOME-CANVAS-SELECT-1` 의 일이다.

★ 이것이 sandbox origin 에서 나가는 **유일한 `/studio/` 경로**다. 디렉터리를
연 것이 아니라 파일 두 개를 적은 것이고, 로더 자신
(`/studio/studio-home-canvas-vendor.js`) 과 `studio/studio-preview.js` 를
비롯한 나머지 Studio 코드는 **여전히 404** 다. 그럴 수 있는 이유는 이 둘이
Imory 코드가 아니라 재가공하지 않은 MIT third-party UMD 이기 때문이다 —
우리 데이터도 인증도 화면 구조도 들어 있지 않다.
