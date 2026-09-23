# IMORY STUDIO — Layers · Canvas Typography 재편 계획

> 상태: **PLAN(1~3단계 구현됨)**. 이 문서는 Studio 정보 구조와 작업 순서를
> 정한다. 읽었다는 사실이 전체 구현을 허가하지 않는다 — 아래 §6 의 상태
> 칸에 "완료" 라고 적힌 줄만 지금 코드가 하는 일이다.
>
> 기준 시점: `main@e5a517e` (2026-09-22).
>
> **2026-09-23 갱신 ①** — §6 의 1단계 `STUDIO-LAYERS-SHELL-1` 이 구현됐다
> (§7 의 "반드시 한다" 전부).
>
> **2026-09-23 갱신 ②** — §6 의 2단계 `HOME-CANVAS-TYPOGRAPHY-1` 도
> 구현됐다. 현행 계약은 이 문서가 아니라
> [IMORY_HOME_CANVAS_CONTRACT.md §31](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> 이다 — 아래 §4 는 그때의 **계획**이고, 실제로 정해진 값 · 글꼴 목록 ·
> 저장 경로 · sandbox CSP 는 §31 에 있다. 글꼴 카탈로그는
> `core/imory-font-catalog.js`, 파일 로딩은 `core/imory-fonts.css` 하나다.
>
> **2026-09-23 갱신 ③** — §6 의 3단계 `STUDIO-LAYERS-STRUCTURE-1` 도
> 구현됐다(§2-3 · §2-4 · §2-5 · §2-6 의 일곱 동작). 현행 계약은 이
> 문서가 아니라
> [IMORY_HOME_CANVAS_CONTRACT.md §32](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> 이다 — 아래 §2 는 그때의 **계획**이고, 실제로 정해진 drop 규칙 ·
> 길게 누르기 시간(350ms) · `via` · Undo 단위 · 거절 이유는 §32 에 있다.
>
> **2026-09-23 갱신 ④** — 4단계의 **내용이 바뀌었다**(`HOME-CANVAS-GROUP-CONTRACT-1`).
> 옛 `HOME-CANVAS-V2-GROUP-1A`(여러 overlay 를 한 번에 `main_visual` 에
> 묶고 primary 를 고르는 것)는 **폐기됐다** — 그것은 그룹이 아니라
> **프레임 내부 배치**를 여럿으로 넓히는 일이었다. 영구 그룹은
> Layers 의 폴더이고 좌표계를 바꾸지 않으며, 저장 모양 · 좌표 ·
> Layers UX · 호환은
> [IMORY_HOME_CANVAS_GROUP_DESIGN.md](./IMORY_HOME_CANVAS_GROUP_DESIGN.md)
> 가 갖는다. 아래 §5 가 그 교체 표다.
>
> 4단계 `HOME-CANVAS-GROUP-1A` 부터는 아직 계획이다 — 이 문서를
> 근거로 그것들이 있다고 읽지 않는다.
>
> 다음 구현 작업은 **`HOME-CANVAS-GROUP-1A` 하나**이고, 그 뒤가
> `1B` · `1C` 다. 뒤 작업을 함께 선행 구현하지 않는다.

## 0. 왜 이 재편이 필요한가

이 문서를 쓰던 시점(`main@e5a517e`)의 Studio 상단 왼쪽 패널 진입점은
`Select · Images · Dock · Layout` 네 개였다(지금은 §1 의 넷이다 —
`STUDIO-LAYERS-SHELL-1`). 그런데 HOME Canvas v2가
재료 추가 · 삭제 · 소속 변경 · 다중 선택까지 지원하면서 Select 안에 서로 다른
책임이 겹쳤다.

실제 코드도 그 상태를 그대로 보여 준다.

| 현재 책임 | 현재 위치 | 문제 |
| --- | --- | --- |
| 고른 요소의 속성 편집 | `studio/inspector/studio-canvas-inspector*.js` | Select의 본래 책임이다 |
| 선택과 무관한 재료 추가 | `studio/inspector/studio-canvas-add-v2.js` | 아무것도 고르지 않아도 보이므로 Select의 책임이 아니다 |
| 순서 · 소속 · 삭제 | Canvas Inspector와 Preview 직접 조작에 흩어짐 | 전체 구조를 한눈에 확인할 곳이 없다 |
| 숨김 · 잠금 | 데이터에는 있으나 UI 없음 | 화면에서 다시 고를 수 없어서 레이어 목록 전에는 안전하게 제공할 수 없었다 |
| Bottom Dock 설정 | `studio/dock/dock-panel.js` · `#studioLeftPanelDock` | 사이트 전체 이동 설정인데 Canvas 편집 진입점과 같은 급으로 놓여 있다 |
| Canvas 글자 내용·geometry | Canvas Inspector | 가능하다 |
| Canvas 글자의 글꼴·크기·굵기·색·자간·행간 | 없음 | 일반 HTML Inspector의 타이포그래피와 기능 격차가 난다 |

목표는 기능을 없애는 것이 아니라 **찾을 곳을 분명하게 나누는 것**이다.

## 1. 최종 정보 구조

> **변경됨(STUDIO-LAYERS-MEDIA-1 · 2026-09-23)** — 상단 진입점은 이제
> **셋**이다. `Images` 가 상단에서 빠지고, 이미지 연결 · 교체 · 비우기는
> **Layers 안**으로 들어갔다(사진 행을 한 번 누르면 그 자리의 이미지
> 화면). 현행 계약은 이 문서가 아니라
> [IMORY_HOME_CANVAS_CONTRACT.md §34](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> 와 [IMORY_STUDIO_SHELL_DESIGN.md §2-3](../features/studio/IMORY_STUDIO_SHELL_DESIGN.md)
> 이다. 아래 표의 **Images** 줄은 그 라운드 이전의 기록이다.

Studio 상단 왼쪽 진입점은 다음 넷이다.

```text
Select · Images · Layers · Layout
```

| 진입점 | 책임 | 하지 않는 것 |
| --- | --- | --- |
| **Select** | 현재 고른 요소 하나의 내용 · geometry · 시각 속성 · 타이포그래피 | 재료 추가 · 전체 순서 관리 · 소속 변경 |
| **Images** | 이미지 슬롯에 실제 이미지 연결 · 교체 · 비우기 (**STUDIO-LAYERS-MEDIA-1 에서 상단 진입점이 없어지고 Layers · Select · Layout 안에서 열리는 하위 화면이 되었다**) | 레이어 순서 · 요소 geometry |
| **Layers** | 재료 추가 · 전체 트리 · 선택 · 순서 · 소속 · primary · 숨김 · 잠금 · 삭제 · 다중 작업 | 글꼴·색·개별 geometry 입력 |
| **Layout** | HOME 전체의 1·2·3단 · 전역 HOME 설정 | 개별 요소 편집 |
| **Settings > Bottom Dock** | 사이트 하단 Dock의 표시 여부 · 열기 버튼 · 항목 · 이동/기능 | Canvas 레이어 편집 |

### 1-1. Dock 이동의 경계

Dock은 UI 진입점만 Settings 쪽으로 옮긴다.

- `bottomDock` 데이터는 당장 SkinPackage에 그대로 둔다.
- 기존 정규화 · working draft · Undo · Save · Publish 경로를 유지한다.
- Settings에 별도 Dock 데이터나 두 번째 저장 API를 만들지 않는다.
- 기존 `dock-panel.js`의 편집기를 재사용하거나, 같은 controller를 한 벌만
  두고 Studio/Settings가 그 화면을 연다.
- 기존 Dock 버튼을 지운 뒤에도 옛 SkinPackage의 Dock 설정은 한 칸도 잃지 않는다.

Settings 쪽에서 같은 저장 경계를 안전하게 열 수 없는 것으로 조사되면
`STUDIO-LAYERS-SHELL-1`에서는 상단 Dock 버튼만 빼지 않는다. 임시 복제 UI를
만들지 말고 조사 결과와 다음 분리 작업을 보고한다.

**조사 결과(2026-09-23 · 구현됨)** — 열 수 있었다.

`admin/index.html`은 이미 `studio/index.html`을 **같은 origin iframe**
(`#skinStudioFrame`)으로 싣고, `admin/admin-session.js`에 origin과 source를
모두 검사하는 메시지 통로가 있다. Dock 편집기는 Studio의 working draft ·
Undo · Save에 묶여 있으므로(`studio/dock/dock-panel.js` →
`setStudioBottomDock()`), 그 편집기를 admin 문서에 다시 만들면 skin 데이터의
두 번째 저장 주인이 생긴다. 그래서 만들지 않았다 — SETTINGS > HOME의
"화면 아래 Dock"은 Skin Studio 화면으로 옮긴 뒤 그 iframe에
`admin:open-studio-panel` 한 마디를 보낼 뿐이고, 여는 것도 저장하는 것도
지금까지처럼 Studio가 한다.

- 새 테이블 · 새 RPC · 새 정규화 · 두 번째 저장 API: **없다.**
- `bottomDock` 데이터 모양 · Export/Import · Publish: **바뀌지 않았다.**
- Studio가 아직 스킨을 못 읽었으면 조용히 무시하고, admin이 짧은 간격으로
  다시 보낸다. Studio가 `studio:panel-opened`로 한 번 답하면 멈춘다.
- Preview 안의 dock을 누르는 기존 길도 그대로 남아 있다.

## 2. Layers 패널

### 2-1. 기본 트리

v2 Canvas의 실제 저장 구조를 그대로 읽어 다음처럼 보여 준다.

```text
＋ 재료 추가

자동 배치
  ⠿ 로고
  ⠿ 카테고리
  ▾ 메인 비주얼
      ★ 대표 사진
      ⠿ 배경 종이
      ⠿ 테이프
      ⠿ 캡션
  ⠿ 구분선

페이지 장식
  ⠿ 작은 글자
  ⠿ 스티커
  ⠿ 사진
```

매핑은 다음과 같다.

| Layers 표시 | Canvas 데이터 |
| --- | --- |
| 자동 배치 | `canvas.flow.blocks` |
| 메인 비주얼 폴더 | `type:"main_visual"` 블록 |
| 메인 비주얼의 자식 | `block.props.elements` |
| ★ 대표 사진 | `block.props.primaryId`가 가리키는 photo |
| 페이지 장식 | `canvas.overlays` |

트리는 별도 상태 저장소가 아니다. 열 때마다 current working draft에서 다시 만든다.
행의 identity는 기존 Canvas id 하나다.

### 2-2. 선택

- Preview에서 고르면 Layers의 같은 행이 선택되고 필요한 경우 펼쳐져 보인다.
- Layers 행을 누르면 Preview의 기존 Canvas 선택 경로로 그 요소를 고른다.
- Ctrl/⌘ 또는 선택 모드로 여러 행을 고를 수 있다.
- lasso와 Shift+클릭은 계속 지원한다. 다만 빠른 선택 수단일 뿐 소속이나
  영구 그룹을 자동으로 만들지 않는다.
- 선택 상태의 단일 원천은 기존 `studio-canvas-selection.js`다. Layers 전용
  두 번째 선택 배열을 만들지 않는다.

### 2-3. 순서 변경

- 데스크톱: 행의 drag handle을 끈다.
- 좁은 화면: **행 전체가 아니라 handle만** 길게 눌러 끈다. 일반 행 터치와
  패널 스크롤을 막지 않는다.
- 같은 부모 안에서 끌면 배열 순서를 바꾼다.
- `flow.blocks`, 각 `main_visual.props.elements`, `overlays`의 순서는
  서로 독립적이다.
- 한 번의 drop은 Undo 한 칸이다.
- 화면에만 순서를 바꾸고 저장 배열은 그대로 두는 임시 정렬을 만들지 않는다.

정확한 길게 누르기 시간은 구현에서 실측해 정하되, pointer가 handle 밖으로
벗어나거나 스크롤 의도가 확인되면 취소한다. 임의의 전역
`touch-action:none`을 두지 않는다.

### 2-4. 소속 변경

- overlay를 메인 비주얼 폴더에 drop하면 기존 “메인 비주얼로 묶기” 경로를 쓴다.
- 프레임 내부 요소를 “페이지 장식”에 drop하면 기존 “빼기” 경로를 쓴다.
- 화면 위치 · 크기 · 회전을 유지하는 현재 §28~§30 좌표 계약을 그대로 쓴다.
- 가까운 프레임을 자동 선택하지 않는다. drop한 폴더가 대상이다.
- lasso로 여러 개를 골랐다는 이유만으로 자동으로 소속을 바꾸지 않는다.
- 여러 요소를 한 번에 drop하는 것은 ~~`V2-GROUP-1A`의 범위다~~.
  `STUDIO-LAYERS-SHELL-1`에서는 선행 구현하지 않는다.
  > **변경됨(`HOME-CANVAS-GROUP-CONTRACT-1`).** 그 작업은 폐기됐다(§5).
  > **여러 요소를 한 번에 프레임에 넣는 것은 그룹 기능이 아니다** —
  > 필요해지면 별도 `HOME-CANVAS-V2-MULTI-ATTACH-1` 이고,
  > `HOME-CANVAS-GROUP-1A` 는 좌표를 바꾸지 않는 **폴더**만 만든다.

### 2-5. primary

- 메인 비주얼 안의 photo 행 하나에만 ★ 표시가 붙는다.
- 다른 photo를 대표 사진으로 지정하면 이전 primary는 삭제하지 않고 일반
  내부 photo로 남는다.
- primary가 아닌 photo가 없거나 primary 지정이 계약을 깨면 전체 동작을 거부한다.
- primary 지정 한 번은 Undo 한 칸이다.
- 구현 작업은 `STUDIO-LAYERS-STRUCTURE-1` 또는
  ~~`HOME-CANVAS-V2-GROUP-1A`~~에서 연다. Shell 단계에서는 읽기만 한다.
  > **✅ `STUDIO-LAYERS-STRUCTURE-1` 이 Layers 행의 ★ 로 끝냈다(계약 §32-6).**
  > 그래서 옛 `V2-GROUP-1A` 의 primary 항목은 남아 있지 않다(§5).

### 2-6. 숨김 · 잠금 · 삭제

Layers가 생긴 뒤에야 다음 UI를 안전하게 제공한다.

- 눈: `hidden` 토글. 숨겨도 Layers 행이 남으므로 다시 켤 수 있다.
- 자물쇠: `locked` 토글. Preview hit-test에서 빠져도 Layers에서 풀 수 있다.
- 삭제: 현재 v2 삭제 관문을 쓴다. primary처럼 삭제할 수 없는 대상은 이유를
  보여 주고 거부한다.
- 각 동작은 Undo 한 칸이며 Save/Export/Import/Publish를 지난다.

이 셋은 `STUDIO-LAYERS-SHELL-1`에서 만들지 않는다.
`STUDIO-LAYERS-STRUCTURE-1`의 범위다.

### 2-7. “폴더”의 뜻

첫 단계에서 실제 폴더는 **기존 main_visual 한 단계**다. v2 계약은 재귀
container와 임의 중첩 group을 아직 허용하지 않는다.

- main_visual 폴더: 저장 소속이 실제로 바뀌는 구조다.
- 다중 선택: 여러 요소를 잠시 함께 조작하는 편집 상태다.
- 임의의 영구 그룹 폴더: 아직 데이터 계약이 없다.

~~`V2-GROUP-1A~1C`를 구현할 때~~ “선택을 다시 해도 유지되는 영구 그룹”이
필요하다고 판단되면 `group` 노드를 즉흥적으로 추가하지 않는다. 별도
`HOME-CANVAS-GROUP-CONTRACT-1`에서 저장 모양 · 해제 · 중첩 금지 ·
v1/v2 호환을 먼저 확정한다.

> **✅ 그 확정이 끝났다(2026-09-23 · `HOME-CANVAS-GROUP-CONTRACT-1`) —
> [IMORY_HOME_CANVAS_GROUP_DESIGN.md](./IMORY_HOME_CANVAS_GROUP_DESIGN.md).**
> 결론은 **`group` 노드를 요소 배열에 넣지 않는다**는 것이다. 새 `type` 을
> 만들면 그 값을 모르는 옛 배포가 캔버스를 통째로 못 그린다 — 대신
> `canvas.groups` 라는 **새 칸 하나**를 두고 요소는 지금 자리에 그대로
> 남긴다(모르는 칸은 보존된다). 그래서 폴더는 **세 번째 종류의 폴더**가
> 된다: `main_visual` 은 소속과 자가 바뀌는 폴더, **그룹은 자가 그대로인
> 폴더**, 다중 선택은 여전히 잠깐의 편집 상태다.

## 3. 재료 추가의 새 자리

> **화면은 그 뒤 한 번 더 바뀌었다(2026-09-23 · `STUDIO-LAYERS-MATERIALS-1A`).**
> `＋ 재료 추가`는 이제 **Layers의 하위 화면**을 열고, 그 안은
> 자리별 글자 단추가 아니라 **홈 구성 · 꾸미기 두 분류의 카드 격자**다.
> 현행 계약은 [IMORY_HOME_CANVAS_CONTRACT.md §35](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> 이고, 아래 줄들 중 **쓰기 경로 · 슬롯 · 즉시 선택 · 행 드러내기**는
> 그대로다.

> **그리고 한 번 더 깊어졌다(2026-09-23 · `STUDIO-LAYERS-MATERIALS-1B`).**
> 카드는 이제 **분류**이고 그 아래에 재료 목록이 있다. 재료를 **Preview로
> 끌어다 놓으면 그 자리에** 생긴다. 현행 계약은
> [IMORY_HOME_CANVAS_CONTRACT.md §36](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> 이고, 재료 정의 한 벌은 `skin/skin-home-canvas-materials.js` 다 —
> 화면이 쓰기 경로에 보내는 것은 그 표의 **id 한 줄**이다.

재료 추가는 Select에서 Layers로 옮긴다.

- Layers 상단에 sticky `＋ 재료 추가` 버튼을 둔다.
- 누르면 자동 배치 · 페이지 자유 장식 · 현재 선택한 main_visual 안의 재료를
  구분해 보여 준다. — **변경됨 → 계약 §35-2**(분류는 홈 구성 · 꾸미기이고,
  어느 자리에 들어갈지는 카드가 계약에 물어 정한다).
- 기존 종류 표와 기본값 표를 복제하지 않는다.
- 기존 `commitStudioCanvasAddNode()` →
  `addStudioCanvasV2Node()` →
  `writeSkinHomeCanvasV2AddNode()` 경로를 그대로 쓴다.
- 이미지 슬롯 선택과 “새 슬롯 만들기”도 기존 한 경로를 재사용한다.
- 만든 요소를 즉시 고르고, Layers에서 그 행을 드러내고, Select로 전환하면
  곧바로 속성을 고칠 수 있어야 한다.
- Layers가 닫혀 있어도 Preview 결과와 draft는 동일하다.

Select에서는 재료 추가 절을 완전히 제거한다. 같은 UI를 두 패널에 복제해
과도기를 만들지 않는다.

## 4. Canvas 글자 타이포그래피

> **구현됨(2026-09-23 · `HOME-CANVAS-TYPOGRAPHY-1`).** 아래는 그때의
> 계획이다. 실제로 확정된 값 · 글꼴 여섯 · 저장 경로 · sandbox CSP 는
> [IMORY_HOME_CANVAS_CONTRACT.md §31](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> 에 있고, 그쪽이 현행 계약이다. 아래 §4-3 의 "일반 Inspector 의 원천을
> 재사용" 은 **바뀌었다** — 글꼴은 일반 Inspector 의 셋(sans/serif/mono)이
> 아니라 Canvas 와 Quote 가 함께 쓰는 새 카탈로그 여섯이다
> (`core/imory-font-catalog.js`). §4-4(rich text)만 아직 계획이다.

### 4-1. 기본 UI

Canvas의 `text` 요소를 단독 선택했을 때 Select 패널에 다음을 둔다.

```text
타이포그래피
[글꼴 ▼] [크기 16] [굵기 ▼]

고급 설정 ▾
[글자색] [자간] [행간]
```

- 글꼴 · 크기 · 굵기는 한 줄이다.
- 폭이 좁으면 세 칸이 잘리지 않고 자연스럽게 2행 또는 3행으로 감긴다.
- 고급 설정은 기본 접힘이다.
- 각 칸에 “스킨 기본값으로” 되돌리는 길이 있어야 한다.
- 값이 바뀌면 Preview에 즉시 보이고, 한 조작은 Undo 한 칸이다.
- native/sandbox Preview와 공개 화면이 같은 CSS 결과를 사용한다.

### 4-2. 저장 소유권

Canvas JSON은 geometry · 구조 · 텍스트 내용을 갖고, 시각 스타일은 스킨 CSS가
갖는 기존 계약을 유지한다.

- `props.fontSize`, `props.color` 같은 새 스타일 칸을 Canvas JSON에 넣지 않는다.
- Canvas 요소는 이미 안정적인 `data-imory-edit-id="canvas_..."`를 갖는다.
- 일반 Element Inspector의 CSS patch 방식과 specificity 규칙을 재사용한다.
- Canvas용 CSS writer를 별도로 복제하지 않는다.
- 한 속성을 고칠 때 같은 요소 규칙의 다른 선언과 사용자가 적은 스킨 CSS를
  필요 이상으로 다시 쓰지 않는다.
- “기본값으로”는 해당 override 선언만 제거한다.

### 4-3. 1차 값

| 설정 | 1차 범위 |
| --- | --- |
| 글꼴 | §4-3-1의 여섯 글꼴. Pretendard가 기본 |
| 글자 크기 | px 숫자 + 기존 number/range 패턴 |
| 굵기 | 일반 Inspector의 weight 원천을 재사용 |
| 글자색 | 요소 전체 `color` |
| 자간 | `letter-spacing`; px 숫자, 음수 허용 범위는 구현 전 계약으로 고정 |
| 행간 | 단위 없는 `line-height`; 허용 범위는 구현 전 계약으로 고정 |

글자 정렬은 자동 배치 블록의 align과 다른 개념이다. 필요하면 typography 고급
설정에 넣되, v2 블록 정렬 값을 재사용하거나 덮지 않는다.

### 4-3-1. 확정 글꼴과 Quote Preset

Canvas Typography와 Quote Preset의 BODY > FONT는 다음 공용 카탈로그를 쓴다.

| 키 | 표시 | CSS family |
| --- | --- | --- |
| `pretendard` | Pretendard (기본) | `"Pretendard", sans-serif` |
| `nanumgothic` | 나눔고딕 | `"Nanum Gothic", sans-serif` |
| `nanumsquareneo` | 나눔스퀘어네오 | `"NanumSquareNeo", "Nanum Square Neo", sans-serif` |
| `nanummyeongjo` | 나눔명조 | `"Nanum Myeongjo", serif` |
| `gowundodum` | 고운돋움 | `"Gowun Dodum", sans-serif` |
| `gowunbatang` | 고운바탕 | `"Gowun Batang", serif` |

- 키·표시명·CSS stack을 Canvas와 Quote에 따로 하드코딩하지 않는다.
- 기존 Quote의 `settings.bodyFont`, `pretendard`,
  `nanummyeongjo`, Pretendard 기본값과 unknown-field 보존을 유지한다.
- DB migration 없이 기존 `quote_presets` 저장 경로를 쓴다.
- 관리 Preview·글쓰기 Preview·export·공개 글과 Canvas 네 realm에서 실제
  글꼴을 로드한다. export는 font load 뒤 캡처하고 fallback을 성공으로 세지 않는다.
- 외부 font source를 더하면 CSP/sandbox allowlist와 위반 0을 검증한다.
- Quote 제목 글꼴과 일반 HTML Inspector 확대는 이 작업 범위가 아니다.

### 4-4. 일부 글자만 다른 색

현재 `props.text`는 평문 문자열이고 `<b>` 같은 입력은 실행되지 않는다.
따라서 요소 전체 색상과 “선택한 글자 일부의 색상”은 같은 작업이 아니다.

부분 색상은 `HOME-CANVAS-RICH-TEXT-1`로 분리한다.

비규범 예시:

```json
{
  "text": "Forever, my foe",
  "runs": [
    { "start": 0, "end": 9, "color": null },
    { "start": 9, "end": 15, "color": "#23395b" }
  ]
}
```

구현 전에 다음을 별도 계약으로 정한다.

- 문자열 수정 뒤 run 범위를 어떻게 보존하거나 접을지
- 겹친 run을 허용할지
- 색 외 굵기·기울임까지 같은 모델을 쓸지
- 붙여넣기와 줄바꿈
- sanitizer와 sandbox 봉투
- Save/Export/Import/AI 수정
- 선택 영역이 없는 모바일 편집 UX

raw HTML을 `props.text`에 허용하는 방식으로 우회하지 않는다.

## 5. GROUP-1A~1C와 Layers의 관계

> **교체됨(2026-09-23 · `HOME-CANVAS-GROUP-CONTRACT-1`).** 아래 세 절은
> 이 문서를 쓸 때의 계획이고, **그때의 `V2-GROUP-1A` 는 폐기됐다** —
> 그것은 "여러 overlay 를 한 번에 `main_visual` 에 attach 하고 primary 를
> 고르는" 일이었는데, 그것은 그룹이 아니라 **프레임 내부 배치**를 여럿으로
> 넓히는 일이다. 영구 그룹의 저장 모양 · 좌표 · Layers UX · 호환은
> [IMORY_HOME_CANVAS_GROUP_DESIGN.md](./IMORY_HOME_CANVAS_GROUP_DESIGN.md)
> 가 갖고, 작업 ID 도 `V2-` 가 빠진 **`HOME-CANVAS-GROUP-1A`·`1B`·`1C`** 로
> 바뀌었다. 아래는 그 교체 표다.

그룹 기능은 취소하지 않는다. **Layers가 주 진입점**, Preview lasso/Shift가
빠른 진입점이 된다. 다만 **그룹은 Layers 의 영구 폴더**이고,
`main_visual` 의 넣기/빼기와 **다른 기능**이다 — 그룹은 좌표계를 바꾸지
않고 화면을 한 픽셀도 건드리지 않는다.

| 옛 계획 | 지금 |
| --- | --- |
| `HOME-CANVAS-V2-GROUP-1A` (여러 overlay 를 한 번에 main_visual 에 묶기 · primary 지정) | **폐기.** 필요해지면 별도 작업 `HOME-CANVAS-V2-MULTI-ATTACH-1` 로 다시 낸다. primary 지정 UI 는 이미 있다(Layers 행의 ★ — 계약 §32-6) |
| `HOME-CANVAS-V2-GROUP-1B` (다중 선택 함께 이동) | **`HOME-CANVAS-GROUP-1B`** — 대상이 "잠깐 고른 여럿"이 아니라 **영구 그룹**이다 |
| `HOME-CANVAS-V2-GROUP-1C` (그룹 리사이즈 · 회전) | **`HOME-CANVAS-GROUP-1C`** |

### `HOME-CANVAS-GROUP-1A` — 저장 구조 · 만들기/해제 · 폴더 · 넣기/빼기 · 선택

- 저장은 **`canvas.groups` 새 배열 하나**다 — 그룹은 `{ id, name, members }`
  뿐이고 **좌표를 갖지 않는다.** 요소는 지금 있는 배열에 그대로 남는다.
  그래서 만들기 · 해제 · 넣기 · 빼기가 **좌표를 한 칸도 쓰지 않고**, 화면
  보존이 계산 결과가 아니라 구조적 사실이다.
- Layers 에 폴더 행(아이콘 · 펼침 화살표 · 기본 이름 `그룹 N`)이 생긴다.
  접힘 상태는 지금처럼 **Studio UI 상태**이고 저장 데이터가 아니다.
- 폴더 행을 누르면 멤버 전부가 선택되고, 자식 행을 누르면 그 요소 단독이다.
  Preview 에서는 `main_visual` 과 같은 **두 단계**(그룹 → 요소)다.
- 폴더 가운데 띠로 drop 하면 넣기, 폴더 밖으로 drop 하면 빼기다.
- **그룹 해제**(폴더만 없앰)와 **그룹 삭제**(자식까지)는 다른 단추이고,
  삭제는 확인을 받는다. 대표 사진이 멤버면 전체를 거부한다.
- 같은 좌표 공간끼리만 묶는다(overlay 끼리 · **같은** 프레임의 자식끼리).
  중첩 금지 · 블록 제외 · 공간을 넘는 이동 금지.
- 전체 transform 은 **이 단계에 없다.**

### `HOME-CANVAS-GROUP-1B` — 그룹 전체 이동

- 프레임은 **도화지 자의 delta 하나**만 올리고, 부모가 멤버마다
  `studioCanvasV2Space()` → `planStudioCanvasV2Transform("v2-move")` 로
  자기 자로 환산한다. 새 좌표 수식을 만들지 않는다.
- 서로 다른 자가 섞이는 조합은 **애초에 그룹이 될 수 없다**(1A 의 계약).
  한 프레임 안에서 `pin` 과 `transform` 이 섞이는 것만 허용이고, 그 둘은
  멤버별 환산으로 푼다.
- 멤버 N개의 쓰기가 **한 커밋**이고 한 제스처 = Undo 한 칸이다. 하나라도
  실패하면 아무것도 바뀌지 않는다.

### `HOME-CANVAS-GROUP-1C` — 그룹 전체 크기 조절 · 회전

- 크기는 **균등 배율 하나**이고 모서리 손잡이 넷만 쓴다 — 회전된 자식을
  비균등으로 줄이면 계약에 없는 전단이 생긴다.
- 회전은 **피벗과 멤버별 중심**만 쓴다. 중심은 회전해도 AABB 중심과 같으므로
  `height:"auto"` 멤버도 높이를 몰라도 된다.
- Moveable이 주는 group event를 실측하고, 단일 요소 수식을 복제해 추측하지 않는다.
- 한 제스처는 Undo 한 칸이다.

상세(JSON 예시 · 숫자 예시 · 허용/금지 표 · 왕복 오차 · 남은 결정)는
[IMORY_HOME_CANVAS_GROUP_DESIGN.md](./IMORY_HOME_CANVAS_GROUP_DESIGN.md) 다.

## 6. 작업 순서

| 순서 | 작업 ID | 범위 | 상태 |
| ---: | --- | --- | --- |
| 0 | `STUDIO-LAYERS-PLAN-1` | 이 문서. 책임 · UX · 작업 경계 확정 | **완료 — 문서만** |
| 1 | `STUDIO-LAYERS-SHELL-1` | 상단 Dock 자리를 Layers로 교체 · 읽기 전용 트리 · Select의 재료 추가를 Layers로 이동 · Dock Settings 진입 경로 조사/이동 | **완료** — [studio/inspector/studio-canvas-layers.js](../../studio/inspector/studio-canvas-layers.js) · [admin/settings/admin-bottom-dock-entry.js](../../admin/settings/admin-bottom-dock-entry.js) · `studio/studio-home-canvas-inspector-e2e-test.mjs --only=layers` · `admin/admin-settings-e2e-test.mjs --only=dock` |
| 2 | `HOME-CANVAS-TYPOGRAPHY-1` | Canvas 타이포그래피 + Quote Preset `bodyFont` 여섯 글꼴 | **완료** — [studio/inspector/studio-canvas-typography.js](../../studio/inspector/studio-canvas-typography.js) · [core/imory-font-catalog.js](../../core/imory-font-catalog.js) · [core/imory-fonts.css](../../core/imory-fonts.css) · 계약 [§31](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/studio-home-canvas-typography-e2e-test.mjs` · `admin/quote/quote-render-parity-e2e-test.mjs --only=font` · `node core/imory-font-catalog-test.mjs` |
| 3 | `STUDIO-LAYERS-STRUCTURE-1` | 순서 drag · 단일 attach/detach · primary · 숨김 · 잠금 · 삭제 | **완료** — [studio/inspector/studio-canvas-layers-ops.js](../../studio/inspector/studio-canvas-layers-ops.js) · [studio/inspector/studio-canvas-layers-drag.js](../../studio/inspector/studio-canvas-layers-drag.js) · [skin/skin-home-canvas-write-v2.js](../../skin/skin-home-canvas-write-v2.js) §6 · 계약 [§32](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/studio-home-canvas-inspector-e2e-test.mjs --only=layerstruct` · `node skin/skin-home-canvas-test.mjs`([v2-structure]) |
| 3-1 | `STUDIO-LAYERS-MEDIA-1` | 상단 Images 제거 · Layers 행에서 사진 바꾸기 · 사용 중 이미지 삭제 | **완료** — [studio/images/images-panel.js](../../studio/images/images-panel.js) · 계약 [§34](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/images/skin-image-library-e2e-test.mjs` |
| 3-2 | `STUDIO-LAYERS-MATERIALS-1A` | `＋ 재료 추가`를 재료 탐색 하위 화면으로(분류 둘 · 카드 여덟 · 클릭 추가 · 중복 방지) | **완료** — [studio/inspector/studio-canvas-add-v2.js](../../studio/inspector/studio-canvas-add-v2.js) · [studio/inspector/studio-canvas-layers.js](../../studio/inspector/studio-canvas-layers.js) · 계약 [§35](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/studio-home-canvas-materials-e2e-test.mjs` |
| 3-3 | `STUDIO-LAYERS-MATERIALS-1B` | **재료별 프리셋 목록과 drag/drop** — 카드 하나를 누르면 하위 재료 목록이 열리고, 재료를 Preview 로 끌어다 놓아 자리를 정한다 | **완료** — [skin/skin-home-canvas-materials.js](../../skin/skin-home-canvas-materials.js) · [studio/inspector/studio-canvas-materials-drag.js](../../studio/inspector/studio-canvas-materials-drag.js) · 계약 [§36](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/studio-home-canvas-materials-e2e-test.mjs --only=items,drop` |
| 3-4 | `STUDIO-LAYERS-MATERIALS-1C` | **끌기 손잡이와 카탈로그 도달 범위** — 카드 본문(누르기 · 세로 스크롤)과 손잡이(끌기)를 가르고, 계약의 두 종류 표가 허용하는데 카탈로그가 막고 있던 자리(흐름의 `text` · 자유 층과 프레임 안의 `logo`·`category_nav`)를 연다. 새 재료 종류도 새 저장 필드도 없다 | **완료** — [studio/inspector/studio-canvas-materials-drag.js](../../studio/inspector/studio-canvas-materials-drag.js) · [studio/inspector/studio-canvas-add-v2.js](../../studio/inspector/studio-canvas-add-v2.js) · 계약 [§37](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/studio-home-canvas-materials-e2e-test.mjs --only=handle,reach` |
| 3-5 | `HOME-CANVAS-GROUP-CONTRACT-1` | **영구 그룹의 저장 구조 · 좌표 · Layers UX · 호환 확정. 문서만** | **완료**(2026-09-23) — [IMORY_HOME_CANVAS_GROUP_DESIGN.md](./IMORY_HOME_CANVAS_GROUP_DESIGN.md) |
| 4 | `HOME-CANVAS-GROUP-1A` | `canvas.groups` 저장 구조 · 그룹 만들기/해제/삭제 · Layers 폴더 · 자식 넣기/빼기 · 그룹/자식 선택. **전체 transform 없음** | 미착수 |
| 5 | `HOME-CANVAS-GROUP-1B` | 그룹 전체 이동 | 미착수 |
| 6 | `HOME-CANVAS-GROUP-1C` | 그룹 전체 크기 조절 · 회전 | 미착수 |
| — | ~~`HOME-CANVAS-V2-GROUP-1A`~~ | ~~여러 요소를 한 번에 main_visual 에 묶기 · primary 지정~~ | **폐기**(§5) — primary 지정은 `STUDIO-LAYERS-STRUCTURE-1` 이 이미 했고, 여러 요소 attach 가 필요해지면 `HOME-CANVAS-V2-MULTI-ATTACH-1` 로 다시 낸다 |
| 7 | `HOME-CANVAS-RICH-TEXT-1` | 선택한 일부 글자 색상 등 구조형 텍스트 | 미착수 |

각 작업은 별도 커밋이다. 사용자가 지정한 작업 ID 하나만 구현하고 뒤 단계를
선행 구현하지 않는다.

## 7. `STUDIO-LAYERS-SHELL-1` 완료 기준

### 반드시 한다

- 실제 `main`과 현행 계약을 조사한다.
- 상단 패널 진입점이 `Select · Images · Layers · Layout`이 된다.
- Layers 패널이 v2의 flow block · main_visual 자식 · overlay를 실제 draft
  순서대로 보여 준다.
- Preview 선택과 Layers 선택이 기존 선택 상태 하나로 양방향 동기화된다.
- Select의 재료 추가 UI를 Layers로 옮기고 기존 추가 관문을 그대로 쓴다.
- 새로 만든 요소가 Layers와 Preview에서 곧바로 선택된다.
- Dock 설정은 데이터·저장 경로를 복제하지 않는 방식으로 Settings에서 열리게
  한다. 불가능하면 범위를 넓혀 억지로 구현하지 말고 근거와 후속 작업을 보고한다.
- 390px 시트에서 트리가 잘리지 않고 Preview 스크롤과 충돌하지 않는다.
- native/sandbox Preview에서 선택 결과가 같다.
- 문서와 TESTS 색인을 함께 갱신한다.

### 이번에 하지 않는다

- 레이어 drag reorder
- attach/detach drop
- primary 변경
- 숨김 · 잠금 · 삭제 버튼
- 다중 묶기 · 그룹 이동 · 그룹 리사이즈 · 그룹 회전
- Canvas 타이포그래피
- rich text
- 새 group 데이터 타입
- APP_BUILD_VERSION 변경 · 배포

### 테스트 초점

- 상단 네 버튼과 각 패널 전환
- Select를 떠났다가 돌아와도 선택 유지
- 트리 순서와 실제 draft 배열 순서 일치
- main_visual 접기/펼치기와 primary 표식
- Layers 행 선택 ↔ Preview 선택
- 재료 종류별 추가 · 슬롯 선언 · Undo/Redo
- 390px sheet peek/content/full
- native/sandbox
- 기존 Images · Layout · Select · Dock 데이터 회귀
- CSP 위반 0

## 8. 다음 작업용 지시문

```text
작업 ID: HOME-CANVAS-GROUP-1A

현재 main 과 docs/plans/IMORY_HOME_CANVAS_GROUP_DESIGN.md 전체,
이 문서 §2-3 · §2-4 · §2-7 · §5 · §6, HOME Canvas 계약 §28 · §32 를
읽고 이 작업만 구현해 줘.

이번 범위는 **영구 그룹의 저장 구조와 Layers 폴더**다. 설계 문서가
이미 확정한 것을 다시 설계하지 말고 그대로 구현해라 —
`canvas.groups` 는 `{ id, name, members }` 뿐이고 **좌표를 갖지 않는다.**
만들기 · 해제 · 삭제 · 넣기 · 빼기가 좌표를 한 칸도 쓰지 않아야 하고,
그래서 화면이 한 픽셀도 바뀌지 않아야 한다.

먼저 조사해 짧게 보고해라 — listSkinHomeCanvasV2Nodes() 가 주는 행에
그룹 단계를 얹는 가장 얇은 길, studioCanvasLayersDropPlan() 의 띠
규칙에 폴더 띠를 더하는 자리, commitStudioCanvasStructureNode() 의
op 목록과 via 두 갈래가 새 다섯 op 를 그대로 받을 수 있는가,
studioCanvasSelectTargetId() 의 프레임 두 단계 뒤에 그룹 단계를
붙일 때 세 단계가 되는 경로(프레임 안의 그룹된 장식).

검증은 skin/skin-home-canvas-v2.js 에 넣고, 설계 §3-2 의 "거부/봐줌"
표를 글자 그대로 따라라 — 없는 멤버 id 와 공간이 어긋난 멤버는
**Import 에서 봐주고**, 그룹 동작을 실행할 때 같은 커밋에서 고친다
(설계 §7-3 advisory).

이번에 하지 말 것: 그룹 전체 이동 · 크기 · 회전(1B · 1C) · 그룹 단위
순서 이동 · 이름 변경 UI · 그룹 hidden/locked · 중첩 · 좌표 공간을
넘는 이동 · v1 캔버스의 그룹 · 여러 요소 동시 attach ·
렌더러 변경 · 실행 payload 변경 · sandbox 프로토콜 변경 ·
APP_BUILD_VERSION · 배포.

★ 설계 §11-2 의 결정 넷 중 이 단계에 걸리는 것은 2(이름 변경 UI)와
3(Import 의 관대함)이다. 사용자가 다르게 답했으면 그 답을 따르고,
답이 없으면 설계의 권장안(각각 "나중" · "봐준다")대로 간다.

테스트: 만들기/해제/넣기/빼기 전후 **모든 요소의 JSON 이 글자 단위로
같다** · 그룹 선택이 멤버 전부를 고른다 · 자식 행이 단독 선택 ·
Preview 두 단계 진입 · 금지 조합(다른 공간 · 블록 · 이미 다른 그룹)
거부 · 빈 그룹 자동 삭제 · 대표 사진이 든 그룹 삭제의 원자적 거부 ·
Undo 한 칸과 변화 없는 drop 의 0칸 · Save → 다시 열기 · Export →
Import · Publish resolve · **봉투가 바이트 단위로 그대로**(groups 가
payload 에 안 실린다) · native/sandbox parity · 390px · CSP 위반 0 ·
기존 회귀(--only=layers,layerstruct,v2).

새 e2e 는 studio/studio-home-canvas-group-e2e-test.mjs (포트 9010 ·
9011), 단위는 skin/skin-home-canvas-test.mjs 의 [v2-group] 절이다.

문서는 계약 문서에 새 절로 적고, 설계 문서의 §9 에 완료 표시를 하고,
이 문서 §6 의 4단계를 완료로 바꾸고 §8 을 HOME-CANVAS-GROUP-1B
지시문으로 갈아 끼우고, docs/TESTS.md §13 에 새 e2e 행을 넣어라.
완료하면 한 커밋으로 main 에 push 하고 결과를 보고해라.
```

### 배포 전 정리 항목

이 줄들은 기능 작업에 섞지 않는다. 배포를 준비할 때 따로 처리한다.

- `auth/index.html` · `invite/index.html` 이 Pretendard 파일을 싣지 않는다
  (`core/imory-fonts.css` 를 링크하지 않는다). 글꼴이 fallback 으로 떨어진다.
  `HOME-CANVAS-TYPOGRAPHY-1` 에서 발견했고 `STUDIO-LAYERS-STRUCTURE-1`
  에서도 손대지 않았다.
