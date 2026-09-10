# PHASE AI-6B.1 — Selected Element AI 실패 원인 추적 + 진단

production에서 선택 요소 AI 수정이 서로 다른 요청에서 모두 generic error로
끝난 건에 대한 조사와, 다음번에는 **어느 단계에서 왜 끊겼는지 말할 수 있게**
만든 기록이다.

전제: [PHASE AI-6B](./AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md)의 계약을
바꾸지 않는다. 실제 OpenAI 유료 호출은 이 라운드에서 한 번도 하지 않았다.

---

## 0. 먼저 확인한 사실 — AI-6B는 배포되어 있지 않다

```
HEAD = 330b542 "feat: add element inspector and direct editing to Skin Studio"
studio/ai/studio-ai-selection.js  -> HEAD에 없음(untracked)
studio/inspector/studio-inspector.js (HEAD) -> "다음 단계에서 지원됩니다" toast 그대로
```

즉 **production이 돌리고 있는 것은 PHASE AI-6A**다. 그 빌드의 "✦ AI 수정"은
패널을 열고 chip을 보여줄 뿐이고, `selectionContext`는 요청에 실리지 않는다.

그래서 사례 1·2의 실제 요청은 **선택 정보가 전혀 없는 "전체 스킨 수정"**이었다.
모델은 "선택한 반복 폴더 요소"가 무엇인지 알 방법이 없는 채로 4개 template과
CSS 전체를 다시 써야 했다. 이 사실이 두 사례의 배경이다.

다만 그 배경만으로 "그래서 정상"이라고 넘길 수는 없다 — 아래 1~3절이 실제로
남아 있던 결함이고, 이 라운드에서 고쳤다.

---

## 1. 사례 1의 실패 원인

### 1-1. 파이프라인 자체는 정상이다 (S1~S12 실측)

production 스킨(quiet-frame v4)의 CATEGORY 목록 구조를 축소한 fixture
(`studio-lifecycle-scenario.html?scenario=f`)로 실제 브라우저에서 재현했다.
CATEGORY 반복 목록의 **세 번째** 렌더 항목 안 `span.f-folder`를 골랐을 때:

```
selectionContext.template   "category"
             .editId        "e0-0-1-1-1-0-0-0"
             .elementType   "text"
             .tagName       "span"
             .repeat        null
             .insideRepeat  true

요청 package templates.category.html 안의 그 editId 출현 횟수   1
요청 package templates.category.html 안의 전체 edit-id 속성 수  1

찍힌 source 경로
  div.f-page > div.f-frame > div.f-layout > main.f-main
    > ul.f-post-list > li.f-post-item[repeat=category.posts]
      > a.f-post-link > span.f-folder
```

**S1(선택 포착)과 S2(식별자 심기)는 정확하다.** 그리고 그 결과가 실제로
동작하는 것까지 확인했다 — 그 하나의 CSS 규칙이 렌더된 **세 항목 전부**에
걸리고(검사 B4), 공용 `.f-folder` / `.f-post-item` 규칙은 그대로이며(B5),
HOME/POST template은 byte 단위로 불변이다(B6).

즉 **사례 1은 현재 계약으로 지원 가능한 요청이 맞다**(요구사항 6절). 기능
한계가 아니다.

### 1-2. 남아 있던 진짜 결함 — `capabilities`가 모델을 거절 쪽으로 밀었다

`selectionContext.capabilities`는 **Direct Edit 폼이 그릴 수 있는 컨트롤
목록**이다(`describeInspectorElement`). `kind`가 `"text"`인 요소는
`typography / color / align`만 갖고 `size / border / padding / background`는
갖지 않는다 — "AI가 그 속성을 바꾸면 안 된다"는 뜻이 **전혀 아니고**
"폼에 그 입력칸을 그리지 않는다"는 뜻일 뿐이다.

그런데 AI-6B의 프롬프트는 그 필드가 무엇인지 한 번도 설명하지 않았고, 바로
아래에 이런 문장이 있었다:

> If the request cannot be carried out safely on the selected element within
> these rules, change nothing about it and say so plainly in the summary.

좁은 목록 + 강한 금지 문장이 함께 오면, 모델이 목록 밖 속성을 요구하는 요청을
"허용되지 않은 것"으로 읽을 유인이 생긴다. 사례 1의 요청이 정확히 그것이다 —
`elementType: "text"` / `capabilities: [text, typography, color, align]`인 요소에
**가로폭과 높이**를 바꿔 달라는 요청.

고친 내용(`buildSkinAiSystemPrompt`):

- `elementType`은 대략적인 분류이고 **바꿀 수 있는 CSS 속성을 제한하지 않는다**
- `capabilities`는 Studio의 비-AI 편집 폼이 무엇을 제공하는지일 뿐이고
  **권한 목록이 아니다**
- "못 하겠으면 하지 마라" 규칙의 적용 범위를 **런타임 계약으로 표현 불가능한
  것**(JS 필요, 뒤로가기, 목록에 없는 binding)으로 좁히고,
  "크기·여백·색·테두리·배치 같은 평범한 시각 요청은 여기 해당하지 않는다.
  수행하라"를 명시

이것은 실제 호출 없이 확인할 수 없는 **가설이 아니라 계약의 결함**이다 —
모델에게 잘못된 신호를 보내고 있었다는 사실 자체는 코드에서 확인된다. 다만
"사례 1이 정확히 이 이유로 실패했다"는 단정은 하지 않는다(아래 3절).

---

## 2. 실패 pipeline stage와 OpenAI 도달 여부

production에서 보인 두 문장은 각각 이 자리에서 나온다(AI-6A 빌드 기준):

| 보인 것 | 나오는 자리 |
| --- | --- |
| "고치지 못했습니다." | 패널 상태 줄 — catch 블록 / validator 실패 공통 |
| "AI 요청을 처리하지 못했습니다." | `(payload && payload.message) \|\| "…"` 의 **fallback** |

서버는 모든 실패에 `message`를 담아 JSON으로 돌려준다. 따라서 저 fallback
문장이 보였다는 것은 **`payload`가 null이었다**는 뜻 — 즉 응답이 JSON이
아니었다. 남는 경우는 셋뿐이다:

1. `/api/skin-ai`가 Pages Function에 닿지 않고 `_redirects`의 SPA
   fallback(`/* /index.html 200`)으로 떨어졌다 → **HTTP 200 + HTML**
2. Function이 예외로 죽어 Cloudflare가 만든 HTML 오류 페이지 → **5xx + HTML**
3. edge/게이트웨이 타임아웃(524 등) → **5xx + HTML**

**OpenAI까지 갔는지는 저장소에서 더 좁힐 수 없다.** 1번이면 호출은 0회,
2·3번이면 갔을 수도 있다. 새 유료 호출을 하지 않는 이상 지금 확정할 방법이
없고, 확정하는 것이 이 라운드가 만든 계측의 목적이다:

- 서버가 `S6 OPENAI_REQUEST_START` 로그 한 줄을 남긴다 → 이 줄이 있으면 갔고,
  없으면 그 앞에서 끝난 것이다(요구사항 8절).
- 브라우저가 `httpStatus`를 함께 기록한다 → `200`이면 1번(배포 문제),
  `5xx`면 2·3번. **고쳐야 할 곳이 완전히 다르다.**

---

## 3. 왜 "원인을 하나로 단정"하지 않는가

production 로그와 실제 응답 본문 없이 확정할 수 있는 것은 여기까지다.
확정된 것과 추정인 것을 구분해 적는다.

**확정:**
- 배포된 빌드에는 selectionContext가 없다(0절).
- 파이프라인 S1/S2는 반복 목록에서도 정확하다(1-1절, 실측).
- `capabilities`/`elementType`이 설명 없이 프롬프트에 실려 있었다(1-2절).
- generic 문장이 보였다 ⇒ 응답이 JSON이 아니었다(2절).

**추정(확인 필요):**
- 위 세 후보 중 어느 것이었는지.

다음 재현 때 브라우저 콘솔의 `[studio-ai] request failed { stage, code,
httpStatus }` 한 줄과 Function 로그의 `skin-ai: S6 OPENAI_REQUEST_START`
유무를 함께 보면 즉시 갈린다.

---

## 4. repeat rendered DOM ↔ source template mapping

**안정적으로 대응한다.** 별도 identity 전략이 필요 없다.

이유: `stampSkinForInspector()`가 **소스 template**에 임시 id를 찍은 뒤
Preview로 보내고, 렌더러(`applySkinRepeat`)는 그 노드를 `cloneNode(true)`로
복제한다. 복제본은 속성을 그대로 물려받으므로 렌더된 N개 항목이 **같은**
`data-imory-edit-id`를 갖는다(검사 B1: 3개 항목, distinct = 1).

그래서 사용자가 몇 번째 항목을 클릭하든 올라오는 식별자는 하나이고, Studio는
그것으로 소스의 **단 하나의** 요소를 찾는다(검사 B2). 요청 package에도 그
id가 정확히 한 번 심긴다.

이것은 한계가 아니라 사례 1이 요구한 동작 그 자체다 — 소스 하나를 고치면
모든 항목에 똑같이 적용된다. 반대로 **"이 항목 하나만"은 원리적으로 불가능**
하고, 프롬프트가 그 사실을 계약으로 적어 두고 있다.

---

## 5. 추가한 error code

실패 응답은 이제 **항상** `{ ok: false, code, message }` JSON이다.
raw OpenAI 응답 / SkinPackage / instruction 원문은 code에도 message에도
들어가지 않는다.

### 서버 (`functions/api/skin-ai.js`, `SKIN_AI_ERROR_CODES`)

| code | stage | 뜻 |
| --- | --- | --- |
| `BAD_METHOD` / `BAD_REQUEST` | S4 | method·JSON·shape |
| `BODY_TOO_LARGE` | S4 | 본문/텍스트 상한 초과 |
| `INSTRUCTION_EMPTY` / `INSTRUCTION_TOO_LONG` | S4 | 지시문 |
| `SKIN_PACKAGE_MISSING` | S4 | skinPackage 없음 |
| `REFERENCE_IMAGE_INVALID` | S4 | 참고 이미지 |
| `SELECTION_INVALID` | S4 | selectionContext shape |
| `SELECTION_TARGET_NOT_FOUND` | **S5** | editId가 그 template에 없음 |
| `UNAUTHENTICATED` / `FORBIDDEN` / `NOT_CONFIGURED` | S4 | 인증·allowlist·키 |
| `OPENAI_TIMEOUT` / `OPENAI_UNREACHABLE` | S7 | 호출 자체 실패 |
| `OPENAI_RATE_LIMIT` / `OPENAI_ERROR` | S7 | 상류 상태 코드 |
| `OPENAI_INCOMPLETE` / `OPENAI_REFUSAL` | S8 | 끝맺지 못함 / 거부 |
| `STRUCTURED_OUTPUT_INVALID` | S8 | 출력 파싱 실패 |
| `SERVER_ERROR` | S? | **예상 못 한 예외** |

`SERVER_ERROR`가 핵심이다. `onRequest()` 전체를 try/catch로 감싸서, Function
안에서 무슨 일이 나도 브라우저는 HTML이 아니라 JSON을 받는다 — generic 문장만
보이던 경로 하나를 통째로 없앤다(검사 I).

### 브라우저 (`studio/ai/studio-ai-panel.js`, `STUDIO_AI_ERROR_CODES`)

| code | stage | 뜻 |
| --- | --- | --- |
| `SELECTION_TARGET_NOT_FOUND` | S2 | 선택 id를 요청 package에 심을 수 없음 |
| `NO_WORKING_SKIN` / `INSTRUCTION_TOO_LONG` | S3 | 보내기 전 검사 |
| `REQUEST_TIMEOUT` / `NETWORK_ERROR` | S7 | 100초 초과 / fetch 실패 |
| `RESPONSE_NOT_JSON` | S7 | **응답이 JSON이 아님**(+`httpStatus`) |
| `SKIN_VALIDATION_FAILED` | S9 | Import 검증 거부 |
| `STALE_RESPONSE` | S10 | 그 사이 다른 변경 |
| `APPLY_FAILED` | S11 | 적용 실패 |

`UNSUPPORTED_RUNTIME_CAPABILITY`는 표와 문장만 정의해 두었고 **지금은 아무
것도 이 코드를 내지 않는다**. "현재 runtime에 없는 동작을 요청했는가"를
기계적으로 판정하려면 자연어를 해석해야 하고, 그건 capability manifest
Phase의 몫이다(요구사항 11절이 이번 범위에서 뺀 것). 정직하게 미구현으로
남긴다.

두 표는 **미러**다. 코드를 더하거나 이름을 바꾸면 두 파일을 함께 고친다
(Pages Function은 ESM, Studio는 classic script라 한 파일을 공유할 수 없다 —
`skin-sanitize.js` ↔ `studio-inspector-model.js`의 edit-id 패턴과 같은 성격).

### SkinPackage validator의 내부 reason (요구사항 9절)

`validateSkinPackageImport()`의 실패 반환에 `reason`을 더했다:
`empty-input / json-parse / not-object / schema-version / templates-missing /
required-template / banner-template / css-type / post-body-region /
css-validator`.

사용자에게는 짧은 한 문장만 보이고, 콘솔에는
`[studio-ai] … { stage: "S9", reason: "post-body-region" }`이 남는다.

**주의**: `sanitizeSkinHTML()`은 거부하지 않고 **조용히 지운다**. 그래서
"sanitizer violation"이라는 reason은 존재할 수 없다 — 허용되지 않은 태그/속성이
오면 검증은 통과하고 그 부분만 사라진다(모델이 `style` 속성으로 스타일을 주면
"성공했는데 아무것도 안 바뀐" 것처럼 보인다). 이건 남은 차이다(8절-3).

---

## 6. 사용자에게 보이는 메시지

generic 한 문장으로 뭉개지 않는다. 짧게 유지한다.

| 상황 | 문장 |
| --- | --- |
| 선택 요소를 못 찾음 | 선택한 요소를 수정 대상으로 찾지 못했습니다. 다시 선택해 주세요. |
| 스킨 규칙 위반 | AI가 만든 결과가 Imory 스킨 규칙을 통과하지 못해 적용하지 않았습니다. |
| 모델이 끝맺지 못함 | AI 응답이 끝까지 생성되지 않았습니다. 요청 범위를 조금 줄여 다시 시도해 주세요. |
| 응답이 JSON이 아님 | AI 서버가 알 수 없는 응답을 보냈습니다. 잠시 후 다시 시도해 주세요. |
| 그 사이 다른 변경 | 그 사이 다른 변경이 있어 AI 결과를 적용하지 않았습니다. |
| 서버 예외 | AI 요청을 처리하는 중 서버 오류가 발생했습니다. |
| (미구현) 지원 안 되는 동작 | 현재 Imory에서 지원하지 않는 동작입니다. |

---

## 7. 사례 2 — "뒤로 가기"는 현재 계약으로 표현할 수 없다

저장소에서 기계적으로 확인했다(검사 H2~H4):

- `skin/skin-sanitize.js`가 허용하는 binding 속성은
  `data-imory-bind / -src / -href / -repeat / -if` **다섯 개뿐**이다.
  `data-imory-action`은 존재하지 않는다.
- `skin/skin-context.js`가 만드는 컨텍스트 어디에도 `backHref` / `history.back`
  / `goBack`이 없다. `navigation.home.href`는 평범한 URL 문자열이다.
- `skin/skin-link-nav.js`에도 back 처리가 없다.

남는 방법은 `onclick` 핸들러나 `javascript:` URL뿐인데 **둘 다 sanitizer가
지운다**. 지우고 나면 링크는 조용히 아무 데도 가지 않는 상태가 된다 —
모델이 억지로 시도하면 사용자는 "성공했다는데 안 된다"를 겪는다.

그래서 이번에는 **구현하지 않고**, 프롬프트에 사실로 못박았다:

> Imory has no back-navigation binding: `navigation.home.href` is a plain URL
> and there is no `data-imory-action`. Do not invent one, do not use
> `javascript:`, and do not add an event handler attribute — all three are
> stripped and the link would silently break. … change nothing, and say plainly
> in the summary what is not supported.

### 개발 항목 (다음 Phase 후보)

"뒤로 가기 링크"를 지원하려면 다음 중 하나가 **먼저** 필요하다:

1. `data-imory-action="back"` — sanitizer 허용 목록 + 렌더러의 안전한
   핸들러 + `skin-link-nav.js`의 SPA 라우터 연동. 값은 열거형으로 닫아 둔다
   (임의 JS 진입점을 만들지 않는다).
2. 또는 컨텍스트에 `navigation.backHref` 같은 값을 추가 — 다만 "뒤로"는
   URL이 아니라 브라우저 history 동작이라 href로는 정확히 표현되지 않는다.

1번이 현재 아키텍처에 맞는다. 어느 쪽이든 capability를 모델에게 알려주는
방법(capability manifest)이 함께 필요하다.

---

## 8. 왜 기존 72/72가 이것을 못 잡았는가 (요구사항 10절)

세 가지가 겹쳤다.

1. **반복 목록을 선택해서 AI로 고치는 조합을 한 번도 태우지 않았다.**
   scenario y에도 repeat이 있지만, AI 요청을 보낸 대상은 항상 반복 **밖**의
   `.y-box` / `.y-heading`이었다. 사례 1은 "반복 항목 안의 형제 span 중 하나"인데
   그 조합이 없었다. → scenario f를 추가해 그 경로를 그대로 태운다(B1~B7).

2. **mock Structured Output이 지나치게 이상적이다.** mock 모델은 항상
   "받은 template을 그대로 돌려주고 CSS 한 줄을 정확한 선택자로 덧붙인다".
   실제 모델이 **거절**하거나, 범위를 넘겨 다시 쓰거나, 식별자를 잃는 경우를
   흉내내지 않았다. 특히 `capabilities`를 읽지 않으므로 1-2절의 결함이 mock
   에서는 원리적으로 드러날 수 없다. → 이번에 프롬프트 **문장 자체**를 검사
   대상으로 만들었다(B/H prompt 검사). 모델의 판단은 여전히 실제 호출로만
   확인할 수 있다.

3. **실패 경로를 "실패했다"까지만 봤다.** 기존 검사는 "draft가 안 바뀐다"를
   확인했지 **어떤 이유로 실패했는지 사용자/개발자가 알 수 있는가**는 보지
   않았다. 그래서 모든 실패가 같은 두 문장으로 수렴하는 상태가 통과했다.
   → 이제 code/stage/httpStatus를 검사한다(C·D·E·F·G·I).

한 가지 더: B4(“규칙이 렌더된 항목 전부에 걸린다”)는 처음에 실패했는데,
원인은 제품이 아니라 **테스트가 Preview 재렌더를 기다리지 않은 것**이었다.
`pending === false`는 적용 직전에 세워지고 재렌더는 iframe으로 가는
postMessage라 그보다 늦다. 기존 검사들이 working draft만 보고 렌더 결과를 보지
않았던 것과 같은 뿌리다.

---

## 9. 최소 수정 내용

| 파일 | 무엇 |
| --- | --- |
| `functions/api/skin-ai.js` | 코드 표 + `logSkinAiStage()` + 모든 실패에 code/stage + `S6 OPENAI_REQUEST_START` 로그 + `onRequest` try/catch(`SERVER_ERROR`) + 프롬프트 수정(capabilities/elementType 해설, 지원 불가 범위 축소, back 명시) |
| `studio/ai/studio-ai-panel.js` | 코드 표 + 메시지 표 + `failStudioAiRequest()` 한 곳 + `httpStatus` 기록 + `lastFailure` 노출 |
| `studio/ai/studio-ai-selection.js` | `inspectStudioAiSelectionPipeline()` (S1/S2 진단 창구, 네트워크 없음) |
| `skin/skin-package-import.js` | 실패 반환에 `reason` |
| `studio/studio-lifecycle-scenario.html` | scenario `f` — production 구조를 축소한 반복 fixture |
| `studio/studio-selected-ai-e2e-test.mjs` | `repeat` / `codes` / `back` 섹션 |

동작 계약(요청 body, 응답 성공 shape, 선택 유지 규칙)은 바꾸지 않았다 —
실패 응답에 `code` 필드가 **추가**됐을 뿐이라 기존 클라이언트도 그대로 돈다.

---

## 10. 남은 차이

1. **실제 실패 원인은 아직 확정되지 않았다.** 3절 참고. 다음 재현 한 번이면
   갈린다.
2. **`UNSUPPORTED_RUNTIME_CAPABILITY`를 내는 곳이 없다.** capability manifest
   Phase가 필요하다(7절).
3. **sanitizer가 조용히 지우는 것을 사용자에게 알리지 않는다.** 모델이 허용되지
   않은 태그/속성을 쓰면 검증은 통과하고 그 부분만 사라져 "성공했는데 안 바뀐"
   것처럼 보인다. sanitize 전후를 비교해 알려주는 것은 별도 작업이다.
4. **뒤로 가기 runtime capability 자체는 구현하지 않았다**(이번 범위 밖).
5. **모델의 실제 판단은 여전히 mock으로 검증할 수 없다.** 이 라운드가 검증하는
   것은 "모델에게 무엇을 보냈는가"와 "무엇이 돌아와도 우리 쪽이 안전한가"다.

---

## 11. 테스트

`studio/studio-selected-ai-e2e-test.mjs` (포트 8940). **실제 OpenAI 호출 0회.**

```
node studio/studio-selected-ai-e2e-test.mjs
node studio/studio-selected-ai-e2e-test.mjs --only=repeat
node studio/studio-selected-ai-e2e-test.mjs --only=codes
node studio/studio-selected-ai-e2e-test.mjs --only=back
```

`--only=` 이름: `server / chip / send / apply / route / undo / images /
repeat / codes / back` (뒤 셋이 이번 라운드).

결과: **99/99 PASS** (AI-6B의 72 + 이번 27).

회귀: `studio-inspector-e2e-test.mjs` 34/34,
`studio-ai-panel-e2e-test.mjs` 125/125,
`studio-ai-panel-layout-e2e-test.mjs` 82/82,
`skin-published-frame-e2e-test.mjs` 64/64,
`skin-banner-page-e2e-test.mjs` 216/216,
`skin-write-manage-e2e-test.mjs` 143/143.
