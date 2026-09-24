# HOME Canvas 그룹 — 저장 구조 · 좌표 · Layers 계약 (`HOME-CANVAS-GROUP-CONTRACT-1`)

> **PLAN 이다. 다만 `GROUP-1A`(2026-09-23)와 `GROUP-1B`(2026-09-24)는
> 구현됐다.**
>
> **구현된 범위는 이 문서가 아니라 계약 문서에 있다** —
> [§38](../contracts/IMORY_HOME_CANVAS_CONTRACT.md#38-영구-그룹--저장--폴더--만들기해제넣기빼기-home-canvas-group-1a)(저장 ·
> 폴더 · 만들기/해제/넣기/빼기)과
> [§39](../contracts/IMORY_HOME_CANVAS_CONTRACT.md#39-그룹-전체-이동-home-canvas-group-1b)(그룹
> 전체 이동). 이 문서에서 **아직 계획인 것은 §4-6 · §4-7(그룹 크기 ·
> 회전) · §9 의 `1C`** 뿐이다. 나머지 절은 그 구현의 **근거 기록**으로
> 읽는다.
>
> 원래 라운드(`HOME-CANVAS-GROUP-CONTRACT-1`, 2026-09-23)는 **문서만**
> 바꿨다 — 제품 코드 · 렌더러 · Studio UI · validator · 순수 writer ·
> sandbox 프로토콜 · `APP_BUILD_VERSION` 전부 무변경이었다.
>
> 이 문서는 [STUDIO Layers 계획 §2-7](./IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md)
> 이 미리 지정한 그 문서다 — "`group` 노드를 즉흥적으로 추가하지 않는다.
> 별도 `HOME-CANVAS-GROUP-CONTRACT-1` 에서 저장 모양 · 해제 · 중첩 금지 ·
> v1/v2 호환을 먼저 확정한다."

기준: `main@79dbc32`(설계) · `main@923840e`(`GROUP-1A` 구현) ·
`main@63006d7`(`GROUP-1B` 구현).

---

## 0-0. `GROUP-1A` 에서 **사용자가 확정한 것** — 이 문서보다 우선한다

구현 지시(2026-09-23)가 아래를 정했고, 이 문서의 해당 절과 다르면 **아래가
맞다**. 계약 문서 §38 이 그 결과다.

| 결정 | 이 문서의 원래 안 | **확정된 것** |
| --- | --- | --- |
| 저장 구조 | B-2 권장(§2-3) | **B-2**(`canvas.groups` 의 id 참조) — 그대로 |
| `members` 최소 | 1개 이상 · 하나짜리 그룹 허용(§4-11) | **2개 이상.** 빼기로 하나만 남으면 **같은 커밋에서 자동 해제**하고 마지막 요소는 일반 레이어로 돌아온다 |
| 이름 변경 UI | `1A` 에 넣지 않는다(§6-2) | **`1A` 에 포함.** 더블클릭 · 행의 `✎` · 패널의 `이름 변경` 이 같은 인라인 입력을 연다 |
| Import 의 낡은 명단 | "봐준다"(검증만 통과 — §3-2) | **봐주는 데서 더 나아가 고친다.** 없는 id · 중복 · 두 그룹에 걸친 요소 · 어긋난 공간을 빼고, 둘 미만이 된 그룹을 해제한 뒤 **무엇을 얼마나 고쳤는지 알린다**(계약 §38-8) |
| Preview 직접 클릭 | 프레임 → **그룹** → 요소 세 단계(§6-3) | **그룹 단계를 넣지 않는다.** 지금처럼 개별 요소 선택이 먼저이고, 그룹 전체 선택은 Layers 의 폴더 행에서만 들어간다 |
| 그룹 단위 순서 이동 | 결정 사항으로 올림(§11-2 의 1) | **`1A` 에 넣지 않는다**(겹침 순서가 바뀐다 — §5 의 ★) |
| 그룹의 `hidden`/`locked` | 갖지 않는다(§6-6) | **그대로.** 저장 칸이 확정되지 않았으므로 폴더 행에 눈 · 자물쇠를 **노출하지 않는다**. 파생 표시(전부 숨김이면 흐리게)만 한다 |
| 그룹 크기 조절 | 균등 배율 권장(§4-6) | **균등 배율만**(후속 `1C`) — 그대로 |

---

## 0. 무엇을 정하고 무엇을 정하지 않나

**정하는 것.** 영구 그룹의 저장 모양 · 좌표 계약 · Layers UX · Undo 규칙 ·
version 호환 · 세 단계(`GROUP-1A` · `1B` · `1C`)의 경계.

**정하지 않는 것.** `main_visual` 내부 배치는 **그룹이 아니다.** 그것은
지금 있는 그대로 **프레임 안에 넣기/빼기**(계약 §28 의 `attach`/`detach`)
이고 앞으로도 그 이름으로 남는다. 옛 계획의
`HOME-CANVAS-V2-GROUP-1A`(여러 overlay 를 `main_visual` 에 한꺼번에
attach 하고 primary 를 고르는 내용)는 **폐기한다** — §10.

두 기능이 다른 것이라는 판단이 이 문서 전체의 출발점이다.

| | 프레임 안에 넣기 (`main_visual`) | 그룹 (이 문서) |
| --- | --- | --- |
| 무엇인가 | **자가 바뀐다** — 도화지 좌표 ↔ 프레임 내부 좌표 | **자가 안 바뀐다** — 묶기만 한다 |
| 저장 | 요소가 배열을 옮겨 다닌다(`overlays` ↔ `props.elements`) | 요소는 **제자리에** 있고 명단만 는다 |
| 화면 | DOM 부모가 바뀐다(상속 · 겹침 순서가 바뀔 수 있다 — 계약 §29-6) | **한 픽셀도 안 바뀐다** |
| 무엇이 함께 커지나 | 프레임이 커지면 `transform` 자식이 비례로 커진다 | 아무것도 자동으로 커지지 않는다 |
| 지금 상태 | **구현됨**(계약 §28 · §32) | **없음** — 이 문서가 처음 정한다 |

---

## 1. 지금 구조 — 코드에서 읽은 것

### 1-1. v2 JSON 저장 구조와 validator

저장 위치는 `SkinPackage.regions` 의 `home_canvas` 항목 하나다(계약 §2).
새 최상위 필드는 없다.

```text
canvas(version:2)
├─ baseWidth  390 고정 · baseHeight  양수 필수
├─ flow { direction, padding, gap, blocks[] }
│   └─ block { id, type, width, height, align, margin, maxWidth, hidden, locked, props }
│       └─ type:"main_visual" 이면 props { baseWidth, baseHeight, primaryId, elements[] }
│           └─ frame element { id, type, follow, x, y, width, height, rotation, hidden, locked, pin, props }
└─ overlays[]  ← 항목 하나가 **v1 요소와 정확히 같은 모양**
```

| 확인한 것 | 어디 | 결과 |
| --- | --- | --- |
| version 분기 | `skin/skin-home-canvas.js` `validateSkinCanvasData()` | `2` → `validateSkinCanvasV2Data()`, `1` → v1 규칙, **그 밖 → `{ok:true, future:true, renderable:false}`**(보존만) |
| v2 검증 본체 | `skin/skin-home-canvas-v2.js` `validateSkinCanvasV2Data()` | baseWidth · baseHeight · **최상위 `elements` 거부** · flow · overlays |
| **모르는 칸을 거부하지 않는다** | 같은 함수 · `validateSkinCanvasElement()` · `validateSkinCanvasBlock()` | canvas · 블록 · 요소 어디에도 allowlist 형 거부가 **없다**. 모르는 칸은 통과하고 보존된다(계약 §9) |
| 한 이름 공간 | 같은 함수의 `const seen = new Set()` | 블록 id · 프레임 내부 요소 id · overlay id 가 **전부 한 공간**이고 중복이면 Import 거부 |
| 실행 payload | `buildSkinCanvasV2RenderPayload()` | **알려진 칸만** 새 리터럴로 만든다 — 모르는 칸은 payload 에 **하나도 실리지 않는다** |
| Import 입구 | `skin/skin-home-canvas.js` `validateSkinHomeCanvasRegions()` | regions 중 `home_canvas` 이름만 본다. 같은 이름이 둘이면 둘 다 검사 |

★ **이 표의 3번 줄이 이 문서의 모든 결정을 지탱한다** — `canvas` 에 새
칸을 하나 더 두어도 **지금 배포된 검증기가 그것을 거부하지 않고 보존한다.**

### 1-2. 소유권과 좌표계

| 층 | 배열 | 자(ruler) | 위치를 정하는 칸 |
| --- | --- | --- | --- |
| 자동 배치 블록 | `flow.blocks` | 흐름 층 content box | **좌표 없음** — 순서 · `align` · `margin` |
| 프레임 내부 `follow:"transform"` | `block.props.elements` | 프레임 내부 자(`props.baseWidth`) | `x` · `y` · `width` · `height` |
| 프레임 내부 `follow:"pin"` | 같은 배열 | **프레임 상자 자** | `pin.offset` + `anchor`/`origin`, 크기는 프레임 상자 자 |
| 페이지 자유 장식 | `overlays` | 도화지 자(`canvas.baseWidth`) | `x` · `y` · `width` · `height` |

배율은 둘이다(로드맵 §14-6). `S_page` = 실제 도화지 폭 ÷ `baseWidth`,
`S_frame` = 프레임의 해결된 폭 ÷ `props.baseWidth`. 데스크톱 최대 폭이
물리면 프레임 상자 자와 도화지 자가 갈리고 그 비가 `pageScale` 이다
(계약 §30-3).

**선택 하나마다 자 하나**를 정하는 곳이
`studio/inspector/studio-canvas-v2-space.js` `studioCanvasV2Space(id)` 이고,
자 위의 값을 storage 칸으로 옮기는 곳이 같은 파일
`planStudioCanvasV2Transform(kind, id, next, expected)` 다. **이 두 함수가
overlay · 프레임 transform · 프레임 pin 셋을 이미 전부 안다** — 이 문서의
그룹 조작은 새 좌표 계산을 만들지 않고 이 둘을 요소마다 한 번씩 부른다.

### 1-3. Layers 트리 · 순서 · attach/detach

| 무엇 | 어디 |
| --- | --- |
| 트리의 행 목록 | `skin/skin-home-canvas-write-v2.js` `listSkinHomeCanvasV2Nodes(canvas)` → `[{ id, kind, type, parentId, index }]`, **화면 순서** |
| id 하나로 찾기 | 같은 파일 `findSkinHomeCanvasV2Node(canvas, id)` → `{ kind, node, index, parentId }`, `kind` 는 `block`·`frame-element`·`overlay` **셋** |
| 트리 그리기 | `studio/inspector/studio-canvas-layers-tree.js` `studioCanvasLayersRows()` · `studio-canvas-layers-row.js` `studioCanvasLayersRowNode()` (`STUDIO-CANVAS-LAYERS-SPLIT-1` 이전에는 둘 다 `studio-canvas-layers.js`) |
| 접힘 상태 | `studio/inspector/studio-canvas-layers.js` `const studioCanvasLayersCollapsed = new Set()` — **이미 저장 데이터가 아니다**(Studio UI 상태) |
| drop 판정 | `studio/inspector/studio-canvas-layers-drag.js` `studioCanvasLayersDropPlan(row, x, y)` — 폴더 행의 **가운데 띠**(위아래 25% 제외)가 attach, `페이지 장식` 제목이 detach, 나머지는 같은 부모 안 순서 |
| 여러 행 끌기 | 같은 파일: 지금은 `"여러 요소 이동은 다음 단계에서 지원합니다 — 하나만 골라 주세요."` 로 **거부** |
| 구조 입구 | `studio/inspector/studio-canvas-selection.js` `commitStudioCanvasStructureNode({op,id,…,via})`, `op` 여섯(`attach`·`detach`·`remove`·`reorder`·`primary`·`flag`), `via` 둘(`selection`·`layers`) |
| draft 에 쓰기 | `studio/studio-preview.js` `moveStudioCanvasV2Node(request)` — 순수 함수 호출 → `captureStudioWorkingChange()` / `recordStudioWorkingChange()` → dirty · revision · 다시 그리기 |
| 순수 writer | `skin/skin-home-canvas-write-v2.js` §5 · §6 — 전부 **불변**이고, 옮긴 뒤 `validateSkinCanvasV2Data()` 로 **캔버스 전체를 다시 검증**한다 |

### 1-4. 선택 · Moveable · Selecto

| 무엇 | 어디 | 지금 상태 |
| --- | --- | --- |
| 선택 상태 하나 | `studio-canvas-selection.js` `studioCanvasSelection = { ids, primaryId, items, generation }` | **이미 배열**이다. 상한 `STUDIO_CANVAS_MAX_SELECTED = 64` |
| 확정 한 곳 | 같은 파일 `applyStudioCanvasSelection(entries, options)` | set · clear · sync · reconcile · propose 가 전부 이 함수를 지난다 |
| 프레임의 제안 | `proposeStudioCanvasSelection(proposal)` | lasso · Shift 결과를 draft 로 다시 확인하고 **한 id 라도 어긋나면 전체 거부** |
| 프레임 진입 판정 | `studioCanvasSelectTargetId(hitId)` | 프레임 내부 요소를 프레임 **밖에서** 누르면 프레임 블록을 고른다. **새 상태 없이 지금 선택으로 읽는다** |
| Moveable 틀 | `skin/skin-home-canvas-editor-runtime.js` `setMoveableTarget(elements)` | 0개 → `null`, 1개 → 단일 틀, **2개 이상 → 배열을 주면 0.53.0 이 스스로 `MoveableGroup`** |
| 그룹에서 꺼 둔 것 | 같은 함수 | `dragTarget = null` · `renderDirections = []` · `rotationPosition = "none"` — **그룹 틀은 그려지지만 조작 손잡이가 하나도 없다** |

★ 즉 **그룹 틀은 이미 화면에 그려진다.** `GROUP-1B` · `1C` 가 하는 일은
그 틀에 손잡이를 켜고, 들어온 제스처를 요소마다 나눠 주는 것뿐이다.

### 1-5. native Preview 와 sandbox

- 렌더러는 **한 벌**이다(`skin/skin-home-canvas-render.js`). 네 화면이 같은
  파일을 읽는다(계약 §12).
- sandbox 봉투는 **strict allowlist** 다 —
  `skin/sandbox/skin-sandbox-protocol.js` 의 `isSandboxCanvasBlock` ·
  `isSandboxCanvasFrameElement` 등이 `hasOnlyKnownSandboxKeys()` 로 칸을
  못박는다. **payload 에 새 칸이 생기면 이 파일이 반드시 함께 바뀐다.**
- 반대로 payload 에 **안 실리는 값은 이 파일과 무관하다.**
- 프레임이 부모에 올리는 보고는 `preview:canvas-layout`(프레임의 흐름 안
  자리, 도화지 폭의 분수) · `preview:canvas-box`(도화지의 화면 상자) ·
  `preview:canvas-propose`(선택 제안) · `preview:canvas-transform`(조작
  요청)이고, native 와 sandbox 두 전송로가 **같은 부모 메시지**로 도착한다.

### 1-6. Save · Export/Import · Publish · Undo

| 경로 | regions 를 어떻게 다루나 |
| --- | --- |
| Save · Publish | `currentWorkingSkin.regions` 를 그대로 싣는다. 순수 writer 가 준 **새 regions 배열**이 곧 draft 다 |
| Export | `skin/skin-package-export.js` — `regions` 를 통째로 깊은 복사한다(칸을 고르지 않는다) |
| Import | `skin/skin-package-import.js` → `validateSkinHomeCanvasRegions(regions)`. **아는 이름 하나만** 검사하고 나머지 region 은 손대지 않는다 |
| AI | `functions/api/skin-ai.js` — `regions` 는 모델이 만들지 않는다. 요청으로 받은 **지금 draft 의 regions 를 그대로** 돌려준다(`currentPackage.regions`) |
| Undo | `captureStudioWorkingChange()` / `recordStudioWorkingChange()` — **working skin 전체 스냅샷 한 칸**이다. 커밋 하나가 곧 Undo 한 칸이고, 노드 수와 무관하다 |

### 1-7. 모르는 타입 · 모르는 칸을 만나면

| 무엇이 모르는 것인가 | 지금 배포의 동작 |
| --- | --- |
| `canvas.version` 이 3 이상 | **보존**. `renderable:false` 라 실행 payload 를 안 만들고, HOME 은 기존 화면으로 fallback 한다(계약 §3). Studio 선택도 꺼진다 |
| v2 블록의 모르는 `type` | **Import 거부**(`SKIN_HOME_CANVAS_BLOCK_TYPES` 다섯 밖) |
| overlay · 프레임 내부 요소의 모르는 `type` | **Import 거부**(`SKIN_HOME_CANVAS_ELEMENT_TYPES` 여섯 밖) |
| 요소 · 블록 · canvas 의 **모르는 칸** | **통과 · 보존**. 실행 payload 에는 안 실린다 |
| regions 의 모르는 **항목 이름** | 통과 · 보존 |

★ **이 표의 2·3번 줄과 4번 줄의 차이가 저장 구조 선택의 전부다.** 새
`type` 을 만들면 옛 배포가 **캔버스 전체를 못 그리고**, 새 **칸**을 만들면
옛 배포가 **지금과 똑같이 그린다.**

---

## 2. 저장 구조 후보 비교

### 2-1. 후보 셋

| | 모양 |
| --- | --- |
| **A** | `group` 노드가 자식 element 객체를 **직접 소유**<br>`overlays: [{ id:"canvas_g1", type:"group", x, y, children:[ … ] }]` |
| **B** | `group` 노드가 **자식 id 목록만** 소유하고 element 는 기존 배열에 유지<br>B-1: 그 노드를 `overlays`/`elements` 안에 둔다 · **B-2: `canvas.groups` 새 배열에 둔다** |
| **C** | element 는 기존 자리에 두고 **`groupId` 한 칸**만 저장 |

### 2-2. 비교

| 축 | A (자식 소유) | B-1 (id 목록 · 같은 배열) | **B-2 (id 목록 · `canvas.groups`)** | C (`groupId` 칸) |
| --- | --- | --- | --- | --- |
| 단일 소유권 | 배열이 곧 소유라 자명 | 자명하지 않다 — 검증으로 막아야 | 자명하지 않다 — **검증으로 막는다**(id 는 한 그룹에만) | 칸이 하나라 **구조적으로 자명** |
| 중복 참조 가능성 | 없다 | 있다 → 거부 | 있다 → 거부 | 없다 |
| 순서 변경 | 그룹 안/밖이 **다른 배열**이라 두 벌의 순서 규칙이 생긴다 | 한 배열 안에 노드와 요소가 섞여 index 의 뜻이 흐려진다 | 배열은 **지금 셋 그대로** — `writeSkinHomeCanvasV2ReorderNode` 무변경 | 배열 무변경 |
| 폴더 안팎 이동 | 요소 객체를 **옮겨 적어야** 한다 + 좌표 변환 | 명단만 고친다 | **명단만 고친다 · 좌표 0칸** | 칸 하나만 고친다 · 좌표 0칸 |
| 그룹 삭제 · 해제 | 해제 = 자식을 부모 배열로 **되올리기** + 좌표 역변환 | 노드 하나 제거 | **노드 하나 제거 · 좌표 0칸** | 모든 멤버의 칸을 지운다(N번 쓰기) |
| 저장 · 불러오기 | 새 중첩 단계 | 새 노드 종류 | **새 선택 칸 하나** | **새 요소 칸 하나** |
| Undo | 스냅샷 한 칸 — 셋 다 같다 | 같다 | 같다 | 같다 |
| validator 변경 | 중첩 재귀 · 새 type · 새 좌표 자 | 새 type + 명단 검사 | **새 배열 하나만**(재귀 없음) | 요소 칸 하나만 |
| renderer 변경 | **크다** — 새 DOM 단계 · 새 배율 | 새 노드를 건너뛰는 분기 | **없다**(payload 에 안 싣는다) | **없다** |
| sandbox 프로토콜 | 새 노드 모양 전부 | 새 노드 모양 전부 | **무변경** | **무변경** |
| 좌표 변환 난이도 | 묶기/해제마다 **모든 자식 좌표 재계산**(3자리 반올림 누적) | 자식 좌표 그대로 | **자식 좌표 그대로 — 변환 0** | 자식 좌표 그대로 |
| 깨진 child id | 있을 수 없다(객체를 갖고 있다) | 명단에 남는다 → 정책 필요 | **명단에 남는다 → 정책 필요** | 있을 수 없다(칸이 요소에 있다) |
| 그룹 이름 · 순서 | 노드가 갖는다 | 노드가 갖는다 | **노드가 갖는다** | **둘 곳이 없다** |
| 빈 그룹 | 표현 가능 | 표현 가능 | 표현 가능 | **표현 불가**(멤버가 곧 그룹이다) |
| 구버전 Studio | **캔버스 전체가 안 그려진다**(모르는 type → Import 거부 · payload 없음) | **같은 문제** | **지금과 똑같이 그려진다**(모르는 canvas 칸 = 보존) | **지금과 똑같이 그려진다**(모르는 요소 칸 = 보존) |

### 2-3. 권장 — **B-2**

근거 넷.

1. **구버전이 그림을 잃지 않는다.** A·B-1 은 `type:"group"` 을 만드는데 그
   값은 `SKIN_HOME_CANVAS_BLOCK_TYPES` 에도 `SKIN_HOME_CANVAS_ELEMENT_TYPES`
   에도 없다 — 옛 배포에서 **Import 가 거부되고**, 이미 저장된 스킨은
   `buildSkinCanvasRenderPayload()` 가 `undefined` 를 돌려주어 **HOME 이
   통째로 기존 화면으로 떨어진다**(§1-7). 그룹을 한 번 만들면 되돌릴 수
   없는 종류의 사고다. B-2 · C 는 "모르는 칸은 보존"에 그대로 얹힌다.
2. **화면이 안 바뀐다는 요구가 공짜로 성립한다.** 그룹이 좌표를 갖지 않고
   자식 좌표를 **한 칸도 건드리지 않으므로**, 만들기 · 해제 · 넣기 · 빼기의
   화면 보존이 "계산해서 맞춘 결과"가 아니라 **구조적 사실**이다(왕복 오차
   0). A 는 묶기마다 전 자식을 재계산하고 3자리 반올림이 누적된다.
3. **C 가 못 하는 것 셋을 B-2 는 한다** — 그룹 **이름** · 그룹 **자체의
   순서** · **빈 그룹**. 사용자가 요구한 "기본 이름 그룹 1·2…"와 "그룹
   삭제와 해제를 구분"은 그룹을 가리킬 **객체**가 있어야 성립한다. C 에서
   그룹은 문자열이 흩어져 있는 것뿐이라 마지막 멤버가 사라지면 조용히
   증발하고, 이름을 바꾸려면 멤버 전부를 다시 쓴다.
4. **렌더러 · sandbox 프로토콜이 무변경이다.** 그룹은 실행 payload에 실리지
   않는다 — 그리는 데 필요 없기 때문이다. 그래서 native/sandbox parity 가
   "맞춰야 할 것"이 아니라 **처음부터 같은 것**이 된다.

B-2 가 짊어지는 비용은 하나다: **명단이 낡을 수 있다.** 그 대가는 §7 의
"그룹은 조언이다(advisory)" 규칙으로 갚는다.

---

## 3. 확정한 저장 모양

### 3-1. `canvas.groups`

```json
{
  "name": "home_canvas",
  "enabled": true,
  "canvas": {
    "version": 2,
    "baseWidth": 390,
    "baseHeight": 1240,
    "flow": { "direction": "column", "padding": {}, "gap": 20, "blocks": [ "…" ] },
    "overlays": [ "…" ],

    "groups": [
      {
        "id": "canvas_g1",
        "name": "그룹 1",
        "members": ["canvas_o1number", "canvas_o2petal"]
      },
      {
        "id": "canvas_g2",
        "name": "그룹 2",
        "members": ["canvas_m2left", "canvas_m3right", "canvas_m4cap"]
      }
    ]
  }
}
```

| 칸 | 필수 | 규칙 |
| --- | --- | --- |
| `groups` | | `canvas` 의 배열. 빠지면 그룹이 없다는 뜻이다(`[]` 와 같다). **`version:2` 에서만 뜻이 있다** |
| `id` | ✔ | **v1 §5-1 과 같은 규칙**(`/^[A-Za-z][A-Za-z0-9_-]{0,63}$/`, `canvas_` 접두 권장). **블록 · 프레임 내부 요소 · overlay 와 한 이름 공간**이다 |
| `name` | | 1~40자 문자열. 빠지면 Layers 가 `그룹` + 배열 자리로 표시한다. Studio 는 언제나 적는다 |
| `members` | ✔ | id 문자열 배열. **1개 이상** · 200개 이하 · 그룹 안 중복 금지 · **그룹끼리 겹침 금지** |

- **그룹은 좌표를 갖지 않는다.** `x` · `y` · `width` · `height` ·
  `rotation` · `hidden` · `locked` 칸이 **없다**. 자식의 값에서 파생되고,
  그래서 "그룹 좌표와 자식 좌표 중 무엇이 진짜인가"라는 질문이 생기지
  않는다(§4-3).
- **좌표 공간은 저장하지 않고 파생한다.** 멤버가 전부 `overlay` 면 도화지
  자, 전부 같은 프레임의 `frame-element` 면 그 프레임 자다(§4-4). `scope`
  칸을 따로 두면 같은 사실을 두 곳이 말하게 된다(로드맵 §14-4 "같은 의미의 칸을
  두 벌 만들지 않는다").
- **중첩 금지.** 멤버는 요소 id 만이다 — 다른 그룹의 id 는 넣을 수 없다.
  `groups` 가 평평한 한 단계라는 것 자체가 그 금지다.
- **배열 순서는 Layers 의 폴더 순서**이고 화면에는 아무 영향이 없다.

### 3-2. 검증 규칙 — 무엇을 거부하고 무엇을 봐주나

| 검사 | Import 에서 |
| --- | --- |
| `groups` 가 배열이 아니다 | **거부** |
| 항목이 객체가 아니다 · `id` 가 규칙 위반 · 중복 id | **거부**(요소와 같은 `seen` 공간) |
| `name` 이 문자열이 아니다 · 길이 초과 | **거부** |
| `members` 가 배열이 아니다 · 비었다 · 상한 초과 · 항목이 id 모양이 아니다 | **거부** |
| 한 그룹 안에서 같은 id 가 두 번 | **거부** |
| **두 그룹이 같은 id 를 갖는다** | **거부** — 단일 소유권이 이 검사 하나에 달려 있다 |
| `members` 의 id 가 이 캔버스에 **없다** | **봐준다**(§7-3) |
| `members` 가 **서로 다른 좌표 공간**에 걸쳐 있다 | **봐준다**(§7-3) |
| `version:1` 캔버스에 `groups` 가 있다 | **봐준다** — v1 에서 그것은 모르는 칸이고, 새 거부를 만들면 v1 의 "모르는 칸은 보존"이 깨진다(v1 에 `flow` 가 섞인 경우와 같은 판단) |

★ 마지막 셋의 이유는 한 문장이다: **`groups` 는 화면에 영향을 주지 않으므로
낡은 명단이 잘못된 그림을 만들 수 없다.** 편집용 메타데이터 하나 때문에
파일 전체를 못 열게 만드는 쪽이 더 나쁜 실패다. 대신 Studio 가 **쓸 때**
고친다(§7-3).

---

## 4. 좌표 계약

### 4-1. 근본 규칙 — 그룹은 숫자를 저장하지 않는다

| 동작 | 바뀌는 저장값 | 화면 |
| --- | --- | --- |
| 그룹 만들기 | `canvas.groups` 한 항목이 는다 | **바이트 단위로 그대로** |
| 그룹 해제 | 그 항목이 준다 | **그대로** |
| 자식 넣기 · 빼기 | `members` 한 칸 | **그대로** |
| 그룹 이동 | 멤버마다 자리 칸(`x`·`y` 또는 `pin.offset`) | 전부 같은 만큼 움직인다 |
| 그룹 크기 조절 | 멤버마다 자리 + 크기 칸 | 균등 배율 |
| 그룹 회전 | 멤버마다 자리 + `rotation` | 피벗 둘레로 함께 돈다 |

**앞 넷은 왕복 오차가 0 이다** — 숫자를 하나도 안 쓰기 때문이다. 뒤 셋만
반올림을 만든다(§4-8).

### 4-2. 그룹 bounding box

화면의 틀은 Moveable 이 DOM 에서 잰다. **저장값에서 계산하는 bbox 는 조작
수식과 패널 표시에만 쓴다.**

멤버 하나(자 S 위의 `x`·`y`·`width`·`height`·`rotation`)의 네 꼭짓점:

```text
  c   = ( x + w/2 , y + h/2 )            회전 중심 = 상자 정중앙(계약 §19-2)
  R(θ)= [ cosθ  −sinθ ]                  θ 는 시계 방향(화면 y 축이 아래)
        [ sinθ   cosθ ]
  P±± = c + R(θ) · ( ±w/2 , ±h/2 )
```

bbox = 모든 멤버의 모든 꼭짓점에 대한 `min/max`. **회전된 자식은 회전한 뒤의
꼭짓점**으로 센다 — 회전 전 상자로 세면 틀이 글자를 자른다.

**그룹 자신은 회전값을 갖지 않는다.** bbox 는 언제나 자 S 의 축에 평행하다.
그래서 "그룹을 30° 돌린 뒤 다시 크기를 바꾸면 어떻게 되나"의 답은 "그때의
축평행 bbox 를 기준으로 균등 배율"이고, 그룹에 각도가 쌓이지 않는다.

`height:"auto"` 멤버는 저장 높이가 숫자가 아니다 — **세로 bbox 를 저장값만으로
만들 수 없다.** 그 경우 §4-6 을 따른다.

### 4-3. 절대값인가 상대값인가

**자식은 지금과 똑같이 자기 자 위의 절대값**이고, **그룹은 좌표를 갖지 않는다.**
상대 좌표는 어디에도 생기지 않는다.

이 결정이 사용자의 요구("그룹을 만들거나 해제해도 화면이 바뀌면 안 된다")를
계산이 아니라 **구조**로 만든다.

### 4-4. 같은 좌표 공간 — 그룹이 성립하는 조건

| 멤버 구성 | 공간 | 허용 |
| --- | --- | --- |
| 전부 `overlay` | 도화지 자 | ✔ |
| 전부 같은 프레임의 `frame-element` | 그 프레임 | ✔ |
| 같은 프레임 안에서 `follow:"transform"` 과 `"pin"` 이 섞임 | 그 프레임 — **한 프레임 안의 두 자** | ✔ (§4-5) |
| 서로 다른 프레임 | — | ✘ |
| overlay + frame-element | — | ✘ |
| `block` 포함 | — | ✘ (블록은 좌표가 없다) |
| 다른 그룹 포함 | — | ✘ (중첩 금지) |

★ **세 번째 줄이 함정이다.** 한 프레임 안에서도 `transform` 은 프레임 내부
자, `pin` 은 프레임 상자 자다(§1-2). 그래서 그룹 조작은 **한 자 위의 delta 를
멤버마다 자기 자로 환산**한다 — 그 환산은 `studioCanvasV2Space(id)` 가 이미
멤버별로 답을 갖고 있다.

### 4-5. 그룹 이동 — 멤버마다 자기 자로

프레임 → 부모 메시지는 **도화지 자의 delta 하나**다.

```text
  frame → parent   { kind:"v2-group-move", dx, dy }     단위: 도화지 자
```

부모가 멤버 m 마다:

```text
  r(m) =  1                              m 이 overlay
       =  1 / (S_frame × pageScale)      m 이 프레임 내부 transform
       =  1 / pageScale                  m 이 프레임 내부 pin

  space = studioCanvasV2Space(m)
  next  = { x: space.x + dx·r(m),  y: space.y + dy·r(m) }
  plan  = planStudioCanvasV2Transform("v2-move", m, next, { x: space.x, y: space.y })
```

`plan` 이 `x`·`y` 를 쓸지 `pin.offset` 두 칸을 쓸지 **이미 안다**(§1-2).
새 좌표 수식은 하나도 안 만든다.

#### 숫자 예시

`baseWidth 390`. 프레임 `canvas_b5main` 의 `props.baseWidth 150`, 해결된 폭
`300` → `S_frame = 2`. 화면이 설계 폭 안이라 `pageScale = 1`.
그룹을 **(+12.5, −7.25)** 도화지 자만큼 끈다.

| 멤버 | 자 | 전 | 후 |
| --- | --- | --- | --- |
| `canvas_o1number` (overlay) | 도화지 | `x −46, y 980` | `x −33.5, y 972.75` |
| `canvas_m0paper` (transform) | 프레임 내부(÷2) | `x −18, y 26` | `x −11.75, y 22.375` |
| `canvas_m2left` (pin) | 프레임 상자(÷1) | `offset { 8, −40 }` | `offset { 20.5, −47.25 }` |

세 멤버가 **화면에서 정확히 같은 거리**를 움직인다. 저장된 숫자만 자마다
다르다.

### 4-6. 그룹 크기 조절 — **균등 배율 하나**

```text
  frame → parent   { kind:"v2-group-resize", anchorX, anchorY, scale }   단위: 도화지 자
```

- **모서리 손잡이 넷만** 켠다. 변 중앙 넷은 그리지 않는다.
- 배율은 하나(`scale`)다. **비균등(sx ≠ sy)을 쓰지 않는다** — 회전된 자식을
  비균등으로 줄이면 그 결과가 회전한 직사각형으로 표현되지 않는다(전단이
  생긴다). 계약에 `skew` 칸이 없으므로 표현할 수 없는 상태를 만들지 않는다.
  이것은 단일 요소의 손잡이 여덟(계약 §18-2)과 **일부러 다른 규칙**이다.

멤버 m 마다(자기 자 위의 anchor `A_m = anchor × r(m)`):

```text
  x' = A_m.x + (x − A_m.x) × s
  y' = A_m.y + (y − A_m.y) × s
  w' = w × s
  h' = h × s            ("auto" 는 "auto" 그대로)
  rotation  그대로      (균등 배율은 각도를 보존한다)
```

`pin` 멤버는 자 위의 `x`·`y` 가 "origin 이 놓일 자리"이고
`planStudioCanvasV2Transform("v2-resize", …)` 가 그것을 `pin.offset` +
크기 두 칸으로 옮긴다 — 이미 있는 그 한 줄이다.

#### 숫자 예시

anchor = bbox 왼쪽 위 `A = (40, 950)`, `s = 1.25`, overlay 멤버
`x 40, y 980, w 260, h 200, rotation 0`:

```text
  x' = 40  + (40  − 40 )×1.25 = 40
  y' = 950 + (980 − 950)×1.25 = 987.5
  w' = 325      h' = 250      rotation 0
```

#### `height:"auto"` 멤버

가로만 배율을 받고 높이는 **내용이 계속 정한다.** 그래서 배율 뒤 그룹의 실제
화면 상자가 `s` 배와 정확히 같지 않을 수 있다 — **의도한 동작**이고 §11 의
남은 차이에 적는다. 거부하지 않는다(글자 장식 하나 때문에 그룹 전체를 못
줄이게 만들지 않는다).

### 4-7. 그룹 회전 — 중심만 옮기고 각도를 더한다

```text
  frame → parent   { kind:"v2-group-rotate", pivotX, pivotY, deg,
                     centers: [ { id, cx, cy } ] }      단위: 도화지 자
```

`centers` 는 **프레임이 잰 값**이다. 저장값만으로는 `height:"auto"` 멤버의
중심을 알 수 없고, 계약 §28-3 이 이미 정한 원칙 그대로 **잴 수밖에 없는 값
하나만** 프레임이 보고한다.

★ 회전은 상자 정중앙을 축으로 돌므로(계약 §19-2) **회전한 요소의 축평행
상자(AABB)의 중심은 원래 중심과 같다.** 그래서 프레임은 이미 갖고 있는 각
멤버의 rect 에서 중심을 바로 낼 수 있고, 높이를 몰라도 된다.

멤버 m 마다:

```text
  c'   = P + R(deg)·(c − P)
  Δ    = (c' − c) × r(m)              자기 자로 환산
  x'   = x + Δx      y' = y + Δy      ("auto" 도 그대로 — 높이를 안 쓴다)
  rot' = normalize(rotation + deg)    0 ≤ rot' < 360
```

#### 숫자 예시

피벗 `P = (170, 1050)`, 멤버 중심 `c = (170, 980)`(피벗 70 위), `deg = +90`
(시계 방향):

```text
  c − P      = (0, −70)
  R(90)      = [0 −1; 1 0]  →  (0·0 − (−70)·(−1), 0·1 + (−70)·0) = (70, 0)
  c'         = (240, 1050)
  Δ          = (+70, +70)
  overlay x 40 → 110 ,  y 880 → 950 ,  rotation 0 → 90
```

#### `height:"auto"` 는 회전에서 문제가 없다

높이가 아니라 **중심의 변위**만 쓰기 때문이다. 계약 §28-4 의 `auto-origin`
거절이 여기에는 필요 없다.

### 4-8. 왕복 보존 — 1px 안인가

저장 좌표의 자는 소수 셋째 자리다(`roundSkinHomeCanvasCoord`,
`SKIN_HOME_CANVAS_COORD_DECIMALS = 1000`).

| 동작 | 왕복 오차(도화지 자) | 1440px 화면에서 |
| --- | --- | --- |
| 만들기 → 해제 | **0** (숫자를 안 쓴다) | **0px** |
| 넣기 → 빼기 | **0** | **0px** |
| 이동 (+d 뒤 −d) | ≤ 0.002 | ≤ 0.008px |
| 크기 (×s 뒤 ×1/s) | ≤ 0.004 (좌표 · 크기 각각 2회 반올림) | ≤ 0.015px |
| 회전 (+θ 뒤 −θ) | 중심 ≤ 0.002, 각도 **정확** (정규화가 0~360 을 지킨다) | ≤ 0.008px |

**다섯 경우 모두 1px 안이고, 앞 둘은 정확히 0 이다.** 1440px 에서 도화지
한 칸은 `1440/390 ≈ 3.69px` 이므로 0.001 칸 = 약 0.0037px 이다.

### 4-9. 글자의 content bounds 와 편집 여유 5px

계약 §21-4 · §29-2 가 정한 그대로 **두 상자를 섞지 않는다.**

| 무엇 | 어디에 쓰나 |
| --- | --- |
| 저장 상자(Canvas 좌표) | **그룹 수식 전부** — anchor · pivot · bbox 계산 |
| 렌더된 content bounds + 5px 여유 | **Moveable 이 그리는 틀만** |

그룹 틀은 멤버들의 **여유 포함 상자**의 합집합이라 글자를 관통하지 않고,
`anchor`/`pivot` 으로 내려오는 숫자는 **여유가 빠진 저장 상자**의 합집합이다.
그래서 편집용 여유가 공개 화면의 저장 geometry 를 몰래 바꾸지 않는다.

### 4-10. `follow:"pin"` · `follow:"transform"` 이 섞인 그룹

- **이동 · 크기 · 회전은 §4-5~4-7 이 이미 자마다 환산하므로 그대로 된다.**
- 다만 **그 뒤에 프레임이 커지면 그룹의 모양이 달라진다** — `transform`
  자식은 `S_frame` 을 받아 커지고 `pin` 자식은 안 커진다(로드맵 §14-6).
  **그것이 의도한 동작**이고 그룹이 그 규칙을 덮어쓰지 않는다. Layers 가
  그런 그룹에 표시를 하지 않는다(새 상태를 만들지 않는다).

### 4-11. 빈 그룹

**허용하지 않는다.** 마지막 멤버가 빠지면 그 그룹 항목을 **같은 커밋에서**
지운다(Undo 한 칸). 멤버 **하나**짜리 그룹은 허용한다 — 아직 폴더이고 거기에
더 넣을 수 있기 때문이다. 하나가 되었다고 자동으로 풀면 사용자가 방금 만든
폴더가 사라진다.

---

## 5. 첫 버전 범위

사용자가 제시한 범위를 코드로 확인했고 **충돌은 하나뿐**이다(마지막 줄).

| 조합 | 1A~1C | 왜 |
| --- | --- | --- |
| overlay + overlay | **허용** | 한 자, 한 배열 |
| 같은 프레임의 frame-element 끼리(pin/transform 혼합 포함) | **허용** | 한 프레임, 자는 §4-5 가 환산 |
| overlay + frame-element | **금지** | 자가 다르고, 섞으면 한 delta 가 두 뜻을 갖는다 |
| 서로 다른 프레임의 frame-element | **금지** | 같음 |
| `flow.blocks` 의 블록 | **금지** | 블록에는 `x`·`y` 가 **없다**(순서 · align · margin) — 그룹 이동이 무의미하다 |
| `main_visual` 프레임 자체 | **금지** | 그것도 블록이다 |
| 중첩 그룹 | **금지** | `groups` 가 평평하다(§3-1) |
| 서로 다른 좌표 공간으로 **옮기기** | **금지** | 그것은 attach/detach 이고 이 문서의 기능이 아니다(§0) |
| 그룹 사이 **순서 변경** | **1A 에 없다 — 사용자 범위와 충돌** | 아래 ★ |

★ **충돌 하나 — "그룹 사이 순서 변경 가능".**

그룹 멤버는 배열에서 **연속일 필요가 없다.** 연속으로 만들려면 사이에 낀
다른 요소를 앞뒤로 밀어야 하는데, `overlays` 와 `props.elements` 의 배열
순서는 곧 **앞뒤 겹침 순서**다(로드맵 §14-5 · §14-8). 즉 멤버를 모으는
순간 겹침이 바뀌고, 그것은 "그룹을 만들어도 화면이 바뀌면 안 된다"에
정면으로 어긋난다.

그래서 **1A 는 그룹을 한 덩어리로 위아래 옮기지 않는다.** 순서 바꾸기는
지금처럼 **멤버 하나씩**이고, Layers 의 폴더 행은 **자기 첫 멤버(가장 작은
index)의 자리**에 그린다. 그룹 단위 순서 이동을 넣으려면 "겹침이 바뀔 수
있음"을 사용자가 받아들여야 하므로 **결정 사항으로 올린다**(§9).

---

## 6. Layers UX 계약

### 6-1. 폴더 행

```text
페이지 장식
  ▾ 📁 그룹 1            (2)      [해제] [삭제]
      ⠿ 큰 숫자
      ⠿ 꽃잎
  ⠿ 스티커
```

- 펼침 화살표 `▾`/`▸` + 폴더 아이콘 + 이름 + 멤버 수.
- 폴더는 **묶음(자동 배치 · 페이지 장식) 안**에 그린다. 프레임 안 그룹은
  그 프레임의 자식 자리에 한 단계 더 들여쓴다(깊이 2).
- 폴더 행에는 **눈 · 자물쇠가 없다**(§6-6).

### 6-2. 이름

- 기본 이름은 `그룹 N` 이고 `N = 1 + (지금 이름 중 "그룹 N" 꼴의 최대 N)`.
  **자리로 계산하지 않는다** — 그러면 `그룹 1` 을 지웠을 때 `그룹 2` 가
  `그룹 1` 로 바뀌어 사용자가 다른 폴더를 보게 된다.
- **이름 변경은 `GROUP-1A` 에 넣지 않는다.** Layers 행에는 아직 글자 입력
  칸이 하나도 없고 390px 시트에 그 자리가 없다. 이름 칸은 **지금 저장
  구조에 이미 있으므로** 나중에 UI 만 붙이면 되고 데이터는 안 바뀐다.

### 6-3. 선택

| 누른 것 | 결과 |
| --- | --- |
| 폴더 행 | **멤버 전부 선택**(기존 다중 선택 상태 하나 그대로 — `ids` 배열) |
| 자식 행 | 그 요소 **단독 선택** |
| Preview 에서 그룹에 속한 요소 | **먼저 그룹 전체**가 골라진다. 그 상태에서 한 번 더 누르면 그 요소 단독 |

세 번째 줄은 `main_visual` 의 두 단계(`studioCanvasSelectTargetId`)와 **같은
모양**이고, 프레임 판정 **뒤에** 그룹 판정이 온다. 그래서 프레임 안의 그룹된
장식은 `프레임 → 그룹 → 요소` 세 단계다. 새 상태를 만들지 않고 **지금
선택**으로 읽는다(다른 곳을 고르면 저절로 나가진다).

★ **"그룹 선택"이라는 별도 상태를 만들지 않는다.** 지금 고른 id 집합이 어떤
그룹의 `members` 집합과 **정확히 같으면** 그것이 그룹 선택이다. 파생이라
Undo · reconcile · lasso 가 그대로 맞는다.

### 6-4. 만들기 · 해제 · 삭제

| 동작 | 어디 | 조건 |
| --- | --- | --- |
| `그룹 만들기` | 다중 선택 상태의 패널 + Layers | 2개 이상 · **한 좌표 공간** · **아무도 다른 그룹에 없음** · 블록/프레임 아님 |
| `그룹 해제` | 폴더 행 · 그룹 선택 패널 | 자식은 그대로 남는다. 좌표 0칸 |
| `그룹 삭제` | 폴더 행 | 자식까지 지운다 |

**해제와 삭제는 다른 단추이고 글자가 다르다.** 삭제는 확인을 받는다.

```text
  "그룹 1" 과 그 안의 요소 3개를 지웁니다.
  폴더만 없애려면 [해제] 를 쓰세요.
  되돌리려면 Undo(↶) 를 누르면 됩니다.
                                  [취소]  [지우기]
```

- 멤버 중 하나가 그 프레임의 **대표 사진**이면 **전체를 거부**한다(기존
  이름 있는 이유 `primary`). 일부만 지운 상태를 만들지 않는다.
- 삭제도 해제도 **한 번이 Undo 한 칸**이다.

### 6-5. 넣기 · 빼기 (drag)

기존 `studioCanvasLayersDropPlan()` 의 띠 규칙을 그대로 늘린다.

| drop 자리 | 결과 |
| --- | --- |
| 폴더 행의 **가운데 띠**(위아래 25% 제외) | 그 그룹에 **넣기** — 같은 좌표 공간일 때만 |
| 폴더 행의 위/아래 끝 | 지금처럼 그 자리 **순서** |
| 같은 묶음의 폴더 **밖** | 그 그룹에서 **빼기**(+ 필요하면 순서) |
| 다른 좌표 공간 | **금지** — 표시도 하지 않고 손을 놓아도 아무 일이 없다 |

- **drop 한 폴더가 대상이다.** 가까운 그룹을 자동으로 고르지 않는다(기존
  프레임 규칙과 같다).
- 넣기 · 빼기 모두 **좌표를 한 칸도 쓰지 않는다.** 그래서 화면이 안 바뀐다.
- 넣은 뒤 그 폴더가 접혀 있으면 **펼친다**(기존
  `expandStudioCanvasLayersFolder`).

### 6-6. `hidden` · `locked` 합성 — **합성하지 않는다**

**그룹은 자기 `hidden`/`locked` 를 갖지 않는다.** 폴더 행에 눈 · 자물쇠를
그리지 않고, 멤버 행의 그것은 지금 그대로다.

이유. 렌더러는 `groups` 를 **보지 않는다**(§3-1 · §7-2). 그래서 그룹 단위
`hidden` 을 구현할 방법은 "멤버 전부의 `hidden` 을 한꺼번에 켜기"뿐인데,
그러면 **끌 때 되돌릴 수 없다** — 원래 혼자 숨어 있던 멤버까지 함께
드러난다. 되돌릴 수 없는 토글을 만들지 않는다(계약 §22-7 이 레이어 목록이
없을 때 `hidden` 토글을 일부러 뺀 것과 **같은 판단**이다).

폴더 행은 **파생 표시만** 한다 — 멤버가 전부 숨김이면 흐리게, 전부 잠김이면
자물쇠 글리프를 **읽기 전용으로** 보여 준다. 누를 수 없다.

### 6-7. 접힘 · 펼침 · 선택이 접힌 안에 있을 때

- 접힘 상태는 **Studio UI 상태**다(`studioCanvasLayersCollapsed`). 저장 데이터가
  아니고 Undo 대상도 아니며 Export/Import 를 지나지 않는다. **이미 그렇게
  만들어져 있다.**
- 고른 요소가 **접힌 폴더 안**이면 그 폴더를 **자동으로 펼친다**(기존 함수).
- 펼치지 않는 경로(예: 여러 폴더에 걸친 lasso)에서는 폴더 행에 **점 하나**로
  "이 안에 고른 것이 있다"를 표시한다.

---

## 7. Undo · 선택 · 호환

### 7-1. Undo 칸 수

| 동작 | Undo |
| --- | --- |
| 그룹 만들기 | **1** |
| 그룹 해제 | **1** |
| 자식 넣기 | **1** |
| 자식 빼기 | **1** |
| 마지막 멤버가 빠져 빈 그룹이 사라짐 | 그 빼기와 **같은 1칸**(별도 칸을 만들지 않는다) |
| 그룹 삭제(자식까지) | **1** |
| **변화 없는 drop**(같은 그룹에 다시 넣기 등) | **0** — 기존 `unchanged` 경로 |
| **금지된 drop** | **0** — 계획이 `null` 이라 커밋 자체가 없다 |
| 그룹 이동 · 크기 · 회전 | **제스처당 1** — 멤버 N개의 쓰기가 **한 커밋**이다 |

마지막 줄이 되는 이유: Undo 는 `captureStudioWorkingChange()` 의 **working
skin 전체 스냅샷**이라 커밋 하나가 곧 한 칸이고 노드 수와 무관하다(§1-6).

★ **원자성.** 그룹 조작은 멤버마다 순수 writer 를 이어 부른 뒤 **마지막
결과만** draft 에 넣는다. 하나라도 실패하면 **중간 결과를 버리고 regions 는
한 글자도 바뀌지 않는다**(계약 §32-10 의 규칙을 여럿으로 넓힌다).

### 7-2. Undo/Redo 뒤의 선택과 펼침

- 선택은 기존 `reconcileStudioCanvasSelection()` 이 처리한다 — 남아 있는
  id 는 선택이 유지되고 사라진 id 는 빠진다. **그룹 선택은 id 배열이므로
  새 처리가 필요 없다**(§6-3 의 파생 규칙).
- Undo 로 그룹이 되살아나면, 지금 선택이 그 `members` 와 같아지는 순간
  패널이 다시 그룹 선택으로 읽는다. 별도 복원 로직이 없다.
- **펼침 상태는 Undo 를 따라가지 않는다**(UI 상태다 — §6-7). 되살아난
  폴더가 접혀 있고 그 안에 선택이 있으면 §6-7 의 자동 펼침이 연다.

### 7-3. 낡은 명단 — 그룹은 **조언(advisory)** 이다

B-2 가 짊어진 유일한 비용이다. 옛 Studio · Code · AI 가 요소를 지우거나
프레임 안팎으로 옮겨도 `groups` 는 안 따라온다.

| 언제 | 무엇을 하나 |
| --- | --- |
| **읽을 때(로드 · 렌더 · 검증)** | **아무것도 고치지 않는다.** 조용히 고치지 않는 것이 계약 §9 다 |
| **Layers 가 그릴 때** | 없는 id · 다른 공간의 id 는 **그리지 않는다**(있는 것처럼 보이지 않게) |
| **그룹 동작을 실행할 때** | 그 그룹을 **먼저 고친다** — 없는 id · 공간이 어긋난 id 를 빼고, 멤버가 0이 되면 그룹을 지운다. 그 수선이 **같은 커밋 · 같은 Undo 한 칸**에 들어간다 |
| **그래도 화면은?** | 영향 없음. `groups` 는 렌더 payload 에 실리지 않는다 |

즉 **낡은 명단이 잘못된 그림을 만들 수 없다.** 그래서 §3-2 가 Import 에서
그것을 봐줄 수 있다.

---

## 8. 버전 호환성 — **v2 를 유지한다. v3 가 아니다**

실제 코드 실측으로 답한다(추측 아님 — §1-1 · §1-6 · §1-7).

| 질문 | 답 | 근거 |
| --- | --- | --- |
| `canvas.version` 을 3으로 올리나 | **아니다** | 새 `type` 도 새 중첩도 없다. `groups` 는 **모르는 칸**이라 옛 검증기가 통과시킨다(`validateSkinCanvasV2Data` 에 allowlist 형 거부가 없다) |
| DB migration | **필요 없다** | 스킨은 기존 컬럼의 JSON 이다. 새 테이블 · 새 RPC · 새 컬럼 0 |
| schema version 변경 | **없다** | SkinPackage 의 최상위 칸이 안 는다(로드맵 §14-3 "새 최상위 필드를 만들지 않는다") |
| 구버전이 group 을 **저장 · 발행**하면 | **그대로 보존된다** | Save/Publish 는 `currentWorkingSkin.regions` 를 그대로 싣고, Export 는 `regions` 를 통째로 깊은 복사하며, AI 는 `currentPackage.regions` 를 그대로 돌려준다 |
| 구버전의 **위험** | 멤버를 지우거나 옮겨도 명단이 안 따라온다 → **낡은 명단** | §7-3 의 advisory 규칙으로 갚는다. 화면은 영향 없음 |
| unknown field 보존 | **보존된다** | 요소 · 블록 · canvas 어디에도 unknown 거부가 없고, 순수 writer 는 `copySkinHomeCanvasObject` 로 통째 복사한다 |
| native/sandbox parity | **처음부터 같다** | `buildSkinCanvasV2RenderPayload()` 가 알려진 칸만 새 리터럴로 만들므로 `groups` 는 봉투에 **못 실린다**. `skin-sandbox-protocol.js` 는 **1A 에서 무변경** |
| import/export 하위 호환 | **양방향으로 된다** | 새 파일을 옛 배포가 열면 그룹만 무시하고 똑같이 그린다. 옛 파일을 새 배포가 열면 `groups` 가 없을 뿐이다 |

**후보 A · B-1 이었다면 이 표가 전부 뒤집힌다** — 새 `type` 은 옛 배포에서
Import 거부 + 실행 payload 없음이라 **HOME 이 통째로 fallback 된다**(§1-7).
그것이 v3 를 요구하게 만드는 진짜 이유이고, B-2 는 그 요구 자체를 없앤다.

### 8-1. 1B · 1C 가 **바꿔야 하는** 곳

1A 는 프로토콜 무변경이지만 조작 두 단계는 새 메시지를 만든다.

| 무엇 | 어디 |
| --- | --- |
| `v2-group-move` · `v2-group-resize` · `v2-group-rotate` 요청 | `skin/sandbox/skin-sandbox-protocol.js`(새 `kind` 셋) · `-frame.js` · `-host.js` · `studio/preview/preview-bridge.js` · `preview-sandbox.js` |
| 그룹 손잡이 켜기 | `skin/skin-home-canvas-editor-runtime.js` `setMoveableTarget()` 의 `dragTarget` · `renderDirections` · `rotationPosition` 세 줄 |
| 멤버별 fan-out + 배치 쓰기 | `studio/inspector/studio-canvas-v2-space.js` · `studio/studio-preview.js` · `skin/skin-home-canvas-write-v2.js` |

**렌더러와 실행 payload 는 1C 까지도 무변경이다.**

---

## 9. 단계 — `GROUP-1A` · `1B` · `1C`

작업 ID 에서 `V2-` 를 **뺀다**(옛 `HOME-CANVAS-V2-GROUP-1A` 와 내용이 다른
작업이므로 이름을 재사용하지 않는다 — §10).

### `HOME-CANVAS-GROUP-1A` — 저장 구조 · 만들기/해제 · 폴더 · 넣기/빼기 · 선택

> **✅ 완료(2026-09-23).** 실제로 강제되는 계약은
> [계약 문서 §38](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) 이다.
> 이 목록보다 **더 들어간 것**이 둘, **빠진 것**이 하나다(§0-0).
>
> - 더: **이름 변경 UI**(더블클릭 · `✎` · 패널의 단추) ·
>   **Import 의 낡은 명단 수선과 완료 안내**.
> - 빠짐: **Preview 직접 클릭의 그룹 단계.** 개별 요소 선택이 먼저이고,
>   그룹 전체 선택은 Layers 의 폴더 행에서만 들어간다.
>
> 그리고 멤버 최소가 **2개**가 되면서 §4-11 의 "하나짜리 그룹 허용"이
> 뒤집혔다 — 하나만 남으면 같은 커밋에서 자동 해제된다.

들어가는 것

- `canvas.groups` 저장 계약과 검증(§3) — `skin/skin-home-canvas-v2.js`
- 순수 writer 넷 — 만들기 · 해제 · 넣기 · 빼기(빈 그룹 자동 삭제 포함) ·
  그룹 삭제 — `skin/skin-home-canvas-write-v2.js`
- 구조 입구에 `op` 늘리기(`group-create` · `group-dissolve` · `group-join` ·
  `group-leave` · `group-remove`) — `studio-canvas-selection.js` ·
  `studio-preview.js`
- Layers 폴더 행 · 펼침 · drop 띠 · 해제/삭제 단추 · 확인 문구 —
  `studio-canvas-layers*.js`
- 그룹 선택(폴더 행 → 멤버 전부) · Preview 두 단계 진입(§6-3)
- `그룹 만들기` 단추와 그 활성 조건

들어가지 **않는** 것

- **전체 transform 은 하나도 없다** — 그룹을 골라도 지금처럼 틀만 그려지고
  손잡이가 없다.
- 이름 변경 UI · 그룹 단위 순서 이동 · 그룹 `hidden`/`locked` · 중첩 ·
  공간을 넘는 이동 · v1 캔버스의 그룹.

### `HOME-CANVAS-GROUP-1B` — 그룹 전체 이동

> **✅ 완료(2026-09-24).** 실제로 강제되는 계약은
> [계약 문서 §39](../contracts/IMORY_HOME_CANVAS_CONTRACT.md#39-그룹-전체-이동-home-canvas-group-1b)
> 이다. 이 목록에서 **한 줄이 뒤집혔다.**
>
> - **`setMoveableTarget()` 에서 그룹의 `dragTarget` 을 켜지 않았다.**
>   0.53.0 의 `MoveableGroup` 은 `dragArea && !dragTarget` 일 때 드래그
>   요소를 gesto 목록에 **더하지 않고**(번들 실측 — `Rs()`), 우리 control
>   box 는 `pointer-events: none` 이라 그 목록에 입력이 닿지 않는다.
>   `dragTarget` 을 주면 `dragArea` 가 필요한 MoveableGroup 의 mount 가
>   깨지고, 그 값은 요소 **하나**라 멤버 아무 곳에서나 끄는 것도 되지
>   않는다. 그래서 그룹 drag 의 **입력을 편집 runtime 이 갖고**
>   (window capture 의 pointerdown/move/up) Moveable 은 지금까지처럼
>   표시 전용으로 남겼다(계약 §39-2).
>
> - 메시지 이름은 `preview:canvas-group-move` ·
>   `IMORY_CANVAS_GROUP_MOVE` 이고, 짝이 되는 부모→프레임 메시지
>   (`canvas-group`)가 하나 더 필요했다 — 프레임은 지금 고른 것이 한
>   그룹인지도, 도화지 자도 스스로 알 수 없다.
>
> - **더 들어간 것**: 끄는 동안의 임시 화면 이동 두 칸
>   (`--imory-canvas-drag-x/y`) · 잠긴 그룹의 안내 한 줄 ·
>   `studioCanvasGroupInfo().pickable`(숨은 · 잠긴 멤버가 있는 그룹도
>   폴더 행으로 고를 수 있게) · 그룹용 이동 손잡이(모바일).

- `canvas-group-move` 메시지 하나(도화지 자 delta) — §4-5
- 멤버별 `studioCanvasV2Space` → `planStudioCanvasV2Transform("v2-move")`
  fan-out + **배치 쓰기 한 커밋**
- 한 제스처 = Undo 한 칸 · 하나라도 실패하면 아무것도 안 바뀐다
- 크기 · 회전은 **여전히 꺼 둔다**

### `HOME-CANVAS-GROUP-1C` — 그룹 전체 크기 조절 · 회전

- `v2-group-resize`(균등 배율 · 모서리 넷) · `v2-group-rotate`(피벗 +
  멤버별 중심) — §4-6 · §4-7
- Moveable 이 실제로 주는 group event 를 **실측해서** 쓴다(단일 요소 수식을
  복제해 추측하지 않는다 — 계약 §18-1 · §19-1 의 그 함정들이 그룹에서
  반복될 수 있다)
- `height:"auto"` 는 크기에서 가로만 받고 회전에서는 영향이 없다(§4-6 · §4-7)

### 9-1. 테스트 자리

새 e2e 파일 하나를 예약한다 — `studio/studio-home-canvas-group-e2e-test.mjs`,
포트 **9010 · 9011**(지금 쓰이는 마지막 쌍이 9008 · 9009 다). 단위 쪽은
`skin/skin-home-canvas-test.mjs` 에 `[v2-group]` 절, 봉투는
`skin/sandbox/skin-sandbox-unit-test.mjs` 에 `[canvas-group]` 절
(**1B 부터** — 1A 는 봉투가 안 바뀐다).

**`docs/TESTS.md` §13 에는 그 파일이 실제로 생기는 라운드에 행을 넣는다** —
이 라운드(설계)는 테스트를 추가하지 않았다.

> **✅ `GROUP-1A`(2026-09-23)가 그 자리를 채웠다.** 새 파일
> `studio/studio-home-canvas-group-e2e-test.mjs` 가 **포트 9010 · 9011**
> 로 생겼고(절 아홉 —
> `save|tree|name|ops|drag|import|round|mobile|sandbox`),
> `skin/skin-home-canvas-test.mjs` 에 `[v2-group]` 절이 생겼다.
> 봉투(`[canvas-group]`)는 예정대로 **1B 부터**다 — 1A 는
> `skin/sandbox/skin-sandbox-protocol.js` 가 한 줄도 안 바뀌었고,
> 단위 테스트가 그 파일에 `groups` 라는 글자가 없다는 것으로 그것을
> 못박았다.
>
> **✅ `GROUP-1B`(2026-09-24)가 그 절을 채웠다.**
> `studio/studio-home-canvas-group-e2e-test.mjs` 에 `[group-move]` 절이
> 늘었고(같은 포트 9010 · 9011),
> `skin/sandbox/skin-sandbox-unit-test.mjs` 에 `[canvas-group]` 절이
> 생겼다. 1A 의 그 단언은 **키**를 보는 문장으로 좁아졌다 — 봉투가
> `IMORY_CANVAS_GROUP` 둘을 알게 됐지만 `"groups"` 라는 **칸**은
> 여전히 없다(명단은 프레임에 내려가지 않는다).

---

## 10. 폐기 — 옛 `HOME-CANVAS-V2-GROUP-1A~1C`

| 옛 계획 | 지금 |
| --- | --- |
| `V2-GROUP-1A` — 여러 overlay 를 한 번에 `main_visual` 에 묶고 **primary 를 고른다** | **폐기.** 그것은 그룹이 아니라 **프레임 안에 넣기**를 여럿으로 넓히는 일이다. 필요해지면 별도 작업 `HOME-CANVAS-V2-MULTI-ATTACH-1` 로 다시 낸다 |
| `V2-GROUP-1B` — 같은 자의 다중 선택을 함께 이동 | **`HOME-CANVAS-GROUP-1B` 가 잇는다.** 다만 "다중 선택"이 아니라 **영구 그룹**이 대상이다 |
| `V2-GROUP-1C` — 그룹 리사이즈 · 회전 | **`HOME-CANVAS-GROUP-1C` 가 잇는다** |
| primary 지정 UI | **이미 있다** — Layers 행의 ★(계약 §32-6). 옛 계획의 그 항목은 이미 끝났다 |

`main_visual` 의 `attach`/`detach` 는 앞으로 **"프레임 내부 배치"** 로만
분류한다. 그룹과 이름을 섞지 않는다(§0 의 표).

---

## 11. 남은 차이 · 남은 사용자 결정

### 11-1. 이 설계가 남기는 차이

- **`height:"auto"` 멤버가 있는 그룹은 크기 조절 뒤 화면 상자가 배율과
  정확히 같지 않다**(가로만 받는다 — §4-6). 거부하지 않고 그대로 둔다.
- **그룹은 `hidden`/`locked` 를 갖지 않는다**(§6-6). 폴더째 숨기고 싶다는
  요구가 나오면 "멤버 전부에 일괄 쓰기 + 켜기 전 상태를 그룹에 기록"이
  후보이고, 그때 `groups` 에 칸이 하나 더 는다.
- **그룹을 한 덩어리로 위아래 옮길 수 없다**(§5 의 ★).
- **옛 Studio 를 지난 파일의 명단이 낡을 수 있다**(§7-3). 화면에는 영향이
  없지만 Layers 의 폴더가 비어 보일 수 있다.
- **v1 캔버스에는 그룹이 없다.** v1 은 평면 자유 Canvas 이고 Layers 도 v2
  에서만 트리를 그린다(`studioCanvasLayersRows`).

### 11-2. 올리는 결정 — 구현 전에 답이 필요하다

1. **그룹 단위 순서 이동을 넣을 것인가.** 넣으려면 멤버를 배열에서 연속으로
   모아야 하고 **그 사이에 낀 다른 요소와의 겹침 순서가 바뀐다.** (a) 안
   넣는다(권장 · §5) / (b) 넣되 "겹침이 바뀔 수 있음"을 확인 문구로 알린다.
2. **그룹 이름 변경 UI 를 `1A` 에 넣을 것인가.** 데이터는 이미 준비돼 있다.
   (a) 나중(권장 · §6-2) / (b) `1A` 에 인라인 입력 칸을 넣는다.
3. **Import 가 낡은 명단을 봐주는 것이 맞는가**(§3-2 · §7-3). (a) 봐준다
   (권장 — 편집 메타데이터 때문에 파일을 못 열게 만들지 않는다) / (b)
   거부하고 오류에 그룹 이름과 없는 id 를 적는다.
4. **그룹 크기 조절을 균등 배율로 못박는 것이 맞는가**(§4-6). 단일 요소는
   손잡이 여덟이 전부 자유 비율인데(계약 §18-2) 그룹만 모서리 넷이 된다.
   (a) 균등만(권장 — 회전된 자식을 표현할 수 없다) / (b) 회전된 멤버가
   하나도 없을 때만 변 중앙 손잡이를 연다.

---

## 12. 이 라운드가 바꾼 것

문서 넷이다 — 제품 코드 0줄, migration 0, 배포 0,
`APP_BUILD_VERSION` 무변경.

| 문서 | 무엇 |
| --- | --- |
| 이 문서(신규) | 그룹의 저장 구조 · 좌표 · Layers · Undo · 호환 · 단계 |
| [IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md](./IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md) | §5 를 새 `GROUP-1A~1C` 로 교체 · §6 표의 4~6 행 · §8 지시문 |
| [IMORY_HOME_CANVAS_ROADMAP.md](./IMORY_HOME_CANVAS_ROADMAP.md) | §14-7 · §14-13 의 8번에 폐기/교체 표시 |
| [../contracts/IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) | §11-3 · §28-7 · §32-11 의 앞으로를 가리키는 줄만 이 문서로 돌린다 |
| [../INDEX.md](../INDEX.md) | 이 문서의 줄 |
