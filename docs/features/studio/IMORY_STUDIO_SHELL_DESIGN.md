# Imory Skin Studio Shell — 기준 문서 (STUDIO-SHELL-1 · 1.1 · MOBILE-SHEET-1)

Skin Studio 화면의 **정보 구조**: 상단 도구 모음의 세 그룹, 왼쪽 편집
패널, 오른쪽 AI 패널, 좁은 화면. 기능 동작(배치 엔진 · 전환 primitive ·
Bottom Dock 데이터 · AI 요청 · SkinPackage · Save/Publish · 선택 복원 ·
공개 렌더)은 이 라운드에서 바꾸지 않았다.

이 문서는 "현재 구현" · "앞으로 지켜야 할 원칙" · "남은 차이"를 구분해
적는다(CLAUDE.md §5).

| 무엇 | 어디 |
| --- | --- |
| 마크업(상단 바 · 왼쪽 패널) | [studio/index.html](../../../studio/index.html) · 같은 모양을 [studio/studio-lifecycle-scenario.html](../../../studio/studio-lifecycle-scenario.html) 이 비춘다 |
| 왼쪽 패널 여닫기 · 내용 바꾸기 · ··· 메뉴 · 현재 페이지 표시 | [studio/studio-shell.js](../../../studio/studio-shell.js) |
| 모양(세 그룹 · 패널 · 좁은 화면) | [studio/studio-shell.css](../../../studio/studio-shell.css) |
| Undo/Redo 기록 | [studio/studio-history.js](../../../studio/studio-history.js) |
| 좁은 화면의 세 단계 시트(단계 · Preview 가림 방지 · 키보드 · Escape) · 손잡이 드래그 | [studio/studio-sheet.js](../../../studio/studio-sheet.js) · [studio/studio-sheet-drag.js](../../../studio/studio-sheet-drag.js) · Preview 문서 쪽 [studio/preview/preview-sheet-inset.js](../../../studio/preview/preview-sheet-inset.js) |
| E2E | `node studio/studio-shell-e2e-test.mjs` (8968, `--browser=webkit` 도 돈다) · 시트는 `node studio/studio-mobile-sheet-e2e-test.mjs` (8972, `--browser=webkit`) |

---

## 1. 화면 구조 (현재 구현)

```
[ ← · Select · Layers · Layout | 현재 페이지 · Desktop|Mobile · ↶ ↷ | Code · Import|Export · Save · Publish · AI ]
[ 왼쪽 패널 ][                 Preview stage                 ][ AI 패널 ]
```

- **왼쪽 그룹** — 나가기(← back)와 왼쪽 패널을 여는 **셋**.
  STUDIO-LAYERS-MEDIA-1 에서 **Images 버튼이 없어졌다** — 사진을
  바꾸는 일은 "어느 사진인가"가 정해진 뒤에야 뜻이 있어서, 여는 길을
  Layers 의 사진 행 · Select 의 "이미지 변경" · Layout 의 제목 로고
  셋으로 옮겼다(§2 의 표 · §2-3). 패널 자리도 데이터도 저장 경로도
  그대로다.
  STUDIO-LAYERS-SHELL-1 에서 셋째 자리가 **Dock → Layers** 로 바뀌었다
  (계획 문서 [IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md](../../plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md) §1).
  Bottom Dock 은 사이트 전체의 이동 설정이라 Canvas 편집 진입점과 같은
  급이 아니다 — 설정 자체와 저장 경로는 그대로이고 **여는 길만** 옮겼다
  (§2 의 표).
- **가운데 그룹** — 지금 보고 있는 것(현재 페이지 · Desktop/Mobile)과
  되돌리기. 가운데 그룹이 바의 정중앙에 온다(studio.css "세 그룹의
  배치 규칙" 그대로).
- **오른쪽 그룹** — 파일(Code · Import|Export) · Save · **Publish(유일한
  primary)** · AI Assistant.
- Import 와 Export 는 `.studio-button-pair` 한 덩어리다.
- 현재 페이지는 **표시**다. 페이지는 Preview 안의 링크로 옮긴다 — 여기서
  고르지 않는다. 값은 `updateStudioCodeButtonState()`(studio-preview.js)가
  `updateStudioPageIndicator()` 를 불러 적는다. preview-navigation.js 가
  `currentPreviewPageType` 을 바꾸는 모든 자리에서 그 함수를 빠짐없이
  부르기 때문이다.
- id 는 전부 예전 그대로다. 같은 기능의 버튼은 한 벌뿐이다 — 좁은
  화면의 ··· 메뉴도 **같은 버튼**을 드롭다운 모양으로 보여 줄 뿐이다.
- 바의 폭이 1000px 아래로 내려가면(예: 1280px 창에 AI 패널을 연 900px
  바) "back" · "Assistant" 글자를 먼저 숨긴다 — 창 폭이 아니라 **바의
  폭**으로 재는 container query 다. 그래서 1280px + AI 패널에서도 세
  그룹이 한 줄에 남는다(현재 페이지가 가장 긴 HIGHLIGHTS 여도).
  textContent 와 AI 버튼의 accessible name("AI Assistant")은 그대로다.

## 2. 왼쪽 패널 (현재 구현)

Select · Layers · Layout 이 같은 자리(`#studioLeftPanel`)를 나눠 쓴다.
**Images 와 Dock 도 같은 자리의 한 내용이지만 상단 버튼이 없다.** 각
section 안의 DOM 은 그 기능 파일이 처음 열 때 만들어 넣는다.

| 내용 | section | 들어가는 것 | 예전 모양 |
| --- | --- | --- | --- |
| Select | `#studioLeftPanelSelect` | Inspector 팝오버(`#studioInspectorPopover`) 그대로 | Preview 위에 뜨는 카드 |
| Images | `#studioLeftPanelImages` | `.images-panel-overlay` 그대로 | 화면 전체 modal → 상단 버튼도 없어졌다(§2-3) |
| Layers | `#studioLeftPanelLayers` | 트리와 **요소 추가 하위 화면**(`studio/inspector/studio-canvas-layers.js` · `studio-canvas-add-v2.js`) — 한 자리를 `data-layers-screen` 으로 번갈아 쓴다(계약 §35-1) | Select 패널 맨 위의 추가 자리 |
| Dock | `#studioLeftPanelDock` | `.dock-panel-overlay` 그대로 | 화면 전체 modal |

**Layers 에는 상단 버튼이 있고 Dock 에는 없다.** `STUDIO_LEFT_PANEL_MODES.dock.button`
이 `null` 이고, 그 자리를 여는 길은 둘이다 — Preview 안의 dock 을 누르는 것
(`PREVIEW_MSG_DOCK_SELECT`)과 admin SETTINGS > HOME 의 "화면 아래 Dock"
(`admin/settings/admin-bottom-dock-entry.js` → 같은 origin iframe 으로
`admin:open-studio-panel`). 뒤쪽은 **UI 진입점만** 옮긴 것이다 — `bottomDock`
데이터도 `setStudioBottomDock()` 도 Undo/Save 도 Studio 에 그대로 있고,
admin 문서에는 Dock 설정 폼이 없다.

Layers 는 들고 있는 사본이 없다 — 열 때마다 working draft 에서 트리를 다시
만들므로 떠날 때 할 일도 없다(§2-2 의 표에 줄이 필요하지 않다).

- 패널이 열려 있으면 shell 에 `.has-left-panel` 이 붙고
  `#studioPreviewStage` 의 left 가 `--studio-left-panel-width`(320px,
  1100px 이하 280px)만큼 밀린다. AI 패널의 `--studio-ai-panel-width`
  와 같은 방식이라 Preview 는 가려지지 않고, iframe 의 레이아웃 뷰포트가
  실제로 좁아지며, Mobile 축소 배율과 Inspector 테두리는 stage 의
  ResizeObserver 가 다시 계산한다.
- 패널은 바 **아래**에서 시작한다(바를 handle 로 접으면 맨 위까지).
- 기능 파일의 클래스 이름과 여닫기 표식(`hidden` ·
  `.dock-panel-overlay--open`)은 그대로다. 모양만
  `.studio-left-panel …` 선택자로 바꾼다. 자리가 없는 문서에서는 예전처럼
  modal/떠 있는 카드로 뜬다.

### 2-1. Select 는 모드이면서 패널 내용이다

- Select 를 누르면 Inspector 모드가 켜지고 패널이 Select 를 보여 준다.
- Images/Dock 으로 옮겨 가도 **모드는 끄지 않는다** — 끄면
  `clearStudioInspectorSelection()` 이 고른 요소를 지운다. 그래서 Select 로
  돌아오면 그 요소가 그대로다.
- Images/Dock 을 보다가 Select 를 누르면 패널만 Select 로 돌아온다(모드와
  고른 요소 유지). 그 밖의 경우 — Select 를 보여 주는 중이거나 패널이
  접혀 있을 때 — Select 는 예전처럼 **토글**이라 모드를 끈다.
- Preview 에서 요소를 누르면(같은 요소를 다시 눌러도) 패널이 Select 로
  열린다 — `revealStudioLeftPanelForSelection()`. 사용자의 클릭/탭에서
  온 select 메시지로만 불리고 좌표 갱신(rects)은 이 길을 지나지 않으므로,
  접어 둔 패널이 저절로 열리지는 않는다. 접어 둔 Select 내용을 다시 보는
  길이 이것이다.
- 버튼 상태: Select 의 `aria-pressed` = 모드, 세 버튼의 `aria-expanded`
  = 패널이 지금 그 내용을 보여 주는가.

### 2-2. 내용마다 떠날 때 하는 일이 다르다

| 내용 | 다른 내용으로 옮기거나 접을 때 | 다시 올 때 |
| --- | --- | --- |
| Select | 아무 일도 없다 | 그대로 |
| Images | 닫는다(상태가 없다 — "자리 하나" 표시도 이때 풀린다) | 목록을 새로 읽는다(예전 modal 과 같다) |
| Dock | **숨기기만** 한다 — 적용하지 않은 사본을 지킨다 | 그 사이 working draft revision 이 그대로면 사본 그대로, 바뀌었으면 새 사본 |

내용이 스스로 닫히면(Images 닫기 · Dock 적용/취소/지우기 · Escape) 그
파일이 `handleStudioLeftPanelContentClosed(mode)` 를 부른다. Select 모드가
켜져 있으면 패널은 Select 로 돌아가고(Images/Dock 은 그 위에 잠시 얹힌
내용이라 고른 요소가 다시 보인다), 꺼져 있으면 접힌다.

Images/Dock 의 Escape 는 패널이 **지금 그 내용을 보여 줄 때만** 동작한다
— Select 를 보는 동안의 Escape(선택 해제)가 숨은 Dock 사본을 버리지
않게.

Images · Layers · Dock 을 여는 입구는 전부 셸을 거친다
(`showStudioLeftPanelMode`): 상단 버튼, 직접 수정의 "이미지 변경",
Layers 의 사진 행, Preview 안 dock 누르기, 그리고 바깥(admin)에서 온
`admin:open-studio-panel`. 기능 파일의 open 함수를 직접 부르면 숨은
section 에 그려진다.

### 2-3. Images 는 "돌아갈 곳"을 들고 여는 하위 화면이다 (STUDIO-LAYERS-MEDIA-1)

여는 곳이 셋이고 셋 다 **어느 자리인지 알고** 연다.

| 여는 곳 | 무엇을 넘기나 | ← 가 돌아가는 곳 |
| --- | --- | --- |
| Layers 의 사진 행(사진 · 스티커 · 로고) | 그 행의 `props.slot` | Layers |
| Select 의 Quick Bar "이미지 변경" | 고른 요소의 슬롯 | Select(꺼져 있으면 Layers) |
| Layout 의 "로고 고르기" | 제목 로고 슬롯 | Layout |

- 셸이 `showStudioLeftPanelMode("images", { returnTo })` 로 그 값을
  들고 있고(`studioLeftPanelImagesReturnTo`), 패널 머리의 ← 는
  `getStudioImagesPanelReturn()` 이 알려 준 이름을 적는다. 닫기 ·
  Escape 도 같은 곳으로 간다(`returnFromStudioImagesPanel`).
- 모르는 이름이거나 값이 없으면 **Layers** 다 — Images 는 스스로 서는
  자리가 아니므로 어떤 옛 경로가 이름만으로 열어도 돌아갈 곳이 있는
  화면에 선다.
- 슬롯 이름과 함께 열리면 **그 자리 하나** 화면이다: 머리에 지금 사진의
  작은 미리보기와 "비우기", 본문에는 내 이미지 그리드만(슬롯 목록 열은
  접힌다). 슬롯 없이 열리면 예전 목록 화면이 폴백으로 남는다.
- 어느 화면에도 **기술적인 슬롯 이름(`canvas_photo_2` 등)을 적지
  않는다** — 사람이 읽는 `label` 만 쓴다.
- 넣기 · 비우기는 지금까지와 같은 `setStudioImageSlot()` 하나이고
  **Undo 한 칸**이다. DB 기록은 여전히 Save 뿐이다.

바깥에서 오는 메시지는 **부모가 보낸 것 · 같은 origin · 아는 모드 이름**
일 때만 받는다. 열 수 있는 자리는 목록(`STUDIO_OPENABLE_FROM_PARENT`)으로
묶어 두어 "아무 모드나 여는 창구"가 되지 않게 한다. Studio 가 막 떠서
working draft 가 아직 없으면 조용히 무시하고, admin 쪽이 짧은 간격으로
다시 보낸다 — Studio 가 실제로 연 뒤 `studio:panel-opened` 로 한 번
답하면 멈춘다(새 "준비됐다" 신호를 만들지 않는 가장 작은 방법).

### 2-3. Preview 위에 남는 것

> **DIRECT-UX-1 에서 더해진 것 → [IMORY_DIRECT_UX_DESIGN.md](./IMORY_DIRECT_UX_DESIGN.md).** 테두리 · 이름표 · 핸들에 더해 hover 이름표와 작은 Quick Bar(데스크톱은 선택 테두리 옆, 720px 이하는 시트 머리 한 줄 — §5-1)가 있다. 긴 폼은 여전히 Preview 위에 뜨지 않는다. 이름표의 문구는 사람이 읽는 이름(§2)이고, 이름표 · Quick Bar 는 Preview 프레임 밖으로 나가지 않는다.

떠 있던 긴 Inspector 카드는 없어졌다. Preview 위에는 셋만 남는다.

- 선택 테두리(`#studioInspectorSelectBox`, sandbox 스킨은 프레임 안에서)
- **요소 이름표**(`#studioInspectorSelectLabel`) — 팝오버 제목과 같은
  문구. 테두리 왼쪽 위 바깥에 붙고, 그 자리가 Preview 위쪽(또는 그 위를
  덮은 Top Dock) 밖이면 안쪽에 붙는다. 자유 배치 이동 손잡이가 같은
  모서리에 있으면 그 옆으로 비킨다. `pointer-events: none`.
- 이동·크기·자르기 핸들

팝오버 자리 계산(`placeStudioInspectorPopover` 와 그 보조 함수들 —
AI-6E §4 "손이 잡고 있는 동안 움직이지 않는다")은 지웠다. 팝오버가 패널
안에 있으므로 좌표 갱신으로 움직일 일이 없다.

## 3. 오른쪽 AI 패널 (현재 구현)

바뀐 것이 없다. 여닫기 · 폭 드래그 · Preview 클릭으로 접히지 않음
(AI-5A.1) 그대로이고, 왼쪽 패널과 **동시에** 열 수 있다 — 그때 stage 는
둘 사이다.

## 4. Undo / Redo (현재 구현)

이전에는 Studio 전체의 되돌리기가 없었다(Inspector 의 직전 직접 편집 한
번, AI 패널의 직전 AI 적용 한 번뿐). 상단 ↶ ↷ 는 새로 만든 **working
draft 변경 기록**이다(studio/studio-history.js).

- 기록하는 곳 — working draft 를 바꾸는 입구 넷이 바꾸기 직전 상태를
  한 칸씩 남긴다: `applyWorkingSkinChanges`(Code Apply · 직접 편집) ·
  `applyImportedSkinPackage`(Import · AI 적용 · AI 되돌리기) ·
  `setStudioBottomDock` · `setStudioImageSlot`. 한 칸 =
  `{ skin, imageSlots, isDirty, draftVersionId }`, 참조로 든다(네 입구
  모두 새 객체로 교체하고 제자리에서 고치지 않는다). 최대 50칸.
- 되돌리기도 같은 입구로 — `applyImportedSkinPackage(…, {
  preserveNavigation, dirty, imageSlotBindings })`, AI 되돌리기가 이미 쓰는
  경로다. 그래서 revision 이 오르고(늦게 온 AI 응답은 stale 로 버려진다)
  선택 복원 관문(`bumpStudioWorkingRevision`)을 그대로 지난다.
- dirty — AI 되돌리기와 같은 규칙. 그 칸을 기록한 뒤로 Save 가
  있었으면(draftVersionId 가 다르면) dirty, 없었으면 그때의 dirty.
- Save/Publish 진행 중에는 잠긴다. 다른 스킨을 불러오거나 다시 mount 하면
  비운다. 저장하지 않는다.
- 단축키 — Ctrl/⌘+Z · Ctrl/⌘+Shift+Z · Ctrl+Y. 입력칸 · textarea ·
  contenteditable · dialog 안에서는 가로채지 않는다(그 자리의 되돌리기가
  먼저다). Preview iframe 에 포커스가 있으면 이 문서에 키가 오지 않는다.
- 버튼 — `#studioUndoButton` / `#studioRedoButton`. 되돌릴 칸이 없거나
  Save/Publish 진행 중이면 `disabled`. tooltip(`title`)은
  "실행 취소 · Ctrl/⌘+Z" / "다시 실행 · Ctrl/⌘+Shift+Z", accessible name 은
  "실행 취소" / "다시 실행", `aria-keyshortcuts` 도 함께 적는다.

### 4-1. 되돌리는 곳은 하나다 (STUDIO-SHELL-1.1)

STUDIO-SHELL-1 까지는 Inspector 팝오버 아래 "되돌리기"(직전 직접 편집
한 번)와 AI 패널 상태 줄의 "되돌리기"(직전 AI 적용 한 번)가 상단 ↶ 와
**같은 일을 다른 자리에서** 했다. 1.1 에서 두 버튼을 걷었다.

- 걷은 것 — `#studioInspectorUndoButton`(studio-inspector-overlay.js 가
  만들던 버튼)과 `#studioAiDrawerUndo`(studio/index.html ·
  studio-lifecycle-scenario.html 의 마크업), 그 둘의 CSS.
- 남긴 것 — `undoStudioInspectorEdit()` · `studioInspectorUndo` 기록,
  `handleStudioAiUndo()` · `studioAiUndoSnapshot`. 누르는 버튼만 없다.
  버튼 변수가 `null` 인 자리는 전부 건너뛴다.
- AI 적용 → ↶ 는 AI 이전 draft, ↷ 는 **기록해 둔 AI 결과**를 다시 놓는다
  (AI 를 다시 부르지 않는다). AI 패널의 결과 문장은 그대로 남는다.

### 4-2. 한 칸이 되는 작업

한 칸 = working draft 입구가 한 번 불린 것. 아래는 e2e(`--only=units`)가
"칸 +1 · ↶ = 직전 draft · ↷ = 직후 draft 가 글자 단위로 같다"로 확인한다.

| 작업 | 입구 | 한 칸이 되는 시점 |
| --- | --- | --- |
| 직접 텍스트 수정 | applyWorkingSkinChanges | "적용" 한 번 |
| 요소 크기(이미지 모서리 드래그 · 슬라이더) | 〃 | 손을 뗄 때(`pointerup` · `change`) 한 번 — 끄는 동안은 Preview 임시 채널만 |
| 요소 이동(자유 배치 손잡이 드래그) | 〃 | 손을 뗄 때 한 번 |
| 이미지 교체(Images 패널 · Inspector "이미지 변경"도 이 패널로 온다) | setStudioImageSlot | 사진을 슬롯에 붙일 때 |
| Dock 설정 Apply | setStudioBottomDock | Apply 한 번 |
| Code 적용 | applyWorkingSkinChanges | Apply 한 번 |
| AI 변경 적용 | applyImportedSkinPackage | 응답이 검증을 지나 적용될 때 |
| Import 적용 | applyImportedSkinPackage | "Apply to Draft" 한 번 |

- 요소 **삭제 · 복제**는 Studio 에 직접 편집 도구로 없다(Code · AI ·
  Import 로 HTML 을 바꾸는 것뿐이고, 그러면 그 작업 한 칸이다). 이번
  라운드에서 만들지 않았다.
- 순서 ↑↓ · 배치 방식 · 전환 효과 · 스타일 컨트롤도 같은
  applyWorkingSkinChanges 한 번이라 한 칸이다(layout/transition e2e 의
  되돌리기 검사가 상단 ↶ 로 돈다).

### 4-3. Save / Publish 경계

- ↶ ↷ 는 working draft 만 바꾼다. **서버에는 아무 요청도 보내지 않는다**
  — 저장된 draft 도 공개본도 그대로다.
- 그 칸을 기록한 뒤로 Save 가 있었으면 되돌린 draft 는 저장본과 다르므로
  dirty 가 켜지고 Save 가 다시 열리며 Publish 는 잠긴다. 다시 Save 해야
  되돌린 draft 가 저장되고, 그 뒤에 Publish 해야 공개된다.
- Publish 는 draftVersionId 를 바꾸지 않는다(저장본을 공개본으로 가리킬
  뿐) — 그래서 Publish 뒤의 ↶ 도 같은 규칙이다: 공개본 그대로, draft 만
  이전, dirty. Publish 버튼 글자는 "Published" 인 채 잠긴다(저장하지 않은
  변경이 있다는 title 이 붙는다 — 편집 뒤와 같은 모양).

## 5. 좁은 화면 — 720px 이하 (현재 구현)

```
1줄: Select · Layers ………………… Save · Publish · ···
2줄: ← · 현재 페이지 · Desktop|Mobile · ↶ ↷ …………… AI
```

- 그룹 wrapper 는 `display: contents` 로 풀고 버튼마다 `order` 를 준다.
  줄바꿈은 바의 `::after`(폭 100%) 하나. 가로 스크롤은 없다 — 더 좁으면
  그 줄 안에서 다시 접힌다. "back" · "Assistant" 글자는 이 폭에서 숨는다
  (`.studio-label-wide`, textContent 는 그대로).
- ··· 는 `#studioTopDockFiles`(Code · Import · Export) 를 버튼 바로 아래
  세로 목록으로 띄운다. 메뉴 안 버튼을 누르거나 Escape · 바깥 누르기 ·
  Preview 누르기(창 blur)로 닫힌다.
- 왼쪽 패널은 화면 아래에서 올라오는 **시트**다. Preview 를 밀지 않는다.
  STUDIO-SHELL-1 에서는 높이 55% 하나였고 Preview 아래 절반을 늘 가렸다 —
  MOBILE-SHEET-1 에서 세 단계가 됐다(§5-1).
- AI 패널은 기존 overlay 그대로다. 이 폭에서는 둘이 서로를 가리므로
  하나를 열면 다른 하나가 숨는다. AI 때문에 숨은 시트는 AI 를 닫으면 같은
  내용 · 같은 단계로 돌아온다(그 사이 다른 시트를 열지 않았을 때).

## 5-1. 세 단계 시트 — MOBILE-SHEET-1 (현재 구현)

좁은 화면(셸의 기준 그대로 720px 이하 — 새 breakpoint 를 만들지 않았다)의
왼쪽 패널에만 적용한다. 넓은 화면의 왼쪽 패널(폭 · stage 밀림 · 머리 모양 ·
Quick Bar 자리)은 그대로다. 단계는 `studio/studio-sheet.js` 가 들고
`#studioLeftPanel[data-sheet-state]` 로 적는다. CSS 는 좁은 화면에서만 읽는다.

| 단계 | 높이(390×844 실측) | 보이는 것 |
| --- | --- | --- |
| 접힘 `peek` | 머리 한 줄 = 68px(손잡이 18 + 줄 44 + 여백 · 테두리) + `env(safe-area-inset-bottom)` | 손잡이 · 도구 이름(SELECT/IMAGES/BOTTOM DOCK) · 요소 이름 · Quick Bar · 펼치기 · 닫기. 본문은 높이 0 + `visibility:hidden` + `inert` |
| 내용 보기 `content` | 내용 높이만큼, 최대 `--studio-sheet-content-max` = min(화면의 52%, 남은 자리 − 56px) — 390×844 에서 439px. 넘치면 시트 안쪽만 스크롤 | 머리(접기 · 전체 화면 · 닫기) + 본문 |
| 전체 화면 `full` | 상단 도구 모음(바에 매달린 여닫기 탭까지) 아래 ~ 화면 아래(키보드 위) — 390×844 에서 742px(위 끝 102px = 바 86px + 여닫기 탭) | 머리(내리기 · 닫기) + 본문 |

- **본문을 display:none 으로 숨기지 않는다** — 높이만 0 이다. 그래서 입력하던
  값 · Images 목록 스크롤 · Dock 사본이 단계를 오가도 그대로다. 단계는 Undo
  기록 · dirty · working draft 에 닿지 않는다.
- **위 끝 · 아래 끝 · 최대 높이는 실측해서 CSS 변수로 적는다**(100vh 에 기대지
  않는다): `--studio-sheet-top` · `--studio-sheet-keyboard` ·
  `--studio-sheet-content-max` · 결과로 덮는 높이 `--studio-mobile-sheet-height`.
  `visualViewport` 가 키보드 높이를 알려 주면 시트 아래 끝이 키보드 위로
  올라간다(단계는 바꾸지 않는다 — 적용 · 취소가 키보드 뒤에 숨지 않는다).
  확대(pinch) 중에는 재지 않는다.
- **safe area** — 시트 아래 여백은 `env(safe-area-inset-bottom)`(키보드가 열려
  있으면 0). 이 문서는 `viewport-fit=cover` 를 선언하지 않아 지금은 0 이고
  Safari 가 그 자리를 비워 둔다 — 선언하게 되면 시트가 그대로 비켜 선다.

### 단계 바꾸기

- 버튼 — 펼치기(접힘 → 내용) · 전체 화면(내용 → 전체) · 접기(내용 → 접힘) ·
  내리기(전체 → 내용) · 닫기(✕, 넓은 화면의 ‹ 와 같은 버튼 — 좁은 화면에서
  모양과 이름 "편집 패널 닫기"만 바뀐다). 접힘에서 요소 이름을 눌러도 펼친다.
- 손잡이 — 손잡이 줄에서만 세로 끌기를 받는다(`touch-action:none` 은 거기만).
  끄는 동안 그 높이를 그대로 보여 준다. 24px 미만이면(빠르게 튕긴 게 아니면)
  단계 그대로. 놓으면 가장 가까운 단계로 정착하되, 충분히 움직였으면 적어도
  그 방향으로 한 단계. 접힘에서 아래로 끌면 닫힌다. 톡 누르면 접힘 ↔ 내용.
- Escape — 전체 → 내용 → 접힘. 접힘에서의 Escape 는 예전 규칙 그대로(Select 는
  선택 해제, Images/Dock 은 그 내용 닫기). Preview 안에서 누른 Escape(프레임이
  올려 보낸다)도 같다. 먼저 받는 것: 시트 밖 입력칸(AI · 코드 편집기) · Select
  글자 칸의 적용 전 초안 · 겹친 요소 메뉴 · 상단 ··· 메뉴 · Quick Bar ··· 목록 ·
  끌기/자르기 중 · dialog.
- 접근성 — 단계 버튼 둘 다 `aria-controls="studioLeftPanelBody"` ·
  `aria-expanded`(접힘이면 false). 단계가 바뀌면 화면 밖 한 줄
  (`#studioLeftPanelStatus`, aria-live)이 "SELECT · 내용 보기" 를 읽는다.
  접힐 때 포커스가 본문 안에 있으면 펼치기 버튼으로, 시트가 닫힐 때 시트 안에
  있으면 그 내용을 여는 상단 버튼으로 옮긴다.

### 패널별 기본 단계

| 무엇 | 단계 |
| --- | --- |
| Preview 에서 요소를 고름(다른 요소) | 접힘. 같은 요소를 다시 누르면 지금 단계 그대로 |
| 상단 Select(고른 것 없음) | 접힘(이름 자리에 "Preview에서 고칠 요소를 누르세요") |
| Preview 안 더블클릭 글자 편집 | 잠시 접힘 → 확정 · 취소하면 원래 단계 |
| Preview 에서 요소 옮기기 시작(본체 끌기 · 이동 손잡이) | 접힘. 놓은 뒤 다시 펼치지 않는다 |
| Images(Layers 의 사진 행 · Quick Bar 이미지 변경 · Layout 의 로고) | 내용 보기. 사진을 붙이면 **온 자리로 돌아간다**(Layers · Select · Layout — 그 자리 · 접힘). 넓은 화면에서는 그대로 머문다 |
| 상단 Layers | 내용 보기. 들고 있는 사본이 없어서 다시 열 때마다 지금 draft 그대로다 |
| Dock(Preview 의 dock · SETTINGS) | 내용 보기. **적용해도 닫지 않는다** — 적용한 값으로 사본을 새로 만들어 같은 자리 · 같은 스크롤에 다시 보여 준다(넓은 화면은 예전처럼 닫힌다) |
| AI 를 열었다 닫음 | AI 가 열린 동안 숨고, 닫으면 같은 내용 · 같은 단계 · 같은 선택 |

### Quick Bar — 시트 머리 한 줄

`#studioInspectorQuickBarSlot` 이 시트 머리에 있다(셸 문서가 두고, Inspector 는
그 자리가 있으면 새로 만들지 않는다). 아이콘만 · 칸마다 40×44 · 접근 이름과
tooltip. 머리 줄의 실제 폭에서 칸 수를 재어, 넘치면 자주 쓰는 것(이미지 변경 ·
AI로 수정 · 숨기기 · 앞으로 · 뒤로 순)만 직접 두고 나머지는 `···` 목록으로 **같은
버튼을 옮긴다**(복제하지 않는다). 가로 스크롤은 없다. 390px 접힘에서는 네 개까지
직접, 내용 보기(단계 버튼 둘)에서는 세 칸(둘 + ···). 목록은 시트 위 가장자리
위에 뜨고(전체 화면이면 머리 아래) 누르면 그 일을 하고 닫힌다.

### Preview 가림 방지

- 시트가 덮는 높이를 재어(`offsetTop` 기준 — 여닫는 미끄럼 중에도 자리 잡은
  뒤의 값) Preview 문서에 `"preview:viewport-inset" { bottom }`(프레임 CSS
  px — Mobile 축소 배율로 나눈다)으로 알린다.
- Preview 문서(`studio/preview/preview-sheet-inset.js`)는 자기 스크롤 끝에 그만큼
  `+16px` 의 여유를 둔다 — `<html>` 의 마지막 자식인 Studio 전용
  `<imory-studio-spacer>`(절대 위치 · 보이지 않음 · 누를 수 없음, `#previewRoot`
  밖). 그리고 `<html>` 에 `scroll-padding-bottom`. 스킨 HTML · 스킨 CSS ·
  SkinPackage · 공개 화면에는 아무것도 붙지 않는다. 그래서 짧은 페이지의 맨 아래
  요소도 시트를 닫지 않고 스크롤해 고를 수 있다.
- 여유는 줄어들 때 **지금 보고 있는 자리를 당기지 않는다** — 그 안까지 스크롤해
  있으면 그만큼 남기고, 사용자가 위로 스크롤하는 만큼 따라 줄어든다(시트를 접거나
  닫아도 Preview 가 튀지 않는다).
- `ensureSelectedElementVisibleAboveSheet()`(studio-sheet.js) — 시트가 커질 때 ·
  요소를 고를 때, 고른 요소가 시트(또는 상단 바)에 덮였으면 Preview 문서만
  `"preview:scroll-by" { top }` 로 **가려진 만큼** 스크롤한다(시트 위 12px 여백).
  이미 보이면 0 — 가운데로 맞추지 않는다. 요소가 보이는 띠보다 크면 48px 이상
  보일 때 그대로, 아니면 윗부분이 보이게. 전체 화면 · 손잡이를 끄는 중 · 요소를
  옮기는 중에는 움직이지 않는다. 보낸 스크롤이 좌표로 돌아오기 전에 한 번 더
  불려도 두 번 올리지 않는다.
- sandbox 스킨도 스크롤하는 것은 바깥 Preview 문서다(안쪽 프레임은 내용 높이만큼
  커진다) — 같은 길이다.

## 6. 앞으로 지켜야 할 원칙

- 기능 파일은 자기 DOM 을 만들고 자기 상태를 갖는다. **어디에 보일지**는
  셸이 정한다 — 기능 파일이 다른 기능의 여닫기를 직접 부르지 않는다.
- 새 편집 패널은 왼쪽 패널의 section 하나로 들어온다. 새 modal 을
  만들지 않는다(확인 dialog · Code/Import 편집기처럼 "그 순간에만 떠서
  답을 받는" 것은 예외).
- 같은 기능의 버튼을 두 자리에 두지 않는다. 좁은 화면에서 자리를 옮길
  때도 같은 요소의 모양만 바꾼다.
- working draft 를 바꾸는 새 입구를 만들면 capture/record 두 줄을 함께
  넣는다(studio-preview.js `captureStudioWorkingChange` /
  `recordStudioWorkingChange`). 빠지면 Undo 가 그 변경을 건너뛴다.

## 7. 남은 차이

- 현재 페이지 표시는 읽기 전용이다. 드롭다운으로 페이지를 고르려면 어느
  카테고리/글을 보여 줄지 정하는 규칙이 먼저 필요하다.
- 왼쪽 패널의 폭은 고정(320/280px)이다. AI 패널처럼 끌어서 바꾸지 않는다.
- Undo 기록은 working draft 만 본다. Preview 안 이동(HOME → POST 등)과
  Desktop/Mobile, 패널 여닫기는 기록하지 않는다.
- ~~Inspector 의 "되돌리기"가 상단 Undo 와 겹친다~~ → 1.1 에서 걷었다(§4-1).
- 기록은 문서가 살아 있는 동안만 있다. 새로고침하면 ↶ 할 것이 없다(저장된
  draft 로 다시 시작한다).
- Preview iframe 안에 포커스가 있으면 단축키가 이 문서에 오지 않는다 —
  Preview 를 누른 직후에는 버튼으로 되돌린다.
- 좁은 화면에서 AI 패널을 연 채로 ↶ 가 가려지지 않는지는 ai-panel e2e H2
  가 본다. 실기기(iPhone Safari) 확인은 아직 없다.
- (MOBILE-SHEET-1) 키보드 대응은 Playwright 에서 `visualViewport` 를 흉내 내어
  확인했다(Chromium · WebKit 모두 실제 가상 키보드가 없다). iOS Safari 가 입력칸에
  포커스를 줄 때 화면을 밀어 올리는 동작 · 실제 홈 표시줄 · 주소창 접힘과의
  조합은 **실기기 확인 전**이다.
- (MOBILE-SHEET-1) 스킨이 문서 대신 자기 상자(`body { overflow:auto;
  height:100% }` 등)를 스크롤 주인으로 만들면 Preview 여유와 "시트 위로 올리기"가
  그 상자에는 닿지 않는다(표시 공간 계약은 문서 스크롤이 기준이다).
- (MOBILE-SHEET-1) 시트 높이는 단계 사이에서 애니메이션하지 않는다(여닫기의 미끄럼만
  있다). 손잡이를 끄는 동안에는 손을 따라간다.
- (MOBILE-SHEET-1) 전체 화면에서 상단 바를 여닫기 탭으로 접으면 시트 위 끝도 따라
  올라간다(탭 아래). 탭 자체는 가리지 않는다.
