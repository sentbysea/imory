# AI SKIN AUDIT — PHASE 0 기존 아키텍처 조사 보고서

> 이 문서는 `IMORY_AI_SKIN_CUSTOMIZE_PLAN.md` 39조("구현 전에 반드시 조사할 것")와 40조 PHASE 0의 결과물이다.
> **코드/DB 변경 없음. 조사만 수행함.**
> 5개 병렬 조사(Customize 편집기/렌더러, 공개 Home/List/Post 라우팅, Quote Preset/Post Viewer, Supabase 스키마, 이미지 업로드/디자인 토큰)를 종합했다.
>
> **[업데이트] 기존 `home_customize`에 보존할 실사용 데이터가 사실상 없다는 판단에 따라 방향이 수정됨.** 새 Skin 시스템은 기존 block-JSON 구조와의 호환/병행 운영을 요구사항으로 두지 않으며, 별도 데이터 모델(`skins`/`skin_versions` 등)로 설계한다. 이 결정과 그에 따른 정리 계획은 맨 끝 **13절**에 정리했다 — 1~12절은 최초 PHASE 0 조사 결과(역사적 기록)로 그대로 남겨두고, 13절이 이를 갱신/구체화한다. 실제 삭제 작업은 아직 수행하지 않았다.

---

## 0. 프로젝트 기본 성격 (먼저 알아야 할 것)

- **빌드 시스템 없음.** 순수 HTML/CSS/JS. 번들러도, 프레임워크도, `package.json`도 없다. 모든 스크립트는 `<script src="...">`로 순서대로 로드되며 전역 함수/변수를 공유한다(예: `render-layout.js`가 정의한 `renderCustomizeLayout`을 `editor.js`와 `index.html`이 각각 전역으로 그냥 호출).
- **배포**: Cloudflare Pages. `_redirects`에 `/* /index.html 200` 단 한 줄 — 모든 경로가 `index.html`로 rewrite되고, 이후 라우팅은 전부 클라이언트 JS가 `window.location`을 읽어 처리한다(`core/lib/site-path.js`).
- **백엔드**: Supabase (Postgres + Auth + Storage + RLS), `@supabase/supabase-js@2`를 CDN으로 로드.
- **URL 구조** (`core/lib/site-path.js`):
  - `/:slug` → HOME
  - `/:slug/category/:id` → LIST (정규식 `^/category/(\d+)/?$`)
  - `/:slug/post/:id` → POST (정규식 `^/post/(\d+)/?$`)
  - 예약어(`admin`, `auth`, `posts`, `customize`, `themes` 등)는 slug로 해석되지 않음(`core/lib/reserved-slugs.js`).

---

## 1. 현재 아키텍처 요약

### 1-1. HOME 렌더링 — 이미 하나의 "미니 Skin Engine"이 존재한다 (가장 중요한 발견)

`profiles.home_mode` 컬럼(`customize` | `legacy_sua`) 하나로 완전히 배타적인 두 경로가 갈린다. 판단/분기는 `index.html`의 `initHomeRenderer()`가 한다.

- **`legacy_sua`**: 앱과 함께 배포되는 하드코딩된 단일 테마. `themes/sua/sua-home.html`(3D heart/model-viewer, "LOVE EVENT" 블록)을 fetch해서 `#themeMount`/`#themeLoveMount`에 주입하고, `heart-interaction.js`/`cover-profile.js`를 순서대로 실행한다. 블록/테마 모델도, `mode` 파라미터도, update/destroy 계약도 없는 **fetch-inject-run** 방식.
- **`customize`**: `home_customize.layout_json`(단일 jsonb 컬럼)에 저장된 블록 트리(`text/image/container/button/spacer/divider/columns` 7종)를 **`customize/renderer/render-layout.js`의 `renderCustomizeLayout({container, blocks, theme, contentArea, mode, actions})`** 로 렌더링한다.

핵심은 이 `renderCustomizeLayout`이 **에디터의 라이브 프리뷰와 공개 홈페이지에서 완전히 동일한 함수**라는 점이다(`index.html:2662-2666` 주석이 이를 명시적 설계 원칙으로 못박아 둠). 에디터는 `mode:"edit"`, 공개 홈은 `mode:"view"`만 다르게 넘긴다. 즉 "AI Skin Studio가 만들 미리보기 = 실제 공개 렌더러"라는 플랜 17조("별도의 Preview-only 렌더링 로직을 만들지 않는 방향")를 HOME에 한정해서는 **이미 구현해 놓은 상태**다.

렌더러 스택(로드 순서 고정):
```
block-defaults.js   → 블록 타입/props 스키마, enum, 숫자 range, 테마 기본값 (569줄)
default-layout.js   → 초기 레이아웃 기본값 (141줄)
theme-tokens.js      → {background,textColor,point} → 7개 --theme-* CSS 변수 (순수 함수, 197줄)
validate-layout.js  → rawLayout → {layout, valid, errors} 정규화/새니타이즈 (1545줄)
render-layout.js    → {container,blocks,theme,contentArea,mode,actions} → DOM (1765줄)
```

### 1-2. LIST / POST — HOME과 달리 추상화가 전혀 없다

`posts/posts.html`에 고정된 DOM ID(`#postList`, `#postDetail`, `#postDetailContent` 등, `posts/editor/posts-refs.js`가 top-level `const`로 선언)를 `posts/view/posts-view-list.js`, `posts/view/posts-view-detail.js`가 직접 `querySelector`/`innerHTML`로 조작하는 hand-rolled 렌더러다. `container`/`theme` 주입 개념 자체가 없다. 데이터 fetch와 DOM 조작과 `history.pushState`가 큰 함수 하나에 뒤섞여 있다(`openCategoryPage`, `openPostPage`).

즉 **HOME은 이미 Skin Engine의 원형을 갖고 있고, LIST/POST는 처음부터 새로 만들어야 하는 수준**이라는 비대칭이 이번 조사에서 가장 중요한 사실이다.

### 1-3. Post 본문 보호 경계 — 이미 명확히 존재한다 (관례 수준)

`posts/posts.html`의 DOM 구조:
```html
<article id="postDetail" class="post-detail">          ← CHROME
  <div class="post-detail-heading">...제목/액션...</div> ← CHROME
  <div class="post-detail-date">...</div>                ← CHROME
  <div class="post-detail-content-wrap">                 ← 경계 래퍼 (건드려도 됨)
    <div id="postDetailContent" class="post-detail-content">
      ← ★ 절대 건드리면 안 되는 영역 ★
    </div>
  </div>
</article>
```

Quote Preset(`quote_presets` 테이블, `settings` jsonb)은 post 본문에 **직접 박히지 않고 참조로 연결**된다 — `posts.quote_preset_id`가 preset id를 가리키고, 렌더 시점에 `posts/style/posts-style-render.js`가 preset의 타이포그래피 값(폰트/색/크기/줄간격 등)을 `#postDetailContent`에 **인라인 스타일**로 적용한다. 본문 HTML 자체(`post_contents.content`)는 `div/p/br/b/strong/i/em/u`와 화이트리스트 3종 `span` 클래스만 허용하는 새니타이저(`posts/posts-sanitize.js`)를 통과한 것만 저장된다.

플랜 9조의 `<article class="skin-post-body">[IMORY CONTROLLED POST CONTENT]</article>` 개념은 사실상 이미 `#postDetailContent`로 존재한다 — **단, 구조적으로 강제되는 게 아니라 관례일 뿐**이다. 인라인 스타일이 `font-family/color/font-size/font-weight/line-height/letter-spacing/text-align/word-break`는 덮어쓰기를 막아주지만, `background/border/padding/margin/box-shadow` 등은 스킨 CSS가 셀렉터만 겨누면(`.post-detail-content`, 혹은 `span`, `div`처럼 광범위한 셀렉터) 그대로 뚫린다. → **기술적 강제 장치가 아직 없다.** (6절 위험 요소 참고)

예외로 `content_type === "html"`인 레거시 포스트는 새니타이즈/preset 파이프라인을 완전히 건너뛰고 raw `innerHTML`을 그대로 꽂는다(`posts-view-detail.js`) — 같은 컨테이너를 쓰므로 Skin 격리 메커니즘은 이 경로도 동일하게 방어해야 한다.

### 1-4. Supabase 스키마 — 상당수 핵심 테이블이 migration 추적 밖에 있다

`supabase/migrations/`의 17개 파일이 실제로 CREATE TABLE 하는 건 `profiles`, `app_config`, `home_customize`, `admin_users`, `invite_links`, `invite_link_uses` 뿐이다. **`posts`, `post_contents`, `categories`, `banners`, `quote_presets`, `site_settings`, `daily_visits`는 migration에 CREATE TABLE이 없다** — 대시보드에서 직접 생성된 것으로 추정되며, 프로젝트 자체 `ToDo.md`(327줄 부근)에도 이미 동일한 갭이 기록돼 있다. `user-banners` Storage 버킷도 마찬가지로 migration 밖에서 만들어졌다(`user-favicons`/`user-cursors` migration의 주석이 이를 명시).

`home_customize`는 **draft/publish 구분이 전혀 없는** 단일 jsonb 컬럼(`layout_json`)이고, 저장은 `UPDATE ... WHERE user_id = ...` (upsert조차 아님, row는 온보딩 RPC가 미리 만들어둔다는 전제). 버전 관리, 스냅샷, 이력 테이블 — 전부 없음.

### 1-5. 이미지 업로드 — 동작하지만 4곳에 복붙된 동일 로직, 공용 유틸리티 없음

Favicon/Banner/Cursor 3개 기능이 각각 `admin/settings/admin-favicon.js`, `admin/settings/admin-my-banner.js`, `admin/settings/admin-settings-save.js`에서 `auth.getUser() → 고정 경로(${userId}/favicon 등) → .storage.from(BUCKET).upload(path, file, {upsert:true, contentType, cacheControl:"60"}) → 결정적 public URL 조립`을 토씨 하나 안 틀리고 반복한다. 공용 upload 헬퍼 함수는 존재하지 않는다.

유일하게 "사용자당 이미지 여러 장"을 다루는 기존 기능은 카테고리 배너(`posts/view/posts-view-banner-form.js`) — `{user_id}/category-banners/{uuid}/image` 경로 + `banners` 테이블에 `image_url/image_path` 저장 + 삭제 시 Storage 객체도 같이 삭제. **Image Library의 가장 가까운 기존 선례**는 이것이다(단일 고정 슬롯 방식인 favicon/banner/cursor가 아니라).

`customize/editor/editor.js`에는 이미지 업로드가 **아예 없다** — 배경 이미지는 단순 텍스트 URL 입력 필드다.

### 1-6. 디자인 토큰 — `--system-*` / `--theme-*` 분리가 이미 선제적으로 돼 있다

`core/design-tokens.css`가 Primitive(`--imory-*`) 위에 두 개의 Semantic 네임스페이스를 정의한다: `--system-*`(관리자/시스템 UI 전용, 다크모드 대응, admin 파일들이 소비)과 `--theme-*`(사용자 공개 홈페이지 전용, 현재는 `--system-*`과 같은 값으로 임시 별칭되어 있음 — "아직 커스터마이징 레이어가 없어서 다를 이유가 없다"는 명시적 주석).

더 중요한 건 `--theme-*` 값이 **런타임에 사용자별로 계산되어 특정 컨테이너 엘리먼트에 인라인 스타일로 스코프**된다는 점(`render-layout.js`의 `applyCustomizeThemeTokens` → `container.style.setProperty(...)`, `:root`가 아니라 `.customize-layout`/`themeMount`에만). `:root` 오염이나 전역 `<style>` 주입 없이 "사용자별 테마 값을 하나의 서브트리에만 스코프"하는 패턴이 **이미 프로덕션에서 검증되어 동작 중**이다. 이건 향후 Skin CSS 격리 설계에 그대로 재사용할 수 있는 가장 강력한 기존 자산이다.

### 1-7. iframe — 2곳에 존재하지만 둘 다 보안 경계가 아니다

`admin/index.html`(admin 셸 안에 editor 전체를 same-origin iframe으로 삽입)과 `customize/editor/index.html`(디바이스 폭 시뮬레이션용 preview iframe) — 둘 다 `sandbox` 속성 없음, `postMessage` 없음. 부모가 `contentWindow`/`contentDocument`에 직접 접근해서 `renderCustomizeLayout()`을 전역 함수처럼 호출한다. **CSS/보안 샌드박스로서의 iframe 선례는 이 코드베이스에 없다.**

---

## 2. 관련 파일 목록

### Customize (편집기 + 렌더러)
| 파일 | 역할 |
|---|---|
| `customize/editor/index.html` | 편집기 UI 셸. admin iframe 안에서 로드됨 |
| `customize/editor/editor.js` (4637줄) | 전체 편집 로직: 상태, 드래그/리사이즈, 저장, 패널 렌더링 |
| `customize/editor/editor.css` | 편집기 셸 스타일 |
| `customize/editor/preview-frame.html` | 실기기 크기로 렌더되는 미리보기 iframe 문서 |
| `customize/renderer/block-defaults.js` | 블록 타입/props 스키마 (허용 타입, enum, 숫자 range) |
| `customize/renderer/default-layout.js` | 신규 사용자 기본 레이아웃 |
| `customize/renderer/render-layout.js` | **공용 렌더러** — 에디터 프리뷰와 공개 홈이 공유 |
| `customize/renderer/theme-tokens.js` | 색상 → `--theme-*` CSS 변수 순수 함수 |
| `customize/renderer/validate-layout.js` | 레이아웃 JSON 정규화/검증 |
| `customize/renderer/renderer-test.html` | 렌더러 단독 테스트 하네스 |

### 공개 사용자 화면 / 라우팅
| 파일 | 역할 |
|---|---|
| `index.html` (3357줄) | 랜딩/HOME 게이팅, `initHomeRenderer()` 3-way 분기, sua 테마 로더 |
| `core/lib/site-path.js` | slug/경로 파싱, URL 빌더 |
| `core/lib/reserved-slugs.js` | 예약 slug 목록 |
| `home/site-owner.js` | slug → owner 조회 (`profiles` 쿼리, 상태 캐시) |
| `home/site-meta.js` | site_settings 기반 title/favicon/cursor |
| `home/categories.js` | 카테고리 메뉴 (legacy_sua 전용 로드) |
| `home/menu.js`, `home/bgm.js` | legacy_sua 전용 UI |
| `themes/sua/*` | 하드코딩된 기본 테마(3D heart) |
| `posts/posts.html` | LIST/POST 고정 DOM |
| `posts/view/posts-view-list.js` | 카테고리/포스트 목록 렌더 + 쿼리 |
| `posts/view/posts-view-detail.js` | 포스트 상세 렌더 + 쿼리 |
| `posts/view/posts-view-banner.js`, `posts-view-banner-form.js` | 배너형 카테고리, 카테고리 배너 업로드 |
| `posts/view/posts-view-secret-gate.js` | 비밀글 비밀번호 게이트 |
| `posts/editor/posts-router-init.js`, `posts-refs.js` | 라우팅 진입점, DOM 참조 전역 |
| `_redirects`, `_headers` | Cloudflare Pages 라우팅/캐시 규칙 |

### Quote Preset / Post 본문
| 파일 | 역할 |
|---|---|
| `admin/quote/*.js` (10개 파일) | 어드민 Quote Preset 작성 UI |
| `posts/style/posts-style-preset.js` | preset 로드/해석 |
| `posts/style/posts-style-render.js` | preset → 본문 인라인 스타일 적용 |
| `posts/style/posts-style-dialogue.js` | `"대사"`/`*강조*` 인라인 스타일링 |
| `posts/posts-sanitize.js` | 본문 HTML 화이트리스트 새니타이저 |

### Supabase
| 위치 | 역할 |
|---|---|
| `supabase/migrations/*.sql` (17개) | profiles/app_config/home_customize/admin_users/invite_links만 추적 |
| `supabase/tests/*.sql` | 수동 테스트 스크립트 |
| (migration 밖) `posts`, `post_contents`, `categories`, `banners`, `quote_presets`, `site_settings`, `daily_visits` | 코드에서만 존재 확인 가능, 스키마 origin 없음 |

### 이미지 / 디자인 토큰
| 파일 | 역할 |
|---|---|
| `admin/settings/admin-favicon.js`, `admin-my-banner.js`, `admin-settings-save.js` | 업로드 로직 3중 복붙 |
| `core/design-tokens.css` | Primitive + `--system-*`/`--theme-*` semantic 토큰 |
| `core/design-tokens-mapping.md` | 토큰 설계 문서 |
| `core/components/*.css`, `core/patterns/*.css` | 공용 System UI 컴포넌트 (일부만 실사용) |

---

## 3. 데이터 흐름도

```
[HOME]
Supabase(profiles.home_mode)
        │
        ├─ "legacy_sua" ──→ fetch(sua-home.html) ─inject→ #themeMount ─run→ heart-interaction.js / cover-profile.js
        │
        └─ "customize" ──→ home_customize.layout_json (jsonb)
                              │
                              ▼
                    validateCustomizeLayout()  ← customize/renderer/validate-layout.js
                              │
                              ▼
              renderCustomizeLayout({container, blocks, theme, contentArea, mode:"view"})
                              │            ▲ (동일 함수, mode:"edit"로 에디터 프리뷰에서도 호출됨)
                              ▼
                          #themeMount (DOM)

[LIST]
Supabase(categories, posts) ──직접 쿼리──→ posts-view-list.js (hand-rolled) ──→ #postList (DOM)

[POST]
Supabase(posts, post_contents, quote_presets) ──직접 쿼리──→ posts-view-detail.js
                              │
                              ├─ content_type==="html" → innerHTML 그대로 (새니타이즈 없음, 레거시)
                              │
                              └─ 그 외 → getPostContentAsSafeHTML() → #postDetailContent
                                              │
                                              ▼
                                  posts-style-render.js가 quote_preset.settings를
                                  인라인 스타일로 #postDetailContent에 적용
```

---

## 4. 재사용 가능 코드

| 대상 | 이유 |
|---|---|
| `customize/renderer/render-layout.js` | 이미 편집기 프리뷰와 공개 홈이 공유하는 **유일한 실제 Skin Engine**. 검증된 블록 JSON을 넣으면 그대로 그려준다. |
| `customize/renderer/theme-tokens.js` | 순수 함수, DOM 미접촉. 색상 계산 로직 그대로 재사용 가능. |
| `customize/renderer/validate-layout.js`의 **정규화 패턴** | "입력을 신뢰하지 않고 항상 안전한 정규화 구조 반환, 숫자는 clamp, URL은 https-only, id 재생성" 원칙 자체가 AI 출력 검증기의 좋은 템플릿. (단, 그대로 쓰긴 부족 — 6절 참고) |
| `render-layout.js`의 `--theme-*` **컨테이너 스코프 인라인 스타일 패턴** | `:root` 오염 없이 서브트리에만 테마 값을 스코프하는 이미 검증된 방식 — Skin CSS 격리 설계의 출발점으로 가장 유력. |
| Storage 업로드 RLS 패턴 (`user-favicons`/`user-cursors`/`user-banners` 3버킷 동일) | `(storage.foldername(name))[1] = auth.uid()::text` 소유자 폴더 격리 — 신규 `user-skins`(가칭) 버킷에 그대로 적용 가능. |
| `posts/view/posts-view-banner-form.js`의 다중 이미지 패턴 | `{user_id}/category-banners/{uuid}/image` + DB 행 1개당 이미지 1개 + 삭제 시 Storage 동반 삭제 — **Image Library의 가장 가까운 기존 선례**. |
| `posts/posts-sanitize.js`의 화이트리스트 새니타이즈 원칙 | 허용 태그/속성만 남기고 나머지는 unwrap — Skin HTML 새니타이저 설계 시 참고할 접근 방식(그대로 재사용은 불가, 대상 태그셋이 다름). |
| `#postDetailContent` 경계 자체 | 구조적으로 이미 존재 — DOM 재구성 불필요, "이 selector를 절대 건드리지 않는다"는 규칙만 강제하면 됨. |
| `core/lib/site-path.js`, `home/site-owner.js` | 라우팅/owner 해석은 이미 스킨과 무관하게 잘 분리돼 있음 — 손댈 필요 없음. |
| `home_customize` 테이블 자체 | 스키마 변경 없이도 (draft/publish 컬럼만 추가하면) AI가 생성한 block-JSON을 담는 그릇으로 계속 쓸 수 있음 — **단, "블록 JSON"이 아니라 "HTML/CSS"를 담아야 한다면 얘기가 다름 (8절 충돌 지점 참고)**. |

---

## 5. 폐기/교체 추천 코드

| 대상 | 이유 |
|---|---|
| `customize/editor/editor.js`의 드래그/리사이즈 세션 로직 (Pointer Event 기반, 약 1000줄 이상) | Carrd형 직접 조작 UI 전용. AI 채팅 기반 편집으로는 불필요. |
| 블록 팔레트/"요소 추가" 패널, 블록별 속성 편집 폼(슬라이더/컬러피커 등) | 직접 조작 UI. AI가 대체. |
| `preview-frame.html`의 편집 전용 CSS(선택 아웃라인, 드롭 인디케이터, 컬럼 디바이더) | 드래그 UI 폐기와 함께 자연 소멸. |
| `render-layout.js`의 `mode:"edit"` 분기(슬롯/디바이더 DOM) | 드래그 UI가 없어지면 죽은 코드가 됨 — 단, **파일 자체는 view 모드 렌더러로 계속 필요**하므로 즉시 삭제보다는 나중에 정리. |
| "profile" 페이지 탭(에디터 UI엔 있지만 DB 컬럼/스키마 지원이 없는 로컬 placeholder) | 미완성 스캐폴딩. Skin Studio가 이 멀티페이지 의도를 이어받을지 리셋할지 명시적으로 결정 필요(9절). |
| Favicon/Banner/Cursor 3곳의 복붙된 업로드 함수 | Image Library 구현 전에 공용 `uploadUserImage()` 유틸리티로 추출 권장(플랜 24조 "기존 upload utility 재사용" 원칙과 직결 — 지금은 재사용할 단일 유틸리티가 없음). |

---

## 6. 기술적 위험 요소

1. **Post 본문 보호가 관례일 뿐 강제되지 않음.** `#postDetailContent`에 인라인 스타일로 덮이지 않는 CSS 속성(background/border/padding/margin/box-shadow, 그리고 `span.post-action`/`.post-inline-*` 등 자손 요소의 미지정 속성)은 Skin CSS가 광범위한 셀렉터(`div`, `span`, `*`)로 그대로 뚫을 수 있다. **기술적 강제 장치(검증기가 `#postDetailContent`/`.post-detail-content`를 겨누는 셀렉터를 거부하는 등)가 새로 필요하다.**
2. **`content_type==="html"` 레거시 포스트는 새니타이즈 자체가 없다.** 같은 컨테이너를 쓰므로 Skin 격리 메커니즘은 이 경로도 동일하게 방어해야 하며, 별도 위험군으로 인지해 둘 필요가 있다.
3. **`validate-layout.js`에 자유 텍스트 필드(예: `text.content`) 길이 제한이나 블록 개수 상한이 없다.** 현재는 사람이 입력하니 문제가 적지만, LLM이 생성하면 비정상적으로 큰 `blocks` 배열이나 긴 문자열이 그대로 통과할 수 있다.
4. **레이아웃 버전 불일치 시 마이그레이션 경로가 없다.** `version`이 현재값(3)과 다르면 그냥 빈 레이아웃으로 초기화(`unsupported-version`) — AI 기반 스킨은 스키마가 더 자주 바뀔 가능성이 높아 이 "버전 다르면 날린다" 전략은 위험하다.
5. **`DEFAULT_LAYOUT`(JS)과 온보딩 RPC의 인라인 JSON 리터럴(SQL migration)이 수동으로 두 곳에 중복 유지된다.** 한쪽만 바뀌면 drift 발생 — Skin 기본값 설계 시 이 실수를 반복하지 않아야 함.
6. **CSS 격리 선례가 프로덕션에 전혀 없다.** `--theme-*` 컨테이너 스코프 패턴은 "미리 계산된 JS 값 몇 개"를 스코프하는 데는 검증됐지만, **자유 형식 AI 생성 CSS**(임의 셀렉터, `:root`/`body`/`*` 포함 가능)를 안전하게 스코프하는 것은 완전히 다른 난이도의 문제 — 새로 설계해야 한다.
7. **다수 핵심 테이블이 migration 추적 밖에 있다(`posts`, `categories`, `banners`, `quote_presets`, `site_settings`, `post_contents`, `daily_visits`).** 신규 Skin 관련 migration을 작성하기 전에, 최소한 새로 만드는 테이블만이라도 반드시 migration으로 추적해야 하며(기존 관행처럼 대시보드 직접 생성 반복 금지), 기존 테이블 백필 여부는 별도 판단이 필요하다.
8. **`home_customize`에 draft/publish 개념이 전혀 없다.** 현재는 `UPDATE`로 즉시 덮어쓰기 — 플랜 30조("작업 중인 Skin과 실제 홈페이지 Skin을 분리")를 만족하려면 새 컬럼/테이블이 반드시 필요하다(하단 7절).
9. **이미지 업로드에 서버 측 크기/MIME 제한이 없다.** 버킷 자체에도 `file_size_limit`/`allowed_mime_types`가 없고(클라이언트 `accept` 속성뿐), 4곳 업로드 함수 모두 raw `File`을 그대로 올린다. Image Library 확장 시 그대로 방치하면 악용 여지가 커진다.
10. **`quote_presets`, `categories`, `banners`, `site_settings`의 실제 RLS 정책 SQL이 저장소에 없다.** 대시보드에서 직접 설정된 것으로 추정 — 이 상태에서 Skin이 이 테이블들의 데이터를 읽어 렌더링하게 되면, RLS 정책의 실제 내용을 저장소 코드만으로는 확인할 수 없어 감사가 어렵다.

---

## 7. Skin Engine을 삽입하기 가장 좋은 지점

- **HOME**: `index.html`의 `initHomeRenderer()` 3-way 분기(`legacy_sua` / `customize` / notice)가 이미 깔끔한 진입점이다. 여기에 4번째 분기를 추가하거나, 더 낫게는 `renderCustomizeLayout({container, blocks, theme, contentArea, mode, actions})` 계약 자체를 `renderSkin({container, layout, theme, mode, actions})`로 일반화하는 방향을 검토할 만하다 — 이미 document-agnostic하고 mode를 인지하는 구조이기 때문.
- **LIST/POST**: 붙일 만한 기존 추상화가 없다. 두 가지 선택지:
  (a) `posts.html`의 현재 구조 자체를 "기본 스킨 템플릿"으로 놓고, `render-layout.js`의 `applyCustomizeThemeTokens`처럼 `#postList`/`#postDetail`을 감싸는 컨테이너 스코프 테마 레이어를 추가.
  (b) `createPostListItem`/`renderPostDetailBody`/`renderStyledPostContentInto`를 `renderCustomizeLayout`처럼 교체 가능한 렌더 함수로 승격시키는 더 깊은 리팩터.
  플랜 3조가 HOME/LIST/POST를 "하나의 Skin System"으로 요구하므로 결국 (b) 방향에 가까운 작업이 필요하지만, **Phase 1에서 세 화면을 동시에 다룰지, HOME부터 검증하고 LIST/POST는 뒤로 미룰지는 결정이 필요하다** (9절).
- **Post 본문 보호**: 새 코드 지점이 아니라 **검증 규칙**을 넣을 지점 — Skin CSS를 저장/프리뷰하기 전 통과시키는 validator에 "`#postDetailContent`/`.post-detail-content` 및 그 자손을 겨누는 셀렉터는 거부" 규칙을 추가하는 것이 유일하게 안전한 방법.
- **CSS 격리**: `render-layout.js`의 컨테이너 스코프 인라인 스타일 패턴을 확장 — Skin 루트에 `.imory-skin-root` 같은 래퍼를 두고, 저장/렌더 시점에 CSS 셀렉터를 그 래퍼로 강제 스코프(`@scope` 또는 셀렉터 프리픽싱 새니타이저 패스)하는 방식을 권장. 기존 코드베이스에 iframe 샌드박스 선례가 없으므로, iframe 방식으로 가려면 완전히 새로 만들어야 함(6-6절 참고).

---

## 8. 예상 DB 변경 (SQL 없음, 필요성만)

- **Skin 콘텐츠를 담을 새 테이블이 필요할 가능성이 높다.** `home_customize.layout_json`은 "타입드 블록 트리" 스키마이지 자유 형식 HTML/CSS가 아니다 — 플랜의 AI Output Contract(42~44조: `html, css, imageSlots, regions`)를 그대로 따르려면 별도 콘텐츠 모델이 필요하다 (자세한 충돌은 9절 참고).
- **Draft/Published 상태 분리가 필요하다.** 현재 스키마에 선례가 없다. 가능한 방향: 한 행에 `draft_content`/`published_content` 두 컬럼, 또는 `status` enum을 가진 여러 행, 또는 `current_published_version_id` 포인터 방식 — 무엇을 택할지는 설계 결정 사항(9절).
- **버전 이력 테이블이 필요하다면 `invite_link_uses`의 append-only 로그 패턴**(FK + 액터 + 타임스탬프 + 스냅샷)이 이 코드베이스에서 가장 가까운 기존 관례다.
- **Image Slot 정의**: 현재 스키마에 "템플릿 내 이름 붙은 이미지 자리" 개념이 없다. `layout_json` 관례를 따라 jsonb 배열 컬럼으로 갈지, 별도 정규화 테이블로 갈지 결정 필요.
- **신규 Storage 버킷 필요**: 기존 3버킷 중 스킨 이미지에 딱 맞는 게 없다. `user-favicons`/`user-cursors`와 동일한 RLS 패턴으로 새 버킷(가칭 `user-skins` 또는 `user-images`)을 만들되, **이번에는 반드시 migration으로 추적**해야 한다(기존 `user-banners`가 추적 밖에 있는 기술부채를 반복하지 않기 위함).
- **RLS/권한 관례 준수**: `20260903190000_harden_operator_rpc_grants.sql`이 보여주듯 이 프로젝트는 이미 "새 함수에 `anon`으로 암묵적 `EXECUTE` 권한이 자동 부여되는" 함정을 한 번 겪었다 — 새 Skin 관련 RPC 작성 시 동일한 명시적 REVOKE/GRANT 패턴을 따라야 한다.

---

## 9. `IMORY_AI_SKIN_CUSTOMIZE_PLAN.md`와 현재 코드 사이 충돌 지점

1. **콘텐츠 모델 불일치 (가장 중요)**: 플랜은 AI가 `{html, css, imageSlots, regions, summary}` 형태의 자유 형식 HTML/CSS를 생성한다고 명시한다(42~44조). 하지만 현재 유일하게 실사용되는 렌더러(`render-layout.js`)는 **타입드 블록 트리**(`text/image/container/button/spacer/divider/columns`)를 렌더링하는 구조이지, 임의 HTML/CSS를 렌더링하는 구조가 아니다. 이 둘은 근본적으로 다른 아키텍처다 — "기존 블록 스키마를 AI가 채우도록 확장"할지, "완전히 새로운 HTML/CSS 렌더러를 만들지"를 Phase 1 이전에 결정해야 한다.
2. **HOME/LIST/POST 통합 요구와 현재 비대칭**: 플랜 3조는 셋을 "하나의 Skin System"으로 요구하지만, 현재 HOME만 렌더러 추상화가 있고 LIST/POST는 없다. Phase 1 완료 조건("HOME/LIST/POST 렌더 가능")을 그대로 따르면 LIST/POST에도 상당한 리팩터가 필요한데, 플랜 자체는 이 비용을 인지하지 못하고 있다.
3. **Skin Context 데이터 추상화가 아직 없다**: 플랜 6조는 AI가 `profiles.nickname` 같은 raw DB 컬럼명이 아니라 `profile.nickname` 같은 Skin 전용 필드에만 의존해야 한다고 명시한다. 현재 `render-layout.js`/`posts-view-*.js`는 Supabase 쿼리 결과를 거의 그대로 사용하며, 이런 매핑/추상화 레이어는 존재하지 않는다 — Phase 1에서 새로 설계해야 한다.
4. **CSS 격리 방식이 플랜에서 미결로 남겨져 있고(32조 "iframe 또는 별도 rendering boundary를 조사"), 이번 조사 결과 iframe 선례가 전혀 없다.** 컨테이너 스코프 방식(기존 `--theme-*` 패턴 확장)이 더 자연스럽다는 결론이지만, 이는 미리 계산된 값 몇 개를 스코프하던 기존 사례보다 훨씬 어려운 "임의 CSS 새니타이즈/스코프" 문제로 확장해야 한다.
5. **Post 본문 보호(9조)는 이미 관례로 존재하지만 기술적으로 강제되지 않는다.** 플랜은 이걸 이미 지켜지는 규칙처럼 서술하지만, 실제로는 검증기 레벨의 강제 장치가 새로 필요하다(6절 위험요소 1번).
6. **`home_customize` 구조 자체가 플랜 37조가 경고하는 "거대한 HTML 문자열 하나" 함정과는 다른 형태로 이미 "분리하기 어려운 구조"다.** 현재는 JSON 블록 트리 하나가 통째로 `layout_json`에 들어있어 draft/publish도, 버전 이력도, Skin 패키지 분리도 안 되는 상태 — 플랜이 우려하는 상황이 형태만 다를 뿐 이미 벌어져 있다.
7. **기존 Carrd형 Customize 처리 원칙(38조, "무조건 삭제하지 않는다")과 실제 재사용 가능 범위의 간극**: 재사용 가능한 건 사실상 `render-layout.js`/`theme-tokens.js`/`validate-layout.js`(렌더러 3종)뿐이고, 편집기 UI(`editor.js`의 드래그/리사이즈, 패널)는 거의 전량 폐기 대상이다. "단계적으로 제거"라는 플랜의 표현보다 실제로는 폐기 대상 비중이 훨씬 크다.
8. **`ToDo.md`에 남아있던 "home_mode가 실제로 안 붙어있다"는 이전 기록**은 이번 조사에서 확인한 현재 `index.html`의 `initHomeRenderer()` 3-way 분기 구현과 모순된다 — `ToDo.md`가 더 이전 시점 스냅샷이라 이미 해결된 것으로 보이며, **`ToDo.md`를 최신 사실로 신뢰하지 말고 코드를 직접 확인하는 것**이 필요하다는 방법론적 유의사항으로 남긴다.

---

## 10. 구현 순서 추천

플랜 40조의 Phase 0~10 순서 자체는 합리적이나, 이번 조사 결과를 반영해 **Phase 1(Skin Data Contract) 착수 전에 최소 3가지를 먼저 확정**할 것을 권한다(11절). 그 외에는 플랜 순서를 그대로 따르되:

- **Phase 1은 HOME만 먼저 완결**하고, LIST/POST 확장은 별도 하위 단계로 명시적으로 나누는 걸 권장한다 — 비용 비대칭이 크기 때문에 "3개 동시 완료"를 Phase 1의 단일 조건으로 두면 범위가 과도하게 커진다.
- **Phase 2(Static Skin Engine)에서 콘텐츠 모델 결정이 이미 코드로 확정돼 있어야 한다** — Phase 1 산출물(Skin Data Contract)이 "블록 트리 확장이냐 HTML/CSS냐"를 확정하지 않으면 Phase 2를 시작할 수 없다.
- **이미지 업로드 공용 유틸리티 추출은 Phase 3(Image Library) 착수와 동시에, 그 전제 작업으로 진행**하는 게 자연스럽다 — 지금은 재사용할 단일 함수가 없으므로 "재사용"이 아니라 "먼저 추출"이 필요하다.
- **CSS 격리 메커니즘(컨테이너 스코프 vs 다른 방식)은 Phase 2 완료 조건에 포함시켜야 한다** — 플랜 원문은 이걸 32조에 흩어 놓았지만, 실제로는 Static Skin Engine이 동작하려면 이 결정이 선행돼야 한다.

---

## 11. PHASE 1을 시작하기 전에 반드시 결정해야 할 사항

1. **Skin 콘텐츠 모델**: 기존 타입드 블록 트리를 확장할지, 플랜이 명시한 자유 형식 HTML/CSS로 갈지. (가장 근본적인 결정 — 이후 모든 설계에 영향)
2. **Skin Context 데이터 계약**: `site.*`/`profile.*`/`categories[]`/`posts[]`/`banners[]`/`images.*`의 정확한 필드 스펙과, 이를 실제 Supabase 쿼리 결과에서 어떻게 매핑할지.
3. **Draft/Publish 데이터 모델**: 컬럼 2개 vs status 컬럼을 가진 여러 행 vs 별도 버전 테이블 — 기존 관례가 전혀 없어 새로 정해야 함.
4. **CSS 격리 메커니즘의 최종 확정**: 컨테이너 스코프 셀렉터(선례 있음, 권장) vs iframe 샌드박스(선례 없음, 완전 신규 구축) — 특히 자유 형식 AI-CSS를 안전하게 다루는 구체적 새니타이즈 규칙까지.
5. **Post Viewer 보호 규칙의 기술적 강제 방법**: "관례로 지켜지길 바란다"가 아니라 Validator가 `#postDetailContent`/`.post-detail-content`를 겨누는 셀렉터를 실제로 거부하는 구체 메커니즘.
6. **LIST/POST를 Skin Engine 범위에 포함하는 시점**: Phase 1에서 HOME과 함께 다룰지, HOME 먼저 검증 후 별도 단계로 미룰지.
7. **기존 Carrd Customize 편집기의 폐기 시점/방식**: 병행 운영 기간을 둘지, 새 Skin Studio 완성과 동시에 즉시 교체할지.
8. **기존 `home_customize` 사용자(이미 블록 레이아웃을 저장해 둔 사용자) 마이그레이션 전략**: 콘텐츠 모델이 바뀌면 기존 데이터를 어떻게 이관할지, 혹은 legacy로 남겨둘지.
9. **Migration 추적 밖 테이블 백필 여부**: 새 Skin 관련 테이블만 새로 추적할지, 기존 `posts`/`categories`/`banners`/`quote_presets`/`site_settings`의 베이스라인 migration도 이번에 함께 정리할지.
10. **이미지 업로드 공용 유틸리티 추출 여부와 시점**: Image Library 전에 먼저 리팩터링할지, Phase 3에서 한 번에 처리할지.

---

## 12. 결론 — 지금 바로 PHASE 1로 넘어가도 되는가?

**아니오. 바로 넘어가지 말고, 11절의 1~4번(콘텐츠 모델, Skin Context 계약, Draft/Publish 모델, CSS 격리 방식)을 먼저 확정하는 짧은 설계 논의를 거친 뒤 PHASE 1을 시작할 것을 권장한다.**

이유:
- PHASE 1의 완료 조건 자체("HOME/LIST/POST 렌더 가능, Quote content 보존, 사용자별 데이터 정상 표시")가 "Skin이 구조적으로 무엇인가"(블록 트리인지 HTML/CSS인지)에 의해 결정되는데, 이 질문에 대한 답이 현재 플랜 문서와 기존 코드 사이에서 정면으로 어긋난다(9-1절). 이 결정 없이 데이터 계약을 설계하면 다시 갈아엎을 위험이 크다.
- 다행히 나머지 미결 사항들은 범위가 크지 않다 — HOME 렌더러(`render-layout.js`)와 테마 스코프 패턴은 이미 검증되어 있어 재사용 가능하고, Post 본문 경계도 이미 DOM 구조상 존재해 재구성이 필요 없다. 즉 **"조사 결과 판이 완전히 새로 짜여야 한다"는 결론이 아니라, "몇 가지 근본 결정만 먼저 확정하면 그 다음은 기존 자산을 상당 부분 재사용하며 빠르게 진행할 수 있다"**는 결론이다.
- 따라서 권장 순서는: (a) 11절 1~4번을 짧게 결정 → (b) 그 결정을 반영해 PHASE 1(Skin Data Contract)을 HOME 범위로 한정해서 시작 → (c) LIST/POST 확장은 PHASE 1의 후속 하위 단계로 별도 취급.

> **13절에서 갱신됨**: 11절의 결정 사항 1번(콘텐츠 모델)은 "기존 block-JSON을 확장하지 않고 새 데이터 모델로 간다"로 확정되었다. 아래 13절 참고.

---

## 13. [추가 결정 반영] Legacy Customize 처리 방향 재설계 — PHASE 1A

> 전제: **기존 Carrd형 `home_customize`에는 보존해야 할 실사용 사용자 제작 데이터가 사실상 없다**는 판단(사용자 확인). 이에 따라 새 Skin 시스템 설계에서 기존 block customize와의 장기 호환/병행 운영을 필수 요구사항으로 두지 않는다.
>
> 이 절은 1~12절 중 다음 항목의 결론을 아래 내용으로 **갱신**한다: 4절(재사용 가능 코드 중 `home_customize` 테이블 항목), 5절(폐기 대상 확정), 8절(예상 DB 변경), 9절 충돌 지점 1번·6번(콘텐츠 모델 불일치 → 해소), 10절(구현 순서), 11절 결정 사항 1·6·7·8·9번. **아직 실제 삭제/migration은 수행하지 않았다** — 아래는 계획이다.

### 13-1. 수정된 방향 (요약)

- 기존 Carrd Customize 편집기 UI(`customize/editor/*`)는 **폐기 대상으로 확정**한다.
- `home_customize.layout_json`을 새 AI Skin 저장 구조로 **억지로 재사용하지 않는다**. block-JSON 트리 모델과 "AI가 생성하는 HTML/CSS" 모델은 근본적으로 다른 콘텐츠 모델이므로(9-1절), 무리하게 맞추지 않고 처음부터 목적에 맞는 구조로 새로 만든다.
- 새 Skin 시스템은 `skins` / `skin_versions` 등 **별도 테이블**로 설계한다(draft/publish, 버전 이력을 1급 개념으로 포함).
- `render-layout.js`, `theme-tokens.js`, `validate-layout.js`는 **파일 자체를 유지하는 게 목적이 아니라**, 그 안의 재사용 가치 있는 **패턴만 추출**해 새 렌더러/검증기에 이식한다(13-3절).
- 순서: **새 Skin Engine 완성 → 필요한 패턴 이관 완료 → 그 다음에** 기존 Customize 코드/DB를 정리한다. 코드/DB를 미리 걷어내면서 새 시스템을 만들지 않는다.
- `profiles.home_mode` 및 기존 `home_customize` 제거/정리는 **실제 사용 데이터를 프로덕션에서 재확인한 뒤 migration으로 처리**한다 — 지금 이 문서 갱신만으로 삭제하지 않는다.

### 13-2. 삭제 가능한 기존 Customize 파일/DB 항목 (목록만 확정, 실행은 보류)

**파일 — 새 Skin Engine 완성 및 패턴 이관 후 삭제 대상:**

| 대상 | 비고 |
|---|---|
| `customize/editor/index.html` | 즉시 삭제 가능 (재사용 패턴 없음) |
| `customize/editor/editor.js` (4637줄) | 즉시 삭제 가능 — 드래그/리사이즈/패널 UI, 재사용 패턴 없음 |
| `customize/editor/editor.css` | 즉시 삭제 가능 |
| `customize/editor/preview-frame.html` | 즉시 삭제 가능 |
| `customize/renderer/block-defaults.js` | **패턴 이관 후** 삭제 (13-3의 contentFields 개념만 참고) |
| `customize/renderer/default-layout.js` | 즉시 삭제 가능 (새 시스템은 다른 기본값 구조를 가짐) |
| `customize/renderer/render-layout.js` | **패턴 이관 후** 삭제 (컨테이너 스코프/렌더 계약 패턴 참고) |
| `customize/renderer/theme-tokens.js` | **패턴 이관 후** 삭제 (또는 새 시스템에 불필요하면 이관 없이 즉시 삭제) |
| `customize/renderer/validate-layout.js` | **패턴 이관 후** 삭제 (정규화 원칙만 참고) |
| `customize/renderer/renderer-test.html` | 즉시 삭제 가능 |
| `admin/index.html`의 `customizeEditorFrame` iframe 삽입부 + `admin.js`의 연동 진입점 | editor.js 삭제와 함께 제거 |

**DB — 실사용 데이터 확인 후 migration으로 처리 (지금 삭제 안 함):**

| 대상 | 비고 |
|---|---|
| `public.home_customize` 테이블 전체 | 프로덕션에서 non-default 레이아웃 존재 여부 재확인 후 처리 |
| `public.profiles.home_mode` 컬럼 + check 제약(`in ('customize','legacy_sua')`) | 모든 사용자가 새 Skin 시스템으로 전환된 뒤에만 제거 |
| `home_customize_select_public`, `home_customize_owner_write` RLS 정책 | 테이블 삭제 시 함께 정리 |
| `complete_onboarding()` RPC 내 `home_customize` 초기 row 삽입 로직(`DEFAULT_LAYOUT` 리터럴 포함) | 새 `skins`/`skin_versions` 초기화 로직으로 교체 |

**삭제 대상 아님 (이번 재설계와 무관, 별도 제품 결정 사항):**

- `themes/sua/*`(legacy_sua 하드코딩 테마) 일체 — `home_mode` 분기 자체를 걷어낼지, 새 Skin 시스템의 fallback/기본 스킨 하나로 흡수할지는 이번 결정 범위 밖. 나중에 별도로 판단.

### 13-3. 새 시스템에서 재사용할 패턴 (파일이 아니라 "패턴" 단위로 이관)

| 원본 위치 | 추출할 패턴 | 새 시스템에서의 형태 |
|---|---|---|
| `render-layout.js`의 `applyCustomizeThemeTokens` | 컨테이너 스코프 인라인 스타일로 CSS 변수 주입 — `:root` 오염 없이 서브트리에만 적용 | 새 Skin 렌더 루트 래퍼(예: `.imory-skin-root`)에 동일 기법 적용. 값 계산 로직 자체(색상→토큰)보다 **"스코프 전략"**만 이관 |
| `theme-tokens.js`의 `computeCustomizeThemeTokens` | 색상 몇 개 → 파생 토큰 계산 순수 함수 로직 | AI가 자유 CSS를 직접 생성하는 모델에서는 이 함수 자체는 불필요해질 가능성이 높음. Start Questionnaire의 "기본 색상 선택 → 초기 팔레트 제안" 같은 보조 기능이 필요해지면 계산 로직만 참고 |
| `validate-layout.js` | "입력을 신뢰하지 않고 항상 안전한 정규화 구조 반환 / 숫자는 clamp / URL은 https-only / id는 재생성" 원칙 | 새 Skin validator(HTML/CSS 새니타이저 + 구조 검증)의 **설계 원칙**으로 계승 — 코드 재사용이 아니라 접근 방식 재사용 |
| `block-defaults.js`의 `contentFields` 메타(정의만 있고 미사용이던 개념) | "AI/사용자가 채우는 콘텐츠 값" vs "구조" 구분 아이디어 | Skin Context 데이터 계약(11-2) 설계 시 참고 개념으로만 |
| `render-layout.js`의 함수 계약 자체 | `{container, ..., mode} → {update, destroy}` — document-agnostic, mode를 인지하는 렌더 함수 시그니처 | 새 `renderSkin({container, ..., mode})` 계약 설계 시 동일한 패턴 채택 |
| `posts/view/posts-view-banner-form.js` | 다중 이미지 업로드 패턴: `{user_id}/{feature}/{uuid}/파일` 경로, DB 행 1개당 이미지 1개, 삭제 시 Storage 객체 동반 삭제 | Image Library 구현 시 그대로 채택 — 이번 결정과 무관하게 계속 유효 |
| 기존 Storage RLS 정책 형태(`user-favicons`/`user-cursors`/`user-banners` 공통) | `(storage.foldername(name))[1] = auth.uid()::text` 소유자 폴더 격리 | 신규 `user-skins`(가칭) 버킷에 동일 형태로 새로 작성 |
| `posts/posts-sanitize.js` | 화이트리스트 태그/속성만 남기고 나머지는 unwrap하는 새니타이즈 접근 | Skin HTML 새니타이저 설계 시 접근 방식만 참고(허용 태그셋 자체는 다름) |

이 표에 없는 나머지(`editor.js`의 드래그/리사이즈 세션, 블록 팔레트, 속성 편집 폼, `preview-frame.html`의 편집 전용 CSS)는 전량 폐기 대상 — 5절 결론이 이번 결정으로 더 확실해졌을 뿐, 애초에 재사용 후보가 아니었다.

### 13-4. 새 시스템 완성 후 제거 순서

1. **선행 조건**: 새 Skin Engine이 `profiles.home_mode`/`home_customize`를 전혀 참조하지 않고 HOME을 렌더링할 수 있는 상태가 될 때까지, 기존 `customize/*`와 `legacy_sua` 경로는 그대로 둔다(건드리지 않음).
2. 13-3의 패턴 이관이 끝나고 새 Skin Engine이 HOME에서 실제로 검증되면 **코드 정리**:
   a. `customize/editor/*` 전체(에디터 UI) 삭제
   b. `admin/index.html`의 에디터 iframe 진입점 및 관련 admin 메뉴 항목 제거
   c. `customize/renderer/*` 삭제 — 패턴은 이미 이관됐으므로, `index.html`의 `renderCustomizeHome()` 호출부 등 참조하는 곳을 먼저 함께 제거한 뒤 삭제
3. 코드 정리가 끝나고 신규 Skin Engine이 최소 1회 이상의 배포 주기 동안 안정적으로 운영된 뒤, **DB 정리** 단계로 넘어간다:
   a. `home_customize.layout_json`에 실사용자 제작(non-default) 데이터가 실제로 남아있는지 프로덕션에서 재확인
   b. 확인 결과 필요 시 백업(예: 별도 테이블로 스냅샷) 후 `home_customize` 테이블 및 관련 RLS 정책 제거 migration 작성
   c. 모든 사용자가 새 Skin 시스템으로 전환된 것을 확인한 뒤, `profiles.home_mode` 컬럼 및 체크 제약 제거 migration 작성
   d. `complete_onboarding()` RPC에서 `home_customize` 초기 삽입 로직 제거, 새 `skins`/`skin_versions` 초기화 로직으로 교체
4. **코드 정리(2단계)와 DB 정리(3단계) 사이에는 반드시 유예 기간을 둔다** — 새 시스템이 모든 신규/기존 사용자에게 완전히 대체 적용된 것을 확인한 뒤에만 DB를 정리한다. 이번 대화에서 실제 삭제/migration은 수행하지 않는다.

### 13-5. Phase 순서 재조정 — PHASE 1A로 구체화

10절의 Phase 1(Skin Data Contract)을 아래처럼 **PHASE 1A**로 구체화하여, legacy Customize와의 공존 비용을 최소화한다:

- **PHASE 1A 목표**: `home_customize`/block-JSON 모델과 **완전히 독립적인** 새 `skins`/`skin_versions` 데이터 모델을 설계하고 Skin Context 계약(11-2절)을 정의한다. 기존 customize 코드와의 상호운용성/데이터 마이그레이션은 이 단계의 요구사항에서 명시적으로 제외한다 — 13-3의 "패턴"만 참고하고 코드·데이터 의존은 만들지 않는다.
- **PHASE 1A 완료 조건**에 다음을 명시적으로 추가한다: *"기존 `home_customize`를 전혀 import/변환하지 않고, 새 `skins` 테이블만으로 HOME이 렌더된다."* — 레거시 데이터 이관 스크립트를 이 단계의 필수 조건에서 제외해 범위를 좁힌다.
- 기존 Customize 코드/DB 제거(13-4절)는 PHASE 1A~PHASE 2 완료 이후, **별도의 정리 작업("PHASE 1Z — Legacy Cleanup" 등으로 명명)**으로 분리해 명시적으로 스케줄링한다 — 다른 Phase 안에 슬쩍 끼워 넣지 않는다.
- 이로써 11절의 미결 사항 중 1번(콘텐츠 모델)은 "새 데이터 모델로 확정", 8번(기존 사용자 마이그레이션)은 "이관 대상 데이터 없음 → 마이그레이션 스크립트 불필요, 확인만 필요"로, 7번(에디터 폐기 시점)은 13-4절의 순서로 각각 구체화된다.
