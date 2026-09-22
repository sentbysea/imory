# Imory — 문서 색인

이 저장소의 Markdown 문서가 **무엇을 다루는지**와 **지금도 기준인지**를 한 줄씩
적은 색인이다. 작업 지침은 [CLAUDE.md](../CLAUDE.md), 테스트 목록은
[TESTS.md](./TESTS.md) 에 있다.

## 이 색인을 쓰는 법

- 작업을 시작하기 전에 **이 문서를 먼저 읽고**, 지금 고치는 기능과 직접 관련된
  문서만 연다. 모든 문서를 한꺼번에 읽지 않는다.
- **CURRENT CONTRACT** 만 새 작업의 근거로 쓴다.
- **HISTORICAL · SUPERSEDED 는 현행 계약의 근거로 쓰지 않는다.** 그때 왜
  그렇게 했는지 원인을 조사할 때만 연다. 거기 적힌 규칙이 지금 규칙과 다르면
  **지금 규칙이 맞다**.
- **PLAN** 은 새 기능의 범위를 정할 때만 연다. 구현된 것으로 읽지 않는다.
- 한 기능의 상세 규칙은 **한 기준 문서**에서만 관리한다. 뒤 라운드가 앞 계약을
  바꿨으면 앞 문서를 다시 쓰지 말고, 바뀐 지점에 "철회/변경됨 → 어느 문서"를
  적고 이 색인의 줄을 고친다.

## 0. 폴더 구성

| 폴더 | 무엇이 있나 |
| --- | --- |
| `docs/contracts/` | 지금 코드가 따르는 계약 문서 |
| `docs/architecture/` | 구조 · 개념 · 디자인 시스템 |
| `docs/features/studio/` · `skin/` · `content/` · `images/` | 기능별 설계 문서 |
| `docs/features/*/history/` | 그 기능을 이해하는 데 아직 필요한 라운드 기록. **현행 계약의 최우선 근거로 쓰지 않는다** |
| `docs/plans/` | 방향 · 범위 · 상태 체크리스트 |
| `docs/archive/` | 철회되거나 대체된 기록. 현행 계약의 근거로 쓰지 않는다 |
| 저장소 루트 | `CLAUDE.md` 하나 |

## 상태 표시

| 표시 | 뜻 |
| --- | --- |
| **CURRENT CONTRACT** | 지금 코드가 따르는 계약. 새 작업은 여기서 시작한다. |
| **ACTIVE** | 계속 갱신되는 살아 있는 문서(개념 · 토큰 · 상태 체크리스트). 계약 문서는 아니다. |
| **PLAN** | 방향과 범위. 아직 다 구현되지 않았다. 범위를 정할 때만 본다. |
| **HISTORICAL** | 그 라운드의 조사 · 결정 기록. 원인 조사 때만 본다. |
| **SUPERSEDED** | 뒤 라운드가 철회하거나 대체했다. 근거로 쓰지 않는다. |

---

## 1. CURRENT CONTRACT — 지금 코드가 따르는 계약

### 1-1. 스킨과 플랫폼의 경계

| 문서 | 다루는 것 | 관련 코드 | 관련 테스트 |
| --- | --- | --- | --- |
| [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./contracts/SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) | 공개 화면(HOME/CATEGORY/POST/BANNER)의 표시 공간 · 화면 전환 · 소유자와 관리 동선 · Preview 와 공개 화면 일치. **스킨/플랫폼 담당 범위의 기준 문서** | [skin/skin-render.js](../skin/skin-render.js) · [skin/skin-link-nav.js](../skin/skin-link-nav.js) | `skin/skin-published-frame-e2e-test.mjs` · `skin/skin-write-manage-e2e-test.mjs` |
| [SKIN_DESIGNER_CONTRACT.md](./contracts/SKIN_DESIGNER_CONTRACT.md) | SkinPackage JSON 이 어떤 모양이어야 하는가(디자이너용). `data-imory-*` 바인딩 · region · **재료 일치**(`data-imory-kind`/`color` · `iconKind` · `category.showPostsList` · 하이라이트 `sourcePathLabel`) · `navigation.home`/`postCategories`/`bannerCategories` | [skin/skin-context.js](../skin/skin-context.js) · [skin/skin-render.js](../skin/skin-render.js) | `skin/skin-material-parity-e2e-test.mjs` |
| [AI_SKIN_PHASE1C_PAGE_CONTRACT.md](./contracts/AI_SKIN_PHASE1C_PAGE_CONTRACT.md) | Skin Data Contract — 템플릿이 받는 데이터(HOME/CATEGORY/POST 의 Context 모양) | [skin/skin-context.js](../skin/skin-context.js) | `studio/studio-ai-panel-e2e-test.mjs` (K · L 절) |
| [IMORY_CSS_IMPORT_DESIGN.md](./contracts/IMORY_CSS_IMPORT_DESIGN.md) | 스킨 CSS 판정(구조 오류는 차단 · 선언 하나만 제외 · 줄·열 오류 문장) · SkinPackage 공용 파이프라인 · 이미지 슬롯 정규화 | [skin/skin-css-validate.js](../skin/skin-css-validate.js) `analyzeSkinCss` · [skin/skin-package-images.js](../skin/skin-package-images.js) · [skin/skin-package-import.js](../skin/skin-package-import.js) `runSkinPackageContentPipeline` | `studio/studio-import-css-image-e2e-test.mjs` |
| [IMORY_SANDBOX_SKIN_DESIGN.md](./architecture/IMORY_SANDBOX_SKIN_DESIGN.md) | Sandbox 스킨(별도 origin iframe) · `renderMode` · CSP/nonce · 프레임에 넘기는 데이터 · 프레임 안 이동(navId) · 저자 JS(§O) · 화면 전환 수명(§P) · 프레임 안 Select(§Q · §R · §S). **§G · §H · §J · §K · §L · §O · §P · §Q · §R · §S 가 구현이고 §A~§F 는 설계다**(문서 머리말 표 참고) | [skin/sandbox/skin-sandbox-author-js.js](../skin/sandbox/skin-sandbox-author-js.js) · [skin/sandbox/skin-sandbox-inspect.js](../skin/sandbox/skin-sandbox-inspect.js) · [skin/sandbox/skin-sandbox-inspect-direct.js](../skin/sandbox/skin-sandbox-inspect-direct.js) · [skin/sandbox/skin-sandbox-nav.js](../skin/sandbox/skin-sandbox-nav.js) | `skin/sandbox/skin-sandbox-e2e-test.mjs` · `studio/studio-sandbox-preview-e2e-test.mjs` · `studio/studio-sandbox-select-parity-e2e-test.mjs` |

### 1-2. 배치 · 전환 · Dock · HOME 구성

| 문서 | 다루는 것 | 관련 코드 | 관련 테스트 |
| --- | --- | --- | --- |
| [IMORY_LAYOUT_PRIMITIVE_DESIGN.md](./contracts/IMORY_LAYOUT_PRIMITIVE_DESIGN.md) | 배치 primitive(stack · grid · free · sidebar · panel) · `data-imory-layout*` / `-item*` / `-slot` · 모바일 안전 | [skin/skin-layout.js](../skin/skin-layout.js) · [skin/skin-layout.css](../skin/skin-layout.css) | `skin/skin-layout-e2e-test.mjs` · `studio/studio-layout-e2e-test.mjs` |
| [IMORY_TRANSITION_PRIMITIVE_DESIGN.md](./contracts/IMORY_TRANSITION_PRIMITIVE_DESIGN.md) | 전환 primitive(none · fade · slide · scale · 조합 × duration · easing · direction) · `data-imory-transition*` / `-panel` / `-toggle` · appear · show/hide | [skin/skin-transition.js](../skin/skin-transition.js) · [skin/skin-transition.css](../skin/skin-transition.css) | `skin/skin-transition-e2e-test.mjs` · `studio/studio-transition-e2e-test.mjs` |
| [IMORY_BOTTOM_DOCK_DESIGN.md](./contracts/IMORY_BOTTOM_DOCK_DESIGN.md) | Bottom Dock(`bottomDock` 설정 + `templates.dock`) · 자리(auto/fixed/sticky/static) · 접기와 trigger · Studio Dock 패널(§3 · §9) · 아이모리 아이콘 | [skin/skin-bottom-dock.js](../skin/skin-bottom-dock.js) · [skin/skin-bottom-dock-visual.js](../skin/skin-bottom-dock-visual.js) · [skin/skin-dock-icons.css](../skin/skin-dock-icons.css) | `skin/skin-bottom-dock-e2e-test.mjs` · `studio/dock/studio-dock-panel-e2e-test.mjs` |
| [IMORY_SIDES_DESIGN.md](./contracts/IMORY_SIDES_DESIGN.md) | HOME 좌우 영역 1·2·3단(EDITORIAL-RESPONSIVE-HOME-1) · `regions` 의 `left_sidebar`/`right_sidebar` · `data-imory-sides*` · 모바일 오프캔버스 · Studio Layout 패널 | [skin/skin-sides.js](../skin/skin-sides.js) · [skin/skin-sides.css](../skin/skin-sides.css) · [studio/sides/sides-panel.js](../studio/sides/sides-panel.js) · 예시 스킨 생성기 [skin/test-skins/build-editorial-home-v1.mjs](../skin/test-skins/build-editorial-home-v1.mjs) | `skin/skin-sides-e2e-test.mjs` · `studio/studio-sides-e2e-test.mjs` |
| [IMORY_HOME_CANVAS_CONTRACT.md](./contracts/IMORY_HOME_CANVAS_CONTRACT.md) | **`canvas.version:1`(평면 자유 Canvas)과 `version:2`(조합형 Canvas)의 구현 범위다** — v2 의 **설계**는 로드맵 §14 이고, 지금 코드가 강제하는 것은 이 문서의 **§9-(3)**(데이터 검증 · V2-DATA-1) · **§23**(자동 배치 화면 출력 · V2-FLOW-RENDER-1) · **§24**(`main_visual` 내부 — 사진과 주변 장식 · V2-MAIN-VISUAL-1) · **§25**(v2 선택과 기본 배치 조정 · V2-EDITOR-1A) · **§26**(프레임 내부 요소 · overlay 의 자리 · 크기 · 각도 — 패널과 **직접 조작** · V2-EDITOR-1B) · **§27**(**재료 추가** · V2-ADD-1)다. v2 의 **삭제** · 묶기/해제 · 그룹 조작 · `hidden`/`locked` 토글은 아직 없다. HOME 캔버스의 **데이터 계약**(CONTRACT-1B · 1C)과 **정적 Renderer**(RENDER-1A · 1B, §12) · `regions` 의 `home_canvas` 항목 · 표시 위치 `data-imory-canvas-root` · 390 기준 좌표와 도화지 높이 `baseHeight`(1C) · 요소 여섯 종류 · **보존용 원본 ↔ 실행용 payload** · 세 갈래 fallback · 그리는 규칙(도화지 `aspect-ratio` + 요소 백분율 · 종류별 DOM · 재렌더 안전 · 기존 스킨 DOM 변화 0) · **네 화면 parity**(공개 native · Studio native · 공개 sandbox · Studio sandbox — 같은 렌더러 파일 한 벌 · CSP 무변경, §12-6) · **편집기 라이브러리 고정**(VENDOR-1, §13 — Moveable 0.53.0 · Selecto 1.26.3 UMD 를 바이트 그대로 + Studio 전용 지연 로더 + sandbox allowlist 두 줄 + `cspNonce` 대조군 넷. **부르는 곳이 없어 공개 비용 0**) · **선택 소유권과 단일 선택 기반**(SELECT-1A, §14 — 캔버스 전용 선택 상태(배열, 지금은 최대 1개) · 기존 Inspector 와 **동시에 켜지지 않는** 소유권 라우터 한 곳 · 캔버스를 아는 공통 hit-test(배경 없는 요소 · 전면 요소 · 잠긴 요소 · 사각형 겹침) · draft 존재 검증에 근거 하나 추가 · 축에 평행한 임시 테두리. **고치는 경로는 없고 vendor 요청도 0**) · **조건부 vendor 활성화와 회전을 따라가는 선택 틀**(SELECT-1B-1, §15 — 첫 Canvas 요소를 고른 **그 순간에만** 프레임 문서가 runtime · 로더 · UMD 를 받고 공개 화면은 계속 요청 0 · native Preview 문서와 sandbox 프레임 문서가 **같은 runtime 파일 한 벌** · 공식 `cspNonce` 로 **CSP 무변경 · 위반 0 실측** · 표시 전용 Moveable(손잡이 · 조작 · Selecto 인스턴스 없음) · 회전 0°/20°/45° · `"auto"` 높이 · 부모 scale · 내부 스크롤에서 **±1.5px** · 실패하면 축 평행 테두리로 fallback · **Canvas DOM 을 한 글자도 건드리지 않는다** — sandbox 저자 JS 의 효과 자리를 막지 않는다, §15-7-1). **Selecto lasso 와 다중 선택**(SELECT-1B-2, §16 — 관문이 "Canvas 가 있는 HOME 에서 Select 를 켬"으로 앞당겨짐 · 일반 lasso 는 교체 · Shift 는 XOR · 빈 lasso 는 해제 · **손가락 lasso 는 의도적 미지원**(단일 탭 유지) · 대상은 `[data-imory-canvas-element]` 뿐이라 사용자 JS 의 효과 DOM 은 애초에 후보가 아님 · 프레임은 **제안만** 하고 부모가 draft 로 전부 다시 보고 한 id 라도 어긋나면 **메시지 전체를 거부** · 정렬은 draft 배열 순서 · 2개 이상이면 Moveable **그룹 틀 하나** · 그룹 전환이 nonce 를 잃던 문제는 규칙표를 못박아 해결(§16-6-1)). **단일 요소 이동**(TRANSFORM-1A, §17 — **여기서부터 Canvas JSON 이 바뀐다**. 단독 선택 요소 하나를 마우스 · 펜으로 끌어 `canvas.elements[].x/.y` **두 칸**만 쓴다 · 배율은 도화지 가로폭 하나(부모 scale 은 프레임 좌표에 다시 적용하지 않는다) · 시작값 + 누적 이동량이라 반복 드래그에 오차가 쌓이지 않는다 · 소수 셋째 자리 · 음수 허용(자동 clamp 없음) · 끄는 동안에는 프레임의 custom property 두 칸만 움직이고 JSON · draft · Undo · 스킨 CSS 는 무변경 · 불변 수정은 순수 함수 `writeSkinHomeCanvasElementPosition()` 하나(모르는 필드 · props · width · height · rotation · 배열 순서 전부 보존, 입력 non-mutation) · 프레임은 **요청**만 하고 부모가 선택 · 순번 · `expected` · 허용 키 · 범위를 다시 봐 거부하며 **모르는 키는 버리지 않고 메시지 전체를 거부** · 답에는 **요청 번호**가 붙는다(좌표 메시지는 답 말고도 나가므로 "확정 뒤 처음 온 것"을 답으로 읽으면 승인된 이동이 되돌아간다) · **한 제스처 = Undo 한 칸**(이동량 0 · 거부는 기록 0) · Save → 다시 열기 · Export → Import · Publish resolve 왕복 확인 · lasso ↔ 본체 끌기 경계를 여기서 갈랐다(고를 수 있는 요소 위에서는 lasso 없음 · 잠긴 요소는 배경) · **손가락 이동은 의도적 미지원**). **단일 요소 리사이즈**(TRANSFORM-1B, §18 — 단독 선택에 **손잡이 여덟**(`nw` `n` `ne` `e` `se` `s` `sw` `w`)을 달고 `x/.y/.width/.height` **네 칸**을 쓴다(자유 비율) · 여럿을 고르면 손잡이가 **없다**(그룹 조작은 다음 단계) · 관문 · 기다림 · 요청 번호 · Undo · 취소는 이동과 **한 벌**이고 불변 수정의 복사 규칙도 같은 함수(`writeSkinHomeCanvasElementFields`) · **회전 요소의 반대편 기준점은 Moveable 의 `drag.beforeTranslate` 가 준다 — 삼각함수를 새로 적지 않았다**(20°·45° 에서 0.9px 안 실측) · 크기는 `dist` 로 잰다(`width`·`height` 는 우리 사용법에서 시작값에 머문다 — 번들 실측) · `height:"auto"` 는 좌우 손잡이에서 유지되고 **세로·모서리 손잡이 + 실제 세로 변화**일 때만 숫자로 전환되며 Undo 하면 정확히 `"auto"` 로 돌아간다 · 최소 크기 1 · 경계 밖 자동 clamp 없음 · `kind` 가 `expected`/`next` 의 허용 키를 정하고 **양방향으로** 어긋나면 메시지 전체 거부 · **손잡이만 hit area 를 되돌려 받으면서 Inspector 와 경계를 그었다**(`inspectorEditChromeAncestor()` — 손잡이 위의 입력은 Inspector 의 것이 아니다, §18-11) · native ↔ sandbox 최종 JSON 동일 실측 · CSP 위반 0 · **손가락 조작은 의도적 미지원**). **단일 요소 회전**(TRANSFORM-1C, §19 — 단독 선택 요소 위쪽에 **회전 손잡이 하나**를 달고 `rotation` **한 칸**만 쓴다 · **상자 네 칸은 바뀌지 않는다**(회전 중심이 요소 상자의 정중앙 — `transform-origin` 기본값이라 별도 필드가 없다) · `height:"auto"` 도 그대로 · 여럿을 고르면 회전 손잡이가 **없다**(`rotationPosition:"none"`) · 누적 회전량은 **Moveable 의 `dist` 를 실측해** 쓴다(transform 문자열 역산 · 바깥 상자 계산 · delta 누적을 하지 않는다. 12 걸음 호에서 최대 오차 0.3° 실측) · 부모 Preview 의 `scale()` 은 각도에 보정하지 않는다(균등 배율은 각도를 안 바꾼다) · **제스처 중에는 연속 각도, 저장은 한 바퀴 안**(350°+30° 는 화면 380° · 저장 20°)이고 접는 자리는 helper 하나(`normalizeCanvasRotation`) · **손대지 않은 요소의 저장값은 일괄 정규화하지 않는다**(-30 · 400 은 그대로) · `rotation` 이 없는 요소는 화면상 0° 이고 **고르기만 해서는 그 칸이 생기지 않는다**(부모 geometry 와 순수 함수가 같은 자로 0 을 읽는다) · `kind:"rotate"` 의 `expected`/`next` 는 **각도 한 칸뿐**이라 좌표가 섞이면 메시지 전체 거부 · 각도 범위는 계약의 **유한한 숫자** 하나(좌표의 ±100000 을 빌려 오지 않는다 — `expected` 가 저장된 값 그대로 올라오기 때문) · **회전 손잡이가 `.moveable-line` 을 하나 더 만든다**(막대) — "테두리 네 줄"을 세는 자리는 `:not(.moveable-rotation-line)` 으로 가른다 · native ↔ sandbox 최종 JSON 동일 실측 · CSP 위반 0 · **손가락 조작은 의도적 미지원**). **기본 조작 마일스톤**(MILESTONE-1, §20 — **계약이 한 글자도 바뀌지 않은 라운드**다. 이동 · 리사이즈 · 회전이 갖춰진 지점을 주인이 **배포된 화면에서 손으로** 시험할 수 있게, `home_canvas` 와 표시 위치를 **이미 갖춘** Import 용 수동 테스트 스킨 한 벌(`skin/test-skins/imory-home-canvas-manual-v1.json` + builder)과 그 파일 자체를 끝까지 지나는 통합 smoke 를 두었다 — Studio 에 아직 Canvas 생성 · 요소 추가 UI 가 없고(`ELEMENTS-1`) 기존 · 기본 스킨에는 표식이 **자동으로 생기지 않으므로**(§3) 그 파일이 없으면 시험할 방법이 없었다. **제품 기본 스킨 · 가입 시 자동 적용 · 기존 계정 migration · 자동 Publish · DB 변경 · 제품 코드 전부 무변경**이고 `renderMode` 도 없다(기본 native — sandbox parity 는 사본에만 켜서 본다). 요소 11개는 잠긴 전체 배경 · photo · sticker · logo · auto 높이 글자 둘 · 숫자 height 글자와 도형 · line · category_nav · 음수 x 장식이고 초기 회전이 셋 · 겹침이 둘이다. 그림은 **저장소에 넣지 않고** 슬롯만 선언한다(빈 슬롯에서도 조작이 전부 확인된다 — 슬롯 값은 `isSafeSkinUrl()` 이 `https:` 만 통과시키므로 **루트 상대 주소**여야 한다, §20-4). `--browser=webkit` 을 받지만 **포인터 조작 절은 Chromium 에서만** 돈다(형제 e2e 여섯과 같다)). **직접 조작 사용성 넷**(MANUAL-UX-FIX-1, §21 — 계약이 **네 군데** 바뀐 라운드다. ① 회전의 **30° 자석**: 양자화가 아니고 가장 가까운 30° 배수와의 차이가 **±4° 안일 때만** 붙는다 · 판정은 접기 전 연속 각도 · 단조 비감소라 화면이 거꾸로 돌지 않는다 · "돌지 않았다"는 **자석 붙기 전의 날것**으로 봐야 한다(안 그러면 31° 요소를 누르기만 해도 30° 가 확정된다) · 자석이 제자리로 되돌린 제스처도 확정 0. ② **모서리 넷은 시작 비율 유지 · 변 중앙 넷만 한 축 자유** — §18-2 의 "손잡이 여덟이 모두 자유 비율"이 여기서 바뀌었다 · Shift 가 아니라 **손잡이 자체의 뜻** · `keepRatio` prop 이 아니라 `beforeResize` 의 `setSize()` 로 하므로 `dist` 와 `drag.beforeTranslate` 가 둘 다 우리 값에서 나와 **삼각함수를 새로 적지 않는다** · 지켜야 하는 것은 px 상자가 아니라 **`dist` 의 비율** · 끄는 축은 **대각선 정사영**(한 축을 고르면 아래로만 끈 `se` 가 멈추거나 납작한 상자에서 가로가 171px 튄다) · `"auto"` 는 모서리에서 **렌더된 실제 높이**를 기준으로 숫자가 된다. ③ **자르기를 고르지 않은 Canvas 그림은 `contain`** — `cover` 에서 바뀌었다 · 조사 결과 지금 payload 에 **Crop 칸이 하나도 없다**(`slot`(+`fallback`) 뿐)라 기본값으로 확정하고 Crop 연결은 남은 차이(§11-3) · 범위는 렌더러가 붙인 `[data-imory-canvas-image]` 하나이고 네 화면 parity 가 이 값까지 대조한다. ④ **글자 요소의 편집 chrome 여유** — 선이 글자를 가로지르지 않게 `5 + 넘친 양` 만큼 밖으로 밀되 **저장 geometry 는 한 픽셀도 안 바뀐다**: Moveable 의 `padding` prop 이 `renderPoses`/`renderLines` 만 밀고 `pos1~pos4` · `state.width/height` 는 건드리지 않기 때문이다(번들 실측) · 여유는 **글자를 직접 보여 주는 요소만**(렌더러 표식으로 가른다) · 내용 크기를 따라가기 지문에 넣어 재줄바꿈에서 다시 잰다. **새 데이터 칸 · 새 메시지 · 새 파일 0**). **왼쪽 Canvas Inspector**(INSPECTOR-1A, §22 — Canvas 요소를 고르면 왼쪽 패널이 그 요소의 화면이 된다. **소유권을 정하는 곳은 늘지 않았다** — 기존 template 팝오버와 새 Canvas 패널이 `#studioLeftPanelSelect` 한 자리에 살지만 둘이 동시에 켜지지 않는 것은 `SELECT-1A` 의 선택 라우터가 그대로 지키고, 패널은 값을 들고 있지 않고 그릴 때마다 선택과 draft 에서 **다시 읽는다**(세 번째 상태 저장소 없음). 고칠 수 있는 것은 **글자 요소의 `props.text` 한 칸**(v1 에서 `props` 가 바뀌는 첫 경로 · 평문이라 `<b>` 가 실행되지 않고 줄바꿈이 남는다 · 2000자 · 빈 문자열 허용)과 **geometry 다섯 칸**(음수 x 허용 · `Auto` 높이 스위치는 허용 타입에만 · Auto 인 동안 Height 숫자 칸은 잠긴다 · **Width 숫자 입력은 모서리 리사이즈가 아니라 비율을 따라가지 않는다** · rotation 은 한 바퀴 안으로 접힌다)이고, photo · sticker · logo · category_nav · shape 는 **읽기 전용 요약 + 어디서 고치는지** 안내뿐이다(이미지는 Images · 스타일은 스킨 CSS). **한 번의 편집 = Undo 한 칸** — 글자는 입력마다 draft 를 고치되(Preview 즉시 · 입력 중 Save 에도 최신값) 기록만 focus~blur 한 세션에 한 칸(`coalesceHistory`)이고 Escape 는 시작값 복귀 · 기록 0, 숫자는 Enter/blur 에서 한 번만 쓰므로 중간 상태(`-` · 빈 문자열)가 JSON 에 들어가지 않는다. **쓰기 관문은 하나, 입구는 둘** — 프레임의 `commitStudioCanvasElementTransform` 은 여전히 move/resize/rotate 뿐이고 `text` 와 `coalesce` 는 부모 realm 의 패널 입구(`commitStudioCanvasInspectorEdit`)에만 있다(프레임 안에서는 저자 JS 가 돈다). 불변 수정도 같은 `writeSkinHomeCanvasElementFields()` 에 `container:"props"` 한 줄만 더한 것이라 보존 범위가 갈라지지 않는다. 다시 그리는 신호는 `studio-canvas-panel` 이벤트 하나(선택 확정 + `syncStudioCanvasFrameMode` = draft 변경 관문)이고, 화면 **모양**이 같으면 DOM 을 다시 만들지 않으며 **포커스가 있는 칸은 건너뛴다**. native 와 sandbox 가 같은 부모 패널이라 CSP 무변경. **`hidden`/`locked` 토글은 일부러 뺐다** — 레이어 목록이 없어 켠 뒤 되돌릴 길이 없다, §22-7). **§1~§10 과 §12 · §13 · §14 · §15 · §16 · §17 · §18 · §19 · §20 · §21 · §22 가 구현이고 §11 은 아직 없는 것**(그룹 조작 · 스냅 · 가이드 · 키보드 조작 · 글꼴/색/정렬 같은 **스타일 칸**(Canvas JSON 에 그 값이 없다 — §8) · 레이어 목록 · `hidden`/`locked` 토글 · 다중 일괄 편집 · Crop 연결 · preset · 좌우 Canvas · 효과 hook)이다. **§11-4 에 조합형 v2 로 가는 문이 났고(COMPOSITION-CONTRACT-1 — 문서만 바뀐 라운드), 그 뒤 `V2-DATA-1` 이 §9-(3) 을, `V2-FLOW-RENDER-1` 이 §23 을, `V2-MAIN-VISUAL-1` 이 §24 를, `V2-EDITOR-1A` 가 §25 를, `V2-EDITOR-1B` 가 §26 을 채웠다** — `version:2` 는 이제 엄격히 검증되고 네 화면에 **그려지며**, Studio 에서 **고르고 고칠 수 있다**(블록은 순서 · 정렬 · 여백 · 폭 · 높이 · 글자, 프레임 내부 요소와 overlay 는 **자리 · 크기 · 각도**를 패널 다섯 칸과 **직접 조작**으로. 선택 하나마다 자를 하나 정하고 — 프레임 내부 좌표 / 프레임 상자 / 도화지 — `follow:"pin"` 은 `pin.offset` 두 칸을 쓰며 크기를 바꿀 때 `origin` 몫을 좌표에 되돌린다, §26). **재료 추가**(V2-ADD-1, §27 — 흐름에 블록 다섯 · 페이지 자유 장식에 v1 여섯 · `main_visual` 은 계약상 필수인 **primary 사진**과 아직 그림이 없는 **빈 이미지 슬롯**을 함께 만든다 · 기본값과 새 id 는 **순수 함수**가 정하고 넣은 뒤 **캔버스 전체를 다시 검증**한다 · 고치는 관문과 **다른 문**이다(추가에는 선택 · 순번 · `expected` 가 없다) · 한 번 = Undo 한 칸이고 만든 것이 곧바로 골라진다 · 패널은 **선택이 없어도** 열리지만 v1 캔버스에서는 그리지 않는다 · 블록을 고를 때 남아 있던 **쓸 수 없는 Moveable 손잡이**를 감췄다 = §26-8 의 남은 차이). **소속과 따라가기**(V2-ELEMENTS-1, §28 — 여기서 처음으로 **어디에 속하는가가 바뀐다**: `main_visual` 안에 장식을 더하고, 이미 만든 페이지 장식을 그 프레임으로 **묶고**, 다시 **빼고**, 잘못 만든 것을 **지운다** · 소속은 언제나 **명시적**이다(lasso 가 묶지 않고, 묶을 프레임을 select 로 고른다) · 묶기 · 빼기 · `follow` 전환 · 기준점 변경이 전부 **화면 자리를 지킨다** · 그 계산에 필요한 값 중 저장값이 줄 수 없는 하나(프레임이 흐름 안에서 **어디에 놓였는가** — 앞 블록들의 실제 높이가 정하고 `height:"auto"` 는 스킨 조판이 정한다)만 프레임이 **도화지 폭의 분수로 보고**한다: 새 메시지 `CANVAS_LAYOUT` 하나이고 크기는 싣지 않는다(§28-3) · `transform` → `pin` 은 **왼쪽 위 기준**으로 시작하고 `height:"auto"` 인데 세로 기준점이 위가 아니면 숫자를 지어내지 않고 거절한다(`auto-origin`) · `id` 는 바뀌지 않고 안 쓰는 칸도 지우지 않는다 · 구조 입구는 **추가와 같은 문**이고(`expected` 대신 전체 재검증) **primary 사진은 빼지도 지우지도 못한다** · `pin.target`/`anchor`/`origin` UI 가 여기서 났다 = §26-8 의 남은 차이 · 남은 차이는 블록 폭이 가용 폭을 넘을 때 flex 가 줄이면서 생기는 `frame.scale` 어긋남 하나(§28-7)) — 범위는 [IMORY_HOME_CANVAS_ROADMAP.md](./plans/IMORY_HOME_CANVAS_ROADMAP.md)(PLAN) | [skin/skin-home-canvas.js](../skin/skin-home-canvas.js) · [skin/skin-home-canvas-render.js](../skin/skin-home-canvas-render.js) · [skin/skin-home-canvas-render.css](../skin/skin-home-canvas-render.css) · [skin/skin-render.js](../skin/skin-render.js) · [skin/skin-template.js](../skin/skin-template.js) `resolveSkinTemplate` · [skin/skin-package-import.js](../skin/skin-package-import.js) · [core/lib/skin-sandbox-server.js](../core/lib/skin-sandbox-server.js) `SANDBOX_ALLOWED_PATHS` · [studio/preview/preview-sandbox.js](../studio/preview/preview-sandbox.js) · [studio/studio-home-canvas-vendor.js](../studio/studio-home-canvas-vendor.js) · [studio/vendor/home-canvas/](../studio/vendor/home-canvas/) · [studio/inspector/studio-canvas-selection.js](../studio/inspector/studio-canvas-selection.js) · [studio/inspector/studio-inspector.js](../studio/inspector/studio-inspector.js) `routeStudioInspectSelectMessage` · [skin/skin-inspect-target.js](../skin/skin-inspect-target.js) · [skin/skin-home-canvas-editor-runtime.js](../skin/skin-home-canvas-editor-runtime.js) · [studio/preview/preview-bridge.js](../studio/preview/preview-bridge.js) · [skin/sandbox/skin-sandbox-frame.js](../skin/sandbox/skin-sandbox-frame.js) · [skin/sandbox/skin-sandbox-protocol.js](../skin/sandbox/skin-sandbox-protocol.js) · [studio/studio-preview.js](../studio/studio-preview.js) · [studio/inspector/studio-canvas-v2-space.js](../studio/inspector/studio-canvas-v2-space.js) · [skin/skin-home-canvas-write-v2.js](../skin/skin-home-canvas-write-v2.js) · [studio/inspector/studio-canvas-inspector.js](../studio/inspector/studio-canvas-inspector.js) · [skin/test-skins/build-home-canvas-manual-v1.mjs](../skin/test-skins/build-home-canvas-manual-v1.mjs) | `node skin/skin-home-canvas-test.mjs` · `skin/skin-home-canvas-render-e2e-test.mjs` · `skin/skin-home-canvas-sandbox-e2e-test.mjs` · `studio/studio-home-canvas-e2e-test.mjs` · `studio/studio-home-canvas-vendor-e2e-test.mjs` · `studio/studio-home-canvas-select-e2e-test.mjs` · `studio/studio-home-canvas-moveable-e2e-test.mjs` · `studio/studio-home-canvas-selecto-e2e-test.mjs` · `studio/studio-home-canvas-transform-e2e-test.mjs` · `studio/studio-home-canvas-resize-e2e-test.mjs` · `studio/studio-home-canvas-rotate-e2e-test.mjs` · `node skin/sandbox/skin-sandbox-unit-test.mjs` [canvas-move] [canvas-resize] [canvas-rotate] · `studio/studio-home-canvas-manual-skin-e2e-test.mjs` · MANUAL-UX-FIX-1 은 절 넷을 더했다: `node skin/skin-home-canvas-test.mjs` [ux-fix](자석 · 정사영 경계값) · `studio/studio-home-canvas-rotate-e2e-test.mjs --only=snap` · `studio/studio-home-canvas-resize-e2e-test.mjs --only=ratio` · `studio/studio-home-canvas-moveable-e2e-test.mjs --only=chrome` · `skin/skin-home-canvas-render-e2e-test.mjs --only=image` · INSPECTOR-1A 는 파일 하나를 더했다: `studio/studio-home-canvas-inspector-e2e-test.mjs`(`--only=panel|text|geometry|round|v2|v2free|sandbox` — V2-EDITOR-1A 가 `v2` 절을, 1B 가 `v2free` 절을 더했다) · `node skin/skin-home-canvas-test.mjs` [v2-free] · `node skin/sandbox/skin-sandbox-unit-test.mjs` [canvas-space] · V2-ADD-1 은 절 둘을 더했다: `node skin/skin-home-canvas-test.mjs` [v2-add] · `studio/studio-home-canvas-inspector-e2e-test.mjs --only=v2add` · V2-ELEMENTS-1 은 절 셋을 더했다: `node skin/skin-home-canvas-test.mjs` [v2-elements] · `node skin/sandbox/skin-sandbox-unit-test.mjs` [canvas-layout] · `studio/studio-home-canvas-inspector-e2e-test.mjs --only=v2elements` |
| [IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md](./features/skin/IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md) | 아이모리 기본 스킨(EDITORIAL-DEFAULT-SKIN-2) · 주인의 스킨 설정은 `regions` 의 이름 붙은 항목(`theme_colors` · `home_photos` · `dday` · `mobile`) · 색 네 역할 · HOME 사진 구성. **§15~§21** 기본 스킨 직접 조절(EDITORIAL-CUSTOMIZATION-1 — 사진 영역 너비 · 영역 글자 크기 · `title_logo`), **§22** 이미 만든 스킨 올려 주기(EDITORIAL-EXISTING-UPGRADE-1) | [skin/skin-default-editorial.js](../skin/skin-default-editorial.js) · [skin/skin-settings.js](../skin/skin-settings.js) · [skin/skin-editorial-upgrade.js](../skin/skin-editorial-upgrade.js) · [studio/sides/home-settings-panel.js](../studio/sides/home-settings-panel.js) | `skin/skin-editorial-default-e2e-test.mjs` · `studio/studio-editorial-default-e2e-test.mjs` · `studio/studio-editorial-customization-e2e-test.mjs` · `studio/studio-crop-priority-e2e-test.mjs --only=editorial` |

### 1-3. Skin Studio — 화면 구조 · Select · 직접 편집 · AI

`docs/features/studio/history/` 의 AI-6A · AI-6B · AI-6B.1 · AI-6C 는 **라운드
기록**이다. 지금 코드가 쓰는 식별자 · patch 방식 · 보호 계약 · 진단 코드가 아직
그 안에만 적혀 있어 여기 함께 둔다 — 다만 **현행 계약의 최우선 근거는 위 두
설계 문서**(`IMORY_STUDIO_SHELL_DESIGN.md` · `IMORY_DIRECT_UX_DESIGN.md`)이고,
둘이 다르면 그쪽이 맞다.

| 문서 | 다루는 것 | 관련 코드 | 관련 테스트 |
| --- | --- | --- | --- |
| [IMORY_STUDIO_SHELL_DESIGN.md](./features/studio/IMORY_STUDIO_SHELL_DESIGN.md) | Studio 화면 구조(상단 세 그룹 · 왼쪽 패널 Select/Images/Dock · Undo·Redo 는 상단 ↶↷ 하나) · 좁은 화면 · 모바일 편집 시트 세 단계(MOBILE-SHEET-1, §5-1) | [studio/studio-shell.js](../studio/studio-shell.js) · [studio/studio-sheet.js](../studio/studio-sheet.js) · [studio/studio-sheet-drag.js](../studio/studio-sheet-drag.js) · [studio/studio-history.js](../studio/studio-history.js) · [studio/preview/preview-sheet-inset.js](../studio/preview/preview-sheet-inset.js) · [studio/studio-shell.css](../studio/studio-shell.css) | `studio/studio-shell-e2e-test.mjs` · `studio/studio-mobile-sheet-e2e-test.mjs` |
| [IMORY_DIRECT_UX_DESIGN.md](./features/studio/IMORY_DIRECT_UX_DESIGN.md) | 클릭하고 바로 고치는 Select(DIRECT-UX-1) · 선택 우선순위 · 사람이 읽는 요소 이름 · 겹친 요소 메뉴 · 더블클릭 글자 편집 · 본체 끌기 · Quick Bar. **§20** 패널은 색이 아니라 상자에서 시작(COMMON-SELECT-BOX-1) | [skin/skin-inspect-target.js](../skin/skin-inspect-target.js) · [studio/inspector/studio-inspector-box.js](../studio/inspector/studio-inspector-box.js) · [studio/inspector/studio-inspector-box-model.js](../studio/inspector/studio-inspector-box-model.js) · [studio/inspector/studio-inspector-names.js](../studio/inspector/studio-inspector-names.js) · [studio/inspector/studio-inspector-quickbar.js](../studio/inspector/studio-inspector-quickbar.js) · [studio/preview/preview-inspect-direct.js](../studio/preview/preview-inspect-direct.js) | `studio/studio-direct-ux-e2e-test.mjs` · `studio/studio-sandbox-select-parity-e2e-test.mjs` |
| [AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md](./features/studio/history/AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md) | Element Inspector · Direct Edit 의 **기반 계약** — 요소 식별자(3절) · HTML/CSS patch 방식(7절) · 보호 계약(8절) | [studio/inspector/studio-inspector-model.js](../studio/inspector/studio-inspector-model.js) | `studio/studio-inspector-e2e-test.mjs` |
| [AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md](./features/studio/history/AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md) | 선택 요소 AI 수정 — `selectionContext` 계약 · 선택 범위 적용 | [functions/api/skin-ai.js](../functions/api/skin-ai.js) | `studio/studio-selected-ai-e2e-test.mjs` |
| [AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md](./features/studio/history/AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md) | AI 실패 진단 — error code / stage / 로그 규칙 | [functions/api/skin-ai.js](../functions/api/skin-ai.js) | `studio/studio-selected-ai-e2e-test.mjs` |
| [AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md](./features/studio/history/AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md) | 직접 편집 — 텍스트 내용 · 이미지 크기(임시/확정 분리 · 모서리 드래그). 기본 스킨에서 **폭 규칙을 받는 주인**은 `IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md` §15~ 가 바꿨다 | [studio/inspector/studio-inspector-image-size.js](../studio/inspector/studio-inspector-image-size.js) | `studio/studio-direct-edit-e2e-test.mjs` |
| [AI_SKIN_PHASE_AI6D_IMAGE_CROP.md](./features/images/AI_SKIN_PHASE_AI6D_IMAGE_CROP.md) | 이미지 자르기의 **저장 방식**(프레임 래퍼 + 두 규칙 · `--imory-crop` 표식 · x/y 정규화). 좌표·팝오버·기어비는 AI-6E 가 바꿨다 | [studio/preview/preview-bridge.js](../studio/preview/preview-bridge.js) | `studio/studio-crop-e2e-test.mjs` |
| [AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md](./features/images/AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md) | 프레임 좌표(보이는 사각형) · 팝오버 자리 · 구도 이동 기어비 | [studio/preview/preview-bridge.js](../studio/preview/preview-bridge.js) | `studio/studio-crop-e2e-test.mjs --only=frame` |
| [AI_SKIN_PHASE_AI6F_FREE_CROP_AND_SLIDERS.md](./features/images/AI_SKIN_PHASE_AI6F_FREE_CROP_AND_SLIDERS.md) | 자유 비율 자르기(변 · 모서리 핸들) · Inspector 슬라이더 규칙 | [studio/inspector/](../studio/inspector) | `studio/studio-crop-e2e-test.mjs --only=free` · `--only=sliders` |
| [IMORY_IMAGE_CROP_PRIORITY_DESIGN.md](./contracts/IMORY_IMAGE_CROP_PRIORITY_DESIGN.md) | 스킨 CSS 의 `!important` 보다 자르기가 이긴다(`@layer imory-crop-guard`) · 프레임이 스킨의 자리를 채우는 방식(`--imory-crop`) | [skin/skin-render.js](../skin/skin-render.js) `buildSkinCropGuardCss` · [studio/preview/preview-bridge.js](../studio/preview/preview-bridge.js) `inspectorCropFillOf` | `studio/studio-crop-priority-e2e-test.mjs` · `skin/skin-crop-published-e2e-test.mjs` |

### 1-4. 글 · 카테고리 · 폴더 · 갤러리

| 문서 | 다루는 것 | 관련 코드 | 관련 테스트 |
| --- | --- | --- | --- |
| [IMORY_FOLDER1_DESIGN.md](./features/content/IMORY_FOLDER1_DESIGN.md) | 카테고리 안 3단계 폴더 · `category.tree` · 중첩 repeat | [posts/](../posts) | `posts/posts-folder-manage-e2e-test.mjs` · `skin/skin-folder-tree-e2e-test.mjs` |
| [IMORY_FOLDER2_DESIGN.md](./features/content/IMORY_FOLDER2_DESIGN.md) | 폴더 라우트 · Series Viewer · `folderHref` · `templates.folder` · repeat 안 post-body region | [skin/](../skin) | `skin/skin-folder-page-e2e-test.mjs` |
| [IMORY_FOLDER3_DESIGN.md](./features/content/IMORY_FOLDER3_DESIGN.md) | 글쓰기 폼의 폴더 선택 · 폴더 안에서 WRITE(`?write=1`) · 소유자 도구(＋/edit) 자리(`owner-tools` region) | [posts/](../posts) | `skin/skin-folder-page-e2e-test.mjs --only=write` |
| [IMORY_GALLERY1_DESIGN.md](./features/content/IMORY_GALLERY1_DESIGN.md) | 갤러리 표시 · 글 대표 이미지 · `category.gallery`/`pagination` · `?page=N`. **§13-6** 올리는 이미지 준비(메타데이터 제거 + 압축, 모든 업로드 경로 공용) | [core/lib/image-upload.js](../core/lib/image-upload.js) | `skin/skin-gallery-e2e-test.mjs` |
| [CATEGORY_GALLERY_MOBILE_20260911.md](./contracts/CATEGORY_GALLERY_MOBILE_20260911.md) | 카테고리 표시(`categories.list_style`)와 **본문 폭 계약** — 파일 이름에 날짜가 붙어 있지만 `core/content-width` 의 **지금 규칙**을 적은 계약 문서다(기록이 아니다) | [core/content-width.css](../core/content-width.css) · [core/content-width.js](../core/content-width.js) | `skin/skin-gallery-e2e-test.mjs` |
| [IMORY_POST_BODY_IMAGE_DESIGN.md](./features/content/IMORY_POST_BODY_IMAGE_DESIGN.md) | 본문 사진(post/gallery 공통 에디터) · 대표 사진 지정 · 발췌(PREVIEW/export/copy)의 사진 | [posts/](../posts) | `skin/skin-gallery-e2e-test.mjs --only=body` · `--only=excerpt` |
| [IMORY_EDITOR_DECOR_DESIGN.md](./features/content/IMORY_EDITOR_DECOR_DESIGN.md) | 형광펜 높이 · 문단 강조선 · 캔버스 배경 사진 · 에디터 컬러피커 · 색 고르기 두 단계 · 본문 블록(복사 상자/메모/구분선) · HTML 디자인 PNG | [posts/](../posts) | `posts/posts-editor-decor-e2e-test.mjs` |
| [IMORY_QUOTE_PRESET_RENDER_AUDIT.md](./features/content/IMORY_QUOTE_PRESET_RENDER_AUDIT.md) | Quote Preset ↔ 에디터 PREVIEW ↔ export 렌더 기준 실측 · auto/uniform · 출력 조건(비율 · 가로 픽셀)은 프리셋 CANVAS 에서만 저장 | [admin/quote/](../admin/quote) · [posts/preview/](../posts/preview) | `admin/quote/quote-render-parity-e2e-test.mjs` |
| [IMORY_HIGHLIGHT1_DESIGN.md](./archive/2026-09/IMORY_HIGHLIGHT1_DESIGN.md) | 글 뷰어 도구 메뉴(⋮) · 하이라이트/노트 · 하이라이트 화면 · 진입점 칩 · 위치 확인 3상태 · 폴더 차례 끌기. **이름 · 카테고리 계약만 HIGHLIGHT-2 가 대체했다**(그 부분은 근거로 쓰지 않는다) | [posts/](../posts) | `posts/posts-highlight-e2e-test.mjs` · `studio/studio-highlight-preview-e2e-test.mjs` |
| [IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md](./contracts/IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md) | HIGHLIGHT 카테고리 · singleton 타입(banner/highlight) · `memo`→`highlight` 개명과 호환 alias · Settings ADVANCED SETTINGS · post/gallery 공용 페이지네이션 · 타입 변경 시 글 이동 | [core/lib/category-types.js](../core/lib/category-types.js) | `admin/admin-settings-e2e-test.mjs --only=advanced` · `supabase/highlight2-migration-test.mjs` |
| [IMORY_PUBLIC_NUMBER_DESIGN.md](./contracts/IMORY_PUBLIC_NUMBER_DESIGN.md) | 공개 URL 번호(`categories.public_no` · `posts.public_no` — 블로그마다 1부터) · 번호↔내부 id 환전소 · 환전이 일어나는 세 경계 | [core/lib/public-number.js](../core/lib/public-number.js) | `skin/skin-public-number-e2e-test.mjs` · `supabase/public-number-migration-test.mjs` |
| [IMORY_SHARE_CARD_DESIGN.md](./features/content/IMORY_SHARE_CARD_DESIGN.md) | 글 공유 카드(X large image) · SETTINGS > SHARE(BANNER/CARD) · og/twitter meta 주입 · `/api/og/post` | [functions/api/og/post.js](../functions/api/og/post.js) · [functions/_middleware.js](../functions/_middleware.js) | `admin/share-card-e2e-test.mjs` · `supabase/share-label-seq-migration-test.mjs` |

---

## 2. ACTIVE — 계속 갱신되는 살아 있는 문서

| 문서 | 다루는 것 | 비고 |
| --- | --- | --- |
| [Concept.md](./architecture/Concept.md) | 서비스 개념 · 화면과 데이터의 현재 모습 | **사실 / 계획 / 확인 필요**를 표시로 구분해 쓴다 |
| [Design.md](./architecture/Design.md) | 디자인 토큰 · 컴포넌트 · 패턴 | 토큰 실체는 [core/design-tokens.css](../core/design-tokens.css) |
| [ToDo.md](./plans/ToDo.md) | 상태 체크리스트(살아 있는 개발 계획서) | `[x]` / `[-]` / `[ ]` 표시 규칙은 문서 §5-1 |

---

## 3. PLAN — 방향과 범위 (구현된 것으로 읽지 않는다)

| 문서 | 다루는 것 | 비고 |
| --- | --- | --- |
| [IMORY_HOME_CANVAS_ROADMAP.md](./plans/IMORY_HOME_CANVAS_ROADMAP.md) | HOME 디자인 캔버스의 장기 로드맵과 단계별 작업 범위 | **아직 전체 구현되지 않았다.** 지금까지 끝난 것은 `SPIKE-1` · `SPIKE-1B`(Moveable 0.53.0 + Selecto 1.26.3 **채택 확정** — 운영 파일을 남기지 않는 실험이라 결론이 이 문서 §8-1 에만 있다. **다시 실행하지 않는다**) · `CONTRACT-1B` · `CONTRACT-1C`(데이터 계약 + 도화지 높이) · `RENDER-1A` · `RENDER-1B`(**정적 Renderer** — 네 화면 전부에 실제로 그린다) · `VENDOR-1`(Moveable·Selecto UMD 를 저장소에 고정 + Studio 전용 지연 로더 — **조작은 한 줄도 없다**) · `SELECT-1A`(캔버스 요소를 **고르고 푸는 것까지** — 고치는 경로는 없다) · `SELECT-1B-1`(**조건부 vendor 활성화와 표시 전용 회전 선택 틀** — 손잡이도 조작도 없다) · `SELECT-1B-2`(**Selecto lasso 와 다중 선택** — 고르는 것까지다) · `TRANSFORM-1A`(**단일 요소 이동** — 여기서부터 Canvas JSON 이 바뀐다) · `TRANSFORM-1B`(**단일 요소 리사이즈** — 손잡이 여덟 · 네 칸 · `height:"auto"` 전환) · `TRANSFORM-1C`(**단일 요소 회전** — 손잡이 하나 · `rotation` 한 칸 · 상자 불변. **이동 · 리사이즈 · 회전으로 기본 조작이 갖춰졌다**. 그룹 조작 · 스냅 · 손가락 조작은 없다) · `MILESTONE-1`(**기본 조작 마일스톤** — 새 편집 기능 없이, 그 조작을 배포된 화면에서 손으로 시험할 수 있게 수동 테스트 스킨과 통합 smoke 를 두었다. 제품 코드 · 기본 스킨 · DB 무변경) · `MANUAL-UX-FIX-1`(**직접 조작 사용성 넷** — 30° 자석 · 모서리 비율 유지 · 이미지 `contain` · 글자 편집 chrome 여유. 계약 §21) · `INSPECTOR-1A`(**왼쪽 Canvas Inspector** — 글자 내용 한 칸 + geometry 다섯 칸 + 타입별 읽기 전용 요약. 계약 §22) · `V2-DATA-1`(**조합형 `version:2` 의 데이터 검증과 보존** — 계약 §9-(3)) · `V2-FLOW-RENDER-1`(**v2 자동 배치 화면 출력** — 흐름 + 페이지 자유 장식이 네 화면에 그려진다. 계약 §23) · `V2-MAIN-VISUAL-1`(**`main_visual` 내부** — primary 사진과 주변 장식 · `transform`/`pin` · `height:"auto"` 는 primary 사진 상자의 비율. 계약 §24) · `V2-EDITOR-1A`(**v2 선택과 기본 배치 조정** — 블록의 순서 · 정렬 · 여백 · 폭 · 높이 · 글자 · `main_visual` 진입 · v2 전용 불변 writer. 계약 §25) · `V2-EDITOR-1B`(**v2 직접 조작과 자** — 계약 §26) · `V2-ADD-1`(**v2 재료 추가** — 계약 §27) · `V2-ELEMENTS-1`(**소속과 따라가기** — 묶기 · 빼기 · 삭제 · `follow`/`pin` 의 기준. 계약 §28) 스물셋이고, 그 결과는 전부 [IMORY_HOME_CANVAS_CONTRACT.md](./contracts/IMORY_HOME_CANVAS_CONTRACT.md) 가 갖는다. **그 위에 [§14 조합형 HOME Canvas v2 설계](./plans/IMORY_HOME_CANVAS_ROADMAP.md#14-조합형-home-canvas-v2-설계-home-canvas-composition-contract-1)**(COMPOSITION-CONTRACT-1)가 있다 — **자동 배치 블록(logo · category_nav · text · divider · main_visual)과 그 안팎의 자유 배치 장식**으로 화면을 두 층으로 가르는 `canvas.version:2` 의 저장 · 편집 계약, `pin`/`transform` 따라가기, lasso 와 **명시적 묶기**, v1 호환과 미래 version fallback 실측, 수동 테스트에서 나온 v1 UX 수정(§14-14 — **그 넷은 `MANUAL-UX-FIX-1` 에서 구현됐고 결과는 계약 §21 이 갖는다**), 단계별 후속 작업 ID(§14-13 — `MANUAL-UX-FIX-1` · `INSPECTOR-1A` 완료(§14-15 는 이제 **그때의 요구 기록**이고 결과는 계약 §22 다 — 정렬/margin 은 v1 에 없어 빼고 `hidden`/`locked` 는 되돌릴 길이 없어 미뤘다) → `V2-DATA-1` 완료(계약 §9-(3)) → `V2-FLOW-RENDER-1` 완료(계약 §23) → `V2-MAIN-VISUAL-1` 완료(계약 §24) → `V2-EDITOR-1A` 완료(계약 §25) → `V2-EDITOR-1B` 완료(계약 §26) → `V2-ADD-1` 완료(계약 §27) → `V2-ELEMENTS-1` 완료(계약 §28) → **`V2-GROUP-1`(여럿을 한 번에 묶기 · primary 지정 · 그룹 조작) 가 다음** → `EFFECT-HOOK-1`. **`INSPECTOR-1A` 와 `V2-INSPECTOR-1` 은 다른 작업이다** — 앞은 지금 v1 자유 요소, 뒤는 v2 의 flow block · `main_visual` 이다). **v2 의 데이터 검증 · 화면 출력 · `main_visual` 내부 · 선택과 배치 조정 · 직접 조작 · 재료 추가 · 소속과 따라가기는 구현됐고(계약 §9-(3) · §23 · §24 · §25 · §26 · §27 · §28), 그 밖의 v2(그룹 조작 · primary 지정 · `hidden`/`locked` 토글 · 레이어 목록 · 효과 hook · responsive)는 아직 코드에 없다 — 이 문서의 §14 를 구현 완료로 읽지 않는다.** HOME Canvas 의 새 기능 범위를 정할 때나, 사용자가 지정한 작업 ID(`HOME-CANVAS-*`) 하나를 수행할 때만 연다 — 읽었다는 것이 구현 허가가 아니고, 뒤 단계를 미리 만들지 않는다 |
| [IMORY_AI_SKIN_CUSTOMIZE_PLAN.md](./plans/IMORY_AI_SKIN_CUSTOMIZE_PLAN.md) | AI 기반 Skin Customize 의 제품 방향 · PHASE 계획 | 공개 화면의 표시 공간 · 전환 · 관리 동선 · Preview 일치의 **상세 규칙은 [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./contracts/SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) 가 갖는다** |
| [SKIN_IMAGE_LIBRARY_PLAN.md](./features/images/SKIN_IMAGE_LIBRARY_PLAN.md) | Skin Image Library v0.1 데이터 모델과 흐름 | 문서 머리말 기준 "v0.1 구현 완료(프런트 + migration 파일) · 운영 Supabase 미적용". 지금의 이미지 슬롯 정규화 규칙은 [IMORY_CSS_IMPORT_DESIGN.md](./contracts/IMORY_CSS_IMPORT_DESIGN.md) 가 갖는다 |

---

## 4. HISTORICAL — 그 라운드의 조사 · 결정 기록

**현행 계약의 근거로 쓰지 않는다.** 원인을 조사할 때만 연다.

| 문서 | 무엇의 기록인가 | 지금 기준은 어디인가 |
| --- | --- | --- |
| [AI_SKIN_AUDIT.md](./archive/2026-09/AI_SKIN_AUDIT.md) | PHASE 0 — 기존 Customize/렌더러/스키마 조사. 코드 변경 없음 | [IMORY_AI_SKIN_CUSTOMIZE_PLAN.md](./plans/IMORY_AI_SKIN_CUSTOMIZE_PLAN.md) |
| [AI_SKIN_PHASE1A_DESIGN.md](./archive/2026-09/AI_SKIN_PHASE1A_DESIGN.md) | Skin Context v0.1 · HOME 렌더 경로(Slice 0~5) | [AI_SKIN_PHASE1C_PAGE_CONTRACT.md](./contracts/AI_SKIN_PHASE1C_PAGE_CONTRACT.md) · [SKIN_DESIGNER_CONTRACT.md](./contracts/SKIN_DESIGNER_CONTRACT.md) |
| [AI_SKIN_PHASE1B_DESIGN.md](./archive/2026-09/AI_SKIN_PHASE1B_DESIGN.md) | Skin Studio Foundation · Questionnaire(문서 안 v4 개정은 **폐기**되고 v5 가 뒤집었다) | [IMORY_STUDIO_SHELL_DESIGN.md](./features/studio/IMORY_STUDIO_SHELL_DESIGN.md) · [IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md](./features/skin/IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md) |
| [AI_SKIN_PHASE1D_A_LIST_DATA_AUDIT.md](./archive/2026-09/AI_SKIN_PHASE1D_A_LIST_DATA_AUDIT.md) | 글 목록 데이터 재료 감사(넣은 것 / 보류한 것) | [AI_SKIN_PHASE1C_PAGE_CONTRACT.md](./contracts/AI_SKIN_PHASE1C_PAGE_CONTRACT.md) |
| [AI_SKIN_PHASE1D_B_NAVIGATION_CONTRACT.md](./archive/2026-09/AI_SKIN_PHASE1D_B_NAVIGATION_CONTRACT.md) | `navigation.home` / `postCategories` / `bannerCategories` 를 더한 Slice | [SKIN_DESIGNER_CONTRACT.md](./contracts/SKIN_DESIGNER_CONTRACT.md) |
| [AI_SKIN_PHASE1G_WRITE_TARGET_AND_OWNER_TOOLS.md](./archive/2026-09/AI_SKIN_PHASE1G_WRITE_TARGET_AND_OWNER_TOOLS.md) | 작성 대상 선택 패널 제거 · 소유자 도구 위치 | 소유자 도구 자리는 [IMORY_FOLDER3_DESIGN.md](./features/content/IMORY_FOLDER3_DESIGN.md)(`owner-tools` region), 동선은 [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./contracts/SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) |
| [AI_SKIN_PHASE_AI7_MATERIAL_PARITY.md](./archive/2026-09/AI_SKIN_PHASE_AI7_MATERIAL_PARITY.md) | Skin / Studio / Public 재료 일치 라운드의 기록 | **디자이너가 읽을 최신 계약은 [SKIN_DESIGNER_CONTRACT.md](./contracts/SKIN_DESIGNER_CONTRACT.md)** (문서 머리말이 그렇게 적고 있다) |
| [core/design-tokens-mapping.md](../core/design-tokens-mapping.md) | 과거 리터럴 값 → 토큰 치환 **근거표**. 문서 스스로 "참고용이며 치환하지 않았다"고 적는다 | [Design.md](./architecture/Design.md) · [core/design-tokens.css](../core/design-tokens.css) |

---

## 5. SUPERSEDED — 뒤 라운드가 철회 · 대체했다

**근거로 쓰지 않는다.** 문서 머리말에 철회 사실이 적혀 있다.

| 문서 | 철회된 것 | 지금 기준은 어디인가 |
| --- | --- | --- |
| [AI_SKIN_PHASE1E_BANNER_AND_OWNER_LINKS.md](./archive/2026-09/AI_SKIN_PHASE1E_BANNER_AND_OWNER_LINKS.md) | WRITE 2단계 진입(→ 1F) · POST 의 `?manage=1` 과 소유자 도구의 위치·모양(→ 1G) | [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./contracts/SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) |
| [AI_SKIN_PHASE1F_WRITE_AND_MANAGE_FLOW.md](./archive/2026-09/AI_SKIN_PHASE1F_WRITE_AND_MANAGE_FLOW.md) | 카테고리 선택 패널(`#postComposePicker`) · 소유자 도구의 위치·모양(→ 1G) | [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./contracts/SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) · [IMORY_FOLDER3_DESIGN.md](./features/content/IMORY_FOLDER3_DESIGN.md) |

---

## 6. 문서가 아니라 **코드가 기준**인 것

계약이 코드 한 곳에만 있어서, 문서를 찾지 말고 그 파일을 읽어야 하는 것들이다.

| 무엇 | 파일 |
| --- | --- |
| "이 요소를 고를 수 있는가" 규칙 — Studio · native Preview · sandbox 프레임 세 realm 공용 | [skin/skin-inspect-target.js](../skin/skin-inspect-target.js) |
| 스킨 링크 클릭의 유일한 출구(native · sandbox 공용) | [skin/skin-link-nav.js](../skin/skin-link-nav.js) `navigateToSkinRoute()` |
| 프레임에서 어디로 갈 수 있는가(URL 허용/거부 · navId 표) | [skin/sandbox/skin-sandbox-nav.js](../skin/sandbox/skin-sandbox-nav.js) |
| 카테고리 타입 / 페이지 번호 공용 상수(DB 제약과 짝) | [core/lib/category-types.js](../core/lib/category-types.js) |
| 배포 버전 · 캐시(`APP_BUILD_VERSION` 하나가 유일한 원천) | [core/lib/build-version.js](../core/lib/build-version.js) · [_headers](../_headers) |
| 본문이 그려지는 네 화면의 공용 CSS | [posts/posts-body-shared.css](../posts/posts-body-shared.css) (설명은 [IMORY_SANDBOX_SKIN_DESIGN.md](./architecture/IMORY_SANDBOX_SKIN_DESIGN.md) §N) |
| 선택 복원의 근거(승격된 id vs 지문) · 관문 `bumpStudioWorkingRevision()` | [studio/inspector/studio-inspector-model.js](../studio/inspector/studio-inspector-model.js) `resolveInspectorSelectionTarget` (설명은 [IMORY_SANDBOX_SKIN_DESIGN.md](./architecture/IMORY_SANDBOX_SKIN_DESIGN.md) §R) |

---

## 7. 옛 이름 ↔ 지금 계약 (별칭 표)

옛 문서 · 옛 커밋 · 옛 스킨 JSON 에서 만나는 이름을 지금 계약으로 옮긴다.

| 옛 이름 | 지금 | 기준 문서 |
| --- | --- | --- |
| 메모 · `memo` (카테고리 타입) | `highlight` (호환 alias 유지) | [IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md](./contracts/IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md) |
| `/memos` 라우트 | `/highlights` (옛 주소도 같은 화면을 연다) | [IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md](./contracts/IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md) |
| `templates.memos` · `navigation.memos` · `memo-tools` region | `templates.highlights` · `navigation.highlights` · `highlight-tools` | [SKIN_DESIGNER_CONTRACT.md](./contracts/SKIN_DESIGNER_CONTRACT.md) |
| PHASE AI-7 "재료 일치" 계약 | 디자이너가 읽는 최신 계약 | [SKIN_DESIGNER_CONTRACT.md](./contracts/SKIN_DESIGNER_CONTRACT.md) |
| `AI_SKIN_*.md` (저장소 루트 · `docs/ai-skin/`) | **`docs/ai-skin/` 은 없어졌다**(DOCS-CLEANUP-1B-2). 라운드마다 자리가 다르다 — 1C 는 `docs/contracts/`, AI-6A~AI-6C 는 `docs/features/studio/history/`, AI-6D~AI-6F 는 `docs/features/images/`, 나머지는 `docs/archive/2026-09/` | 이 색인 §1 · §4 · §5 |
| 루트의 `IMORY_*_DESIGN.md` · `SKIN_*.md` · `Concept.md` · `Design.md` · `ToDo.md` | `docs/` 아래 기능별 폴더로 옮겼다(DOCS-CLEANUP-1B-1). **이름은 그대로**라 코드 주석의 파일명은 여전히 맞다 | 이 색인 §0 |
| Carrd 형 Customize · `home_customize` block JSON | SkinPackage + Skin Studio | [SKIN_DESIGNER_CONTRACT.md](./contracts/SKIN_DESIGNER_CONTRACT.md) |
| 자르기 좌표 · 팝오버 자리(AI-6D 본문의 값) | AI-6E 가 바꿨다 | [AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md](./features/images/AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md) |
| Inspector · AI 패널의 되돌리기 버튼 | 상단 ↶ ↷ 하나(STUDIO-SHELL-1.1 에서 걷었다) | [IMORY_STUDIO_SHELL_DESIGN.md](./features/studio/IMORY_STUDIO_SHELL_DESIGN.md) |
| 사진 "확대"로 자리를 넓히던 방식 | 사진 영역 너비는 **바깥 상자**가 받는다 | [IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md](./features/skin/IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md) §15~§21 |

---

## 8. 이 색인이 만들어진 방식

DOCS-CLEANUP-1A 에서 `CLAUDE.md` 의 거대한 문서 표와 테스트 표를 갈라
[INDEX.md](./INDEX.md)(이 문서)와 [TESTS.md](./TESTS.md) 로 옮겼다.
DOCS-CLEANUP-1B-1 에서 루트에 흩어져 있던 Markdown 28 개를, DOCS-CLEANUP-1B-2
에서 `docs/ai-skin/` 17 개와 `docs/CATEGORY_GALLERY_MOBILE_20260911.md` 를 위 §0
의 폴더로 `git mv` 했다 — **파일 이름은 하나도 바꾸지 않았고, 합치거나 지우지
않았다**. `docs/ai-skin/` 은 비어서 없어졌다. 표의 링크는 전부 지금 그대로의
위치를 가리킨다. 문서를 새로 만들거나 자리나 상태가 바뀌면 이 색인의 줄을 같이
고친다.

오래 깨져 있던 링크 하나는 정리했다.
[CATEGORY_GALLERY_MOBILE_20260911.md](./contracts/CATEGORY_GALLERY_MOBILE_20260911.md)
의 "변경 파일" 목록이 가리키던 `posts/editor/posts-gallery.js` 는 `8e200a9` 에서
**지워진 파일**이다. 같은 커밋이 만든 `posts/editor/posts-body-images.js` 는 그
파일이 옮겨 간 것도, 같은 계약을 물려받은 것도 아니므로(git 도 rename 으로 보지
않는다) 주소를 바꿔 끼우지 않고, 지워진 파일은 링크 없는 코드 표기로 두고 이후
구현만 따로 적었다. 지금 저장소의 Markdown 상대 링크는 **전부 살아 있다**.
