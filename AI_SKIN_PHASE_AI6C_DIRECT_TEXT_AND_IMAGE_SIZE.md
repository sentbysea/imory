# PHASE AI-6C — Select mode 직접 편집: 텍스트 내용 · 이미지 크기

이 문서는 이 라운드의 **기록**이다. Element Inspector / Direct Edit의 기본
계약은 [AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md](./AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md)
가 갖고 있고, 여기서는 **그 계약 중 이번에 바뀐 지점**과 새로 생긴 것만
적는다.

목표는 하나다 — **간단한 문구 수정과 이미지 크기 변경은 AI 요청 없이 그
자리에서 끝낸다.**

---

## 1. 바뀐 계약 (AI-6A에서 바뀐 부분)

| 항목 | AI-6A | 이번 라운드 |
| --- | --- | --- |
| 텍스트 내용 입력 | 한 줄 `<input>`, `change` 한 번이 곧 확정 | 여러 줄 `<textarea>` + **적용/취소**. 입력 중에는 Preview에만 임시 반영 |
| 텍스트 확정 위치 | HTML만 | HTML + (줄바꿈이 있으면) `white-space: pre-wrap` 규칙 |
| 이미지 크기 | 숫자 입력 하나(`width` + `height: auto`) | 슬라이더 + 숫자 + **모서리 드래그**, `width` + `height:auto` + `aspect-ratio` + `max-width:100%` |
| 바인딩 텍스트 | 입력칸이 없다(이유는 팝오버 상단 안내에만) | 입력칸 자리에 **"어디서 고치는 값인지"** 를 그대로 보여 준다 |
| 폼 순서 | capability 순서대로 | **텍스트 내용이 언제나 맨 위** |

capability 이름(`text` / `size` …)은 그대로다 — `functions/api/skin-ai.js`의
`SKIN_AI_SELECTION_CAPABILITY_NAMES`는 손대지 않았다.

---

## 2. 임시(미리보기)와 확정(편집)의 분리

이번 라운드에서 새로 생긴 축이다.

```
입력/드래그 중   parent → iframe  "preview:inspect-preview"
                 iframe의 live DOM만 임시로 바뀐다
                 SkinPackage · dirty · Undo 전부 그대로

적용/손 뗌       applyStudioInspectorPatch()  ← AI-6A부터 있던 그 경로 하나
                 SkinPackage가 바뀌고 재렌더 · Undo 스냅샷 하나가 남는다
```

- Save/Publish/Export가 읽는 것은 SkinPackage뿐이므로 **임시 반영은 어떤
  경로로도 저장되지 않는다.**
- 그래서 "취소 · 선택 해제 · 페이지 전환에 임시 변경이 남지 않는다"가
  `clearStudioInspectorPreview()` 한 줄로 지켜진다.
- 그리고 **한글 조합**이 끊기지 않는다. 글자마다 SkinPackage를 고치면
  스킨 전체가 다시 그려지고 그 안의 textarea가 새로 만들어져 IME 조합과
  커서가 깨진다. 조합 중(`compositionstart`~`end`)에는 미리보기조차 보내지
  않는다.

메시지 계약(`studio/preview/preview-bridge.js` 상단 주석에 함께 적었다):

```
parent -> iframe  "preview:inspect-preview" { type, editId, text?, width?, ratio?, clear? }
iframe -> parent  "preview:inspect-select"  { type, editId, tagName, rect, metrics }
```

`metrics`는 좌표와 같은 성격의 실측 숫자만 담는다 —
`{ width, height, naturalWidth, naturalHeight, parentWidth, viewportWidth }`.
DOM 노드도 HTML 문자열도 올라가지 않는다(AI-6A 계약 유지).

**임시 반영이 떠 있는 동안에는 그 실측값을 확정값의 기준으로 쓰지 않는다.**
지금 화면에 보이는 크기는 아직 확정된 것이 아니라서, 그대로 받으면
"바뀐 게 없다"고 판단해 확정이 통째로 사라진다
(`studioInspectorPreviewActive`).

---

## 3. 텍스트 내용

- 대상은 지금까지와 같다 — `capabilities.text`가 참인 요소, 즉 **자식 태그가
  없고 `data-imory-bind`가 없는** 정적 텍스트/링크뿐이다. 자식이 있는 요소를
  `textContent`로 덮어쓰는 일은 없다.
- 입력은 항상 `textContent`로만 들어간다(마크업으로 해석되지 않는다).
- **줄바꿈**: `textContent` 안의 `\n`은 HTML에서 공백 하나로 접힌다. 그래서
  줄을 나눈 경우에만 이 요소의 Direct Edit 규칙에 `white-space: pre-wrap`을
  함께 쓴다(한 줄로 되돌리면 그 선언도 사라진다). 저장 → 재로드 →
  Export/Import에서 줄바꿈이 유지되는 이유가 이것이다.
- **데이터 연결 텍스트**는 입력칸을 주지 않고 그 자리에서 이유를 말한다:
  `profile.nickname` → "Settings에서 관리하는 닉네임입니다.",
  `post.title` → "글 제목이라 글 편집 화면에서 바뀝니다." 등
  (`STUDIO_INSPECTOR_BIND_NOTES`, 모르는 경로는 `<path> 값으로 자동으로
  채워지는 자리입니다.`). 스타일은 그대로 바꿀 수 있다.
- protected region(post-body)은 AI-6A 그대로 아무 컨트롤도 주지 않는다.

---

## 4. 이미지 크기

확정 규칙은 항상 이 네 줄이다(`buildInspectorStylePatch("size", …)`):

```css
[data-imory-edit-id="X"][data-imory-edit-id="X"] {
  width: 180px;
  height: auto;
  aspect-ratio: 1;      /* 고를 때 화면에 보이던 비율 */
  max-width: 100%;
}
```

- **비율을 지키는 이유.** 스킨이 `width:120px; height:120px; object-fit:cover`
  로 만든 정사각형 프로필 사진에 `height:auto`만 주면 원본 비율로 늘어나
  구도가 바뀐다. `aspect-ratio`가 그 정사각형을 그대로 유지한다 —
  `object-fit` 값 자체는 건드리지 않는다.
- **`height`를 px로 박지 않는 이유.** 좁은 화면에서 `max-width`로 가로가
  줄 때 세로가 따라 줄지 않아 이미지가 찌그러진다.
- **가로 넘침.** 슬라이더 상한은 iframe이 잰 **부모 안쪽 폭**이고, 확정
  규칙에는 항상 `max-width: 100%`가 함께 들어간다(두 겹).
- **초기값**은 "지금 화면에 실제로 보이는 폭"이다. 이미 이 요소에 크기
  규칙이 있으면 그 값이 곧 보이는 폭이므로 둘은 자연히 같다.
- **초기화("기본")** 는 이번 직접 편집으로 넣은 네 선언만 규칙에서 뺀다 —
  스킨 CSS의 원래 크기로 돌아간다.
- 크기는 CSS만 바꾼다. `src` / `data-imory-src` / imageSlot 연결은 한 글자도
  건드리지 않으므로 Settings 사진도 Images 슬롯 사진도 그대로다. **슬롯이
  없는 정적 이미지도** 크기 조절은 된다(`capabilities.size`는 슬롯과 무관).

---

## 5. 모서리 드래그

- 핸들은 Preview **위에 얹는 overlay**의 요소다(AI-6A의 이유 그대로 —
  스킨 DOM에는 아무 것도 붙지 않는다). 선택 테두리는 Preview 영역과의
  교집합으로 잘려 있으므로, 핸들은 **잘리지 않은 좌표**로 따로 찍는다
  (`studioInspectorMapRectRaw`).
- **기준점은 반대쪽 모서리**다. 드래그를 시작한 순간의 화면 좌표로 한 번만
  잡고, 그 뒤로는 포인터와 그 점 사이의 거리만 본다. 그래서 이미지가
  커지며 자기 자리가 밀려도(일반 흐름 배치) 계산이 흔들리지 않는다 —
  페이지를 절대좌표 배치로 바꾸지 않는다.
- 대각선은 두 축이 각각 요구하는 너비의 평균을 쓴다(비율 고정이라 한 축만
  보면 한쪽으로만 반응하는 느낌이 된다).
- **좌표 변환**은 `getBoundingClientRect()` 기반 배율 하나로 끝난다 —
  Mobile Preview의 `scale()`, AI 패널 여닫기/폭 드래그, 창 크기 변경이 전부
  같은 식으로 처리된다.
- **포인터 캡처**를 핸들에 건다. move/up은 `document`에서 받는다 — 캡처가
  걸리면 이벤트가 핸들을 거쳐 document까지 올라오고, 캡처가 안 되는
  환경에서도 document에는 도달한다. 그래서 포인터가 이미지 밖·iframe 위·창
  밖으로 나가도 드래그가 끊기지 않고, `lostpointercapture`/`pointercancel`은
  취소로 받는다.
- `pointermove`마다 postMessage를 쏘지 않는다(프레임당 한 번). 재렌더도
  Undo도 손을 뗄 때 **한 번만** 일어난다.
- **Escape / pointercancel** 은 시작 전 크기로 되돌린다(선택은 유지).
  **실제 크기가 변하지 않았으면 아무 것도 확정하지 않는다**(이력 없음).
- Inspector 중에는 브라우저 기본 이미지 드래그를 막는다
  (preview-bridge의 `dragstart` + `preview-frame.html`의 `-webkit-user-drag`).

---

## 6. 이 라운드에서 함께 고친 것

1. **overlay가 stage 크기 변화를 따라간다.**
   창 `resize`만 듣고 있어서, AI 패널을 여닫으면(창은 그대로, stage만 좁아짐)
   테두리와 핸들이 원래 자리에 남았다. Mobile Preview는 stage **가운데**에
   놓이므로 그때 iframe은 크기뿐 아니라 위치까지 옆으로 밀린다 —
   `ResizeObserver(studioPreviewStage)` 하나로 세 경우(여닫기·폭 드래그·창
   크기)를 모두 덮는다. (e2e 검사 G2b가 잡은 실제 버그다.)

2. **임시 미리보기 복원이 확실해졌다.** 되돌릴 때 선언을 먼저 통째로 비우고
   (`style.cssText = ""`), 원래 `style` 속성이 없었으면 속성 자체를 지운다.
   빈 문자열도 "없었던 것"으로 취급한다.

3. **8939(Element Inspector) 스위트가 WebKit에서도 끝까지 돈다.**
   `selectInPreview()`가 "선택이 null이 아니다"로만 기다리고 있었다 —
   앞 단계에서 이미 무언가 골라 둔 상태라면 그 조건은 처음부터 참이라,
   새 클릭이 도착하기도 전에 다음 단계로 넘어간다. Chromium에서는
   우연히 맞아떨어졌지만 WebKit에서는 그 자리에서 옛 선택의 폼을 읽어
   검사 J/J2가 무너졌다(이 라운드 이전 HEAD에서도 같은 지점에서
   실패한다 — 새 코드가 만든 문제가 아니다). 이제 **그 요소가** 선택될
   때까지 기다리고, "직접 수정"은 한 번 눌러 안 열리면 다시 누른다.
   fixture 이미지에 실제 바이트를 물려 주는 것도 함께 넣었다 — 로드
   실패가 WebKit에서는 콘솔 오류로 올라와 마지막 검사 Z를 깨뜨린다.

4. **테스트 하네스가 실제 Studio 상단 버튼 구성과 같아졌다.**
   `studio/studio-lifecycle-scenario.html`에 **Images 버튼**과
   `images-panel.js` / `images-panel.css`를 넣었다. 예전에는 "images 모듈을
   로드하지 않으므로"라며 그 버튼 하나만 빼 두었는데, 그러면 Inspector가
   검사하는 화면이 실제보다 버튼 하나 좁은 Top Dock이 된다. 데이터 계층
   (`skin-image-library.js`)만 기존 in-memory mock으로 남긴다 — 업로드/삭제
   자체는 `studio/images/skin-image-library-e2e-test.mjs`(8935)가 진짜
   `studio/index.html` 위에서 검증한다.

5. **scenario y fixture 보강** — 바인딩 텍스트(`.y-nickname`), 슬롯 없는
   정적 이미지(`.y-static-image`), 그리고 정사각형/가로형 이미지 크기를
   정하는 CSS. 기존 여덟 가지 뒤에 **덧붙이기만** 했다(앞 요소들의 순서가
   바뀌면 AI-6A 검사 T의 구조 경로 id 기대가 함께 흔들린다).
   `window.__scenarioYSkinPackage` 분기도 추가했다 — "Save 후 재로드"를
   e2e가 진짜로 확인할 수 있게 저장된 content를 심어 다시 열기 위해서다
   (scenario t와 같은 방식).

---

## 7. 테스트

`studio/studio-direct-edit-e2e-test.mjs` (포트 8945, `?scenario=y`).

```
node studio/studio-direct-edit-e2e-test.mjs
node studio/studio-direct-edit-e2e-test.mjs --browser=webkit
node studio/studio-direct-edit-e2e-test.mjs --only=drag
```

`--only=` 이름: `text / image / drag / geometry / persist`.

fixture 이미지에는 e2e가 진짜 1x1 PNG 바이트를 물려 준다 — **로드에 실패한
`<img>`는 브라우저가 "alt 텍스트를 담은 일반 인라인 요소"로 취급해서 CSS
width/height가 아예 먹지 않는다**(실측 120x120 대신 alt 글자 크기 64x21).
크기·비율을 재는 검사에서 그 상태를 기준으로 삼으면 아무 의미가 없다.

Chromium / WebKit 모두 37/37 통과(2026-09-09). 회귀로 함께 돌린 것:
inspector 8939(34, Chromium·WebKit), selected AI 8940(99), image
library 8935(95), file UX 8943(42), AI 패널 8937(134) / 8938(90) —
전부 통과(표시 없는 것은 Chromium).

**미검증**: 실제 DB(Supabase)·배포 확인·실기기 터치. 이 라운드는 전부
mock 하네스 위에서만 확인했다. 터치 입력은 `pointerdown/move/up` +
`touch-action: none`으로 다루므로 동작할 것으로 보이지만, 실제 기기에서
확인한 적은 없다.

---

## 8. 남은 차이

1. **Undo는 여전히 1단계**다(AI-6A 그대로). 텍스트 적용 한 번, 슬라이더
   조작 한 번, 드래그 한 번이 각각 Undo 한 번으로 복원되지만, 그 앞의
   편집으로는 돌아가지 못한다. AI Undo와도 아직 하나의 history가 아니다.
2. **반복 항목**의 임시 미리보기는 클릭한 그 항목 하나에만 보이고, 확정하면
   같은 자리 전체에 적용된다(팝오버 안내 문구 그대로).
3. **세로 크기만 따로 정하기**는 없다. 이번 계약은 "가로 하나 + 지금 보이는
   비율"이다. 자르기·자유 이동·회전은 이번 범위 밖(요청에서 제외).
4. 크기 초기화는 **이번 직접 편집이 넣은 선언**만 지운다 — AI가 만든 규칙이나
   스킨 원본 CSS는 건드리지 않는다.
5. **`studio/inspector/studio-inspector.js`가 2,900줄을 넘었다**(이 라운드
   전에도 1,700줄이었다). CLAUDE.md §1의 "1000줄 내외" 기준을 넘으므로
   분리를 검토했지만 이번에는 하지 않았다 — 이유를 적어 둔다.

   나눌 자리는 분명하다: **overlay/선택/메시지 배선**과 **직접 수정 폼 +
   크기 드래그**. 문제는 이 저장소가 번들러 없이 classic script를 쓴다는
   점이다. 최상위 `let`은 global이 아니라 **script scope**라, 파일을
   나누면 `studioInspectorSelection` 같은 공유 상태가 서로 보이지 않는다.
   그래서 분리하려면 공유 상태를 `window`의 객체 하나로 올려야 하는데,
   그건 AI-6A가 세운 "선택 상태의 주인은 이 파일 하나이고, 값은 항상
   `window.getStudioInspectorSelection()`으로 다시 계산해 간다"는 계약을
   건드린다. 기능 라운드와 같은 커밋에서 할 일이 아니다.

   먼저 옮길 만한 것: 크기/비율 계산(`studioInspectorSizeRatio` /
   `SizeBaseline` / `SizeMax` / clamp)은 metrics를 인자로 받으면 순수
   함수가 되므로 `studio-inspector-model.js`(순수 계산 계층)가 제 자리다.

   > **철회/변경됨 (Inspector 파일 분리 라운드)** — 위 5번의 미룬 이유
   > 가운데 **전제 하나가 사실과 다르다**. classic script의 최상위
   > `let`/`const`는 script scope가 아니라 **문서 하나가 공유하는 전역
   > lexical 환경**에 들어간다 — 앞 script가 선언한 `let`을 뒤 script가
   > 읽고 **대입까지** 할 수 있다(이 저장소는 이미 그렇게 쓰고 있다:
   > `studio-preview.js`의 `let currentWorkingSkin`을 `studio-inspector.js`
   > 가 그대로 읽는다). 그래서 파일을 나누기 위해 공유 상태를 `window`
   > 객체로 올릴 필요가 없었고, "선택 상태의 주인은 한 곳"이라는 AI-6A
   > 계약도 건드리지 않았다.
   >
   > 지금 구조: `studio-inspector-state.js`(공유 상태) ·
   > `-overlay.js` · `-edit.js` · `-text.js` · `-image-size.js` ·
   > `-controls.js` · `studio-inspector.js`(진입/lifecycle). 로드 순서와
   > 이유는 `studio/index.html`의 ELEMENT INSPECTOR 블록 주석과
   > `studio-inspector.js` 머리말 "파일 나누기"에 있다.
   >
   > 마지막 문단의 "먼저 옮길 만한 것"(크기/비율 계산을
   > `studio-inspector-model.js`로)은 **아직 하지 않았다** — 이번
   > 라운드는 파일 경계만 옮기고 함수 자체는 한 글자도 고치지 않았다.
   > 여전히 유효한 다음 후보다.
