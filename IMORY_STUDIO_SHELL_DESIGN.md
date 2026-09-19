# Imory Skin Studio Shell — 기준 문서 (STUDIO-SHELL-1 · 1.1)

Skin Studio 화면의 **정보 구조**: 상단 도구 모음의 세 그룹, 왼쪽 편집
패널, 오른쪽 AI 패널, 좁은 화면. 기능 동작(배치 엔진 · 전환 primitive ·
Bottom Dock 데이터 · AI 요청 · SkinPackage · Save/Publish · 선택 복원 ·
공개 렌더)은 이 라운드에서 바꾸지 않았다.

이 문서는 "현재 구현" · "앞으로 지켜야 할 원칙" · "남은 차이"를 구분해
적는다(CLAUDE.md §5).

| 무엇 | 어디 |
| --- | --- |
| 마크업(상단 바 · 왼쪽 패널) | [studio/index.html](./studio/index.html) · 같은 모양을 [studio/studio-lifecycle-scenario.html](./studio/studio-lifecycle-scenario.html) 이 비춘다 |
| 왼쪽 패널 여닫기 · 내용 바꾸기 · ··· 메뉴 · 현재 페이지 표시 | [studio/studio-shell.js](./studio/studio-shell.js) |
| 모양(세 그룹 · 패널 · 좁은 화면) | [studio/studio-shell.css](./studio/studio-shell.css) |
| Undo/Redo 기록 | [studio/studio-history.js](./studio/studio-history.js) |
| E2E | `node studio/studio-shell-e2e-test.mjs` (8968, `--browser=webkit` 도 돈다) |

---

## 1. 화면 구조 (현재 구현)

```
[ ← · Select · Images · Dock | 현재 페이지 · Desktop|Mobile · ↶ ↷ | Code · Import|Export · Save · Publish · AI ]
[ 왼쪽 패널 ][                 Preview stage                 ][ AI 패널 ]
```

- **왼쪽 그룹** — 나가기(← back)와 왼쪽 패널을 여는 셋.
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

Select · Images · Dock 이 같은 자리(`#studioLeftPanel`)를 나눠 쓴다. 각
section 안의 DOM 은 그 기능 파일이 처음 열 때 만들어 넣는다.

| 내용 | section | 들어가는 것 | 예전 모양 |
| --- | --- | --- | --- |
| Select | `#studioLeftPanelSelect` | Inspector 팝오버(`#studioInspectorPopover`) 그대로 | Preview 위에 뜨는 카드 |
| Images | `#studioLeftPanelImages` | `.images-panel-overlay` 그대로 | 화면 전체 modal |
| Dock | `#studioLeftPanelDock` | `.dock-panel-overlay` 그대로 | 화면 전체 modal |

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
| Images | 닫는다(상태가 없다) | 목록을 새로 읽는다(예전 modal 과 같다) |
| Dock | **숨기기만** 한다 — 적용하지 않은 사본을 지킨다 | 그 사이 working draft revision 이 그대로면 사본 그대로, 바뀌었으면 새 사본 |

내용이 스스로 닫히면(Images 닫기 · Dock 적용/취소/지우기 · Escape) 그
파일이 `handleStudioLeftPanelContentClosed(mode)` 를 부른다. Select 모드가
켜져 있으면 패널은 Select 로 돌아가고(Images/Dock 은 그 위에 잠시 얹힌
내용이라 고른 요소가 다시 보인다), 꺼져 있으면 접힌다.

Images/Dock 의 Escape 는 패널이 **지금 그 내용을 보여 줄 때만** 동작한다
— Select 를 보는 동안의 Escape(선택 해제)가 숨은 Dock 사본을 버리지
않게.

Images · Dock 을 여는 입구는 전부 셸을 거친다(`showStudioLeftPanelMode`):
상단 버튼, 직접 수정의 "이미지 변경", Preview 안 dock 누르기. 기능
파일의 open 함수를 직접 부르면 숨은 section 에 그려진다.

### 2-3. Preview 위에 남는 것

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
1줄: Select · Images · Dock ………… Save · Publish · ···
2줄: ← · 현재 페이지 · Desktop|Mobile · ↶ ↷ …………… AI
```

- 그룹 wrapper 는 `display: contents` 로 풀고 버튼마다 `order` 를 준다.
  줄바꿈은 바의 `::after`(폭 100%) 하나. 가로 스크롤은 없다 — 더 좁으면
  그 줄 안에서 다시 접힌다. "back" · "Assistant" 글자는 이 폭에서 숨는다
  (`.studio-label-wide`, textContent 는 그대로).
- ··· 는 `#studioTopDockFiles`(Code · Import · Export) 를 버튼 바로 아래
  세로 목록으로 띄운다. 메뉴 안 버튼을 누르거나 Escape · 바깥 누르기 ·
  Preview 누르기(창 blur)로 닫힌다.
- 왼쪽 패널은 화면 아래에서 올라오는 **시트**(높이 55%)다. Preview 를
  밀지 않고 위쪽이 보이므로 Select 로 요소를 계속 고를 수 있다.
- AI 패널은 기존 overlay 그대로다. 이 폭에서는 둘이 서로를 가리므로
  하나를 열면 다른 하나가 접힌다.

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
