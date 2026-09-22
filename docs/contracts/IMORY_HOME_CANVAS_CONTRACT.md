# IMORY HOME CANVAS — 데이터 계약

> 상태: **CURRENT CONTRACT**. 여기 적힌 것 중 **§1~§10 과 §12~§26 은 지금
> 코드가 강제한다**. **§11 은 아직 구현되지 않았다** — 앞으로 편집 UI 가
> 지켜야 할 약속과 남은 차이다. 그 절을 구현된 것으로 읽지 않는다.
>
> ★ **이 문서의 §1~§8 과 §12~§22 는 `canvas.version:1`(평면 자유 Canvas)
> 을 다루고, §23~§26 이 조합형 `canvas.version:2`(자동 배치 블록 +
> `main_visual` 자유 레이어)다.** v2 의 전체 설계는 로드맵
> [§14](../plans/IMORY_HOME_CANVAS_ROADMAP.md#14-조합형-home-canvas-v2-설계-home-canvas-composition-contract-1)
> 이고, 지금 코드가 강제하는 범위는 **§9-(3)**(데이터 검증 · `V2-DATA-1`) ·
> **§23**(자동 배치 화면 출력) · **§24**(`main_visual` 내부) ·
> **§25**(선택과 기본 배치 조정) · **§26**(프레임 내부 요소 · overlay 의
> 자리 · 크기 · 각도)다. v2 에서 **아직 없는 것**은 새 요소 추가 · `메인
> 비주얼로 묶기`/`묶기 해제` · 그룹 조작 · 블록 추가/삭제 · `row`/`grid`
> 블록 · v1→v2 변환이다. 여기 적힌 v1 계약은 **폐기되지 않는다**: v2 의
> 페이지 자유 장식과 `main_visual` 내부 자유 요소는 v1 의 선택 · 이동 ·
> 리사이즈 · 회전 엔진을 **그대로** 쓰고, 갈라지는 것은 좌표의 자와 불변
> writer 둘뿐이다(§26).
>
> 라운드: `HOME-CANVAS-CONTRACT-1B`(2026-09-21) · `1C`(2026-09-21, `baseHeight` 추가 — §4-1) ·
> `HOME-CANVAS-RENDER-1A`(2026-09-21, **정적 Renderer** — §12) ·
> `HOME-CANVAS-RENDER-1B`(2026-09-21, **sandbox 프레임까지 · 네 화면** — §12-6) ·
> `HOME-CANVAS-VENDOR-1`(2026-09-21, **Moveable · Selecto 고정과 지연 로더** — §13) ·
> `HOME-CANVAS-SELECT-1A`(2026-09-21, **선택 소유권과 단일 선택 기반** — §14) ·
> `HOME-CANVAS-SELECT-1B-1`(2026-09-21, **조건부 vendor 활성화와 회전을 따라가는
> 선택 틀** — §15) ·
> `HOME-CANVAS-SELECT-1B-2`(2026-09-21, **Selecto lasso 와 다중 선택** — §16) ·
> `HOME-CANVAS-TRANSFORM-1A`(2026-09-21, **단일 요소 이동** — §17) ·
> `1B`(2026-09-21, **단일 요소 리사이즈** — §18) ·
> `1C`(2026-09-21, **단일 요소 회전** — §19) ·
> `HOME-CANVAS-MILESTONE-1`(2026-09-21, **수동 테스트 스킨과 통합 smoke —
> 계약 무변경** — §20) ·
> `HOME-CANVAS-COMPOSITION-CONTRACT-1`(2026-09-21, **v2 설계 확정 — 이 문서는
> 상태 문장과 §9-(3) · §11-4 의 가리키는 곳만 바뀌었다. v1 계약 무변경**) ·
> `HOME-CANVAS-V2-DATA-1`(2026-09-21, **`version:2` 데이터 검증과 보존 —
> 렌더는 없다** — §9-(3). v1 계약 무변경) ·
> `HOME-CANVAS-INSPECTOR-1A`(2026-09-22, **왼쪽 Canvas 패널** — §22) ·
> `HOME-CANVAS-V2-FLOW-RENDER-1`(2026-09-21, **v2 자동 배치 화면 출력** — §23) ·
> `HOME-CANVAS-V2-MAIN-VISUAL-1`(2026-09-21, **`main_visual` 내부** — §24) ·
> `HOME-CANVAS-V2-EDITOR-1A`(2026-09-22, **v2 선택과 기본 배치 조정** — §25) ·
> `HOME-CANVAS-V2-EDITOR-1B`(2026-09-22, **프레임 내부 요소 · overlay 의
> 자리 · 크기 · 각도 — 패널과 직접 조작** — §26. v1 계약 무변경).
> 로드맵: [IMORY_HOME_CANVAS_ROADMAP.md](../plans/IMORY_HOME_CANVAS_ROADMAP.md) — **PLAN**.

관련 코드

| 무엇 | 파일 |
| --- | --- |
| 계약 · 검증 · 실행 payload(**단일 원천**) | [skin/skin-home-canvas.js](../../skin/skin-home-canvas.js) |
| 저장 경계 — 표시 위치 속성 | [skin/skin-sanitize.js](../../skin/skin-sanitize.js) |
| Import 검증 입구 | [skin/skin-package-import.js](../../skin/skin-package-import.js) |
| 렌더 재료에 싣는 자리 | [skin/skin-template.js](../../skin/skin-template.js) `resolveSkinTemplate` |
| sandbox 봉투의 strict allowlist | [skin/sandbox/skin-sandbox-protocol.js](../../skin/sandbox/skin-sandbox-protocol.js) `isSandboxHomeCanvas` |
| **정적 Renderer**(DOM 생성 · 갱신 · 제거) | [skin/skin-home-canvas-render.js](../../skin/skin-home-canvas-render.js) `compileSkinHomeCanvas` |
| **좌표 구조 CSS**(색 · 글꼴 없음) | [skin/skin-home-canvas-render.css](../../skin/skin-home-canvas-render.css) |
| Renderer 를 부르는 자리 | [skin/skin-render.js](../../skin/skin-render.js) `renderSkin` mount 끝 |
| 렌더러를 로드하는 문서 — 그리는 **셋** | [index.html](../../index.html) · [studio/preview/preview-frame.html](../../studio/preview/preview-frame.html) · [skin/sandbox/frame.html](../../skin/sandbox/frame.html) |
| 같은 렌더러를 **자를 재려고만** 싣는 문서(§26-3) | [studio/index.html](../../studio/index.html) · [studio/studio-lifecycle-scenario.html](../../studio/studio-lifecycle-scenario.html) |
| sandbox origin allowlist | [core/lib/skin-sandbox-server.js](../../core/lib/skin-sandbox-server.js) `SANDBOX_ALLOWED_PATHS` |
| Studio sandbox 로 `canvas` 를 옮기는 자리 | [studio/preview/preview-sandbox.js](../../studio/preview/preview-sandbox.js) |
| **고정한 편집기 라이브러리**(Moveable · Selecto UMD · MIT) | [studio/vendor/home-canvas/](../../studio/vendor/home-canvas/) — 출처 · 해시 · 보관 규칙은 그 폴더의 `README.md` |
| **그 둘을 부를 때만 받는 로더** | [studio/studio-home-canvas-vendor.js](../../studio/studio-home-canvas-vendor.js) `ensureHomeCanvasEditorVendors` |
| **캔버스 선택 상태**(기존 Inspector 와 다른 소유자) | [studio/inspector/studio-canvas-selection.js](../../studio/inspector/studio-canvas-selection.js) |
| **선택 소유권을 정하는 한 곳** | [studio/inspector/studio-inspector.js](../../studio/inspector/studio-inspector.js) `routeStudioInspectSelectMessage` |
| **캔버스를 아는 공통 hit-test**(세 realm 이 같은 파일) | [skin/skin-inspect-target.js](../../skin/skin-inspect-target.js) |
| **프레임 안 편집 runtime**(native · sandbox 공용 한 벌, §15) | [skin/skin-home-canvas-editor-runtime.js](../../skin/skin-home-canvas-editor-runtime.js) `createHomeCanvasSelectionFrame` |
| **v1 의 불변 writer** | [skin/skin-home-canvas-write.js](../../skin/skin-home-canvas-write.js) |
| **v2 의 값 표 · 검증 · 실행 payload** | [skin/skin-home-canvas-v2.js](../../skin/skin-home-canvas-v2.js) |
| **v2 의 트리 탐색과 불변 writer** | [skin/skin-home-canvas-write-v2.js](../../skin/skin-home-canvas-write-v2.js) |
| **v2 선택 하나의 좌표 자와 storage 번역**(§26-2 · §26-4) | [studio/inspector/studio-canvas-v2-space.js](../../studio/inspector/studio-canvas-v2-space.js) `studioCanvasV2Space` · `planStudioCanvasV2Transform` |
| **왼쪽 Canvas 패널**(v1 · v2 두 화면) | [studio/inspector/studio-canvas-inspector.js](../../studio/inspector/studio-canvas-inspector.js) · [studio/inspector/studio-canvas-inspector-v2.js](../../studio/inspector/studio-canvas-inspector-v2.js) |

관련 테스트: `node skin/skin-home-canvas-test.mjs` ·
`node skin/skin-home-canvas-render-e2e-test.mjs` ·
`node skin/skin-home-canvas-sandbox-e2e-test.mjs` ·
`node studio/studio-home-canvas-e2e-test.mjs` ·
`node studio/studio-home-canvas-vendor-e2e-test.mjs` ·
`node studio/studio-home-canvas-select-e2e-test.mjs` ·
`node studio/studio-home-canvas-moveable-e2e-test.mjs` ·
`node studio/studio-home-canvas-selecto-e2e-test.mjs` ·
`node studio/studio-home-canvas-transform-e2e-test.mjs` ·
`node studio/studio-home-canvas-resize-e2e-test.mjs` ·
`node studio/studio-home-canvas-rotate-e2e-test.mjs` ·
`node studio/studio-home-canvas-inspector-e2e-test.mjs`
(`--only=panel|text|geometry|round|v2|v2free|sandbox`) ·
`node skin/sandbox/skin-sandbox-unit-test.mjs` — [TESTS.md](../TESTS.md) §13.

---

## 0. 지금까지 실제로 된 것

| 라운드 | 무엇 |
| --- | --- |
| `CONTRACT-1B` | 데이터 계약 — 캔버스 데이터가 SkinPackage 안에 있을 수 있고, Import · Export · Save · 다시 열기 · Publish · AI 수정 · sandbox 봉투를 지나도 **한 칸도 잃지 않으며**, 잘못된 데이터가 조용히 고쳐지거나 지워지지 않는다 |
| `CONTRACT-1C` | 도화지 전체의 세로 길이 `baseHeight` 한 칸(§4-1). 그 말고는 `1B` 계약이 그대로다 |
| `RENDER-1A` | **정적 Renderer**(§12) — 저장된 Canvas 가 **공개 native HOME** 과 **Studio native Preview** 에서 같은 DOM · 같은 좌표로 그려진다 |
| `RENDER-1B` | 그 **같은 렌더러**가 cross-origin sandbox 프레임에서도 돈다(§12-6). **네 화면 정적 parity 가 검증됐다** — 공개 native · Studio native Preview · 공개 sandbox · Studio sandbox Preview |
| `VENDOR-1` | Moveable 0.53.0 · Selecto 1.26.3 UMD 를 **저장소에 바이트 그대로 고정**하고, Studio 전용 **지연 로더**와 sandbox allowlist 두 줄을 두었다(§13). **아직 Canvas 요소에 연결되지 않았다** |
| `SELECT-1A` | **캔버스 요소를 고르고 푸는 것**(§14) — 캔버스 전용 선택 상태(배열 모양, 지금은 최대 1개) · 기존 Inspector 와의 **소유권 분리** · 캔버스를 아는 공통 hit-test · draft 존재 검증 · 축에 평행한 임시 테두리. **고치는 것은 하나도 없다** |
| `SELECT-1B-1` | **조건부 vendor 활성화와 회전을 따라가는 선택 틀**(§15) — 첫 Canvas 요소를 고른 그 순간에만 프레임 안에서 runtime · 로더 · UMD 를 받고, 단일 선택 요소에 Moveable 로 테두리 하나를 그린다. **표시 전용**이다 — 손잡이 · 조작 · Canvas JSON 쓰기는 없다 |
| `SELECT-1B-2` | **Selecto lasso 와 다중 선택**(§16) — 끌어서 여러 개를 고르고 Shift 로 더하고 뺀다. 관문이 "첫 선택"에서 "Canvas 가 있는 HOME 에서 Select 를 켬"으로 앞당겨졌다. 프레임은 **제안만** 하고 부모가 draft 로 전부 다시 보고 확정한다. 여전히 **고르는 것까지**다 |
| `TRANSFORM-1A` | **단독으로 고른 요소 하나의 이동**(§17) — 마우스 · 펜으로 끌어 옮기고 그 결과가 `canvas.elements[].x` · `.y` 에 저장된다. **여기서부터 Canvas JSON 이 바뀐다.** 한 제스처가 Undo 한 칸이고, Save · Export/Import · Publish resolve 를 그대로 지난다. 크기 · 회전 · 그룹 이동 · 손가락 이동은 **없다** |
| `TRANSFORM-1B` | **단독 선택 요소의 리사이즈**(§18) — 손잡이 여덟으로 크기를 바꾸고 `x` · `y` · `width` · `height` **네 칸**에 저장한다. `"auto"` 높이가 언제 숫자가 되는지도 여기서 정해졌다. 확정 경로 · Undo · 취소는 `1A` 와 **한 벌**이다 |
| `TRANSFORM-1C` | **단독 선택 요소의 회전**(§19) — 손잡이 하나로 돌리고 `rotation` **한 칸**에 저장한다. 상자 네 칸은 바뀌지 않는다(회전 중심이 요소 상자의 정중앙이다). 같은 확정 경로에 `kind:"rotate"` 가 늘었다. **이동 · 리사이즈 · 회전으로 기본 조작이 갖춰졌다** |
| `MANUAL-UX-FIX-1` | **직접 조작 사용성 넷**(§21) — 회전의 **30° 자석**(±4° 안에서만 붙는다) · **모서리 손잡이는 비율 유지 · 변 중앙은 한 축 자유** · 자르기를 고르지 않은 Canvas 그림은 **contain**(전체가 보인다) · 글자 요소의 **편집 chrome 여유**(선이 글자를 가로지르지 않는다 — 저장 geometry 는 불변). 새 데이터 칸 · 새 메시지 · 새 파일은 없다 |
| `INSPECTOR-1A` | **왼쪽 Canvas Inspector**(§22) — Canvas 요소를 고르면 왼쪽 패널이 그 요소의 화면이 된다. 글자 요소의 **내용**(`props.text`)을 실제로 고칠 수 있고, 공통 geometry 다섯 칸을 숫자로 넣을 수 있다. **글자 한 칸이 v1 에서 처음으로 `props` 를 바꾼다** — 그 전까지 바뀌는 것은 요소 자신의 다섯 칸뿐이었다. 다중 선택은 안내만이고, `hidden`/`locked` 는 아직 내놓지 않는다 |
| `V2-DATA-1` | **조합형 Canvas `version:2` 의 데이터 검증과 보존**(§9-(3)) — 로드맵 §14 가 정한 `flow.blocks` + `overlays` 두 층을 저장 경계가 **엄격히 검증**한다. 잘못된 v2 는 새 Import 에서 정확한 JSON 경로와 함께 거부되고, 올바른 v2 는 Import · Save · 다시 열기 · Export · Publish · AI 를 한 칸도 잃지 않고 지난다. 그 라운드에서 **화면은 아직 기존 HOME 이었다**. v1 은 한 줄도 바뀌지 않았다 |
| `V2-FLOW-RENDER-1` | **v2 의 화면 출력**(§23) — 자동 배치 흐름(`flow`)과 페이지 자유 장식(`overlays`)이 **공개 native HOME · Studio native Preview · 공개 sandbox · Studio sandbox Preview** 네 화면에서 같은 DOM · 같은 좌표로 그려진다. 블록 순서 · `align` 네 값 · `width`/`maxWidth` · 숫자 `height` 와 `"auto"` · **collapse 하지 않는 `gap` + `margin` 합산** · `hidden` 이 자리를 남기지 않음까지다. 그 라운드에서 `main_visual` 은 **외곽 프레임까지**였다(내부는 `V2-MAIN-VISUAL-1` 이 채웠다 — §24). 선택 · 드래그 · Inspector 는 없다 — **읽기 전용**이다 |
| `V2-MAIN-VISUAL-1` | **`main_visual` 내부**(§24) — primary 사진과 그 주변 장식(종이 · 테이프 · 좌우 인덱스 · 캡션)이 프레임 안에 **배열 순서대로** 그려진다. `follow:"transform"` 은 위치와 크기가 `S_frame` 으로 함께 커지고, `follow:"pin"` 은 `anchor`/`origin`/`offset` 으로 기준점만 따라가며 **자기 크기는 유지**한다. `height:"auto"` 프레임의 높이는 **primary 사진 상자의 비율**이다. 프레임 밖으로 나온 장식은 그대로 보인다. **데이터 · 봉투 · Studio · CSP 무변경**이고 여전히 **읽기 전용**이다 |
| `V2-EDITOR-1A` | **v2 의 선택과 기본 배치 조정**(§25) — v2 블록을 Studio 에서 고를 수 있고, 왼쪽 패널에서 **순서 · 정렬 · 여백 네 칸 · 폭 · 높이**와 글자 문구를 고칠 수 있다. `main_visual` 은 **한 번 클릭하면 프레임 전체**이고 한 번 더 누르면 안쪽 요소로 들어간다. `data-imory-canvas-frame` **이름 충돌**(§24-7)이 여기서 풀렸다 — 값 `1` 인 Moveable control box 만 편집 chrome 이다. 수정은 **v2 전용 불변 writer** 가 하고, 관문 · Undo 한 칸 · 보존 범위는 v1 과 한 벌이다. v2 드래그 · 리사이즈 · 회전과 묶기/해제는 **아직 없다** |
| `V2-EDITOR-1B` | **프레임 내부 요소와 overlay 의 자리 · 크기 · 각도**(§26) — `main_visual` 안의 사진 · 장식과 페이지 자유 장식을 **왼쪽 패널의 다섯 칸**으로 고칠 수 있고 **Preview 에서 직접 끌고 · 키우고 · 돌릴 수 있다**. 선택 하나마다 **자를 하나** 정해(프레임 내부 좌표 / 프레임 상자 / 도화지) 그 자 위의 숫자만 프레임에 내려보내므로, 프레임은 v1 인지 v2 인지 모른 채 지금까지와 **같은 메시지**를 돌려준다. `follow:"transform"` 은 `x`·`y`(+크기)를, `follow:"pin"` 은 **`pin.offset` 두 칸**을 쓰고 `target`·`anchor`·`origin` 은 그대로다. 크기를 바꿀 때 `origin` 몫을 좌표에 되돌려 **고정 기준점이 튀지 않는다**. 블록의 자리는 여전히 좌표가 아니다(자를 주지 않으므로 제스처가 시작되지 않는다). 새 요소 추가 · 묶기/해제 · 그룹 조작 · Crop · 효과는 **없다** |
| `MILESTONE-1` | **계약이 하나도 바뀌지 않은 라운드**(§20). 위 기본 조작을 배포된 화면에서 **손으로** 시험할 수 있게 `home_canvas` 와 표시 위치를 이미 갖춘 **수동 테스트 스킨**과 그것을 끝까지 지나는 통합 smoke 를 두었다. 제품 코드 · 기본 스킨 · 저장 데이터는 무변경이다 |

아직 **없는 것** — 이것을 구현된 것으로 읽지 않는다.

- **그룹 조작**(그룹 이동 · 그룹 리사이즈 · 그룹 회전) · 스냅 · 가이드 ·
  키보드 조작 · preset · 스티커 업로드 · widget · 레이어 목록 ·
  `hidden`/`locked` 토글 · 다중 일괄 편집 — **하나도 없다**
  (§11 · §19-12 · §22-7).
- `SELECT-1A` · `SELECT-1B-1` · `SELECT-1B-2` 는 **고르고 · 푸는 것 · 그것을
  보여 주는 것**까지다(§14-6 · §15-8 · §16-9). 고른 뒤에 바꿀 수 있는 것은
  `TRANSFORM-1A · 1B · 1C` 가 연 **x · y · width · height · rotation
  다섯 칸**과, `INSPECTOR-1A` 가 연 **`text` 요소의 `props.text` 한 칸**
  뿐이다(§17 · §18 · §19 · §22).
- **모바일 lasso 도 손가락 조작도 의도적으로 미지원**이다 — 그 자리는 단일
  탭 선택과 Preview 스크롤이 지킨다(§16-3 · §17-2 · §18-12 · §19-10).

---

## 1. 소유권 — 플랫폼과 Canvas

캔버스에 HOME 전체와 좌우 패널의 여닫기 · 칼럼 배치를 넘기지 않는다.

| 누가 | 무엇을 |
| --- | --- |
| **플랫폼** | 1 · 2 · 3단 배치 · 데스크톱 좌우 칼럼 · 모바일 패널 열기/닫기 · 패널 스크롤 · 포커스 · Escape · 바깥 클릭 |
| **Canvas** | 각 표시 영역 **안의** 사진 · 텍스트 · 로고 · 카테고리 · 스티커 · 도형 · 향후 위젯의 배치 |

1 · 2 · 3단은 지금처럼 [IMORY_SIDES_DESIGN.md](./IMORY_SIDES_DESIGN.md) 가 갖는다.
캔버스는 그 안의 한 칸(HOME 본문)에 놓이는 면이다.

v1 에서 구현한 것은 `home_canvas` 하나다.

---

## 2. 저장 위치 — 새 최상위 필드를 만들지 않는다

기존 `SkinPackage.regions` 안의 이름 붙은 항목이다. 좌우 영역
(`left_sidebar` · `right_sidebar`)과 주인의 스킨 설정(`theme_colors` ·
`home_photos` · `dday`)이 이미 쓰는 그 배열이다.

```json
{
  "regions": [
    { "name": "left_sidebar", "enabled": true },
    {
      "name": "home_canvas",
      "enabled": true,
      "canvas": {
        "version": 1,
        "baseWidth": 390,
        "baseHeight": 844,
        "elements": []
      }
    }
  ]
}
```

`regions` 가 원래부터 갖고 있던 성질을 그대로 유지한다.

| 경로 | 지금 동작 |
| --- | --- |
| Import | 새 파일의 `home_canvas` 만 검증하고, 나머지 항목은 읽지 않고 보존 |
| Export | `regions` 를 깊은 복사로 **통째로** 싣는다(모르는 칸 포함) |
| Save | `normalizeSkinPackageForDraft()` 가 templates/css 만 손대고 regions 는 그대로 |
| Publish | draft 포인터를 옮길 뿐 content 를 다시 만들지 않는다 |
| AI 수정 | 서버가 `currentPackage.regions` 를 **그대로** 되돌려 준다 |
| Preview / 공개 / sandbox | `resolveSkinTemplate()` 이 **실행용 payload** 를 만들어 싣는다(§8) |

- 이름이 `home_canvas` 가 아닌 항목은 읽지 않고 그대로 보존한다.
- `enabled: false` 는 **데이터를 지우지 않는다.** 껐다 켜도 요소가 그대로 남는다.
- 같은 이름이 둘이면 **앞의 것**이 이긴다(sides 와 같은 규칙). 다만 Import
  검증은 둘 다 본다 — 뒤의 것이 깨진 파일을 통과시키면 나중에 앞의 것을
  지웠을 때 갑자기 드러난다.
- `regions: []`(= 지금까지의 모든 스킨)는 "캔버스 없음"이고 렌더 결과가 한
  byte도 바뀌지 않는다.

---

## 3. Template 표시 위치

캔버스를 보여 주는 스킨 템플릿은 HOME 안에 **정확히 하나**의 표시 위치를 둔다.

```html
<div data-imory-canvas-root></div>
```

- 저장 경계(`skin/skin-sanitize.js`)가 이 속성을 안다. 판정 표는
  `skin/skin-home-canvas.js` 한 곳에 있고, 허용되는 값은 **빈 값 하나**뿐이다.
- **기존 스킨에 이 표식 · 속성 · 리스너를 자동으로 넣지 않는다.**

fallback 표 — 지금 코드가 그대로 따른다.

| 상태 | 결과 |
| --- | --- |
| `home_canvas` 없음 | 기존 HOME 을 그대로 렌더 |
| `home_canvas` 있음 + 표식 없음 | 기존 HOME 을 그대로 렌더 |
| 표식이 둘 이상 | 기존 HOME 을 그대로 렌더 |
| 표식 있음 + `elements: []` | **빈 Canvas 면**으로 취급(실행 데이터가 실린다) |
| 표식 있음 + `flow.blocks: []` (v2) | 같다 — **빈 Canvas 면**(흐름 층은 생기고 블록이 없다) |
| 표식 있음 + 잘못된 Canvas 데이터 | 기존 HOME 을 그대로 렌더(원본은 남는다) |
| 표식 있음 + 모르는 `canvas.version`(**3 이상**) | 기존 HOME 을 그대로 렌더(원본은 남는다) |

"기존 HOME 을 그대로 렌더" 는 코드에서 **`template.canvas` 키를 만들지 않는
것**으로 성립한다 — 그래서 캔버스가 없는 스킨에서는 Preview 메시지와 sandbox
봉투가 지금까지와 byte 단위로 같다.

이 요소 **안의 DOM 은 전부 Renderer 가 만든다**(§12). 스킨이 표식 안에 직접
적어 둔 자식이 있으면 그것은 지워지지 않는다.

---

## 4. 좌표

| 규칙 | 값 |
| --- | --- |
| `baseWidth` | `390` 고정 |
| `baseHeight` | 양수(고정값 아님). 새 캔버스 기본 `844` — §4-1 |
| `x` · `y` | Canvas 왼쪽 위 기준 |
| `width` | 양수 |
| `height` | §6 |
| `rotation` | 요소 **중심** 기준 시계 방향 각도 |
| 앞뒤 순서 | 배열 앞쪽이 뒤, 뒤쪽이 앞. **별도 `z` 필드를 두지 않는다** |
| 절대 한계 | 좌표 ±100000 · 크기 0 초과 100000 이하 |

`baseWidth: 390` 은 화면 폭을 390px 로 고정한다는 뜻이 **아니다.** 저장 좌표의
기준 자만 390 으로 통일한다는 뜻이다. 실제 화면 폭으로 어떻게 바뀌는지는 §12-2.

데스크톱 전용 별도 좌표와 breakpoint override 는 이번에 만들지 않았다
(`HOME-CANVAS-RESPONSIVE-1`).

### 4-1. `baseHeight` — 도화지 전체의 세로 길이 (`CONTRACT-1C`)

`1B` 에는 요소마다의 `height` 는 있었지만 **도화지 자체가 어디까지인가**가
없었다. 그래서 다음을 안정적으로 정할 수 없었다.

- 요소가 하나도 없는 빈 Canvas 의 높이
- HOME 의 의도된 마지막 지점과 아래쪽 디자인 여백
- 한 화면형 Canvas 와 긴 스크롤형 Canvas 의 구분
- 편집기에서 도화지 전체 높이를 늘리거나 줄이는 기능

| 규칙 | |
| --- | --- |
| 타입 | 유한한 **양수**(상한은 좌표와 같은 100000 — 요소가 못 나가는데 도화지만 클 이유가 없다) |
| 필수 여부 | **v1 필수 필드** |
| 새 Canvas 기본값 | `844`(390×844 = 한 화면형) |
| 요소의 `height` 와 | **별개다.** `baseHeight` 는 "캔버스가 어디까지인가", 요소 `height` 는 "그 요소가 얼마나 큰가" |
| 요소가 없을 때 | 그래도 캔버스는 `baseHeight` 를 갖는다 |
| 오류 경로 | `regions[n].canvas.baseHeight` |

- **요소의 가장 아래 좌표로 자동 계산하지 않는다.** 그렇게 하면 아래쪽에 일부러
  둔 여백이 사라지고, 요소를 하나 옮길 때마다 페이지 전체 높이가 예기치 않게
  바뀐다.
- **요소가 Canvas 경계를 일부 벗어나는 것을 데이터 계약이 금지하지 않는다.**
  넘친 것을 어떻게 다룰지(자르기 · 늘리기 · 스크롤)는 Renderer 의 몫이고,
  `RENDER-1A` 는 그것을 **스킨 CSS 에 남겼다** — 플랫폼 CSS 가 도화지에
  `overflow` 를 정하지 않는다(§12-2).
- 실제 viewport 에 맞춰 확대·축소하거나 스크롤하게 만드는 방식도 §12-2 다.
- 향후 Studio 에서 주인이 이 값을 직접 조정할 수 있다 — 그 UI 는 아직 없다.
- **데스크톱·모바일별 별도 높이는 이번에 추가하지 않았다**(`RESPONSIVE-1`).

**왜 필수인가.** 지금까지 저장된 실제 사용자 Canvas 데이터가 **하나도 없다.**
그래서 옵션으로 둘 이유가 없고, 빠진 것을 조용히 `844` 로 채우면 "한 화면형으로
만든 캔버스"와 "높이를 안 적은 캔버스"가 파일만 보고 구분되지 않는다. 누락된
새 Import 는 위 경로와 함께 **거부**한다.

`baseHeight` 는 보존용 원본과 실행용 payload **양쪽 모두**에 실린다. 실행용
payload 는 `baseWidth` 와 달리 상수가 아니라 **저장된 그 값**을 그대로 싣는다.

---

## 5. 요소 공통 필드

```json
{
  "id": "canvas_a1b2c3d4-5e6f-7890-abcd-ef1234567890",
  "type": "photo",
  "x": 20,
  "y": 120,
  "width": 260,
  "height": 320,
  "rotation": 0,
  "hidden": false,
  "locked": false,
  "props": { "slot": "photo_1" }
}
```

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `id` | ✔ | §5-1 |
| `type` | ✔ | §7 의 여섯 중 하나 |
| `x` · `y` | ✔ | 유한한 숫자 |
| `width` | ✔ | 양수 |
| `height` | ✔ | §6 |
| `rotation` | | 유한한 숫자. 빠지면 `0` |
| `hidden` | | boolean. 빠지면 `false` |
| `locked` | | boolean. 빠지면 `false` |
| `props` | | 객체. 빠지면 `{}`(타입별 필수 칸은 §7) |

뒤 넷을 선택으로 둔 이유: 안전한 기본값이 하나뿐이라 "빠뜨린 것"과 "기본값을
적은 것"이 같은 뜻이다. 앞 여섯은 그렇지 않아서 필수다. **들어 있으면 모양은
맞아야 한다** — 조용히 고치지 않는다.

- 요소 순서를 임의로 정렬하지 않는다.
- 입력 객체와 배열을 직접 mutate 하지 않는다.

### 5-1. id — `data-imory-edit-id` 와 같은 규칙

```
/^[A-Za-z][A-Za-z0-9_-]{0,63}$/
```

**함정.** 각 요소는 Renderer 에서 안정적인
`data-imory-edit-id="<element.id>"` 를 받는다(§8 · §12-3). 그런데 저장 경계의
edit-id 규칙(`skin/skin-sanitize.js` `SKIN_SANITIZE_EDIT_ID_PATTERN`)은 **점이
없고, 64자 이하이고, 글자로 시작**해야 한다. `crypto.randomUUID()` 는
`0e02b2c3-…` 처럼 **숫자로 시작할 수 있어서** 그 규칙을 통과하지 못한다.

그래서 `createSkinHomeCanvasElementId()` 는 `canvas_` 를 앞에 붙인다
(`canvas_` + UUID = 43자, 항상 글자로 시작). 검증도 같은 규칙을 쓴다 — 맞지
않는 id 는 새 Import 에서 **거부**한다. 저장은 됐는데 나중에 그 요소만 고를 수
없는 상태를 파일만 보고 구분할 수 없게 두지 않는다.

- id 는 저장 · 다시 열기 · Export/Import 이후에도 바뀌지 않는다.
- **중복 id 를 임의로 새 id 로 고치지 않는다** — 새 Import 에서 거부한다.

---

## 6. 높이

모든 요소는 사용자가 가로와 세로를 **직접 조정할 수 있는** 구조여야 한다.

| 종류 | `height` |
| --- | --- |
| `photo` · `logo` · `sticker` · `shape` | 양수 |
| `text` · `category_nav` | 양수 **또는** `"auto"` |

`"auto"` 는 **높이 조정 불가라는 뜻이 아니다.** 세로 손잡이를 끌면
`"auto"` 가 실제 숫자 높이가 되고(§18-3), 왼쪽 Inspector 의
`내용에 맞추기(Auto)` 스위치를 다시 켜면 `"auto"` 로 돌아온다(§22-3).
둘 다 같은 `kind:"resize"` 확정 한 번이다.

---

## 7. 요소 종류 — v1 은 이 여섯이 전부

### photo

```json
{ "type": "photo", "props": { "slot": "photo_1" } }
```

`slot` 은 이미지 슬롯 이름이고, 규칙은 `skin/skin-package-images.js` 의
`SKIN_IMAGE_SLOT_NAME_PATTERN`(`/^[a-z][a-z0-9_]{0,49}$/`)과 같다 —
**snake_case 소문자**다.

### text

```json
{ "type": "text", "props": { "text": "A quiet archive.", "role": "body" } }
```

`role` — `title` · `subtitle` · `body` · `caption` · `label`. 빠지면 `body`.
`text` 는 2000자 이하.

### logo

```json
{ "type": "logo", "props": { "slot": "title_logo", "fallback": "site_title" } }
```

`fallback` 은 `site_title` 하나다. 빠지면 `site_title`.

### category_nav

```json
{ "type": "category_nav", "props": { "mode": "all", "categoryIds": [] } }
```

`mode` — `all` · `selected`. 빠지면 `all`. `categoryIds` 는 50개 이하의
빈 문자열이 아닌 문자열 배열(각 64자 이하). 빠지면 `[]`.

### sticker

```json
{ "type": "sticker", "props": { "slot": "sticker_1" } }
```

### shape

```json
{ "type": "shape", "props": { "kind": "rect" } }
```

`kind` — `rect` · `ellipse` · `line`.

---

## 8. 내용 · 스타일의 소유권

Canvas JSON 이 갖는 것

- 요소 종류 · 실제 내용 · 이미지 슬롯 · 위치 · 가로·세로 크기 · 회전 ·
  숨김 · 잠금 · 의미 역할

**시각 스타일은 기존 스킨 CSS 가 갖는다**

- 글꼴 · 글자 크기 · 글자색 · 배경색 · 테두리 · 모서리 · 그림자 · 여백 ·
  정렬 · shape 의 fill/stroke · sticker 의 외곽선과 칼선

후속 Renderer 는 각 요소에 안정적인 `data-imory-edit-id="<element.id>"` 를
주어야 한다. Studio Inspector 가 나중에 그 선택자로 CSS 를 고친다(§5-1 의
함정이 그래서 중요하다).

**이번 계약에 넣지 않은 필드**: `canvas.background` · 요소별 `style` ·
`shape.fill` · `shape.stroke` · `sticker.outline` · `z`.

그래서 왼쪽 Canvas Inspector 에도 글꼴 · 크기 · 색 · 행간 · 정렬 ·
`shape` 스타일 칸이 **없다**(§22-2). 그 자리를 JSON 으로 옮기는 것은
이 계약을 바꾸는 일이고, 지금은 스킨 CSS 가 갖는다.

---

## 9. 검증 · 보존 · fallback — 세 경우를 가른다

### (1) 새 Import 가 잘못된 경우 → 막는다

Import 는 사용자가 **그 자리에서 고칠 수 있는** 경로를 문장에 담아 거부한다.

```
regions[2].canvas.elements[1].width — width는 0보다 크고 100000 이하인 숫자여야 합니다.
regions[0].canvas.elements[3].id — id "canvas_a"가 두 번 쓰였습니다. …
```

실패의 모양은 다른 거부와 같다: `reason: "home-canvas"` · `message` ·
`canvasErrorPath`. 중복 id · 잘못된 타입 · 잘못된 숫자 · 허용되지 않은
`"auto"` 는 **조용히 고치지 않는다.**

### (2) 이미 저장된 데이터가 잘못된 경우 → 삭제하지 않고 fallback

- 원본 데이터를 삭제하거나 덮어쓰지 않는다.
- 문제 요소만 조용히 제거하지 않는다(payload 자체를 만들지 않는다).
- Canvas 를 실행하지 않고 **기존 HOME** 을 그린다.
- Save · Export 에서 원본을 잃지 않는다.

★ **AI 경로가 여기 걸린다.** AI 응답도 `validateSkinPackageImport()` 를 지나는데,
그 응답의 `regions` 는 사용자가 쓴 것이 아니라 **서버가 지금 draft 의 regions 를
그대로 되돌려 준 것**이다. 이미 저장된 캔버스가 깨져 있을 때 거기서 막으면,
그 사람은 캔버스와 무관한 AI 수정조차 영영 못 하게 된다(지금은 캔버스를 고칠
UI 도 없다). 그래서 `validateSkinPackageImport(raw, { canvasSource })` 가 둘을
가른다.

| `canvasSource` | 누가 쓰는가 | 잘못된 캔버스 |
| --- | --- | --- |
| `"file"`(기본) | Import 창 | **거부** + 필드 경로 |
| `"draft"` | `studio/ai/studio-ai-panel.js` | 통과 + 보존. 실행만 안 된다 |

### (3) 미래 버전 · 모르는 필드 → 보존

- storage 경계(Import · Export · Save · Publish · AI)는 **모르는 필드를 보존**한다 —
  `regions` 의 모르는 항목, `canvas` 의 모르는 칸, 요소의 모르는 칸 전부.
- 지원하지 않는 미래 `canvas.version` 은 **거부가 아니다.** 파일은 통과하고,
  그 elements 를 이 배포의 v1 규칙으로 검사하지도 않으며, 실행만 하지 않는다.
- sandbox 로 보내는 **실행 데이터는 strict allowlist** 다.

#### `canvas.version` 은 **세 갈래**다 (`V2-DATA-1` · `V2-FLOW-RENDER-1`)

| version | 검증 | 실행 | 돌려주는 것 |
| --- | --- | --- | --- |
| `1` | v1 규칙(§5 · §6 · §7) | **그린다** | `{ ok:true, renderable:true }` |
| `2` | **로드맵 §14 규칙으로 엄격히** | **그린다**(§23) | `{ ok:true, version:2, renderable:true }` |
| `3` 이상 | 내용을 보지 않는다 | 안 그린다 | `{ ok:true, future:true, renderable:false }` |

`buildSkinCanvasRenderPayload()` 는 `renderable` 이 아닌 것에 `undefined` 를
준다. `renderable` 과 `version` 을 **따로** 두는 이유가 여기 있다 — "그려도
되는가"와 "무슨 모양인가"는 다른 질문이고, 부르는 쪽은 뒤의 답으로 어느
payload 빌더를 쓸지 고른다.

> ★ 이 표의 `2` 행은 `V2-DATA-1` 시점에 "검증하되 아직 안 그린다
> (`renderable:false`)" 였다. **`V2-FLOW-RENDER-1` 이 그 칸을 바꿨다** —
> 유효한 v2 는 이제 실행 payload를 만들고 화면에 그려진다. 무엇이
> 그려지고 무엇이 아직 아닌지는 **§23** 이다.

★ **`version: 2` 는 더 이상 "모르는 version" 이 아니다.** `V2-DATA-1` 이
그것을 그 자리에서 꺼냈다. 조합형 Canvas(로드맵 §14)의 `flow` · `blocks` ·
`main_visual` · `pin` · `overlays` 가 새 Import 에서 실제로 검사되고, 잘못
적힌 v2 는 **정확한 JSON 경로**와 함께 거부된다
(`regions[1].canvas.flow.blocks[4].props.primaryId` 처럼).

v2 에서 **거부하는 것** — 블록 다섯 종류 밖의 `type`, 블록 `width` 의
`"auto"`, `logo` 블록의 `height:"auto"`, 네 값 밖의 `align`, 숫자가 아닌
`margin` · `padding` · `gap` · `maxWidth`, `column` 이 아닌 `direction`,
빈 `main_visual.elements`, 프레임 안의 다른 요소를 가리키지 않거나 사진이
아니거나 `hidden` 인 `primaryId`, 모르는 `follow`, 아홉 점 밖의 `anchor` ·
`origin`, 프레임 안의 `main_visual` · `container`(중첩 · 재귀), 그리고
**블록 · 프레임 내부 요소 · overlay 를 통틀어 중복된 id**.

**허용하는 것** — 음수 `margin` · 음수 `offset`(일부러 겹치기 위해),
프레임 밖으로 나가는 내부 좌표, `follow` 를 토글해도 남아 있는 `x` · `y` ·
`pin`(안 쓰는 칸을 지우지 않는다), 그리고 **모르는 칸 전부**.

★ **v2 canvas 에 최상위 `elements` 가 있으면 거부한다.** v1 의 불변 수정
`writeSkinHomeCanvasElementFields()` 는 version 을 보지 않고
`canvas.elements` 를 찾으므로, 그 칸이 없다는 것이 곧 "v1 writer 는 v2 에
닿을 수 없다"의 근거다. 반대 방향(v1 에 섞인 `flow`)은 거부하지 않는다 —
v1 에서 진짜는 언제나 `elements` 라 애매하지 않고, 거기에 새 거부를 만들면
"모르는 칸은 보존"이 v1 에서 깨진다.

★ **`V2-DATA-1` 이 만들지 않은 것**: v2 DOM · CSS · Preview/sandbox
렌더러 변경 · Studio 패널 · v1→v2 자동 변환 · migration. 그중 **화면
출력은 `V2-FLOW-RENDER-1` 이 만들었다**(§23). Studio 패널 · v1→v2 자동
변환 · migration 은 여전히 없다.

함정(**해결됨**): `skin/skin-home-canvas-test.mjs` 의 `[version]` ·
`[baseheight]` · `[protocol]` 절과 두 Studio e2e 가 **`version: 2` 를 바로
그 "모르는 version" 사례로 쓰고 있었다.** `V2-DATA-1` 이 그 행들을
`version: 3` 으로 옮겼다 — 뜻은 그대로 두고 숫자만 아직 아무도 쓰지 않는
값으로 바꿨다. 앞으로 "모르는 version" 이 필요하면 **3 이상**을 쓴다.

### 보존용 원본 ↔ 실행용 payload

두 길이 다르다. 이것이 §9 의 핵심이다.

| | 보존용 원본 | 실행용 payload |
| --- | --- | --- |
| 어디 | `SkinPackage.regions` 의 항목 그대로 | `resolveSkinTemplate()` 결과의 `template.canvas` |
| 모르는 칸 | **남는다** | **없다**(allowlist) |
| 미래 version | 남는다 | 만들어지지 않는다 |
| 깨진 데이터 | 남는다 | 만들어지지 않는다 |
| 기본값 | 적힌 그대로 | `rotation:0` · `hidden:false` · `locked:false` · 타입별 기본값이 채워진다 |

`buildSkinCanvasRenderPayload()` 의 결과는 항상 **새 리터럴**이다 — `props` 까지
새로 만들어서, 입력의 어떤 객체도 프레임으로 나가는 값에 그대로 실리지 않는다.

sandbox 봉투는 그 payload 를 `skin-sandbox-protocol.js` 의
`isSandboxHomeCanvas()` 로 **한 번 더** 검사한다. 그 파일은 "의존 없음"이라
값 목록을 한 벌 더 갖는데(부모 realm 과 frame realm 이 같은 파일을 각각
로드한다), 둘이 갈라지지 않게 `skin/skin-home-canvas-test.mjs` 의 `[protocol]`
절이 목록과 정규식을 **양방향으로 대조**한다.

---

## 10. 라운드마다 바꾼 파일

### `VENDOR-1` (Moveable · Selecto 고정)

| 파일 | 무엇 |
| --- | --- |
| `studio/vendor/home-canvas/moveable-0.53.0.min.js` | **새 파일** — npm tarball 의 UMD 를 바이트 그대로 |
| `studio/vendor/home-canvas/selecto-1.26.3.min.js` | **새 파일** — 같음 |
| `studio/vendor/home-canvas/licenses/*.txt` | **새 파일** — MIT 전문 둘 |
| `studio/vendor/home-canvas/README.md` | **새 파일** — 출처 · 크기 · SHA-256 · 보관 규칙의 **단일 원천** |
| `studio/vendor/home-canvas/.gitattributes` | **새 파일** — `-text`. 이 저장소는 `core.autocrlf=true` 라 없으면 checkout 때 LF→CRLF 로 바이트가 바뀌어 위 해시가 틀어진다 |
| `studio/studio-home-canvas-vendor.js` | **새 파일** — `ensureHomeCanvasEditorVendors()` 지연 로더 |
| `studio/index.html` · `studio/studio-lifecycle-scenario.html` | 로더 **한 파일**을 읽는다(UMD 둘은 아니다) |
| `core/lib/skin-sandbox-server.js` | allowlist 에 vendor JS **두 줄** — 프레임 HTML 은 안 고쳤다 |
| `studio/studio-home-canvas-vendor-e2e-test.mjs` | **새 파일** — 파일 · 로더 · `cspNonce` 대조군 넷 · allowlist · 공개 비용 0 |

`VENDOR-1` 은 그 외 어떤 파일도 고치지 않았다. 특히 **CSP 를 한 글자도
바꾸지 않았고**(`script-src 'self'` 가 이미 허용한다), `skin/` 의 렌더러 ·
계약 · sanitize · 프레임 문서는 **한 줄도 바뀌지 않았다.**

`APP_BUILD_VERSION` 은 이번에 올리지 않았다(배포하지 않았다).

### `RENDER-1B` (sandbox 프레임)

**새 렌더러를 만들지 않았다.** `RENDER-1A` 의 파일 두 장을 프레임이
읽게 하고, 한 곳에서 빠지던 칸 하나를 채운 것이 전부다.

| 파일 | 무엇 |
| --- | --- |
| `skin/sandbox/frame.html` | 렌더러를 로드한다(`skin-home-canvas.js` 바로 뒤 · sanitize 보다 먼저) |
| `core/lib/skin-sandbox-server.js` | allowlist 에 렌더러 **JS 와 좌표 CSS 둘 다** — 하나만 넣으면 프레임에서만 좌표가 없다 |
| `studio/preview/preview-sandbox.js` | **template.canvas 를 옮긴다** — 아래 ★ |
| `skin/sandbox/skin-sandbox-frame.js` | 주석만(이제 `renderSkin()` 이 그 키를 읽는다) |
| `skin/skin-sandbox-test.html` | 재는 쪽이 fixture · Context 를 끼우는 창구 · `?pageType=` · `?linkNav=1`(테스트 하네스 전용) |
| `studio/studio-lifecycle-scenario.html` | `sb` 의 `skin_image_slot_values` 주입 창구(기본은 빈 배열) |
| `skin/skin-home-canvas-sandbox-e2e-test.mjs` | **새 파일** — 실물 서버 · 실물 CSP 로 재는 E2E |
| `skin/skin-home-canvas-test.mjs` | `[docs]` 절 — 세 문서 로드 · allowlist 두 칸 · 아래 ★ |

★ **Studio sandbox Preview 만 캔버스가 빠지던 자리.**
`preview-sandbox.js` 는 부모가 보낸 template 을 **알려진 키만** 새
리터럴로 옮겨 프레임에 보낸다(`html` · `css` · `js` · `sides` ·
`settings`). 거기에 `canvas` 줄이 없으면 공개 화면도, Studio native
Preview 도, 공개 sandbox 도 멀쩡한데 **그 한 화면에서만** 표시 위치가
빈 채로 그려진다. 그 파일이 `js` 에 대해 같은 함정을 주석으로 적어
두었는데 캔버스가 정확히 같은 데 걸렸다. 칸 목록을 한 벌 더 만들지
않으려고 판정과 복사는 `coerceSkinHomeCanvasRenderPayload()` 에 맡긴다.

`RENDER-1B` 는 **CSP 를 한 글자도 바꾸지 않았다** — 렌더러 JS 는
`script-src 'self'`, 좌표 CSS 는 `style-src 'self'` 가 이미 허용한다.
`skin/skin-home-canvas-render.js` · `.css` · `skin/skin-render.js` 는
**한 줄도 고치지 않았다.**

### `RENDER-1A` (정적 Renderer)

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-home-canvas-render.js` | **새 파일** — `compileSkinHomeCanvas()`. DOM 생성 · 갱신 · 제거 |
| `skin/skin-home-canvas-render.css` | **새 파일** — 좌표 구조만(색 · 글꼴 · 테두리 0줄) |
| `skin/skin-render.js` | `renderSkin()` mount **끝**에서 캔버스를 그린다 + 그때만 위 CSS 를 건다 |
| `index.html` · `studio/preview/preview-frame.html` | 렌더러를 로드한다 — **이 둘뿐**이다 |
| `skin/skin-home-canvas-render-harness.html` | **새 파일** — 공개 화면과 같은 `renderSkin()` 으로 그리는 하네스(테스트용) |
| `skin/skin-home-canvas-render-e2e-test.mjs` | **새 파일** — 정적 Renderer E2E(TESTS.md §13) |
| `skin/skin-home-canvas-test.mjs` | `[docs]` 절에 로드 위치 · 좌표 CSS 에 색이 없음 · 렌더러와 계약 파일의 규칙 대조 |
| `studio/studio-lifecycle-scenario.html` | `lay` 의 `skin_image_slot_values` 를 주입할 수 있게(기본은 지금까지와 같은 빈 배열) |

`RENDER-1A` 는 그 외 어떤 파일도 고치지 않았다. 특히 **`skin/skin-home-canvas.js`
(데이터 계약)와 `skin/skin-template.js` 는 한 줄도 바뀌지 않았다** — 렌더러는
이미 있던 실행 payload 를 받기만 한다. `skin/sandbox/*` 와
`core/lib/skin-sandbox-server.js` 도 그대로다(§12-6).

### `1C` (baseHeight)

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-home-canvas.js` | `SKIN_HOME_CANVAS_BASE_HEIGHT`(844) · 필수 검증 · 실행 payload · 빈 캔버스 기본값 |
| `skin/sandbox/skin-sandbox-protocol.js` | 봉투 allowlist 에 `baseHeight` 추가 — **이걸 빼면 봉투가 캔버스를 통째로 거부한다**(strict allowlist 라서 새 칸이 곧 거부 사유가 된다) |
| `skin/skin-home-canvas-test.mjs` · `studio/studio-home-canvas-e2e-test.mjs` | `[baseheight]` 절과 왕복 검증 |

`1C` 는 그 외 어떤 파일도 고치지 않았다 — `regions` 를 통째로 보존하는
Import·Export·Save·Publish·AI 경로는 새 칸이 생겨도 그대로 지나간다.

### `1B` (계약 전체)

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-home-canvas.js` | **새 파일** — 계약 · 검증 · 보존 · 실행 payload 의 단일 원천 |
| `skin/skin-sanitize.js` | 표시 위치 속성을 위 파일의 표에 묻는다 |
| `skin/skin-template.js` | `resolveSkinTemplate()` 이 HOME + 표식일 때만 `canvas` 를 싣는다 |
| `skin/skin-package-import.js` | `home_canvas` 검증(+`canvasSource` 옵션) |
| `skin/sandbox/skin-sandbox-protocol.js` | 봉투의 `canvas` 칸 strict allowlist |
| `skin/sandbox/skin-sandbox-host.js` | 봉투에 싣는 자리 |
| `skin/sandbox/skin-sandbox-frame.js` | 프레임이 받아 `skin.canvas` 로 옮긴다 |
| `studio/ai/studio-ai-panel.js` | `canvasSource: "draft"` |
| `core/lib/skin-sandbox-server.js` | sandbox origin allowlist |
| `index.html` · `studio/index.html` · `studio/preview/preview-frame.html` · `skin/sandbox/frame.html` · `studio/studio-lifecycle-scenario.html` | 새 파일을 **sanitize 보다 먼저** 로드 |

Export(`skin/skin-package-export.js`)와 Save(`skin/skin-package-normalize.js`)는
고치지 않았다 — 둘 다 원래부터 `regions` 를 통째로 보존한다(Export 는 깊은 복사,
Save 는 스프레드). 테스트가 그 사실을 못박는다.

`APP_BUILD_VERSION` 은 이번에 올리지 않았다(배포하지 않았다).

---

## 11. 아직 구현하지 않은 것 · 남은 차이

**이 절은 계약이 아니라 앞으로의 약속과 빈 곳이다.**

### 11-1. 정적 Renderer 는 끝났다 — 남은 것은 조작이다

**네 화면 전부 구현됐고 parity 가 검증됐다**(§12 · §12-6).

| 화면 | 상태 |
| --- | --- |
| 공개 native | **구현됨**(`RENDER-1A`) |
| Studio native Preview | **구현됨**(`RENDER-1A`) |
| 공개 sandbox | **구현됨**(`RENDER-1B`) |
| Studio sandbox Preview | **구현됨**(`RENDER-1B`) |

E2E 가 네 화면을 실제로 띄워 **DOM 을 글자 단위로, 좌표를 1px · 회전을
0.75° 안에서** 대조한다(TESTS.md §13).

남은 것은 **조작**이다 — 다음 절.

### 11-2. UI (`SELECT-1` · `HISTORY-1` · `ELEMENTS-1` 이후)

**있는 것은 단독 선택 요소의 이동 · 리사이즈 · 회전 셋이다**
(`TRANSFORM-1A` — §17, `1B` — §18, `1C` — §19). 마우스 · 펜으로 끌어
`x` · `y` · `width` · `height` · `rotation` 을 바꾸고, 한 제스처가 Undo
한 칸이다.

왼쪽 패널에는 **최소 Inspector** 가 생겼다(`INSPECTOR-1A` — §22) — 글자
내용 한 칸과 geometry 다섯 칸이다.

**그룹 조작**(이동 · 리사이즈 · 회전) · 스냅 · 가이드 · 키보드 조작 ·
손가락 조작 · 글꼴/색/정렬 같은 스타일 칸 · 레이어 목록 ·
`hidden`/`locked` 토글 · 다중 일괄 편집 · preset · 사진 자동 매핑 ·
sticker 업로드 · widget — **아직 하나도 없다.**

그 밖에는 **고르고 · 푸는 것 · 그것을 보여 주는 것만 있다**
(`SELECT-1A` — §14, `SELECT-1B-1` — §15, `SELECT-1B-2` — §16).

효과(파티클 · 꽃잎 · 복합 모션)를 sandbox 사용자 JS 가 Canvas 요소에 거는
**공식 hook** 도 아직 없다 — 지금은 저자 JS 가 DOM 을 직접 만지는 것을 이
라운드가 **막지 않는다**는 것까지다(§15-7-1). 범위는 로드맵의
`HOME-CANVAS-EFFECT-HOOK-1`.

Moveable · Selecto 는 **저장소에 들어왔지만 아직 아무것도 조작하지 않는다**
(`VENDOR-1` — §13). 파일 · 로더 · allowlist · `cspNonce` 회귀 테스트는 있고,
**Canvas 요소와의 연결과 프레임 조건부 load 메시지가 없다.** 채택 조건과
좌표 측정값은
[IMORY_HOME_CANVAS_ROADMAP.md](../plans/IMORY_HOME_CANVAS_ROADMAP.md) §8-1 ·
§8-2 에 있다. **그 Spike 를 다시 실행하지 않는다.**

### 11-3. 남은 차이

| 빈 곳 | 어디서 정하나 |
| --- | --- |
| **Moveable · Selecto 가 고정됐지만 Canvas 요소에 연결되지 않았다**(파일 · 로더 · allowlist · nonce 테스트는 있다 — §13) | `HOME-CANVAS-SELECT-1B` |
| **sandbox 프레임 안에서 vendor 를 조건부로 받는 메시지**(지금 프레임은 로더조차 읽지 않는다 — §13-5) | `HOME-CANVAS-SELECT-1B` |
| **회전을 따라가는 선택 틀**(지금 테두리는 축에 평행한 사각형이라 회전 요소에서는 외곽 상자를 그린다 — §14-4) | `HOME-CANVAS-SELECT-1B` |
| **다중 선택 UI**(상태는 배열이지만 `ids` 가 최대 1개다 — §14-2) | `HOME-CANVAS-SELECT-1B` |
| ~~이동을 Canvas JSON 에 쓰는 경로~~ — **`TRANSFORM-1A` 에서 끝났다**(§17). 기존 `applyStudioInspectorPatch` 는 HTML/CSS 전용이라 쓰지 않는다(§14-6) | 완료 |
| ~~크기를 Canvas JSON 에 쓰는 경로~~ — **`TRANSFORM-1B` 에서 끝났다**(§18) | 완료 |
| ~~회전을 Canvas JSON 에 쓰는 경로~~ — **`TRANSFORM-1C` 에서 끝났다**(§19) | 완료 |
| **그룹 조작**(지금은 여럿을 고르면 틀만 남고 이동 · 손잡이가 전부 꺼진다 — §17-1 · §18-1 · §19-1) | `HOME-CANVAS-TRANSFORM-1D` |
| **스냅 · 가이드 · 키보드 조작 · Shift 각도 스냅 · 사용자 지정 회전 중심**(§19-12) | `HOME-CANVAS-TRANSFORM-1D` |
| **손가락 조작**(의도적 미지원 — 그 자리는 Preview 스크롤이 지킨다 — §17-2 · §18-12 · §19-10) | `HOME-CANVAS-LAYERS-1` 의 모바일 다중 선택과 함께 |
| ~~캔버스 요소의 Inspector 입력 필드(글자 내용 · geometry)~~ — **`INSPECTOR-1A` 에서 끝났다**(§22) | 완료 |
| **글꼴 · 글자 크기 · 색 · 행간 · 정렬 · `shape` 스타일 칸** — 그 값들이 Canvas JSON 에 **없다**(§8). 넣으려면 계약을 먼저 바꾼다 | `DECOR-1` · `STICKER-1` |
| **이미지 교체 · 자르기 UI 를 Canvas 패널 안에서** — 지금은 슬롯 이름과 "Images 에서 바꾼다" 안내뿐이다(§22-2) | `HOME-CANVAS-INSPECTOR-1A` 이후의 자르기 UI |
| **`category_nav` 의 카테고리 고르기 · 순서** — 지금은 개수 요약만 읽기 전용으로 보여 준다(§22-2) | 아직 요청 없음 |
| **`hidden` · `locked` 를 왼쪽 패널에서 켜고 끄기** — 레이어 목록이 없어 **되돌릴 길이 없다**(숨기면 다시 고를 수 없다 — §14-3). 그래서 일부러 내놓지 않았다(§22-7) | `HOME-CANVAS-LAYERS-1` |
| **명시적 Crop 정보를 Canvas payload 에 잇는 경로** — 지금 `photo` · `sticker` · `logo` 의 props 는 `slot`(+ `fallback`) 뿐이어서 "주인이 자르기를 골랐다"를 나타낼 칸이 **하나도 없다**. 그래서 기본값을 `contain` 으로 확정했다(§21-3) | `HOME-CANVAS-INSPECTOR-1A` 이후의 자르기 UI |
| **hidden · locked 를 다루는 레이어 목록**(지금 숨긴 요소는 Studio 에서 다시 고를 방법이 없다 — §14-3) | `HOME-CANVAS-LAYERS-1` |
| 390 저장 좌표 → 데스크톱 폭 변환 규칙 | `HOME-CANVAS-RESPONSIVE-1` |
| 모바일/데스크톱 좌표 override 를 둘 것인가 | `HOME-CANVAS-RESPONSIVE-1` |
| 좌우 패널(`left_sidebar` · `right_sidebar`) 안의 Canvas | `HOME-CANVAS-SIDES-1` |
| `canvas.background` · 요소별 `style` · `shape.fill/stroke` · `sticker.outline` | `DECOR-1` · `STICKER-1` |
| **깨진 캔버스를 사람이 고치는 길** — 유효하지 않은 캔버스에서는 고를 요소가 없어 왼쪽 패널도 열리지 않는다(§22-1). 여전히 Import 창뿐이다 | `HOME-CANVAS-LAYERS-1` 이후 |
| `logo.fallback` 에 "아무것도 안 그림" 같은 값이 필요한가 | 아직 요청 없음 — 지금은 `site_title` 하나 |

### 11-4. 확장 방향 (기록만)

같은 `canvas` 데이터 구조를 `left_sidebar` · `right_sidebar` 항목 안에도 붙일
수 있게 만들어 두었다. `skin/skin-home-canvas.js` 의 `validateSkinCanvasData()` ·
`buildSkinCanvasRenderPayload()` 는 region 이름을 모른다 — 찾는 이름을 늘리는
것만으로 좌우 Canvas 를 붙일 수 있다. **이번 라운드는 붙이지 않았다.**

#### 조합형 v2 — **PLAN. 이 문서가 갖지 않는다**

로고 · 카테고리 · 제목 · 본문처럼 **내용이 늘어나는** 것까지 절대좌표에 두면
한 줄이 늘 때마다 주인이 아래 것들을 손으로 다시 옮겨야 한다. 그래서 다음
구조(`canvas.version:2`)는 화면을 두 층으로 가른다 — 위에서 아래로 흐르는
**자동 배치 블록**과, 그 안팎의 **자유 배치 장식**이다.

- 상세 설계(JSON 모양 · 블록 계약 · `main_visual` · `pin`/`transform` ·
  묶기 UX · 단계별 작업 ID)는 **전부 로드맵
  [§14](../plans/IMORY_HOME_CANVAS_ROADMAP.md#14-조합형-home-canvas-v2-설계-home-canvas-composition-contract-1)**
  가 갖는다. 이 문서에 v2 를 옮겨 적지 않는다 — **아직 코드가 강제하는 것이
  하나도 없기 때문이다.**
- **v1 은 그대로 남는다.** v2 의 페이지 자유 장식(`overlays`)은 v1 요소와
  **같은 모양**이고, `main_visual` 내부 자유 요소도 같은 선택 · lasso ·
  이동 · 리사이즈 · 회전 · Undo 경로를 쓴다(§14 · §16 · §17 · §18 · §19).
  v1 JSON 을 자동 변환하거나 migration 하지 않는다.
- 두 version 을 가르는 것은 `canvas.version` 숫자 하나다. **v2 canvas 는
  최상위 `elements` 를 갖지 않는다** — 그 칸이 없어야 v1 의
  `writeSkinHomeCanvasElementFields()`(version 을 보지 않고 `canvas.elements`
  를 찾는다)가 v2 데이터에 닿을 수 없다.

---

## 12. 정적 Renderer (`HOME-CANVAS-RENDER-1A` · `1B`)

**이 절은 지금 코드가 강제한다.** 조작 UI 는 여기 없다 — 그리기만 한다.

**렌더러는 한 벌뿐이다.** 네 화면이 같은 파일을 읽는다 — sandbox 전용
렌더러도, 화면별로 복제한 타입별 DOM 생성 코드도 없다.

| 무엇 | 파일 |
| --- | --- |
| DOM 생성 · 갱신 · 제거 | `skin/skin-home-canvas-render.js` `compileSkinHomeCanvas(root, canvas, context)` |
| 좌표 구조 CSS | `skin/skin-home-canvas-render.css` |
| 부르는 자리 | `skin/skin-render.js` `renderSkin()` mount **끝** |

### 12-1. 언제 그리는가 · 어디서 그리는가

다섯이 전부 맞을 때만 그린다.

1. HOME 화면이다
2. 지원하는 v1 실행 payload 가 있다
3. `enabled !== false`
4. HOME template 안에 `[data-imory-canvas-root]` 가 **정확히 하나**
5. 그 표식이 지금 그린 HOME template 의 것이다

앞 셋은 `resolveSkinTemplate()` 이, 넷째는 그 함수와 렌더러가 **둘 다**,
다섯째는 렌더러가 `renderSkin` 이 만든 root 안에서만 찾는 것으로 성립한다.
하나라도 어긋나면 **기존 HOME DOM 을 한 글자도 건드리지 않는다**(§3 의
fallback 표). 표식을 자동으로 만들지 않는다.

그리는 화면은 **넷**이다.

| 화면 | 어디서 도는가 |
| --- | --- |
| 공개 native HOME | `index.html` |
| Studio native Preview | `studio/preview/preview-frame.html` |
| 공개 sandbox HOME | `skin/sandbox/frame.html`(다른 origin) |
| Studio sandbox Preview | 같은 프레임 문서 — Studio Preview 안에 한 겹 더 |

넷 다 같은 `renderSkin()` 의 같은 자리에서 같은 파일을 부른다. 그래서
"어디에 그렸는가"만 다르고 결과는 같다(§12-6).

### 12-2. 좌표 — ResizeObserver 도 매 프레임 재계산도 없다

표식의 가로폭은 **template 와 스킨 CSS** 가 정한다. 플랫폼은 세로를 가로에
묶기만 한다.

```css
[data-imory-canvas-active="true"] {
  position: relative;
  aspect-ratio: var(--imory-canvas-base-width) / var(--imory-canvas-base-height);
}
```

요소의 네 값은 **백분율**이다. 백분율은 표식 상자를 기준으로 풀리므로 표식이
넓어지면 네 값이 **같은 배율로** 함께 커진다.

| CSS | 값 |
| --- | --- |
| `left` | `x / baseWidth * 100%` |
| `top` | `y / baseHeight * 100%` |
| `width` | `width / baseWidth * 100%` |
| `height` | `height / baseHeight * 100%` (숫자 height 일 때만) |
| `transform` | `rotate(<rotation>deg)` — `transform-origin` 기본값이 요소 **중심**이라 §4 가 그대로 성립한다 |

- 값은 `element.style.setProperty()` 로 쓴다(CSSOM 쓰기는 CSP 가 막지 않는다 —
  `skin/skin-layout.js` 와 같은 이유). **사용자 문자열이 CSS 문자열에 섞이지
  않는다** — 실행 payload 가 검증한 숫자만 간다.
- Renderer 가 정하지 **않는** 것: `max-width` · 가운데 정렬 · viewport 높이 ·
  `overflow` · 배경. 경계를 넘친 요소를 자를지 보일지는 **스킨 CSS** 가 고른다.
- 요소 위치로 도화지 높이를 다시 계산하지 않는다(§4-1).
- **글자 크기는 배율에 따라 바뀌지 않는다.** 이 단계는 상자를 비례로 키울 뿐
  조판을 바꾸지 않으므로, `height:"auto"` 요소의 실제 높이는 **스킨의 조판**이
  정한다. 390 저장 좌표를 데스크톱 폭으로 옮기는 규칙은 `RESPONSIVE-1` 이다.

### 12-3. 요소 DOM

최상위는 **항상 `div`** 다. 종류마다 바깥 상자의 태그가 달라지면 좌표 · 회전 ·
앞뒤 순서 규칙이 종류마다 갈라지고, 나중에 붙을 조작 손잡이도 대상 태그를 하나로
못 잡는다. 의미가 있는 태그(`p` · `ul` · `a` · `img`)는 그 안에 넣는다.

```html
<div data-imory-canvas-element
     data-imory-canvas-type="photo"
     data-imory-canvas-height="fixed"
     data-imory-edit-id="canvas_a1b2c3d4-…"></div>
```

| 속성 | 뜻 |
| --- | --- |
| `data-imory-canvas-element` | **렌더러가 만든 자식**이라는 표시(§12-5) |
| `data-imory-canvas-type` | 여섯 종류 |
| `data-imory-canvas-height` | `fixed` · `auto` |
| `data-imory-edit-id` | `element.id`. Studio Inspector 가 이 선택자로 CSS 를 고친다(§8) |
| `data-imory-canvas-hidden` | `hidden:true` 일 때. `hidden` 속성도 함께 붙어 **실제로 그려지지 않는다** |
| `data-imory-canvas-locked` | `locked:true` 일 때. **공개 화면의 모양은 바뀌지 않는다** |
| `data-imory-canvas-role` | `text` 의 의미 역할. 플랫폼이 이 값으로 글자 크기도 색도 주지 않는다 |
| `data-imory-canvas-shape` | `rect` · `ellipse` · `line` |
| `data-imory-canvas-nav-mode` | `all` · `selected` |

**배열 순서가 곧 DOM 순서이고 그것이 앞뒤 순서다** — `z-index` 를 만들지 않는다.

이 `data-imory-canvas-*` 들은 저장 경계의 화이트리스트에 **없다**
(`data-imory-canvas-root` 하나만 있다) — 그래서 스킨 HTML 에서 올 수 없고,
런타임 흔적이 저장되는 HTML 에 섞일 수도 없다.

### 12-4. 종류별로 무엇을 그리는가

| 종류 | 그리는 것 |
| --- | --- |
| `photo` · `sticker` | 슬롯에 이미지가 있으면 `<img alt="">`. **빈 슬롯이어도 wrapper 는 남고 플랫폼 placeholder 를 넣지 않는다** |
| `logo` | 이미지가 있으면 `<img>`(alt 는 **지금 블로그의 실제 제목**). 비었고 `fallback:"site_title"` 이면 제목을 `<span>` 에 `textContent` 로. 제목이 비면 아무것도 안 그린다 |
| `text` | `<p>` 하나에 `textContent`. 줄바꿈은 `white-space: pre-wrap` 이 살린다 |
| `category_nav` | `<ul><li><a href>`. `all` 은 표시 가능한 카테고리 전체, `selected` 는 `categoryIds` **순서대로**(없는 id 는 건너뛰고 **저장 데이터는 고치지 않는다**). 결과가 비면 wrapper 만 |
| `shape` | 속성 하나. **칠하지 않는다** — `ellipse` 의 `border-radius:50%` 만이 "타원이게" 하는 구조다 |

- 이미지는 **기존 이미지 슬롯**(`context.images[slot]`), 카테고리는 **기존
  Context**(`context.navigation.categories`), 제목은 `context.site.title` 이다.
  새 저장 방식도 새 라우터도 만들지 않는다.
- `href` 와 `src` 는 `isSafeSkinUrl()` 을 지난 값만 붙는다(`skin-render.js` 의
  URL 바인딩과 **같은 단일 판정 함수**). 막히면 링크와 wrapper 는 남고 주소만
  붙지 않는다.
- 사용자 문자열은 **어디에도 `innerHTML` 로 들어가지 않는다.**
- 카테고리 링크는 버튼이 아니라 실제 `<a href>` 이고, 클릭은 기존 공통 라우팅
  (`skin/skin-link-nav.js`)이 가져간다 — 별도 라우터를 만들지 않는다.

플랫폼 CSS 가 생김새에 손대는 곳은 **셋뿐**이고 전부 구조다: 이미지의
`object-fit: contain`(눌리지도 잘리지도 않게 — `MANUAL-UX-FIX-1` 에서
`cover` 에서 바뀌었다, §21-3), 생성한 `p`/`ul` 의
`margin`·`list-style` 초기화(UA 기본값이 좌표를 밀어내지 않게), `ellipse` 의
`border-radius`. 셋 다 선택자가 0,1,x 라 스킨 CSS(0,2,x)가 언제든 덮어쓴다.

### 12-5. 다시 그리기 · 정리

- 같은 표식에 여러 번 그려도 **요소가 중복되지 않는다** — 자기가 만든 자식
  (`[data-imory-canvas-element]`)만 걷어내고 다시 만든다.
- **표식 자체와 스킨이 표식에 준 class · 속성 · 스킨이 표식 안에 직접 적어 둔
  자식은 지우지 않는다.**
- 캔버스가 사라지거나 꺼지면 만든 DOM 과 활성 표시(`data-imory-canvas-active` ·
  `-version` · 도화지 custom property)만 정리한다.
- **입력 Canvas 데이터와 Context 를 mutate 하지 않는다.**
- 늦게 도착한 응답이 최신 화면을 덮지 않게 하는 것은 이 파일이 아니라 화면을
  여는 쪽의 기존 요청 순번이다(`skin/skin-home.js` 등) — 렌더러는 `renderSkin()`
  이 mount 를 끝내는 동기 시점에만 돈다.

### 12-6. sandbox — 같은 렌더러가 프레임 안에서도 돈다 (`RENDER-1B`)

프레임 문서(`skin/sandbox/frame.html`)가 `skin-home-canvas-render.js` 를
**공개 문서와 같은 자리**(`skin-home-canvas.js` 뒤 · sanitize 앞)에서
로드한다. 그 뒤는 프레임 안에서도 `renderSkin()` 이 같은 조건으로 같은
전역을 부른다.

| 무엇 | 어디 |
| --- | --- |
| 렌더러 JS | `SANDBOX_ALLOWED_PATHS` 의 `/skin/skin-home-canvas-render.js` |
| 좌표 CSS | 같은 목록의 `/skin/skin-home-canvas-render.css` |
| 실행 데이터 | 이미 있던 봉투 — `skin-sandbox-host.js` 가 싣고 `isSandboxHomeCanvas()` 가 strict allowlist 로 다시 검사하며 `skin-sandbox-frame.js` 가 `skin.canvas` 로 옮긴다(§9) |
| Studio sandbox 경로 | `preview-sandbox.js` 가 template 의 `canvas` 를 옮긴다(§10 의 ★) |

- **둘 다** allowlist 에 있어야 한다. JS 만 넣으면 요소는 생기지만 좌표가
  없고, CSS 만 넣으면 아무것도 생기지 않는다. allowlist 는 **pathname 만**
  보므로 `?v=APP_BUILD_VERSION` 이 붙어도 같은 판정이다.
- **CSP 는 한 글자도 바뀌지 않았다.** 렌더러 JS 는 `script-src 'self'`,
  좌표 CSS 는 `style-src 'self'` 가 이미 허용한다. 좌표는
  `element.style.setProperty()`(CSSOM)로 쓰므로 `style-src` 에
  `'unsafe-inline'` 이 없어도 걸리지 않는다 — E2E 가 실제 CSP 아래에서
  위반 0건과 적용된 좌표를 함께 잰다.
- **부모는 frame DOM 에 손대지 않는다.** 캔버스 때문에 생긴 새 메시지도
  없다 — 데이터는 기존 봉투로, 링크 클릭은 기존 `IMORY_NAVIGATE`(주소가
  아니라 부모가 발급한 정수 `navId` 하나)로 간다.
- 이미지 슬롯 주소는 프레임 CSP 의 `img-src` 가 허용하는 출처여야 한다
  (배포에서는 Supabase Storage). 투영 함수가 루트 상대 주소를 부모 origin
  기준 절대 주소로 바꿔 보내는 기존 규칙 그대로다.

### 12-7. 기존 스킨

- `home_canvas` 가 없는 스킨: **DOM 변화 0.** 플랫폼 CSS link 조차 붙지 않는다
  (`renderSkin` 이 `skin.canvas` 가 있을 때만 건다).
- 표식이 없는 스킨: 렌더 결과가 **글자 단위로** 캔버스 이전과 같다.
- CATEGORY · POST · BANNER 는 표식이 있어도 그리지 않는다(v1 의 캔버스는 HOME
  한 장이다).
- 기존 스킨에 표식 · 요소 · 리스너를 자동으로 넣지 않는다. 기본 editorial 스킨도
  변환하지 않는다.
- **리스너를 하나도 만들지 않는다** — 정적 렌더러라 전역 이벤트가 없다.
- 위 전부가 **네 화면에서 같다** — sandbox 프레임에서도 캔버스가 없는
  스킨은 DOM 이 한 글자도 바뀌지 않고, CATEGORY · POST · BANNER 는 표식이
  있어도 그리지 않는다.

`APP_BUILD_VERSION` 은 이번에 올리지 않았다(배포하지 않았다).

---

## 13. 편집기 라이브러리 고정 (`HOME-CANVAS-VENDOR-1`)

**이 절은 지금 코드가 강제한다.** 다만 강제하는 것은 "어떻게 놓여 있는가"
뿐이다 — **조작은 한 줄도 없다**(§13-4).

### 13-1. 무엇이 고정됐나

| 라이브러리 | 버전 | 형태 | 라이선스 | 파일 |
| --- | ---: | --- | --- | --- |
| Moveable | **0.53.0** | UMD minified | MIT | `studio/vendor/home-canvas/moveable-0.53.0.min.js` |
| Selecto | **1.26.3** | UMD minified | MIT | `studio/vendor/home-canvas/selecto-1.26.3.min.js` |

공식 npm registry tarball 의 `dist/*.min.js` 를 **바이트 그대로** 두었다.
재번들 · 재압축 · 재minify 하지 않았고 첫 줄의 MIT 배너도 그대로다. ESM
빌드는 넣지 않았다 — bare specifier 가 남아 있고 이 저장소에는 번들러가
없다(CLAUDE.md §1).

정확한 크기 · SHA-256 · tarball integrity · 보관 규칙은
[studio/vendor/home-canvas/README.md](../../studio/vendor/home-canvas/README.md)
가 **단일 원천**이고, `studio/studio-home-canvas-vendor-e2e-test.mjs` 가
그 표를 읽어 실제 파일과 대조한다. 값을 다른 문서에 복사해 적지 않는다.

버전을 파일 이름에 적는다. 주소가 그대로면 버전이 바뀐 것을 아무도 눈치채지
못하기 때문이다.

### 13-2. 어떻게 받는가 — 부를 때만

```js
const { Moveable, Selecto } = await ensureHomeCanvasEditorVendors();
```

[studio/studio-home-canvas-vendor.js](../../studio/studio-home-canvas-vendor.js)
가 주는 전역 하나다. 규칙:

- 같은 문서에서 몇 번을 불러도 **UMD 당 요청 한 번**.
- 동시에 불러도 **같은 Promise**.
- 하나라도 실패하면 **어떤 파일이 실패했는지 적힌 Error** 로 거절한다.
  실패한 Promise 는 표에 남기지 않는다 — 다시 시도할 수 있다.
- 로드 뒤 전역 `Moveable` · `Selecto` 가 실제로 생겼는지 확인한다. 200 인
  SPA fallback HTML 을 성공으로 보지 않으려는 것과 같은 관문이다.
- 주소는 **절대 경로 + `?v=${APP_BUILD_VERSION}`**. 값을 복사해 적지 않고
  `core/lib/build-version.js` 의 전역에서 읽는다(CLAUDE.md §4).

★ `loadVersionedScripts()` 를 쓰지 않는다. 그 loader 넷은 전부
`document.write` 라 문서를 **파싱하는 동안에만** 쓸 수 있고, 이 로더는
사람이 편집을 켠 뒤에 불린다. 같은 일을 동적 `<script>` 로 하되 붙이는
주소는 똑같다. **어떤 HTML 에도 고정 URL vendor `<script>` 를 만들지
않는다**(테스트가 다섯 문서에서 이것을 검사한다).

### 13-3. `cspNonce` — 부르는 쪽이 넘긴다

두 라이브러리는 런타임에 `<style data-styled-id="…">` 를 만들어 붙인다.
sandbox 프레임의 CSP 는 `style-src 'self' 'nonce-…'` 라(§12-6 · SANDBOX-1)
nonce 를 넘기지 않으면 그 style 이 통째로 막힌다. 로더는 이것을 대신해 주지
않는다 — **생성자에 `cspNonce` 를 넘기는 것은 부르는 쪽의 몫**이다.

`studio/studio-home-canvas-vendor-e2e-test.mjs --only=nonce` 가 **배포되는 그
`buildSandboxCsp()`** 로 만든 정책 아래에서 대조군 넷을 실측한다(2026-09-21).

| 대조군 | Moveable nonce | Selecto nonce | style-src 위반 | 실측 결과 |
| --- | --- | --- | ---: | --- |
| `both` | 전달 | 전달 | **0** | 두 style 적용 · Moveable 핸들 **14×14** · Selecto 영역 `fixed` · `1px` 테두리 · `rgba(68,170,255,0.5)` · 드래그 정상 |
| `moveableOnly` | 전달 | 미전달 | 1 | **Selecto** 의 style 만 막힘 |
| `selectoOnly` | 미전달 | 전달 | 1 | **Moveable** 의 style 만 막힘 · 핸들 **91×0 으로 붕괴** |
| `neither` | 미전달 | 미전달 | 2 | 둘 다 막힘 |

귀속은 위반 **건수가 아니라** 각 `<style data-styled-id>` 요소의
`el.sheet` 로 가른다. CSP 는 요소의 삽입이 아니라 **적용**을 막으므로 막힌
style 은 DOM 에 남고 `sheet` 만 `null` 이 된다.

금지한 것은 그대로다 — `unsafe-inline` 없음 · CSP 완화 없음 ·
`document.createElement` monkey patch 없음 · UMD 파일 수정 없음 · 런타임
style 에 사후적으로 nonce 를 심는 짓 없음.

★ **Moveable 0.53.0 의 `cspNonce` 는 작동하지만 deprecated 다.** 그것이
버전을 정확히 고정하는 이유다 — 근거는 이 패키지가 끌어오는
`react-moveable@0.56.0` 의 `declaration/types.d.ts` 에 붙은 `@deprecated`
이고, 대체 옵션은 확인되지 않았다. 버전을 올리면 그 옵션이 조용히 사라져
프레임 안에서 핸들이 CSP 에 막힐 수 있으므로, 올리기 전에 위 대조군 넷을
새 파일로 다시 돌린다.

### 13-4. 지금 아무도 부르지 않는다

`studio/index.html` 과 `studio/studio-lifecycle-scenario.html` 이 **로더
한 파일**(3KB)을 읽는다. UMD 둘(약 300KB)은 `ensureHomeCanvasEditorVendors()`
를 부른 뒤에야 온다. **이 라운드에는 부르는 곳이 없다.**

| 화면 | 로더 | UMD 둘 |
| --- | --- | --- |
| 공개 `index.html` | 안 읽음 | **요청 0** |
| 공개 native HOME | 안 읽음 | **요청 0** |
| 공개 sandbox 프레임 | 안 읽음 | **요청 0** |
| Studio(열기만) | 읽음 | **요청 0** |

**공개 화면의 전송 비용 증가는 0 이다.** 운영 HOME Renderer(§12)는 vendor 의
존재를 모른 채 그대로 돈다.

### 13-5. sandbox 는 길만 열어 두었다

`core/lib/skin-sandbox-server.js` 의 `SANDBOX_ALLOWED_PATHS` 에 **두 vendor
JS 경로 정확히 두 줄**이 올라가 있다. 그래서 sandbox origin 에서 직접
요청하면 올바른 Content-Type 으로 200 이 나오고(`?v=` 가 붙어도 같다 —
allowlist 는 pathname 만 본다), 평상시 공개 sandbox 렌더에서는 **요청 자체가
생기지 않는다.**

**프레임 HTML 에 vendor `<script>` 를 정적으로 넣지 않았다.** 프레임 안의
조건부 load 와 Studio→frame 메시지는 `HOME-CANVAS-SELECT-1` 의 일이다.

★ 이것이 sandbox origin 에서 나가는 **유일한 `/studio/` 경로**다. 디렉터리를
연 것이 아니라 파일 두 개를 적은 것이고, 로더 자신
(`/studio/studio-home-canvas-vendor.js`) 과 `studio/studio-preview.js` 를
비롯한 나머지 Studio 코드는 **여전히 404** 다. 그럴 수 있는 이유는 이 둘이
Imory 코드가 아니라 재가공하지 않은 MIT third-party UMD 이기 때문이다 —
우리 데이터도 인증도 화면 구조도 들어 있지 않다.

---

## 14. 선택 소유권과 단일 선택 기반 (`HOME-CANVAS-SELECT-1A`)

**이 절은 구현이다.** 캔버스 요소를 **고르고 푸는 것**까지이고, 고친 뒤
저장하는 경로는 하나도 없다(§14-6).

조사 근거: `HOME-CANVAS-SELECT-AUDIT-1`. 그 조사가 밝힌 것은 기존 Inspector
선택이 캔버스 요소를 **원리적으로** 담을 수 없다는 것이었다 — 그 상태는
언제나 template HTML 을 다시 파싱해서 "그 식별자가 지금도 그 요소인가"를
따지는데, 캔버스 요소는 그 HTML 에 없기 때문이다.

### 14-1. 소유자가 둘이고, 동시에 켜지지 않는다

| 상태 | 무엇을 가리키나 | 어디 |
| --- | --- | --- |
| `studioInspectorSelection` | template HTML 안의 요소 | `studio/inspector/studio-inspector.js` |
| **캔버스 선택** | `regions.home_canvas.canvas.elements[]` 의 요소 | `studio/inspector/studio-canvas-selection.js` |

전환 규칙은 **한 곳**이 정한다 —
`routeStudioInspectSelectMessage(data)`(`studio-inspector.js`).

| 프레임이 올린 것 | 결과 |
| --- | --- |
| 지금 draft 의 **고를 수 있는** 캔버스 요소 | 캔버스 선택(기존 Inspector 선택은 풀린다) |
| 캔버스 요소이지만 hidden · locked | **거부** — 어느 상태도 만들지 않는다 |
| 그 밖의 식별자 | 기존 Inspector 선택(캔버스 선택은 풀린다) |
| 식별자 없음(빈 곳) | 둘 다 풀린다 |
| sandbox 에서 온, draft 에 없는 식별자 | **거부**(§14-3) |

프레임은 "이 자리에서 이것이 잡혔다"까지만 올린다. **소유자를 고르지
않는다.** 새 메시지를 만들지 않았다 — 기존 `preview:inspect-select` 하나가
그대로 두 소유자에게 간다. native 와 sandbox 가 같은 확정 함수를 지난다.

★ **소유권이 넘어갈 때 프레임에는 해제를 내려보내지 않는다.**
`clearStudioInspectorSelection({ keepFrameSelection: true })` 가 그것이다.
프레임이 고른 것은 바로 그 캔버스 요소이고, 풀어 버리면 곧 돌아오는
`preview:inspect-rects` 가 `selected:null` 이라 **방금 만든 선택이 스스로
풀린다**. 반대 방향(캔버스 → 일반)도 같은 이유로 같은 옵션을 쓴다.

### 14-2. 상태는 처음부터 배열이다

```js
getStudioCanvasSelection()
// -> { ids: [], primaryId: null, items: [], generation: n }
```

`items[]` 의 한 칸: `{ id, type, locked, hidden, label, rect, visibleRect }`.

**이번 단계의 `ids` 는 0개 또는 1개다.** 다중 선택 UI 는 없다. 모양을 배열로
둔 이유는 뒤 단계(Selecto)에서 상태를 통째로 바꾸면 이 상태에 매달린 쪽이
전부 "첫 번째만 본다"로 조용히 퇴화하기 때문이다.

밖으로 내는 쓰기 함수는 `setStudioCanvasSelection` ·
`clearStudioCanvasSelection` · `syncStudioCanvasSelectionRects` ·
`reconcileStudioCanvasSelection` 넷이고, 넷 다 `applyStudioCanvasSelection()`
하나를 지난다. 상태를 직접 대입하는 곳은 없다. 읽기는 언제나 복사본이다.

### 14-3. 무엇을 고를 수 있는가

판정은 **두 겹**이다.

**(가) 화면 쪽** — `skin/skin-inspect-target.js`(세 realm 이 같은 파일을
읽는다: Studio · native Preview · sandbox 프레임).

| 규칙 | 왜 |
| --- | --- |
| `data-imory-canvas-element` 를 component 근거로 인정한다 | 캔버스 요소의 최상위는 늘 자식이 있는 `<div>` 라, 이 줄이 없으면 **스킨 CSS 가 배경을 준 요소만** 고를 수 있다. 생김새로 갈리면 안 된다 |
| 캔버스 요소는 `inspectorIsPageLevel()` 판정에서 뺀다 | 도화지를 꽉 채운 배경 사진이 `page`(= 누를 것이 없는 자리)로 오판된다 |
| 잠긴 캔버스 요소(`data-imory-canvas-locked="true"`)는 후보에서 **뺀다** | 순위만 낮추면 조상 탐색이 표식까지 올라가 **그 밑에 깔린 요소**를 가린다. 빼 두면 "잠긴 요소가 없는 것과 같은 자리"가 된다 |
| 캔버스 형제끼리는 **사각형**으로 포함을 읽는다(`inspectorCanvasPairIsNested`) | 캔버스 요소는 전부 형제라 DOM 으로는 서로를 담지 않는다. 그대로 두면 **바탕 요소 하나만 있어도 모든 클릭이 후보 메뉴**를 띄운다. 한쪽이 다른 쪽을 완전히 덮으면 묻지 않고, **걸친** 두 요소는 지금까지처럼 묻는다 |

내부 자식(`<img>` · `<p>` · `<ul>` · `<li>` · `<a>`)에 식별자를 복제하지
않는다. 기존 `resolveInspectableAncestor()` 가 요소 wrapper 하나로 올려
준다 — 캔버스 자식에는 `data-imory-edit-id` 가 없기 때문이다.

숨긴 요소는 `hidden` 속성 때문에 상자가 없어 애초에 잡히지 않는다.
**Studio 에서 다시 고를 방법이 아직 없다** — 레이어 목록은 후속이다.

**(나) 데이터 쪽** — `studioCanvasSelectableElement(id)`
(`studio-canvas-selection.js`). 관문을 새로 만들지 않고
`resolveSkinHomeCanvas(skinPackage, templateHtml)` 을 그대로 쓴다. 그래서
다음이 **한 번에** 검사된다.

- 지금 화면이 HOME 인가
- template HTML 에 표식이 정확히 하나 있는가
- `home_canvas` 항목이 있고 `enabled !== false` 인가
- 이 배포가 아는 `canvas.version` 인가(미래 버전 → 없음)
- 데이터가 계약을 지키는가
- 요소 id 가 캔버스 안에서 **유일**한가(중복이면 캔버스 전체가 무효)
- 그 id 가 정확히 있고, **hidden 도 locked 도 아닌가**

`studioInspectorEditIdExistsInDraft(editId)` 는 이제 **근거를 둘** 인정한다 —
template HTML 의 요소이거나, 위 판정을 통과한 캔버스 요소이거나. sandbox
위조 선택 방어(SANDBOX-6A 9절)를 **푼 것이 아니라 근거를 하나 더 준 것**이다.
임의 문자열도, 지워진 요소의 옛 id 도, 잠기거나 숨겨진 요소도 통과하지 않는다.

### 14-4. 테두리 — 임시 표시

캔버스 선택은 **자기 overlay 를 갖는다**(`#studioCanvasSelectBox` ·
`#studioCanvasSelectLabel`, 둘 다 `data-imory-select-owner="canvas"`).
기존 Inspector 의 상자를 함께 쓰지 않는다 — "지금 저 테두리는 누구 것인가"를
코드가 아니라 눈으로 추적하게 되기 때문이다. 둘이 동시에 보이지 않는 것은
§14-1 의 라우터가 보장한다.

- 좌표 변환은 기존 `studioInspectorMapRect()` 를 그대로 쓴다 — Preview 부모에
  **축소가 걸린 조건**에서도 실측 오차 **0.01px** 이다(native · sandbox 각각).
- **회전은 따라가지 않는다.** 회전한 요소에서는 외곽 bounding box 를 그린다.
  지금 좌표는 프레임이 잰 사각형 하나뿐이고 회전각이 들어 있지 않다.
  **회전을 따라가는 선택 틀과 핸들은 `HOME-CANVAS-SELECT-1B` 의 Moveable 몫**이다.
- sandbox 에서는 **프레임이 자기 realm 에서 그린다** — 부모는 그리지 않는다
  (기존 Inspector 와 같은 규칙, `studioInspectorRemoteOverlay`).
- 이름표는 종류만 보여 준다(`Canvas 사진` · `Canvas 글자` …).
  **색 · 크기 · 위치 입력 필드는 만들지 않았다.**

`AUDIT-1` 이 찾은 **유령 테두리**(테두리는 떠 있는데 패널은 비어 있는 선택)는
사라졌다 — 캔버스 요소는 더 이상 `studioInspectorSelection` 을 만들지 않고,
고를 수 없는 캔버스 식별자는 라우터가 거부한다.

### 14-5. 선택은 vendor 를 부르지 않는다

공개 HOME · 공개 sandbox HOME · Studio 열기 · Select 켜기 · **캔버스 요소
단일 선택** — 다섯 조건 전부에서 Moveable · Selecto UMD 요청은 **0** 이다
(실측). sandbox 프레임 문서에는 로더조차 아직 없다(§13-5).

### 14-6. 이 단계가 저장하는 것은 없다

캔버스 선택은 **읽기만** 한다. 고르기만으로 draft 의 `regions` 가 한 글자도
바뀌지 않는다(실측). `resolveSkinHomeCanvas()` 가 언제나 새 리터럴을
돌려주므로 선택 상태가 draft 객체를 붙들지도 않는다.

기존 확정 경로(`applyStudioInspectorPatch`)는 **쓸 수 없다** — 그 함수는 첫
줄에서 대상 요소를 template HTML 에서 찾고, 캔버스 요소는 거기 없다. 좌표를
`canvas.elements[]` 에 쓰는 **새 경로**가 필요하고, 그것은
`HOME-CANVAS-TRANSFORM-1` 의 일이다.

### 14-7. draft 가 바뀌면 조용히 푼다

`reconcileStudioCanvasSelection()` 이 `bumpStudioWorkingRevision()` 한 곳에서
불린다(기존 Inspector 의 reconcile 과 같은 자리 — Direct Edit · Code Apply ·
Import · AI 적용 · 되돌리기 · 이미지 슬롯 · remount 가 전부 그곳을 지난다).

요소 삭제 · 캔버스 삭제 · `enabled:false` · 미래 version · 데이터가 깨짐 ·
그 요소가 hidden/locked 로 바뀜 · HOME 이 아닌 페이지로 이동 · 다른 스킨
Import · Save 후 다시 열기 · native ↔ sandbox 전환 — 전부 여기서 풀린다.

**없어진 요소를 임의의 다른 요소로 바꾸지 않는다.** 오류도 토스트도 아니다.

프레임이 올리는 좌표(`preview:inspect-rects`)도 같은 일을 한다 — 프레임이 더
이상 그 요소를 가리키지 않으면 선택을 푼다.

---

## 15. 조건부 vendor 활성화와 단일 Moveable 선택 틀 (`HOME-CANVAS-SELECT-1B-1`)

`SELECT-1A` 가 고른 요소에 **회전을 따라가는 테두리 하나**를 붙인다.
여전히 **표시 전용**이다 — 이동 · 크기 · 회전 조작 · 손잡이 · Selecto ·
다중 선택 · Canvas JSON 쓰기는 **하나도 없다**(§15-8).

### 15-1. 관련 파일

| 무엇 | 파일 |
| --- | --- |
| **프레임 안 편집 runtime**(native · sandbox 공용 한 벌) | [skin/skin-home-canvas-editor-runtime.js](../../skin/skin-home-canvas-editor-runtime.js) `createHomeCanvasSelectionFrame` |
| 그 runtime 이 부르는 **로더 한 파일** | [studio/studio-home-canvas-vendor.js](../../studio/studio-home-canvas-vendor.js) `ensureHomeCanvasEditorVendors` (§13) |
| Studio → Preview 문서 | [studio/studio-preview.js](../../studio/studio-preview.js) `postCanvasSelectionToFrame` |
| 확정된 선택이 나가는 **단 한 곳** | [studio/inspector/studio-canvas-selection.js](../../studio/inspector/studio-canvas-selection.js) `applyStudioCanvasSelection` |
| native 연결 · sandbox 로 넘기는 갈림 | [studio/preview/preview-bridge.js](../../studio/preview/preview-bridge.js) `routeCanvasSelectionMessage` |
| Studio → sandbox 프레임 | [studio/preview/preview-sandbox.js](../../studio/preview/preview-sandbox.js) `setSandboxPreviewCanvasSelection` · [skin/sandbox/skin-sandbox-host.js](../../skin/sandbox/skin-sandbox-host.js) `sendSandboxCanvasSelect` |
| sandbox 봉투 | [skin/sandbox/skin-sandbox-protocol.js](../../skin/sandbox/skin-sandbox-protocol.js) `IMORY_CANVAS_SELECT` |
| sandbox 프레임 연결 | [skin/sandbox/skin-sandbox-frame.js](../../skin/sandbox/skin-sandbox-frame.js) `applyCanvasSelection` |
| sandbox origin allowlist(**두 줄 추가**) | [core/lib/skin-sandbox-server.js](../../core/lib/skin-sandbox-server.js) `SANDBOX_ALLOWED_PATHS` |

테스트: `node studio/studio-home-canvas-moveable-e2e-test.mjs` — TESTS.md §13.

### 15-2. vendor 는 **언제** 켜지는가

다음을 **전부** 지난 뒤에만 UMD 가 내려온다.

1. Studio 안의 Preview다
2. HOME 화면이다
3. 유효하고 활성화된 `home_canvas` 가 있다
4. Select 모드가 켜져 있다
5. Canvas selection 의 `primaryId` 가 있다
6. 그 요소가 hidden 도 locked 도 아니다
7. **그리고** 그 id 를 가진 캔버스 요소가 **지금 그 프레임의 DOM 에 실제로 있다**

1~6 은 Studio 가 자기 draft 에서 본다(`studioCanvasSelectableElement`).
7 은 프레임이 자기 DOM 에서 다시 본다
(`[data-imory-canvas-element][data-imory-edit-id="…"]`). **둘 다 통과해야**
틀이 붙는다.

그래서 다음은 계속 **요청 0** 이다 — runtime 도 UMD 도 오지 않는다.

- 공개 HOME · 공개 sandbox HOME
- Studio 를 열기만 한 상태
- Select 모드만 켠 상태
- 일반 template 요소만 고른 상태
- Canvas 가 없는 스킨

실측은 `--only=cost` 에 있다.

### 15-3. 실행 위치 — 부모는 주인, 프레임은 실행자

Moveable 은 **Canvas DOM 이 있는 문서**에서 돈다.

| 화면 | 문서 |
| --- | --- |
| native | `studio/preview/preview-frame.html` |
| sandbox | `skin/sandbox/frame.html` (별도 origin) |

Studio 부모 문서에는 Moveable 인스턴스를 만들지 않는다. sandbox 쪽 DOM 은
부모가 아예 볼 수 없고, native 쪽도 부모가 그리면 좌표가 한 프레임씩
늦는다 — 프레임 안 Inspector 테두리가 이미 쓰는 경계와 같다.

**실행 코드는 한 벌이다.** 두 문서가 같은
`skin/skin-home-canvas-editor-runtime.js` 를 동적 `import()` 로 받고, 다른
것은 연결(렌더 루트 · nonce · 보고 대상)뿐이다. `?v=APP_BUILD_VERSION` 은
부르는 쪽이 붙인다(CLAUDE.md §4). 이 파일에는 **정적 import 가 없어서**
어느 문서의 import map 에도 올릴 것이 없다.

### 15-4. 메시지 — id 와 순번뿐이다

```
Studio ──preview:canvas-select──▶ Preview 문서 ──IMORY_CANVAS_SELECT──▶ sandbox 프레임
       ◀─preview:canvas-frame─── (native 만)
```

`{ active, ids[], primaryId, generation }`.

- **실리지 않는 것**: nonce · draft · SkinPackage · CSS · 좌표.
  프레임은 좌표를 자기 DOM 에서 스스로 잰다.
- sandbox 는 기존 strict allowlist 를 그대로 지난다 — origin · source ·
  contract · renderSeq · 알려진 키만.
- `generation` 은 부모가 매긴 선택 순번이다. 프레임은 자기가 본 것보다
  **낮은 번호를 버린다**. `renderSeq` 가 "어느 화면인가"를 가르고
  `generation` 이 "같은 화면 안의 몇 번째 선택인가"를 가른다.
  ★ **해제 메시지에도 같은 번호를 싣는다** — 0 으로 보내면 프레임이 그것을
  옛 메시지로 보고 버려서 "선택은 풀렸는데 틀만 남는" 상태가 된다
  (2026-09-21 이 라운드의 e2e 가 실제로 잡은 버그).
- `preview:canvas-frame` 은 **표시만** 가른다. 선택을 만들지도 지우지도
  않는다.

확정된 선택이 나가는 곳은 `applyStudioCanvasSelection()` **한 곳**이다 —
set · clear · sync · reconcile 이 전부 그 함수를 지나므로 "선택이 바뀌었는데
프레임만 모른다"가 생기지 않는다.

### 15-5. CSP nonce

Moveable 생성 시 **공식 `cspNonce` 옵션**으로 그 프레임의 nonce 를 넘긴다.

- 전역 `document.createElement` 를 가로채지 않는다
- CSP 를 넓히지 않는다 (`style-src` 한 글자도 바뀌지 않았다)
- `unsafe-inline` 을 더하지 않는다
- style 태그를 사후에 훑어 nonce 를 끼우지 않는다
- **nonce 를 부모 메시지로 보내지 않는다** — 프레임 밖으로 나가지 않는다는
  계약 그대로다(`skin/sandbox/frame.html` 머리말)
- localStorage · dataset · 공개 전역 문자열에 저장하지 않는다

sandbox 는 기존 경로를 그대로 쓴다 — `FRAME_STATE.nonce`(bridge 의 클로저)
하나이고, runtime 은 그것을 읽는 함수만 받는다. native Preview 에는 CSP
nonce 가 없으므로 라이브러리 기본값과 같은 빈 문자열을 넘긴다 — 그 차이
때문에 코드를 두 벌로 나누지 않는다.

**배포되는 `buildSandboxCsp()` 아래 실측**(`--only=sandbox`):
`securitypolicyviolation` 0건 · 콘솔 CSP 오류 0건 ·
Moveable 의 `<style data-styled-id>` 가 `sheet !== null` · 틀 크기 정상.

`cspNonce` 가 0.53.0 에서 **작동하지만 deprecated** 라는 §13 의 판정은
그대로다 — 버전을 올리기 전에 `studio-home-canvas-vendor-e2e-test.mjs
--only=nonce` 를 다시 돌린다.

### 15-6. 표시 전용 Moveable

끄는 것: `draggable` · `resizable` · `scalable` · `rotatable` · `warpable` ·
`pinchable` · `clippable` · `roundable` · `snappable` · `edgeDraggable` ·
`dragArea` · `origin` · `renderDirections: []`(손잡이 없음).

켜는 것: 기본 네 줄(`hideDefaultLines: false`).

★ 조작 able 을 전부 끄면 Moveable 은 **target 에 pointer 리스너를 하나도
달지 않는다** — 0.53.0 의 `_updateEvents()` 가 "dragStart 를 가진 able 이
하나도 없으면" `targetGesto` 를 만들지 않고 이미 있으면 떼어 낸다. 기존
Select 의 `pointerdown` 선택이 그대로 산다.

★ control box 에 `pointerEvents = "none"` 을 준다. 네 줄은 요소 외곽 **위에**
놓이므로, 그냥 두면 테두리를 정확히 누른 클릭이 스킨 DOM 에 닿지 않는다.
CSSOM 으로 쓰는 값은 CSP 의 검사 대상이 아니다(검사 대상은 마크업의 `style`
**속성**이다).

Moveable 이벤트로 DOM style 도 Canvas JSON 도 바꾸지 않는다. 틀이 붙어 있는
동안 draft 의 `regions` 가 한 글자도 바뀌지 않고, 요소의
`x · y · width · height · rotation` 변화가 0 임을 e2e 가 잰다.

**따라가기는 rAF 한 곳**이다(`useResizeObserver` · `useMutationObserver` 는
끈다 — 관측기를 두 벌 두면 어느 것이 갱신했는지 추적할 수 없다). 요소의
사각형 + `transform` 이 바뀐 프레임에만 `updateRect()` 를 부른다. 스크롤 ·
부모 `scale` · 늦게 온 이미지 · 글꼴 교체 · `height:"auto"` 의 재조판이
전부 그 한 값에 나타난다.

**실측 최대 오차(±1.5px)** — 회전 0° · 20° · 45°, 숫자 높이와 `"auto"`,
부모 `scale(0.8)`, Preview 내부 스크롤에서 틀의 외곽이 요소의 외곽과
1.5px 안에서 일치한다. 네 줄의 길이는 요소의 (가로, 가로, 세로, 세로)와
3px 안에서 같다(줄 두께 1px 이 축 평행 외곽의 대각선을 √(L²+t²+2Lt·sin2θ)
만큼 부풀린다 — 45° 에서 정확히 `L+t`).

### 15-7. 테두리의 주인은 언제나 하나

| 화면 | 평소 | Moveable 이 잡은 동안 |
| --- | --- | --- |
| native | Studio 의 `#studioCanvasSelectBox`(축 평행) | 내려간다 |
| sandbox | 프레임의 `.imory-sandbox-inspect-box--select` | 내려간다 |

★ **이름표(`#studioCanvasSelectLabel`)는 넘기지 않는다.** Moveable 에
"무엇을 골랐는가"를 보여 주는 자리가 없고, 상자가 아니라 겹쳐 보이지도
않는다.

다음에서 Moveable 을 걷고 기존 상태를 맞춘다: 선택 해제 · 일반 요소 선택 ·
Select 모드 종료 · HOME 이탈 · 캔버스 비활성화 · 선택 요소 삭제 ·
Preview 재렌더 · frame 교체.

**vendor 로드 또는 Moveable 생성이 실패하면**

- Canvas selection 자체는 **유지된다**
- 기존 축 평행 테두리가 그대로 fallback 이 된다
- 실패 때문에 일반 Inspector selection 으로 바꾸지 않는다
- 경고는 문서당 **한 줄**이다(중복 토스트 없음). 다음 선택에서 재시도는
  막지 않는다 — 로더가 실패한 Promise 를 버린다(§13)

### 15-7-1. Canvas 는 sandbox 스킨의 대체물이 아니다

Canvas 는 **아이모리 재료**(로고 · 카테고리 · 사진 · 글자 · 스티커 · 도형)의
구조와 배치를 담당하고, **같은 Canvas 가 native 와 sandbox 양쪽에서 그려진다**
(§12-6 의 네 화면 parity). 시각 디자인 · hover · transition 은 **스킨 CSS** 가
갖고, sandbox 의 **사용자 JS** 는 같은 Canvas DOM 에 파티클 · 꽃잎 · 복합
모션을 더할 수 있어야 한다.

그래서 이 라운드는 Canvas 요소의 DOM 을 **한 글자도 건드리지 않는다.**

- Canvas 요소에 속성 · class · 인라인 style 을 붙이지 않는다
- Canvas 요소의 `pointer-events` 를 바꾸지 않는다(control box 쪽만 끈다)
- 저자 JS 가 요소를 움직이면 rAF 따라가기가 **그 움직임을 따라간다** —
  막지 않는다

효과 시스템 자체는 이 라운드의 범위가 아니다. 다음 후속 작업
`HOME-CANVAS-EFFECT-HOOK-1` 이 로드맵에 있다.

### 15-8. 그 단계에 **없던 것**

★ 이 중 Selecto 인스턴스 · lasso · 다중 선택 · Shift 선택은
`HOME-CANVAS-SELECT-1B-2` 에서 구현됐다(§16). 나머지는 아직 없다.

Selecto 인스턴스 · lasso · 다중 선택 · Shift 선택 · Moveable 핸들 · 드래그 ·
리사이즈 · 회전 조작 · Canvas JSON 쓰기 · Undo/Redo · Canvas Inspector 입력
필드 · 텍스트 편집 · 이미지 교체 · Crop · 레이어 목록 · preset · widget ·
좌우 패널 Canvas — **하나도 없다.**

로더가 두 UMD 를 한 벌로 돌려주므로 **Selecto 파일도 함께 내려오지만**,
이번 단계에서 그 생성자를 부르는 곳은 없다(e2e 가 인스턴스 0 을 잰다).

---

## 16. Selecto lasso 와 다중 선택 (`HOME-CANVAS-SELECT-1B-2`)

`SELECT-1B-1` 의 단일 선택 위에 **끌어서 여러 개 고르기**를 올린다.
여전히 **고르는 것까지**다 — 이동 · 크기 · 회전 조작 · Canvas JSON 쓰기는
하나도 없다(§16-9).

### 16-1. 관련 파일

§15-1 의 표에 더해 다음이 이 라운드의 것이다.

| 무엇 | 파일 |
| --- | --- |
| lasso · Shift · 제안 | [skin/skin-home-canvas-editor-runtime.js](../../skin/skin-home-canvas-editor-runtime.js) |
| **제안을 확정하는 한 곳** | [studio/inspector/studio-canvas-selection.js](../../studio/inspector/studio-canvas-selection.js) `proposeStudioCanvasSelection` |
| 편집 모드를 프레임에 알리는 한 곳 | 같은 파일 `postStudioCanvasSelectionToFrame` · `syncStudioCanvasFrameMode` |
| Select 토글에서 그것을 부르는 자리 | [studio/inspector/studio-inspector.js](../../studio/inspector/studio-inspector.js) `setStudioInspectorEnabled` |
| sandbox 봉투 | [skin/sandbox/skin-sandbox-protocol.js](../../skin/sandbox/skin-sandbox-protocol.js) `IMORY_CANVAS_PROPOSE` · `IMORY_CANVAS_SELECT` 의 `editing` |

테스트: `node studio/studio-home-canvas-selecto-e2e-test.mjs` — TESTS.md §13.

### 16-2. 활성화 조건이 한 칸 앞으로 왔다

lasso 는 **아무것도 고르지 않은 상태에서** 시작돼야 한다. 그래서 프레임의
편집 runtime 과 vendor 를 켜는 관문이 "첫 선택"에서 다음 다섯으로 바뀌었다.

1. Studio 안의 Preview
2. HOME 화면
3. 유효하고 활성화된 `home_canvas`
4. 표식이 정확히 하나
5. Select 모드 활성

`primaryId` 존재는 **관문에서 빠졌다**. 2~4 는 `resolveSkinHomeCanvas()` 가
전부 보므로 판정은 `studioCanvasEditingIsOn()` 한 줄이다.

| 화면 | UMD · runtime |
| --- | --- |
| 공개 HOME · 공개 sandbox HOME | **0** |
| Studio 를 열기만 함 | **0** |
| **Canvas 가 없는 스킨**에서 Select 켜기 | **0** |
| Canvas 가 있는 HOME 에서 Select 켜기 | 각각 **1회** |
| 그 뒤 재선택 · 모드 재진입 | 추가 **0** |

### 16-3. 포인터 정책 — 손가락으로는 lasso 를 시작하지 않는다

마우스와 펜에서만 lasso 를 연다. 손가락 드래그는 세로 스크롤인지 선택
상자인지 가를 방법이 없고, 가로채면 모바일 Preview 가 스크롤되지 않는다.
모바일에서는 `SELECT-1A` 의 **단일 탭 선택이 그대로** 남는다.

`(pointer: fine)` 만 믿지 않는다 — 터치와 마우스가 함께 있는 기기에서 그
질의는 참이고, 그래도 그 순간의 입력은 손가락일 수 있다. **실제 이벤트의
종류**(`pointerType` · `touch*`)를 먼저 본다.

모바일 다중 선택은 후속 레이어 목록의 몫이다(§11).

### 16-4. 무엇을 고르는가

대상은 정확히 `[data-imory-canvas-element]` 다. 그래서 **template 요소 ·
사용자 JS 가 만든 꽃잎 · 파티클 · 효과 레이어 · Moveable 의 control box ·
Selecto 자신의 사각형은 애초에 후보가 아니다** — 그 속성이 없고, 그 속성은
저장 경계의 화이트리스트에도 없다(§16-8).

여기서 더 빼는 것은 셋이다: `hidden` · `locked` · 지금 도화지 밖의 노드.

| 입력 | 뜻 |
| --- | --- |
| 단일 클릭 | 기존 `SELECT-1A` 경로 그대로(하나만) |
| 빈 곳 클릭 | 전체 해제 |
| 일반 lasso | 결과로 **교체**. 사각형이 요소 넓이의 **1% 이상**을 덮으면 잡힌다 |
| 결과 0개인 일반 lasso | 전체 해제 |
| Shift + 클릭 | 그 요소를 **더하거나 뺀다**(XOR) |
| Shift + lasso | 결과를 기존 선택과 **XOR** |
| Shift + 도화지 안 빈 곳 | 기존 선택 **유지** |

드래그는 **도화지 안에서 시작한 것만** lasso 가 된다. 시작점이 도화지 밖이면
lasso 를 만들지 않는다(사각형이 도화지를 넘어가는 것은 상관없다 — 판정
대상이 캔버스 요소뿐이므로).

`Moveable` 의 control 요소에서 시작한 드래그도 lasso 가 아니다
(`moveable.isMoveableElement(target)`). 이번 단계에는 손잡이가 없어 실제
포인터로는 그 상황이 생기지 않지만(control box 가 클릭을 통과시킨다),
조작이 들어오는 `HOME-CANVAS-TRANSFORM-1` 에서 깨지지 않도록 관문을 지금
넣어 두었다.

### 16-5. 프레임은 제안하고, 부모가 확정한다

```
프레임 ──CANVAS_PROPOSE {ids, primaryId, mode, generation}──▶ Studio
      ◀─CANVAS_SELECT   {editing, active, ids, primaryId, generation}──
```

`mode` 는 `replace` 와 `toggle` 둘뿐이다.

부모(`proposeStudioCanvasSelection`)가 하는 일.

- 모든 id 를 **지금 draft 에서 다시** 본다(존재 · hidden · locked · 중복 ·
  상한 64).
- **한 id 라도 어긋나면 메시지 전체를 거부**하고 기존 선택을 유지한다.
  "절반만 반영"을 만들지 않는다 — 지워진 요소의 옛 id 하나가 섞인 lasso 가
  나머지를 조용히 바꾸면 사용자가 본 것과 상태가 달라진다.
- `replace` 는 갈아 끼우고, `toggle` 은 기존 선택과 XOR 한다.
- 결과를 **draft 의 `canvas.elements[]` 배열 순서**로 정규화한다. 프레임이
  보낸 순서를 그대로 믿지 않는다.
- `primaryId` 를 정한다 — 제안된 primary 가 결과에 남아 있으면 그것,
  아니면 **배열상 마지막**(= 가장 앞에 보이는 요소). 비면 `null`.
- 승인한 상태를 다시 프레임에 내려보낸다.

프레임은 **최종 선택을 확정하지 않는다.**

★ 확정 뒤 부모는 프레임 안 Inspector 에도 primary 를 집으라고 내려보낸다
(`postInspectorSelectionToFrame`). 그래야 좌표 보고가 primary 의 것이 되고
fallback 테두리와 팝오버 자리가 맞는다. 그 사이에 도착하는 **어긋난 좌표
보고는 무시한다** — 그것을 "프레임이 놓았다"로 읽으면 방금 만든 다중 선택이
곧바로 지워진다(`studioCanvasExpectedFrameId`).

### 16-6. Moveable 표시 — 단일과 그룹

| 고른 수 | 표시 |
| --- | --- |
| 0 | 틀 없음(`target: null`) |
| 1 | `SELECT-1B-1` 의 회전을 따라가는 단일 틀 |
| 2 이상 | Moveable **그룹 틀 하나** |

0.53.0 은 `target` 에 배열을 받으면 스스로 그룹으로 간다. 조작은 여전히
전부 false 다(§15-6) — Moveable 도 Selecto 도 DOM geometry 와 Canvas JSON 을
바꾸지 않는다.

**함정 셋**(전부 2026-09-21 실측).

1. `MoveableGroup` 의 `dragArea` 기본값은 `true` 이고, 그것을 `false` 로
   덮으면 그룹이 mount 중에 죽는다(`componentDidMount → _updateEvents →
   updateRect` 에서 `null.style`). 그래서 그룹에서는 켜 둔다 — 그 영역이
   클릭을 삼키지 않는 것은 control box 의 `pointer-events: none` 이
   상속되기 때문이다.
2. 날것의 `.moveable-control-box` 수는 그룹에서 **3 이상**이 된다(감싸는
   상자 + 자식 하나씩). "인스턴스가 몇 개인가"는 우리가 표시한 바깥 상자
   (`[data-imory-canvas-frame="1"]`)로 센다.
3. 단일 ↔ 그룹 전환에서 옛 control box 요소가 문서에 남는 경우가 있다.
   새 상자를 표시할 때 옛 표시를 걷고 감춘다(지우지는 않는다).

### 16-6-1. ★ 그룹 전환이 CSP nonce 를 잃던 문제

Moveable 과 Selecto 는 규칙표를 `<style data-styled-id data-styled-count>`
하나로 공유하고, 컴포넌트가 mount 할 때 count 를 올리고 unmount 할 때
내린다. **0 이 되면 그 요소를 지운다.**

단일 → 그룹 전환은 컴포넌트를 통째로 갈아 끼우는데, 그 사이 count 가 0 을
찍으면 규칙표가 지워지고 곧바로 이어지는 그룹 쪽 주입이 **nonce 없이** 새로
만든다. sandbox 의 `style-src` 가 그것을 막아 선택 틀이 통째로 무너진다
(실측: `nonce` 속성 없음 · `sheet === null`).

CSP 는 **삽입 시점에** 판정하므로 나중에 nonce 를 붙여도 되살아나지 않는다.
그래서 되살리는 대신 **처음부터 지워지지 않게** 한다 — 이미 nonce 를 달고
정상으로 들어간 그 요소의 count 를 크게 올려 못박는다
(`pinEditorStyleSheets`).

**CSP 를 넓히지 않는다.** style 을 새로 만들지도, 나중에 주입하지도 않는다.
우리가 만든 요소 하나의 수명을 늘릴 뿐이고, `securitypolicyviolation` 0건 ·
콘솔 CSP 오류 0건 · 두 `<style>` 모두 `sheet !== null` 을 e2e 가 잰다.

Selecto 생성자에도 같은 `cspNonce` 를 공식 옵션으로 넘긴다.

### 16-7. Selecto 설정 — 1.26.3 의 실제 번들을 읽고 정했다

| 옵션 | 값 | 이유 |
| --- | --- | --- |
| `selectByClick` | `false` | 기본값 `true` 다. 두면 평범한 클릭까지 Selecto 가 처리해 `SELECT-1A` 경로와 주인이 둘이 된다 |
| `hitRate` | `1` | 번들의 hitTest 는 `round(교집합 넓이 / 대상 넓이 × 100) >= hitRate` 다(단위 없는 수는 퍼센트) |
| `preventDragFromInside` | `false` | 기본값 `true` 면 요소 **위에서** 시작한 드래그가 lasso 가 되지 않는다. 실제 HOME 은 도화지를 덮는 배경 사진을 흔히 써서 시작할 빈 자리가 없다 |
| `preventClickEventOnDrag` | `true` | 끈 뒤 따라오는 click 하나를 삼킨다 — 없으면 native Inspector 의 click 선택이 **방금 만든 lasso 결과를 지운다**(실측) |
| `rootContainer` | 주지 않음 | 주면 선택 사각형이 `absolute`, 없으면 `fixed` 다. 뷰포트 좌표 그대로가 스크롤 · 부모 scale 에서 한 겹 적다 |
| `toggleContinueSelect` | 주지 않음 | Shift 의 뜻은 **부모**가 정한다. Selecto 가 자기 안에서 합치면 canonical 상태가 두 벌이 된다 |
| `dragContainer` | `doc.body` | 도화지 요소를 주면 재렌더마다 Selecto 를 새로 만들어야 한다. "도화지 안에서 시작했는가"는 `dragCondition` 이 좌표로 본다 |

★ 기존 Inspector 와 부딪히지 않는다 — 저쪽은 document capture 에서
**pointerdown** 의 전파를 끊고, Selecto 의 gesto 는 **mousedown / touchstart**
를 듣는다. 서로 다른 이벤트다.

★ Shift + 클릭은 **window capture** 에서 받는다. capture 경로가
Window → Document 이므로 document capture 에 건 Inspector 보다 먼저 돌고,
거기서 전파를 끊어 "하나만 고르기"가 아예 돌지 않게 한다. 제안은 **누를 때가
아니라 뗄 때** 낸다 — Shift 를 누른 채 끌면 그것은 Shift + lasso 이고, 누르는
순간 토글하면 lasso 결과와 두 번 겹친다.

### 16-8. 사용자 JS 효과와의 공존

`SELECT-1B-1` 이 세운 선(§15-7-1)이 그대로다. 이 라운드도 Canvas 요소의 DOM 을
한 글자도 건드리지 않는다 — lasso 는 그 요소들을 **읽기만** 한다.

사용자 JS 가 나중에 붙일 배경 꽃잎 · 파티클 · 빛 효과 · front/back 효과
레이어 · 임의 장식 DOM 은 `[data-imory-canvas-element]` 가 아니므로 **선택
대상이 아니다**. 사용자 JS 가 Canvas 요소의 `transform` 을 바꾸면 선택 시점의
**실제 DOM geometry** 를 기준으로 틀이 따라간다(rAF 한 곳, §15-6).

effect hook 자체는 이번 범위가 아니다 — `HOME-CANVAS-EFFECT-HOOK-1`.

### 16-9. 이번 단계에 **없는 것**

Moveable 드래그 · 리사이즈 · 회전 조작 · 손잡이 · Canvas JSON 쓰기 ·
Undo/Redo · Canvas Inspector 입력 필드 · 텍스트 편집 · 이미지 교체 · Crop ·
레이어 목록 · effect hook · preset · widget · 좌우 패널 Canvas —
**하나도 없다.**

**모바일 lasso 는 의도적으로 미지원**이고, 그 자리는 단일 탭이 지킨다(§16-3).

---

## 17. 단일 요소 이동 (`HOME-CANVAS-TRANSFORM-1A`)

**이 절부터가 "고치는 것"이다.** 앞의 세 라운드(§14 · §15 · §16)는 고르고
보여 주는 것까지였고, 여기서 처음으로 Canvas JSON 이 바뀐다.

바뀌는 것은 **`x` · `y` 두 칸뿐**이다. 크기 · 회전 · 그룹 이동 · 손가락
이동은 이 라운드에 없다(§17-10).

> **일부 변경됨 → §18(`HOME-CANVAS-TRANSFORM-1B`).** 그 라운드가 크기를
> 더하면서 이 절의 셋이 넓어졌다 — `kind` 는 이제 `move` 하나가 아니고
> (§17-7 · §17-8), 메시지에 `width` · `height` 가 함께 실리며(§18-9),
> 손잡이가 생겼다(§18-11). **이동 자체의 규칙은 한 줄도 바뀌지
> 않았다** — 아래를 그대로 읽어도 된다.

### 17-1. 관련 파일

| 파일 | 이 라운드에서 하는 일 |
| --- | --- |
| `skin/skin-home-canvas.js` | `writeSkinHomeCanvasElementPosition()` — 순수 불변 수정(§17-5) |
| `skin/skin-home-canvas-render.js` | `setSkinCanvasElementPosition()` 외 둘 — 좌표를 쓰는 **한 곳**(§17-4) |
| `skin/skin-home-canvas-editor-runtime.js` | 제스처 · 임시 위치 · 확정 요청 · 취소 (두 프레임 공용) |
| `studio/inspector/studio-canvas-selection.js` | `commitStudioCanvasElementTransform()` — 부모의 관문(§17-7) |
| `studio/studio-preview.js` | `setStudioCanvasElementPosition()` — draft · 기록 · dirty · 다시 그리기 |
| `studio/preview/preview-bridge.js` · `preview-sandbox.js` | native · sandbox 로 가르는 두 줄 |
| `skin/sandbox/skin-sandbox-protocol.js` · `-host.js` · `-frame.js` | 메시지 둘(§17-8) |

이동이 켜지는 조건은 일곱이고, **전부 참일 때만** 제스처가 시작된다
(runtime 의 `dragGate()`).

1. Canvas 편집 runtime 이 켜져 있다(§16-2 의 그 관문)
2. 캔버스 선택이 **정확히 하나**다
3. `primaryId` 가 그 하나다
4. 그 요소가 지금 draft 에 있다
5. hidden 도 locked 도 아니다 — 프레임은 **DOM 속성으로 한 번 더** 본다
6. 그 요소가 지금 이 문서에 실제로 그려져 있다
7. 그 순간의 입력이 **마우스 또는 펜**이다(§17-2)

여럿을 골랐을 때는 그룹 틀만 남고 이동은 꺼진다.

> **함정 — able 을 나중에 켜지 마라.**
> 처음에는 `draggable:false` 로 만들고 조건이 맞을 때
> `moveable.draggable = true` 로 켰다. vanilla 래퍼의 그 setter 는
> `setState` 이고 preact 의 setState 는 **렌더를 미룬다**. able 목록과 target
> gesto 는 그 렌더 뒤의 `_updateEvents()` 에서 만들어지므로, 켠 직후에 누르면
> pointer 리스너가 아직 없다 — 2026-09-21 실측에서 `props.draggable` 은 true
> 인데 `targetGesto` 가 없었고 드래그가 **한 번도 시작되지 않았다**. 그래서
> able 은 **처음부터 켜 두고** 관문은 `dragStart` 한 곳에서만 본다.

> **함정 — 이벤트는 `.on()` 으로만 걸린다.**
> vanilla 래퍼는 생성자에서 옵션을 복사한 뒤 모든 `onXxx` 칸을 **자기
> emitter 로 덮어쓴다**. 옵션으로 넘긴 `onDragStart` 는 한 번도 불리지 않는다.
> 거절도 반환값이 아니라 **`e.stop()`** 이다 — emitter 의 `emit()` 이 그
> 호출을 보고 false 를 돌려주고, Draggable 이 그 값으로 제스처를 접는다.

### 17-2. 무엇이 lasso 이고 무엇이 이동인가

pointer 가 **시작된 자리**가 가른다.

| 시작 위치 | 동작 |
| --- | --- |
| 고른 단일 unlocked 요소 | Moveable 이동 |
| 고르지 않은 unlocked 요소 | 아무 일도 없다 — 먼저 클릭해서 고른다 |
| 빈 도화지 | Selecto lasso |
| locked 요소 | 배경처럼 보고 lasso |
| Moveable control | Selecto 금지(§16-7 의 그 관문) |
| 도화지 밖 | 둘 다 시작하지 않음 |

`SELECT-1B-2` 는 `preventDragFromInside:false` 로 두어 **요소 위에서도**
lasso 가 시작됐다. 도화지 전체를 덮는 배경 사진이 흔해서 시작할 빈 자리가
없었기 때문이다. 이제 그 자리는 "이 요소를 옮긴다"가 될 수 있으므로 둘을
가른다 — 판정은 시작점의 `elementsFromPoint` 로 하고, **가장 위에 있는
캔버스 요소**가 unlocked 이면 lasso 를 시작하지 않는다.

> 그래서 배경 사진 위에서 lasso 를 하려면 그 사진을 **잠근다**. "건드리지
> 않겠다"는 표시가 곧 "배경으로 쓰겠다"가 된다.

처음 누른 **미선택** 요소를 같은 제스처에서 바로 옮기는 기능은 만들지
않았다. 먼저 고르고, 다음 드래그에서 옮긴다.

**손가락으로는 본체를 옮기지 않는다.** 도화지 전체를 덮는 배경 사진이
선택된 상태에서 한 손가락 드래그를 가로채면 모바일 Preview 가 아예
스크롤되지 않는다. lasso 와 같은 이유이고(§16-3) 같은 판정 함수를 쓴다 —
`(pointer: fine)` 질의가 아니라 **그 순간 이벤트의 종류**를 본다. 손가락
단일 탭 선택과 Preview 스크롤은 그대로다.

### 17-3. 픽셀을 Canvas 좌표로

Canvas JSON 이 좌표의 유일한 source of truth 다.

```text
scale        = 도화지의 실제 가로폭 / baseWidth
canvasDeltaX = frameDeltaX / scale
canvasDeltaY = frameDeltaY / scale
```

- 배율은 **가로폭 하나**로 정한다. 세로는 렌더러가
  `aspect-ratio: baseWidth / baseHeight` 로 가로에 묶어 두었으므로 같은
  배율이다(§12-2). 세로를 따로 재면 스킨이 높이를 덮었을 때 x 와 y 가 서로
  다른 자로 움직인다.
- 부모 문서의 Preview `transform: scale()` 은 **다시 적용하지 않는다**.
  프레임 안의 `getBoundingClientRect()` 와 pointer 의 `clientX` 는 둘 다 그
  프레임의 좌표계이고, 바깥의 scale 은 둘 다에 똑같이 걸리므로 나누면
  사라진다.
- 배율은 **dragStart 에서 한 번** 재고 그 제스처 동안 유지한다.
- `dragStart` 에서 시작 좌표를 snapshot 하고, 매 프레임 **시작값 + 누적
  이동량**을 쓴다. 직전 프레임의 delta 를 계속 더하지 않으므로 프레임 수와
  무관하다.
- 저장값은 **소수점 셋째 자리**까지. 정확한 정수면 정수 그대로다.
- `x` · `y` 는 **음수를 허용**한다. 도화지 밖으로 나가는 것을 자동으로
  되돌리지 않는다 — 계약의 유한 숫자 · 상한(`±100000`)만 지킨다.
- 회전한 요소도 `x` · `y` 만 바뀌고 `rotation` 은 그대로다.

### 17-4. 끄는 동안에는 아무것도 저장되지 않는다

드래그 중에 움직이는 것은 **프레임 안의 custom property 두 칸**뿐이다.

- Canvas JSON · working draft · Undo 기록 · 스킨 CSS — 한 글자도 바뀌지 않는다.
- `applyStudioInspectorPatch()` 를 쓰지 않는다(그 함수는 template HTML 전용이라
  캔버스 요소에 닿을 수 없다 — §14-6).
- 요소의 `transform: rotate()` 를 덮어쓰지 않는다. 임시 `translate()` 를
  덧붙이지도 않는다 — 렌더러와 **같은 두 칸**(`--imory-canvas-x` ·
  `--imory-canvas-y`)을 갱신한다.
- 그 두 칸을 쓰는 함수는 렌더러의 것 하나다
  (`setSkinCanvasElementPosition` — skin/skin-home-canvas-render.js §0-1).
  편집기가 백분율 · 자릿수 계산을 복제하지 않는다. 그 함수가 없는 문서에서는
  **이동을 켜지 않는다**.
- 끄는 동안에는 `updateRect()` 를 부르지 않는다. Moveable 은 제스처 도중
  control box 를 자기 계산으로 그리고, 그 양이 우리가 옮기는 양과 같은
  clientX/Y 차이에서 나오므로 둘은 재지 않아도 붙어 있다.

취소되면 **시작할 때 적혀 있던 원본 문자열 두 개**를 그대로 되돌려 쓴다.
숫자로 바꿔 다시 쓰지 않는다 — 한 번 버린 자릿수가 두 번 버려진다.

> **읽기 · 되돌리기의 범위가 넓어졌다 → §18-5.** 지금은 제스처가
> 무엇이었든 네 칸(+ 높이 모드)을 **한 벌로** 읽고 되돌린다
> (`readSkinCanvasElementBoxVars` / `restore…`). 이동이 건드리지 않는 세
> 칸은 되돌려도 그대로이므로 규칙 자체는 위와 같다.

### 17-5. 불변 수정 — 두 칸만 바뀐다

`writeSkinHomeCanvasElementPosition(regions, id, next, expected)` 가 순수
함수로 한다(§18-6 부터 그 복사 규칙은 리사이즈와 공용인
`writeSkinHomeCanvasElementFields` 가 맡는다 — 보존 범위는 같다).

```text
regions[ name === "home_canvas" ].canvas.elements[ id === <선택> ].x
                                                                 .y
```

보존되는 것: regions 의 **알 수 없는 항목** · 항목의 모르는 칸 · canvas 의
모르는 칸 · element 의 모르는 칸 · `props` · `width` · `height` ·
`rotation` · `hidden` · `locked` · 요소 배열 **순서** · 다른 요소 객체 ·
image slot · template · css · js.

입력을 **제자리에서 고치지 않는다.** 바뀌는 경로 위의 객체(regions 배열 ·
`home_canvas` 항목 · canvas · elements 배열 · 그 요소)만 새로 만들고 나머지는
참조로 옮긴다 — 그래서 Undo 가 들고 있는 직전 스냅샷이 이 호출로 바뀌지
않는다.

같은 id 가 둘이면 캔버스 전체가 무효이므로(§5-1) 쓰지 않는다. 기존 좌표를
CSS 로 새로 적지 않는다.

### 17-6. 한 제스처 = Undo 한 칸

| 언제 | 기록 |
| --- | --- |
| dragStart · drag 중 | 없음 |
| dragEnd 에서 x · y 가 실제로 바뀌었다 | **한 칸** |
| 이동량 0 | 없음 |
| 취소 · 거부 | 없음 |

기록은 기존 Studio history 를 그대로 쓴다(`captureStudioWorkingChange` /
`recordStudioWorkingChange` — 좌우 영역 · 스킨 설정과 **같은 다섯 줄**).
별도 Undo stack 을 만들지 않는다.

Undo 는 드래그 전 좌표로, Redo 는 드래그 후 좌표로 돌아가고, **선택 ID 는
유지된다.** 다시 그려진 뒤 Moveable target 은 새 DOM 에 다시 붙는다.

### 17-7. 부모가 다시 본다

프레임은 자기 DOM 과 부모가 내려 준 좌표만 안다. 그 사이에 Undo · Import ·
AI 적용 · 선택 변경 · 요소 삭제가 있었을 수 있고, 위조된 메시지일 수도 있다.
그래서 확정은 **처음부터 다시** 본다
(`commitStudioCanvasElementTransform`).

1. Canvas 편집이 켜져 있다
2. `kind` 는 `"move"` 하나 — **변경됨 → §18-6** (`"resize"` 가 늘었고,
   `kind` 가 `expected` · `next` 의 허용 키를 정한다)
3. id 형태가 맞다
4. 지금 선택이 **정확히 그 하나**이고 primary 도 그것
5. 순번이 최신이다 — 늦게 도착한 옛 제스처를 버린다
6. 그 요소가 지금 draft 에 있고 hidden 도 locked 도 아니다
7. `expected` · `next` 는 **키가 정확히 x · y 둘**이다
8. 지금 draft 의 x · y 가 `expected` 와 **정확히** 같다
9. `next` 가 계약의 좌표 범위 안이다

> **모르는 키는 버리지 않고 거부한다.** 처음에는 x · y 만 새 리터럴로 옮겨
> 담았는데, 그러면 `next` 에 `width` 가 섞여 와도 조용히 빠지고 나머지는
> 저장된다 — 이 라운드의 e2e 가 그것을 "받아들였다"로 잡았다. 조용히 고쳐
> 주면 "이 메시지가 소유하는 것은 좌표 둘"이라는 계약이 말로만 남는다.

거부해도 화면은 되돌아간다 — 끝에서 언제나 지금 좌표를 프레임에 다시
내려보내기 때문이다(§17-8). 승인이면 방금 놓은 자리가, 거부면 예전 자리가
내려간다. **"거부"를 따로 알리는 메시지를 만들지 않았다.**

오류 때문에 캔버스 선택을 일반 Inspector 선택으로 바꾸지 않는다.

### 17-8. 메시지 둘

native 와 sandbox 가 **같은 부모 확정 함수**를 쓴다. 다른 것은 메시지가 가는
길뿐이다.

> **모양이 넓어졌다 → §18-9.** 아래 두 메시지에 `width` · `height` 가
> 늘었고 `kind` 에 `resize` 가 더해졌다. 답에 요청 번호를 다는 규칙과
> 아래 함정 셋은 그대로다.

```text
canvas-geometry   부모 -> 프레임
  { active, id?, x?, y?, baseWidth?, baseHeight?, generation, answering? }

canvas-transform  프레임 -> 부모
  { kind, id, expected:{x,y}, next:{x,y}, generation, requestId }
```

**왜 좌표가 내려가는가.** `canvas-select` 는 일부러 id 와 순번만 싣는다 —
프레임은 자리를 자기 DOM 에서 스스로 잰다(§15-4). 그런데 **Canvas 좌표**는
DOM 에서 잴 수 없다. 렌더러가 써 넣은 것은 여섯 자리에서 자른 백분율이고,
거꾸로 풀면 원본과 미세하게 다른 숫자가 나온다. 그 값을 시작점으로 삼으면
끌지도 않은 요소가 저장될 때마다 조금씩 움직인다.

단독 선택이 아닐 때(0개 · 2개 이상 · 잠김 · 숨김)는 `active:false` 로 내려가고
나머지 칸은 **아예 없다** — `canvas-select` 의 해제와 같은 모양이다.

> **함정 — "확정 뒤 처음 온 좌표"를 답으로 읽지 마라.**
> 좌표 메시지는 답 말고도 나간다: 선택이 바뀔 때, 다시 그린 뒤, draft 가
> 바뀔 때마다. 2026-09-21 실측에서 확정이 부모에 닿기 **전에** 확정 전 값을
> 그대로 담은 좌표가 한 번 더 내려왔고, 프레임은 승인된 이동을 "거부됐다"로
> 읽어 제자리로 돌렸다. 그래서 답에만 **요청 번호**(`answering` = 그 요청의
> `requestId`)를 달고, 프레임은 자기 번호와 같은 답에만 반응한다. 기억해
> 두었다가 렌더 뒤에 다시 보내는 값에서는 그 번호를 **지운다** — 옛 답이 두
> 번 답이 되지 않게.

> **함정 — 재렌더가 확정을 죽이지 않게 하라.**
> 승인된 확정은 곧바로 화면을 다시 그리게 한다. 재렌더에서 제스처와 함께
> **기다림까지** 접으면 정상적으로 저장된 이동이 "답을 못 받았다"가 되어
> 화면만 제자리로 돌아간다. 재렌더가 접는 것은 **제스처뿐**이고, 기다림을
> 끝내는 것은 번호가 붙은 답 하나 · 상한 시간 · `dispose()` 셋이다.

> **함정 — sandbox 에서는 누르는 순간 선택이 한 번 더 확정된다.**
> sandbox 프레임의 Inspector 는 **pointerdown** 에서 고른다. 그래서 이미 고른
> 요소를 끌기 시작하는 그 순간에도 "이것을 골랐다"가 올라가고, 부모는 같은
> 선택을 **새 순번**으로 확정해 내려 준다(언제나 dragStart 뒤에 도착한다).
> 순번이 달라졌다고 취소하면 sandbox 에서는 이동이 한 번도 성립하지 않는다.
> 가르는 기준은 순번이 아니라 **무엇을 골랐는가**이고, 같은 단독 선택이면
> 진행 중인 제스처가 새 순번을 받아 간다.

메시지 층의 검사: 알려진 키만 · `kind` 는 `move` 하나 · id 형태 · 좌표의
유한성과 상한 · `expected` 와 `next` 는 x · y 두 칸 · origin · source ·
`renderSeq`. `width` · `height` · `rotation` 이 섞이면 **메시지 전체가**
버려진다.

### 17-9. 취소

다음에서는 확정하지 않고 시작 자리로 되돌린다.

Escape · pointercancel · 프레임 교체 · HOME 이탈 · Select 종료 · 선택 변경 ·
요소 삭제 · Canvas 비활성화 · 시작 좌표가 달라짐(Undo · Import) · 부모 거부 ·
vendor/runtime 오류.

Escape 는 **끄는 동안에만** 가로챈다. 그때는 그 키의 뜻이 "지금 옮기던 것을
없던 일로"이고, 그대로 흘려보내면 Inspector 가 **선택까지** 푼다. 끌고 있지
않을 때는 손대지 않는다.

답이 아예 오지 않는 경우(프레임 교체 · 부모 오류)를 위해 기다림에 상한을
둔다 — 그때는 마지막으로 알고 있던 값으로 돌아간다.

### 17-10. 이번 단계에 **없는 것**

크기 · 회전 조작 · 손잡이 · 그룹 이동 · **손가락 이동** · 스냅 · 가이드 ·
키보드 화살표 이동 · Inspector geometry 입력 필드 · 텍스트 편집 · 이미지
교체 · Crop · 레이어 목록 · effect hook · preset · widget · 좌우 패널 Canvas
— **하나도 없다.**

> **셋이 채워졌다 → §18.** 크기 조작 · 손잡이는 `TRANSFORM-1B` 가
> 더했다(§18-1 · §18-11). 나머지는 그대로 없고, 그 목록은 §18-13 이
> 다시 적는다.

저자 CSS/JS 가 geometry 를 강제로 덮는 경우의 최종 우선순위는
`HOME-CANVAS-EFFECT-HOOK-1` 에서 정한다. 이번에는 **기존 transform 을
파괴하지 않는 것**까지만 보장한다.


---

## 18. 단일 요소 리사이즈 (`HOME-CANVAS-TRANSFORM-1B`)

`1A`(§17)가 연 길을 그대로 쓴다. 바뀌는 것은 **소유하는 칸이 둘에서
넷으로 늘었다**는 것뿐이다 — `x` · `y` · `width` · `height`.

회전 조작 · 그룹 조작 · Shift 비율 고정 · Alt 중심 확대 · flip · 스냅 ·
키보드 · Inspector 숫자 입력은 이 라운드에 없다(§18-13).

### 18-1. 관련 파일과 켜지는 조건

| 파일 | 이 라운드에서 하는 일 |
| --- | --- |
| `skin/skin-home-canvas-render.js` | `applySkinCanvasElementBox()` — 네 칸과 `height` 모드를 쓰는 **한 곳**(§18-5). 요소를 처음 만들 때도 이 함수다 |
| `skin/skin-home-canvas.js` | `writeSkinHomeCanvasElementBox()` — 순수 불변 수정. `writeSkinHomeCanvasElementPosition()` 과 **같은 복사 규칙**을 공유한다(`writeSkinHomeCanvasElementFields`) |
| `skin/skin-home-canvas-editor-runtime.js` | 손잡이 · 제스처 · 임시 크기 · 확정 요청 · 취소 (두 프레임 공용) |
| `skin/skin-inspect-target.js` | `inspectorEditChromeAncestor()` — "이 입력은 Inspector 의 것이 아니다"(§18-11) |
| `studio/preview/preview-inspect-direct.js` · `skin/sandbox/skin-sandbox-inspect.js` | 그 판정을 실제로 쓰는 두 realm |
| `studio/inspector/studio-canvas-selection.js` | `commitStudioCanvasElementTransform()` — `kind` 가 하나 늘었다(§18-6) |
| `studio/studio-preview.js` | `setStudioCanvasElementBox()` — draft · 기록 · dirty · 다시 그리기 |
| `skin/sandbox/skin-sandbox-protocol.js` · `-host.js` · `-frame.js` | 메시지 둘에 크기가 늘었다(§18-9) |

켜지는 조건은 **이동과 똑같다**(§17-1 의 일곱). 관문 함수도 하나다
(`dragGate()`) — 둘이 요구하는 것이 같기 때문이다. 다른 것은 제스처가
그 값에서 무엇을 바꾸는가뿐이다.

단독 선택에서 손잡이 여덟(`nw` `n` `ne` `e` `se` `s` `sw` `w`)을
표시한다. **여럿을 고르면 손잡이가 없다** — 그룹 리사이즈는 다음
단계다.

> **함정 — able 은 처음부터 켜고, 손잡이 목록으로 여닫는다.**
> `resizable` 을 나중에 켜면 그 렌더 뒤에야 손잡이의 gesto 가
> 만들어진다 — §17-1 의 `draggable` 함정과 같은 사정이다. 그래서
> `resizable: true` 로 만들어 두고 그룹에서는 `renderDirections` 를
> **빈 배열**로 준다. 그것은 그리기에만 쓰이므로 setState 의 지연이
> 문제가 되지 않고, 잡을 손잡이가 아예 없으니 그룹에서는 리사이즈가
> 시작될 수 없다.

> **함정 — DOM 에 남아 있는 손잡이와 잡을 수 있는 손잡이는 다르다.**
> 0.53.0 은 target 을 풀면 control box 를 `display:none` 으로 만들 뿐
> **자식 손잡이를 지우지 않는다**(2026-09-21 실측: 선택이 비었는데
> 노드는 여덟 그대로였다). 그래서 "여럿을 고르면 손잡이가 없다"를
> 노드 수로 세면 틀린 답이 나온다 — 진단과 테스트는
> `getClientRects().length` 로 **화면에 실제로 있는 것**만 센다.

### 18-2. 손잡이의 뜻 · 최소 크기 · 상한

> **★ 이 절의 비율 규칙은 `MANUAL-UX-FIX-1` 에서 바뀌었다(§21-2).**
> 이 라운드(`TRANSFORM-1B`)에서는 손잡이 여덟이 **모두 자유 비율**이었다.
> 지금 계약은 **모서리 넷(`nw` `ne` `se` `sw`)이 시작 비율을
> 유지하고, 변 중앙 넷(`n` `e` `s` `w`)만 한 축을 자유롭게
> 바꾼다.** 아래 목록의 나머지(최소 크기 · 상한 · 자릿수 · 보존 범위)는
> 그대로다.

- 여덟 손잡이가 모두 동작한다. 변 중앙 넷은 가로와 세로를 독립적으로
  바꾸고, 모서리 넷은 시작 비율을 지킨다(§21-2).
- 요소를 도화지 경계 안으로 **자동 clamp 하지 않는다**. `x` · `y` 는
  계속 음수를 허용한다.
- `width` 와 숫자 `height` 는 양수여야 하고, 최소는 Canvas 좌표
  기준 **1** 이다.
- 상한은 계약의 기존 자를 그대로 쓴다(`±100000` — §5).
- 저장값은 **소수점 셋째 자리**까지. 정확한 정수면 정수 그대로다.
- 배열 순서 · `rotation` · `props` · 알 수 없는 필드는 바뀌지 않는다.

사진 · 스티커 · 로고의 이미지가 비틀어지지 않는 것은 `object-fit` 구조가
그대로 남아 있기 때문이다(§12 — 그 값은 `MANUAL-UX-FIX-1` 에서
`contain` 이 됐다, §21-3). 이 라운드가 바꾸는 것은 **요소 프레임의
크기**다.

> Moveable 은 자기 계산에서 크기를 `0` 에서 멈추고 우리는 `1` 에서
> 멈춘다. 그래서 요소를 한계까지 줄인 그 순간에는 반대편 기준점이
> 최대 1 Canvas 단위만큼 어긋날 수 있다. 실사용 범위가 아니므로
> 맞추지 않았다.

### 18-3. `height:"auto"` — 언제 숫자가 되는가

`"auto"` 는 "높이를 적지 않는다"이지 "높이를 못 고친다"가 아니다(§6).

| 손잡이 | 결과 |
| --- | --- |
| `e` · `w` | `width` 와 필요한 `x` 만 바꾸고 **`"auto"` 유지** |
| `n` · `s` · 네 모서리 | 실제 세로 변화가 있으면 **숫자 높이로 전환** |

> 모서리에서는 `MANUAL-UX-FIX-1` 부터 세로가 **비율을 따라 반드시**
> 움직이므로(§21-2), 실제로 끈 모서리 제스처는 언제나 숫자로 전환된다.
> 변화량 0(단순 클릭)은 그대로 `"auto"` 다. 그때 비율의 기준이 되는
> 세로는 아래 "그 순간 화면에 그려진 실제 세로 길이"와 **같은 값**이다.

전환 조건은 **둘 다** 참일 때다.

1. 세로가 움직일 수 있는 손잡이였다(`direction[1] !== 0`)
2. 실제 세로 변화가 0 이 아니다

(1)만 보면 모서리를 잡고 가로로만 끌어도 숫자가 되고, (2)만 보면
단순 클릭의 미세한 떨림이 숫자로 바꾼다.

기준 높이는 **그 순간 화면에 그려진 실제 세로 길이**를 Canvas 좌표로
환산한 값이다. 저장된 숫자가 없으므로 화면에서 한 번 재는 것이 유일한
출발점이다.

> **재는 자는 computed `height` 다.**
> `getBoundingClientRect()` 를 쓰지 않는다 — 회전한 요소에서 그것은
> 축에 정렬된 바깥 상자라 요소의 세로 길이가 아니다. computed
> `height` 는 회전과 무관한 레이아웃 값이고, 그것이 곧 우리가
> `--imory-canvas-height` 로 쓰는 그 칸의 단위다.

한 번 숫자가 된 요소를 **자동으로 `"auto"` 로 되돌리지 않는다.**
`내용에 맞추기` UI 는 뒤의 Inspector 단계다. 다만 Undo 하면 정확히
`"auto"` 로 돌아간다(§18-7).

`"auto"` 를 유지하는 좌우 리사이즈에서는 높이 칸을 화면에도 쓰지
않는다 — 폭이 바뀌어 줄바꿈이 달라진 만큼 브라우저가 다시 계산한다.
그동안 Moveable 의 바깥 상자는 시작 높이에 머물러 있다(제스처 도중에
`updateRect()` 를 부르지 않기 때문이다 — §17-4). 손을 놓으면 다시
그린 DOM 에 붙으면서 맞는다.

### 18-4. 픽셀을 Canvas 좌표로 — Moveable 이 준 것을 쓴다

배율은 이동과 같다(§17-3 — 도화지의 가로폭 하나, 부모 Preview 의
`transform: scale()` 은 다시 적용하지 않는다).

```text
dw = e.dist[0] / scale                    width  의 누적 변화
dh = e.dist[1] / scale                    height 의 누적 변화
x  = 시작 x + e.drag.beforeTranslate[0] / scale
y  = 시작 y + e.drag.beforeTranslate[1] / scale
```

- `resizeStart` 에서 네 칸을 snapshot 하고, 이후에는 언제나 **시작값 +
  누적 변화**다. 직전 이벤트의 값에 더하지 않으므로 이벤트 수와
  무관하고 반올림이 쌓이지 않는다.
- 배율도 `resizeStart` 에서 한 번 재고 그 제스처 동안 유지한다.

> **★ 삼각함수를 새로 적지 않았다.**
> 회전한 요소에서 반대편 기준점을 유지하려면 요소의 **중심**이
> 움직여야 한다(회전 중심이 중심이므로). 그 양은 Moveable 이 이미
> 계산해 준다 — `drag.beforeTranslate` 다. 그 값은
> `transform: translate(tx,ty) rotate(θ)` 의 앞 translate 이므로
> **부모 좌표계**의 양이고, 우리 요소는 그 좌표계에서 `left` · `top`
> 으로 놓여 있다. 그래서 `x` · `y` 에 **그대로 더하면** 된다.
>
> 2026-09-21 실측(20° · 45°, `e` · `n` · `nw` · `se`)에서 그 값이 중심
> 회전 공식과 소수점까지 같았고, 고정되어야 하는 반대편 기준점은
> **0.9px 안에서** 유지됐다(그 오차는 렌더러가 백분율을 여섯 자리에서
> 자르기 때문이다).

> **★ 크기는 `dist` 다 — `width` · `height` 는 쓰지 않는다.**
> 0.53.0 의 resize payload 에서 `width` · `height` · `boundingWidth` 는
> 우리처럼 `style.width` 를 적용하지 않는 사용법에서는 **시작값에
> 머문다**(2026-09-21 실측: 40px 를 끌어 `dist:[40,0]` 인데 `width` 는
> 그대로 90). `dist` 는 요소 **자기 축**에서의 누적 크기 변화이므로
> 회전과 무관하고, delta 라서 padding · border 같은 box model 차이도
> 상쇄된다.

> **★ 끄는 동안 크기를 실제로 적용해도 `dist` 는 선형이다.**
> Moveable 은 기준점을 `resizeStart` 에서 잡아 두고 그 뒤로는 포인터
> 이동만 보므로, 우리가 적용한 크기를 두 번 세지 않는다(실측으로
> 확인했다 — 그렇지 않았다면 끌 때마다 가속됐을 것이다).

### 18-5. 끄는 동안에는 아무것도 저장되지 않는다

드래그 중에 움직이는 것은 **프레임 안의 custom property 넷과 높이
모드 속성**뿐이다.

- Canvas JSON · working draft · Undo 기록 · 스킨 CSS — 한 글자도
  바뀌지 않는다.
- `rotation` 을 덮어쓰지 않는다. 임시 `translate()` 를 덧붙이지도
  않는다 — 렌더러와 **같은 칸들**을 갱신한다.
- 그 칸들을 쓰는 함수는 렌더러의 것 하나다
  (`applySkinCanvasElementBox` — §18-1). 편집기가 백분율 · 자릿수 ·
  `"auto"` 판정을 복제하지 않고, 그 함수가 없는 문서에서는
  **리사이즈도 이동도 켜지 않는다**.
- 읽기 · 되돌리기도 네 칸을 **한 벌로** 한다
  (`readSkinCanvasElementBoxVars` / `restore…`). 이동에서도 같은 쌍을
  쓴다 — 제스처마다 되돌리는 범위가 갈라지면 "크기를 바꾸다 취소한
  뒤 위치만 돌아왔다"가 생긴다.
- 취소되면 **시작할 때 적혀 있던 원본 문자열들**을 그대로 되돌려
  쓴다(높이 모드 속성까지). 숫자로 바꿔 다시 쓰지 않는다.

제스처가 정상 종료될 때만 부모에 한 번 확정을 요청한다. 그 요청 ·
기다림 · 요청 번호 · 상한 시간은 이동과 **한 벌**이다
(`sendTransform()`).

### 18-6. 부모 확정 — `kind` 가 소유하는 칸을 정한다

```text
canvas-transform  프레임 -> 부모
  { kind, id, expected, next, generation, requestId }

  kind "move"     expected · next = { x, y }
  kind "resize"   expected · next = { x, y, width, height }
```

`height` 는 기존 값과 다음 값 모두 숫자이거나 `"auto"` 다.

부모는 확정 전에 **처음부터 다시** 본다(§17-7 의 그 아홉을 넓힌 것이다).

1. Canvas 편집이 켜져 있다
2. `kind` 는 `"move"` 또는 `"resize"`
3. id 형태가 맞다
4. 지금 선택이 **정확히 그 하나**이고 primary 도 그것
5. 순번이 최신이다
6. 그 요소가 지금 draft 에 있고 hidden 도 locked 도 아니다
7. `expected` · `next` 는 그 `kind` 가 소유한 칸뿐이고 유한한 숫자다
8. 지금 draft 의 그 칸들이 `expected` 와 **정확히** 같다
9. `next` 가 계약의 좌표 · 크기 범위 안이고, `width` 와 숫자
   `height` 가 양수다
10. `"auto"` 는 그 요소의 type 이 허용할 때만이다(§6 — `text` ·
    `category_nav`)

> **모르는 키는 버리지 않고 거부한다.** 리사이즈 요청에 `rotation`
> 이 섞이면 메시지 전체가 버려지고, **반대로** 리사이즈 요청에 좌표
> 둘만 실려 와도 버려진다. `kind` 마다 소유하는 모양이 하나이므로
> 서로의 자리에 들어갈 수 없다(§17-7 의 그 함정을 양방향으로 넓힌
> 것이다).

> **네 칸이 한 요청이다.** 폭만 바뀌는 좌우 리사이즈에서도 `x` · `y` ·
> `height` 가 함께 온다(값이 같을 뿐이다). 칸마다 메시지를 가르면
> "폭은 저장됐는데 x 는 안 됐다"는 중간 상태가 생긴다.

성공하면 한 요소의 네 칸만 불변 방식으로 바뀐다. element id · type ·
`rotation` · hidden · locked · `props` · 모르는 element 필드 · 다른
요소 · 배열 순서 · 다른 regions 항목 · 모르는 region/canvas 필드는
전부 보존된다. 입력 SkinPackage 를 제자리에서 고치지 않는다.

그 복사 규칙은 이동과 **같은 함수**가 한다
(`writeSkinHomeCanvasElementFields`) — 둘로 나뉘면 서로의 보존 범위가
서서히 달라지고, 달라지는 쪽은 늘 느슨한 쪽이다.

### 18-7. Undo · Redo

이동과 같다(§17-6). 한 번의 리사이즈 제스처가 Undo 한 칸이고, 변화 0
과 거부는 기록을 만들지 않는다. 기존 Studio history 를 그대로 쓴다
(`captureStudioWorkingChange` / `recordStudioWorkingChange`).

- Undo 하면 리사이즈 전 네 칸으로, Redo 하면 뒤 값으로 돌아간다.
- **`"auto"` 에서 숫자로 바뀐 리사이즈를 Undo 하면 정확히 `"auto"` 로
  돌아간다** — JSON 도, 화면의 `data-imory-canvas-height` 속성도.
- Undo · Redo 뒤에도 선택 ID 는 유지되고, 다시 그려진 DOM 에 Moveable
  target 과 손잡이 여덟이 다시 붙는다.

### 18-8. 취소

§17-9 그대로다 — Escape · pointercancel · 프레임 교체 · HOME 이탈 ·
Select 종료 · 선택 변경 · 요소 삭제 · Canvas 비활성화 · **시작 값이
달라짐**(Undo · Import) · 부모 거부 · vendor/runtime 오류.

> 시작 값 비교는 이제 **네 칸을 모두** 본다. 이동 중에 폭이 달라졌다는
> 것도 "그 사이에 draft 가 바뀌었다"이고, 그때의 이동은 이미 옛 화면을
> 근거로 한 것이다.

늦게 도착한 성공 · 실패 응답이 최신 상태를 덮어쓰지 않는 장치도 그대로
다 — 답에는 요청 번호가 붙고, 프레임은 자기 번호와 같은 답에만
반응한다(§17-8).

### 18-9. 메시지

```text
canvas-geometry   부모 -> 프레임
  { active, id?, x?, y?, width?, height?,
    baseWidth?, baseHeight?, generation, answering? }
```

`width` · `height` 는 `active` 면 **반드시 있다** — 프레임은 크기를
모르는 채로 리사이즈를 시작할 수 없다. `height` 는 숫자이거나
`"auto"` 다. 단독 선택이 아닐 때는 `active:false` 로 내려가고 나머지
칸은 **아예 없다**(크기 칸까지).

크기가 **내려가야 하는** 이유는 좌표와 같다(§17-8) — 렌더러가 써 넣은
백분율은 이미 여섯 자리에서 자른 값이라 거꾸로 풀면 원본이 아니다.

sandbox 메시지 층의 검사: 알려진 키만 · `kind` 는 `move` · `resize` 두
이름 · id 형태 · 좌표와 크기의 유한성 · 양수 · 상한 · `"auto"` 문자열
하나(`"AUTO"` · `"100px"` 는 거부) · origin · source · `renderSeq`.

native 와 sandbox 가 **같은 부모 확정 함수**를 쓴다. 2026-09-21 실측에서
같은 픽셀 제스처의 최종 JSON 이 두 경로에서 **같은 숫자**였다(`width`
114.375, `"auto"` 전환 높이 22.75).

### 18-10. 화면 배율 · 스크롤

- 도화지 폭이 390 이 아니어도(배율 1.477 · 2.462 실측) 픽셀이 Canvas
  좌표로 환산된다.
- 부모 Preview 에 `transform: scale(0.8)` 이 걸려 있어도 **두 번
  보정하지 않는다** — 프레임 안의 좌표계에서 둘 다 같은 배율을 받으므로
  나누면 사라진다(§17-3).
- Preview 내부를 스크롤한 뒤에도 손잡이 자리와 좌표가 맞는다.

> **함정(테스트) — sandbox 에서 스크롤하는 것은 프레임이 아니다.**
> 프레임 구조가 parent → `#studioPreviewFrame` → `.imory-skin-sandbox-frame`
> 이고, 안쪽 sandbox iframe 은 자기 내용 높이만큼 늘어나 있어 **스스로
> 스크롤하지 않는다**. 그 안에서 `window.scrollBy` 를 불러도 아무 일도
> 일어나지 않는다 — 2026-09-21 에 그것 때문에 화면 밖 좌표로 클릭해
> sandbox 의 두 번째 선택이 되지 않았고, 여전히 고른 채였던 앞 요소를
> 리사이즈하고 있었다. 밀어야 하는 것은 **Preview 문서**다.

### 18-11. 손잡이의 hit area — 편집 UI 는 Inspector 의 것이 아니다

control box 는 `pointer-events: none` 이다(§15-7) — 요소의 가장자리를
정확히 누른 클릭이 스킨 DOM 에 닿아야 하기 때문이다. 그 값은
상속되므로 손잡이도 함께 꺼진다(0.53.0 의 `.control` 규칙에는
pointer-events 가 아예 없다 — 번들 실측).

그래서 **리사이즈 손잡이에만** `auto` 를 되돌려 준다. 테두리 네 줄과
그룹의 `.moveable-area` 는 그대로 꺼 둔다. CSSOM 으로 쓰는 인라인 값은
CSP 의 style-src 검사를 받지 않으므로(검사 대상은 마크업의 style
**속성**이다) 우리 몫의 `<style>` 을 새로 만들지 않는다.

손잡이 **요소 자체**는 방향 목록이 바뀔 때 새로 만들어지므로, target 이
바뀔 때와 따라가기 루프(rAF)에서 다시 쓴다(여덟 노드다).

> **★ 그 순간 Inspector 가 끼어든다.**
>
> `1A` 까지 control box 는 통째로 `pointer-events: none` 이라 어떤
> 입력의 대상도 아니었다. 손잡이가 그것을 되돌려 받자마자, 손잡이를
> 누른 pointerdown · click · dblclick · hover 가 Inspector 에도
> 닿는다. 그대로 두면 손잡이 아래에 깔린 것이 새로 골라지거나(모서리
> 손잡이는 요소 밖에 반쯤 걸쳐 있다) 아무것도 없는 자리로 읽혀
> **선택이 풀리고**, 방금 시작한 리사이즈가 그 자리에서 취소된다.
> sandbox 는 **pointerdown** 에서 고르므로 움직이기도 전에 그렇게 된다.
>
> 그래서 세 realm 이 함께 쓰는 파일에 판정 하나를 둔다
> (`skin/skin-inspect-target.js` `inspectorEditChromeAncestor()` —
> control box 의 `data-imory-canvas-frame` 표식을 찾는다). 그것이
> 무언가를 돌려주면 Inspector 는 **아무 일도 하지 않고 빠져나간다** —
> 선택을 풀지도, 다시 고르지도, 오류를 알리지도 않는다.
>
> "고를 것이 없다"가 아니라 **"내 입력이 아니다"** 다. 그 입력의 주인은
> Moveable 이고, 그쪽은 `mousedown` · `touchstart` 로 받는다(0.53.0 은
> pointer 이벤트를 쓰지 않는다 — 번들 실측). Inspector 가 비켜서기만
> 하면 둘이 싸우지 않는다.

Selecto 는 이미 `isMoveableElement()` 로 control 에서 시작한 드래그를
거부한다(§16-7) — 손잡이를 끌어도 lasso 는 시작되지 않고, 빈 도화지
lasso 는 그대로다.

손잡이 모양과 선은 Studio 편집 UI 가 소유한다. Canvas 요소 DOM 에는
편집용 class 도 인라인 transform 도 영구히 남지 않는다(§18-5).

### 18-12. 손가락

**손가락으로는 크기도 바꾸지 않는다.** 이동과 같은 이유이고(§17-2) 같은
판정 함수(`isCoarsePointerEvent`)를 쓴다 — 도화지를 덮는 요소가 선택된
상태에서 한 손가락 드래그를 가로채면 모바일 Preview 가 아예 스크롤되지
않는다. 단일 탭 선택과 `touchmove` 는 그대로다(`preventDefault` 되지
않는다).

### 18-13. 이번 단계에 **없는 것**

회전 조작 · 그룹 이동 · 그룹 리사이즈 · 그룹 회전 · Shift 비율 고정 ·
Alt 중심 기준 확대 · flip · 음수 크기 전환 · 스냅 · 가이드 · 키보드
이동과 크기 조절 · Inspector geometry 입력 필드 · `"auto"` 로 되돌리는
UI · 텍스트 직접 편집 · 이미지 교체 · Crop · 레이어 목록 · effect
hook · preset · widget · 좌우 패널 Canvas · responsive override ·
**손가락 조작** — 하나도 없다.

> **하나가 채워졌다 → §19(`HOME-CANVAS-TRANSFORM-1C`).** 회전 조작과
> 회전 손잡이는 그 라운드가 더했다. 나머지는 그대로 없고, 그 목록은
> §19-12 가 다시 적는다.

> **또 하나가 채워졌다 → §21-2(`HOME-CANVAS-MANUAL-UX-FIX-1`).**
> **모서리 손잡이의 비율 유지**가 그 라운드에서 들어왔다. Shift 로
> 켜고 끄는 것이 아니라 **손잡이 자체의 뜻**이다 — Shift · Alt · flip
> 은 그대로 없다.

저자 CSS/JS 가 geometry 를 강제로 덮는 경우의 최종 우선순위는 여전히
`HOME-CANVAS-EFFECT-HOOK-1` 의 몫이다(§17-10).


---

## 19. 단일 요소 회전 (`HOME-CANVAS-TRANSFORM-1C`)

`1A`(§17) · `1B`(§18)가 연 길을 그대로 쓴다. 바뀌는 것은 **소유하는
칸이 `rotation` 하나**라는 것뿐이다.

**상자는 한 칸도 바뀌지 않는다.** 회전 중심이 요소 상자의 정중앙이라
(§4 · `transform-origin` 기본값) `x` · `y` · `width` · `height` 가
그대로여도 화면이 맞는다. `height:"auto"` 도 `"auto"` 그대로다.

그룹 회전 · Shift 각도 스냅 · 15° 스냅 · 가이드 · 사용자 지정 중심점은
이 라운드에 없다(§19-12).

### 19-1. 관련 파일과 켜지는 조건

| 파일 | 이 라운드에서 하는 일 |
| --- | --- |
| `skin/skin-home-canvas-render.js` | `applySkinCanvasElementRotation()` — 각도를 쓰는 **한 곳**(§19-4). 요소를 처음 만들 때도 이 함수다. 읽기 · 되돌리기 한 벌에도 각도가 들어왔다 |
| `skin/skin-home-canvas.js` | `writeSkinHomeCanvasElementRotation()` — 순수 불변 수정. 이동 · 리사이즈와 **같은 복사 규칙**을 공유한다(`writeSkinHomeCanvasElementFields`) |
| `skin/skin-home-canvas-editor-runtime.js` | 회전 손잡이 · 제스처 · 임시 각도 · 확정 요청 · 취소 · `normalizeCanvasRotation()` (두 프레임 공용) |
| `studio/inspector/studio-canvas-selection.js` | `commitStudioCanvasElementTransform()` — `kind` 가 하나 더 늘었다(§19-6) |
| `studio/studio-preview.js` | `setStudioCanvasElementRotation()` — draft · 기록 · dirty · 다시 그리기 |
| `skin/sandbox/skin-sandbox-protocol.js` · `-host.js` · `-frame.js` | 메시지 둘에 각도가 늘었다(§19-9) |

켜지는 조건은 **이동 · 리사이즈와 똑같다**(§17-1 의 그 일곱, 같은
`dragGate()`). 다른 것은 제스처가 그 값에서 무엇을 바꾸는가뿐이다.

단독 선택에서 회전 손잡이 **하나**를 요소 위쪽에 표시한다. **여럿을
고르면 회전 손잡이가 없다** — 그룹 회전은 다음 단계다.

> **함정 — `rotatable` 을 `true` 로 주면 손잡이가 여덟 개 더 생긴다.**
> 0.53.0 의 Rotatable 은 자기 옵션을 `Vo(props,"rotatable")` 로 읽는데,
> 그 함수는 `props.rotatable` 이 **객체가 아니면 props 를 통째로**
> 본다(번들 실측). 그러면 우리가 리사이즈용으로 준
> `renderDirections` 여덟을 **회전용 방향 손잡이 여덟**으로 한 번 더
> 그린다 — `.moveable-control[data-direction]` 이 열여섯이 되고 손잡이
> 계산이 통째로 어긋난다. 그래서 `rotatable: { renderDirections: false }`
> 로 **객체로** 준다.

> **able 은 여기서도 처음부터 켠다.** 여닫는 것은 `rotationPosition`
> 이다 — `"none"` 이면 손잡이를 아예 그리지 않는다(번들 실측: `Ji()`
> 첫 줄이 빈 배열을 돌려준다). 리사이즈의 `renderDirections: []` 과
> 같은 자리이고, 같은 이유다(§18-1 의 그 함정).

> **함정 — 회전 손잡이는 `.moveable-line` 을 하나 더 만든다.**
> 손잡이를 요소에 매다는 40px 막대가 `.moveable-line
> .moveable-rotation-line` 이다. "테두리 네 줄"을 `.moveable-line` 으로
> 세던 자리(`SELECT-1B-1` 의 e2e · runtime 의 `debugState().lines`)가
> 그때부터 **다섯**을 센다. 세는 쪽에서 `:not(.moveable-rotation-line)`
> 으로 가른다 — 그 막대는 외곽이 아니다.

### 19-2. 회전 기준

- 회전 중심은 요소 상자의 **정중앙**이다. 별도의 `transform-origin`
  필드를 만들지 않는다(§4).
- `x` · `y` · `width` · `height` 는 회전 중 · 확정 후 모두 바뀌지
  않는다. `"auto"` 높이도 그대로다.
- 각도는 기존 `rotation` 칸 **하나**에 저장한다.
- `rotation` 이 없는 요소는 화면상 `0°` 로 계산한다(§5).
- **첫 회전 전까지는 단순 선택만으로 `rotation:0` 을 JSON 에 만들지
  않는다.** 실제로 돌린 제스처만 그 칸을 만든다.
- 허용 범위는 계약이 이미 가진 그것 하나다 — **유한한 숫자**(§5).
  회전용으로 새 범위를 만들지 않고, 좌표의 `±100000` 을 빌려 오지도
  않는다(§19-9).
- 도화지 경계에 맞추는 clamp 는 하지 않는다.
- 저장값은 **소수점 셋째 자리**까지(좌표와 같은 자).

### 19-3. 한 바퀴를 넘을 때 — 제스처 중과 저장값을 가른다

```text
제스처 중 : 시작 rotation + 누적 회전량   (연속 각도 — 360 을 넘는다)
저장값     : 그 값을 한 바퀴 안으로 접은 것 [0, 360)
```

- 350° 에서 조금 더 돌린 값은 **365° 이지 5° 가 아니다.** 제스처 중에
  접으면 화면이 반대 방향으로 튄다.
- 접는 것은 손을 놓을 때 **한 번**이고, 그 표현을 정하는 곳은 한 벌의
  helper 하나다(`normalizeCanvasRotation()`). 접은 뒤에 반올림하므로
  359.9996 이 `360` 으로 저장되지 않는다.
- 접힌 값과 연속 값은 **같은 그림**이다(365° 와 5° 의 `rotate()` 는
  같은 행렬이다). 그래서 확정 뒤 부모가 접힌 값을 내려보내도 화면이
  달라지지 않는다.
- **이미 저장된 값을 일괄로 고치지 않는다.** 접히는 것은 이번 제스처가
  실제로 바꾼 그 요소의 새 값 하나뿐이고, 손대지 않은 요소의 `-30` ·
  `400` 은 그대로 남는다(2026-09-21 e2e: Export → Import 뒤에도 `-30`).

> **판정은 접은 값이 아니라 연속 각도로 한다.** "돌지 않았다"를 접은
> 값으로 보면, 손잡이를 누르기만 한 요소의 저장된 `400°` 가 `40°` 로
> 조용히 바뀐다. 이번 제스처의 누적 회전량이 0 이면 확정도 기록도
> 없다.

### 19-4. 각도를 쓰는 **한 곳**

렌더러의 `applySkinCanvasElementRotation()` 하나다
(`skin/skin-home-canvas-render.js` §0-3). 요소를 처음 만들 때도, 편집기가
회전 중에 임시로 고칠 때도 그 함수다 — 자릿수 규칙이 두 벌이 되면
"끄는 동안"과 "다시 그린 뒤"의 각도가 미세하게 달라진다. **이것이 없는
문서에서는 편집기가 회전을 켜지 않는다**(이동 · 리사이즈와 같은 규칙).

그 함수가 쓰는 것은 custom property 한 칸
(`--imory-canvas-rotation`)이다. `transform` 문자열을 만들지 않는다 —
요소의 transform 은 스킨 CSS 가 `rotate(var(…))` 로 갖고 있다
(`skin/skin-home-canvas-render.css` §2).

읽기 · 되돌리기는 **네 칸 + 높이 모드 + 각도를 한 벌로** 한다
(`readSkinCanvasElementBoxVars` / `restore…`). 제스처마다 되돌리는
범위가 갈라지면 "돌리다 취소했는데 크기만 돌아왔다"가 생긴다(§18-5 의
그 이유 그대로다).

### 19-5. 끄는 동안에는 아무것도 저장되지 않는다

드래그 중에 움직이는 것은 **프레임 안의 custom property 한 칸**뿐이다.
Canvas JSON · working draft · Undo 기록 · 스킨 CSS 는 한 글자도 바뀌지
않는다. 상자 네 칸도 건드리지 않는다.

제스처가 정상 종료될 때만 부모에 한 번 확정을 요청한다. 그 요청 ·
기다림 · 요청 번호 · 상한 시간은 이동 · 리사이즈와 **한 벌**이다
(`sendTransform()`).

### 19-6. 부모 확정 — `kind` 가 소유하는 칸을 정한다

```text
canvas-transform  프레임 -> 부모
  { kind, id, expected, next, generation, requestId }

  kind "move"     expected · next = { x, y }
  kind "resize"   expected · next = { x, y, width, height }
  kind "rotate"   expected · next = { rotation }
```

부모가 다시 보는 것은 §18-6 의 그 열이고, 달라지는 것은 7 · 9 뿐이다 —
`expected` · `next` 의 키가 **정확히 `rotation` 하나**이고 유한한
숫자여야 한다.

> **모르는 키는 버리지 않고 거부한다.** 회전 요청에 좌표가 섞이면
> 메시지 전체가 버려지고, 반대로 이동 · 리사이즈 요청에 `rotation` 이
> 섞여도 버려진다. `kind` 마다 소유하는 모양이 하나다.

> **`rotation` 이 없는 요소의 `expected` 는 `0` 이다.** 부모가 내려
> 보내는 geometry 가 그 요소의 각도를 0 으로 싣고(§19-9), 순수 함수도
> **같은 자로** 지금 값을 읽는다(`spec.readCurrent`). 이 한 줄이
> 없으면 "한 번도 돌린 적 없는 요소는 영영 돌릴 수 없다"가 된다 —
> `0 !== undefined` 라서 `expected` 검사가 언제나 어긋난다.

성공하면 한 요소의 `rotation` 한 칸만 불변 방식으로 바뀐다. element
id · type · `x` · `y` · `width` · `height` · hidden · locked · `props` ·
모르는 element 필드 · 다른 요소 · 배열 순서 · 다른 regions 항목 · 모르는
region/canvas 필드는 전부 보존된다. 입력 SkinPackage 를 제자리에서
고치지 않는다.

### 19-7. Undo · Redo

이동 · 리사이즈와 같다(§17-6 · §18-7). 한 번의 회전 제스처가 Undo 한
칸이고, 회전량 0 과 거부는 기록을 만들지 않는다. 기존 Studio history 를
그대로 쓴다.

- **`rotation` 칸이 새로 생긴 회전을 Undo 하면 그 칸이 없던 상태로
  정확히 돌아간다** — 기록이 draft 스냅샷을 참조로 들고 있기 때문이다.
- Undo · Redo 뒤에도 선택 ID 는 유지되고, 다시 그려진 DOM 에 Moveable
  target 과 손잡이들이 다시 붙는다.

### 19-8. 취소

§18-8 그대로다 — Escape · pointercancel · 프레임 교체 · HOME 이탈 ·
Select 종료 · 선택 변경 · 요소 삭제 · Canvas 비활성화 · **시작 값이
달라짐** · 부모 거부 · vendor/runtime 오류.

> 시작 값 비교는 이제 **다섯 칸을 모두** 본다(네 칸 + 각도). 이동 중에
> 각도가 달라졌다는 것도 "그 사이에 draft 가 바뀌었다"이다.

### 19-9. 메시지

```text
canvas-geometry   부모 -> 프레임
  { active, id?, x?, y?, width?, height?, rotation?,
    baseWidth?, baseHeight?, generation, answering? }
```

`rotation` 은 `active` 면 **반드시 있다** — 프레임은 시작 각도를 모르는
채로 회전을 시작할 수 없다. 요소에 그 칸이 없으면 부모가 `0` 을 싣는다.
단독 선택이 아닐 때는 `active:false` 로 내려가고 나머지 칸은 **아예
없다**(각도 칸까지).

sandbox 메시지 층의 검사: 알려진 키만 · `kind` 는 `move` · `resize` ·
`rotate` 세 이름 · id 형태 · 각도의 **유한성**(범위는 두지 않는다 —
`expected` 가 저장된 그 값 그대로 올라오므로 범위를 만들면 이미 저장된
큰 각도를 가진 요소를 영영 돌릴 수 없다) · origin · source ·
`renderSeq`.

native 와 sandbox 가 **같은 부모 확정 함수**를 쓴다. 2026-09-21 실측에서
같은 포인터 제스처의 최종 JSON 이 두 경로에서 **같은 숫자**였다
(`rotation` 40.203).

### 19-10. Moveable 의 누적 회전량 — 실측한 것을 쓴다

```text
최종 각도 = 시작 rotation(부모가 준 값) + e.dist
```

0.53.0 의 rotate payload 는 `{ delta, dist, rotate, beforeDist,
beforeDelta, beforeRotate, … }` 이고, 번들 안에서 `rotation = 시작각 +
dist` 로 만들어진다(실측). 그래서 우리가 쓰는 것은 **`dist` 하나**다.

- **CSS transform 문자열을 파싱해 지금 각도를 역산하지 않는다** — 그
  값은 우리가 쓴 칸에서 나온 것이고, 되돌려 읽으면 자릿수가 한 번 더
  버려진다.
- **축에 정렬된 바깥 상자로 각도를 계산하지 않는다** — 그 상자는
  회전을 지운 그림자다.
- **매 이벤트의 `delta` 를 직전 값에 더하지 않는다.** 언제나 시작값 +
  누적량이므로 이벤트 수와 무관하고 반올림이 쌓이지 않는다.
- **부모 Preview 의 `transform: scale()` 을 각도에 보정하지 않는다.**
  균등 배율은 길이만 바꾸고 각도는 바꾸지 않는다(도화지는 세로를
  가로에 묶어 두었으므로 축마다 다른 배율이 없다 — §12-2).
- `throttleRotate: 0` — 각도를 정수로 스냅하지 않는다.

2026-09-21 실측(Chromium, 12 걸음의 호): 화면 각도가 의도한 호를 **최대
0.3° 안에서** 따라왔고, 20° 에서 시작한 요소는 20° 에서 이어졌으며,
갔다가 되돌아오면 정확히 시작 각도였다.

**손가락으로는 돌리지 않는다.** 이동 · 리사이즈와 같은 이유이고 같은
판정 함수(`isCoarsePointerEvent`)를 쓴다(§17-2 · §18-12).

### 19-11. 손잡이의 hit area

§18-11 그대로다. control box 는 `pointer-events: none` 이고, 우리가
`auto` 를 되돌려 주는 것은 **잡는 것들**뿐이다 — 리사이즈 손잡이 여덟과
회전 손잡이 하나. 테두리 네 줄 · 회전 막대 · 그룹의 `.moveable-area` 는
그대로 꺼 둔다.

회전 손잡이는 control box 안에 있으므로 `inspectorEditChromeAncestor()`
가 이미 "내 입력이 아니다"로 읽는다(§18-11) — 손잡이를 눌러도 선택이
풀리지 않는다. Selecto 도 `isMoveableElement()` 로 control 에서 시작한
드래그를 거부하므로 회전 손잡이를 끌어도 lasso 가 시작되지 않는다.

> 0.53.0 의 회전 시작 판정(`Qi`)은 `rotation-control` class 또는
> `control` + `rotatable` class 를 본다. 우리 리사이즈 손잡이는
> `control direction <dir> resizable` 이라 회전이 시작되지 않고, 회전
> 손잡이에는 `data-direction` 이 **없어서** 리사이즈 손잡이 셈에도
> 섞이지 않는다(번들 실측).

### 19-12. 이번 단계에 **없는 것**

> **하나가 채워졌다 → §21-1(`HOME-CANVAS-MANUAL-UX-FIX-1`).**
> **30° 자석**이 그 라운드에서 들어왔다. 15° 스냅도, Shift 로 켜는
> 각도 스냅도 아니다 — 30° 배수와의 차이가 ±4° 안일 때만 붙는
> **상시 자석**이고, 그 밖에서는 자유 회전 그대로다.

그룹 이동 · 그룹 리사이즈 · 그룹 회전 · Shift 각도 스냅 · 15° 스냅 ·
가이드 · **사용자 지정 회전 중심점** · 키보드 회전 · Inspector 각도 입력
필드 · flip · 텍스트 직접 편집 · 이미지 교체 · Crop · 레이어 목록 ·
effect hook · preset · widget · 좌우 패널 Canvas · responsive
override · **손가락 조작** — 하나도 없다.

저자 CSS/JS 가 geometry 를 강제로 덮는 경우의 최종 우선순위는 여전히
`HOME-CANVAS-EFFECT-HOOK-1` 의 몫이다(§17-10).

---

## 20. 기본 조작 마일스톤 (`HOME-CANVAS-MILESTONE-1`)

**이 절은 계약을 바꾸지 않는다.** §1~§19 가 그대로 유효하고, 이 라운드는
제품 코드를 한 줄도 고치지 않았다. 여기 적는 것은 "그 계약을 **손으로**
확인할 수 있는 수단이 어디에 있는가" 하나다.

### 20-1. 왜 파일이 하나 더 필요했나

Studio 에는 아직 **Canvas 를 새로 만들거나 요소를 추가하는 UI 가 없다**
(로드맵 `ELEMENTS-1`). 구현된 쓰기 경로는 **이미 있는 요소**의 다섯 칸
(`x` · `y` · `width` · `height` · `rotation`)뿐이다. 그리고 §3 이 정한 대로
**기존 스킨 · 제품 기본 스킨 · 공개 HOME 에는 `home_canvas` 도 표시 위치
(`data-imory-canvas-root`)도 자동으로 생기지 않는다.**

두 사실을 합치면, 그 둘을 **이미 갖고 있는 SkinPackage 파일**이 없는 동안은
주인이 배포된 화면에서 이동 · 리사이즈 · 회전을 시험할 방법이 없다. 그래서
Import 용 파일 한 벌을 저장소에 두었다.

### 20-2. 그 파일

| 무엇 | 어디 |
| --- | --- |
| 수동 테스트 스킨 | [`skin/test-skins/imory-home-canvas-manual-v1.json`](../../skin/test-skins/imory-home-canvas-manual-v1.json) |
| 빌더 | [`skin/test-skins/build-home-canvas-manual-v1.mjs`](../../skin/test-skins/build-home-canvas-manual-v1.mjs) |

`node skin/test-skins/build-home-canvas-manual-v1.mjs` 로 **같은 JSON 이
다시 나온다** — JSON 을 손으로만 관리하지 않는다(저장소의 다른 test-skin 과
같은 규칙).

**이 파일은 제품 기본 스킨도 사용자용 preset 도 아니다.**

- `metadata.title` 이 `IMORY HOME CANVAS — manual test v1` 이다.
- 제품 기본 스킨(`imory-editorial-default-v2.json`)은 **바뀌지 않았다** —
  `home_canvas` 도 표시 위치도 여전히 없다.
- 가입 시 자동 적용 · 기존 계정 migration · 실제 계정 자동 Publish · DB 변경
  이 **하나도 없다.** 주인이 Studio 에서 직접 Import 해야만 쓰이고, Publish
  도 직접 해야 한다.
- `renderMode` 를 **갖지 않는다**(= native). sandbox parity 는 테스트가
  **사본에만** 모드를 켜서 확인한다 — 파일에 모드를 박으면 그 파일을 쓰는
  주인이 선택하지 않은 렌더 경로에 들어간다.

### 20-3. 무엇이 들어 있나 — 눈으로 구분되게

요소 **11개**이고, 각각 §7 의 여섯 종류와 §5 · §6 의 필드 규칙을 그대로
쓴다(계약에 없는 필드를 새로 만들지 않았다).

| 요소 | 무엇을 손으로 볼 수 있나 |
| --- | --- |
| `canvas_backdrop` | 도화지 전체를 덮는 **잠긴** 배경 — 그 위에서 lasso 가 시작되고(§17-2 에서 잠긴 요소는 배경이다) 클릭으로는 골라지지 않는다(§14-3) |
| `canvas_logo` | logo — 슬롯이 비면 블로그 제목이 글자로 나온다(§12-4) |
| `canvas_title` · `canvas_caption` | `height:"auto"` 글자 — 가로를 줄이면 줄이 늘고 높이가 따라온다. 세로 손잡이를 끌면 숫자로 바뀌고 Undo 하면 정확히 `"auto"` 로 돌아온다(§18-6) |
| `canvas_photo` | photo + **초기 회전 -4°** — `object-fit`(지금 `contain`, §21-3) 과 회전 요소의 리사이즈 기준점(§18-5) |
| `canvas_edge_mark` | **음수 `x`(-46)** — 도화지 왼쪽으로 삐져나간 장식. 넘친 것을 자를지 보일지는 스킨 CSS 의 몫이라(§4-1 · §12-2) 이 스킨은 보이게 둔다 |
| `canvas_sticker` | sticker + **초기 회전 16°** — photo 와 **겹친다**(겹친 자리에서 앞의 것이 골라지는가) |
| `canvas_note_panel` · `canvas_note_text` | 숫자 height 도형과 글자 — 서로 겹쳐 **배열 순서 = 앞뒤 순서**(§4)를 눈으로 본다 |
| `canvas_rule` | `kind:"line"` 도형 — 아주 얇은 것도 고를 수 있는가 |
| `canvas_nav` | `category_nav`(mode `all`) — 실제 `<a href>` 가 나오고 클릭이 기존 공통 라우팅으로 간다(§12-4) |

초기 회전이 있는 요소가 **셋**(-4° · 16° · 30°)이다 — 회전 요소의 리사이즈
기준점은 하나만으로는 확인이 부족하다.

### 20-4. 이미지 — 저장소에 그림을 넣지 않았다

photo · sticker · logo 는 **기존 이미지 슬롯 계약만** 선언하고 비워 둔다
(`photo_main` · `sticker_1` · `title_logo` — 이름 규칙은 §7 의
`SKIN_IMAGE_SLOT_NAME_PATTERN`, **snake_case 소문자**다). `required` 는 전부
`false` 다.

- 주인이 Studio Images 에서 자기 그림을 넣는다.
- **비어 있어도** wrapper 가 남으므로(§12-4) 선택 · 이동 · 리사이즈 · 회전을
  전부 확인할 수 있다.
- 자동 테스트가 쓰는 SVG 는 **실행 중에만** 만들고 JSON 에 넣지 않는다.

> **함정.** 슬롯 값에 `http://localhost:PORT/...` 같은 절대 주소를 넣으면
> 이미지가 **붙지 않는다.** `isSafeSkinUrl()`(`skin/skin-sanitize.js` —
> sanitizer 와 런타임 URL 바인딩의 단일 판정 함수)은 최종 protocol 이
> `https:` 인 것만 통과시키고, 막히면 계약대로 wrapper 는 남고 `src` 만
> 붙지 않는다(§12-4). 테스트는 **루트 상대 주소**를 쓴다 — 판정용 base 가
> https 라서 통과하고 실제 문서에서는 그 파일로 풀린다.

### 20-5. 통합 smoke

[`studio/studio-home-canvas-manual-skin-e2e-test.mjs`](../../studio/studio-home-canvas-manual-skin-e2e-test.mjs)
(포트 9002 · 9003, 배포되는 `functions/_middleware.js` 를 그대로 태운다).

**대상이 합성 fixture 가 아니라 저장소의 그 JSON 파일이다** — builder 가
만든 것을 테스트가 다시 손으로 조립하면 파일이 깨져도 테스트는 통과한다.
사용자가 고를 그 바이트가 Import 를 지나는지가 이 라운드의 산출물이다.

한 흐름을 끝까지 지난다: Import → Validate → Apply to Draft → 렌더 →
Select → 단일 선택 → 이동 · 리사이즈 · 회전 + 각각 Undo/Redo → lasso ·
Shift 다중 선택(다중에는 손잡이가 **없다**) → Save → 다시 열기 → Export →
재Import → Publish resolve → sandbox parity → 공개 화면 안전.

브라우저 없이 되는 계약 검사는 `skin/skin-home-canvas-test.mjs` 의
`[manual]` 절이 갖는다(계약 통과 · 표식 정확히 1개 · resolve · id 유일 ·
순서 보존 · 확인할 구조가 다 있는가 · **제품 기본 스킨 불변**).

### 20-6. WebKit 에서 무엇이 돌고 무엇이 안 도나

이 파일은 `--browser=webkit` 을 받지만 **포인터 조작 절은 Chromium 에서만**
돈다 — Moveable · Selecto 제스처를 재는 형제 e2e 여섯이 모두 그렇다
(`select` · `moveable` · `selecto` · `transform` · `resize` · `rotate`).
WebKit 에서는 그 절들을 건너뛴다고 찍는다.

WebKit 에서도 도는 것: Import · 렌더 · 이미지 슬롯 · Select 모드와 단일
선택 · 저장 왕복 · sandbox 정적 parity · 공개 화면 안전.

> **함정.** `[round]` 를 WebKit 에서 제스처 없이 돌리면 **Save 버튼이
> disabled 다** — 바뀐 것이 없으니 그게 맞는 동작이다. 그래서 그 절은
> 부모의 확정 함수 `commitStudioCanvasElementTransform()` 를 직접 불러
> 변경을 만든다. 프레임이 요청을 올렸을 때 부모가 지나는 **그 경로
> 그대로**이고(선택 · 순번 · `expected` · 허용 키를 다시 보는 관문 포함)
> 빠지는 것은 포인터 입력뿐이라, 두 브라우저가 "바뀐 좌표가 Save ·
> Export · Publish 를 지나 살아남는가"를 같은 무게로 묻는다.

### 20-7. 이 라운드가 만들지 않은 것

Canvas 생성 UI · 요소 추가 · 삭제 UI · preset 선택 UI · 그룹 조작
(`TRANSFORM-1D`) · 효과 hook(`EFFECT-HOOK-1`) · 저자 JS 변경 · Inspector
geometry 입력 필드 · 레이어 패널 · 이미지 Crop 연결 · 텍스트 직접 편집 ·
responsive override · 손가락 조작 · 기본 스킨 자동 변경 · 기존 계정
migration · 실제 계정 자동 Publish · DB migration · **계약 확장** —
하나도 없다.

---

## 21. 직접 조작 사용성 넷 (`HOME-CANVAS-MANUAL-UX-FIX-1`)

`MILESTONE-1`(§20)의 수동 테스트에서 주인이 찾은 것 넷을 고친 라운드다.
**새 데이터 칸 · 새 메시지 · 새 파일은 없다** — 고친 것은 제스처의 뜻,
이미지의 기본값, 편집 chrome 의 표시 범위뿐이다.

`canvas.version:2` · Canvas Inspector 입력 필드 · 새 요소 추가 UI ·
그룹 조작 · Crop UI · Effect Hook 은 이 라운드에 **없다**(§21-5).

| 파일 | 이 라운드에서 하는 일 |
| --- | --- |
| `skin/skin-home-canvas-editor-runtime.js` | `snapCanvasRotation()` · `canvasResizeKeepRatioBox()` **두 순수 함수를 module 밖으로 내보낸다**(§21-1 · §21-2) · `beforeResize` 핸들러 하나 · `canvasEditChromePadding()` 과 그것을 Moveable 에 주는 곳(§21-4) |
| `skin/skin-home-canvas-render.css` | `[data-imory-canvas-image]` 의 `object-fit` 이 `cover` → `contain`(§21-3). **이 파일에서 바뀐 것은 그 한 줄이다** |

렌더러 · 순수 수정 함수(`skin/skin-home-canvas.js`) · 부모 확정
(`studio/inspector/studio-canvas-selection.js`) · 메시지 층
(`skin/sandbox/*`) · 도화지 계약은 **한 글자도 바뀌지 않았다**. 그래서
native 와 sandbox 가 자동으로 같다 — 두 프레임이 같은 runtime 파일 한 벌을
받기 때문이다(§15-3).

### 21-1. 회전 — 30° 자석

**양자화가 아니다.** 가장 가까운 30° 배수와의 차이가 **±4° 이내일 때만**
그 각도에 붙고, 그 밖에서는 기존처럼 자유 회전이다.

```text
snapped = Math.round(deg / 30) * 30
결과    = |deg - snapped| <= 4 ? snapped : deg
```

| 입력 | 결과 | 왜 |
| --- | --- | --- |
| 25° | 25° | 30° 와 5° 차 — 범위 밖 |
| 26° | 30° | 4° 차 — **경계는 포함** |
| 34° | 30° | 4° 차 |
| 35° | 35° | 5° 차 |
| 56° | 60° | 0 · 30 만이 아니다 |
| 86° | 90° | |
| 356° | 360° → 저장 **0°** | 접는 것은 그 뒤다 |
| -26° | -30° | 음수도 같은 식이다 |
| 380° | 380° | 390° 까지 10° — 자유 |

- 판정은 **접기 전의 연속 각도**에 건다. 그래서 356° 는 360° 로 붙고
  접히면서 0° 가 되며(§19-3), 350° 에서 조금 더 돌린 385° 는 자유
  회전 그대로다. 어느 쪽도 화면이 반대로 튀지 않는다 — **붙는 양이
  최대 4°** 이기 때문이다.
- 그 함수는 **단조 비감소**다. 그래서 제스처 중 화면 각도가 거꾸로
  가지 않고, 30° 배수 근처에서 여러 걸음이 **같은 각도에 머무는
  평탄한 구간**이 생긴다(브라우저 없는 단위 테스트가 -400°~400° 를
  0.25° 간격으로 찍는다).
- **제스처 중에도 보정된 각도를 보여 준다.** 화면과 확정값이 같은
  보정을 쓰지 않으면 손을 놓는 순간 그림이 튄다.
- **확정 JSON 에는 보정된 정확한 각도**가 들어간다. 자릿수와 한 바퀴의
  표현을 정하는 곳은 그대로 `normalizeCanvasRotation()` 하나다(§19-3).
- 한 회전 제스처는 그대로 **Undo 한 칸**이고, 선택 · 이동 · 리사이즈는
  `rotation` 을 새로 만들지도 정규화하지도 않는다(§19-2 · §19-6).

> **★ "돌지 않았다"는 자석이 붙기 전의 날것으로 판정한다.**
>
> 보정된 값으로 보면, 저장된 31° 요소의 손잡이를 **누르기만 해도**
> 화면이 30° 로 슬쩍 움직이고 손을 놓는 순간 그것이 확정된다 —
> "고르기만 해도 각도가 바뀐다"가 된다. 그래서 회전량 0 인 판에서는
> 자석을 아예 걸지 않고, 확정 여부도 `rawRot === baseRot` 로 본다.

> **★ 자석이 제자리로 되돌린 제스처도 확정하지 않는다.**
>
> 30° 요소를 32° 까지 돌리면 자석이 30° 로 붙이므로 확정 값이 시작
> 값과 같다. 그대로 보내면 **아무것도 바뀌지 않은 Undo 한 칸**이
> 생긴다. 그래서 `nextRot === baseRot` 도 "돌지 않았다"로 읽는다.

### 21-2. 리사이즈 — 모서리는 비율 유지, 변 중앙은 자유

| 손잡이 | 뜻 |
| --- | --- |
| `nw` · `ne` · `se` · `sw` | 제스처 **시작 시점의 가로 : 실제 세로** 비율 유지 |
| `n` · `e` · `s` · `w` | 기존처럼 한 축만 자유 조정 |

- Shift 로 켜고 끄는 것이 **아니다** — 손잡이 자체의 뜻이다. Shift ·
  Alt · flip 은 그대로 없다(§18-13).
- 회전한 요소에서도 반대편 기준점이 밀리지 않는다(20° · 45° 실측
  0.84px 안).
- 최소 크기 1 · 상한 · 자릿수 · 보존 범위 · Undo 한 칸 · 취소 ·
  요청 번호는 §18 그대로다.
- 부모 Preview 의 `scale()` 을 다시 보정하지 않는다(§18-10).
- 시작값 + 누적 변화 규칙도 그대로라 반복 조작에 오차가 쌓이지 않는다
  (네 모서리를 이어 끌어도 비율 오차가 0.01 안).

**끄는 축은 하나가 아니라 정사영이다.**

```text
k   = (dw·ratioW + dh·ratioH) / (ratioW² + ratioH²)
dw' = k · ratioW
dh' = k · ratioH
```

`ratioW` · `ratioH` 는 **Canvas 좌표의 시작 가로와 실제 세로**다. 한 축을
고르는 방식은 둘 다 나쁘다.

- 언제나 가로(0.53.0 의 `keepRatio` 가 모서리에서 그렇게 한다 —
  `isWidth` 가 참이다): `se` 손잡이를 **아래로만** 끌면 아무 일도
  일어나지 않는다.
- 상대 변화가 큰 축: 납작한 글자 상자(120×21)를 대각선으로 30px 끌면
  세로가 이겨 **가로가 171px 튄다.** 두 축이 비기는 자리에서 결과가
  끊기기도 한다.

정사영은 끊긴 자리가 없고 손이 간 방향을 따라간다(위 120×21 에 (30,30)
이면 가로 +34.2 · 세로 +6.0).

> **★ `keepRatio` prop 을 쓰지 않는다 — `beforeResize` 에서 `setSize()`
> 로 짝을 다시 정한다.**
>
> 0.53.0 의 `dragControl` 은 크기를 정한 **뒤**, `dist` 와
> `drag.beforeTranslate` 를 만들기 **전**에 `beforeResize` 를 쏜다
> (번들 실측: `at()` → `onBeforeResize` → bounds/min/max →
> `dist = U - startOffsetWidth` → `kr()` → `drag`). 그래서 거기서
> 크기를 고치면 그 뒤의 **모든 것이 우리가 정한 크기에서 나온다** —
> 삼각함수를 새로 적지 않아도 회전한 요소의 반대편 기준점이 유지된다
> (§18-4 의 그 성질을 그대로 쓴다).
>
> `keepRatio` prop 을 쓰지 않는 이유는 셋이다.
>
> 1. 그 prop 의 setter 는 vanilla 래퍼에서 **setTimeout 으로
>    미뤄진다**(§15-6 의 `draggable` 함정과 같은 사정). 제스처가
>    시작된 뒤에 켜면 첫 몇 프레임이 자유 비율로 돈다.
> 2. 그 prop 의 기준은 `state.width / state.height` 라 저자 CSS 의
>    border · padding 과 `height:"auto"` 의 소수점이 섞인다. 우리가
>    지켜야 하는 것은 **저장되는 네 칸의** 비율이다.
> 3. 모서리에서 가로만 보게 된다(위 `isWidth`).

> **★ 비율을 지켜야 하는 것은 px 상자가 아니라 `dist` 다.**
>
> 우리가 저장하는 값은 `시작값 + dist / 배율` 이므로(§18-4), 지켜야
> 하는 것은 `dist[1] / dist[0] = ratioH / ratioW` 다. px 상자의 비율로
> 맞추면 `offsetWidth` 에 섞인 border · padding 과 `"auto"` 세로의
> 소수점이 답을 흔든다. `dist` 로 맞추면 시작 px 가 `U - startW` 에만
> 들어가 **양쪽에서 상쇄된다**.

#### `height:"auto"` 요소

| 손잡이 | 결과 |
| --- | --- |
| `e` · `w` | 그대로 **`"auto"` 유지**(비율도 지키지 않는다) |
| `n` · `s` | 실제 세로가 바뀌면 숫자 height 로 전환 |
| 네 모서리 | **시작 시점의 렌더된 실제 높이**를 기준으로 비율을 잡고 숫자 height 로 전환 |

- 그 "렌더된 실제 높이"는 §18-3 이 쓰는 그 값이다(computed `height` ÷
  배율 — `getBoundingClientRect()` 가 아니다).
- 단순 클릭 · 변화량 0 에서는 `"auto"` 를 유지한다.
- Undo 하면 정확히 `"auto"` 로 돌아온다(§18-7).

### 21-3. 이미지 — Crop 을 고르지 않았으면 자르지 않는다

```css
[data-imory-canvas-image] { object-fit: contain; }
```

- 명시적인 Crop 정보가 **없는** 이미지: 전체가 보이는 `contain`.
- 명시적인 Crop 정보가 실제로 **있는** 이미지: 기존 Crop 결과를 존중.
- 이미지 비율과 틀 비율이 다르면 빈 자리가 생기고, **그 자리를 임의의
  배경색으로 채우지 않는다** — 칠은 스킨 CSS 의 몫이다(§8).
- `logo` · `sticker` 도 기본적으로 전체가 보인다. PNG 로고 · 스티커가
  프레임 때문에 잘리던 것이 이 한 줄이었다.
- 이미지 자체를 늘여 비틀지 않는다(`contain` 은 비율을 지킨다).
- `photo` 의 슬롯 연결과 `alt` 처리는 그대로다(§12-4).

> **★ 조사 결과 — 지금 Canvas payload 에는 Crop 정보가 없다.**
>
> `photo` · `sticker` 의 props 는 `slot` 하나, `logo` 는 `slot` +
> `fallback` 뿐이다(§7 · `validateSkinCanvasProps`). "주인이 자르기를
> 골랐다"를 나타낼 칸이 **하나도 없고**, 렌더러도
> `object-position` 도 crop frame 도 쓰지 않는다(§12-4). 그래서 이
> 단계에서 `contain` 을 **기본값으로 확정**했고, Crop 연결은 남은
> 차이에 적었다(§11-3). 그 칸이 생기면 **그 요소만** `cover` ·
> `object-position` · crop frame 으로 갈라진다.

> **범위는 Canvas 렌더러가 만든 `img` 하나다.** 그 선택자
> (`[data-imory-canvas-image]`)는 렌더러가 직접 붙이는 속성이므로
> (`buildSkinCanvasImage`), 다른 화면의 이미지 · 기존 스킨의 이미지
> 표현 · `IMAGE-CROP-PRIORITY-1` 의 자르기 보호 규칙은 한 줄도 바뀌지
> 않는다. 네 화면 parity 가 이 값까지 대조하므로, 한 화면만 `cover` 로
> 돌아가면 그 자리에서 잡힌다.

### 21-4. 텍스트 선택 틀 — 글자를 가로지르지 않는다

숫자 height 가 실제 글자 내용보다 작거나 줄바꿈으로 내용이 늘면 선택선과
손잡이가 글자 안쪽을 가로질렀다. 그 자리를 네 가지로 갈랐다.

| | 무엇 | 어디에 |
| --- | --- | --- |
| 1 | **저장되는 Canvas 상자** | JSON 의 `x` · `y` · `width` · `height` |
| 2 | **실제 보이는 content bounds** | 요소의 자식(`p` · `ul` · `span`)의 offset 상자 |
| 3 | **편집 chrome 이 표시할 bounds** | 1 ∪ 2 + 여유 — **Moveable 에만 준다** |
| 4 | **resize 확정에 쓰는 원래 geometry** | = 1 (Moveable 의 `pos1~pos4` · `state.width/height` · `getRect()`) |

Moveable 에 주는 것은 **3 뿐**이고, 그 창구는 0.53.0 의 공식 `padding`
prop 이다.

> **★ `padding` 은 renderPoses 만 밀고 pos 는 건드리지 않는다.**
>
> `updateRenderPoses()` 는 `padding` 이 있으면 요소의 **로컬 축 방향**
> 으로 `renderPoses` 와 `renderLines` 를 밀어 낸다 — `pos1`~`pos4` ·
> `state.width` · `state.height` 는 한 글자도 바뀌지 않는다(번들 실측).
> 손잡이도 그 `renderPoses` 위에 놓이고(`Vr()`), 회전 손잡이도 같다
> (`Ji()`). 그래서 **저장 좌표 계산에 섞일 길이 없다** — `dist` ·
> `startRatio` · `drag.beforeTranslate` · `getRect()` 는 전부 pos 와
> state 에서 나온다.
>
> 그 결과가 계약이다: 고르기만 해도 JSON 이 불변이고(저장값에
> 4~6px 를 더하지 않는다), 여유를 넓혀도 이동 · 리사이즈의 변환량이
> 달라지지 않는다. `getRect().offsetWidth/offsetHeight` 는 여유가
> 없는 요소 상자 그대로다.

**여유를 받는 요소.** 글자를 **직접** 보여 주는 것뿐이다 — `text` ·
`category_nav` · `logo` 의 대체 글자. 사진 · 스티커 · 도형에서는 틀과 딱
붙은 테두리가 오히려 맞다(그것이 그 요소의 실제 경계다). 프레임은 JSON
type 을 모르므로 **렌더러가 붙인 표식**으로 가른다
(`[data-imory-canvas-text]` · `[data-imory-canvas-nav]` ·
`[data-imory-canvas-logo-text]`).

**여유의 크기.**

```text
padding.<side> = 5 + max(0, 그 방향으로 내용이 넘친 양)
```

- 내용이 상자 안에 들어오는 요소(`height:"auto"` · 내용보다 큰 숫자
  height)는 사방 **5px** 이다.
- 내용이 넘치는 요소는 넘친 쪽만 그만큼 더 밀린다(실측: 숫자 height
  10 에 세 줄 → 아래 43px).
- 상자가 내용보다 **큰** 쪽은 그대로 상자를 따라간다 — 내용에 맞춰
  줄이면 보이는 것과 저장값이 달라진다.
- 단위는 **요소 자기 좌표계의 px** 다. 도화지 자신에 배율이 걸리면
  화면에서는 그만큼 함께 줄고 늘어난다.
- 여럿을 고르면 여유가 **없다**(그룹 틀에는 손잡이도 없다 — §18-1).

**재는 자는 `offsetLeft/Top/Width/Height` 다.**
`getBoundingClientRect()` 를 쓰지 않는다 — 회전한 요소에서 그것은 축에
정렬된 바깥 상자이고, 우리가 필요한 것은 요소 **자기 축**의 넘침이다
(§18-3 의 그 이유 그대로다).

**다시 재는 때.** 따라가기 루프(rAF)의 지문에 이 값이 들어 있다
(`signatureOf`). 그래서 줄바꿈 · 글꼴 교체 · 늦게 온 이미지로 **상자는
그대로인데 내용만** 커져도 그 프레임에서 다시 잰다 — 바깥 상자만 보면
그때 여유가 옛 값에 머물러 선이 글자를 가로지른다.

**이름표.** Studio native 의 선택 이름표는 요소 bounding box **위쪽
바깥**에 붙으므로(`paintStudioCanvasSelectLabel`) 본문을 덮지 않는다 —
실측에서 여유 5px 보다 1px 더 위였다. 위에 자리가 없을 때 안쪽으로
붙는 기존 fallback 규칙은 모든 요소가 공유하는 것이라 이 라운드에서
바꾸지 않았다. 회전 손잡이는 `padding` 이 함께 밀어 내므로 본문과
겹치지 않는다(실측 `overlaps: false`).

### 21-5. 이 라운드가 만들지 않은 것

Canvas 왼쪽 Inspector 입력 필드(→ `HOME-CANVAS-INSPECTOR-1A`) · 텍스트
내용 · 폰트 · 정렬 · 색 편집 UI · `canvas.version:2`(→ 로드맵 §14 의
**PLAN**) · 자동 배치 flow · `main_visual` · 메인 비주얼로 묶기/해제 ·
그룹 이동 · 그룹 리사이즈 · 그룹 회전 · 새 Crop UI · 이미지 업로드 흐름
변경 · 모바일 touch 조작 · Effect Hook · preset · widget · 좌우 패널
Canvas — **하나도 없다**.

> **Canvas 요소를 눌렀을 때 왼쪽 패널이 비어 있는 것은 그대로다.**
> 그것은 `HOME-CANVAS-INSPECTOR-1A` 의 몫이고(로드맵 §14-15), 이
> 라운드에 임시 입력창을 붙이지 않았다.

> **★ 그 자리는 `HOME-CANVAS-INSPECTOR-1A` 가 채웠다 — §22.**

---

## 22. 왼쪽 Canvas Inspector (`HOME-CANVAS-INSPECTOR-1A`)

Canvas 요소를 고르면 왼쪽 패널이 **그 요소의 화면**이 된다. 그 전까지는
선택 상태만 있고 표시할 화면이 없어서 "Preview에서 고칠 요소를 누르세요"
만 보였다(§21-5).

**이 라운드가 연 것**

- 타입마다 다른 단일 선택 화면(여섯 종류 전부)
- 글자 요소의 **실제 내용** — v1 에서 `props` 가 바뀌는 **첫 경로**
- 공통 geometry 다섯 칸의 숫자 입력과 `Auto` 높이 스위치
- 다중 선택에서의 **안내 한 줄**

**이 라운드가 열지 않은 것** — §22-7.

### 22-1. 선택 소유권 — 같은 자리, 두 화면, 절대 동시에 아님

왼쪽 패널의 Select 자리(`#studioLeftPanelSelect`)에 이제 둘이 산다.

| 선택 상태 | 왼쪽 패널 |
| --- | --- |
| template 요소 1개 | 기존 Inspector 팝오버(`#studioInspectorPopover`) |
| Canvas 요소 1개 | **새 Canvas 패널**(`#studioCanvasInspector`) |
| Canvas 요소 2개 이상 | 개수 + "여러 요소 편집은 아직 지원하지 않습니다" |
| 아무것도 없음 | 기존 안내 문구 |
| 빈 곳 클릭 | 둘 다 닫히고 안내 |
| Select 모드 종료 | Canvas 패널도 닫힌다 |
| HOME 이 아님 · 유효하지 않은 Canvas · 미래 `version` | Canvas 패널 없음 |

★ **소유권을 정하는 곳은 늘지 않았다.** 둘이 동시에 켜지지 않는 것은
`SELECT-1A` 가 이미 세운 선택 라우터가 지킨다(§14-1 —
`routeStudioInspectSelectMessage` · `setStudioInspectorSelection`).
Canvas 패널은 그 **결과를 읽어서 그릴 뿐** 누가 주인인지 다시 판단하지
않는다.

★ **세 번째 상태 저장소를 만들지 않았다.** 패널이 값을 들고 있지 않고,
그릴 때마다 `getStudioCanvasSelection()` 과 지금 draft 에서 다시 읽는다.
Canvas 요소를 `applyStudioInspectorPatch()`(HTML/CSS 전용)에 억지로
넣지도 않는다 — §14-6 의 그 이유 그대로다.

★ **기존 template Inspector 는 한 줄도 바뀌지 않았다.** 패널 DOM 은
안내 문구 **앞**에 들어가고, 안내를 물리는 CSS 규칙만 팝오버와 같은
모양으로 하나 늘었다(`studio/studio-shell.css`).

### 22-2. 무엇을 고칠 수 있나 — 타입별

공통(모든 타입): **X · Y · Width · Height · Rotation** — §22-3.

| type | 그 타입만의 칸 |
| --- | --- |
| `text` | **`props.text`** 여러 줄 입력(편집 가능) · `role` 읽기 전용 |
| `photo` · `sticker` | `slot` 이름 읽기 전용 + "이미지는 Images에서 변경합니다" |
| `logo` | `slot` · `fallback`(= 블로그 제목) 읽기 전용 + 같은 안내 |
| `category_nav` | `mode` 와 카테고리 **개수** 읽기 전용 |
| `shape` | `kind`(`rect`/`ellipse`/`line`) 읽기 전용 |

**글자는 평문이다.**

- 입력은 plain text이고 `<`, `>`, `&` 가 HTML 로 실행되지 않는다 —
  렌더러가 `textContent` 로 그리기 때문이다(§12-4). 패널은 HTML
  편집기를 만들지 않는다.
- 줄바꿈은 문자열 그대로 남고, 화면에서는 플랫폼 CSS 의 `white-space`
  가 살린다.
- 길이 규칙은 검증기가 이미 가진 그것 하나다 — **2000자 이하**(§7).
  입력칸 자체가 `maxlength` 로 멈추고, 넘는 요청은 `reason:"length"`
  로 거부된다.
- **빈 문자열도 유효하다.** 계약에 최소 길이가 없다(§7) — 패널이 새
  규칙을 만들지 않는다.

**편집할 수 있는 칸이 없는 타입에는 억지 입력창을 만들지 않았다.**
이미지 교체는 Images 패널이 갖고(업로드 · Crop · slot picker 를 이
패널에 복제하지 않는다), 색 · 테두리 · 그림자 · 글꼴은 **스킨 CSS** 가
갖는다(§8). `category_nav` 의 카테고리 고르기 · 순서 UI 도 만들지
않았다.

### 22-3. Geometry 다섯 칸

표시 단위는 **Canvas 좌표 px**(390 자 기준 — §4).

| 칸 | 규칙 | 어느 `kind` 로 쓰나 |
| --- | --- | --- |
| X · Y | 음수 허용. ±100000 안의 유한한 숫자 | `move` |
| Width | 0 초과 100000 이하 | `resize` |
| Height | 같은 규칙. 허용 타입에서는 `Auto` | `resize` |
| Rotation | 유한한 숫자 → 한 바퀴 안으로 접힌다 | `rotate` |

- 범위 규칙을 새로 만들지 않았다 — Import 검증기와 순수 writer 가 쓰는
  그 함수들이다(`isSkinHomeCanvasCoord` · `isSkinHomeCanvasSize`).
- `Auto` 스위치는 계약이 허용하는 타입에만 나온다(`text` ·
  `category_nav` — §6). 켜면 `height:"auto"`, 끄면 **지금 화면에 그려진**
  높이를 Canvas 좌표로 되돌려 숫자로 굳힌다. 둘 다 `resize` 확정 한
  번이다. 허용되지 않는 타입에 `"auto"` 를 넣는 요청은
  `reason:"auto"` 로 거부된다.
- `Auto` 가 켜져 있는 동안 Height 숫자 칸은 **잠긴다**. 그 상태의
  표시값은 빈 문자열이라(§6 의 `"auto"`), 잠그지 않으면 칸에 들어갔다
  나오기만 해도 "값을 입력하세요" 가 뜬다.
- 잘못된 입력은 **draft 를 일부만 고치지 않는다.** 빈 문자열 · `NaN` ·
  `Infinity` · 범위 밖은 전부 거부되고, 오류가 그 칸 바로 아래에
  한 줄로 적힌다. **빈 문자열을 0 으로 저장하지 않는다.**

> **★ 숫자로 Width 만 바꾸는 것은 "모서리 리사이즈" 가 아니다.**
>
> 손잡이의 모서리 넷은 비율을 지킨다(§21-2). 그러나 왼쪽 패널에서
> Width 한 칸에 숫자를 넣는 것은 **그 칸 하나를 지정하는 것**이므로
> Height 를 따라 움직이지 않는다. 두 동작을 같은 규칙으로 묶으면,
> "가로만 140 으로" 라고 적은 사람이 세로가 달라진 상자를 받는다.
>
> `resize` 는 네 칸이 한 요청이므로(§18-6) x · y · height 도 함께
> 실리지만, **값이 지금과 같을 뿐**이다.

**Rotation 의 표현.** 입력값은 한 바퀴 안으로 접히고 소수 셋째 자리까지
반올림된다(`400 → 40` · `-30 → 330`). 손으로 돌린 결과와 **같은 자**를
쓴다 — 그 규칙 하나는 이 라운드에서 `skin/skin-home-canvas.js` 의
`normalizeSkinHomeCanvasRotation()` 으로 올라왔고, 프레임 runtime 의
`normalizeCanvasRotation()` 은 이제 그것을 부르기만 한다(§19-3).
세 realm(부모 · native 프레임 · sandbox 프레임)이 전부 그 파일을 classic
script 로 이미 읽으므로 한 벌이면 충분하다.

★ 검증기는 여전히 접지 않는다. 계약이 `rotation` 에 요구하는 것은
"유한한 숫자" 하나이고(§5), 이미 저장된 `-30` · `400` 은 그대로 남는다.
접히는 것은 **새로 확정되는 값** 하나뿐이다.

### 22-4. 한 번의 편집 = Undo 한 칸

| 입력 | 언제 draft 가 바뀌나 | 언제 기록이 생기나 |
| --- | --- | --- |
| 글자 | **입력할 때마다** | focus → blur **한 세션에 한 칸** |
| 숫자 | Enter · blur 에서 한 번 | 그 한 번이 곧 한 칸 |

**글자**

- 입력마다 draft 를 고친다. 그래야 Preview 가 즉시 따라오고, **입력
  중에 Save 를 눌러도 최신 값이 실린다**.
- 그러나 한 글자에 한 칸씩 쌓이면 ↶ 를 스무 번 눌러야 한 문장이
  돌아간다. 그래서 그 경로만 기록을 끄고(`coalesceHistory`), 세션을
  여는 쪽이 focus 에서 `captureStudioHistoryState()` 를 잡고 blur 에서
  `recordStudioHistory()` 로 **한 칸**을 남긴다.
- **Escape** 는 focus 시작 문구로 되돌리고 기록을 남기지 않는다.
- 시작값과 같으면(한 글자도 안 바뀌었으면) 기록 **0 칸**이다.
- 선택이 다른 요소로 넘어가거나 사라지면 열려 있던 세션도 그 자리에서
  닫힌다 — 그때까지의 변화만큼 한 칸이다.

> **★ 이 textarea 는 부모 문서에 있다.**
>
> 기존 template 텍스트 편집은 "적용/취소" 두 버튼으로 나뉘어 있다 —
> 고치는 대상이 **프레임 안 요소**라 한 글자마다 스킨을 다시 그리면
> 그 안의 입력칸이 새로 만들어지고 한글 조합이 끊기기 때문이다
> (`studio/inspector/studio-inspector-text.js` 머리말).
>
> Canvas 패널의 입력칸은 **왼쪽 패널**에 있다. Preview 를 몇 번을 다시
> 그려도 이 칸은 다시 만들어지지 않으므로 조합이 끊기지 않는다. 그래서
> 임시 채널도 적용 버튼도 필요 없다.

**숫자**

- 입력 중에는 아무것도 쓰지 않는다. `-` · `.` · 빈 문자열처럼 아직
  숫자가 아닌 **중간 상태를 JSON 에 넣지 않는다.**
- Enter 또는 blur 에서 한 번 확정하고, Escape 로 취소한다.
- 변화량 0 이면 기록 **0 칸**이다(같은 값을 다시 넣는 것 포함).

### 22-5. 쓰기 경로 — 관문 하나, 입구 둘

패널이 draft 를 직접 만지는 줄은 **없다.** 모든 수정이 프레임의 직접
조작이 쓰는 그 관문 한 벌을 그대로 지난다.

```text
왼쪽 패널 입력칸
  → commitStudioCanvasInspectorEdit()      ─┐
프레임 제스처(preview:canvas-transform)      ├→ commitStudioCanvasElementChange()
  → commitStudioCanvasElementTransform()   ─┘   (선택 · 순번 · hidden/locked ·
                                                 허용 키 · expected · 범위)
                                              → setStudioCanvasElement*()
                                              → writeSkinHomeCanvasElement*()  (순수)
```

★ **두 입구의 권한이 다르다.**

| 입구 | 쓸 수 있는 `kind` | `coalesce` |
| --- | --- | --- |
| 프레임(`commitStudioCanvasElementTransform`) | `move` · `resize` · `rotate` | 불가 |
| 왼쪽 패널(`commitStudioCanvasInspectorEdit`) | + `text` | `text` 에서만 |

프레임 안에서는 스킨 저자의 JS 가 돈다(§15-7-1). 그 길로 들어올 수
있는 것은 처음부터 **손으로 끈 결과**가 소유한 세 kind 뿐이다. 글자
내용은 프레임이 닿을 수 없는 자리(부모 realm 의 입력칸)에서만 바뀐다.
`coalesce` 도 패널 전용이다 — "한 제스처 = Undo 한 칸"(§17-6)을 프레임이
끌 수 있게 두지 않는다.

★ **불변 수정도 한 곳이다.** `writeSkinHomeCanvasElementText()` 는 위
셋과 같은 `writeSkinHomeCanvasElementFields()` 를 쓰고, 다른 것은
`container: "props"` 한 줄뿐이다. 그래서 보존 범위가 갈라지지 않는다.

**한 번의 확정이 보존하는 것** (글자 기준)

- `props` 의 다른 칸(`role` · **모르는 칸**)
- 요소의 다른 칸(`x` · `y` · `width` · `height` · `rotation` ·
  `hidden` · `locked` · **모르는 칸**)
- `canvas` 의 모르는 칸 · `regions` 항목의 모르는 칸 · `regions` 의
  다른 항목 · 다른 요소 · **배열 순서**
- 입력 객체 non-mutation(Undo 가 들고 있는 직전 스냅샷이 바뀌지 않는다)

**미래 version 은 손대지 않는다.** `canvas.version: 2` 에서는
`resolveSkinHomeCanvas()` 가 payload 를 만들지 않으므로 고를 요소가
없고, 따라서 패널도 열리지 않는다(§9-(3)). 그 데이터는 그대로 보존된다.

### 22-6. 다시 그리는 때 — 신호 하나

패널이 낡는 자리는 선택 변경만이 아니다. 드래그 · 리사이즈 · 회전 ·
Undo/Redo · Import/Apply · draft 재로드 · 요소 삭제는 **선택은 그대로인
채 값만** 바꾼다.

그래서 알림은 `studio-canvas-panel` 이벤트 하나이고, 두 자리에서 나간다
(`notifyStudioCanvasPanel`).

| 어디 | 무엇이 지나가나 |
| --- | --- |
| `applyStudioCanvasSelection()` | 선택 확정 · 해제 |
| `syncStudioCanvasFrameMode()` | 편집 모드 변경 · `reconcileStudioCanvasSelection()` (= draft 변경 관문 `bumpStudioWorkingRevision`) · Select 토글 |

- 이벤트는 값을 싣지 않는다. 받는 쪽이 선택과 draft 를 **다시 읽는다**.
- 화면의 **모양**(선택 id + type + 개수)이 같으면 DOM 을 다시 만들지
  않고 값만 갈아 끼운다 — 다시 만들면 입력 중이던 칸이 포커스와 커서를
  잃는다.
- **포커스가 있는 칸은 건너뛴다.** 입력 중인 글자를 저장값으로 덮으면
  방금 친 글자가 사라진다.
- 패널을 갱신하려고 Preview 를 다시 그리거나 선택을 풀지 않는다.
- native 와 sandbox 가 **같은 부모 패널**을 쓴다. sandbox 에서도 패널은
  부모 realm 에 있으므로 CSP 를 한 줄도 완화하지 않는다.

**선택 chrome 과의 공존.** 글자를 고쳐 줄 수가 늘거나 줄면 프레임의
따라가기 루프가 그 프레임에서 content bounds 를 다시 잰다 — 그 값이
이미 지문에 들어 있기 때문이다(§21-4). 그래서 패널이 chrome 에 따로
말하지 않고, **저장 geometry 도 한 칸 바뀌지 않는다**(실측: 숫자 height
24 인 요소에 다섯 줄을 넣어 아래 여유가 5 → 51 로 늘었고 `x` · `y` ·
`width` · `height` · `rotation` 은 그대로였다).

### 22-7. 이 라운드가 만들지 않은 것

**`hidden` · `locked` 토글을 일부러 넣지 않았다.**

지금은 레이어 목록이 없다. 숨긴 요소는 상자가 없어 화면에서 다시 고를
수 없고, 잠근 요소는 hit-test 가 후보에서 뺀다(§14-3). 그래서 패널에
토글을 달면 **켠 뒤에 되돌릴 안정적인 길이 없다**. 임시 우회 UI 를
만들지 않고 남은 차이로 둔다 → `HOME-CANVAS-LAYERS-1`(§11-3).

그 밖에 이 라운드에 **없는 것**: v2 데이터 · 렌더러 · migration ·
flow block Inspector · `main_visual` Inspector · alignment/margin/order
UI · 레이어 목록 · 다중 일괄 편집 · 그룹 transform · 글꼴 · 글자 크기 ·
색 · 행간 · 정렬 · `shape` 스타일 칸 · 이미지 업로드 · Crop UI ·
카테고리 선택 · 순서 UI · HTML 편집 · Effect Hook · preset · widget ·
모바일 touch 조작.

> **`HOME-CANVAS-V2-INSPECTOR-1` 은 여전히 별도 PLAN 이다**
> (로드맵 §14-13 의 7 번). 이 절은 **지금 v1** 자유 배치 요소의
> 패널이고, 그쪽은 v2 의 flow block 과 `main_visual` 을 편집하는
> 작업이다. `canvas.version: 2` 는 그 뒤 `V2-FLOW-RENDER-1` 에서
> **그려지게 됐지만**(§23) 편집은 아직 없다 — v2 블록은 고를 수
> 없다.

### 22-8. 이 라운드가 바꾼 파일

| 파일 | 무엇 |
| --- | --- |
| `studio/inspector/studio-canvas-inspector.js` | **새 파일** — 패널 전체(화면 · 입력 세션 · 오류) |
| `studio/inspector/studio-canvas-selection.js` | 입구 둘로 가른 확정 관문 · `notifyStudioCanvasPanel()` |
| `studio/studio-preview.js` | `setStudioCanvasElementText()` · `coalesceHistory` |
| `skin/skin-home-canvas.js` | `writeSkinHomeCanvasElementText()` · `container:"props"` · `normalizeSkinHomeCanvasRotation()` · `copySkinHomeCanvasObject()` |
| `skin/skin-home-canvas-editor-runtime.js` | 자릿수 · 한 바퀴 규칙을 위 파일에 위임 |
| `studio/inspector/studio-inspector.css` · `studio/studio-shell.css` | 패널 모양과 안내 문구 물리기 |
| `studio/index.html` · `studio/studio-lifecycle-scenario.html` | 새 파일 로드 한 줄 |
| `studio/studio-home-canvas-inspector-e2e-test.mjs` | **새 테스트**(TESTS.md §13) |

`APP_BUILD_VERSION` 은 이 라운드에서 올리지 않았다(배포하지 않았다).

---

## 23. v2 자동 배치 화면 출력 (`HOME-CANVAS-V2-FLOW-RENDER-1`)

조합형 Canvas(로드맵 §14)의 `flow` 와 `overlays` 가 **실제로 그려진다.**
`V2-DATA-1` 이 검증까지만 하고 멈춰 둔 자리를 여기서 화면까지 잇는다.

**읽기 전용 라운드다.** 선택 · 드래그 · 리사이즈 · 회전 · Inspector ·
묶기/해제 · v1→v2 변환은 하나도 없다.

### 23-1. 관련 파일

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-home-canvas-v2.js` | v2 **실행용 payload** 빌더(`buildSkinCanvasV2RenderPayload`) · `renderable:true` |
| `skin/skin-home-canvas.js` | `buildSkinCanvasRenderPayload()` 의 version 분기 한 줄 |
| `skin/skin-home-canvas-render.js` | 흐름 층 · 블록 · overlay 의 DOM(`renderSkinHomeCanvasV2Into`) |
| `skin/skin-home-canvas-render.css` | §4 — 흐름의 **배치 구조만** |
| `skin/sandbox/skin-sandbox-protocol.js` | 봉투의 v2 strict allowlist(`isSandboxHomeCanvasV2`) |

**새 파일도 새 진입 문서 로드도 없다.** 네 화면이 이미 같은 렌더러 파일을
쓰고 있었으므로(§12-6) sandbox allowlist 도 그대로다 — 늘어난 것은
프로토콜의 **칸 목록**뿐이다.

### 23-2. 무엇을 그리고 무엇을 아직 안 그리나

| | 이 라운드 |
| --- | --- |
| `flow` 의 블록 순서 · `direction:"column"` | **그린다** |
| `align` 네 값 · `width` · `maxWidth` | **그린다** |
| 숫자 `height` · `height:"auto"` | **그린다** |
| `padding` · `gap` · `margin` 합산 | **그린다** |
| `hidden`(자리도 차지하지 않음) · `locked`(표시만) | **그린다** |
| `logo` · `text` · `divider` · `category_nav` | **그린다**(v1 과 같은 재료) |
| `main_visual` | **외곽 프레임까지**. 내부는 안 그린다 → **`V2-MAIN-VISUAL-1` 이 그린다(§24)** |
| `overlays` | **그린다**(v1 요소와 같은 DOM) |
| `main_visual` 내부 사진 · 장식 · `pin` · `transform` | **`V2-MAIN-VISUAL-1` — 완료(§24)** |
| v2 선택 · Moveable · Inspector · 묶기/해제 | `V2-INSPECTOR-1` · `V2-ATTACH-1` |

★ **그 라운드에서 `main_visual` 은 빈 상자였다.** 임시 placeholder 문구도
기본 사진 틀도 공개 화면에 넣지 않았다 — 넣으면 그것이 곧 계약이 된다.
`height:"auto"` 인 프레임은 그래서 **높이가 0** 이었다. §14-5 가 "auto 는
primary photo 의 비율을 따른다"고 정했고 그 비율의 출처는
**`V2-MAIN-VISUAL-1` 이 정할 렌더 결정**이었으므로, 여기서 먼저 숫자를
지어내지 않았다.

> **→ 이제는 그린다.** 내부 렌더와 `height:"auto"` 의 비율 규칙은 **§24**
> 가 갖는다. 위 표의 "안 그린다"는 `V2-FLOW-RENDER-1` 시점의 기록이다.

내부 좌표의 자(`props.baseWidth` · `baseHeight`)는 프레임에
`--imory-canvas-frame-base-width` · `-height` 로 남겨 둔다. 내부 요소는
**실행 payload 에는 실린다** — 봉투가 프레임 내용을 잃은 채로 sandbox 까지
가면 다음 라운드가 같은 길을 두 번 내야 한다.

### 23-3. DOM — 한 표식 안의 두 층

```html
<div data-imory-canvas-root
     data-imory-canvas-active="true" data-imory-canvas-version="2">

  <div data-imory-canvas-flow="column">        <!-- 자동 배치 -->
    <div data-imory-canvas-block
         data-imory-canvas-type="logo"
         data-imory-canvas-align="left"
         data-imory-canvas-height="fixed"
         data-imory-edit-id="canvas_b1logo"> … </div>
    …
    <div data-imory-canvas-block
         data-imory-canvas-type="main_visual"
         data-imory-canvas-frame
         data-imory-edit-id="canvas_b5main"></div>
  </div>

  <div data-imory-canvas-element                <!-- 자유 배치 -->
       data-imory-canvas-overlay
       data-imory-canvas-type="text"
       data-imory-edit-id="canvas_o1number"> … </div>

</div>
```

- 자유 배치의 표식(`data-imory-canvas-element`)은 **그대로 둔다.** v1 요소와
  v2 의 `overlays` 가 같은 DOM 이고, 좌표 CSS(§2)가 한쪽에만 걸려야 한다.
- 블록은 그 표식을 **갖지 않는다.** "이것이 블록인가 자유 요소인가"를 한
  속성으로 물을 수 있어야 하고, 그래서 지금 Studio 선택은 v2 블록을 아예
  후보로 보지 않는다(고를 것이 없는 것이 이 라운드의 의도다).
- `logo` · `text` · `divider` · `category_nav` 의 **안쪽 DOM 은 v1 의 그
  함수**(`fillSkinCanvasElementNode`)가 만든다. 같은 타입 렌더러를 두 벌
  만들지 않는 것이 §14-4 의 "같은 의미의 칸을 두 벌 만들지 않는다"이고,
  그래서 스킨 CSS 선택자와 카테고리 링크의 탐색 경로가 층마다 갈라지지
  않는다. 카테고리는 여전히 실제 `a[href]` 이고 클릭은 기존 SPA 라우팅
  (`skin/skin-link-nav.js`)이 가져간다.
- `divider` 는 **빈 상자**다. 선의 색 · 두께 · 점선은 스킨 CSS 다(§8).

### 23-4. 좌표 — 자가 둘이고 배율은 하나다

흐름 층은 표식을 꽉 채운다(`position:absolute; inset:0`). 표식은
`aspect-ratio` 로 세로가 가로에 묶여 있으므로(§12-2) 흐름 층은 **확정된
높이**를 받고, 그 안에서 백분율 세로값이 풀린다. **`ResizeObserver` 도 매
프레임 재계산도 없다** — v1 과 같은 이유, 같은 방법이다.

| 무엇 | 자 |
| --- | --- |
| `flow.padding` 네 칸 | `canvas.baseWidth` |
| 블록의 `width` · `maxWidth` · `margin` · `gap` | **`baseWidth − padding.left − padding.right`** |
| 블록의 숫자 `height` | **`baseHeight − padding.top − padding.bottom`** |

★ **자가 둘인 것은 CSS 가 백분율을 푸는 기준이 둘이기 때문이다.** 흐름 층
자신은 표식 안에 절대 배치돼 있어 그 백분율이 도화지 폭으로 풀리고, 블록은
흐름 층 **안**에 있어 padding 을 뺀 content box 로 풀린다. 결과 배율은
하나다 — 흐름 층의 실제 content 폭이 `화면폭 × metrics.width / baseWidth`
이므로 위 자로 적은 백분율은 결국 `값 × 화면폭 / baseWidth` 가 된다.
세로도 같다(표식 높이가 `폭 × baseHeight / baseWidth` 이므로).

즉 **`390px` 과 `780px` 에서 모든 숫자가 정확히 두 배**다. `"auto"` 높이만
예외이고, 그것은 배율이 아니라 **스킨 조판**이 정한다(플랫폼은 글자 크기를
정하지 않는다 — §8. 그 변환 규칙은 `RESPONSIVE-1`).

padding 이 도화지보다 커서 자가 0 이하가 되면 백분율을 쓰지 않고 변수를
지운다(폭 `auto` · margin `0%`). 숫자를 지어내지 않는다.

### 23-5. `gap` 과 `margin` — 합산이고 collapse 하지 않는다

흐름 층이 **flex 세로 컬럼**인 이유가 이것이다. 보통 블록 흐름에서는 위아래
margin 이 collapse 하는데 §14-4 는 그 반대를 계약으로 정했다. flex item 의
margin 은 collapse 하지 않는다.

`gap` 과 블록 자신의 `margin.top` 은 **다른 변수**로 나가고 CSS 가 더한다.

```css
margin-top: calc(var(--imory-canvas-block-gap, 0%)
                 + var(--imory-canvas-block-margin-top, 0%));
```

JS 에서 미리 더해 한 칸으로 보내면 화면은 같지만 나중에 Inspector 가 두 값을
갈라 보여 줄 수 없고, "여백을 늘렸는데 아무 일도 안 일어난다"를 만드는 자리가
생긴다.

★ **`gap` 은 `hidden` 이 아닌 블록 사이에만 붙는다.** `hidden:true` 는 자리도
차지하지 않으므로(§14-4), 숨긴 첫 블록 때문에 둘째 블록 위에 빈 자리가 남으면
"아래 블록이 올라온다"가 깨진다. 숨긴 블록도 **DOM 에는 남는다** — 스킨 CSS 와
나중의 레이어 목록이 그것을 볼 수 있어야 한다.

### 23-6. `align` — `stretch` 만 flex 와 다르게 푼다

| `align` | CSS |
| --- | --- |
| `left` | `align-self: flex-start` + `width: <width>%` |
| `center` | `align-self: center` + `width: <width>%` |
| `right` | `align-self: flex-end` + `width: <width>%` |
| `stretch` | `align-self: **center**` + `width: calc(100% − 좌 − 우)` + `max-width` |

★ **`stretch` 가 `align-self: stretch` 가 아닌 이유는 `maxWidth` 다.** flex 는
stretch 된 item 의 크기가 `max-width` 로 깎이는 순간 정렬을 `flex-start` 로
떨어뜨린다 — §14-4 는 "그 뒤 가운데"라고 정했다. 그래서 가운데 정렬로 두고
폭을 렌더러가 `calc()` 로 적는다. 백분율 margin 과 그 `100%` 가 **같은
상자**(흐름 층의 content box)로 풀리므로 결과가 정확히 "가용 폭 − 좌 − 우"다.

`align:"stretch"` 여도 **`width` 저장값은 버리지 않는다**(§14-4) — 쓰지 않을
뿐이고, 변수로는 계속 나간다.

### 23-7. 봉투 — 늘어난 것은 칸 목록뿐이다

`isSandboxHomeCanvas()` 가 `version` 을 보고 v1 표와 v2 표로 갈린다. v2 표도
**strict allowlist** 이고, 프로토콜 파일은 "의존 없음"이라 값 목록을 한 벌 더
갖는다 — 둘이 갈라지지 않게 `skin/skin-home-canvas-test.mjs` 의 `[protocol]`
절이 v1 · v2 목록을 **양방향으로 대조**한다.

v1 과 다른 점 하나: **빠져도 되는 칸이 있다.**

| 칸 | 왜 조건부인가 |
| --- | --- |
| 블록의 `maxWidth` | "상한 없음"의 기본값이 숫자가 아니라 **부재**다(§14-4) |
| 프레임 내부 요소의 `x` · `y` | `follow:"transform"` 일 때만 실린다 |
| 프레임 내부 요소의 `pin` | `follow:"pin"` 일 때만 실린다 |

★ **`pin` 요소에 좌표가 함께 오면 거부한다.** 저장값으로는 둘 다 보존되지만
(§14-6 "안 쓰는 칸을 지우지 않는다") 실행 payload 에 둘 다 실리면 받는 쪽이
"어느 것이 이 요소의 자리인가"를 다시 판단하게 된다.

**CSP 는 한 글자도 넓히지 않았다.** geometry 는 지금까지처럼
`style.setProperty()`(CSSOM)로 쓴다 — `style` 속성도 inline style 도 아니다.

### 23-8. 이 라운드가 만들지 않은 것

(그중 `main_visual` 내부 렌더와 `pin`/`transform` follow 는 **§24 에서
만들어졌다**. 나머지는 그대로 후속이다.)

v2 선택 · Moveable · Selecto · Inspector · 블록 순서 변경 UI · `main_visual`
내부 렌더 · `pin`/`transform` follow · 묶기/해제 · v1→v2 변환 · 기본 스킨
변경 · 테스트 스킨 · Effect Hook · 모바일 시트 수정 · responsive override ·
`row`/`grid` 블록 · CATEGORY/POST/BANNER 캔버스.

`APP_BUILD_VERSION` 은 올리지 않았다(배포하지 않았다).

---

## 24. v2 `main_visual` 내부 — 사진과 주변 장식 (`HOME-CANVAS-V2-MAIN-VISUAL-1`)

`V2-FLOW-RENDER-1` 이 빈 상자로 남겨 둔 프레임 안에 **primary 사진과 그
주변 장식**이 실제로 그려진다. 로드맵 §14-5 · §14-6 의 `transform` · `pin`
두 규칙이 여기서 화면이 된다.

**여전히 읽기 전용 라운드다.** v2 선택 · 드래그 · Inspector · `메인 비주얼로
묶기`/`묶기 해제` 는 하나도 없다(`V2-EDITOR-1`).

### 24-1. 관련 파일

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-home-canvas-render.js` | §3-2 — 프레임의 자(`resolveSkinCanvasFrameGeometry`) · 두 규칙(`applySkinCanvasFrameElementBox`) · 내부 요소 DOM |
| `skin/skin-home-canvas-render.css` | §5 — 프레임의 `position` 과 `height:"auto"` 의 `aspect-ratio` **두 줄뿐** |

**데이터 · 봉투 · Studio 는 한 줄도 바뀌지 않았다.** 내부 요소는 `V2-FLOW-RENDER-1`
부터 이미 실행 payload 에 실려 네 화면에 도착해 있었고(§23-2 의 그 결정),
sandbox strict allowlist(`isSandboxCanvasFrameElement`)도 이미 그 칸들을 알고
있었다. 이 라운드는 **도착한 값을 그리기만** 한다 — 새 파일 · 새 메시지 ·
새 진입 문서 로드 · CSP 완화 전부 없다.

### 24-2. DOM — 프레임 상자의 직계 자식 하나의 층

```html
<div data-imory-canvas-block
     data-imory-canvas-type="main_visual"
     data-imory-canvas-frame
     data-imory-canvas-height="auto"
     data-imory-edit-id="canvas_b5main">

  <div data-imory-canvas-element
       data-imory-canvas-type="shape"
       data-imory-canvas-follow="transform"
       data-imory-edit-id="canvas_m0paper"></div>

  <div data-imory-canvas-element
       data-imory-canvas-type="photo"
       data-imory-canvas-follow="transform"
       data-imory-edit-id="canvas_m1photo"><img data-imory-canvas-image …></div>

  <div data-imory-canvas-element
       data-imory-canvas-type="text"
       data-imory-canvas-follow="pin"
       data-imory-edit-id="canvas_m2left"><p data-imory-canvas-text>…</p></div>

</div>
```

- **자유 배치의 표식(`data-imory-canvas-element`)을 그대로 쓴다.** 프레임
  내부 요소도 좌표로 놓이는 자유 요소이고, 좌표 CSS(§12-2 · §2)가 그 한
  선택자에 걸려 있다. 층을 가르는 물음은 "프레임 안에 있는가"
  (= `[data-imory-canvas-frame]` 의 자손인가)다.
- **종류별 안쪽 DOM 은 v1 의 그 함수**(`fillSkinCanvasElementNode`)가
  만든다 — v1 요소 · `overlays` · 프레임 내부가 **같은 껍데기 · 같은 재료**
  이고 다른 것은 좌표를 푸는 자 하나뿐이다. 사진은 기존 이미지 슬롯
  (`context.images`)을 그대로 읽고, `isSafeSkinUrl()` 관문도 그대로다.
- `data-imory-canvas-follow` 는 **표시용**이다 — 스킨 CSS 와 재는 쪽이 두
  규칙을 구분할 수 있게 남긴다. 값은 `transform` · `pin` 둘.

★ **왜 프레임 안에 또 하나의 좌표 층을 만들지 않았나.**

내부 좌표의 자를 `aspect-ratio` 상자 하나로 깔면 `transform` 요소는 저절로
풀린다. 그런데 `pin` 요소는 그 상자의 세로 자를 쓸 수 없어(자기 크기가
`S_frame` 을 받지 않는다) 상자 밖으로 나가야 하고, 그 순간 **배열 순서가
두 덩어리로 쪼개진다**. §14-5 는 배열 순서가 곧 앞뒤 순서라고 정했다.
그래서 층을 하나로 두고, 렌더러가 두 규칙을 **숫자로 풀어** 같은 네 칸
(`x` · `y` · `width` · `height`)에 적는다.

### 24-3. 자 — `S_frame` 을 저장값에서 계산한다

```text
  S_page  = 실제 도화지 폭 ÷ canvas.baseWidth      (백분율이 알아서 준다)
  S_frame = 프레임 폭 ÷ props.baseWidth            (렌더러가 계산한다)
```

프레임 폭은 **재지 않는다** — CSS 가 §23-6 에서 푸는 그 식을 그대로 쓴다.

| `align` | 프레임 폭(도화지 자) |
| --- | --- |
| `left` · `center` · `right` | 블록의 `width` |
| `stretch` | `가용 폭 − margin.left − margin.right`, `maxWidth` 가 더 작으면 거기까지 |

그래서 `ResizeObserver` 도 매 프레임 재계산도 **여전히 없다**(§12-2 와 같은
규칙). 자를 만들 수 없으면(가용 폭이 0 이하 등) 프레임은 **빈 상자로 남는다**
— 숫자를 지어내지 않는다.

| | 최종 크기 | 최종 위치 |
| --- | --- | --- |
| `transform` | 로컬값 × `S_frame` | 로컬 `x`·`y` × `S_frame` |
| `pin` | 로컬값 **그대로**(`S_frame` 없음) | `anchor` 기준점 + `offset` |

둘 다 마지막에 **프레임 상자의 백분율**로 적히므로 `S_page` 는 양쪽에 똑같이
붙는다. 즉 **화면이 넓어지면 둘 다 커지고, 프레임만 커지면 `transform` 만
커진다** — §14-6 이 요구한 그대로다.

★ `S_frame` 은 **가로 배율 하나**다. 프레임이 세로로만 늘어나면 `transform`
장식은 위쪽에 몰린다 — 의도한 동작이다(§14-6).

### 24-4. `pin` — `origin` 은 CSS 가 뺀다

```css
transform:
  translate(var(--imory-canvas-translate-x, 0%), var(--imory-canvas-translate-y, 0%))
  rotate(var(--imory-canvas-rotation, 0deg));
```

`anchor` 기준점 + `offset` 까지는 렌더러가 숫자로 풀어 `x` · `y` 에 적고,
`origin`(장식 **자신의** 어느 점)은 `translate` 의 **백분율**이 뺀다.

★ **왜 좌표에 미리 더하지 않는가.** `origin` 은 자기 크기를 알아야 계산되는데
`height:"auto"` 인 pin 장식의 높이는 **스킨 조판**이 정하므로(§8 — 플랫폼은
글자 크기를 정하지 않는다) 렌더 시점에 숫자가 없다. `translate` 의 백분율은
요소 **자기 상자**를 기준으로 풀리므로 브라우저가 그 몫을 대신 뺀다 — 재지
않고, 지어내지도 않는다.

★ `translate` 가 `rotate` **앞**이다. `transform-origin` 기본값이 요소 중심
이라 "옮긴 자리에서 자기 중심을 돈다"가 되고, 회전 기준(§4)이 그대로
성립한다. v1 요소와 `overlays` 는 두 변수를 쓰지 않으므로
`translate(0%, 0%)` 이고 **결과 행렬이 지금까지와 같다**.

`pin.target` 의 상자:

| `target` | 상자 |
| --- | --- |
| `frame`(기본) | `(0, 0, 프레임 폭, 프레임 높이)` |
| `photo` | `primaryId` 요소의 상자 — `transform` 이면 `S_frame` 을 받은 상자, 그 자신이 `pin` 이면 pin 으로 푼 상자 |

★ primary 자신이 `follow:"pin"` 이고 `target:"photo"` 면 **자기 자신**을
가리키게 된다. 그때는 프레임으로 읽는다 — 순환을 만들지 않는다.
`target:"photo"` 인데 그 상자를 풀 수 없으면 역시 프레임으로 읽는다(장식을
잃지 않고, 자리를 지어내지도 않는다).

### 24-5. `height:"auto"` 프레임의 높이 — **primary 사진 상자의 비율**

§14-5 가 "auto 는 primary photo 의 비율을 따른다"고 정했고, 그 비율의 출처를
이 라운드가 정했다: **`primaryId` 요소의 저장된 `width` : `height`** 다.

```css
[data-imory-canvas-frame][data-imory-canvas-height="auto"] {
  aspect-ratio:
    var(--imory-canvas-frame-ratio-width) / var(--imory-canvas-frame-ratio-height);
}
```

- **`props.baseWidth` : `baseHeight` 가 아니다.** 그쪽은 내부 좌표의 자일
  뿐이고, 비율을 두 곳에서 정하면 충돌한다(§14-5 가 별도 `aspectRatio` 칸을
  두지 않은 그 이유).
- **그림 파일의 비율도 아니다.** primary 는 `type:"photo"` 여야 하고
  (§14-5), `photo` 에는 `height:"auto"` 가 없으므로(§6 의 자) 그 비율은
  **언제나 숫자**다. 그래서 §14-5 가 남겨 둔 "슬롯이 비어 비율을 모를 때의
  폴백 비율"은 **필요하지 않다** — 슬롯이 비어도, 그림이 아직 안 받아졌어도
  높이가 같고, 그림이 늦게 도착해도 프레임이 튀지 않는다.
- `aspect-ratio` 는 폭이 이미 확정돼 있으므로(§23-6) 높이를 확정값으로
  만들고, 그 안에서 내부 요소의 백분율 세로값이 풀린다. **`align:"stretch"`
  에서도 숫자 없이 성립한다.**
- 변수가 없으면 이 선언은 무효가 되어 `aspect-ratio: auto` 로 돌아간다(= 높이를
  정하지 않는다).

★ **결과 하나를 알아 두어야 한다.** primary 사진이 프레임 폭을 다 쓰지 않으면
(예: `props.baseWidth` 260 · 사진 폭 200) 프레임은 **사진보다 세로로 길어진다**
— 비율이 사진 상자의 것이기 때문이다. 프레임을 사진에 딱 맞추려면
`props.baseWidth` 를 사진 폭과 같게 두면 된다.

### 24-6. overflow — 삐져나오는 것이 목적이다

종이 · 테이프 · 좌우 인덱스는 **일부러** 프레임 밖으로 나온다(§14-5). 그래서
렌더러도 플랫폼 CSS 도 프레임에 `overflow` 를 쓰지 않는다 — 자를지 보일지는
스킨 CSS 가 고른다(§4-1 · §12-2 와 같은 결정).

화면 전체의 가로 넘침은 **플랫폼 표시 공간이 이미 막고 있다** —
`home/home-base.css` 의 `.theme-mount--skin { overflow-x: hidden }` 이 공개
HOME 의 스크롤 담당 요소다. 도화지 **안**에서 프레임 밖으로 나온 장식은
그대로 보이고, 도화지 **밖**으로까지 나간 장식은 거기서 잘린다.

### 24-7. 함정

★ **id 는 canvas 하나 안에서 전부 유일하다**(§14-5). 블록 · 프레임 내부 요소 ·
overlay 가 한 이름 공간이므로, 프레임에 장식을 넣을 때 이미 쓰고 있는 블록
id 나 overlay id 를 다시 쓰면 **새 Import 자체가 거부된다**. 화면에는
`data-imory-edit-id` 로 셋 다 나가므로 그것이 문서 안에서 유일해야 스킨
CSS 선택자와 나중의 Inspector 가 성립한다.

★ **`data-imory-canvas-frame` 이라는 이름이 두 곳에서 쓰인다.** Canvas
**편집 runtime** 도 Moveable control box 에 같은 속성을 붙이고(`="1"` —
`markControlBox`), `skin/skin-inspect-target.js` 의
`inspectorEditChromeAncestor()` 는 **값을 보지 않고** 그 속성만 본다. 그래서
Studio 에서 `main_visual` 안을 누르면 Inspector 가 "내 입력이 아니다"로 읽고
비켜선다(§18-11).

그 라운드에서는 **결과가 같았다** — v2 선택이 아직 없으므로 프레임 안을 눌러도
할 일이 없고, 내부 요소가 v1 편집기에 잘못 걸리지도 않았다. 그 라운드가 판정을
바꾼 것도 아니다(프레임 블록은 `V2-FLOW-RENDER-1` 부터 이미 그 속성을 갖고
있었다).

> **✅ `V2-EDITOR-1A` 가 이 충돌을 풀었다 — §25-2 를 본다.** 값 `"1"` 인
> Moveable control box만 편집 chrome 으로 읽는다. 고친 자리는 예상대로
> `inspectorEditChromeAncestor()` 한 곳이었다.

★ **회전한 요소의 `getBoundingClientRect()` 는 회전 뒤의 외곽 상자다.**
프레임 내부 좌표를 잴 때 변(`left`/`right`)이 아니라 **중심**으로 봐야 한다
(회전은 중심을 옮기지 않는다) — 테스트가 그 규약을 쓴다.

### 24-8. 이 라운드가 만들지 않은 것

v2 선택 · Moveable · Selecto · v2 Inspector · 프레임 내부 진입/나가기 UI ·
`메인 비주얼로 묶기`/`묶기 해제` · 블록 순서 변경 · v1→v2 변환 · 기본 스킨
변경 · 정식 테스트 스킨 · Effect Hook · responsive override · `row`/`grid`
블록 · CATEGORY/POST/BANNER 캔버스.

`APP_BUILD_VERSION` 은 올리지 않았다(배포하지 않았다).

---

## 25. v2 요소 선택과 기본 배치 조정 (`HOME-CANVAS-V2-EDITOR-1A`)

`V2-FLOW-RENDER-1` · `V2-MAIN-VISUAL-1` 이 그리기만 하던 v2 를 **Studio 에서
고를 수 있고 기본 배치를 고칠 수 있게** 한다. v1 의 선택 · 확정 · Undo 경로를
그대로 쓰고, 갈라지는 것은 **불변 수정을 하는 순수 함수**와 **왼쪽 패널의
화면** 둘뿐이다.

### 25-1. 관련 파일

| 파일 | 무엇 |
| --- | --- |
| `skin/skin-inspect-target.js` | 편집 chrome 판정을 **값으로** 가른다 · v2 블록을 하나의 단위로 |
| `skin/skin-home-canvas-write-v2.js` | **새 파일** — v2 트리 탐색 + 불변 writer |
| `studio/inspector/studio-canvas-selection.js` | draft · 선택 · 확정이 v2 를 안다 |
| `studio/inspector/studio-inspector.js` | 선택 라우터가 프레임 진입 규칙을 적용한다 |
| `studio/studio-preview.js` | v2 writer 여섯을 draft 에 잇는 wrapper |
| `studio/inspector/studio-canvas-inspector-v2.js` | **새 파일** — v2 패널 화면 |
| `studio/inspector/studio-inspector.css` | select · 순서 버튼 두 규칙 |

**v1 writer 는 한 줄도 바뀌지 않았다.** `skin/skin-home-canvas-write.js` 는
여전히 `canvas.elements` 를 찾고, 그 칸이 없다는 것이 곧 "v2 데이터에 닿을 수
없다"의 근거다(§14-9 함정 2). 두 파일은 서로를 부르지 않는다.

★ **새 메시지도 새 봉투 칸도 없다.** 프레임은 지금까지처럼 "이 자리에서
이것이 잡혔다"는 id 하나만 올리고, 무엇을 고를지 · 무엇을 고칠 수 있는지는
언제나 부모가 draft 를 보고 정한다(§14 의 소유권). sandbox strict allowlist 도
그대로다.

### 25-2. 이름 충돌을 풀었다 — `data-imory-canvas-frame`

`V2-MAIN-VISUAL-1` 이 §24-7 에 남긴 함정이다. 같은 속성을 둘이 쓴다.

| 쓰는 곳 | 값 |
| --- | --- |
| Moveable control box (`skin/skin-home-canvas-editor-runtime.js` markControlBox) | `"1"` |
| v2 `main_visual` 프레임 (렌더러) | `""` |

`inspectorEditChromeAncestor()` 가 **값을 보지 않고** 속성만 봤기 때문에,
`main_visual` 안을 누른 입력이 전부 "편집 UI 위의 입력"으로 읽혀 Inspector 가
비켜섰다 — 프레임도, 그 안의 사진 · 장식도 고를 수 없었다.

★ **값으로 가른다.** 편집 runtime 은 처음부터 `="1"` 로 쓰고 자기 선택자도
`[data-imory-canvas-frame="1"]` 이므로, 고칠 자리는 그 판정 한 줄이었다.
v1 의 손잡이(리사이즈 · 회전) 동작은 그대로다 — control box 는 여전히 걸린다.

또 하나. v2 블록은 자유 배치 요소가 아니라서 `data-imory-canvas-element` 를
갖지 않는다. 그래서 `data-imory-canvas-block` 을 **컴포넌트 속성 목록**에
넣었다 — `divider` 처럼 스킨 CSS 가 아직 칠하지 않은 빈 상자가 "누를 것이
없는 자리"로 떨어지지 않게(§14 의 캔버스 요소와 같은 이유), 그리고
`align:"stretch"` 블록이 "페이지 전체 래퍼"로 매겨지지 않게.

### 25-3. `main_visual` 에 들어가고 나오는 법

| 지금 선택 | 프레임 안을 누르면 |
| --- | --- |
| 프레임 밖 · 아무것도 없음 | **프레임 블록 전체**가 골라진다 |
| 그 프레임 블록 | 누른 **안쪽 요소**가 골라진다(들어간다) |
| 같은 프레임의 다른 안쪽 요소 | 누른 안쪽 요소로 바로 옮겨 간다 |

★ **새 상태를 만들지 않았다.** "들어와 있는가"는 지금 선택으로 읽는다
(`studioCanvasSelectTargetId`). 그래서 다른 곳을 고르거나 빈 곳을 누르면 저절로
나가지고, 되돌릴 별도의 "나가기"가 없다.

★ 바꿔 고를 때는 **좌표를 쓰지 않는다.** 프레임이 올린 rect 는 안쪽 요소의
것이라 프레임 상자와 다르다. 그래서 그 길은 기존 제안 경로
(`proposeStudioCanvasSelection`)로 넘어가고, 그 함수가 프레임에 "이것을
집어라"를 내려보내 올바른 좌표를 다시 받는다.

★ 패널은 **무엇이 골라졌는지 먼저 적는다**(프레임 전체 / 안쪽 요소 /
페이지 자유 장식). 겹쳐 있는 자리라 그 한 줄이 없으면 주인이 지금 무엇을
고치고 있는지 알 수 없다.

### 25-4. 고칠 수 있는 것

| 무엇 | 칸 |
| --- | --- |
| 블록(logo · category_nav · text · divider · main_visual) | 순서 · 정렬 · 여백 네 칸 · 폭 · 높이(`"auto"` 포함) |
| `text` 인 것(블록 · 프레임 내부 · overlay) | `props.text` |
| 프레임 내부 요소 · overlay | **읽기 전용 요약**(따라가기 방식 · 크기) |

- **여백은 네 칸을 함께 쓴다.** `margin` 이 통째로 빠져 있을 수 있고(빠지면 네
  칸 다 0 — §14-4), 그때 한 칸만 새로 만들면 나머지 셋이 "없음"인 채로 남아
  다음 입력의 `expected` 가 `undefined` 와 `0` 사이에서 갈린다. 한 번의 입력은
  그중 한 칸만 바꾸므로 **Undo 한 칸은 그대로**다. 음수를 허용한다(§14-4).
- **순서는 배열 자리다.** `hidden` 블록도 한 칸을 차지한다 — 화면에서는
  건너뛰지만(§23-5) 배열에서는 한 칸이고, 그 둘을 다르게 세면 저장값과 화면이
  어긋난다.
- **`height:"auto"` 를 쓸 수 있는 블록 종류는 계약의 표 하나**를 본다
  (`SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES` — `logo` 는 못 쓴다). 쓸 수 없는
  블록에는 스위치 자체를 그리지 않는다.
- **Auto 를 끌 때 숫자를 지어내지 않는다.** v1 은 화면에서 잰 높이를 썼지만
  (§22-3) v2 블록의 실제 높이는 흐름과 스킨 조판이 정하므로 프레임에서 재야
  한다. 이 라운드는 재지 않고, Height 칸에 적힌 숫자를 쓴다 — 비어 있으면
  끄지 못하고 그 이유를 적는다.
- **빠진 칸은 화면의 값으로 읽는다.** `align` 이 없으면 `left`, `margin` 이
  없으면 0, `props.text` 가 없으면 빈 문자열이다. 패널과 writer 가 **같은 자**
  를 써야 "한 번도 적지 않은 칸은 영영 못 고친다"가 생기지 않는다.

### 25-5. 쓰기 — 관문 하나, writer 만 갈라진다

v1 의 확정 경로(`commitStudioCanvasInspectorEdit` →
`commitStudioCanvasElementChange`)를 **그대로** 지난다 — 선택 · 순번 ·
hidden/locked · 허용 키 정확 일치 · `expected` 정확 일치. 늘어난 것은 `kind`
여섯(`v2-align` · `v2-width` · `v2-height` · `v2-margin` · `v2-order` ·
`v2-text`)과 그것이 고르는 writer뿐이다.

★ **v1 의 kind 이름을 재사용하지 않았다.** 같은 `"width"` 라도 v1 은 도화지
좌표의 자유 요소이고 v2 블록은 흐름 안의 폭이라 writer 도 값 표도 보존 범위도
다르다. 이름을 나눠 두면 한 메시지가 엉뚱한 writer 로 새어 들어갈 길 자체가
없다.

★ **프레임(직접 조작)이 쓸 수 있는 kind 는 여전히 셋**이다(move · resize ·
rotate). v2 는 전부 **패널 전용**이고, 그래서 프레임에서 올라온 메시지로는
v2 를 한 칸도 고칠 수 없다.

**무엇을 보존하는가** — 바뀌는 칸 밖은 전부 그대로 새 객체로 옮긴다: regions 의
모르는 항목 · 항목의 모르는 칸 · canvas 의 모르는 칸(`overlays` 포함) · flow 의
모르는 칸 · 다른 블록(같은 참조) · 그 블록의 모르는 칸 · `props` 의 모르는 칸 ·
프레임 내부 배열의 다른 요소 · **배열 순서**. 입력은 한 칸도 mutate 하지
않는다.

**한 번의 입력 = Undo 한 칸.** 숫자 · 정렬 · 순서는 확정할 때 한 번 쓰고,
글자만 세션이 기록을 맡는다(focus 에서 한 칸을 잡고 blur 에서 확정 · Escape 는
시작값 복귀 · 기록 0 — v1 §22-4 와 같은 규칙, 같은 세션 변수).

### 25-6. 직접 조작은 v2 에 내려가지 않는다

> **⚠ 이 절은 `V2-EDITOR-1B` 가 바꿨다 — §26 을 본다.** 프레임 내부 요소와
> overlay 에는 이제 자와 좌표가 내려간다. 아래 판정이 그대로 남는 것은
> **블록**뿐이다(블록의 자리는 좌표가 아니다 — §14-10).

`studioCanvasSingleGeometry()` 가 v2 선택에서 **null 을 돌려준다**. 그 값은
끌기 · 크기 · 회전의 시작점이고, 프레임은 그것이 없으면 제스처를 시작하지
않는다(editor-runtime 의 `dragGate` → `"no-geometry"`).

★ **막는 것이 아니라 애초에 주지 않는다.** 관문을 한 곳에 두는 편이 "패널로는
고쳐지는데 손으로 끌면 엉뚱한 칸이 저장된다"를 만들지 않는다. v2 overlay 는
v1 요소와 같은 모양이라 좌표가 있지만, 같은 이유로 아직 내려보내지 않는다.

**공개 화면은 그대로다** — 편집 UI 도 vendor 요청도 0이고, 이 라운드는 공개
경로의 코드를 한 줄도 바꾸지 않았다.

### 25-7. 이 라운드가 만들지 않은 것

v2 드래그 · 리사이즈 · 회전 · 프레임 내부 요소의 좌표 편집 · overlay 의 좌표
편집 · `메인 비주얼로 묶기`/`묶기 해제` · 그룹 조작 · 레이어 목록 · 효과 설정 ·
블록 추가/삭제 · `hidden`/`locked` 토글 · v1→v2 변환 · 기본 스킨 변경 ·
`row`/`grid` 블록 · CATEGORY/POST/BANNER 캔버스.

> **✅ 앞의 셋은 `V2-EDITOR-1B` 가 채웠다** — v2 드래그 · 리사이즈 · 회전과
> 프레임 내부 요소 · overlay 의 좌표 편집(§26). 나머지는 그대로 남아 있다.

`APP_BUILD_VERSION` 은 올리지 않았다(배포하지 않았다).

---

## 26. v2 프레임 내부 요소 · overlay 의 자리 (`HOME-CANVAS-V2-EDITOR-1B`)

`V2-EDITOR-1A` 가 고를 수 있게만 해 둔 **`main_visual` 안의 사진 · 장식**과
**페이지 `overlays`** 의 자리 · 크기 · 각도를, 왼쪽 패널의 다섯 칸과
**Preview 의 직접 조작**으로 고친다. 로드맵 §14-5 · §14-6 의 두 규칙이
여기서 편집이 된다.

v1 의 선택 · 확정 · Undo · 제스처 엔진을 **그대로** 쓴다. 갈라지는 것은
셋이다 — **좌표의 자**, **불변 writer**, **패널의 그 화면**.

### 26-1. 관련 파일

| 파일 | 무엇 |
| --- | --- |
| `studio/inspector/studio-canvas-v2-space.js` | **새 파일** — 선택 하나의 자(§26-2)와 자 → storage 번역(§26-4) |
| `skin/skin-home-canvas-write-v2.js` | 순수 writer 다섯이 늘었다(§26-4) |
| `skin/skin-home-canvas-editor-runtime.js` | 자의 기준 상자(`scopeId`)와 pin 의 `origin` 보정(§26-5) |
| `studio/inspector/studio-canvas-selection.js` | v2 선택에 좌표를 내려보내고, 프레임의 kind 를 v2 의 kind 로 옮긴다 |
| `studio/studio-preview.js` | 자 번역을 지나는 wrapper 셋 |
| `studio/inspector/studio-canvas-inspector-v2.js` | 다섯 칸의 패널 화면 |
| `studio/preview/preview-bridge.js` · `skin/sandbox/skin-sandbox-host.js` · `-protocol.js` · `-frame.js` | geometry 메시지에 자 칸 셋(선택) |
| `studio/index.html` · `studio/studio-lifecycle-scenario.html` | Studio 가 **렌더러 파일**과 새 자 파일을 싣는다(§26-3) |

### 26-2. 선택 하나 = 자 하나

v1 에서는 자가 언제나 도화지였다. v2 는 **어디에 있는 요소인가**가 자를
정한다.

| 고른 것 | 자 | `scopeId` | x · y 의 뜻 |
| --- | --- | --- | --- |
| overlay | 도화지(`canvas.baseWidth` · `baseHeight`) | 없음 | 저장된 `x` · `y` |
| 프레임 내부 `follow:"transform"` | 프레임 내부 좌표(`props.baseWidth`) | 프레임 블록 id | 저장된 `x` · `y` |
| 프레임 내부 `follow:"pin"` | **프레임 상자**(`frame.width` · `height`) | 프레임 블록 id | `기준점 + pin.offset` |
| 블록 | **없다** | — | 블록의 자리는 좌표가 아니다(§14-10) |

`studioCanvasV2Space(id)` 가 그 자와 **지금 값**을 함께 돌려주고, 패널과
직접 조작이 그 하나를 같이 쓴다.

★ **세로 자는 저장값이 아니라 계산값이다**(내부 `transform`).
`props.baseHeight` 는 내부 좌표의 자일 뿐이고 프레임의 실제 세로 길이는 숫자
`height` 또는 primary 사진의 비율이 정한다(§24-5). 그래서

```text
  baseHeight' = 프레임 높이 ÷ S_frame
```

로 두면 네 칸이 **저장된 그 숫자 그대로** 자 위의 값이 되고, 가로 · 세로
배율이 하나가 된다(프레임 상자가 이미 그 비율이므로).

★ **새 메시지도 새 kind 도 프레임에는 없다.** 프레임은 자기가 v1 인지 v2 인지
모른다 — 알 필요도 없다. 부모가 자와 시작값을 내려 주고, 프레임은 손으로 끈
결과를 그 자 위의 다섯 칸으로 돌려준다. 그래서 프레임이 올리는 kind 는 여전히
`move` · `resize` · `rotate` 셋이고, **부모가 지금 draft 의 version 을 보고**
`v2-move` · `v2-resize` · `v2-rotate` 로 바꿔 부른다
(`studioCanvasEffectiveKind` — 관문을 지난 **뒤**의 한 줄이다).

봉투에 늘어난 것은 **선택 칸 셋**뿐이다.

| 칸 | 뜻 | 없으면 |
| --- | --- | --- |
| `scopeId` | 백분율과 배율의 기준이 되는 **상자의 edit id** | 도화지 |
| `originX` · `originY` | 자기 상자의 어느 점이 그 자리에 놓이는가(0~1) | 0 |

v1 요소와 v2 overlay 는 도화지 자에 origin 0 이므로 **그 칸이 아예 없는
메시지가 지금까지의 그 메시지**다. 그래서 `TRANSFORM-1A~1C` 의 프로토콜
테스트가 한 줄도 바뀌지 않았다.

★ `origin` 의 범위는 **0~1** 이다 — 자기 상자 **안**의 한 점이므로 좌표의
±100000 을 빌려 오지 않는다. `scopeId` 가 가리키는 상자가 지금 화면에 없으면
runtime 이 자를 만들 수 없다고 보고 제스처를 시작하지 않는다.

### 26-3. 자를 재는 계산은 렌더러의 그것 하나다

프레임 폭 · 프레임 높이 · primary 사진 상자 · pin 기준점은 전부
`skin/skin-home-canvas-render.js` 가 계산한다
(`resolveSkinCanvasFrameGeometry` · `resolveSkinCanvasPinPoint` ·
`skinCanvasRenderPinFraction`). 그래서 **Studio 문서도 그 파일을 로드한다** —
그리지는 않고 자만 빌려 쓴다.

★ **왜 한 벌 더 적지 않았나.** 프레임 폭은 `align` · `margin` · `maxWidth` ·
가용 폭이 함께 정하는 값이고(§24-3), 그 식은 CSS 의 calc 과 글자 단위로 같아야
한다. 패널이 그 계산을 따로 가지면 한쪽만 고쳐지는 날 **패널의 숫자와 화면의
자리가 갈라진다** — 그 어긋남은 "저장은 됐는데 엉뚱한 자리에 그려진다"로
나타나고 원인을 찾기 어렵다.

★ `compileSkinHomeCanvas()` 는 부르는 곳이 없으므로 Studio 문서가 캔버스를
그리지는 않는다. 로드 시점에 하는 일도 없다(함수 선언뿐이다).

### 26-4. 쓰기 — 관문 하나, 번역 한 곳, writer 다섯

확정 경로는 v1 의 그 한 벌이다(`commitStudioCanvasElementChange` — 선택 ·
순번 · hidden/locked · 허용 키 정확 일치 · `expected` 정확 일치 · 요청 번호가
붙은 답). 늘어난 것은 **자 → storage 번역** 한 걸음이다.

```text
  프레임 · 패널 → (자 위의 다섯 칸)
                → planStudioCanvasV2Transform()   자 → storage
                → writeSkinHomeCanvasV2Node…()    불변 수정
```

| 고른 것 | `v2-move` | `v2-resize` | `v2-rotate` |
| --- | --- | --- | --- |
| overlay · 내부 `transform` | `x` · `y` | `x` · `y` · `width` · `height` | `rotation` |
| 내부 `pin` | `pin.offset.x` · `.y` | `pin.offset` 둘 + `width` · `height` | `rotation` |

writer 이름을 `Position` / `Box` / `PinOffset` / `PinBox` / `Rotation` 으로
나눈 이유는 **`next.x` 가 어떤 때는 좌표이고 어떤 때는 offset 이 되지 않게**
하기 위해서다. pin writer 의 키는 `offsetX` · `offsetY` 이고, 좌표 writer 는
pin 요소를 만나면 `reason:"pin"` 으로 거부한다(반대 방향도 막는다).

★ **`pin` 의 나머지 세 칸은 그대로다.** 자리를 옮긴다고 `target` · `anchor` ·
`origin` 이 바뀌지 않는 것이 §14-6 이고, 이 라운드가 고치는 것은 offset 두
칸뿐이다. `pin` 요소가 갖고 있는 안 쓰는 `x` · `y` 도 손대지 않는다(§14-6
"안 쓰는 칸을 지우지 않는다").

★ **`expected` 는 자 위에서 본다.** storage 로 옮긴 뒤에 비교하면 pin 의
`x − 기준점` 이 부동소수점 한 칸 어긋나는 날 "그 사이에 값이 바뀌었습니다"가
뜬다 — 비교하는 두 값이 **같은 계산의 결과**여야 그런 일이 없다(둘 다 지금
draft 에서 나온다). 그리고 자리가 그대로면 **저장된 offset 을 그대로 쓴다**:
`(기준점 + offset) − 기준점` 이 원래 offset 과 마지막 비트까지 같다는 보장이
없어서, 한 칸도 옮기지 않은 요청이 Undo 한 칸을 만들 수 있다.

★ 보존 범위는 v1 과 한 벌이다 — regions 의 모르는 항목 · 항목의 모르는 칸 ·
canvas 의 모르는 칸 · flow 의 모르는 칸 · 다른 블록 · 그 블록의 모르는 칸 ·
프레임 내부 배열의 다른 요소 · **배열 순서** · `props` · `pin` 의 모르는 칸.
입력은 한 칸도 mutate 하지 않는다.

### 26-5. 크기를 바꿀 때 `origin` 몫을 좌표에 되돌린다

`follow:"pin"` 요소의 좌표는 **자기 상자의 왼쪽 위가 아니라 `origin` 이 놓일
자리**이고, 그 차이는 CSS 의 백분율 `translate` 가 뺀다(§24-4). 그래서 상자
크기가 바뀌면 **같은 좌표가 가리키는 화면 자리도 바뀐다**.

Moveable 이 주는 `drag.beforeTranslate` 는 "화면 상자의 왼쪽 위가 얼마나
움직여야 하는가"이므로, 좌표에는 크기 변화 × origin 만큼을 더 얹는다.

```text
  새 좌표 = 시작 좌표 + 이동량 + origin × (새 크기 − 시작 크기)
```

- v1 요소와 overlay 는 `origin` 이 0 이라 **이 항이 사라진다** — 지금까지의
  식 그대로다.
- `height:"auto"` 가 그대로 남는 동안에는 세로 항이 0 이다. 높이를 숫자로
  쓰지 않았으므로 화면의 세로 길이는 브라우저가 내용으로 정하고 백분율
  translate 도 그 새 상자에서 다시 풀린다 — 우리가 끼어들 숫자가 없다(그래서
  끌기 중과 확정 뒤가 같다).
- 세로 좌표는 **높이를 정한 뒤에** 계산한다(그 항이 새 높이를 알아야 한다).

★ **이것이 "고정 기준점이 튀지 않는다"의 뜻이다.** 보정이 없으면 `origin` 이
`right` 인 테이프를 오른쪽으로 키울 때 상자가 **왼쪽으로** 자라고, 손을 놓는
순간 다시 그려진 자리가 끌던 자리와 다르다. 보정이 있으면 반대편 변이 제자리에
남고 live preview 와 재렌더가 같다(실측: 위쪽 변 0.00px).

### 26-6. 패널의 다섯 칸

프레임 내부 요소와 overlay 를 고르면 왼쪽 패널이 **X · Y · Width · Height ·
Rotation** 이 된다(`1A` 에서는 읽기 전용 요약이었다).

- 값은 **그 선택의 자 위의 숫자**다 — 직접 조작이 쓰는 그 자 하나이므로,
  손으로 끈 결과와 패널의 숫자가 언제나 같은 단위다.
- 무슨 자인지 **패널이 한 줄로 적는다**(도화지 좌표 / 프레임 내부 좌표 /
  프레임 좌표 — 기준점에서 옮긴 자리). 숫자만 보면 알 수 없다.
- `follow` 는 읽기 전용으로 함께 보여 준다(프레임 내부만).
- 숫자 칸의 규칙은 v1 · v2 블록과 같다(§22-3 · §25-4) — 입력 중에는 아무것도
  쓰지 않고 Enter · blur 에서 **한 번** 쓴다. 그래서 한 칸의 한 편집 세션이
  Undo 한 칸이고, `-` 나 빈 문자열 같은 중간 상태가 JSON 에 들어가지 않는다.
- 각도는 한 바퀴 안으로 접힌다(`normalizeSkinHomeCanvasRotation` — 손으로 돌린
  결과와 같은 자).
- 화면에 적는 숫자는 **소수 셋째 자리까지**다(pin 의 X · Y 는 배율에 따라 긴
  소수가 될 수 있다). 저장값을 깎는 것이 아니고, `expected` 는 언제나 자에서
  읽은 그 숫자다.
- `height:"auto"` 인 요소의 Height 칸은 **잠긴다**. 여기서 숫자를 지어내지
  않는다 — 세로 손잡이로 끌면 화면에서 잰 높이로 숫자가 된다(§18-3).
- 자를 만들 수 없는 프레임(가용 폭이 0 등)에서는 예전처럼 **읽기 전용
  요약**과 그 이유를 적는다.

### 26-7. 블록은 그대로 — 자를 주지 않는다

블록을 고르면 `studioCanvasV2Space()` 가 null 이고, 따라서 geometry 도
내려가지 않는다. 프레임은 그것이 없으면 제스처를 시작하지 않는다
(`dragGate` → `"no-geometry"`). **막는 것이 아니라 애초에 주지 않는다** —
§25-6 의 그 결정이 블록에는 그대로 남는다.

블록의 순서 · 정렬 · 여백 · 폭 · 높이 패널(§25-4)과 v1 의 이동 · 리사이즈 ·
회전은 한 줄도 바뀌지 않았다(E2E 가 그 둘을 직접 다시 본다).

### 26-8. 남은 차이

- **블록을 고르면 Moveable 손잡이 DOM 이 남아 있다.** 블록은 자유 배치
  요소가 아니라 Moveable 의 target 이 `null` 이고, 0.53.0 은 그때도 control
  box 를 만든다. 자를 주지 않으므로 **끌어도 저장값은 한 칸도 바뀌지
  않지만**(E2E 가 그것을 본다) 쓸 수 없는 손잡이가 보인다. 고치는 자리는
  runtime 의 `setMoveableTarget()` 한 곳이고, 그 변경은 v1 그룹 선택과 함께
  봐야 한다 — `HOME-CANVAS-TRANSFORM-1D`.
- **`pin.target` · `anchor` · `origin` 을 고르는 UI 가 없다.** 지금은 저장된
  고정 관계를 유지하면서 offset 만 바뀐다. 그 세 칸을 바꾸는 것은 묶기 UX 와
  함께 정한다 — `HOME-CANVAS-V2-GROUP-1`.
- **`height:"auto"` 를 패널에서 켜고 끄는 스위치가 없다.** v1 은 화면에서 잰
  높이를 쓰지만(§22-3) v2 프레임 내부의 실제 높이는 프레임에서 재야 한다 —
  이 라운드는 재지 않았다. 세로 손잡이로 끌면 숫자가 되고, 되돌리는 것은
  Undo 다.
- **새 요소 추가 · `메인 비주얼로 묶기`/`묶기 해제` · 그룹 조작 · Crop 연결 ·
  효과 설정 · 레이어 목록 · `hidden`/`locked` 토글** — 그대로 없다.

### 26-9. 이 라운드가 만들지 않은 것

새 요소 추가 · 블록 추가/삭제 · `메인 비주얼로 묶기`/`묶기 해제` · 그룹
조작 · Crop · 효과 설정 · 레이어 목록 · `hidden`/`locked` 토글 · v1→v2 변환 ·
기본 스킨 변경 · `row`/`grid` 블록 · responsive override ·
CATEGORY/POST/BANNER 캔버스 · 손가락 조작(v1 과 같은 이유로 의도적 미지원).

`APP_BUILD_VERSION` 은 올리지 않았다(배포하지 않았다).
