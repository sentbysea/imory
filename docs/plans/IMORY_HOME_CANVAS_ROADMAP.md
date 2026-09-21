# IMORY HOME CANVAS — 기준 문서와 단계별 작업 계획

> 상태: **PLAN**. 앞으로의 방향을 적은 기획 문서이고, 여기 적힌 것은 아직
> 구현되지 않았다. 이 문서를 읽는 것만으로 전체 구현을 허가하지 않는다.
>
> 에이전트는 사용자가 메시지에서 명시한 **작업 ID 하나만** 수행한다. 다음 단계 선행 구현, 범위 확대, 임의 리팩터링은 금지한다.

## 0. 이 문서의 역할

이 문서는 Imory 스킨의 새 방향을 고정하는 장기 기준이다. 한 번에 거대한 편집기를 만들지 않고, 현재 Studio의 기능을 보존하면서 작은 작업으로 나누어 검증한다.

작업 시작 시:

1. 이 문서 전체와 저장소의 관련 기준 문서를 읽는다.
2. 현재 코드에서 이미 구현된 기능을 조사한다.
3. 메시지에 적힌 작업 ID의 범위만 구현한다.
4. 범위 밖에서 필요한 변경을 발견하면 구현하지 말고 최종 보고의 `다음 작업 후보`에 적는다.
5. 작업 ID가 명시되지 않았다면 코드 변경을 시작하지 말고 어떤 작업을 수행할지 질문한다.

## 1. 제품 목표

HOME을 일반적인 웹페이지 빌더가 아니라 **티스토리 감성의 한 폭짜리 디자인 캔버스**처럼 꾸밀 수 있게 한다.

사용자는 다음 두 방식 중 하나로 시작한다.

- 제공 레이아웃 선택: 사진 1장·2장·3장·4칸 등의 틀을 고른 뒤 사진과 로고만 교체
- 빈 캔버스 시작: 사진·텍스트·카테고리·로고·스티커·꾸밈 요소를 직접 배치

HOME 바깥의 글 목록, 글 본문, CATEGORY, POST, 양옆 정보 패널은 기존 Imory의 데이터와 Context 바인딩을 계속 사용한다.

## 2. 디자인 원칙

- 결과물은 블록 위젯 모음보다 잡지 한 면·다꾸·개인 홈페이지에 가깝다.
- 기본 배경은 여백이 충분한 라이트/다크 두 계열을 제공한다.
- 색은 배경색, 본문색, 포인트색 1~2개를 중심으로 제한한다.
- 사진과 타이포가 중심이고 꾸밈 요소는 보조다.
- 카테고리는 큰 알약 버튼보다 다음과 같은 작은 형태를 우선한다.
  - 작은 텍스트만
  - 얇은 단색 바 위 텍스트
  - 단색 면과 위아래 외곽선 사이의 텍스트
- 로고는 PNG 업로드 또는 텍스트를 지원한다. 옆에 작은 문구나 `〈 〉` 같은 장식을 붙일 수 있다.
- 스티커는 PNG/JPG 업로드, 크기, 회전, 앞뒤 순서, 외곽선, 스티커 칼선 표현을 지원하는 방향으로 확장한다.
- 꾸밈선, 인덱스 조각, 프레임, 작은 도형은 콘텐츠 의미가 없는 장식 요소로 취급한다.
- 모바일에서 가능한 한 첫 화면에 시각적 구성이 들어오되, 내용이 많아지면 정상적인 문서 스크롤을 허용한다.
- 스크롤바를 억지로 숨겨 콘텐츠 접근을 막지 않는다.

## 3. 기술 방향

### 3.1 유지할 것

- SkinPackage와 기존 Context 바인딩
- Images 슬롯과 이미지 업로드
- Crop 확대·위치 조절
- Select Inspector
- Undo/Redo와 dirty 상태
- Save, Import/Export, Publish
- native/sandbox Preview와 공개 화면
- 1·2·3단 및 모바일 좌우 패널
- 기존 스킨의 하위 호환

### 3.2 새로 둘 것

- HOME 캔버스 전용의 작은 직렬화 데이터 계약
- 캔버스 요소 렌더러
- 캔버스 프리셋 레지스트리
- 선택·이동·크기·회전 조작 연결부
- 캔버스 전용 추가/레이어 UI

### 3.3 오픈소스 사용 원칙

- 드래그·리사이즈·회전·스냅·그룹 조작 후보: `Moveable`
- 마우스/터치 다중 선택 후보: `Selecto`
- 두 라이브러리는 먼저 별도 Spike에서 현재 iframe, 모바일 터치, sandbox 정책과의 적합성을 확인한다.
- 적합성 검증 전에는 의존성을 운영 진입점에 넣거나 기존 Inspector를 교체하지 않는다.
- GrapesJS처럼 HTML/CSS 생성과 저장 전체를 소유하는 편집기를 Imory 안에 중복 도입하지 않는다.
- React 전환을 별도 결정하지 않는 한 Puck/Craft.js를 Studio의 기반으로 채택하지 않는다.

## 4. 데이터 계약의 방향

정확한 필드와 저장 위치는 `CONTRACT-1`에서 기존 SkinPackage 구조를 조사한 뒤 확정한다. 아래는 목표 형태를 설명하는 비규범 예시다.

```json
{
  "name": "home_canvas",
  "version": 1,
  "settings": {
    "background": "#ffffff",
    "canvasWidth": 390,
    "minHeight": 760
  },
  "elements": [
    {
      "id": "element_1",
      "type": "photo",
      "x": 40,
      "y": 220,
      "width": 310,
      "height": 390,
      "rotation": 0,
      "z": 1,
      "props": {
        "slot": "photo_1"
      }
    }
  ]
}
```

필수 원칙:

- 저장값은 브라우저 픽셀 측정 결과의 덤프가 아니라 안정된 캔버스 좌표다.
- DOM 전체 HTML을 편집 결과로 저장하지 않는다.
- 요소 ID는 Save/Import/Export 후에도 안정적이다.
- 알 수 없는 미래 필드는 가능한 한 보존한다.
- 캔버스 상태 변경과 UI 패널의 열림/닫힘 상태를 구분한다.
- 직접 수정 CSS와 캔버스 데이터가 동일 속성을 동시에 소유하지 않게 한다.

## 5. 요소 종류 로드맵

### 1차 핵심 요소

- `photo`: 기존 이미지 슬롯과 Crop을 쓰는 사진
- `logo`: 투명 PNG 또는 텍스트 로고
- `text`: 제목, 짧은 문구, 캡션
- `category_nav`: 기존 카테고리 Context를 표시하는 메뉴
- `sticker`: 사용자가 올린 장식 이미지
- `shape`: 사각형, 원, 선 등의 단순 장식

### 후속 요소

- `frame`: 사진 여러 장을 담는 조합 프레임
- `index`: 사진 옆에 붙는 번호·탭 조각
- `decor_line`: 구역에 붙는 꾸밈선
- `group`: 여러 요소의 이동·회전을 함께 다루는 그룹

## 6. 반응형 원칙

- 모바일 390px을 기본 디자인 좌표계로 삼는 방안을 먼저 검증한다.
- 데스크톱에서는 HOME 캔버스를 중앙에 배치하고 안전한 범위에서 확대한다.
- 1차 구현에서는 모든 요소에 복잡한 반응형 제약을 넣지 않는다.
- 모바일과 데스크톱 배치를 따로 저장하는 기능은 `RESPONSIVE-1` 전에는 구현하지 않는다.
- 양옆 정보 영역은 캔버스 요소가 아니다. 기존 1·2·3단 시스템을 유지한다.

## 7. 작업 순서

각 행은 별도의 작업이다. 앞 단계가 완료됐다는 보고를 확인한 뒤 다음 단계로 넘어간다.

> 진행 상태(2026-09-21): **`SPIKE-1` · `SPIKE-1B` · `CONTRACT-1B` · `CONTRACT-1C` ·
> `RENDER-1A` · `RENDER-1B` · `VENDOR-1` · `SELECT-1A` · `SELECT-1B-1` ·
> `SELECT-1B-2` · `TRANSFORM-1A` · `TRANSFORM-1B` · `TRANSFORM-1C` ·
> `MILESTONE-1` · `MANUAL-UX-FIX-1` 열다섯이 끝났다.** 정적 렌더링은
> **네 화면 전부** 끝났고, 편집기 라이브러리는 **저장소에 고정됐고**, 캔버스
> 요소를 **고르고(단일 · lasso · Shift 다중) · 풀고 · 틀로 보여 주는 것**에
> 더해 **단독 선택 요소 하나의 이동 · 리사이즈 · 회전**까지 됐다(`x` ·
> `y` · `width` · `height` · `rotation` 다섯 칸). **그룹 조작 · 스냅 ·
> 키보드 조작 · 손가락 조작 · Inspector 입력 필드 · 요소 추가 UI 는 아직
> 하나도 없다.**
>
> ★ `MANUAL-UX-FIX-1`(2026-09-21) 은 그 기본 조작의 **사용성 넷**을 고쳤다 —
> 회전의 **30° 자석**(±4° 안에서만) · **모서리 손잡이는 비율 유지 · 변
> 중앙은 한 축 자유** · 자르기를 고르지 않은 Canvas 그림은 **contain** ·
> 글자 요소의 **편집 chrome 여유**(저장 geometry 는 불변). 계약은
> [IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> **§21** 이고, 새 데이터 칸 · 새 메시지 · 새 파일은 없다.
>
> ★ **`HOME-CANVAS-INSPECTOR-1A` 는 2026-09-21 에 완료됐다**(§14-15) —
> Canvas 요소를 고르면 왼쪽 패널이 그 요소의 화면이 되고, 글자 요소의
> 내용과 geometry 다섯 칸을 고칠 수 있다. 계약은
> [IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
> **§22** 다. **다음 작업은 `HOME-CANVAS-V2-DATA-1`** 이다(§14-13 의 4 번).
>
> ★ 그 위에 **`COMPOSITION-CONTRACT-1`(2026-09-21)** 이 다음 구조를 확정했다 —
> **자동 배치 블록 + `main_visual` 자유 레이어(`canvas.version:2`)**. 설계는
> **[§14](#14-조합형-home-canvas-v2-설계-home-canvas-composition-contract-1)**
> 에 있고, **문서만 바꾼 라운드라 코드에는 한 줄도 없다.** v1 은 폐기되지
> 않는다 — v2 의 자유 배치 층(페이지 장식 · 프레임 내부)을 v1 엔진이 그대로
> 맡는다.
>
> - `SELECT-1B-1` — **조건부 vendor 활성화와 표시 전용 Moveable 틀**. 첫
>   Canvas 요소를 고른 그 순간에만 프레임 문서가 runtime · 로더 · UMD 를 받고,
>   그 전까지는(공개 화면 포함) 요청이 0 이다. 계약은
>   [IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
>   **§15** 다. **손잡이도 조작도 없다.**
>
> - `SELECT-1B-2` — **Selecto lasso 와 다중 선택**. 끌어서 여러 개를 고르고
>   Shift 로 더하고 뺀다. 관문이 "첫 선택"에서 "Canvas 가 있는 HOME 에서
>   Select 를 켬"으로 앞당겨졌고, 프레임은 **제안만** 하고 부모가 draft 로
>   전부 다시 보고 확정한다. 계약은 같은 문서 **§16** 이다. 모바일 lasso 는
>   **의도적으로 미지원**이고 그 자리는 단일 탭이 지킨다. **조작은 여전히
>   한 줄도 없다.**
>
> - `SPIKE-1` · `SPIKE-1B` — **Moveable + Selecto 채택 확정**(§8 의 완료 기록).
>   실험이라 **운영 파일을 한 줄도 바꾸지 않았고**, 그래서 저장소에 vendor 파일도
>   연결 코드도 없다. 결론만 이 문서에 남아 있다.
> - `CONTRACT-1B` · `CONTRACT-1C` — 데이터 계약. 그 결과는 이 문서가 아니라
>   [IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)(CURRENT
>   CONTRACT)가 갖는다. `1C` 는 도화지 전체의 세로 길이 `baseHeight` 한 칸을
>   더한 보완이다(그 문서 §4-1).
> - `RENDER-1A` · `RENDER-1B` — **정적 Renderer**. 저장된 Canvas 가 **네 화면**
>   (공개 native · Studio native Preview · 공개 sandbox · Studio sandbox
>   Preview)에서 같은 DOM · 같은 좌표로 그려진다. 계약은 그 문서 §12 다.
>   `1B` 는 새 렌더러를 만들지 않았다 — 같은 파일을 프레임이 읽게 하고
>   `preview-sandbox.js` 에서 빠지던 칸 하나를 채웠다. **조작 UI 는 하나도
>   없다.**
>
> ★ `CONTRACT-1B` 보고가 "`SPIKE-1` 미착수"라고 적은 것은 **틀렸다.** Spike 가
>   운영 파일을 남기지 않는 작업이라 저장소만 보고는 완료 사실을 알 수 없었던
>   것이다 — 그 오류를 `HOME-CANVAS-SPIKE-DOC-1` 에서 정정했다.
>   **Spike 를 다시 실행하지 않는다.**
>
> - `VENDOR-1` — **Moveable 0.53.0 · Selecto 1.26.3 UMD 를 저장소에 고정**하고
>   Studio 전용 지연 로더와 sandbox allowlist 두 줄을 두었다. 계약은
>   [IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
>   **§13** 이다. **조작은 한 줄도 없다** — 아무도 로더를 부르지 않으므로 지금은
>   어느 화면에서도 두 UMD 가 내려오지 않는다. §8-1 이 요구한 `cspNonce`
>   대조군 넷은 실제 파일로 자동 테스트가 됐고, 결과는 Spike 의 판정 그대로다.

| 순서 | 작업 ID | 목표 | 운영 기능 변경 | 상태 |
|---:|---|---|---|---|
| 0 | `HOME-CANVAS-SPIKE-1` | Moveable/Selecto 적합성 검증 | 없음 | **완료 — 채택**(§8) |
| 0b | `HOME-CANVAS-SPIKE-1B` | 실제 cross-origin sandbox 에서 좌표 오차 재측정 | 없음 | **완료 — 허용치 안**(§8) |
| 1 | `HOME-CANVAS-CONTRACT-1` | 데이터 계약·소유권·마이그레이션 설계 | 없음 | **1B · 1C 완료** → [계약 문서](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) |
| 2 | `HOME-CANVAS-RENDER-1A` | 고정 fixture를 **native 두 화면**에 동일 렌더 | 읽기 전용 | **완료**(계약 문서 §12) |
| 2b | `HOME-CANVAS-RENDER-1B` | 같은 결과를 **sandbox 두 화면**에도 | 읽기 전용 | **완료**(계약 문서 §12-6) |
| 2c | `HOME-CANVAS-VENDOR-1` | Moveable·Selecto 파일 고정 + Studio 전용 loader | 없음 | **완료**(계약 문서 §13) |
| 3a | `HOME-CANVAS-SELECT-1A` | 캔버스 선택 소유권 + 단일 선택 기반(**고치지 않는다**) | Studio만 | **완료**(계약 문서 §14) |
| 3b-1 | `HOME-CANVAS-SELECT-1B-1` | 조건부 vendor load + 단일 Moveable **표시 전용** 회전 틀 | Studio만 | **완료**(계약 문서 §15) |
| 3b-2 | `HOME-CANVAS-SELECT-1B-2` | Selecto 인스턴스 · lasso · 다중 선택 · Shift 선택 | Studio만 | **완료**(계약 문서 §16) |
| 3c-1 | `HOME-CANVAS-TRANSFORM-1A` | **단일 요소 이동**을 `canvas.elements[].x/.y` 에 쓰는 확정 경로 + Undo | 저장 가능 | **완료**(계약 문서 §17) |
| 3c-2 | `HOME-CANVAS-TRANSFORM-1B` | **단일 요소 리사이즈**를 `canvas.elements[].x/.y/.width/.height` 에 쓰는 확정 경로 + Undo | 저장 가능 | **완료**(계약 문서 §18) |
| 3c-3 | `HOME-CANVAS-TRANSFORM-1C` | **단일 요소 회전**을 `canvas.elements[].rotation` 에 쓰는 확정 경로 + Undo | 저장 가능 | **완료**(계약 문서 §19) |
| 3c-M | `HOME-CANVAS-MILESTONE-1` | **기본 조작 마일스톤** — 이동 · 리사이즈 · 회전을 실제 배포에서 손으로 시험할 수 있게 한다(수동 테스트 스킨 + 통합 smoke). 새 편집 기능 없음 | 없음(도구) | **완료** — §8-M |
| 3c-4 | `HOME-CANVAS-TRANSFORM-1D` | 그룹 이동 · 그룹 리사이즈 · 그룹 회전 | 저장 가능 | 미착수 |
| 3c-X | `HOME-CANVAS-COMPOSITION-CONTRACT-1` | **조합형 HOME(v2) 설계 확정** — 자동 배치 블록 + `main_visual` 자유 레이어. 문서만 | 없음(문서) | **완료** — §14 |
| 3c-U | `HOME-CANVAS-MANUAL-UX-FIX-1` | 수동 테스트에서 나온 v1 편집기 수정 — 30° 자석 회전 · 모서리 비율 유지 · 이미지 `contain` · 텍스트 선택 chrome | Studio만 | **완료**(계약 문서 §21) |
| 3c-I | `HOME-CANVAS-INSPECTOR-1A` | Canvas 요소를 골랐을 때의 **최소 Inspector 입력 필드** — 글자 내용 한 칸 + geometry 다섯 칸 + 타입별 읽기 전용 요약 | Studio만 | **완료**(계약 문서 §22) |
| 3e-1 | `HOME-CANVAS-V2-DATA-1` | v2 normalize · validate · resolve · 보존. **DOM renderer 없음** | 없음(데이터) | **미착수 — 다음 작업**. §14-13 |
| 3e-2 | `HOME-CANVAS-V2-FLOW-RENDER-1` | column flow + logo · category_nav · text · divider 렌더, native/sandbox parity | 읽기 전용 | 미착수 — §14-13 |
| 3e-3 | `HOME-CANVAS-V2-MAIN-VISUAL-1` | `main_visual` 프레임 · primary photo · 내부 자유 요소 · pin/transform | 읽기 전용 | 미착수 — §14-13 |
| 3e-4 | `HOME-CANVAS-V2-INSPECTOR-1` | 블록 정렬 · margin · size · 내용 편집 + 프레임 내부 진입/나가기 | 저장 가능 | 미착수 — §14-13 |
| 3e-5 | `HOME-CANVAS-V2-ATTACH-1` | `메인 비주얼로 묶기` · primary 지정 · `묶기 해제` + Undo/Redo | 저장 가능 | 미착수 — §14-13 |
| 3d | `HOME-CANVAS-EFFECT-HOOK-1` | Canvas 요소에 **스킨 CSS 효과와 sandbox 사용자 JS 효과**를 거는 공식 hook | 스킨/저자 | 미착수 — 아래 완료 기준 |
| 4 | `HOME-CANVAS-HISTORY-1` | Undo/Redo·dirty·Save 경계 연결 | 저장 가능 | 미착수 |
| 5 | `HOME-CANVAS-ELEMENTS-1` | 사진·텍스트·로고·카테고리 추가 | 핵심 요소 | 미착수 |
| 6 | `HOME-CANVAS-PRESETS-1` | 사진 1·2·3·4장 프리셋, 라이트/다크 | 프리셋 | 미착수 |
| 7 | `HOME-CANVAS-STICKER-1` | 스티커 업로드·회전·외곽선·칼선 | 스티커 | 미착수 |
| 8 | `HOME-CANVAS-LAYERS-1` | 레이어 목록·앞뒤 순서·정렬·그룹(+ **모바일 다중 선택**) | 고급 조작 | 미착수 |
| 9 | `HOME-CANVAS-DECOR-1` | 선·도형·인덱스·장식 부착 | 장식 조각 | 미착수 |
| 10 | `HOME-CANVAS-RESPONSIVE-1` | 데스크톱 전용 재배치 또는 override | 반응형 | 미착수 |
| 11 | `HOME-CANVAS-SIDES-1` | 기존 1·2·3단과 최종 통합 | 패널 통합 | 미착수 |
| 12 | `HOME-CANVAS-POLISH-1` | 접근성·성능·실기기·문서·회귀 | 출시 준비 | 미착수 |

## 8. 단계별 완료 기준

### `HOME-CANVAS-SPIKE-1`

> **완료 — 채택.** 아래 "할 일"과 "금지"는 그때의 지시문이고, 실제 결론은
> 바로 아래 §8-1 에 있다. **이 Spike 를 다시 실행하지 않는다.**

목적은 구현 착수가 아니라 기술 선택이다.

할 일:

- 저장소의 프레임 구조, CSP, import map, sandbox allowlist, 번들/배포 방식을 조사한다.
- Moveable과 Selecto의 현재 라이선스, 배포 형태, ESM 사용 가능 여부를 공식 출처로 확인한다.
- 운영 코드와 분리된 하네스에서 기존 Preview iframe 안 요소 하나를 선택한다.
- 마우스와 터치로 이동·크기·회전·다중 선택을 확인한다.
- 390px, 1280px, native Preview, 가능한 경우 sandbox Preview에서 좌표 오차를 잰다.
- iframe의 축소 배율과 Preview 스크롤 뒤에도 포인터 좌표가 맞는지 확인한다.

금지:

- SkinPackage 변경
- 기존 Inspector 교체
- 운영 진입점에 새 라이브러리 연결
- Save/Publish 구현
- 다음 단계 구현

완료 산출물:

- 채택/기각 결론과 근거
- 직접 구현해야 하는 남은 부분
- 의존성 크기와 라이선스
- 재현 가능한 하네스와 자동 테스트
- 운영 파일 변경이 있었다면 원복된 깨끗한 상태

### 8-1. `SPIKE-1` · `SPIKE-1B` 결과 (완료 · 채택)

> 이 절은 **계획이 아니라 끝난 실험의 결론**이다. 두 Spike 모두 운영 파일을
> 한 줄도 바꾸지 않았기 때문에 저장소에는 그 흔적이 남지 않았다 — 그래서
> 결론만 여기 적는다. 다음 작업은 이 실험을 반복하지 않는다.

#### 무엇을 쟀나

`SPIKE-1`

- Moveable + Selecto 가 현재 Studio Preview 구조에 **적합하다고 판정**했다.
- 부모 Preview 에 `transform: scale()` 이 걸린 **390px 조건**에서도 프레임 내부
  좌표를 따로 보정하지 않고 정확하게 작동했다.
- 스크롤 · 마우스 · **한 손가락 터치 드래그**를 확인했다.
- 배포 형태는 **UMD 채택 · ESM 기각**. 기각 이유는 하나다 — ESM 빌드에
  **bare specifier 가 남아 있고 이 저장소에는 번들러가 없다**(CLAUDE.md §1).

`SPIKE-1B` — `SPIKE-1` 의 좁은 후속 실험

- **실제 cross-origin sandbox 서버**를 띄우고 postMessage 왕복까지 검증했다.
  부모 문서에서 frame DOM 접근이 **실제로 차단된** 조건에서 쟀다(같은 origin
  으로 흉내 내지 않았다).
- 좌표 최대 오차

  | | 측정값 | 허용치 |
  | --- | ---: | ---: |
  | 이동 | 0.73px | 1px |
  | 크기 | 0.09px | 1px |
  | 회전 | 0.21° | 0.75° |

- **CSP 위반 0건.**

#### 채택한 것 — 버전을 정확히 고정한다

| 파일 | 라이브러리 | 버전 | 형태 | 라이선스 |
| --- | --- | --- | --- | --- |
| `moveable.min.js` | Moveable | **0.53.0** | UMD | MIT |
| `selecto.min.js` | Selecto | **1.26.3** | UMD | MIT |

vendor · 연결 단계가 지켜야 할 조건(아직 구현되지 않았다 — §8-2):

- 두 **버전을 정확히 고정**한다.
- **Studio 에서만 로드**한다 — 공개 페이지 비용 0.
- 원본 minified 파일을 **재가공하지 않는다**. 파일의 **MIT 라이선스 배너를
  유지**한다.
- `loadVersionedScripts()` 를 쓴다. **고정 `<script src>` 를 만들지 않는다**
  (CLAUDE.md §4).
- sandbox 에서 쓸 때만 운영 allowlist(`core/lib/skin-sandbox-server.js`
  `SANDBOX_ALLOWED_PATHS`)에 등록한다.
- **CSP 정책을 완화하지 않는다.**
- **`document.createElement` 전역 monkey patch 를 만들지 않는다.**
- 두 생성자에 **공식 `cspNonce` 옵션**을 전달한다.

#### `cspNonce` 판정 — Moveable 버전 고정이 필수인 이유

- Selecto 1.26.3 의 `cspNonce` 는 **정상 공식 옵션**이고 작동한다.
- Moveable 0.53.0 의 `cspNonce` 도 **실제로 작동하지만 deprecated** 다.
  대체 옵션은 확인되지 않았다.
- 그래서 **Moveable 0.53.0 버전 고정과 nonce 회귀 테스트가 필수**다. 버전을
  올리면 그 옵션이 조용히 사라져 프레임 안에서 핸들이 CSP 에 막힐 수 있다.
- 전역 shim 은 **불필요하므로 철회**했다.

후속 vendor/interaction 단계의 **회귀 테스트 요구** — 대조군 넷:

| 대조군 | 기대 |
| --- | --- |
| 둘 다 `cspNonce` 전달 | **위반 0 · 핸들 정상** |
| Moveable 만 전달 | 대조군 |
| Selecto 만 전달 | 대조군 |
| 둘 다 전달하지 않음 | 대조군 |

#### 아직 검증하지 않은 것

**채택 실패가 아니라 후속 검증 항목이다.**

- 그룹 이동 · 그룹 회전
- 핀치 · 두 손가락 회전
- WebKit
- 실제 iOS 기기

### 8-2. `VENDOR-1` 결과 (완료)

Spike 가 요구한 vendor 조건은 **전부 지켜졌다.** 확정된 계약은
[IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
**§13** 이 갖는다. 여기에는 결론만 적는다.

| §8-1 이 요구한 것 | 상태 |
| --- | --- |
| 두 버전을 정확히 고정 | **완료** — 파일 이름에 버전 · SHA-256 을 테스트가 검사 |
| Studio 에서만 로드 · 공개 비용 0 | **완료** — 공개 진입 · 공개 native · 공개 sandbox 전부 vendor 요청 0 |
| 원본 minified 재가공 금지 · MIT 배너 유지 | **완료** — npm tarball 의 바이트 그대로 |
| `?v=APP_BUILD_VERSION` · 고정 `<script src>` 금지 | **완료** — 동적 `<script>`(§13-2 의 ★) |
| sandbox allowlist 등록 | **완료** — vendor JS **두 줄**만. 프레임 HTML 은 안 고쳤다 |
| CSP 완화 금지 | **완료** — 한 글자도 안 바꿨다 |
| `document.createElement` monkey patch 금지 | **완료** — 만들지 않았다 |
| 두 생성자에 공식 `cspNonce` | **완료** — 넘기는 것은 부르는 쪽의 몫이고, 대조군 넷을 테스트가 못박는다 |
| 대조군 넷의 회귀 테스트 | **완료** — `node studio/studio-home-canvas-vendor-e2e-test.mjs --only=nonce` |

`cspNonce` 대조군 넷의 실측 결과는 **Spike 의 판정 그대로**였다(계약 문서
§13-3 의 표). `both` 에서 위반 0 · 핸들 14×14 · Selecto 영역 정상 · 드래그
정상이고, `selectoOnly` 에서는 Moveable 핸들이 **91×0 으로 붕괴**한다.

**아직 없는 것**: Canvas 요소와의 연결, 프레임 안 조건부 load 와 Studio→frame
메시지, 그리고 조작 UI 전부. 그것은 `SELECT-1` 의 일이다.

### `HOME-CANVAS-CONTRACT-1`

> **1B(데이터 계약) · 1C(`baseHeight`) 완료 — 2026-09-21.** 확정된 내용은
> [IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) 에
> 있다. 아래 목록 중 "렌더링과 편집의 속성 소유권 표"까지가 그 문서 §1·§8 이고,
> "조작 UI 를 만들지 않는다"도 지켰다. 이 문서의 §4 예시는 **비규범**이었고,
> 확정된 모양은 그 예시와 세 곳이 다르다 — `settings` 대신 `canvas` 아래
> `version`/`baseWidth`/`baseHeight`/`elements` 넷이고, **`z` 필드는 두지 않으며**
> (배열 순서가 앞뒤 순서다), 예시의 `settings.minHeight: 760` 자리는
> **`canvas.baseHeight`(기본 844)** 가 대신한다 — "최소" 가 아니라 **도화지
> 전체의 세로 길이**이고, 요소 위치로 자동 계산하지 않는다(계약 문서 §4-1).
> 예시의 `settings.background` 는 아직 계약에 없다(그 문서 §8).
>
> `1C` 가 `1B` 계약을 바꾸지는 않았다 — 알 수 없는 필드 보존 · 미래 version
> fallback · non-mutation · 세 갈래 fallback 은 전부 그대로다.

- 기존 `regions`, templates, images, direct edit 규칙을 조사한다.
- 저장 위치와 스키마를 정한다.
- 좌표, 크기, 회전, z-index, 타입별 props와 버전을 정의한다.
- sanitizer, Import/Export, AI, Save, Publish에서 보존되는지 테스트부터 작성한다.
- 렌더링과 편집의 속성 소유권 표를 만든다.
- 아직 실제 조작 UI를 만들지 않는다.

### `HOME-CANVAS-RENDER-1A` · `RENDER-1B`

> **`1A` · `1B` 완료 — 2026-09-21.** 확정된 렌더 계약은
> [IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) **§12**
> 가 갖는다. 아래 네 줄을 전부 지켰다.

- 계약 fixture 하나를 DOM으로 렌더한다. → `1A`
- Studio native/sandbox, 공개 native/sandbox 네 화면이 같은 결과여야 한다.
  → `1A` 가 native 둘, `1B` 가 sandbox 둘. E2E 가 네 화면을 실제로 띄워
  **DOM 을 글자 단위로, 좌표를 1px · 회전을 0.75° 안에서** 대조한다.
- 기존 스킨은 byte 또는 의미 단위로 종전과 같아야 한다. → `1A` · `1B`
- 편집 핸들, 선택 UI, 추가 UI는 만들지 않는다. → `1A` · `1B`

`1B` 가 실제로 한 일: 프레임 문서에 **같은 렌더러 파일**을 싣고
`SANDBOX_ALLOWED_PATHS` 에 JS 와 CSS 를 등록했다. 새 렌더러도, CSP 완화도,
새 메시지도 없다. 그 과정에서 **Studio sandbox Preview 에서만** 캔버스가
빠지던 자리를 찾아 고쳤다(`studio/preview/preview-sandbox.js` 가 template 을
알려진 키만 옮기는데 `canvas` 줄이 없었다 — 계약 문서 §10 의 ★).

### `HOME-CANVAS-SELECT-1A` (완료)

셋으로 나뉘었다. 조사(`HOME-CANVAS-SELECT-AUDIT-1`)가 "기존 Inspector 선택은
캔버스 요소를 **원리적으로** 담을 수 없다"를 확인했기 때문이다 — 그 상태는
언제나 template HTML 을 다시 파싱해 식별자를 되찾는데, 캔버스 요소는 그
HTML 에 없다.

`1A` 가 한 일은 **고르고 푸는 것까지**다. 결과는 이 문서가 아니라
[IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
**§14** 가 갖는다.

- 캔버스 전용 선택 상태(배열 모양, 지금은 최대 1개)와 **소유권 라우터 한 곳**.
- 캔버스를 아는 공통 hit-test — 배경 없는 요소 · 전면 요소 · 회전 요소 ·
  내부 자식 · 잠긴 요소 아래 요소까지 native 와 sandbox 가 같은 판정.
- sandbox 위조 선택 방어에 **근거를 하나 더** 인정(방어를 풀지 않았다).
- 축에 평행한 임시 테두리. **회전은 따라가지 않는다.**
- **고치는 경로는 하나도 없다.** Moveable · Selecto 를 부르지 않는다.

### `HOME-CANVAS-SELECT-1B-1` (완료)

`1B` 를 둘로 나눴다. 결과는 이 문서가 아니라
[IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
**§15** 가 갖는다.

- **조건부 vendor 활성화** — 첫 Canvas 요소를 실제로 고른 그 순간에만
  프레임 문서가 runtime · 로더 · UMD 를 받는다. 공개 화면 · Studio 열기 ·
  Select 모드만 켜기 · 일반 요소 선택은 계속 **요청 0**.
- Moveable 인스턴스를 **대상 DOM 이 있는 문서**에서 만든다(native Preview
  문서 · sandbox 프레임 문서 — Studio 부모가 아니다). 실행 코드는 두 문서가
  같은 파일 한 벌을 쓴다.
- `SANDBOX_ALLOWED_PATHS` 에 **두 줄**이 올라갔다 — runtime 과 로더 자신.
  vendor 디렉터리를 연 것이 아니라 파일 두 개다.
- 회전을 따라가는 선택 틀 **하나**. **핸들도 조작도 없다**(표시 전용).
- `cspNonce` 를 공식 옵션으로 넘긴다 — CSP 무변경, 위반 0 실측.
- **Selecto 인스턴스 · 다중 선택 · Canvas JSON 쓰기는 없다.**

### `HOME-CANVAS-SELECT-1B-2` (완료)

결과는 이 문서가 아니라
[IMORY_HOME_CANVAS_CONTRACT.md](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)
**§16** 이 갖는다.

- **활성화 관문이 한 칸 앞으로** — lasso 는 아무것도 고르지 않은 상태에서
  시작돼야 하므로 "Canvas 가 있는 HOME 에서 Select 를 켬"이 관문이다.
  Canvas 가 없는 스킨과 공개 화면은 **여전히 요청 0**.
- Selecto 인스턴스 하나 · Moveable 인스턴스 하나(프레임당).
- 일반 lasso(교체) · Shift + lasso(XOR) · Shift + 클릭(XOR) ·
  Shift + 빈 곳(유지) · 빈 lasso(해제).
- **손가락으로는 lasso 를 시작하지 않는다** — 세로 스크롤과 가를 수 없다.
  모바일은 단일 탭 그대로다(의도적 미지원).
- 프레임은 **제안만** 한다(`CANVAS_PROPOSE`). 부모가 모든 id 를 draft 로
  다시 보고, 하나라도 어긋나면 **메시지 전체를 거부**한다. 정렬(배열 순서)과
  primary 도 부모가 정한다.
- 2개 이상이면 Moveable **그룹 틀 하나**. 조작은 여전히 전부 꺼져 있다.
- **Canvas JSON 쓰기는 없다** — 그것은 `TRANSFORM-1` 의 일이다.

### `HOME-CANVAS-EFFECT-HOOK-1`

**Canvas 는 sandbox 스킨을 대체하는 기능이 아니다.** Canvas 는 아이모리
재료(로고 · 카테고리 · 사진 · 글자 · 스티커 · 도형)의 **구조와 배치**를
담당하고, 같은 Canvas 가 native 와 sandbox 양쪽에서 렌더된다. 그 위의
**시각 디자인 · hover · transition 은 스킨 CSS** 가 갖고, **파티클 · 꽃잎 ·
복합 모션 같은 효과는 sandbox 사용자 JS** 가 같은 Canvas DOM 에 붙인다.

이 단계가 정할 것.

- 스킨 CSS 가 Canvas 요소를 고르는 **공식 선택자 계약**(종류 · 역할 ·
  상태). 지금은 `data-imory-canvas-*` 가 사실상 그 자리이지만 "저자가
  기대어도 되는 것"으로 문서화된 적이 없다.
- sandbox 저자 JS 가 Canvas 요소를 찾고 효과를 붙였다 떼는 **hook**
  (`imorySkin` API 의 어느 자리인가 · 언제 불리는가 · 재렌더에서 어떻게
  되는가 · 정리는 누가 하는가).
- 그 효과가 편집 중(Select · 선택 틀 · 뒤 단계의 드래그)과 **어떻게
  공존하는가**. 편집 틀이 저자 효과를 지우지 않고, 저자 효과가 선택을
  막지 않아야 한다.
- 효과가 붙은 요소의 좌표를 편집기가 무엇으로 재는가(저자가 `transform`
  을 덧씌운 경우).

★ `SELECT-1B-1` 이 지킨 선: Canvas 요소의 DOM 을 **한 글자도 건드리지
않는다**(속성 · class · 인라인 style · `pointer-events` 전부). 저자 JS 가
요소를 움직이면 선택 틀이 그 움직임을 따라간다 — 막지 않는다
(계약 문서 §15-7-1). 뒤 단계도 이 선을 넘지 않는다.

### `HOME-CANVAS-TRANSFORM-1A` (완료)

→ [계약 문서 §17](../contracts/IMORY_HOME_CANVAS_CONTRACT.md#17-단일-요소-이동-home-canvas-transform-1a)

- **여기서부터 Canvas JSON 이 바뀐다.** 단독으로 고른 요소 하나를 마우스 ·
  펜으로 끌어 옮기고, 그 결과가 `regions.home_canvas.canvas.elements[].x` ·
  `.y` **두 칸**에 저장된다.
- 기존 `applyStudioInspectorPatch()` 를 **쓰지 않는다** — 그 함수는 첫 줄에서
  대상 요소를 template HTML 에서 찾으므로 캔버스 요소에 닿을 수 없다
  (계약 문서 §14-6). 불변 수정은 순수 함수
  `writeSkinHomeCanvasElementPosition()` 하나가 한다.
- 끄는 동안에는 프레임 안의 custom property 두 칸만 움직인다 — JSON · draft ·
  Undo · 스킨 CSS 는 한 글자도 바뀌지 않는다.
- 프레임은 **확정을 요청**할 뿐이고, 부모가 선택 · 순번 · `expected` · 허용
  키 · 범위를 전부 다시 보고 쓴다. 답에는 요청 번호가 붙는다.
- **한 제스처 = Undo 한 칸.** 이동량 0 과 거부는 기록을 만들지 않는다.
- `preventDragFromInside:false` 로 남겨 두었던 lasso ↔ 본체 끌기의 경계를
  여기서 갈랐다 — 고를 수 있는 요소 위에서는 lasso 가 시작되지 않고, 잠긴
  요소는 배경처럼 본다(계약 §17-2).
- **손가락 이동은 의도적 미지원**이다 — 그 자리는 Preview 스크롤이 지킨다.

### `HOME-CANVAS-TRANSFORM-1B` (완료)

→ [계약 문서 §18](../contracts/IMORY_HOME_CANVAS_CONTRACT.md#18-단일-요소-리사이즈-home-canvas-transform-1b)

- **단독 선택 요소의 리사이즈.** 손잡이 여덟(`nw` `n` `ne` `e` `se` `s`
  `sw` `w`)을 마우스 · 펜으로 끌어 크기를 바꾸고, 그 결과가
  `canvas.elements[]` 의 `x` · `y` · `width` · `height` **네 칸**에
  저장된다. 자유 비율이다.
- `1A` 가 연 길을 그대로 쓴다 — 메시지의 `kind` 에 `resize` 를 더하고
  `expected`/`next` 의 허용 키를 넷으로 늘렸다. 관문 · 기다림 · 요청 번호 ·
  Undo · 취소는 **한 벌을 공유한다**. 불변 수정의 복사 규칙도 이동과 같은
  함수다(`writeSkinHomeCanvasElementFields`).
- **회전한 요소의 기준점은 Moveable 이 준 `drag.beforeTranslate` 로 잡는다** —
  삼각함수를 새로 적지 않았다(계약 §18-4). 20° · 45° 에서 반대편 기준점이
  0.9px 안에서 유지되는 것을 실측했다.
- `height:"auto"` 는 좌우 손잡이에서 유지되고, 세로 · 모서리 손잡이에서
  실제 세로 변화가 있을 때만 숫자로 전환된다. Undo 하면 정확히 `"auto"` 로
  돌아간다(계약 §18-3 · §18-7).
- **손잡이가 hit area 를 되돌려 받으면서 Inspector 와 경계를 그어야 했다** —
  손잡이 위의 입력은 Inspector 의 것이 아니다(계약 §18-11).
- 손가락 조작은 의도적 미지원. 그 자리는 Preview 스크롤이 지킨다.

### `HOME-CANVAS-TRANSFORM-1C` (완료)

→ [계약 문서 §19](../contracts/IMORY_HOME_CANVAS_CONTRACT.md#19-단일-요소-회전-home-canvas-transform-1c)

- **단독 선택 요소의 회전.** 요소 위쪽의 손잡이 하나를 마우스 · 펜으로
  끌어 돌리고, 그 결과가 `canvas.elements[].rotation` **한 칸**에
  저장된다. 같은 확정 경로에 `kind: "rotate"` 를 더했을 뿐, 관문 ·
  기다림 · 요청 번호 · Undo · 취소는 **한 벌을 그대로 공유한다**.
- **상자는 한 칸도 바뀌지 않는다** — 회전 중심이 요소 상자의 정중앙이라
  `x` · `y` · `width` · `height` 가 그대로여도 화면이 맞는다(계약 §19-2).
  `height:"auto"` 도 `"auto"` 그대로다.
- **제스처 중에는 연속 각도, 저장은 한 바퀴 안**이다(계약 §19-3).
  350° 에서 더 돌린 값은 화면에서 365° 이고 저장은 5° 다. 접는 자리는
  helper 하나(`normalizeCanvasRotation`)이고, **손대지 않은 요소의
  저장값은 일괄로 고치지 않는다**.
- **누적 회전량은 Moveable 의 `dist` 를 실측해 쓴다**(계약 §19-10) —
  transform 문자열을 역산하지도, 바깥 상자로 각도를 재지도, 매 이벤트의
  delta 를 쌓지도 않는다. 12 걸음의 호에서 최대 오차 0.3° 를 실측했다.
- `rotation` 이 **없는** 요소는 화면상 0° 이고, 고르기만 해서는 그 칸이
  JSON 에 생기지 않는다. 실제로 돌린 제스처만 만든다(계약 §19-2 · §19-6).
- **able 은 처음부터 켜고 `rotationPosition` 으로 여닫는다** —
  `rotatable: true` 로 주면 리사이즈용 `renderDirections` 가 회전
  손잡이 여덟으로 한 번 더 그려진다(계약 §19-1 의 함정).
- 손가락 조작은 의도적 미지원. 그 자리는 Preview 스크롤이 지킨다.

### `HOME-CANVAS-MANUAL-UX-FIX-1` (완료)

**수동 테스트에서 나온 v1 편집기 사용성 넷을 고쳤다. 계약은
[계약 문서 §21](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) 이 갖는다 —
여기에는 나중에 다시 부딪힐 판정과 함정만 적는다.**

- **30° 자석은 양자화가 아니다.** `|deg - 가까운 30 배수| <= 4` 일 때만
  붙고, 그 밖에서는 자유 회전 그대로다. 판정은 **접기 전의 연속 각도**에
  걸고, 그 함수는 단조 비감소라 제스처 중 화면이 거꾸로 돌지 않는다.
- **"돌지 않았다"는 자석이 붙기 전의 날것으로 본다** — 보정된 값으로 보면
  저장된 31° 요소의 손잡이를 누르기만 해도 30° 가 확정된다. 자석이 제자리로
  되돌린 제스처(30° → 32° → 붙어서 30°)도 확정하지 않는다(빈 Undo 한 칸이
  생긴다).
- **모서리 비율은 Moveable 의 `keepRatio` prop 이 아니라 `beforeResize` 의
  `setSize()` 로 한다.** 그 prop 의 setter 는 vanilla 래퍼에서
  setTimeout 으로 미뤄지고(`draggable` 과 같은 함정), 기준이
  `state.width/height` 라 border · padding 과 `"auto"` 소수점이 섞이고,
  모서리에서 가로만 본다. `beforeResize` 에서 고치면 그 뒤의 `dist` 와
  `drag.beforeTranslate` 가 **둘 다** 우리 값에서 나오므로 삼각함수를 새로
  적지 않아도 반대편 기준점이 유지된다.
- **비율을 지켜야 하는 것은 px 상자가 아니라 `dist` 다** — 저장값이
  `시작값 + dist / 배율` 이기 때문이다. 시작 px 는 `U - startW` 에만
  들어가 양쪽에서 상쇄된다.
- **끄는 축은 대각선 정사영이다.** 한 축을 고르면 (가로 고정) 아래로만 끈
  `se` 가 멈추거나, (상대 변화 큰 축) 납작한 상자에서 가로가 171px 튄다.
- **Canvas 이미지 기본값이 `contain` 이다.** 지금 payload 에 Crop 칸이
  **하나도 없다**(`photo`/`sticker` 는 `slot`, `logo` 는 `slot`+`fallback`)
  — 그래서 기본값으로 확정했고 Crop 연결은 남은 차이다. 범위는 렌더러가
  붙인 `[data-imory-canvas-image]` 하나다.
- **편집 chrome 여유는 Moveable 의 `padding` prop 이다.** 0.53.0 의
  `updateRenderPoses()` 는 그 값으로 `renderPoses`/`renderLines` 만
  로컬 축 방향으로 밀고 `pos1~pos4` · `state.width/height` 는 건드리지
  않는다(번들 실측). 그래서 저장 geometry 와 완전히 분리된다 — 저장값에
  4~6px 를 더하는 방식으로는 이 계약을 지킬 수 없다.
- **여유는 글자를 직접 보여 주는 요소만 받는다**(`text` · `category_nav` ·
  `logo` 대체 글자). 프레임은 JSON type 을 모르므로 렌더러가 붙인 표식으로
  가른다. 사진 · 도형은 틀과 딱 붙은 테두리가 맞다.
- **내용 크기를 따라가기 루프의 지문에 넣어야 한다** — 숫자 height 요소는
  상자가 그대로인데 내용만 커질 수 있고, 바깥 상자만 보면 그때 여유가 옛
  값에 머문다.

### `HOME-CANVAS-MILESTONE-1` (완료)

**이동 · 리사이즈 · 회전으로 기본 조작이 갖춰진 지점을 실제 배포에서 손으로
시험할 수 있게 만든 마일스톤이다. 새 편집 기능은 하나도 넣지 않았다.**

- **왜 필요했나.** Studio 에는 아직 Canvas 를 새로 만들거나 요소를 추가하는
  UI 가 없다(`ELEMENTS-1`). 구현된 것은 **이미 있는 요소**를 고치는 경로
  뿐이고, 기존 스킨 · 기본 스킨 · 공개 HOME 에는 `home_canvas` 와 표시 위치
  (`data-imory-canvas-root`)가 **자동으로 생기지 않는다**(계약 §3). 그래서
  그 둘을 이미 갖고 있는 파일이 없으면 주인이 배포된 화면에서 이동 ·
  리사이즈 · 회전을 시험할 방법이 없었다.

- **수동 테스트 스킨** —
  [`skin/test-skins/imory-home-canvas-manual-v1.json`](../../skin/test-skins/imory-home-canvas-manual-v1.json),
  빌더는
  [`build-home-canvas-manual-v1.mjs`](../../skin/test-skins/build-home-canvas-manual-v1.mjs)
  (`node skin/test-skins/build-home-canvas-manual-v1.mjs` 로 같은 JSON 이
  다시 나온다).

  - **제품 기본 스킨도 preset 도 아니다.** `metadata.title` 이
    `IMORY HOME CANVAS — manual test v1` 이고, 기본 스킨 변경 · 가입 시 자동
    적용 · 기존 계정 migration · 자동 Publish · DB 변경이 전부 **없다**.
    주인이 Studio 에서 직접 Import 해야만 쓰인다.
  - 요소 **11개**: 도화지 전체를 덮는 **잠긴** 배경(그 위에서 lasso 가
    시작된다) · photo · sticker · logo · `height:"auto"` 글자 둘 ·
    숫자 height 글자와 도형 · line 도형 · `category_nav`(mode `all`) ·
    음수 `x`(-46)로 도화지 왼쪽을 삐져나간 장식. 초기 회전이 있는 요소가
    **셋**(-4° · 16° · 30°)이고 photo↔sticker · 판↔글자가 **겹친다**.
  - **저장소에 그림을 넣지 않았다.** photo · sticker · logo 는 이미지 슬롯
    (`photo_main` · `sticker_1` · `title_logo`)만 선언하고 비워 둔다 —
    주인이 Studio Images 에서 자기 그림을 넣고, 비어 있어도 wrapper 가 남아
    선택 · 조작을 전부 확인할 수 있다(계약 §12-4). 자동 테스트가 쓰는 SVG
    는 실행 중에만 만든다.
  - **`renderMode` 가 없다**(= native). sandbox parity 는 테스트가 사본에만
    모드를 켜서 확인한다 — 파일에 모드를 박지 않는다.

- **통합 smoke** —
  [`studio/studio-home-canvas-manual-skin-e2e-test.mjs`](../../studio/studio-home-canvas-manual-skin-e2e-test.mjs)
  (포트 9002 · 9003). 합성 fixture 가 아니라 **저장소의 그 JSON 파일을 읽어**
  Import → Validate → Apply → 렌더 → Select → 이동 · 리사이즈 · 회전 +
  Undo/Redo → lasso · 다중 선택 → Save → 다시 열기 → Export → 재Import →
  Publish resolve → sandbox parity 를 한 번 지난다. 브라우저 없이 되는
  계약 검사는 `skin/skin-home-canvas-test.mjs` 의 `[manual]` 절이 갖는다.

- **`--browser=webkit` 을 받지만 포인터 조작 절은 Chromium 에서만** 돈다 —
  Moveable · Selecto 제스처를 재는 형제 e2e 여섯이 모두 그렇다. WebKit 에서는
  그 절을 건너뛴다고 찍고, `[round]` 는 부모의 확정 함수
  (`commitStudioCanvasElementTransform()`)를 직접 불러 **같은 관문을 지나는**
  변경을 만든 뒤 Save · Export · Publish 왕복을 그대로 확인한다(Save 버튼은
  바뀐 것이 없으면 disabled 라 제스처를 건너뛴 채로는 왕복을 볼 수 없다).

- **이 라운드에서 제품 코드는 한 줄도 바뀌지 않았다.** 바뀐 것은 테스트 스킨
  빌더 · 그 JSON · 테스트 둘 · 문서 · `APP_BUILD_VERSION` 뿐이다.

- **아직 없는 것**(이 마일스톤이 만들지 않았다): Canvas 생성 UI · 요소
  추가 · 삭제 UI · preset 선택 UI · 그룹 이동 · 리사이즈 · 회전
  (`TRANSFORM-1D`) · 효과 hook(`EFFECT-HOOK-1`) · 레이어 패널 · Inspector
  geometry 입력 필드 · 이미지 Crop 연결 · 텍스트 직접 편집 · responsive
  override · 손가락 조작.

### `HOME-CANVAS-TRANSFORM-1D`

- 그룹 이동 · 그룹 리사이즈 · 그룹 회전. MoveableGroup 의 기준점과 "여러
  요소를 한 번에 확정한다"의 경계를 정한다.
- 스냅 · 가이드 · 키보드 화살표 이동 · Inspector geometry 입력 필드 ·
  Shift 비율 고정 · Alt 중심 확대 · `"auto"` 로 되돌리는 UI.

### `HOME-CANVAS-HISTORY-1`

- 한 번의 드래그/리사이즈/회전이 Undo 한 칸이다.
- 취소와 Escape 규칙을 정한다.
- Save→새로고침, Export→Import, Publish 뒤 결과를 검증한다.
- 조작 핸들과 선택 상태는 저장하지 않는다.

### `HOME-CANVAS-ELEMENTS-1`

- 핵심 여섯 요소 중 photo/text/logo/category_nav를 먼저 제공한다.
- 사진은 기존 Images와 Crop을 재사용한다.
- 카테고리는 정적 문자열이 아니라 기존 Context를 쓴다.
- Inspector는 색보다 위치·크기·간격·정렬을 우선 노출한다.

### `HOME-CANVAS-PRESETS-1`

- 사진 1장·2장·3장·4칸 프리셋을 제공한다.
- 각 프리셋에 라이트/다크 출발점을 제공한다.
- 프리셋 적용은 캔버스를 바꾸는 명시적 작업이며 Undo 한 칸이다.
- 사용자 사진을 삭제하거나 슬롯 연결을 임의로 잃지 않는다.

### `HOME-CANVAS-STICKER-1`

- PNG/JPG를 스티커로 넣고 이동·크기·회전·앞뒤 배치를 지원한다.
- 일반 외곽선과 칼선 스타일을 구분한다.
- 투명 PNG의 실제 알파 경계를 따라가는 칼선은 성능 검증 뒤 채택한다. 어렵다면 1차에는 근사 윤곽을 명시한다.

### `HOME-CANVAS-LAYERS-1`

- 다중 선택, 정렬, 간격 분배, z-order, 잠금, 그룹을 제공한다.
- Selecto 채택 시 이 단계에서 운영 코드에 연결한다.
- 모바일에서 오선택과 페이지 스크롤 충돌을 검증한다.

### `HOME-CANVAS-DECOR-1`

- 선·도형·인덱스·사진 프레임 같은 재사용 장식을 제공한다.
- 장식이 특정 레퍼런스의 복제품이 되지 않게 일반적인 조각으로 만든다.
- 구역에 붙는 장식과 캔버스 위 자유 장식을 구분한다.

### `HOME-CANVAS-RESPONSIVE-1`

- 실제 사용자 테스트를 바탕으로 한 좌표계만 확대할지, 모바일/데스크톱 override를 둘지 확정한다.
- 두 배치를 지원한다면 공통 속성과 기기별 속성을 분리한다.
- 한쪽에서 수정했다고 다른 쪽 배치가 예측 불가능하게 무너지지 않게 한다.

### `HOME-CANVAS-SIDES-1`

- 캔버스와 기존 좌우 정보 영역을 결합한다.
- 데스크톱은 자연스러운 옆 칼럼, 좁은 화면은 작은 열기 표시를 쓴다.
- 카테고리·최근 글·D-day·페어 사진 등 기존 Context를 재사용한다.

### `HOME-CANVAS-POLISH-1`

- 실제 iOS Safari에서 선택·드래그·스크롤·키보드·패널을 확인한다.
- 접근 가능한 이름, 키보드 조작, reduced motion을 확인한다.
- 큰 이미지와 많은 요소에서 성능을 잰다.
- 모든 계약 문서와 AI 지침을 갱신한다.

## 9. 공통 금지 사항

- 요청한 작업 ID보다 뒤 단계까지 미리 구현하지 않는다.
- 기존 Studio를 React나 다른 프레임워크로 전면 재작성하지 않는다.
- 기존 SkinPackage와 저장 스킨을 일괄 변환하지 않는다.
- 기존 스킨에 캔버스 마크업이나 CSS를 강제로 삽입하지 않는다.
- 테스트를 통과시키기 위해 기능 검증을 약화하거나 픽셀 허용치를 과도하게 넓히지 않는다.
- 실제 콘텐츠 대신 테스트 fixture만 맞는 특수 코드를 넣지 않는다.
- 사용자 원화나 레퍼런스 이미지를 저장소 fixture로 커밋하지 않는다.
- 화면 높이에 맞춘다는 이유로 콘텐츠를 잘라내거나 브라우저 스크롤을 봉쇄하지 않는다.
- 보안 정책, sanitize, sandbox 우회를 허용하지 않는다.

## 10. 모든 작업의 보고 형식

최종 보고에는 반드시 다음만 명확히 적는다.

1. 수행한 작업 ID와 범위
2. 변경 전 조사 결과
3. 구현 또는 검증 결과
4. 데이터·렌더·저장 흐름
5. 테스트 결과와 실제 실패 항목
6. 변경 파일
7. 커밋 해시와 push 여부
8. 배포 여부와 확인 방법
9. 남은 한계
10. 다음 작업 후보 — 구현하지 말고 ID만 제안

작업 도중 범위 밖 문제가 보여도 별도 허가 없이 함께 고치지 않는다. 보안이나 데이터 손실 위험이면 작업을 멈추고 보고한다.

## 11. 에이전트에게 보내는 공통 호출문

아래 형식을 사용한다.

```text
저장소의 IMORY_HOME_CANVAS_ROADMAP.md를 기준 문서로 읽어라.

이번에는 [작업 ID] 하나만 수행한다.
문서에 적힌 선행 단계가 실제 코드와 테스트에서 완료됐는지 먼저 확인하고, 완료되지 않았다면 구현하지 말고 막힌 이유를 보고한다.

범위 밖 단계는 구현하지 않는다. 작업 중 발견한 후속 항목은 최종 보고의 `다음 작업 후보`에만 적는다.
기존 SkinPackage, Context, Images/Crop, Undo, Save/Import/Export/Publish, native/sandbox, 기존 스킨 호환성을 보존한다.

작업 완료 후 해당 작업에 필요한 테스트와 관련 회귀 테스트를 실행한다. 테스트를 생략하거나 기존 실패로 분류할 때는 변경 전 커밋에서도 같은 실패인지 근거를 남긴다.

[커밋·배포 지시를 여기에 별도로 적는다.]
```

## 12. 지금 가장 먼저 보낼 지시문

```text
저장소의 IMORY_HOME_CANVAS_ROADMAP.md를 기준 문서로 읽어라.

이번에는 HOME-CANVAS-SPIKE-1 하나만 수행한다. 운영 기능을 구현하는 작업이 아니라 Moveable + Selecto가 현재 Imory Studio 구조에 맞는지 검증하는 기술 실험이다.

문서의 SPIKE-1 범위와 금지 사항을 지켜라. 운영 진입점, SkinPackage, 기존 Inspector, Save/Publish에는 연결하지 말고 분리된 하네스와 자동 테스트로만 검증한다. Preview iframe의 축소 배율, Preview 스크롤, 390px 터치, 1280px 마우스, native 및 가능한 sandbox에서 선택·이동·크기·회전·다중 선택의 좌표 정확도를 측정하라.

공식 출처를 통해 라이선스와 배포 방식을 확인하고, 저장소의 CSP/import map/sandbox allowlist/배포 구조에 넣을 때 필요한 변경을 목록화하라. 라이브러리가 부적합하면 억지로 채택하지 말고 기각 근거와 대안을 제시하라.

이번 작업에서는 커밋·push·배포하지 않는다. 실험 파일도 운영 코드에 남기지 말고, 재현에 필요한 하네스와 테스트만 별도 경로에 남긴 뒤 결과를 보고하라. 다음 단계는 구현하지 않는다.
```

## 13. 의사결정 기록

각 작업이 끝날 때 이 표를 갱신한다. 보고만 하고 문서를 갱신하지 않는 작업이라면 다음 작업 시작 시 먼저 반영한다.

| 결정 | 상태 | 근거 작업 |
|---|---|---|
| HOME은 DOM 기반 캔버스로 렌더한다 | 확정 | 초기 기획 |
| 기존 Imory 저장·렌더 파이프라인을 유지한다 | 확정 | 초기 기획 |
| 캔버스는 새 최상위 필드가 아니라 `regions` 의 `home_canvas` 항목에 저장한다 | 확정 | `CONTRACT-1B` |
| 표시 위치는 HOME 안 `data-imory-canvas-root` **정확히 하나**다 | 확정 | `CONTRACT-1B` |
| 앞뒤 순서는 배열 순서다 — `z` 필드를 두지 않는다 | 확정 | `CONTRACT-1B` |
| 도화지 전체의 세로 길이는 `canvas.baseHeight`(v1 필수 · 양수 · 기본 844)이고, **요소 위치로 자동 계산하지 않는다** | 확정 | `CONTRACT-1C` |
| 요소가 Canvas 경계를 벗어나는 것을 **데이터 계약이 금지하지 않는다** — 넘친 것을 자를지 늘릴지 스크롤할지는 Renderer 가 정한다 | 확정 | `CONTRACT-1C` |
| 데스크톱·모바일별 별도 Canvas 높이 | 미정 | `RESPONSIVE-1` |
| 시각 스타일은 캔버스 JSON 이 아니라 스킨 CSS 가 갖는다(`data-imory-edit-id` 선택자) | 확정 | `CONTRACT-1B` |
| 저장 좌표 → 화면 좌표는 **도화지의 `aspect-ratio` + 요소의 백분율**이다 — ResizeObserver 도 매 프레임 재계산도 쓰지 않는다 | 확정 | `RENDER-1A` |
| 요소의 최상위 DOM 은 종류와 무관하게 **항상 `div`** 이고 의미 태그는 그 안에 둔다 | 확정 | `RENDER-1A` |
| 도화지의 `overflow` · 최대 폭 · 가운데 정렬 · viewport 높이를 플랫폼이 정하지 않는다 — 화면 맞춤은 스킨 CSS 와 `RESPONSIVE-1` | 확정 | `RENDER-1A` |
| **글자 크기는 배율을 따라가지 않는다**(상자만 비례로 커진다) — 390 좌표를 데스크톱 폭으로 옮기는 규칙은 뒤로 | 확정 | `RENDER-1A` |
| sandbox 프레임 렌더 여부는 "renderSkin 이 부르는가"가 아니라 **문서가 렌더러 파일을 로드했는가**로 가른다 | 확정 | `RENDER-1A` |
| sandbox 에도 **같은 렌더러 파일 한 벌**을 쓴다 — sandbox 전용 렌더러도 복제된 타입별 DOM 코드도 만들지 않는다 | 확정 | `RENDER-1B` |
| 캔버스를 위해 **CSP 를 넓히지 않는다** — 렌더러 JS 는 `script-src 'self'`, 좌표 CSS 는 `style-src 'self'`, 좌표는 CSSOM 쓰기라 `'unsafe-inline'` 이 필요 없다 | 확정 | `RENDER-1B` |
| 캔버스 링크도 **기존 `IMORY_NAVIGATE`** 를 쓴다 — 주소가 아니라 부모가 발급한 정수 `navId` 하나. 새 메시지도 새 라우터도 없다 | 확정 | `RENDER-1B` |
| 요소 id 는 `data-imory-edit-id` 규칙을 따른다(`canvas_` 접두 — UUID 는 숫자로 시작할 수 있다) | 확정 | `CONTRACT-1B` |
| 보존용 원본과 실행용 payload 를 가른다(실행은 strict allowlist) | 확정 | `CONTRACT-1B` |
| 미래 `canvas.version` 은 거부가 아니라 보존 + 실행 fallback | 확정 | `CONTRACT-1B` |
| Moveable을 운영에 채택한다 | **확정 — 0.53.0 UMD(MIT), 버전 고정** | `SPIKE-1` · `SPIKE-1B` |
| Selecto를 운영에 채택한다 | **확정 — 1.26.3 UMD(MIT), 버전 고정** | `SPIKE-1` · `SPIKE-1B` |
| 배포 형태는 UMD 다 — ESM 은 기각(bare specifier 가 남아 있고 번들러가 없다) | 확정 | `SPIKE-1` |
| Studio 에서만 로드한다(공개 페이지 비용 0) · 원본 minified 재가공 금지 · MIT 배너 유지 | 확정 | `SPIKE-1` |
| `loadVersionedScripts()` 로만 싣는다 — 고정 `<script src>` 금지 | 확정 | `SPIKE-1` |
| CSP 를 완화하지 않고 `document.createElement` 전역 monkey patch 도 만들지 않는다 — 두 생성자에 공식 `cspNonce` 를 넘긴다(전역 shim 은 철회) | 확정 | `SPIKE-1B` |
| Moveable 0.53.0 의 `cspNonce` 는 작동하지만 **deprecated** 이고 대체 옵션이 없다 → 버전 고정 + nonce 회귀 테스트(대조군 넷, §8-1)가 필수 | 확정 | `SPIKE-1B` |
| 그룹 이동·그룹 회전 · 핀치/두 손가락 회전 · WebKit · 실제 iOS 기기 | **미검증**(채택 실패가 아니라 후속 항목) | `SELECT-1` · `LAYERS-1` · `POLISH-1` |
| 모바일 390 단일 좌표계를 데스크톱에서 확대한다 | 미정 | `RESPONSIVE-1` |
| 모바일·데스크톱 override를 제공한다 | 미정 | `RESPONSIVE-1` |
| 알파 경계 기반 스티커 칼선을 제공한다 | 미정 | `STICKER-1` |
| HOME 편집을 **모든 요소의 절대좌표 편집기로 만들지 않는다** — 자동 배치 층과 자유 배치 층 둘로 가른다 | 확정 | `COMPOSITION-CONTRACT-1` |
| 조합형 구조는 `canvas.version:2` 다. **v1 을 폐기하지 않고 자동 변환도 migration 도 하지 않는다** — v1 은 v2 의 자유 배치 층 엔진으로 계속 쓴다 | 확정 | `COMPOSITION-CONTRACT-1` |
| v2 canvas 에 **최상위 `elements` 를 두지 않는다**(`flow` + `overlays` 뿐). v1 writer 가 version 을 안 보고 `canvas.elements` 를 찾기 때문이다. 둘을 동시에 가지면 Import 거부 | 확정 | `COMPOSITION-CONTRACT-1` |
| 블록 배열 순서가 위에서 아래 순서다 — 별도 `order` · `z` 칸을 두지 않는다 | 확정 | `COMPOSITION-CONTRACT-1` |
| 블록 폭은 `width` 숫자 하나고 "가용 폭 전부"는 `align:"stretch"` 가 뜻한다. `width:"auto"` 를 두지 않는다 | 확정 | `COMPOSITION-CONTRACT-1` |
| `flow.gap` 과 블록 `margin` 은 **합산**이다 — CSS margin collapse 를 흉내 내지 않는다 | 확정 | `COMPOSITION-CONTRACT-1` |
| `hidden:true` 는 자동 배치에서 **자리도 차지하지 않는다**(아래 블록이 올라온다) | 확정 | `COMPOSITION-CONTRACT-1` |
| `main_visual` 은 사진 한 장이 아니라 **로컬 좌표계를 가진 편집 프레임**이고, 로컬 자는 `props.baseWidth`/`baseHeight` 다 | 확정 | `COMPOSITION-CONTRACT-1` |
| primary photo 는 요소 쪽 플래그가 아니라 **`props.primaryId` 포인터 하나**로 가리킨다 | 확정 | `COMPOSITION-CONTRACT-1` |
| 프레임 내부 장식은 `follow: "transform" \| "pin"` 둘 중 하나다. transform 은 프레임 배율을 받고 pin 은 받지 않는다(화면 배율만) | 확정 | `COMPOSITION-CONTRACT-1` |
| 프레임 배율은 **가로 배율 하나**다 — 균등 배율이라야 `rotation` 이 보존되고 장식이 찌그러지지 않는다 | 확정 | `COMPOSITION-CONTRACT-1` |
| pin 은 `anchor`(대상의 점)와 `origin`(자기 점)을 **둘 다** 갖는다 — 하나만 두면 크기를 바꿀 때 편집기가 `offset` 을 몰래 다시 계산하게 된다 | 확정 | `COMPOSITION-CONTRACT-1` |
| 안 쓰는 칸을 지우지 않는다 — stretch 의 `width`, pin 의 `x`/`y`, transform 의 `pin` 은 보존되고 렌더에만 안 쓰인다 | 확정 | `COMPOSITION-CONTRACT-1` |
| 블록 id · 프레임 내부 요소 id · overlay id 는 **한 이름 공간**이고 전부 유일하다 | 확정 | `COMPOSITION-CONTRACT-1` |
| **lasso 는 소속이 아니라 선택 수단**이다 — `메인 비주얼로 묶기` 는 명시적 동작이고 묶기 · 해제가 각각 Undo 한 칸이다 | 확정 | `COMPOSITION-CONTRACT-1` |
| 장식임을 나타내는 **별도 플래그를 두지 않는다** — `overlays` 배열에 있다는 것이 구분이다 | 확정 | `COMPOSITION-CONTRACT-1` |
| v2 에도 `overflow` 칸을 두지 않는다(기본 `visible`) — 자르기는 스킨 CSS 의 몫이라는 v1 결정을 유지 | 확정 | `COMPOSITION-CONTRACT-1` |
| v2 첫 범위는 column flow · 블록 다섯 · `main_visual` **한 단계** 내부 · page overlay 까지다 — 재귀 container · row · grid · 중첩 section 은 후속 | 확정 | `COMPOSITION-CONTRACT-1` |
| 회전 흡착(0·30·60·90° ±4°)과 모서리 손잡이 비율 유지 · 이미지 `contain` 기본 · 텍스트 선택 chrome 여유 | 확정(구현 전) | `MANUAL-UX-FIX-1` |
| 프레임 `height:"auto"` 에서 슬롯이 빈 photo 의 폴백 비율 | 미정 | `V2-MAIN-VISUAL-1` |
| 자동 배치 블록 본체의 직접 드래그를 순서 변경으로 볼 것인가 margin 조정으로 볼 것인가 | 미정 | `V2-INSPECTOR-1` |

## 14. 조합형 HOME Canvas v2 설계 (`HOME-CANVAS-COMPOSITION-CONTRACT-1`)

> **PLAN 이다. 이 절에 적힌 것은 코드에 하나도 없다.** 지금 배포된 것은
> [계약 문서](../contracts/IMORY_HOME_CANVAS_CONTRACT.md)의 v1(평면 자유
> Canvas)뿐이고, 이 절을 구현된 것으로 읽지 않는다. 이 라운드
> (`HOME-CANVAS-COMPOSITION-CONTRACT-1`, 2026-09-21)는 **문서만 바꿨다** —
> 제품 코드 · 렌더러 · Studio UI · validator · `APP_BUILD_VERSION` 전부
> 무변경이다.

### 14-1. 왜 나누는가

v1 은 모든 요소가 도화지 좌표에 떠 있는 **평면 자유 Canvas** 다. 이동 ·
리사이즈 · 회전이 갖춰지고(`TRANSFORM-1A · 1B · 1C`) 수동 테스트
(`MILESTONE-1`)를 지나면서 그 모델의 한계가 드러났다.

- 로고 · 카테고리 · 제목 · 본문처럼 **글자가 늘어나는** 것까지 절대좌표에
  두면, 한 줄이 늘 때마다 주인이 아래 것들을 전부 손으로 다시 옮겨야 한다.
- 반대로 사진 뒤의 기울어진 종이 · 테이프 · 인덱스 조각은 **흐름에 넣을 수
  없다** — 겹치는 것이 목적이기 때문이다.

그래서 HOME 편집을 "모든 요소의 절대좌표 편집기"로 만들지 않고 **두 층**으로
가른다. **v1 을 폐기하지 않는다** — v1 이 만든 선택 · lasso · 이동 ·
리사이즈 · 회전 · Undo 는 그대로 아래 층(자유 배치)의 엔진이 된다.

| 층 | 무엇이 놓이나 | 배치 | 엔진 |
| --- | --- | --- | --- |
| **자동 배치** | logo · category_nav · main_visual · text · divider (후속 photo_grid · widget) | 위에서 아래로 흐른다. 앞 블록이 커지면 뒤 블록이 밀린다 | 새로 만든다(`V2-FLOW-RENDER-1`) |
| **자유 배치** | 사진 주변 인덱스 · 종이 · 테이프 · 리본 · 라벨 · 스티커 · 페이지 구석 꽃잎 · 큰 숫자 | x/y/rotation 절대좌표. 흐름을 밀어내지 않는다 | **v1 을 그대로 쓴다** |

핵심 콘텐츠를 자유 배치로 만드는 것은 **기본 생성 경로가 아니다**. 자유
드래그로 로고를 아무 좌표에나 던지는 것이 기본 UX 가 되어서는 안 된다.

### 14-2. 레퍼런스에서 뽑은 구조 원칙

주인이 보여 준 레퍼런스 넷에서 **구조적 원리만** 가져온다. 이미지를 저장소에
복사하지 않고 작품 자체를 재현하지 않는다(§9 의 금지 그대로).

| 레퍼런스 | 무엇이 흐름이고 무엇이 자유인가 |
| --- | --- |
| **A** 큰 사진 + 종이 + 좌우 인덱스 | 제목 · 짧은 문구 · 구분선은 **자동 배치**. 사진은 `main_visual` 블록 하나. 사진 뒤 기울어진 종이 · 겹친 테두리 · 좌우 인덱스 조각은 **그 블록 안의 자유 요소**. 사진 아래 캡션은 블록 소속 캡션이거나 다음 `text` 블록. 화면 구석 꽃잎과 희미한 큰 숫자는 **페이지 자유 장식** |
| **B** 긴 에디토리얼 페이지 | 제목 · 와이드 사진 · 본문+사진 · 2열 사진은 **순서가 있는 자동 배치 섹션**. 사진 위 작은 라벨만 그 섹션의 자유 장식. 페이지 전체를 하나의 거대한 절대좌표 Canvas 로 만들지 않는다. row · grid 는 첫 구현 범위가 아니라 **후속 블록 종류** |
| **C** 큰 메인 사진과 주변 UI 조각 | 메인 사진과 색상칩 · 하트 · 인용부호 · 작은 라벨은 **하나의 `main_visual`**. 화살표 · 페이지 번호처럼 **실제 기능을 가진 것은 장식과 구분**한다(장식이 아니라 후속 widget). 아래 작은 사진 · 날짜 · 텍스트는 별도 자동 배치 블록. 화면 전체의 넓은 여백은 자유좌표가 아니라 **블록 margin 과 정렬**로 만든다 |
| **D** 큰 사진 + 2×2 사진 + 정보 카드 | 큰 사진 · 사진 그리드 · 정보 카드는 **각각 자동 배치 블록**. 사진 번호 · 작은 프로필 · 라벨은 각 블록에 소속된 장식. **grid 자체는 후속 블록 종류**로 남긴다 — v2 첫 구현은 column 흐름과 `main_visual` 하나에 집중한다 |

### 14-3. v2 의 모양

```json
{
  "name": "home_canvas",
  "enabled": true,
  "canvas": {
    "version": 2,
    "baseWidth": 390,
    "baseHeight": 844,
    "flow": {
      "direction": "column",
      "padding": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
      "gap": 0,
      "blocks": []
    },
    "overlays": []
  }
}
```

**저장 위치는 v1 과 같다** — `SkinPackage.regions` 의 `home_canvas` 항목이고,
표시 위치도 HOME 안 `data-imory-canvas-root` 정확히 하나다(계약 문서 §2 ·
§3). 새 최상위 필드를 만들지 않는다.

`baseWidth` · `baseHeight` 의 뜻은 v1 과 **글자 그대로 같다**(계약 문서 §4 ·
§4-1). `baseWidth` 는 `390` 고정이고, `baseHeight` 는 양수 필수이며 **블록
높이의 합으로 자동 계산하지 않는다**. flow 가 `baseHeight` 보다 길면 넘치고,
자를지 늘릴지 스크롤할지는 v1 과 같이 **스킨 CSS 의 몫**이다. Studio 가
`baseHeight` 를 몰래 늘리지 않는다 — "내용에 맞추기"는 주인이 누르는 명시적
동작이고 Undo 한 칸이다(`V2-INSPECTOR-1`).

#### 최소 블록 예시

```json
{
  "version": 2,
  "baseWidth": 390,
  "baseHeight": 1240,
  "flow": {
    "direction": "column",
    "padding": { "top": 48, "right": 24, "bottom": 64, "left": 24 },
    "gap": 20,
    "blocks": [
      {
        "id": "canvas_b1logo",
        "type": "logo",
        "width": 120,
        "height": 40,
        "align": "center",
        "props": { "slot": "title_logo", "fallback": "site_title" }
      },
      {
        "id": "canvas_b2nav",
        "type": "category_nav",
        "width": 342,
        "height": "auto",
        "align": "stretch",
        "margin": { "top": 8 },
        "props": { "mode": "all", "categoryIds": [] }
      },
      {
        "id": "canvas_b3title",
        "type": "text",
        "width": 300,
        "height": "auto",
        "align": "center",
        "props": { "text": "FOREVER YOUNG", "role": "title" }
      },
      {
        "id": "canvas_b4rule",
        "type": "divider",
        "width": 120,
        "height": 1,
        "align": "center",
        "margin": { "top": 12, "bottom": 12 }
      },
      {
        "id": "canvas_b5main",
        "type": "main_visual",
        "width": 300,
        "height": "auto",
        "align": "center",
        "margin": { "top": 24, "bottom": 24 },
        "props": {
          "baseWidth": 300,
          "baseHeight": 380,
          "primaryId": "canvas_m1photo",
          "elements": [
            {
              "id": "canvas_m0paper",
              "type": "shape",
              "follow": "transform",
              "x": -18,
              "y": 26,
              "width": 300,
              "height": 360,
              "rotation": -6,
              "props": { "kind": "rect" }
            },
            {
              "id": "canvas_m1photo",
              "type": "photo",
              "follow": "transform",
              "x": 0,
              "y": 0,
              "width": 300,
              "height": 380,
              "props": { "slot": "photo_main" }
            },
            {
              "id": "canvas_m2left",
              "type": "text",
              "follow": "pin",
              "width": 92,
              "height": 22,
              "pin": {
                "target": "photo",
                "anchor": "left",
                "origin": "right",
                "offset": { "x": 8, "y": -40 }
              },
              "props": { "text": "puppy !", "role": "label" }
            },
            {
              "id": "canvas_m3right",
              "type": "text",
              "follow": "pin",
              "width": 92,
              "height": 22,
              "pin": {
                "target": "photo",
                "anchor": "right",
                "origin": "left",
                "offset": { "x": -8, "y": 90 }
              },
              "props": { "text": "kitty !", "role": "label" }
            },
            {
              "id": "canvas_m4cap",
              "type": "text",
              "follow": "pin",
              "width": 240,
              "height": "auto",
              "pin": {
                "target": "frame",
                "anchor": "bottom",
                "origin": "top",
                "offset": { "x": 0, "y": 10 }
              },
              "props": { "text": "2025 / 05 / 12", "role": "caption" }
            }
          ]
        }
      }
    ]
  },
  "overlays": [
    {
      "id": "canvas_o1number",
      "type": "text",
      "x": -46,
      "y": 980,
      "width": 260,
      "height": 200,
      "rotation": 0,
      "props": { "text": "01", "role": "label" }
    }
  ]
}
```

### 14-4. 자동 배치 블록 계약

블록 하나의 **공통 칸**은 v1 요소의 공통 칸(계약 문서 §5)을 그대로 잇는다 —
종류별 내용은 전부 `props` 안이라는 규칙도 같다.

| 칸 | 필수 | 규칙 |
| --- | --- | --- |
| `id` | ✔ | **v1 §5-1 과 같은 규칙**(`/^[A-Za-z][A-Za-z0-9_-]{0,63}$/`, `canvas_` 접두). 렌더러가 `data-imory-edit-id` 로 쓴다 |
| `type` | ✔ | `logo` · `category_nav` · `text` · `divider` · `main_visual` — **v2 첫 범위는 이 다섯** |
| `width` | ✔ | **`baseWidth`(390) 좌표계의 양수**. `"auto"` 는 없다 — 가용 폭 전부는 `align:"stretch"` 가 뜻한다 |
| `height` | ✔ | 양수 **또는** `"auto"`. `"auto"` 를 쓸 수 있는 종류는 `text` · `category_nav` · `divider` · `main_visual` 넷이고 `logo` 는 양수다(v1 §6 의 자를 그대로 쓴다) |
| `align` | | `left` · `center` · `right` · `stretch`. 빠지면 `left` |
| `margin` | | `{ top, right, bottom, left }`, 각 칸 선택이고 빠지면 `0`. **음수 허용**(일부러 겹치기 위해) |
| `maxWidth` | | 양수. **`align:"stretch"` 일 때만 뜻이 있다** |
| `hidden` | | boolean. 빠지면 `false` |
| `locked` | | boolean. 빠지면 `false` |
| `props` | | 객체. 빠지면 `{}`. 종류별 필수 칸은 아래 |

- **배열 순서가 위에서 아래 순서**다. 별도 `order` · `z` 칸을 두지 않는다
  (v1 이 `z` 를 두지 않은 것과 같은 이유).
- **`align:"stretch"` 여도 `width` 를 버리지 않는다.** 렌더에 쓰지 않을
  뿐이고 저장값은 남는다 — 정렬을 stretch ↔ center 로 오가도 폭을 잃지
  않는다. `hidden` 을 켰다 꺼도 마찬가지다.
- **`hidden:true` 는 자리도 차지하지 않는다**(아래 블록이 올라온다). 빈 칸을
  남기는 것은 `hidden` 이 아니라 CSS `visibility` 의 뜻이다.
- `locked:true` 는 편집기에서 고를 수 없다는 뜻이다(v1 §14-3 과 같다).

#### `flow.gap` 과 개별 `margin` 의 관계 — **합산이다. collapse 하지 않는다**

두 블록 사이의 실제 간격 = `flow.gap` + 앞 블록 `margin.bottom` + 뒤 블록
`margin.top`. 첫 블록 위와 마지막 블록 아래에는 `gap` 이 붙지 않고
`flow.padding` 과 그 블록의 `margin` 만 있다.

CSS 의 margin collapse 를 흉내 내지 않는다. 흉내 내면 저장값과 화면이
어긋나고, 편집기에서 "여백을 늘렸는데 아무 일도 안 일어난다"가 생긴다.

#### `align` 과 좌우 `margin` 이 함께 작동하는 방식

| `align` | 가로 위치 | `margin.left` · `margin.right` |
| --- | --- | --- |
| `left` | `flow.padding.left` 에 붙는다 | `left` 가 더 민다. `right` 는 쓰이지 않는다(보존) |
| `center` | 가용 폭의 가운데 | 둘이 함께 기준 폭을 깎아 중심을 옮긴다 |
| `right` | `flow.padding.right` 에 붙는다 | `right` 가 더 민다. `left` 는 쓰이지 않는다(보존) |
| `stretch` | 가용 폭 전부(`maxWidth` 가 있으면 거기까지, 그 뒤 가운데) | 양쪽에서 폭을 깎는다 |

★ **이름 함정.** `skin/skin-layout.js` 의 배치 primitive 에도 `align` 이
있지만 값이 `start · center · end · stretch · baseline` 이고 **교차축**을
뜻한다. 그쪽은 스킨 템플릿의 HTML 속성 층이고 이쪽은 Canvas JSON 이라 한
객체에 같이 나오지 않지만, 두 문서를 오가며 읽을 때 값 표를 섞지 않는다.

#### 종류별 `props`

| `type` | `props` | 비고 |
| --- | --- | --- |
| `logo` | `slot` · `fallback` | **v1 §7 과 같다**(`fallback` 은 `site_title` 하나) |
| `category_nav` | `mode` · `categoryIds` | **v1 §7 과 같다** |
| `text` | `text` · `role` | **v1 §7 과 같다**(`role` 은 title · subtitle · body · caption · label) |
| `divider` | 없음 | 흐름 안의 가로 구분선. **v1 의 `shape{kind:"line"}` 과 다른 층이다** — 그쪽은 자유 좌표 장식이고 `overlays` 에서 계속 쓰인다 |
| `main_visual` | `baseWidth` · `baseHeight` · `primaryId` · `elements` | §14-5 |

v1 과 뜻이 같은 것은 **같은 이름 · 같은 값 표**를 쓴다. 같은 의미의 칸을 두
벌 만들지 않는다.

### 14-5. `main_visual` — 사진 한 장이 아니라 편집 프레임 하나

```text
main_visual
├─ primary photo        ← props.primaryId 가 가리킨다
├─ background paper     ← follow: "transform"
├─ border               ← follow: "transform"
├─ left index           ← follow: "pin"
├─ right index          ← follow: "pin"
├─ tape / ribbon / sticker
└─ caption              ← follow: "pin" (frame bottom)
```

**블록 자체는 자동 배치 영역에 속한다** — 순서 · `align` · `width` ·
`height` · `margin` 은 다른 블록과 똑같다. 내부만 로컬 좌표계다.

| `props` 칸 | 필수 | 규칙 |
| --- | --- | --- |
| `baseWidth` · `baseHeight` | ✔ | 양수. **내부 요소 좌표의 자**다. 블록의 `width` 와 같을 필요가 없고, 블록 `height:"auto"` 에서도 이 자는 흔들리지 않는다 |
| `primaryId` | ✔ | `elements` 안의 id 하나. 그 요소는 **`type:"photo"` 여야 하고 `hidden` 일 수 없다** — 아니면 Import 거부 |
| `elements` | ✔ | 내부 자유 요소 배열. **비어 있을 수 없다**(최소한 primary 하나) |

- **내부 요소 배열 순서가 앞뒤 순서**다(앞쪽이 뒤, 뒤쪽이 앞 — v1 과 같다).
- 내부 요소 좌표의 원점은 **프레임 상자의 왼쪽 위**(margin 바깥이 아니다).
  음수와 프레임 밖 좌표를 **허용한다** — 삐져나오는 것이 목적이기 때문이다.
  상한은 v1 과 같은 자를 쓴다(좌표 ±100000 · 크기 0 초과 100000 이하).
- **`overflow` 칸을 두지 않는다.** 렌더러가 프레임에 `overflow` 를 쓰지
  않으므로 브라우저 기본값 `visible` 이고, 자를지 말지는 스킨 CSS 가 정한다
  — 플랫폼 CSS 가 도화지의 `overflow` 를 정하지 않는다는 v1 결정(계약 문서
  §4-1 · §12-2)을 뒤집지 않는다.
- **`height:"auto"` 는 primary photo 의 비율을 따른다.** 비율을 두 곳에서
  정하면 충돌하므로 별도 `aspectRatio` 칸을 두지 않는다. 슬롯이 비어 비율을
  모를 때의 폴백 비율은 **`V2-MAIN-VISUAL-1` 이 정한다** — 데이터 계약이
  아니라 렌더 결정이다.
- **primary photo 를 교체해도 장식 관계가 유지된다.** 교체는 그 요소의
  `props.slot` 을 바꾸는 것이고, `primaryId` 도 pin 의 `target:"photo"` 도
  id 를 보기 때문이다.
- **photo Crop 은 사진 콘텐츠 안쪽 일이다** — 주변 장식은 그대로다.

#### id 는 Canvas 하나 안에서 전부 유일하다

블록 id · `main_visual` 내부 요소 id · overlay id 가 **한 이름 공간**이다.
중복이면 새 Import 를 거부한다(v1 §5-1 과 같은 판정).

이유 둘. (1) 렌더러가 전부 `data-imory-edit-id` 로 내보내는데 그것이 문서
안에서 유일해야 Inspector 선택자와 스킨 CSS 가 성립한다. (2) §14-7 의
묶기 · 해제가 **id 를 바꾸지 않고 소속만 옮기므로**, 층을 옮길 때 이름이
부딪히면 안 된다.

### 14-6. `pin` 과 `transform` — 프레임이 커질 때 무엇을 따라가나

내부 요소마다 `follow` 를 하나 갖는다. 빠지면 `"transform"`.

| | `transform` | `pin` |
| --- | --- | --- |
| 무엇이 따라가나 | **위치와 크기가 함께 비례 변경** | 기준점 위치만 따라간다. **자기 크기는 유지** |
| 쓰는 칸 | `x` · `y` · `width` · `height` · `rotation` | `width` · `height` · `rotation` · `pin{...}` |
| 안 쓰는 칸 | `pin`(보존만) | `x` · `y`(보존만) |
| 어울리는 것 | 사진 뒤 기울어진 종이 · 겹친 테두리 · 가로지르는 테이프 · 사진 크기에 맞춘 큰 도형 | 좌우 인덱스 · 작은 하트 · 모서리 라벨 · 짧은 글자 조각 · 작은 PNG 스티커 |

**안 쓰는 칸을 지우지 않는다.** `follow` 를 pin ↔ transform 으로 토글해도
좌표와 pin 설정을 잃지 않는다(§14-4 의 stretch ↔ width 와 같은 규칙).

#### 배율 — 자가 둘이다

화면 배율 `S_page` = 실제 도화지 폭 ÷ `canvas.baseWidth`.
프레임 배율 `S_frame` = 프레임의 해결된 폭 ÷ `props.baseWidth`.

| | 최종 크기 · 오프셋 | 최종 위치 |
| --- | --- | --- |
| `transform` | 로컬값 × `S_frame` × `S_page` | 로컬 `x`·`y` × `S_frame` × `S_page` |
| `pin` | 로컬값 × `S_page` (**`S_frame` 없음**) | `anchor` 기준점 + `offset` × `S_page` |

★ **`S_frame` 은 가로 배율 하나다.** 세로 배율을 따로 쓰지 않는다 — 균등
배율이라야 `rotation` 이 보존되고(계약 문서 §19-2 가 각도에 배율을 보정하지
않는 것과 같은 이유) 종이 · 테이프가 찌그러지지 않는다. 프레임이 세로로만
늘어나면 transform 장식은 위쪽에 몰린다. **그것이 의도한 동작이다.**

pin 이 `S_frame` 을 안 받는 덕분에 "프레임을 키워도 인덱스 글자는 안 커지고,
화면이 커지면 전체와 함께 커진다"가 성립한다.

#### `pin` 의 모양

```json
"pin": {
  "target": "frame",
  "anchor": "bottom-right",
  "origin": "top-left",
  "offset": { "x": 8, "y": -4 }
}
```

| 칸 | 필수 | 규칙 |
| --- | --- | --- |
| `target` | | `frame` · `photo`. 빠지면 `frame`. `photo` 는 `primaryId` 요소의 상자다 |
| `anchor` | | **대상의** 어느 점에 붙나. 아래 아홉. 빠지면 `center` |
| `origin` | | **장식 자신의** 어느 점을 그 자리에 놓나. 같은 아홉. 빠지면 `center` |
| `offset` | | `{ x, y }` 숫자. 빠지면 `{x:0,y:0}`. 음수 허용. 자는 `canvas.baseWidth`(= `S_page` 를 받는다) |

```text
top-left     top     top-right
left         center  right
bottom-left  bottom  bottom-right
```

★ **`anchor` 와 `origin` 을 둘 다 두는 이유.** 자기 기준점이 없으면 장식의
크기를 바꿀 때마다 붙은 자리가 밀리고, 그것을 맞추려면 편집기가
`offset` 을 **저장값에서 몰래 다시 계산**해야 한다. v1 §9 의 "조용히 고치지
않는다"에 정면으로 어긋난다.

### 14-7. lasso 선택과 명시적 묶기

**lasso 는 소속이 아니라 선택 수단이다.** 끌어서 여러 개를 고른 것이 영구
그룹이 되지 않는다.

1. 주인이 메인 사진과 장식들을 lasso 또는 Shift+클릭으로 고른다
   (`SELECT-1B-2` 가 이미 만든 그 선택이다).
2. **`메인 비주얼로 묶기`** 를 명시적으로 실행한다.
3. 선택 목록에서 **primary photo 를 하나 지정**한다.
4. 나머지 요소가 `main_visual` 내부 **로컬 좌표로 변환**된다 — 화면 위치가
   유지되도록 변환하고, 그 결과가 곧 저장값이다.
5. 각 장식은 기본적으로 `pin` 또는 `transform` 중 하나를 받는다.
6. **`묶기 해제`** 는 현재 화면 위치를 유지한 채 페이지 자유 요소
   (`overlays`)로 되돌린다 — 위 변환의 역이다.

- **id 는 바뀌지 않는다.** 소속과 좌표계만 바뀐다(§14-5 의 한 이름 공간이
  그래서 필요하다).
- **묶기 · 해제는 각각 Undo 한 칸**이다(v1 의 "한 제스처 = Undo 한 칸"과 같은
  자).

이유: 단순 다중 선택과 영구 소속은 다른 행위다. 실수로 걸린 요소가 자동으로
그룹이 되면 주인이 그것을 알아차릴 자리가 없다.

### 14-8. 페이지 자유 장식 (`overlays`)

`overlays` 항목 하나의 모양은 **v1 요소 하나와 정확히 같다** —
`id` · `type` · `x` · `y` · `width` · `height` · `rotation` · `hidden` ·
`locked` · `props`, 좌표 기준은 도화지 왼쪽 위와 `canvas.baseWidth` ·
`baseHeight`.

같게 두는 이유가 전부다: **v1 이 만든 확정 경로**(선택 · lasso · 이동 ·
리사이즈 · 회전 · 요청 번호 · Undo 한 칸)를 한 줄도 새로 쓰지 않고 그대로
쓴다.

- 자동 배치 블록의 흐름에 **영향을 주지 않는다**.
- **장식임을 데이터에서 구분하는 별도 플래그를 두지 않는다** —
  `overlays` 배열에 있다는 것 자체가 구분이다.
- 모바일에서 잘릴 위험이 있으므로 **후속 responsive 계약의 대상**이다
  (`RESPONSIVE-1`).

### 14-9. v1 과의 관계 · 미래 version fallback (**실제 코드 확인 결과**)

**v1 을 깨지도 바꾸지도 않는다.**

- `canvas.version:1` 은 지금 그대로 렌더 · 편집된다.
- 기존 수동 테스트 스킨(`skin/test-skins/imory-home-canvas-manual-v1.json`)도
  그대로 동작한다.
- **기존 v1 JSON 을 자동 변환하거나 migration 하지 않는다.**
- 배포된 renderer · sandbox · selection · transform 계약을 유지한다.

★ **오늘 `version:2` 가 이미 "보존하되 실행하지 않는" 자리에 있다** —
2026-09-21 코드 실측.

| 확인한 것 | 파일 · 위치 | 결과 |
| --- | --- | --- |
| 실행 가능한 version 은 상수 하나 | `skin/skin-home-canvas.js` `SKIN_HOME_CANVAS_VERSION = 1` | v2 는 이 값이 아니다 |
| 모르는 version 은 **거부가 아니다** | 같은 파일 `validateSkinCanvasData()` — `canvas.version !== SKIN_HOME_CANVAS_VERSION` 이면 `{ ok:true, future:true }` | 파일이 통과한다(= Import · Save · Export · Publish · AI 에서 보존된다) |
| 모르는 version 의 내용을 v1 규칙으로 검사하지 않는다 | 같은 분기가 `baseWidth` · `baseHeight` · `elements` 검사 **앞에서** 돌아온다 | v2 의 `flow` · `overlays` 가 v1 규칙에 걸리지 않는다 |
| 실행 payload 를 만들지 않는다 | `buildSkinCanvasRenderPayload()` — `check.future` 면 `undefined` | 기존 HOME 이 그려진다(계약 문서 §3 의 fallback 표) |
| 그래서 sandbox 로도 나가지 않는다 | payload 가 없으므로 `isSandboxHomeCanvas()` 까지 가지 않는다 | 봉투가 지금과 byte 단위로 같다 |
| Studio 선택도 꺼진다 | `studio/inspector/studio-canvas-selection.js` 가 같은 `resolveSkinHomeCanvas()` 를 쓴다 | v2 데이터에서는 **고를 요소가 아예 없다** |

즉 **오늘 v2 파일을 넣으면 조용히 보존되고 아무것도 실행되지 않는다.** 이
라운드가 코드를 바꾸지 않아도 되는 이유가 이것이다.

#### v2 를 켤 때의 함정 셋 (`V2-DATA-1` 이 반드시 본다)

1. ★ **기존 테스트가 `version: 2` 를 "미래 version" 사례로 쓰고 있다** —
   `skin/skin-home-canvas-test.mjs` 의 `[version]` 절 · `[baseheight]` 절 ·
   `[protocol]` 의 reject 목록이 전부 `{ version: 2, ... }` 다. v2 를 실행
   가능하게 만드는 순간 그 행들은 **틀린 것을 단언하게 된다** — 다른 미지원
   숫자로 옮겨야 하고, 옮겼다는 사실이 보고에 남아야 한다.
2. **v2 canvas 에 최상위 `elements` 를 두지 않는다.** v1 의 불변 수정 함수
   `writeSkinHomeCanvasElementFields()` 는 version 을 보지 않고
   `canvas.elements` 배열을 찾아 id 로 쓴다 — 그 칸이 없어야 v1 writer 가
   v2 데이터에 **절대 닿을 수 없다**. 한 canvas 가 `elements` 와 `flow` 를
   동시에 가지면 **Import 거부**한다(어느 쪽이 진짜인지 파일만 보고 알 수
   없게 두지 않는다).
3. **`studio/preview/preview-sandbox.js` 가 template 칸을 알려진 키만
   옮긴다** — `RENDER-1B` 에서 캔버스가 sandbox Preview 에만 안 보이던 진짜
   원인이 이것이었다. v2 payload 의 모양이 바뀌면 그 자리를 같이 본다.

### 14-10. 편집 UX 계약 (구현은 `V2-INSPECTOR-1` · `V2-ATTACH-1`)

#### 자동 배치 블록을 고르면

왼쪽 패널에서 **블록 종류와 이름 · 콘텐츠 · `width` · `height`/auto · 정렬 ·
`margin` 네 칸 · `hidden`/`locked` · 순서 이동**을 편집한다. 미리보기
손잡이로 `width` · `height` 를 조절할 수 있다.

**블록 본체를 자유 x/y 로 끄는 것은 기본 동작이 아니다.** 향후 직접 드래그는
**순서 변경** 또는 **margin 조정** 중 하나로 별도 설계하고, 이번 계약에서는
구현하지 않는다.

#### `main_visual`

| 동작 | 결과 |
| --- | --- |
| 한 번 클릭 | **블록 전체 선택** — 폭 · 높이 · 정렬 · margin 편집 |
| `내부 편집` 또는 더블클릭 | primary photo 와 장식을 **개별 선택** — `SELECT-1B-*` · `TRANSFORM-1A~1C` 의 Moveable · Selecto 이동 · 리사이즈 · 회전을 그대로 쓴다 |
| Escape 또는 `프레임 나가기` | 블록 전체 선택으로 복귀 |

#### 페이지 장식

**지금 v1 요소와 똑같다.** 바로 이동 · 리사이즈 · 회전한다.

#### 두 Inspector 의 책임을 섞지 않는다

| | v2 블록 Inspector | v1 자유 요소 Inspector |
| --- | --- | --- |
| 대상 | `flow.blocks[n]` | `overlays[n]` · `main_visual` 내부 요소 |
| 위치를 정하는 것 | **순서 · 정렬 · margin** | **x · y** |
| 크기 | `width` · `height`/auto · `maxWidth` | `width` · `height` |
| 회전 | 없다(흐름 블록은 돌리지 않는다) | `rotation` |
| 손잡이 | 크기만 | 이동 · 크기 · 회전 |

### 14-11. 반응형 원칙 (구현은 `RESPONSIVE-1`)

이번 단계에서 override 를 구현하지 않지만 방향은 고정한다.

- 자동 배치 블록은 화면 폭이 바뀌어도 **순서와 margin 관계를 유지**한다.
- `main_visual` 은 **하나의 단위로 축소**된다.
- 내부 `transform` 장식은 같이 비례 축소되고, `pin` 장식은 **기준점 관계를
  유지**한다(§14-6 의 배율 표가 그대로 답이다).
- 페이지 자유 장식은 향후 **hide / reposition override** 의 대상이다.
- 사진 교체 · 텍스트 줄바꿈이 **다른 블록의 흐름을 깨지 않는다**.
- **모바일과 데스크톱의 별도 좌표 복사를 첫 해결책으로 쓰지 않는다.**

### 14-12. v2 첫 범위의 경계

**들어가는 것**: top-level column flow · 일반 블록 다섯 · `main_visual` **한
단계** 내부 자유 레이어 · page overlay.

**들어가지 않는 것**: 재귀 container · 무한 중첩 · row · grid · 중첩 section.
그것들은 후속 version 또는 후속 블록 종류다.

### 14-13. 단계별 후속 작업

| 순서 | 작업 ID | 무엇 | 상태 |
| --- | --- | --- | --- |
| 1 | `HOME-CANVAS-COMPOSITION-CONTRACT-1` | 이 절 — 설계 확정. 문서만 | **완료**(2026-09-21) |
| 2 | `HOME-CANVAS-MANUAL-UX-FIX-1` | 현재 v1 편집기의 UX 수정 넷(§14-14) | **완료**(2026-09-21) — 결과는 [계약 문서 §21](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) |
| 3 | `HOME-CANVAS-INSPECTOR-1A` | v1 Canvas 요소를 골랐을 때의 **최소 Inspector 입력 필드**(§14-15) | **완료**(2026-09-21) — 결과는 [계약 문서 §22](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) |
| 4 | `HOME-CANVAS-V2-DATA-1` | v2 normalize · validate · resolve · 보존. **DOM renderer 없음** | **미착수 — 다음 작업** |
| 5 | `HOME-CANVAS-V2-FLOW-RENDER-1` | column flow 와 logo · category_nav · text · divider 렌더 + native/sandbox parity | 미착수 |
| 6 | `HOME-CANVAS-V2-MAIN-VISUAL-1` | `main_visual` 프레임 · primary photo · 내부 자유 요소 · pin/transform 렌더 | 미착수 |
| 7 | `HOME-CANVAS-V2-INSPECTOR-1` | 블록 정렬 · margin · size · 내용 편집 + 프레임 내부 진입/나가기 | 미착수 |
| 8 | `HOME-CANVAS-V2-ATTACH-1` | lasso/Shift 선택 → `메인 비주얼로 묶기` · primary 지정 · `묶기 해제` · Undo/Redo | 미착수 |
| 9 | `HOME-CANVAS-EFFECT-HOOK-1` | 안정된 선택자 · 수명주기 · 정리. `main_visual` 과 sandbox 저자 JS 의 공존 | 미착수(§8 에 완료 기준) |

> **★ `INSPECTOR-1A` 와 `V2-INSPECTOR-1` 은 다른 작업이다.**
>
> `INSPECTOR-1A`(3 번)는 **지금 v1** 자유 배치 요소를 골랐을 때 왼쪽
> 패널이 비어 있는 문제를 푸는 작업이고, `V2-INSPECTOR-1`(7 번)은 그
> 뒤 v2 의 **flow block 과 `main_visual`** 을 편집하는 작업이다. 둘을
> 같은 작업으로 합치거나 하나로 대체하지 않는다 — 책임 구분은 §14-10
> 의 마지막 표다.

그룹 전체 transform(`TRANSFORM-1D`) · row/grid · responsive override
(`RESPONSIVE-1`) · layer panel(`LAYERS-1`) 은 각각 그대로 후속이다.

### 14-14. 수동 테스트에서 나온 v1 편집기 수정 (`HOME-CANVAS-MANUAL-UX-FIX-1`)

`MILESTONE-1` 의 수동 테스트에서 주인이 찾은 것들이다. **v2 구조와 무관하게
지금 v1 편집기를 고치는 작업이었다.**

> **✅ 2026-09-21 에 넷 다 구현됐다 — 이 절은 그때의 요구 기록이고,
> 지금 코드가 강제하는 것은
> [계약 문서 §21](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) 이다.**
> 실제 판정식 · 경계값 · 구현 함정은 그쪽을 본다. 아래에서 그때의
> 요구와 달라진 것은 하나뿐이다: 모서리 비율의 **끄는 축**을 한 축으로
> 고르지 않고 **대각선 정사영**으로 했다(§21-2 의 그 이유).

#### 회전

- 자유 회전을 유지한다.
- **0 · 30 · 60 · 90… 도 근처에서 자석처럼 붙는다.** 권장 흡착 범위 **±4°**.
- 모든 움직임을 강제로 30° 단위로 **양자화하지 않는다**.

#### 리사이즈

- **모서리 손잡이 넷**: 현재 비율 유지.
- **변 중앙 손잡이 넷**: 가로 또는 세로 자유 조절.
- Shift · Alt 추가 동작은 후속(`TRANSFORM-1D`).

★ 지금 계약은 손잡이 여덟이 **모두 자유 비율**이다(계약 문서 §18-2). 이 항목은
그 계약을 바꾸므로, 구현할 때 §18-2 를 같이 고쳐야 한다.

#### 이미지 표시

- `photo` · `logo` · `sticker` 는 **명시적 Crop 전까지 전체 이미지를 보여
  준다** — 기본 `contain`.
- 주인이 Crop 을 고른 경우에만 `cover` 또는 crop frame 을 쓴다.
- **PNG 로고 · 스티커가 프레임 때문에 잘리면 안 된다.**
- 변 중앙 손잡이로 프레임 비율을 바꿨을 때 남는 공간은 허용한다.

#### 텍스트 선택 chrome

- **선택선이 글자를 관통하면 안 된다.**
- 편집 chrome 은 렌더된 glyph/content 영역 **바깥으로 4~6px** 여유를 둔다.
- 줄바꿈 뒤 **즉시 재측정**한다.
- `height:"auto"` 는 실제 내용 전체를 감싼다.
- 숫자 `height` 보다 내용이 넘쳐도 선택선이 글자를 통과하지 않는다.
- ★ **편집용 여유가 공개 화면의 저장 geometry 를 몰래 바꾸지 않는다.**

### 14-15. Canvas Inspector 최소 범위 (`HOME-CANVAS-INSPECTOR-1A`)

> **✅ 2026-09-21 에 구현됐다 — 이 절은 그때의 요구 기록이고, 지금 코드가
> 강제하는 것은
> [계약 문서 §22](../contracts/IMORY_HOME_CANVAS_CONTRACT.md) 다.**
> 실제 필드 · 확정 경로 · Undo 규칙 · 구현 함정은 그쪽을 본다.

그때의 요구는 이랬다 — **text 내용 · `width` · `height`/auto · 정렬 ·
margin 또는 Canvas geometry · `rotation` · `hidden`/`locked`**.

실제로 구현된 것과 **달라진 둘**:

- **정렬 · margin 은 넣지 않았다.** v1 은 자유 배치라 그 두 개념이 없고,
  그 자리는 Canvas geometry(`x` · `y` · `width` · `height` · `rotation`)가
  이미 갖는다. 정렬 · margin 은 v2 의 자동 배치 블록이 갖는 칸이다(§14-10).
- **`hidden`/`locked` 토글은 일부러 뺐다.** 레이어 목록이 없어 켠 뒤에
  되돌릴 안정적인 길이 없다(숨기면 화면에서 다시 고를 수 없다). 임시
  우회 UI 를 만들지 않고 `HOME-CANVAS-LAYERS-1` 로 미뤘다 — 계약 문서
  §22-7.

책임 구분은 §14-10 의 마지막 표다 — v2 블록 Inspector 와 v1 자유 요소
Inspector 가 같은 칸을 두 벌로 갖지 않는다. **`V2-INSPECTOR-1` 은 여전히
별도 작업이다**(§14-13 의 7 번).
