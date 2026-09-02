---
title: Imory Design
---

# Imory Design

> 관련 문서: [Concept.md](./Concept.md) · [ToDo.md](./ToDo.md)
>
> 이 문서는 `core/design-tokens.css`, `core/components/*.css`, `core/patterns/*.css`, 그리고 실제 화면 CSS/HTML을 직접 읽고 작성했다. 표시 기준: **사실**(코드에 존재) / **계획**(사용자와 합의된 방향, 아직 미구현) / **제안**(이 문서에서 처음 제시하는 값, 코드에 없음) / **확인 필요**.
>
> 참고자료: `core/design-tokens-mapping.md`(과거 리터럴 값 → 토큰 치환 근거표, 이 문서와 다른 목적의 문서이며 수정하지 않았다).

---

## 4-1. 디자인 방향

다음은 프로젝트 소유자가 제시한 방향이며, 실제 코드(특히 `core/components/button.css`, `core/design-tokens.css`)가 이미 이 방향과 일치한다 — **사실**로 확인됨:

- 흰색 중심, 옅은 분홍색(`#e39ab5` 계열) 포인트 — `--system-accent`가 hover에서만 등장(평소엔 회색)
- 각진 직사각형: 버튼 radius `2px`(`--imory-radius-100`), 글 에디터 저장 버튼은 `border-radius: 0`
- 큰 그림자/과한 그라데이션 없음: 프로젝트 전체 `box-shadow` 사용 5회뿐(그중 3회는 `none`), gradient 사용처 확인 안 됨
- 여백은 4/8/12/16/20/24px(`--imory-space-100~600`) 체계로 절제됨
- 관리자 UI는 `core/components`·`core/patterns` 토큰 기반으로 일관성 유지 중(일부 화면 미적용 — 4-6 참고), 사용자 홈페이지(꾸미기 영역)는 `--theme-*` 네임스페이스로 분리되어 향후 개인화 여지를 남겨둠(계획)

## 4-2. 로고

**계획(미구현)** — 저장소 전체에서 "imory" 브랜드 로고 컴포넌트를 찾을 수 없다. 현재는 `auth/index.html`, `onboarding/index.html`의 `.login-box h1`(sans-serif, `font-size:20px; font-weight:500`)과 `index.html`의 `.landing-title`(placeholder 랜딩 전용, `font-size:28px; color:#333`)이 순수 텍스트로만 존재한다. serif 폰트, 분홍 세로선 등은 전혀 구현되지 않았다.

프로젝트 소유자가 제시한 스펙(계획):

- serif 소문자 `imory`
- 기본 글자색: 검정 또는 짙은 회색(`--imory-gray-800`/`--imory-gray-900` 후보)
- 우측에 얇은 분홍 세로선(`--imory-pink-system` 후보)
- 라이트/다크 모드에 맞춰 색상 전환
- 가능하면 이미지가 아닌 텍스트 + CSS로 구현
- 로고 비율, 최소 크기, 여백 규칙은 **확인 필요**(수치 미정) — 구현 단계에서 별도 결정 필요

로고 구현 자체는 이번 문서화 세션에서 하지 않는다.

## 4-3. 디자인 토큰

**사실** — `core/design-tokens.css` v0.1의 실제 정의값. 라이트/다크 모드 분기(`[data-theme]`, `prefers-color-scheme` 등)는 **현재 이 파일에 없음**(4-7 참고).

### Primitive — Color

| 토큰 | 값 |
|---|---|
| `--imory-white` | `#ffffff` |
| `--imory-gray-50`~`900` | `#fafafa`, `#eeeeee`, `#dddddd`, `#cccccc`, `#aaaaaa`, `#999999`, `#777777`, `#555555`, `#333333`, `#222222` |
| `--imory-gray-650` | `#888888`(outlier, `.category-type-select` 전용) |
| `--imory-gray-750` | `#444444`(outlier, Input 컴포넌트 필드 텍스트 전용) |
| `--imory-pink-25` | `#fffafb`(save-button:hover 배경) |
| `--imory-pink-50` | `#fff5f8`(sua 테마가 쓰는 옅은 배경, semantic 미배정) |
| `--imory-pink-system` | `#e39ab5`(system 포인트 컬러) |
| `--imory-pink-system-border` | `#e7c7d3` |
| `--imory-pink-system-strong` | `#c66f8e`(active 상태) |
| `--imory-pink-theme` | `#ee9fbd`(sua 테마 실사용 accent, semantic 미배정) |
| `--imory-pink-theme-border` / `-strong` | `#f0d3de` / `#d980a2`(semantic 미배정) |
| `--imory-red-50/200/500` | `#fff5f5` / `#e7bcbc` / `#c65a5a`(삭제·경고 전용) |

> **불일치 기록**: `--theme-accent`의 현재 기본값(`--imory-pink-system` = `#e39ab5`)과 sua 테마가 실제로 쓰는 색(`--imory-pink-theme` = `#ee9fbd`)이 서로 다르다. 커스터마이징 레이어가 아직 없어 의도적으로 통일해둔 상태(주석에 명시)이며, 향후 사용자별 테마 커스터마이징을 만들 때 재검토가 필요하다.

### Semantic — system(관리자/에디터 UI)

`--system-bg`(white) / `--system-surface`(gray-50) / `--system-text`(gray-800) / `--system-text-strong`(gray-900) / `--system-text-muted`(gray-500) / `--system-text-disabled`(gray-400) / `--system-text-faint`(gray-400, disabled와 값은 같지만 의미가 다른 별도 토큰) / `--system-border`(gray-100) / `--system-border-strong`(gray-200) / `--system-accent`(pink-system) / `--system-accent-border` / `--system-accent-soft` / `--system-accent-hover`

### Semantic — theme(사용자 홈페이지)

`--theme-bg` / `--theme-surface` / `--theme-text` / `--theme-text-muted` / `--theme-border` / `--theme-accent` / `--theme-accent-hover` / `--theme-accent-soft` — **현재 전부 system과 동일한 primitive를 가리킨다**(커스터마이징 레이어 부재로 인한 임시 결정, 주석에 명시).

### Typography

- `--system-font-family` / `--theme-font-family`: `"Pretendard", sans-serif`
- `--theme-font-family-serif`: `"Nanum Myeongjo", serif`(사용자가 선택 가능한 콘텐츠 폰트)
- `--imory-font-size-100~700`: 9 / 10 / 11 / 12 / 13 / 14 / 16px
- `--imory-font-weight-regular/medium`: 400 / 500
- `--imory-line-height-tight/snug/base/relaxed/loose`: 1 / 1.4 / 1.5 / 1.6 / 1.9

### Spacing

`--imory-space-100~600`: 4 / 8 / 12 / 16 / 20 / 24px

### Radius

`--imory-radius-100/200/300`: 2 / 4 / 6px, `--imory-radius-pill`: 999px, `--imory-radius-circle`: 50%

### Border / Shadow

`--imory-border-width`: 1px. elevation shadow 토큰 **없음**(제안 필요 시 v0.2 대상). `--system-shadow-focus-ring`: `0 0 0 1px var(--system-accent)`(focus ring 전용, 유일한 shadow 토큰).

### Breakpoint / z-index

**토큰 없음.** 실제 CSS는 `@media (max-width: 600px)`(posts/admin/quote/sua 테마 공통)와 `@media (max-width: 900px)`(customize 에디터)를 리터럴로 반복 사용 중 — **제안**: `--imory-breakpoint-mobile: 600px`, `--imory-breakpoint-tablet: 900px` 토큰화. z-index는 리터럴 사용처를 이번 조사에서 전수 확인하지 않음 — 확인 필요.

## 4-4. 타이포그래피

- **본문 폰트**: Pretendard(`--system-font-family`/`--theme-font-family`) — 사실
- **로고 폰트 방향**: serif — 계획(미구현, 4-2 참고)
- **콘텐츠 serif 옵션**: Nanum Myeongjo(`--theme-font-family-serif`), 사용자가 글/홈에서 선택 가능한 폰트로 존재 — 사실(토큰 존재), 실제 선택 UI 연결 여부는 확인 필요
- **제목/본문 크기 체계**: 토큰 자체는 9~16px 7단계(`--imory-font-size-100~700`)뿐이며, "이 크기는 제목용, 이 크기는 본문용"이라는 역할 매핑은 아직 문서화되어 있지 않다 — 확인 필요(화면마다 로컬로 다르게 사용 중, `core/design-tokens-mapping.md` 참고)
- **버튼 라벨**: `--imory-font-size-200`(10px, md) / `--imory-font-size-100`(9px, sm), `letter-spacing: 0.06em`, 영문 소문자(`save`, `new` 등 실제 코드에서 소문자 사용 확인) — 사실
- **라벨(`.imory-label`)**: 10px, `letter-spacing: 0.08em`, gray-600 — 사실
- **탭 텍스트**: 9px, `letter-spacing: 0.08em` — 사실
- **영문 대문자 UI 라벨 규칙**: `admin/index.html`의 탭 이름(`CATEGORY`/`HOME`/`DATA`), `SAVE` 버튼 등 섹션급 라벨은 대문자, 버튼 내부 텍스트(`save`, `new`)는 소문자로 쓰는 경향이 관찰됨 — 통일된 규칙 문서는 없음, **제안**: "섹션/탭 제목은 대문자, 버튼/액션 텍스트는 소문자"를 명문화
- **모바일 크기**: 화면별로 로컬 override(`posts-mobile.css`의 `.post-editor-button { font-size: 9px }` 등) — 공통 규칙 없음, 확인 필요
- **굵기**: `--imory-font-weight-regular`(400) / `-medium`(500) 2단계뿐, bold(700) 사용처는 이번 조사에서 별도 확인 안 됨 — 확인 필요

## 4-5. 레이아웃과 간격

**사실**로 확인된 값:

- **모바일 breakpoint**: `600px`(posts/admin/quote/sua 테마 공통), customize 에디터만 `900px` — 불일치이자 사실상의 표준은 600px
- **safe area 처리**: `env(safe-area-inset-*)`가 `admin-quote.css`, `home-base.css`, `menu.css`, `bgm.css`, `posts-preview-export.css`, `posts-mobile.css` 6개 파일에서 사용됨 — 모바일 바텀시트/고정 UI 위주로 적용
- **관리자 셸**: `admin/admin-shell.css`가 로그인 박스/헤더/전체 레이아웃을 담당, `600px` 이하에서 별도 모바일 배치
- **customize 에디터**: 좌측 패널(페이지 설정/요소 추가/요소 설정 3-way 탭) + 우측 `preview-frame.html`(데스크톱 1440×900, 모바일 390×844 실제 크기로 렌더 후 화면에서만 축소 표시)

**확인 필요**: 전체 페이지 최대 너비, 페이지 좌우 여백, 데스크톱/모바일 헤더의 공통 규격, Settings 패널·미리보기 영역의 표준 폭, 카드/섹션 간 표준 gap — 화면마다 로컬 값을 쓰고 있어 이번 조사에서 하나의 표준값으로 확정하지 못했다. `--imory-space-*` 토큰(4~24px)이 있지만 레이아웃 레벨(섹션 간격, 헤더 높이 등)에 일괄 적용되어 있는지는 확인 필요.

**제안**: 위 breakpoint 불일치(600px vs 900px)를 정리해 `--imory-breakpoint-mobile`/`-tablet` 토큰으로 통일하고, 레이아웃 관련 리터럴 값(헤더 높이, 페이지 max-width 등)을 실사용처 조사 후 v0.2 토큰으로 승격하는 작업을 후속 과제로 남긴다.

## 4-6. 컴포넌트

`core/components/`·`core/patterns/`에 실존하는 공용 컴포넌트만 기록한다. **"imory-*" 클래스가 실제로 존재**하며, `core/components/button-preview.html`·`input-preview.html`에서 독립적으로 검증 가능하다.

### Button (`core/components/button.css`)

- 클래스: `.imory-button`(base) + variant(`--primary`/`--secondary`/`--danger`/`--ghost`) + size(`--sm`/`--md`, 생략 시 md)
- 기본 형태: `border-radius: 2px`(각진 사각형), `min-height: 30px(md)/26px(sm)`, `padding: 6px 12px(md)/4px 8px(sm)`
- 색상: 기본은 흰 배경 + 회색 테두리(`--system-border`) + 회색 텍스트(`--system-text-muted`) — **평소엔 조용하고, hover/focus-visible에서만** `--system-accent`(핑크)로 신호. danger는 hover에서만 옅은 red. ghost는 배경/테두리 없이 텍스트만(`--imory-gray-400`)
- 상태: hover/focus-visible이 동일한 색 전환 공유, active는 hover보다 한 단계 더 진하게, disabled는 `opacity: 0.5` + `pointer-events: none`(`aria-disabled="true"`도 동일 처리)
- **적용 현황**: 컴포넌트 파일 주석은 "아직 실제 버튼에 치환 안 됨"이라고 되어 있지만, 실제로는 `admin/index.html`(`.save-button`), `customize/editor/index.html`(`.customize-save-button`), `onboarding/index.html`(`.setting-input`은 input이지만 버튼류도 일부 적용) 등에 이미 적용되어 있다 — 주석이 최신 상태를 반영하지 못함(불일치, 향후 주석 정리 필요)
- **SAVE 버튼**: `admin/admin-settings.css .save-button`은 `.imory-button.imory-button--primary.imory-button--md` 위에 레이아웃만 override(`min-width:58px; margin-right:14px`) — **크고 둥근 핑크 버튼이 아니라 작고 각진(2px radius) 버튼이며, 평소엔 회색, hover에서만 핑크**. 글 에디터(`posts/posts.html #postEditorSaveButton.post-editor-button.save`)는 Core 버튼을 아직 쓰지 않는 자체 CSS로, `border-radius: 0`(완전 직각), `min-width: 54px`, `font-size: 9px`, hover에서만 `color:#d985a5`로 신호 — 두 저장 버튼 모두 "우측/하단 배치, 작고 각진, 평소엔 조용함"이라는 프로젝트 소유자의 선호와 일치한다.

### Field/Input (`core/components/input.css`)

- 클래스: `.imory-field`(base, input/select 공통) + size(`--md` 38px / `--sm` 30px) + `--textarea`(resize/line-height override) + `--number`(우측 정렬)
- 기본: 흰 배경, `--system-border` 테두리, `--imory-gray-750`(#444) 텍스트, radius 2px
- 상태: hover는 의도적으로 변화 없음(조용한 기본 상태 유지), focus-visible에서만 `border-color: --system-accent`(box-shadow 없음 — 버튼과 달리 ring을 쓰지 않음), disabled는 opacity 0.5
- **적용 현황**: 아직 실서비스 input(`.setting-input`, `.quote-text-input` 등)에 치환되지 않은 설계 단계 산출물(주석에 명시) — "일부 구현"

### Label (`core/components/label.css`)

- `.imory-label` 하나만 존재(size/variant 없음): `margin-bottom:8px`, `font-size:10px`, `letter-spacing:0.08em`, `color:#777`

### Patterns — Form Actions (`core/patterns/form-actions.css`)

- `.imory-form-actions`: `display:flex; justify-content:flex-end`. 폼 안 primary 버튼을 부모의 display 값과 무관하게 안전하게 우측 정렬하는 레이아웃 전용 패턴(버튼 자체의 시각 규칙과 분리)

### Patterns — Section Header (`core/patterns/section-header.css`)

- `.imory-section-header`(base, flex+baseline+space-between+gap 20px) + `--divider`(구분선 있는 무거운 헤더, margin-bottom 24px) / `--plain`(여백만, margin-bottom 12px)

### Patterns — Tabs (`core/patterns/tabs.css`)

- `.imory-tab`(base) + `--text`(테두리 없는 텍스트 탭, hover에서 accent, active는 진한 gray — "선택됨 ≠ 포인트 컬러") + `--boxed`(테두리 박스 탭) + `--boxed-accent`(선택 후에도 accent 유지) / `--boxed-neutral`(선택되면 gray로 가라앉음)
- `.imory-tab-divider`: 탭 사이 `|` 문자 구분자

### 아직 Core 컴포넌트가 없는 것들(계획/확인 필요)

Select(별도 컴포넌트 없이 Field 재사용 추정), Checkbox, Toggle, Dialog, Bottom sheet, Notice, Empty state, Loading, Error state, Header, Navigation — 이번 조사에서 `core/components`·`core/patterns`에 전용 파일을 찾지 못했다. 각 화면(`posts-mobile.css`의 바텀시트, `admin-quote-mobile-tabs.js`의 모바일 탭 등)이 로컬 CSS로 유사 기능을 구현하고 있으나 공용화되어 있지 않다 — "계획됨" 또는 "확인 필요"로 표시.

## 4-7. 테마

**계획(확정, Q5 결정 반영)** — 현재 다크 모드 관련 코드는 저장소 전체에 없음(`data-theme`, `prefers-color-scheme`, 테마 토글, FOUC 방지 스크립트 모두 미발견). 확정된 정책:

- 저장된 사용자 선택이 없으면 `prefers-color-scheme`(시스템 설정)을 기본값으로 따른다
- 사용자가 라이트/다크 버튼으로 직접 선택하면 그 값을 브라우저(localStorage)에 저장하고, 이후 시스템 설정보다 우선한다
- 저장된 선택을 초기화하는 기능은 이번 범위에 포함하지 않는다
- 초기 렌더링 시 잘못된 테마가 잠깐 보이는 현상(FOUC)을 최소화해야 한다(구현 시 `<head>` 인라인 스크립트로 테마 클래스를 조기 적용하는 방식 검토 필요)
- 라이트/다크는 **Imory 시스템 UI**(관리자/에디터/공개 시작 페이지 등 `--system-*` 토큰 영역)에 적용된다
- 사용자가 꾸민 **공개 홈페이지의 개별 테마**(`--theme-*` 토큰 영역)는 시스템 UI 테마와 별개로 취급한다 — 즉 방문자가 다크 모드를 켜도 사용자가 커스터마이징한 홈페이지 디자인 자체는 영향받지 않는 것을 원칙으로 한다(구현 시 `--theme-*`가 `--system-*`의 다크 오버라이드를 상속하지 않도록 분리 필요)

## 4-8. 접근성

**사실**: `.imory-button`/`.imory-field`/`.imory-tab--text`/`.imory-tab--boxed` 모두 `:focus-visible` 규칙 보유(버튼/필드는 outline 대신 box-shadow ring 또는 border-color, 텍스트 탭은 `outline: 1px solid` + `outline-offset`). `disabled`는 `[aria-disabled="true"]`도 함께 처리하도록 설계됨.

**확인 필요/계획**:
- 색상 대비: 토큰 값 기준 WCAG AA 충족 여부 별도 검증 안 됨
- 아이콘 버튼의 접근 가능한 이름(`aria-label` 등) 적용 여부: 화면별 전수 확인 안 됨
- 입력 필드 라벨 연결(`<label for>` / `aria-labelledby`) 여부: 확인 필요
- 터치 영역(최소 44px 등) 기준: Field md가 38px로 일반 권장치보다 작음 — 확인 필요
- 모션 감소 설정(`prefers-reduced-motion`) 대응: 발견 안 됨, 확인 필요
- 오류 메시지의 스크린리더 전달 방식(`aria-live` 등): 확인 필요

## 4-9. 화면별 기준

| 화면 | 상태 | 근거 |
|---|---|---|
| 공개 시작 페이지(로고/라이트·다크 전환/SIGN IN) | 계획됨 | 현재 `index.html`은 slug 없을 때 개발 중 placeholder(`.landing-screen`)만 노출 |
| 로그인(`auth/`) | 구현 완료(최소 UI) | `.login-box`, "로그인 처리 중..." 메시지만 있는 화면, 화면 자체는 사용자가 오래 보는 곳이 아님(OAuth 콜백 처리 후 즉시 이동) |
| 온보딩(`onboarding/`) | 구현 완료 | `design-tokens.css` + `components/button.css`/`input.css` + `patterns/form-actions.css` 로드 — Core 컴포넌트가 실제로 연결된 화면 |
| 공개 홈페이지(`themes/sua/`) | 일부 구현(레거시 전용으로 재정의됨) | sua 계정 전용 하드코딩 마크업, 다른 사용자에게도 동일하게 노출되는 문제는 ToDo.md "출시 전 필수" |
| 글 목록 / 글 뷰어(`posts/`) | 구현 완료 | `posts.html`이 index.html에 fetch로 주입되는 프래그먼트 |
| 관리자 화면(`admin/`) | 구현 완료 | CATEGORY/HOME/DATA 3탭, `customize/editor/index.html`을 iframe으로 embed |
| 글 에디터 | 구현 완료 | Core 버튼 미적용(자체 CSS), 리치텍스트 + HTML 모드 지원 |
| Quote Preset(`admin/quote/`) | 구현 완료 | 실시간 프리뷰는 `<div>` DOM 갱신 방식(진짜 canvas 아님), 캡처 시점에만 html2canvas 사용 |
| 발췌 프리뷰(`posts/preview/`) | 구현 완료 | 페이지 자동 분할, 모바일 핀치줌/바텀시트 지원 |
| Settings(`admin/settings/`) | 구현 완료 | 파비콘/커서/BGM/블로그 타이틀/MY BANNER 저장 |
| 홈 커스터마이징(`customize/editor/`) | 일부 구현 | 블록 에디터·미리보기는 있으나 SAVE 버튼 비활성화(저장 미연결) |
