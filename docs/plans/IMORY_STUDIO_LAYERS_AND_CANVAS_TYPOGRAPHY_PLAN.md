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
> 4단계 `HOME-CANVAS-V2-GROUP-1A` 부터는 아직 계획이다 — 이 문서를
> 근거로 그것들이 있다고 읽지 않는다.
>
> 다음 구현 작업은 **`HOME-CANVAS-V2-GROUP-1A` 하나**이고, 그 뒤가
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
- 여러 요소를 한 번에 drop하는 것은 `V2-GROUP-1A`의 범위다.
  `STUDIO-LAYERS-SHELL-1`에서는 선행 구현하지 않는다.

### 2-5. primary

- 메인 비주얼 안의 photo 행 하나에만 ★ 표시가 붙는다.
- 다른 photo를 대표 사진으로 지정하면 이전 primary는 삭제하지 않고 일반
  내부 photo로 남는다.
- primary가 아닌 photo가 없거나 primary 지정이 계약을 깨면 전체 동작을 거부한다.
- primary 지정 한 번은 Undo 한 칸이다.
- 구현 작업은 `STUDIO-LAYERS-STRUCTURE-1` 또는
  `HOME-CANVAS-V2-GROUP-1A`에서 연다. Shell 단계에서는 읽기만 한다.

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

`V2-GROUP-1A~1C`를 구현할 때 “선택을 다시 해도 유지되는 영구 그룹”이
필요하다고 판단되면 `group` 노드를 즉흥적으로 추가하지 않는다. 별도
`HOME-CANVAS-GROUP-CONTRACT-1`에서 저장 모양 · 해제 · 중첩 금지 ·
v1/v2 호환을 먼저 확정한다.

## 3. 재료 추가의 새 자리

> **화면은 그 뒤 한 번 더 바뀌었다(2026-09-23 · `STUDIO-LAYERS-MATERIALS-1A`).**
> `＋ 재료 추가`는 이제 **Layers의 하위 화면**을 열고, 그 안은
> 자리별 글자 단추가 아니라 **홈 구성 · 꾸미기 두 분류의 카드 격자**다.
> 현행 계약은 [IMORY_HOME_CANVAS_CONTRACT.md §35](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> 이고, 아래 줄들 중 **쓰기 경로 · 슬롯 · 즉시 선택 · 행 드러내기**는
> 그대로다.

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

그룹 기능은 취소하지 않는다. **Layers가 주 진입점**, Preview lasso/Shift가
빠른 진입점이 된다.

### `HOME-CANVAS-V2-GROUP-1A`

- Layers 또는 Preview에서 고른 여러 overlay를 한 번에 명시적
  main_visual에 묶는다.
- photo가 하나 이상이어야 하고 primary photo를 사용자가 고른다.
- 기존 primary는 삭제하지 않고 일반 내부 photo로 남긴다.
- 모든 변환은 원자적이다. 하나라도 실패하면 일부만 옮기지 않는다.
- 화면 위치 · 크기 · 회전 · id · props · 모르는 필드를 보존한다.
- 전체 동작은 Undo 한 칸이다.

### `HOME-CANVAS-V2-GROUP-1B`

- 같은 좌표 자에 있는 다중 선택을 함께 이동한다.
- 서로 다른 자(page overlay와 frame element 등)가 섞이면 임의 변환하지 않고
  허용 조합을 계약으로 먼저 고정한다.
- 한 제스처는 Undo 한 칸이다.

### `HOME-CANVAS-V2-GROUP-1C`

- 그룹 리사이즈 · 그룹 회전.
- 각 요소의 중심 · 비율 · `height:"auto"` · `follow:"pin"`을 어떻게
  처리할지 구현 전에 명시한다.
- Moveable이 주는 group event를 실측하고, 단일 요소 수식을 복제해 추측하지 않는다.
- 한 제스처는 Undo 한 칸이다.

## 6. 작업 순서

| 순서 | 작업 ID | 범위 | 상태 |
| ---: | --- | --- | --- |
| 0 | `STUDIO-LAYERS-PLAN-1` | 이 문서. 책임 · UX · 작업 경계 확정 | **완료 — 문서만** |
| 1 | `STUDIO-LAYERS-SHELL-1` | 상단 Dock 자리를 Layers로 교체 · 읽기 전용 트리 · Select의 재료 추가를 Layers로 이동 · Dock Settings 진입 경로 조사/이동 | **완료** — [studio/inspector/studio-canvas-layers.js](../../studio/inspector/studio-canvas-layers.js) · [admin/settings/admin-bottom-dock-entry.js](../../admin/settings/admin-bottom-dock-entry.js) · `studio/studio-home-canvas-inspector-e2e-test.mjs --only=layers` · `admin/admin-settings-e2e-test.mjs --only=dock` |
| 2 | `HOME-CANVAS-TYPOGRAPHY-1` | Canvas 타이포그래피 + Quote Preset `bodyFont` 여섯 글꼴 | **완료** — [studio/inspector/studio-canvas-typography.js](../../studio/inspector/studio-canvas-typography.js) · [core/imory-font-catalog.js](../../core/imory-font-catalog.js) · [core/imory-fonts.css](../../core/imory-fonts.css) · 계약 [§31](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/studio-home-canvas-typography-e2e-test.mjs` · `admin/quote/quote-render-parity-e2e-test.mjs --only=font` · `node core/imory-font-catalog-test.mjs` |
| 3 | `STUDIO-LAYERS-STRUCTURE-1` | 순서 drag · 단일 attach/detach · primary · 숨김 · 잠금 · 삭제 | **완료** — [studio/inspector/studio-canvas-layers-ops.js](../../studio/inspector/studio-canvas-layers-ops.js) · [studio/inspector/studio-canvas-layers-drag.js](../../studio/inspector/studio-canvas-layers-drag.js) · [skin/skin-home-canvas-write-v2.js](../../skin/skin-home-canvas-write-v2.js) §6 · 계약 [§32](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/studio-home-canvas-inspector-e2e-test.mjs --only=layerstruct` · `node skin/skin-home-canvas-test.mjs`([v2-structure]) |
| 3-1 | `STUDIO-LAYERS-MEDIA-1` | 상단 Images 제거 · Layers 행에서 사진 바꾸기 · 사용 중 이미지 삭제 | **완료** — [studio/images/images-panel.js](../../studio/images/images-panel.js) · 계약 [§34](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/images/skin-image-library-e2e-test.mjs` |
| 3-2 | `STUDIO-LAYERS-MATERIALS-1A` | `＋ 재료 추가`를 재료 탐색 하위 화면으로(분류 둘 · 카드 여덟 · 클릭 추가 · 중복 방지) | **완료** — [studio/inspector/studio-canvas-add-v2.js](../../studio/inspector/studio-canvas-add-v2.js) · [studio/inspector/studio-canvas-layers.js](../../studio/inspector/studio-canvas-layers.js) · 계약 [§35](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) · `studio/studio-home-canvas-materials-e2e-test.mjs` |
| 3-3 | `STUDIO-LAYERS-MATERIALS-1B` | **재료별 프리셋 목록과 drag/drop** — 카드 하나를 누르면 하위 재료 목록(도형의 `rect`/`ellipse`/`line`, 디자인 요소의 테이프·스티커·종이 조각·배지)이 열리고, 카드를 Preview 로 끌어다 놓아 자리를 정한다. 카드가 덮지 않는 자리·종류 조합(흐름의 `text`, 자유 층의 `logo`·`category_nav`)도 여기서 드러난다 — 계약 [§35-5 · §35-8](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) | **다음 작업** |
| 4 | `HOME-CANVAS-V2-GROUP-1A` | 여러 요소 묶기 · primary 지정 | 미착수 |
| 5 | `HOME-CANVAS-V2-GROUP-1B` | 그룹 이동 | 미착수 |
| 6 | `HOME-CANVAS-V2-GROUP-1C` | 그룹 리사이즈 · 회전 | 미착수 |
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
작업 ID: HOME-CANVAS-V2-GROUP-1A

현재 main 과 이 문서 §2-4 · §2-7 · §6, HOME Canvas 계약 §28 · §32 를
읽고 이 작업만 구현해 줘.

먼저 조사해 짧게 보고해라 — 지금의 다중 선택(Selecto lasso · Shift ·
Ctrl/⌘ · Layers 행)이 무엇을 들고 있는가, 단일 묶기/빼기가 쓰는
planStudioCanvasV2Attach()/Detach() 와 CANVAS_LAYOUT 보고가 여러
요소에 그대로 쓰일 수 있는가, 구조 입구(commitStudioCanvasStructureNode)
의 via 두 갈래와 원자성 규칙이 어디까지 버티는가.

이번 범위는 **여러 요소를 한 번에 묶고 빼는 것**과, 그 선택 안에서
대표 사진을 지정하는 것이다. 여러 요소의 소속 변경 하나가 Undo 한
칸이어야 하고, 하나라도 실패하면 **아무것도 바뀌지 않아야** 한다
(부분 적용 금지 — 계약 §32-10 의 그 규칙을 여러 요소로 넓힌다).
드롭한 폴더가 대상이고 가까운 프레임을 자동으로 고르지 않는다.
화면 위치 · 크기 · 회전 · id · props · 모르는 필드를 보존한다.

Layers 에서 여러 행을 골라 함께 끄는 길을 연다 —
지금은 "여러 요소 이동은 다음 단계에서 지원합니다"로 거부한다
(studio/inspector/studio-canvas-layers-drag.js). 그 문장을 지우고
실제 동작으로 바꾸되, 순서 바꾸기를 여러 요소로 넓힐지는 먼저
계약으로 정하고 보고해라.

이번에 하지 말 것: 그룹 이동 · 그룹 리사이즈 · 그룹 회전(1B · 1C) ·
영구 group 노드(별도 HOME-CANVAS-GROUP-CONTRACT-1 이 저장 모양 ·
해제 · 중첩 금지 · v1/v2 호환을 먼저 확정한다) · rich text ·
Crop · 효과 · responsive override · v1 Layers 의 구조 편집 ·
일반 HTML Inspector 변경 · APP_BUILD_VERSION · 배포.

테스트: 여러 overlay 를 한 프레임에 묶기 · 여러 프레임 내부 요소를
빼기 · 섞인 선택의 거부 · 하나가 실패할 때의 원자적 거부 · 전후
화면 좌표 유지 · Undo 한 칸 · Save → 다시 열기 · Export → Import ·
Publish resolve · native/sandbox parity · 390px · CSP 위반 0 ·
단일 묶기/빼기와 Layers 구조 회귀(--only=layers,layerstruct).

문서는 계약에 새 절로 적고, 이 문서 §6 의 4단계를 완료로 바꾸고
§8 을 HOME-CANVAS-V2-GROUP-1B 지시문으로 갈아 끼워라.
완료하면 한 커밋으로 main 에 push 하고 결과를 보고해라.
```

### 배포 전 정리 항목

이 줄들은 기능 작업에 섞지 않는다. 배포를 준비할 때 따로 처리한다.

- `auth/index.html` · `invite/index.html` 이 Pretendard 파일을 싣지 않는다
  (`core/imory-fonts.css` 를 링크하지 않는다). 글꼴이 fallback 으로 떨어진다.
  `HOME-CANVAS-TYPOGRAPHY-1` 에서 발견했고 `STUDIO-LAYERS-STRUCTURE-1`
  에서도 손대지 않았다.
