# DIRECT-UX-1 — 클릭하고 바로 고치는 Select

Skin Studio 의 Select 모드를 "누르고 → 이름을 보고 → 끌거나 두 번 눌러
고치고 → 큰 변화는 AI/Code" 로 바꾼 라운드의 기준 문서다.

| 구분 | 내용 |
| --- | --- |
| 현재 구현 | §1 ~ §15 전부(아래 각 절의 "현재 구현") |
| 조사만 | §16 반응형 적용 범위 — 안전한 계약이 없어 **만들지 않았다** |
| 바꾸지 않은 것 | 배치 엔진 · 전환 primitive · SkinPackage 구조 · AI 응답 형식 · Code 편집기 · Import/Export 형식 · Bottom Dock 구조 · 요소 삭제/복제(없다) · 글 본문 데이터 |
| e2e | `studio/studio-direct-ux-e2e-test.mjs` (8969, 시나리오 `?scenario=dux`) |

관련 문서: [IMORY_STUDIO_SHELL_DESIGN.md](./IMORY_STUDIO_SHELL_DESIGN.md)(셸 · 왼쪽 패널 · Undo/Redo) ·
[AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md](./docs/ai-skin/AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md)(식별자 · patch 방식) ·
[IMORY_LAYOUT_PRIMITIVE_DESIGN.md](./IMORY_LAYOUT_PRIMITIVE_DESIGN.md) ·
[IMORY_TRANSITION_PRIMITIVE_DESIGN.md](./IMORY_TRANSITION_PRIMITIVE_DESIGN.md)

---

## 파일

| 파일 | 하는 일 |
| --- | --- |
| `skin/skin-inspect-target.js` | **선택 우선순위** 규칙(`inspectorSelectionRank` · `pickInspectableAtPoint`) — "무엇을 고를 수 있는가"와 같은 파일 |
| `studio/preview/preview-inspect-direct.js` | Preview(native) 안의 손 — 자리로 고르기 · 겹친 후보 올리기 · 바깥 영역 · 더블클릭 글자 편집 · 본체 끌기 · 커서 표식 |
| `studio/inspector/studio-inspector-names.js` | 사람이 읽는 **요소 이름**과 종류 — 패널 · 이름표 · 메뉴 · AI 가 같은 함수 |
| `studio/inspector/studio-inspector-quickbar.js` | Quick Bar · 겹친 요소 메뉴 · hover 이름표 · 숨기기 · 앞으로/뒤로 · 이미지 변경 · 바깥 영역 |
| `studio/inspector/studio-inspector-fields.js` | 종류별 항목 목록(`buildStudioInspectorControls`) · 기타 절(표시 · 투명도 · 앞뒤) · 움직임 효과 상태 줄 · 개발/테스트 스위치 |
| `studio/inspector/studio-inspector-controls.js` | 폼의 틀(행 그리기 · 컨트롤 분기 · 패널 전체 다시 그리기) · 머리(이름 · 종류 · 페이지) · 예전 목록(`buildStudioInspectorAdvancedControls`) |
| `studio/inspector/studio-inspector-text.js` | 더블클릭 편집의 Studio 쪽(`handleStudioInspectorInlineText`) |
| `studio/inspector/studio-inspector-layout.js` | 본체 끌기를 기존 이동 엔진에 잇기(`handleStudioInspectorFrameDrag`) |
| `studio/ai/studio-ai-suggestions.js` | AI 빠른 제안 |
| `studio/studio-save-status.js` | 저장 · 공개 상태 한 줄 |
| `studio/studio-coach.js` | 처음 쓰는 사람 안내 세 걸음 · 사용법 다시 보기 |

Preview ↔ Studio 메시지(새로 생긴 것, 전부 `preview:inspect-*` / `preview:inspector-*` 이름 공간):

| 방향 | type | 내용 |
| --- | --- | --- |
| Preview → Studio | `preview:inspect-pick` | 한 자리에 겹친 후보 `{ point, candidates:[{ editId, tagName, rect, visibleRect, outer, current }] }` |
| Preview → Studio | `preview:inspect-text` | 더블클릭 편집 `{ phase: begin/input/commit/cancel, editId, text }` |
| Preview → Studio | `preview:inspect-drag` | 본체 끌기 `{ phase: start/move/end/cancel, x, y }`(프레임 좌표) |
| Studio → Preview | `preview:inspector-caps` | `{ editId, movable, textEditable }` — Studio 가 draft 에서 정한다 |
| Studio → Preview | `preview:inspector-choose` | 겹친 요소 메뉴에서 고른 칸의 순번 |
| Studio → Preview | `preview:inspector-parent` | 바깥 영역 선택 |

---

## §1 선택 우선순위

**현재 구현.** 실제 포인터 클릭(`event.isTrusted`)은 눌린 **자리**의 요소 전부
(`document.elementsFromPoint`)를 보고 아래 순위로 나눈다
(`skin/skin-inspect-target.js`).

| 순위 | 이름 | 판정 |
| --- | --- | --- |
| 1 | text | 자식 요소가 없고 글자 · `data-imory-bind` · 글자 태그 |
| 2 | image | img · svg · picture · video · canvas |
| 3 | link | a · button |
| 4 | component | 반복 항목 · region · dock · slot · 배치/전환/패널 속성 · 반복을 담은 목록 · nav/ul/ol/li/article/figure/form/table · **배경/테두리/그림자를 스스로 그리는 상자** |
| 5 | container | 아무 것도 그리지 않는 단순 래퍼 |
| 6 | page | 렌더 루트의 자식 · 그 안에서 자식이 하나뿐인 래퍼 사슬 · 루트와 거의 같은 크기 |

- 일반 클릭은 1~4 중 **맨 위에 그려진 것**을 고른다. 투명한 덮개(장식 층)가 위에
  있어도 밑의 글자가 잡힌다 — 예전에는 덮개나 래퍼가 잡혔다.
- 1~4 가 하나도 없는 자리(5·6 만 있는 자리)는 **빈 곳**이다 → 선택 해제.
- 5·6 은 "바깥 영역 선택"과 겹친 요소 메뉴의 맨 아래 칸으로만 고른다.
- 합성 이벤트(좌표 없는 `dispatchEvent`)는 예전 규칙(눌린 노드에서 가장 가까운
  요소)이다. 기존 e2e 의 합성 클릭이 그대로 동작하는 이유이고, 새 규칙은
  진짜 포인터로만 잰다(`--only=priority` P1b 가 두 규칙의 차이를 대조군으로 둔다).

**바깥 영역 선택**(`#studioInspectorOuterButton`). 프레임이 **지금 고른 그
복제본**에서 위로 한 칸 올라간다(반복 항목은 식별자가 같아서 식별자로 찾으면
첫 항목으로 튄다). 크기가 같은 래퍼는 건너뛴다(눌러도 아무 것도 안 바뀐 것처럼
보이므로). 더 올라갈 곳이 없으면(템플릿 맨 바깥) 버튼이 없다.

## §2 의미 있는 요소 이름

**현재 구현.** `studio/inspector/studio-inspector-names.js` 하나가 만든다. 근거의
순서: region → dock 자리 → 바인딩(bind/src/href) → 반복(무엇의 목록인가, 그
목록을 담은 상자) → 템플릿 맨 바깥 = **배경** → 태그의 일반 이름 → 종류 이름.

예: `site.title` → 홈 이름 · `profile.bio` → 소개 문구 · `profile.avatarUrl` /
`images.profile` → 프로필 이미지 · `images.<슬롯>` → 저자가 적은 슬롯 이름표 ·
`navigation.postCategories` 반복 → 카테고리 메뉴 항목, 그것을 담은 상자 →
카테고리 메뉴 · `home.recentPosts` → 글 카드 / 최근 글 목록 · 갤러리 · Highlight ·
Banner · Bottom Dock · `post-body` → 글 본문.

근거가 없으면 종류 이름(텍스트 · 이미지 · 버튼 · 링크 · 영역 · 장식 요소)이다.
태그 · 클래스 · 바인딩 경로 · 편집 식별자 · selector 는 화면에 나오지 않는다
(패널 안내문의 `${bindPath}` 문구도 걷었다).

같은 이름을 쓰는 자리: 패널 머리 · Preview 선택 이름표 · hover 이름표 · 겹친 요소
메뉴 · AI chip · `selectionContext.label`(`window.getStudioInspectorSelection().name`).

## §3 Hover 와 선택 표시

**현재 구현.** hover: 얇은 테두리 + 이름표(`#studioInspectorHoverLabel`) + 손가락
커서(프레임이 `data-imory-inspector-hover` 표식을 붙이고 preview-frame.html 의
CSS 가 커서만 바꾼다 — Preview 사본이라 저장되지 않는다). 고를 수 없는 자리는
기본 커서다. 선택: 테두리 · 이름표 · 이동 손잡이(자유 배치) · 크기 핸들(이미지)
· Quick Bar. 긴 폼은 Preview 위에 뜨지 않는다(STUDIO-SHELL-1 그대로). Esc 와
빈 곳 클릭은 선택 해제, 패널 머리에 "선택 해제" 버튼.

## §4 겹친 요소

**현재 구현.** 한 자리에 **서로를 담지 않는** 후보가 둘 이상이면 고르지 않고
"무엇을 선택할까요?" 메뉴를 띄운다. 제목이 카드 안에 있는 것은 겹침이 아니라
한 사슬이라 메뉴 없이 제목을 고른다(모든 클릭이 묻는 클릭이 되지 않게).

- 후보는 1~4 순위만(단순 래퍼를 늘어놓지 않는다), 최대 여섯, 그 아래 한 칸이
  "바깥 영역 · (이름)". 지금 선택은 "선택됨"으로 표시.
- 칸에 포인터를 올리면 그 후보의 자리를 Preview 에 비춘다.
- 이름을 붙일 수 있는 후보가 하나뿐이면 묻지 않고 그것을 고른다.
- 메뉴 밖 클릭 · Esc 로 닫힌다(Esc 는 메뉴만 닫고 선택은 그대로).
- 좁은 화면(≤720px)에서는 아래에서 올라오는 시트.

## §5 텍스트 직접 편집

**현재 구현.** 고른 글자를 두 번 누르면 프레임이 그 요소를 잠깐
`contenteditable="plaintext-only"`(안 되는 브라우저는 `true` + 글자만 붙여넣기)로
연다. 저장되는 것은 그 DOM 이 **아니다** — 문구만 올라오고 Studio 가 기존 확정
경로(`commitStudioInspectorTextDraft` → `commitStudioInspectorText` →
`applyStudioInspectorPatch`)로 쓴다. 그래서 규칙이 textarea 편집과 같다.

- 입력 중에는 기록 0 · draft 불변. 패널의 textarea 가 같은 문구로 따라간다.
- Ctrl/⌘+Enter 또는 포커스를 잃으면 적용(↶ 한 칸). Escape 는 취소(원래 문구 ·
  선택 유지 — 프레임의 Escape 알림을 이때는 올리지 않는다).
- 여는 조건은 Studio 가 draft 에서 정한 `capabilities.text`(바인딩 · 보호 영역 ·
  자식 있는 요소는 열리지 않는다). commit 이 와도 한 번 더 거른다.
- 링크 글자를 고치는 동안의 클릭은 커서만 옮긴다 — 페이지 이동 없음.
- 문구는 노드에서 직접 읽는다(`innerText` 는 `text-transform` 을 적용해 버린다).
- 빈 값은 기존 규칙 그대로(허용).

## §6 이미지 직접 변경

**현재 구현.** 이미지를 고르면 Quick Bar 에 "이미지 변경". 누르면 기존 Images
패널이 **그 이미지의 슬롯을 고른 채** 열린다(`window.setSkinImagesPanelSlot`).
연결은 지금처럼 카드의 "이 슬롯에 연결"이고 `setStudioImageSlot` = ↶ 한 칸.
템플릿 HTML/CSS 는 바뀌지 않으므로 배치 · 전환 · 크기 · 자르기 값이 그대로다.
URL 입력칸은 일반 패널에 없다(Code 로).

## §7 직접 이동과 크기 조절

**현재 구현.** 자유 배치 안의 요소는 ✥ 손잡이뿐 아니라 **본체**를 끌어도
움직인다. 포인터는 프레임 안에 있으므로 프레임이 좌표만 올리고
(`preview:inspect-drag`, 4px 문턱), Studio 가 그 좌표를 자기 좌표로 옮겨
손잡이 드래그와 **같은 함수**(`begin/move/endStudioInspectorLayoutDrag`)에 넣는다.
끄는 동안은 임시 미리보기, 놓으면 한 번 확정(↶ 한 칸). 문턱보다 작은 흔들림은
클릭이고, 제자리로 돌아온 끌기는 확정하지 않는다.

- 크기 조절은 기존 모서리 핸들(이미지) 그대로.
- **고친 버그**: 이동 중 임시 미리보기가 프레임에 닿지 않았다(메시지에 `editId`
  가 없었고, `postInspectorPreviewToFrame` 의 필드 목록에 `layoutPosition` 이
  빠져 있었다). 그래서 끄는 동안 요소가 제자리에 있다가 놓을 때 뛰었다.
- 화면 밖으로 사라지는 자리: 자유 배치 좌표는 부모 안쪽 상자의 0~1 비율로
  잘리므로 끌기로는 컨테이너 밖으로 나갈 수 없다. 경고 UI 는 만들지 않았다.
- 정렬선 · 스냅은 만들지 않았다(§남은 차이).
- 격자/세로 배치의 자식은 끌어서 옮기지 않는다 — 순서는 앞으로/뒤로(§8)다.

## §8 Quick Bar

**현재 구현.** 데스크톱: 선택 테두리 오른쪽 위 **바깥**(자리가 없으면 아래,
그것도 없으면 안쪽), Preview 프레임 안으로 눌러 넣는다. 좁은 화면: 요소 근처가
아니라 Select 시트 **머리 한 줄**(`#studioInspectorQuickBarSlot` — MOBILE-SHEET-1
에서 시트 본문 맨 위에서 머리로 옮겼다, 접힌 시트에서도 보여야 해서). 그 줄에
안 들어가면 자주 쓰는 것(이미지 변경 · AI로 수정 · 숨기기 순)만 직접 두고 나머지는
`···` 목록으로 **같은 버튼을 옮긴다**(IMORY_STUDIO_SHELL_DESIGN.md §5-1). 모든
버튼에 tooltip.

| 버튼 | 하는 일 | 기존 경로 |
| --- | --- | --- |
| 이미지 변경 | 이미지일 때만 | §6 |
| 앞으로 / 뒤로 | 자유 배치 안: 겹침 순서 `data-imory-item-z` ±1. 순서를 읽는 배치 안: 형제 사이 한 칸("순서 앞으로/뒤로") | `commitStudioInspectorLayoutItemParam` · `moveStudioInspectorLayoutChild` |
| 숨기기 / 보이기 | 이 요소 규칙의 `display:none` 한 줄 | `applyStudioInspectorPatch` |
| AI로 수정 | AI Assistant 를 열고 선택 유지 · 전송하지 않음 | `handleStudioInspectorAiRequest`(id `studioInspectorAiButton` 을 잇는다) |

삭제 · 복제는 없다. 숨긴 요소는 **Select 모드의 Preview 에서만** 흐리게(점선)
보인다 — 다시 골라 "보이기"로 돌릴 수 있어야 하므로. 그 처리는 Preview 로 나가는
사본의 CSS 에만 한다(`studioInspectorGhostHiddenCss`, `stampSkinForInspector`).
Select 를 끄면 공개 화면처럼 사라진다. 자른 이미지는 사진이 아니라 프레임을
숨긴다. 이미지 정렬이 쓰던 `display:block` 은 보이기에서 되살린다.

## §9 Select 패널

> **COMMON-SELECT-BOX-1 에서 차례가 바뀌었다 → §20.** 아래 표는 DIRECT-UX-1
> 당시의 항목이다. 지금 패널은 색이 아니라 **상자**(크기 · 자리 · 여백)에서
> 시작하고, 색 셋은 맨 아래 접힘 절이다. 머리(이름 · 종류 · 페이지 ·
> 바깥 영역 선택 · 선택 해제)와 아래 규칙들은 그대로다.

**현재 구현.** "직접 수정 | ✦ AI 수정" 탭은 없다 — 항목이 늘 펼쳐져 있다.
머리: 이름 · 종류 · 페이지 · [바깥 영역 선택] · [선택 해제]. 그 아래 종류별 항목만:

| 종류 | 항목 |
| --- | --- |
| 텍스트 | 내용 · 글꼴(고딕/명조/고정폭) · 글자 크기 · 굵기 · 글자색 · 정렬 |
| 이미지 | 이미지(변경/제거) · 너비 · 맞춤(공간 채우기/이미지 전체 보기, 자른 이미지는 없음) · 자르기 · 모서리 · 정렬 |
| 버튼·링크 | 표시 문구 · 이동할 곳 · 글자색 · 배경색 · 테두리 · 모서리 |
| 영역 | 배경색 · 글자색 · 안쪽 여백 · 테두리 · 모서리 |
| 기타(공통) | 표시(보이기/숨기기) · 투명도 · 앞뒤(가능할 때만) |

- 값이 없는 칸에는 "기본" 버튼이 없다 — 값이 있을 때만 그 칸을 되돌리는 버튼.
  색 칸이 비어 있으면 사선으로 "지정 안 됨".
- 새 스타일 컨트롤 셋(투명도 · 글꼴 · 맞춤)은 `buildInspectorStylePatch` 의 열거된
  값만 받는다(자유 문자열 CSS 입구 없음).
- 영역의 "글자색"은 요구 목록에 없던 것을 더했다 — 목록 · 카드의 글자를 하나씩
  고르지 않고 한 번에 바꾸는 가장 흔한 편집이고, §17 의 값 보존 흐름("격자 +
  효과 요소에서 글자색만")이 그 칸을 쓴다.
- `getStudioInspectorState().editingOpen` 은 "항목이 보이는가"의 뜻으로 남는다
  (sandbox 스킨에서만 false).

## §10 · §11 일반 UI 에서 숨긴 배치 · 전환 설정

**현재 구현.** 배치 방식 · 열 수(태블릿/모바일) · 간격 · 줄 간격 · 칸 최소 폭 ·
접히는 폭 · 좁을 때 · 교차/주 정렬 · 최대 폭 · 최소 높이 · 넘칠 때 · 좌표 숫자 ·
전환 효과 · 속도 · 방향 · 움직임 칸을 그리지 않는다. 효과가 있는 요소에는
"움직임 효과 적용됨 [미리보기]" 한 줄(미리보기는 한 번 재생, 값 불변).

**숨긴 값의 보존 방식.** 모든 확정이 그 요소의 **해당 속성 한 줄**만 바꾼다:
스타일은 `[data-imory-edit-id=X]…` 규칙에서 그 컨트롤이 소유한 선언만 병합
(`mergeStudioInspectorDeclarations`), 배치/전환은 HTML 속성 하나. 폼 전체를
직렬화하지 않으므로 숨긴 속성은 읽히지도 쓰이지도 않는다. e2e `--only=preserve`
가 "격자 + 효과 요소 → 글자색 → Save → 새로 열기 → Preview" 와 AI/Code/Import
조합을 본다.

**개발/테스트 스위치.** `window.IMORY_STUDIO_ADVANCED_INSPECTOR = true` 면 예전
목록(배치 · 전환 폼 포함)을 그린다. 화면에 켜는 곳은 없다. 배치/전환 엔진 e2e
(`studio-layout` · `studio-transition`)가 그 폼으로 엔진을 두드리려고 켠다.

## §12 사용자 용어

내부 저장 키와 화면 문구는 분리돼 있다: object-fit cover/contain → 공간 채우기 /
이미지 전체 보기 · z → 앞으로/뒤로 · border-radius → 모서리 · padding → 안쪽 여백 ·
opacity → 투명도 · transition → 움직임 효과. selector 는 어디에도 표시하지 않는다.

## §13 AI 빠른 제안

**현재 구현.** AI Assistant 가 열려 있고 요소를 골라 두었으면 선택 chip 밑에
최대 넷(`#studioAiSuggestions`). 이름 · 종류로 고른다: 이미지 / 카테고리 메뉴 /
배경 / 목록 / 텍스트 / 버튼 / 영역. 누르면 입력칸에 **넣기만** 한다(비어 있으면
그 문구, 쓰던 글이 있으면 뒤에 붙임). 전송하지 않는다. 종류를 모르면 줄을 숨긴다.

## §14 저장 · 공개 상태

**현재 구현.** Save 바로 앞 `#studioSaveStatus`: 저장됨 · 저장하지 않은 변경사항 ·
저장됐지만 아직 공개되지 않음 · 저장 중… · 공개 중… · 저장 실패 · 공개 실패.
값은 전부 studio-preview.js 의 기존 상태에서 읽고, 따로 기억하는 것은 "마지막
시도가 실패했는가" 하나(그 파일의 catch 가 알려 준다). 점 모양과 문구가 함께
말한다. 바가 1440px 보다 좁으면 짧은 문구(저장 안 됨 · 공개 전 …)이고 긴
문구는 title / aria-label 에 있다 — 1280px 에서 오른쪽 그룹에 긴 문구가 들어갈
자리가 없다(같은 이유).

## §15 최초 사용 안내

**현재 구현.** 스킨이 처음 올라오면 세 걸음 말풍선(Preview 두 번 · AI 버튼 밑).
화면을 덮지 않는다 — 말풍선 밖은 그대로 눌린다. 끝내거나 건너뛰면
`localStorage["imory.studio.coach.v1"]="done"`(설정 저장 방식이 따로 없는 개인
편의). 다시 보기: 넓은 화면은 왼쪽 그룹(Select · Images · Dock 옆)의 `?`
(`#studioHelpButtonWide`), 좁은 화면은 ··· 메뉴의 "사용법 다시 보기"
(`#studioHelpButton`). 오른쪽 그룹에 두지 않은 이유: 1280px 에서 이미 폭이
거의 꽉 차 있어, 넘치면 가운데 그룹이 바 정중앙을 잃는다(shell e2e A5). 시험 문서
(`studio-lifecycle-scenario.html`)는 `IMORY_STUDIO_COACH_AUTOSTART=false` 로 자동
시작을 끈다 — 주소에 `coach=1` 을 붙이면 production 처럼 뜬다.

## §16 반응형 적용 범위 — 조사 결과 (만들지 않았다)

| 질문 | 답 |
| --- | --- |
| Desktop/Mobile 위치가 따로 저장되는가 | **아니다.** 자유 배치의 `data-imory-item-x/y/width/height/z` 는 뷰포트와 무관한 값 하나다. 부모 안쪽 상자의 비율이라 폭이 바뀌면 함께 줄어들 뿐이다 |
| breakpoint override 계약이 있는가 | 격자의 `columns-tablet` · `columns-mobile`, 사이드바의 `collapse` · `mobile` 뿐이다(열 수와 접힘). 위치 · 크기 · 스타일의 override 는 없다 |
| 직접 이동 시 다른 뷰포트에는 | Mobile Preview 에서 끌어도 **모든 화면**의 값이 바뀐다(같은 속성 하나) |
| 직접 편집 CSS 는 | `[data-imory-edit-id=X][…]{…}` 규칙 하나 — `@media` 형태가 없다. `readInspectorEditDeclarations` 는 첫 규칙만 읽고 `write…` 는 그 규칙을 통째로 바꾼다 |
| AI/Code/Import 와 충돌 | 스킨 CSS 의 `@media` 는 AI/Code 가 쓴다. 직접 편집 규칙은 specificity 0,3,0 으로 그 위에 선다 — 화면별 값을 넣을 자리가 없다 |

그래서 "모든 화면에 적용 / 현재 화면만 적용 · Mobile 별도 배치 표시 · 화면 밖
요소 가져오기"는 만들지 않았다. 만들려면 필요한 계약:

1. 자유 배치 자식의 화면별 좌표 — 예: `data-imory-item-x-mobile` 등을
   `SKIN_LAYOUT_ITEM_RULES` 에 더하고, 컴파일러가 `--imory-it-x-m` 을 쓰고
   `skin-layout.css` 가 720px `@media` 에서 읽는다(sanitizer 허용 목록 · 감사 ·
   AI 프롬프트 계약 · Import/Export 왕복을 함께).
2. 직접 편집 CSS 의 화면별 규칙 — `@media (max-width: 720px) { [data-imory-edit-id=X]… }`
   를 읽고 쓰는 짝 함수와, 그 규칙을 Code 편집기에서 알아볼 수 있는 모양.
3. Studio 의 "지금 보고 있는 화면" = Desktop/Mobile 토글과 공개 화면 breakpoint
   (720px)의 일치 규칙.
4. "화면 밖" 판정 — 자유 배치는 비율로 잘려 밖으로 못 나가므로, 스킨 CSS(음수
   여백 · transform)가 밀어낸 경우만 남는다. 그 복구는 스킨 CSS 를 고치는 일이라
   AI/Code 몫이다.

## §17 · §18 값 보존과 History

모든 새 동작은 기존 입구(`applyStudioInspectorPatch` → `applyStudioDirectEdit` →
`applyWorkingSkinChanges`, 또는 `setStudioImageSlot`)를 지나므로 상단 ↶ 에 **한
번 = 한 칸**으로 쌓인다. 입력 중 글자 · 끄는 중 프레임은 임시 채널만 쓴다.
↶ ↷ 뒤 선택은 기존 선택 복원 관문(`reconcileStudioInspectorSelection`)이 지킨다
— 편집으로 승격된 식별자 또는 고를 때의 지문으로.

## §19 모바일(390px)

Select 패널은 아래 시트 — MOBILE-SHEET-1 부터 세 단계(접힘 · 내용 보기 · 전체 화면,
IMORY_STUDIO_SHELL_DESIGN.md §5-1)이고 요소를 고르면 접힘으로 시작한다. Quick Bar
는 시트 머리 한 줄. 겹친 요소 메뉴는 아래 시트. 선택 · hover 이름표는 Preview 프레임 밖으로 나가지 않게 가로 위치를 눌러
넣는다(예전에는 오른쪽 끝 요소에서 최대 60px 삐져나갈 수 있었다). 가로 넘침 0
(e2e `--only=narrow`).

## §20 Select 패널의 상자 — 크기 · 자리 · 여백 (COMMON-SELECT-BOX-1)

**왜.** 사람이 화면을 고칠 때 먼저 정하는 것은 "이게 얼마나 크고 · 어디에
놓이고 · 안의 글자가 어떻게 서는가"다. 그런데 §9 의 패널은 색과 글꼴로
시작해서, 가장 흔한 편집을 AI 나 Code 로 보내고 있었다. 색을 지우지는
않았다 — 맨 아래 접힘 절로 내렸다(Layout 에서 정한 테마색을 그대로 쓰는
것이 기본이고, 여기 색은 이 요소 하나에만 거는 덮어쓰기다).

**현재 구현 — 아홉 절의 차례.**

| # | 절 | 항목 |
| --- | --- | --- |
| 1 | 크기 | 가로(자동 · 내용 맞춤 · 부모 폭 맞춤 · 직접 입력) · 세로(자동 · 최소 높이 · 직접 입력) |
| 2 | 상자 위치 | 왼쪽 · 가운데 · 오른쪽 · 폭 채우기 |
| 3 | 내용 정렬 | 가로(왼쪽 · 가운데 · 오른쪽) · 세로(위 · 가운데 · 아래) |
| 4 | 여백 | 안쪽 여백(전체 + 네 방향) · 바깥 간격(위 · 아래 · 좌우) |
| 5 | 요소별 기능 | 내용 · 이동할 곳 · 이미지 · 맞춤 · 자르기 |
| 6 | 타이포그래피 | 글꼴 · 글자 크기 · 굵기 |
| 7 | 테두리 · 모서리 | 없음/있음 · 굵기 · 모서리 둥글기 |
| 8 | 표시 · 투명도 | 표시 · 투명도 · 앞뒤 |
| 9 | 색상 · 꾸미기 | **접힘** — 글자색 · 배경색 · 테두리 색 |

**상자 위치와 내용 정렬은 한 벌이 아니다.** 버튼 모양이 닮았다고 합치면
"가운데 놓인 상자 안에서 글자는 왼쪽"을 만들 수 없다. 건드리는 속성부터
다르다 — 자리는 `margin`, 정렬은 `text-align` / `justify-*` / `align-*`
계열이다. 한 속성의 주인은 언제나 하나여서 두 컨트롤이 서로를 덮지 않는다
(`studio/inspector/studio-inspector-box-model.js` 의 표).

**그 요소에 실제로 듣는 것만 그린다.** 무엇을 그릴지는 짐작이 아니라
**화면에서 잰 값**이 정한다 — 프레임이 보내는 `display` · `position` ·
`flexDirection`(`inspectorMetricsOf`)을 `studioInspectorBoxInfo()` 가 읽는다.

| 잰 값 | 빠지는 칸 |
| --- | --- |
| `display: inline` · `contents` | 가로 · 세로 · 상자 위치 · 내용 정렬 · 바깥 간격 |
| `position: absolute` · `fixed` | 상자 위치 · 바깥 간격(자리는 배치가 정한다) |
| 이미지 | 안쪽 여백 · 상자 가로(너비는 이미지 자신의 칸이 갖는다) |
| 보호 영역(post-body 등) | 전부 |

**슬라이더 · 숫자 · 손잡이는 한 값이다.** 셋 다
`previewStudioInspectorBoxSize()` / `commitStudioInspectorBoxSize()` 둘을
지난다. 끄는 동안은 임시 채널(§17)만 쓰고 손을 뗐을 때 한 번 확정하므로,
드래그 한 번이 상단 ↶ 한 칸이다. Preview 위의 손잡이는 이미지의 것과 같은
넷 + 좌우(`w` · `e`) + **위아래(`n` · `s`)**이고, 어느 쪽 드래그인지는
`beginStudioInspectorAnyHandleDrag()` 가 가른다 — 이미지의 높이는 비율이
정하므로 위아래 손잡이는 상자에만 나온다.

**크기 · 자리 · 여백만 `!important` 다.** 스킨은 제 자리를 대개 특정도 높은
선택자로 정한다(`.ied-photos[data-imory-photos-layout="hero"] .ied-caption`
= 0,3,0). 직접 수정 규칙은 0,2,0 이라 그대로는 **숫자만 바뀌고 화면은
그대로**다 — 사용자가 "무효"라고 느끼는 자리다. 자르기
(IMORY_IMAGE_CROP_PRIORITY_DESIGN.md)와 "사진 영역 너비"(§16 of
IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md)가 이미 같은 판단을 했다. 색 · 글꼴
같은 기존 컨트롤의 무게는 **바꾸지 않았다** — 바꾸면 이미 저장된 스킨의
그림이 달라진다. 읽을 때는 표식을 떼고 보므로 예전에 `!important` 없이
저장된 값도 그대로 읽힌다.

**임시 미리보기도 같은 무게로.** 끄는 동안 보이는 그림이 확정 뒤와 같으려면
임시 선언도 `!important` 여야 한다. 부모의 `INSPECTOR_PREVIEW_STYLE_PROPERTIES`
와 프레임의 `INSPECTOR_PREVIEW_BOX_PROPERTIES` 가 **아는 이름만** 통과시키고,
값은 두 곳 모두 같은 모양 검사를 지난다(자유 문자열 CSS 입구 없음).

**저장 · History.** 새 컨트롤도 기존 입구
(`applyStudioInspectorPatch` → `applyStudioDirectEdit`)를 지나므로 §17 · §18
그대로다 — 그 컨트롤이 소유한 선언만 병합되고, 숨긴 배치 · 전환 값(§10 ·
§11)은 한 글자도 건드려지지 않는다.

**테스트.** `studio/studio-direct-ux-e2e-test.mjs --only=fields`(아홉 절의
차례 · 종류별로 빠지는 칸) · `studio/studio-direct-edit-e2e-test.mjs`(내용
칸은 글꼴 · 색보다 앞 · 이미지 아닌 요소에서 손잡이의 주인이 상자로 바뀐다)
· `studio/studio-inspector-e2e-test.mjs`(테두리 없음/있음 뒤에 굵기).

---

## 남은 차이

- ~~**sandbox 스킨**의 프레임 안 Select 는 예전 hit-test 규칙이다~~ →
  **SANDBOX-SELECT-PARITY-1 에서 닫았다**(IMORY_SANDBOX_SKIN_DESIGN.md §S). 프레임도
  같은 우선순위 · 겹친 요소 메뉴 · 바깥 영역 · 더블클릭 · 본체 끌기 · 패널 항목 ·
  Quick Bar 를 쓴다(`skin/sandbox/skin-sandbox-inspect-direct.js`). sandbox 에서만
  남은 차이는 **이미지 크기 조절 · 자르기**다(§S-7).
- ~~**390px 에서 아래 시트가 Preview 아래쪽 절반을 덮는다**~~ → **MOBILE-SHEET-1
  에서 닫았다**(IMORY_STUDIO_SHELL_DESIGN.md §5-1). 고르면 접힘(약 68px)이고,
  시트가 열리면 Preview 문서 끝에 Studio 전용 여유가 생겨 짧은 페이지의 맨 아래
  요소도 시트를 닫지 않고 스크롤해 고른다. 펼치면 고른 요소가 가려진 만큼만
  Preview 가 스크롤된다.
- 정렬선 · 스냅 · 끌어서 형제 순서 바꾸기(격자/세로)는 없다.
- 상자 값은 **한 벌**이다(§20) — Desktop 과 Mobile 에 다른 크기를 주는 칸은
  없다. 반응형은 §16 의 조사 결과 그대로 만들지 않았다.
- **sandbox 프레임에서는 "실제로 듣는 칸만" 판정이 절반이다**(§20). 프레임이
  올려보내는 `metrics` 는 숫자 넷(요소 폭·높이 · 부모 안쪽 폭·높이)뿐이고
  `display` · `position` 은 그 계약에 없다(`isSandboxInspectMetrics` 가 숫자만
  받는다). 그래서 프레임 안에서는 inline 요소에도 가로 · 바깥 간격 칸이 나올
  수 있다 — 확정되는 규칙 자체는 native 와 같고, 그 요소에 안 듣는 선언일
  뿐이다. 닫으려면 INSPECT 메시지 계약에 문자열 셋을 더해야 한다
  (IMORY_SANDBOX_SKIN_DESIGN.md §S).
- 배경 **이미지**(영역의 background-image)는 일반 패널에 없다 — `url()` 을 받는
  입구를 만들지 않았다. AI/Code 로.
- 요소의 "버튼" 판정은 클래스 이름(btn · button · cta) · 관리 링크 · 토글/dock
  속성뿐이다(계산 스타일을 보지 않는다 — 이름은 draft 사본에서 만든다).
- 안내 말풍선의 완료 기록은 기기별(localStorage)이다.
