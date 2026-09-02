# Imory Design Tokens v0.1 — 매핑표

`core/design-tokens.css`에 정의된 토큰과 기존 CSS의 literal 값을 매핑한 표.
**이 문서는 참고용이며, 아직 기존 CSS 파일의 값을 토큰으로 치환하지 않았다.**
치환은 이 표를 기준으로 단계적으로 진행한다.

## 분류 기준

- **system**: `admin/*`, `customize/editor/*`, `home/*`, `posts/*` 중 소유자 전용 편집 UI·에디터 툴바·관리 컨트롤
- **theme**: `themes/sua/*`, `posts/*` 중 방문자가 보는 글 목록·상세·preview/viewer
- `posts/*`는 파일 단위가 아니라 **accent 색상 계열로 역할이 실제로 갈라지는 것을 확인**했다 (`#e39ab5`/`#c66f8e` 조합 = system, `#ee9fbd`/`#d980a2` 조합 = theme). `posts-list-detail.css`, `posts-mobile.css`는 system pink를 전혀 쓰지 않아 theme로 분류.

## system / theme 기본값 통일 (3차 수정)

`--theme-*`는 이후 사용자 스킨·AI 커스터마이징이 `--theme-*`만 덮어써서 홈 디자인을 바꿀 수 있도록 **네임스페이스만 미리 분리**해둔 것이다. 아직 커스터마이징 레이어가 없는 지금 단계에서는 system과 시각적으로 다를 이유가 없어, `--theme-*` 기본값이 `--system-*`과 **동일한 primitive**를 가리키도록 정렬했다.

- `--theme-bg` → `--imory-white` (기존과 동일, 변경 없음)
- `--theme-surface`: `--imory-white` → **`--imory-gray-50`** (system-surface와 동일하게)
- `--theme-text`: `--imory-gray-700`(`#555555`) → **`--imory-gray-800`**(`#333333`, system-text와 동일)
- `--theme-text-muted` → `--imory-gray-500` (기존과 동일, 변경 없음)
- `--theme-border` → `--imory-gray-100` (기존과 동일, 변경 없음)
- `--theme-accent`: `--imory-pink-theme`(`#ee9fbd`) → **`--imory-pink-system`**(`#e39ab5`, system-accent와 동일)
- `--theme-accent-hover`: `--imory-pink-theme-strong`(`#d980a2`) → **`--imory-pink-system-strong`**(`#c66f8e`)
- `--theme-accent-soft`: `--imory-pink-50`(`#fff5f8`) → **`--imory-pink-25`**(`#fffafb`)

`pink-theme` / `pink-theme-strong` / `pink-theme-border` / `pink-50` / `gray-700` primitive 자체는 지우지 않았다 — `themes/sua/*.css`(`heart-interaction.css`, `cover-profile.css`)와 `posts-list-detail.css` 같은 theme 분류 파일이 **지금도 실제로 이 값을 리터럴로 쓰고 있기 때문**이다. 다만 semantic 기본값에서는 더 이상 연결하지 않고, 향후 커스터마이징 레이어가 생기면 그쪽에서 다시 참조할 수 있도록 primitive만 남겨뒀다.

> ⚠️ **주의**: 이 정렬 때문에 `--theme-accent`의 기본값(`#e39ab5`)이 `themes/sua/*`, `posts-list-detail.css`의 실제 리터럴(`#ee9fbd`)과 지금 서로 다르다. 따라서 나중에 이 파일들의 리터럴을 토큰으로 치환하는 단계에서 `--theme-accent`를 그대로 연결하면 **시각적으로 바뀐다** (하트/태그 색이 `ee9fbd` → `e39ab5`로). 커스터마이징 레이어가 생기기 전까지 이 파일들은 치환을 보류하거나, 치환하더라도 `pink-theme` primitive를 직접 참조하는 것을 권장한다 — 이 부분은 실제 치환 단계에서 다시 확인이 필요하다.

---

## 1. Color

### 1-1. Neutral (Core)

| 기존 값 | 토큰 | 대표 사용처 |
|---|---|---|
| `#ffffff` | `--imory-white` (`--system-bg`, `--theme-bg`) | body 배경 |
| `#fafafa` | `--imory-gray-50` (`--system-surface`, `--theme-surface`) | 카드/입력창 옅은 surface |
| `#eeeeee` | `--imory-gray-100` (`--system-border`, `--theme-border`) | 기본 divider/border (가장 빈도 높음) |
| `#dddddd` | `--imory-gray-200` (`--system-border-strong`) | 진한 border |
| `#cccccc` | `--imory-gray-300` | border/disabled (아직 semantic 미배정) |
| `#aaaaaa` | `--imory-gray-400` (`--system-text-disabled`, `--system-text-faint`) | 비활성 아이콘/텍스트(`--system-text-disabled`) 또는 hint/caption/unit/icon glyph/기본(비선택) 상태 같은 "본문보다 낮은 우선순위의 보조 텍스트"(`--system-text-faint`, 신설) — 실사용처는 거의 전부 후자였다. 아래 "semantic 재검토 대상" 참고 |
| `#999999` | `--imory-gray-500` (`--system-text-muted`, `--theme-text-muted`) | placeholder, 보조 텍스트 |
| `#777777` | `--imory-gray-600` | 라벨/보조 텍스트 (아직 semantic 미배정) |
| `#555555` | `--imory-gray-700` | 실제 `posts-list-detail.css`/`cover-profile.css` 본문 텍스트 리터럴 (현재 semantic 미배정 — `--theme-text`는 당분간 gray-800을 가리킴) |
| `#333333` | `--imory-gray-800` (`--system-text`, `--theme-text`) | 관리자 UI 기본 텍스트 / theme 기본 텍스트(system과 통일) |
| `#222222` | `--imory-gray-900` (`--system-text-strong`) | 제목/강조 텍스트 |

**Core에 넣지 않은 근접값 (literal 유지, v0.2에서 필요성 확인 후 추가 검토)**
`#f6f6f6`, `#f2f2f2`, `#f1f1f1`, `#e8e8e8`, `#e5e5e5`, `#bbbbbb`, `#666666`, `#c2c2c2`, `#c5c5c5`, `#c7c7c7`, `#c9c9c9`, `#d0d0d0`, `#d4d4d4`, `#b5b5b5`, `#b8b8b8`, `#b3b3b3`, `#c1c1c1`, `#ececec`, `#ededed`, `#dedede`, `#a9a9a9`, `#f5f5f5` 등

> **`#888888` 승격 (onboarding/category-type-select Core 편입 작업)**: `.category-type-select`가 Core Input(`.imory-field`/`.imory-field--sm`)으로 편입되면서 border/radius/background 등은 Core 기본값으로 대체됐지만, text color만은 Core 기본값(`--imory-gray-750`, `#444444`)과 시각적으로 크게 달라 합치지 않고 `--imory-gray-650`(`#888888`) primitive로 별도 승격해 로컬 override로 남겼다. semantic은 아직 배정하지 않음 — 실사용처가 `.category-type-select` 하나뿐이라 다른 outlier처럼 v0.2로 미루지 않고 이번에 바로 승격했다.

> **v0.2 우선 검토 후보: `#444444`** — 다수 파일(`admin-shell.css`, `admin-quote.css`, `posts-preview-export.css` 등)에서 반복 사용되어 다른 outlier보다 사용 빈도가 뚜렷이 높다. 이번 v0.1 Core 목록에서는 의도적으로 제외했지만, `--imory-gray-750` 등으로 다음 단계에서 우선적으로 검토한다.

### 1-2. Pink — primitive는 두 계열, semantic 기본값은 system으로 통일

primitive는 실제 리터럴이 서로 다른 두 계열이라 이름으로 구분해뒀지만, `--theme-accent*`의 **기본값**은 지금 단계에서 `--system-accent*`와 같은 primitive(pink-system 계열)를 가리킨다 (위 "system / theme 기본값 통일" 참고).

| 기존 값 | 토큰 | 이 값을 실제로 쓰는 곳 | 현재 semantic |
|---|---|---|---|
| `#e39ab5` | `--imory-pink-system` | `admin-settings.css .save-button:hover` text, `customize-save-button:hover` text 등 | `--system-accent`, `--theme-accent` |
| `#e7c7d3` | `--imory-pink-system-border` | 위 버튼들의 `:hover` border-color | `--system-accent-border` (theme은 대응 토큰 없음) |
| `#fffafb` | `--imory-pink-25` | 위 버튼들의 `:hover` background | `--system-accent-soft`, `--theme-accent-soft` |
| `#c66f8e` | `--imory-pink-system-strong` | `.customize-page-tab.active` 등 "한 단계 진한" 상태 | `--system-accent-hover`, `--theme-accent-hover` |
| `#ee9fbd` | `--imory-pink-theme` | 하트, 태그, 홈 하이라이트 (`posts-list-detail.css`, `home-base.css`, `heart-interaction.css`) — **sua 테마가 지금도 쓰는 실제 색** | 미배정 |
| `#d980a2` | `--imory-pink-theme-strong` | 위 요소들의 hover/active | 미배정 |
| `#f0d3de` | `--imory-pink-theme-border` | `#ee9fbd` 옅은 border | 미배정 |
| `#fff5f8` | `--imory-pink-50` | `ee9fbd`/`d980a2` 계열이 쓰는 옅은 배경 | 미배정 |

> **system-accent 구조 변경(2차 수정)**: 처음에는 `--system-accent`를 버튼의 solid fill로 취급하고 `--system-accent-soft`를 `#fff5f8`(admin-quote.css 등 다른 곳의 옅은 배경)로 잡았었다. 그런데 실제 SETTINGS 화면의 `.save-button`을 확인해보니 **기본 상태는 회색**(`border:#e8e8e8`, `color:#777777`, `background:#ffffff`)이고 **핑크는 hover에서만** 나타나며, 그 hover 배경은 `#fff5f8`가 아니라 `#fffafb`였다. 이에 맞춰 `--system-accent-soft`를 `#fffafb`로 정정하고, `--system-accent-border`를 새로 추가했다. `--system-accent`는 이제 "버튼 배경색"이 아니라 **system UI의 포인트 컬러 자체**로 해석하며, 기본 system button은 흰 배경 + `accent-border` + `accent` 텍스트, hover에서만 `accent-soft` 배경 + `accent-hover`로 정의한다 (실제 `.save-button`/`.customize-save-button` 서비스 CSS는 아직 바꾸지 않았고, 토큰 파일과 미리보기 페이지만 이 기준을 따른다).

**Outlier — literal 유지 (v0.2에서 결정)**
`#fff8fa`, `#e0bdca`, `#e6bdcc`, `#e7b3c7`, `#e7b6c8`, `#e8afc4`, `#e8b7c9`, `#e8c1d0`, `#d985a5`, `#df8eac`, `#c3a2af`, `#c4a6b2`, `#e893b4`, `#f4dce6`

### 1-3. Red (danger, editor.css 전용)

| 기존 값 | 토큰 |
|---|---|
| `#fff5f5` | `--imory-red-50` |
| `#e7bcbc` | `--imory-red-200` |
| `#c65a5a` | `--imory-red-500` |

`--system-danger*` semantic은 아직 만들지 않았다 (요청받은 semantic 목록에 없어 범위 밖으로 둠). 필요 시 다음 단계에서 추가.

---

## 2. Typography

| 기존 값 | 토큰 |
|---|---|
| `"Pretendard", sans-serif` | `--system-font-family`, `--theme-font-family` |
| `"Nanum Myeongjo", serif` | `--theme-font-family-serif` (사용자가 선택 가능한 콘텐츠 폰트, JS로 조건부 적용) |
| `9px` | `--imory-font-size-100` |
| `10px` | `--imory-font-size-200` |
| `11px` | `--imory-font-size-300` |
| `12px` | `--imory-font-size-400` |
| `13px` | `--imory-font-size-500` |
| `14px` | `--imory-font-size-600` |
| `16px` | `--imory-font-size-700` |
| `400` | `--imory-font-weight-regular` |
| `500` | `--imory-font-weight-medium` |
| `1` | `--imory-line-height-tight` |
| `1.4` | `--imory-line-height-snug` |
| `1.5` | `--imory-line-height-base` |
| `1.6` | `--imory-line-height-relaxed` |
| `1.9` | `--imory-line-height-loose` |

**토큰화하지 않은 값 (literal 유지)**: `8px, 15px, 17px, 18px, 20px, 22px, 24px, 28px`, 0.5px 단위 반응형 미세값, `font-weight: 300/600`, `line-height: 1.65/1.7/1.8` (1.4/1.6과 근접해 드리프트로 추정되지만 v0.1에서는 흡수하지 않음)

---

## 3. Spacing (Core: 4 / 8 / 12 / 16 / 20 / 24px)

| 기존 값 | 토큰 |
|---|---|
| `4px` | `--imory-space-100` |
| `8px` | `--imory-space-200` |
| `12px` | `--imory-space-300` |
| `16px` | `--imory-space-400` |
| `20px` | `--imory-space-500` |
| `24px` | `--imory-space-600` |

**literal 유지 (현재 디자인 보존)**: `2, 3, 5, 6, 7, 9, 10, 14, 18, 22, 26, 28, 30, 32, 34, 36, 38, 40, 44, 46, 48, 54, 56, 60px`

---

## 4. Radius

| 기존 값 | 토큰 |
|---|---|
| `2px` | `--imory-radius-100` |
| `4px` | `--imory-radius-200` |
| `6px` | `--imory-radius-300` |
| `999px` | `--imory-radius-pill` |
| `50%` | `--imory-radius-circle` |

**literal 유지**: `5px` (admin-shell.css 1곳), `8px` (admin-shell.css 1곳), `16px` (posts-mobile.css 1곳)

---

## 5. Border / Shadow

| 기존 값 | 토큰 |
|---|---|
| `1px` (border-width, 프로젝트 내 유일값) | `--imory-border-width` |
| `0 0 0 1px #e39ab5` (focus ring, editor.css 2곳) | `--system-shadow-focus-ring` |

elevation shadow(sm/md/lg)는 만들지 않음 — 프로젝트 전체에 box-shadow가 5회뿐이고 그중 3회는 `none`이라, 존재하지 않는 값을 새로 만들지 않기 위함.

---

## semantic 재검토 대상 — 해결됨 (`--system-text-faint` 신설)

- **`#aaaaaa` (`--imory-gray-400`)** — `admin-shell.css` 6곳(`.login-desc`, `.user-email`, `.home-desc`, `.menu-copy small`, `.back-button`, `.view-heading p`)이 모두 이 값을 쓰는데, 실제 역할은 전부 **muted/secondary description text**이고 실제 비활성(disabled) 상태 요소는 하나도 없다. 값은 `--system-text-disabled`와 정확히 일치하지만 이름이 실제 역할과 맞지 않는다는 문제가 있었다.
- Empty State 조사(아래 참고)에서 `admin-quote.css`/`customize/editor.css`까지 합쳐 `#aaaaaa` 사용처가 11곳으로 재확인되면서, `--system-text-disabled`와 분리된 **`--system-text-faint: var(--imory-gray-400)`를 `core/design-tokens.css`에 신설**했다. `--system-text-disabled`는 의미를 바꾸지 않고 그대로 둔다.
- 정확히 `#aaaaaa`와 일치하는 11곳만 이번에 `var(--system-text-faint)`로 치환했다(전부 값 동일 — 시각 변화 없음): `admin-shell.css`의 `.login-desc`/`.user-email`/`.home-desc`/`.menu-copy small`/`.back-button`/`.view-heading p`(6곳), `admin-quote.css`의 `.quote-accordion-icon`/`.quote-ratio-button`(기본 상태)/`.quote-special-heading small`(3곳), `customize/editor/editor.css`의 `.customize-accordion-icon`/`.customize-field-unit`(2곳).
- `#b5b5b5`(8곳: `.settings-group-title small`, `.quote-preview-heading small`, `.quote-unit`×2, `.customize-editor-subtitle`, `.customize-panel-hint`, `.customize-field-hint`, `.customize-elements-empty`), `#b8b8b8`(2곳: `core/patterns/tabs.css` `.imory-tab--text` 기본색, `.quote-accordion-toggle small`), `#bbbbbb`(5곳: `.quote-preset-empty`, `.my-banner-preview-empty`, `.coming-soon-text`, `.quote-preset-activate` 기본 상태, `.menu-arrow`)는 **같은 역할(faint) 후보 군집이지만 값이 `#aaaaaa`와 미세하게 달라 이번에는 literal로 유지**한다 — `--system-text-faint`로 흡수할지는 드리프트를 의식적으로 받아들이는 별도 결정이 필요해 다음 단계로 미룬다.

## 적용 현황 (실서비스 연결 시작)

- `index.html`에 `core/design-tokens.css`를 CSS 섹션 맨 앞으로 `<link>` — 토큰이 처음으로 실제 서비스 페이지에 연결됨.
- `admin/index.html`에도 `core/design-tokens.css`를 CSS 섹션 맨 앞(`admin-shell.css`보다 먼저)으로 `<link>` 추가 — 기존 로드 순서(`admin-shell.css` → `admin-settings.css` → `admin-quote.css`)는 유지.
- `admin-settings.css` literal → token 치환 (6곳):
  - `.settings-group-title`(border-bottom), `.editor-block textarea`(border), `.setting-input`(border), `.my-banner-preview`(border), `.my-banner-preview-empty`(border) — `#eeeeee` → `var(--system-border)`
  - `.settings-tab-divider`(color) — `#dddddd` → `var(--system-border-strong)`
- `admin-shell.css` literal → token 치환 (15곳):
  - `body`(background), `.google-login-button`(background), `.logout-button`(background) — `#ffffff` → `var(--system-bg)`
  - `.google-login-button:hover`, `.logout-button:hover`, `.admin-menu-item:hover`(background) — `#fafafa` → `var(--system-surface)`
  - `body`(color) — `#333333` → `var(--system-text)`
  - `.logout-button`(color) — `#999999` → `var(--system-text-muted)`
  - `.google-icon`, `.admin-header`, `.logout-button`, `.customize-embed`, `.admin-menu`, `.admin-menu-item`(border 계열, 6곳) — `#eeeeee` → `var(--system-border)`
  - `.google-login-button:hover`(border-color) — `#dddddd` → `var(--system-border-strong)`
  - `#aaaaaa` 6곳은 위 "semantic 재검토 대상" 사유로 literal 유지.
- `themes/sua/heart-interaction.css`에 SUA 전용 override 추가:
  ```css
  .heart-group,
  .love-event {
    --theme-accent: var(--imory-pink-theme);
    --theme-text: var(--imory-gray-600);
  }
  ```
  (`--theme-*` 기본값은 system과 통일되어 있지만, SUA 서브트리 안에서만 SUA 실제 값으로 override — "system / theme 기본값 통일" 항목 참고)
- literal → token 치환 시험 (딱 2곳, 나머지 SUA literal은 그대로):
  - `themes/sua/heart-interaction.css` `.love-drop` — `color: #ee9fbd` → `color: var(--theme-accent)`
  - `themes/sua/cover-profile.css` `.profile-text`, `.more-text` — `color: #777777` → `color: var(--theme-text)`
- `.love-message`(`#e893b4`, outlier)와 border 관련 항목은 시험 대상에서 제외 — 매핑표 근거 없이 억지로 채우지 않음.
- `admin-quote.css` literal → token 치환 (17곳):
  - `.quote-accordion`(border-top), `.quote-accordion:last-child`(border-bottom), `.quote-ratio-button`(border), `.quote-preview-stage`(border), `.quote-controls`(모바일, border-top), `.quote-mobile-tabbar-wrap`(모바일, border-bottom), `.quote-preset-list`(border-top), `.quote-preset-item`(border-bottom) — `#eeeeee` → `var(--system-border)` (8곳)
  - `.quote-text-input`/`.quote-test-textarea`/`.quote-select-input`, `.quote-ratio-button`, `.quote-number-input`, `.quote-color-input`, `.quote-controls`(모바일), `.quote-mobile-tabbar-wrap`(모바일) — `#ffffff` → `var(--system-bg)` (6곳)
  - `.quote-ratio-button.active`, `.quote-preview-stage` — `#fafafa` → `var(--system-surface)` (2곳)
  - `.quote-mobile-tab`(color) — `#999999` → `var(--system-text-muted)` (1곳)
  - `#ececec`, `#555555`, `#d9d9d9`, `#e5e5e5`, `#444444` 등 근접값은 치환하지 않고 literal 유지.
- `admin-quote.css`의 `.quote-preview-*`(title/text/source/canvas)는 관리자 UI가 아니라 **실제 발췌(카드) 결과물**을 렌더링하는 영역이라 판단해 system 토큰 치환에서 제외 — `#ffffff`(canvas 배경), `#222222`(title), `#333333`(text), `#999999`(source)는 값이 system 토큰과 정확히 일치해도 literal로 남김. content/theme 성격 영역은 관리자 화면 안에 있어도 system UI로 취급하지 않는다는 원칙을 여기서 처음 명문화.
- `.quote-accordion-icon`, `.quote-ratio-button`(기본 상태), `.quote-special-heading small`의 `#aaaaaa` 3곳도 같은 이유로 이번엔 literal 유지했었으나, 이후 "semantic 재검토 대상" 항목에서 `--system-text-faint` 신설과 함께 `var(--system-text-faint)`로 치환됨.

## semantic 재검토 대상 (추가) — 해결됨

- **`#aaaaaa`가 v0.2 재검토 대상인 이유가 `admin-quote.css`에서도 재확인됨.** 이 파일에서도 disabled 의미로 쓰인 곳은 하나도 없고, 아이콘(`.quote-accordion-icon`)·기본 상태 버튼 텍스트(`.quote-ratio-button`)·보조 캡션(`.quote-special-heading small`) 전부 **faint/subtle 보조 톤**으로 쓰인다. 위 "semantic 재검토 대상" 항목과 합쳐 `--system-text-faint` 신설 및 11곳 치환으로 정리했다.

## Empty State — Pattern/Component로 만들지 않음

`.quote-preset-empty`(admin-quote.css) / `.my-banner-preview-empty`(admin-settings.css) / `.customize-elements-empty`(customize/editor/editor.css) 3곳을 조사했으나, box model 속성 자체가 다르고(margin vs padding) 값도 다르며(12px vs 14px) 테두리 유무도 갈려서(dashed box는 1곳뿐) 공유되는 규칙이 색상 하나뿐이었다. Section Header 때처럼 구조(flex/gap 등)가 실제로 일치하는 경우가 아니라 `.imory-empty-state` 같은 Pattern/Component를 만들지 않기로 했다 — 억지로 만들면 실제로 묶이는 코드 없이 빈 껍데기만 남는다. 각자 local layout은 유지하고, 색 통일(`#bbbbbb`/`#b5b5b5` → `--system-text-faint` 흡수 여부)만 위 "semantic 재검토 대상" 항목의 남은 후보 군집과 함께 다음 단계에서 판단한다. `.coming-soon-text`(admin-settings.css)는 "리스트가 비었다"가 아니라 "기능 자체가 아직 없다"는 다른 역할이라 애초에 Empty State 공용화 대상에서 제외했다.

## 다음 단계

1. 브라우저에서 SUA 하트/텍스트 색이 기존과 동일한지, system UI(메뉴 등)에 변화가 없는지 육안 확인
2. `admin-quote.css` 적용분도 관리자 화면에서 아코디언/버튼/입력창/모바일 탭바 육안 확인
3. **system 토큰의 실전 검증은 `admin-shell.css` + `admin-settings.css` + `admin-quote.css` 적용으로 충분히 확인됐다고 보고, 추가적인 대규모 literal 일괄 치환은 여기서 잠시 멈춘다.** 남은 outlier/근접값 정리는 v0.2로 미룬다.
4. 다음 작업은 **Core Components v0.1** 설계로 이동 (버튼/입력/탭 등 반복 패턴을 컴포넌트 단위로 정리) — 이 문서는 계속 참고용으로 유지하되, 컴포넌트 설계는 별도 문서에서 진행.
5. 토큰 미리보기 테스트 페이지(`core/design-tokens-preview.html`)는 별도로 유지, 실서비스와 무관
