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
| `#aaaaaa` | `--imory-gray-400` (`--system-text-disabled`) | 비활성 아이콘/텍스트 — ⚠️ 아래 "semantic 재검토 대상" 참고 |
| `#999999` | `--imory-gray-500` (`--system-text-muted`, `--theme-text-muted`) | placeholder, 보조 텍스트 |
| `#777777` | `--imory-gray-600` | 라벨/보조 텍스트 (아직 semantic 미배정) |
| `#555555` | `--imory-gray-700` | 실제 `posts-list-detail.css`/`cover-profile.css` 본문 텍스트 리터럴 (현재 semantic 미배정 — `--theme-text`는 당분간 gray-800을 가리킴) |
| `#333333` | `--imory-gray-800` (`--system-text`, `--theme-text`) | 관리자 UI 기본 텍스트 / theme 기본 텍스트(system과 통일) |
| `#222222` | `--imory-gray-900` (`--system-text-strong`) | 제목/강조 텍스트 |

**Core에 넣지 않은 근접값 (literal 유지, v0.2에서 필요성 확인 후 추가 검토)**
`#f6f6f6`, `#f2f2f2`, `#f1f1f1`, `#e8e8e8`, `#e5e5e5`, `#bbbbbb`, `#888888`, `#666666`, `#c2c2c2`, `#c5c5c5`, `#c7c7c7`, `#c9c9c9`, `#d0d0d0`, `#d4d4d4`, `#b5b5b5`, `#b8b8b8`, `#b3b3b3`, `#c1c1c1`, `#ececec`, `#ededed`, `#dedede`, `#a9a9a9`, `#f5f5f5` 등

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

## semantic 재검토 대상

- **`#aaaaaa` (`--imory-gray-400`)** — `admin-shell.css`에서 6곳(`.login-desc`, `.user-email`, `.home-desc`, `.menu-copy small`, `.back-button`, `.view-heading p`)이 모두 이 값을 쓰는데, 실제 역할은 전부 **muted/secondary description text**이고 실제 비활성(disabled) 상태 요소는 하나도 없다. 값은 `--system-text-disabled`와 정확히 일치하지만 이름이 실제 역할과 맞지 않아, 이 6곳은 이번 admin-shell.css 치환에서 **literal로 유지**했다.
- 반복도로 볼 때 별도 `--system-text-subtle` 같은 semantic token 신설이 합리적일 수 있으나, 지금 단계에서는 만들지 않는다 — 다른 파일(예: `admin-settings.css`, `admin-quote.css`)의 `#aaaaaa`/근접 muted-text 사용처를 더 확인한 뒤 v0.2에서 결정.

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

## 다음 단계

1. 브라우저에서 SUA 하트/텍스트 색이 기존과 동일한지, system UI(메뉴 등)에 변화가 없는지 육안 확인
2. 확인되면 파일 단위로 점진적 치환 계속 진행 (지금은 위 2곳뿐)
3. 치환 과정에서 발견되는 추가 outlier는 이 표에 계속 추가
4. 토큰 미리보기 테스트 페이지(`core/design-tokens-preview.html`)는 별도로 유지, 실서비스와 무관
