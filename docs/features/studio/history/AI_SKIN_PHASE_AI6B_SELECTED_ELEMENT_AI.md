# PHASE AI-6B — Selected Element AI Edit

Element Inspector에서 고른 요소 하나를 AI Assistant의 요청에 연결해,
"이 폴더만 조금 납작하게" 같은 **국소 AI 수정**을 할 수 있게 한 단계.

이 문서는 이 라운드의 **기록**이다(CLAUDE.md §5). 계속 지켜야 하는 계약은
3·5·6·7절에, 아직 못 한 것은 10절(남은 차이)에 있다.

[PHASE AI-6A](./AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md) §10-1("Selected
Element AI 실제 호출이 없다")이 이 라운드에서 해소됐다.

> **후속**: 이 라운드의 프롬프트 계약 중 `capabilities` / `elementType` 해설과
> "지원 불가" 규칙의 범위는
> [PHASE AI-6B.1](./AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md) §1-2에서
> 바뀌었다. 실패 응답에는 `code`가 추가됐다(같은 문서 §5).

---

## 1. 이번 라운드의 경계

| 했다 | 하지 않았다 |
| --- | --- |
| 선택 요소를 AI 요청에 연결(`selectionContext`) | partial patch / template-only 응답 프로토콜 |
| AI 패널의 선택 chip(사람이 읽는 라벨 + 선택 해제) | capability manifest · unsupported request 백로그 |
| 서버 검증(shape + editId 실재 확인, fail closed) | multi-turn chat history · history timeline |
| selected-edit 시스템 프롬프트 계약 | prompt/DB 로그 저장 · DB migration |
| 선택 유지/해제 규칙, stale 방어, Undo 연동 | 새 OpenAI 모델 변경 · Dynamic imageSlot |

입력은 지금까지처럼 **SkinPackage 전체**이고 출력도 SkinPackage 전체다
(요구사항 20절) — 선택 요소 때문에 계약을 바꾸지 않았다.

---

## 2. 진입점 — "✦ AI 수정" 버튼

Inspector 팝오버의 `[직접 수정] [✦ AI 수정]` 중 뒤쪽. 누르면:

1. 선택을 그대로 유지한 채
2. AI Assistant 패널을 열고(`window.setStudioAiPanelOpen(true)`)
3. 패널 맨 위에 선택 chip을 그리고
4. `#studioAiDrawerInput`에 포커스를 준다.

**이 버튼은 OpenAI를 부르지 않는다.** 실제 호출은 사용자가 문장을 쓰고
Send를 눌렀을 때 한 번이다(요구사항 1절, e2e 검사 A2).

패널이 이미 열려 있으면 `setStudioAiPanelOpen()`이 조기 반환하므로 포커스는
`handleStudioInspectorAiRequest()`가 한 번 더 직접 준다 — 두 번 눌러도
결과가 같다.

---

## 3. selectionContext — 실제 shape

`studio/ai/studio-ai-selection.js` `buildStudioAiSelectionContext()`가
만들고, 서버가 필드별로 다시 검증해 **새 객체로** 만들어 프롬프트에 싣는다.

```json
{
  "template": "home",
  "editId": "e0-2-1",
  "elementType": "container",
  "tagName": "div",
  "label": "HOME · 영역 · 감싸는 영역",
  "binding": null,
  "imageSlot": null,
  "hrefBinding": null,
  "region": null,
  "repeat": null,
  "insideRepeat": false,
  "capabilities": ["color", "background", "border", "padding"]
}
```

- `template` — `home | category | post | banner`
- `editId` — `data-imory-edit-id` 값(`^[A-Za-z][A-Za-z0-9_-]{0,63}$`)
- `elementType` — `text | image | link | container` (= Inspector의 `kind`)
- `label` — 사람이 읽는 한 줄. chip과 같은 문자열
- `binding` / `hrefBinding` / `repeat` — `data-imory-bind` / `-href` / `-repeat`
- `region` — `post-body` 또는 null
- `insideRepeat` — 반복 목록 안에 있는가

**넣지 않는 것**: DOM node, rendered HTML, computed style, 주변 게시글 실제
데이터, 그리고 **classNames**. 클래스 이름을 보여주면 모델이 그 공용 클래스를
고쳐 같은 클래스를 쓰는 요소가 전부 함께 바뀌기 쉽다(7절이 막으려는 것).

### 왜 요청 SkinPackage에 식별자를 심는가

Inspector의 편집 식별자는 **임시**다 — Preview로 나가는 사본에만 찍히고
SkinPackage에는 남지 않는다(AI-6A §2). 그래서 editId만 보내면 모델이 받은
SkinPackage 안에는 그런 속성이 없어 타깃을 찾을 수 없다.

`buildStudioAiSelectionPackage(skinPackage, selectionContext)`가 요청에
실을 **사본**을 만든다: 선택 요소 하나에만 id를 심고(Direct Edit이 저장
시점에 하는 것과 같은 `stampInspectorEditIds` → `commitInspectorEditId`),
나머지 임시 id는 전부 걷어낸다. 그래서 요청 body의 template html에는
`data-imory-edit-id`가 **정확히 하나** 있다(e2e 검사 E3).

working draft는 이 시점에 바뀌지 않는다 — revision도 그대로이므로 stale
판정에도 영향이 없다. 응답을 실제로 적용할 때 그 id가 함께 들어오고, 그래서
재렌더 뒤에도 같은 요소가 선택된 채로 남는다(8절).

---

## 4. request body — backward compatible

```
{ instruction, skinPackage, images?, selectionContext? }
```

키를 넣는 **순서**를 `buildStudioAiRequestBody()` 한 곳에서 지킨다. 선택도
첨부도 없는 요청은 PHASE AI-2와, 첨부만 있는 요청은 PHASE AI-4와 바이트까지
같은 body로 나간다(e2e 검사 D/F, 서버 검사 F1~F3).

`selectionContext`가 없거나 `null`이면 서버 경로 전체가 예전과 동일하게
돈다 — 시스템 프롬프트도 글자 하나 다르지 않다.

---

## 5. 서버 검증 (`functions/api/skin-ai.js`)

`validateSkinAiSelectionContext(value, skinPackage)`. 통과하지 못한 요청은
**OpenAI를 0회 호출**하고 400으로 끝난다.

- 객체인가 / **모르는 키가 섞여 있지 않은가**(fail closed)
- `template`·`elementType`·`region`은 허용값 목록
- `editId`·`imageSlot`은 식별자 패턴, `tagName`은 `^[a-z][a-z0-9]{0,15}$`
- `binding`·`hrefBinding`·`repeat`은 dotted path 패턴
- `capabilities`는 알려진 이름만, 개수 상한
- `label`은 제어문자를 공백으로 접고 80자에서 자른다 — 프롬프트에 그대로
  들어가므로 줄을 갈라 "계약처럼 보이는 문장"을 끼워 넣지 못하게 한다
- 통과한 값도 그대로 흘려보내지 않고 **필드별로 새 객체를 만든다**

### editId 실재 확인 — 새 parser를 만들지 않았다

가장 중요한 관문. `selectionContext.editId`가 그 template html에 정말
있는지 서버가 확인하고, 없으면 400이다(요구사항 5절, e2e 검사 H1~H3).

확인 방법은 `html.indexOf('data-imory-edit-id="<editId>"')` 문자열 검색
하나다. editId 패턴이 따옴표/꺾쇠/공백을 허용하지 않으므로 안전하고, 닫는
따옴표까지 포함하므로 `"e0-2"`가 `"e0-21"`에 걸리지 않는다. Workers
런타임에는 DOMParser가 없고, 이 한 가지를 확인하자고 서버에 두 번째 HTML
파서를 들이지 않았다.

**한계**: 서버가 정리하는 `templates.*`만 본다. `templates` 없이 top-level
`html`만 있는 예전 HOME-only SkinPackage는 애초에 client가 선택 요청을
만들지 않는다(10절-2).

---

## 6. selected-edit 시스템 프롬프트 계약

`buildSkinAiSystemPrompt(hasReferenceImages, hasSelection)`. 선택이 있을
때만 `## Selected element editing` 절이 붙고, **참고 이미지 절보다 뒤에**
온다 — 이미지가 있어도 선택 범위가 이긴다(요구사항 15절 우선순위,
서버 검사 Q2).

핵심 규칙:

1. 요청은 기본적으로 **그 요소에 대한 것**으로 읽는다. "조금 더 작게"는
   페이지도 형제도 다른 template도 아니다.
2. 그 요소를 직접 지탱하는 **최소 부모 구조**까지만 함께 손댈 수 있다.
3. 사용자가 명시적으로 확대하지 않는 한 범위를 넓히지 않는다.
4. HOME 요소를 고칠 때 CATEGORY/POST html은 byte 단위로 그대로 돌려준다.
5. 선택 요소의 `data-imory-edit-id`를 **유지**한다(잃으면 사용자가 선택을
   잃는다 — 8절).
6. 선택 요소 안의 runtime binding을 유지한다.
7. imageSlot / owner·admin href / protected region 보호는 기존 계약 그대로.
8. 안전하게 수행할 수 없으면 **다른 요소를 대신 고쳐 흉내 내지 않는다** —
   아무 것도 바꾸지 않고 summary로 말한다.
9. `summary`는 선택 요소 기준으로 쓴다("선택한 카테고리 폴더의 …") —
   "스킨을 업데이트했어요"만 반복하지 않는다(요구사항 18절).

반복 목록(`data-imory-repeat`) 안의 요소는 항목 전부가 같은 마크업에서
그려지므로 "하나만" 고를 수 없다는 사실도 계약에 적어 두었다.

---

## 7. 선택 요소 CSS/HTML 수정 전략

모델에게 요구하는 선택자는 Direct Edit이 쓰는 것과 **같다**:

```css
[data-imory-edit-id="e0-2-1"][data-imory-edit-id="e0-2-1"] { ... }
```

- 같은 속성 선택자를 두 번 겹쳐 기존 클래스 규칙을 이긴다
  (`buildInspectorEditSelector`, AI-6A §7).
- 기본 규칙은 요소당 **하나**, stylesheet 맨 뒤에. 상태 규칙(`:hover`,
  `:focus-visible`, media query)은 같은 선택자에 상태만 덧붙인다.
- 공용 class(`.folder`, `.card` …)를 고쳐 선택 요소 하나를 바꾸는 것을
  금지한다 — 그 클래스를 쓰는 요소가 전부 함께 바뀐다.
- 새 random class를 만들지 않는다.

**Direct Edit과 충돌하지 않는다.** `readInspectorEditDeclarations()`는 이
선택자의 기본 규칙을 그대로 읽고, `writeInspectorEditDeclarations()`는 바꾼
속성만 병합해 다시 쓴다 — AI가 쓴 다른 선언은 보존된다. `:hover` 같은 상태
규칙은 선택자 뒤에 `:hover`가 붙어 있어 그 정규식에 걸리지 않으므로 Direct
Edit이 건드리지 않는다.

구조 변경도 허용한다(요구사항 8절) — 선택 요소 **subtree 안쪽**의 안전한
재구성 + 필요한 CSS. 바깥 형제 / 다른 template / runtime binding /
protected region은 최소 변경이다.

hover·transition·shadow·opacity·animation은 이 모드의 대표 용도라 허용하되
JS event handler는 금지다(sanitizer가 어차피 지운다).

---

## 8. 선택 유지 / 해제 규칙

- **Inspector가 source of truth다.** 선택 상태의 복사본을 AI 쪽에 두지
  않는다. Inspector는 선택이 바뀔 때마다 window 이벤트
  `"studio-inspector-selection"`을 쏘고, chip은 그때마다
  `window.getStudioInspectorSelection()`을 다시 읽는다.
- chip의 ×는 `window.clearStudioInspectorSelection()`을 부를 뿐이고, chip이
  사라지는 것은 그 결과로 오는 이벤트 때문이다. Escape로 풀어도 같다.
- **AI 적용 후**: 응답 html에 그 editId가 남아 있으면 선택이 그대로
  유지된다(Preview가 id로 되살린다 — `inspectorReviveSelection`). 바로
  이어서 "조금만 더 작게"를 보낼 수 있다.
- **AI가 그 요소를 지웠으면** 선택만 조용히 풀린다. 오류가 아니다.

### 왜 "id가 남아 있는가"를 따로 확인해야 했나

임시 편집 id는 **구조상 위치**로 만들어진다(`"e0-0"` = 첫 자식의 첫 자식).
AI가 그 요소를 지우면 다음 렌더에서 **뒤 요소가 같은 위치로 밀려와 같은
id를 물려받는다** — 되살리기는 성공하지만 엉뚱한 요소가 선택된 채로 남는다.

그래서 적용 직후 `reconcileStudioAiSelection(selectionContext)`가 응답
SkinPackage의 html에 심어 보낸 id가 글자로 남아 있는지 보고, 없으면 선택을
푼다. 되돌리기 뒤에는 부르지 않는다 — 복원된 SkinPackage에는 애초에 심은
id가 없고 구조가 요청 전과 완전히 같으므로 임시 id가 같은 요소에 다시 찍힌다.

### 이 라운드에서 함께 고친 버그 — Preview selection 메시지 ping-pong

`studio/preview/preview-bridge.js`의 `setInspectorSelection()`은 부모가
시켜서 바꾼 선택까지 부모로 다시 올려보내고 있었다. 그 값이 `null`이면
부모의 `clearStudioInspectorSelection()`이 다시 프레임으로 `null`을
내려보내 **메시지가 무한히 오갔다**. 값이 같아 화면은 멀쩡해 보이지만, 그
사이 사용자가 새 요소를 고르면 뒤늦게 도착한 `null` 하나가 방금 잡은 선택을
지운다 — "선택을 풀고 곧바로 다른 요소를 고르는" 흐름(AI chip의 ×)에서 실제로
그랬다. 부모가 시킨 선택은 부모가 이미 알고 있으므로
`setInspectorSelection(el, { silent: true })`로 되돌려 보내지 않는다.

---

## 9. stale response / Undo

- **선택 UI 상태와 working skin revision을 구분한다**(요구사항 11절).
  요청 도중 사용자가 다른 요소를 골라도 진행 중 요청의 타깃은 바뀌지 않는다 —
  `selectionContext`/`selectionPackage`는 전송 시점 snapshot이고, 그 요청은
  끝까지 그 값으로 완료된다(e2e 검사 T).
- 그 사이 **working SkinPackage가 바뀌었으면**(Code Apply / Import /
  Direct Edit / 다른 AI 결과 / imageSlot 변경) 기존
  `studioWorkingRevision` 방어가 그대로 돈다 — 늦게 온 결과는 적용되지
  않는다(e2e 검사 U).
- **Undo**는 기존 1-step 흐름 그대로다. 복원되는 것은 요청 **전**의
  SkinPackage(= 식별자를 심지 않은 원본)이고, dirty도 그때 값으로 돌아간다.
  구조가 같으므로 선택은 유지된다. Direct Edit undo와 AI undo를 하나의
  history로 합치는 것은 여전히 다음 Phase다.
- 선택 요소 AI 수정도 `dirty=true` / Save 활성이다. 자동 Save는 없다.

---

## 10. 남은 차이

1. **토큰 절약을 하지 않았다.** 선택 요소여도 SkinPackage 전체를 보내고
   전체를 받는다(요구사항 20절이 명시적으로 요구한 바). partial patch /
   template-only 응답은 실사용 안정성 확인 후 별도 Phase.
2. **templates 없는 legacy HOME-only 스킨에서는 선택 AI 수정을 쓸 수 없다.**
   서버가 그런 요청의 `templates`를 `{}`로 정리해 보내므로 심은 식별자가
   모델에게 도달하지 않는다. client가 미리 알아채고
   "선택한 요소를 스킨에서 찾지 못했어요"로 끝낸다 — 전체 스킨 수정으로
   몰래 바꿔치기하지 않는다(6절-8).
3. **unsupported request 피드백이 없다.** 모델이 "못 한다"고 판단하면
   summary 한 줄로만 알 수 있다. Structured Output에 `limitations`를 넣는
   것은 capability Phase로 미뤘다(요구사항 17절).
4. **반복 목록 안의 요소는 항목 하나만 고를 수 없다.** 계약에 사실로
   적어 두었을 뿐, 제품 기능으로 풀지 않았다.
5. **모델의 실제 판단은 자동 테스트로 확인하지 않는다.** 유료 호출이
   금지되어 있으므로, 테스트가 확인하는 것은 (a) 모델에게 무엇을 보냈는가와
   (b) 모델이 무엇을 돌려줘도 우리 쪽이 안전한가 두 가지다. "선택한 것만
   바꾸더라"는 실제 호출로 확인해야 한다.
6. **chip 라벨과 Inspector 팝오버 제목이 서로 다른 함수다.** 팝오버는
   "무엇을 직접 수정할 수 있는가"를 설명하느라 태그 이름을 보여주고, chip은
   "무엇을 골랐는가"만 말한다(요구사항 2절이 chip에만 요구한 것).

---

## 11. 테스트

`studio/studio-selected-ai-e2e-test.mjs` (포트 8940, `?scenario=y`).
**실제 OpenAI 호출 0회** — `api.openai.com`으로 나가는 fetch는 전부
가로채고, 가로채지 못한 요청은 예외로 실패시킨다.

```
node studio/studio-selected-ai-e2e-test.mjs
node studio/studio-selected-ai-e2e-test.mjs --only=server
```

`--only=` 이름: `server / chip / send / apply / route / undo / images`.

서버 섹션은 브라우저 없이 `functions/api/skin-ai.js`의 `onRequest()`를
직접 부른다. 브라우저 섹션은 `/api/skin-ai` 요청을 가로채 **진짜**
`onRequest()`에 넘기므로, Inspector 선택부터 Preview 재렌더까지 저장소의
실제 코드가 그대로 돈다.

함께 돌린 회귀: `studio/studio-inspector-e2e-test.mjs`(34/34),
`studio/studio-ai-panel-e2e-test.mjs`(125/125),
`studio/studio-ai-panel-layout-e2e-test.mjs`(82/82),
`skin/skin-published-frame-e2e-test.mjs`(64/64),
`skin/skin-banner-page-e2e-test.mjs`(216/216),
`skin/skin-write-manage-e2e-test.mjs`(143/143) — 뒤 셋은
`preview-bridge.js`를 함께 쓰기 때문이다(8절의 ping-pong 수정).
