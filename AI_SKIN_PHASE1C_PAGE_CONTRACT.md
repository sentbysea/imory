# AI SKIN — PHASE 1C
## Multi-page Skin Contract v0.1
### HOME / CATEGORY / POST

> 전제: `AI_SKIN_PHASE1B_DESIGN.md`(Skin Studio Foundation, Slice 0~4)가 완료된 상태에서 시작한다. 현재 `SkinPackage.metadata.supports`는 실제로 `{ home: true, list: false, post: false }`에 해당하는 단계다 — HOME만 Skin이 렌더하고, CATEGORY/LIST/POST는 아직 legacy 경로(`posts/view/*`)가 전담한다.
>
> **이번 라운드는 설계 문서 작성만 한다.** CATEGORY/POST Skin Renderer 구현, AI/OpenAI 연결, DB migration, 기존 공개 페이지 동작 변경 — 전부 이번 범위 밖이다(16절에서 다시 명시).
>
> 목적: HOME/CATEGORY/POST 세 화면이 결국 하나의 Skin이 담당하게 될 때, 그 세 화면이 주고받을 **데이터와 바인딩 계약**을 먼저 확정해서, 이후 실제 구현(별도 Phase/Slice)이 코드를 짜다가 계약 자체를 다시 뒤집는 일이 없게 한다.

---

## 1. 현재 구현 조사

### 1-1. HOME

- **Route**: 경로형 `/:slug`(slug 없으면 무필터 배포의 루트). `core/lib/site-path.js`의 `getSiteOwnerSlugFromPath()`가 첫 path segment를 owner slug로 해석한다.
- **owner 식별**: `home/site-owner.js`의 `getSiteOwner()`가 slug → `profiles.user_id`(ownerId)로 변환. 이 ownerId가 이후 모든 Skin 조회(`buildSkinContext`, `get_published_skin` RPC)의 유일한 scope 키다.
- **진입점**: `index.html`이 `window.skinHomeReady` Promise 핸드셰이크로 `skin/skin-home.js`의 `renderPublishedSkinHome({ ownerId, container })`를 호출한다. 이 함수가 `false`를 반환하면(published Skin 없음/실패) 기존 legacy 3-way(`legacy_sua`/`customize`/`notice`) 분기로 폴백한다 — 새 Skin 시스템의 장애가 공개 HOME을 절대 깨뜨리지 않는다는 원칙이 여기 집중돼 있다(`skin/skin-home.js:27-33`).
- **buildSkinContext() 현재 shape**(`skin/skin-context.js:400-467`, 전부 top-level):
  ```
  { site, profile, navigation, home, banners, images }
  ```
  - `site`: `{ title, slug, faviconUrl, description(null 고정), language("ko" 고정) }`
  - `profile`: `{ nickname, bio, avatarUrl }`
  - `navigation.categories[]`: `{ id, name, type, href, itemCount(null 고정) }`
  - `home.recentPosts[]`: `{ id, title(마스킹됨), href, publishedAt, categoryName }`
  - `banners.items[]`: `{ id, imageUrl, href, alt }`
  - `images`: `{ [slotName]: url|null }` — 렌더링할 Skin Version의 `imageSlots[].name` 목록이 있는 슬롯만 키로 존재.
- **데이터 출처**: `profiles`(nickname/bio/slug), `site_settings`(blog_title/favicon_url, key-value), `categories`(id/name/type/sort_order, `user_id` scope), `posts`(id/title/created_at/visibility/category_id, 최근 5개), `banners`(`category.type === "banner"`인 카테고리에만 연결).
- **published Skin 렌더 진입점**: `get_published_skin(p_user_id)` RPC → `{ skin, schemaVersion, imageSlotValues }` → `schemaVersion !== 1`이면 즉시 폴백(모르는 버전을 부분 렌더하지 않음) → `buildSkinContext()` → `renderSkin({ container, skin, context, mode:"view" })`.

### 1-2. CATEGORY / LIST

- **Route**: 경로형 `/:slug/category/:id` — **id는 숫자, slug/name 기반 경로 없음**. `posts/editor/posts-router-init.js`가 `pathname.match(/^\/category\/(\d+)\/?$/)`로 매칭해 `openCategoryPage(id)`를 호출한다. `skin-context.js`가 이미 만들어 둔 `navigation.categories[].href = buildSitePath(slug, /category/${id})`가 이 실제 라우트와 정확히 일치한다 — HOME Skin이 오늘도 이 링크를 그대로 쓰고 있다.
- **category id/type 읽기**: `posts/view/posts-view-list.js`의 `fetchCategoryPageData(categoryId)`가 `categories`에서 `id, name, type`만 select(`user_id` scope 시 추가 필터). `type`이 없으면(`null`) 클라이언트에서 `"post"`로 취급(`currentPostCategoryType = category.type || "post"`).
- **category.type 실제 값**: DB에 `CREATE TABLE categories` migration이 리포지토리에 없어(테이블이 migration 추적 이전부터 존재) **enum/CHECK 제약이 리포 안에는 없다.** 코드에서 실제로 쓰는 값은 `"post"`/`"banner"` 둘뿐이다. Admin 카테고리 편집기(`admin/settings/admin-settings-load.js:514-523`)가 `<select>` 옵션을 `[{value:"post"},{value:"banner"}]`로 하드코딩하고, 신규 카테고리는 기본 `type:"post"`로 생성된다. `"gallery"`는 코드 어디에도 없다(이번 요청 문서 자체에만 등장).
- **글 목록 조회**: `posts-view-list.js`가 `posts`에서 `id, title, created_at, visibility`만 select(`category_id` 필터, `user_id` scope 시 추가). **`.limit()`/`.range()` 없음 — 카테고리의 모든 글을 한 번에 가져온다.** 결과는 카테고리별 in-memory 캐시(`categoryPageCache`)에 저장, 글 저장/삭제 시에만 무효화.
- **목록 item 필드**: 제목은 `posts/posts-format.js`의 `applyPostVisibilityTitle()`이 `visibility`에 따라 🔒(secret)/🙈(private) 아이콘을 붙인다 — `skin-context.js`의 `maskSkinPostTitle()`과 완전히 동일한 원칙(문자열이냐 DOM span이냐만 다름). 날짜는 `formatPostListDate()`가 `MM.DD`(연도 없음, Asia/Seoul)로 포맷. **제목 텍스트 자체는 마스킹하지 않는다** — visibility는 아이콘에만 영향, 목록에 뜨는지 여부/제목 텍스트는 그대로.
- **클릭 흐름**: 카테고리 메뉴 클릭 → `openCategoryPage(id)`(글 목록 렌더 또는 배너 그리드 렌더) → 목록 item 클릭(이벤트 위임) → `openPostPage(id)`(상세 렌더) → 뒤로가기는 `currentPostCategoryId`로 다시 `openCategoryPage()`.
- **배너 카테고리 렌더 흐름**: `category.type === "banner"`이면 **posts 쿼리 자체를 건너뛴다**(`fetchCategoryPageData` 안에서 이미 분기). `renderBannerCategory()`가 별도 `banners` 테이블(`id, name, url, image_url, category_id, sort_order`)을 조회해 `#bannerGrid`를 채우고 `postList`는 숨긴다. "글 추가" 버튼도 이 분기에서 `openBannerForm()`으로 바뀐다(`openNewPostEditor()` 아님).
- **pagination**: **존재하지 않는다.** `posts/view/*`, `home/*`을 `page|offset|limit|cursor|range(` 기준으로 전수 조사 — 전부 무관한 매치(에디터의 "페이지 나누기", export 이미지 "페이지" 등)였다. 카테고리 글 목록은 항상 전체를 한 번에 로드.
- **미래 gallery 타입과 충돌 가능성**: `category.type === "banner"`만 검사하는 **binary if/else** 구조가 최소 3곳(`fetchCategoryPageData`, `openCategoryPage`, 글 추가 버튼 분기)에 있다 — `switch`가 아니므로 `"gallery"`를 추가해도 코드가 에러를 내는 대신 **조용히 post-list 경로로 새는** 실패 모드가 있다. Admin 편집기 `<select>`도 옵션 2개가 하드코딩돼 있어 값 자체를 고르게 하려면 이 부분부터 손대야 한다. DB 레벨 CHECK 제약은 리포에 없으므로 새 값 추가 자체는 DB 관점에서 막혀있지 않다.

### 1-3. POST VIEWER

- **Route**: 경로형 `/:slug/post/:id`(숫자 id). `posts-router-init.js`의 `/^\/post\/(\d+)\/?$/` 매칭 → `openPostPage(id)`. `posts/posts.html`은 독립 문서가 아니라 `index.html`에 fragment로 주입되는 SPA 파츠 — 라우팅은 전부 History API 기반 JS 라우팅.
- **post 로드**: `posts/view/posts-view-detail.js`가 `posts`에서 `id, category_id, user_id, title, content_type, visibility, created_at, quote_preset_id` select. **본문은 별도 테이블**: 공개/소유자 조회 시 `post_contents`에서 `content`만 별도 select(`post_id` FK). 카테고리 이름도 `categories`에서 별도 조회.
- **일반글/비밀글 분기**: `post.visibility === "secret" && !isOwnerViewing`이면 `post_contents`를 아예 요청하지 않고 `showPostSecretGate()`를 띄운다(비밀번호 폼, `posts/posts.html`의 `#postSecretGate`). 실제 비밀번호 대조는 `get_secret_post_content(p_post_id, p_password)` RPC 안(DB)에서만 일어난다 — 프론트 JS를 다 읽어도 우회 불가. **`private` visibility는 별도 게이트 UI가 없다** — 제목 아이콘(🙈)에만 영향, 실제 접근 제어는 RLS 등 다른 레이어의 몫으로 보인다(이 파일 범위 밖).
- **chrome 데이터**: 제목(`#postDetailTitle`, `applyPostVisibilityTitle()`), 날짜(`#postDetailDate`), 카테고리 — **본문 안쪽 링크가 아니라 페이지 레벨 breadcrumb**(`postPageTitle.textContent = categoryName`, `postDetail` 바깥의 별도 요소)로 표시된다. prev/next 링크는 **없다** — 대신 같은 카테고리의 "MORE IN {카테고리명}" 관련글 목록(`#postRelated`, `loadRelatedPosts()`)이 존재.
- **Quote Preset 적용 경로**: "Quote Preset Renderer"라는 별도 모듈/독립 DOM 루트는 없다. 실체는 `posts/style/posts-style-render.js`의 `renderStyledPostContent()` → `renderStyledPostContentInto(postDetailContent, content, settings)` — **outer page가 이미 소유한 컨테이너에 직접** 렌더한다. `quote_preset_id`는 개별 인용구 블록 컴포넌트가 아니라 **폰트/색/행간/정렬/대화체 스타일 등을 담은 전역 타이포그래피 프로필**이다.
- **본문 DOM root**: `<div id="postDetailContent" class="post-detail-content">`(`posts/posts.html`). html-raw 모드든 styled(quote-preset) 모드든 전부 이 컨테이너 하나로 귀결된다(`renderPostDetailBody()`). 이 컨테이너 내부를 건드리는 코드는 이 렌더 함수들 외에 없다.
- **본문 전후 UI**: 소유자 전용 수정/삭제 버튼(`#postDetailActions`), 폰트 크기 +/- 버튼, 관련글 목록(`#postRelated`) — 전부 `#postDetailContent` **바깥**, `<article id="postDetail">` 안. **댓글/공유/좋아요·하트 반응 버튼은 코드 어디에도 없다**(조사 결과 명시적으로 부재).
- **secret post content RPC와의 관계**: 잠금 해제 후에도 **동일한** `renderPostDetailBody()` 경로를 탄다 — secret 전용 렌더 분기는 없음.
- **legacy/raw HTML 경로**: `content_type === "html"`이 실제로 존재하는 정식 모드(레거시가 아니라 현재도 쓰이는 대체 경로) — `postDetailContent.innerHTML = contentText`로 sanitize/스타일 프리셋 없이 그대로 출력한다(코드 주석이 명시). 별도로 `posts/posts-sanitize.js`의 `legacyMarkupToRichHTML()`은 옛 포맷을 리치텍스트로 업그레이드하는 fallback이며, 이 html-raw 모드와는 다른 것.

### 1-4. 현재 Binding 문법(존재 확인된 것만)

`skin/skin-render.js`/`skin/skin-sanitize.js` 기준, 실제로 동작하는 5개뿐이다:

| 속성 | 동작 | 제약 |
|---|---|---|
| `data-imory-bind="path"` | `resolvePath(path)` 결과를 **textContent로만** 대입(XSS 원천 차단). `undefined`/`null`이면 빈 문자열. | 값이 무엇이든 innerHTML 경로 없음. |
| `data-imory-href="path"` | resolve된 문자열이 `isSafeSkinUrl()` 통과 시에만 `href` 속성 설정 | 실패 시 속성 자체를 제거(placeholder 대체 없음, "v0.1은 하지 않음"이라고 코드 주석에 명시) |
| `data-imory-src="path"` | 위와 동일, `src` 속성 | 위와 동일 |
| `data-imory-repeat="path"` | 배열이면 템플릿 엘리먼트를 item마다 clone. 아니면(배열 아님/undefined) 엘리먼트 자체를 제거 | **non-nested만 지원** — repeat 내부에서 또 `data-imory-repeat`를 만나면 경고 후 그 하위 엘리먼트를 스킵(빈 배열 취급). item 스코프에서는 `item`/`item.foo` 경로가 우선 해석되고, 못 찾으면 바깥 스코프로 폴백. |
| `data-imory-if="path"` | truthy/falsy만 판정(배열은 `length > 0`) → `el.hidden` 토글 | **비교 연산 없음**("==", "!=" 등 지원 안 함) — `page.type === "home"` 같은 조건은 이 문법으로 표현 불가능(4-2절에서 이 제약이 실제로 설계에 영향을 준다). |

**`data-imory-region`(또는 region 개념)은 현재 렌더러/새니타이저 어디에도 구현돼 있지 않다.** `SkinPackage.regions` 필드는 존재하지만(`skin/skin-generator.js`, `test-skins/static-test-skin.json`, DB migration 주석) 생성기가 항상 빈 배열(`[]`)만 채워 넣고, `skin-render.js`/`skin-css-validate.js` 어디서도 이 필드를 읽지 않는다 — **완전히 미사용 placeholder**다. 이번 문서 9절은 이 이름을 실제로 무엇에 쓸지 "제안"만 하고 구현하지 않는다.

새니타이저(`skin/skin-sanitize.js`)가 저장 시점에 허용하는 `data-imory-*` 속성은 정확히 5개(`bind`/`src`/`href`/`repeat`/`if`)뿐이며, 값은 `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$` 패턴(dotted identifier)만 통과한다. `id` 속성은 **전면 금지**(v0.1 정책, "id" 자체가 `SKIN_SANITIZE_DENY_ATTRS`에 있음) — 즉 미래에 region을 식별자로 구현하더라도 표준 `id` 속성은 못 쓴다(9절에서 이 제약을 반영).

### 1-5. SkinPackage 구조 (현재)

```js
{
  schemaVersion: 1,
  html: "...",       // 지금은 HOME 전용 단일 문서
  css: "...",
  imageSlots: [ { name, label, required, aspectRatioHint } ],
  regions: [],        // 미사용 placeholder(1-4절)
  metadata: {
    title, generatedBy,
    supports: { home: true, list: false, post: false },  // 조사 결과: 어디서도 읽지 않는 순수 정보성 필드
    requiredContext: [ "site.title", ... ]                // 마찬가지로 렌더/검증 시점에 실제로 체크되지 않음(문서에만 "쓸 수 있다"고 적혀 있음)
  }
}
```

`metadata.supports`/`metadata.requiredContext` 둘 다 **오늘은 순수 정보성 필드**다 — 렌더러도, 저장 RPC도, Studio도 이 값을 읽어서 분기하지 않는다. 문서/향후 도구가 참고할 수 있는 선언일 뿐 지금 당장 강제되는 계약이 아니라는 점을 이번 설계에서 전제로 삼는다.

---

## 2. 왜 PHASE 1C가 AI보다 먼저 필요한가

PHASE 1B가 끝난 지금 시점에서 다음 Phase를 곧장 "AI가 Skin HTML/CSS를 생성/수정한다"로 잡으면, AI가 만들 산출물의 **shape 자체가 아직 정의되지 않은 상태**에서 생성 로직부터 짜게 된다. 구체적으로 막히는 지점:

1. **AI가 만든 Skin이 CATEGORY/POST까지 커버해야 하는데, 그 두 화면의 Context shape이 없다.** `buildSkinContext()`는 HOME 전용이라 AI가 "카테고리 목록 페이지를 만들어줘"라는 요청을 받아도 바인딩할 데이터 계약 자체가 없다.
2. **SkinPackage가 html 하나만 가진다.** AI가 페이지별로 다른 레이아웃을 만들어야 할 때, 그 결과물을 어디에 넣을지(단일 html 안에 조건부 섹션? 별도 template 필드?)가 결정 안 된 채로 생성기를 설계하면, 이후 구조를 바꿀 때 AI 프롬프트/파서까지 다시 짜야 한다.
3. **post 본문 보호 경계가 없다.** AI가 자유롭게 HTML을 생성하는 순간, "본문 자리"를 Skin이 마음대로 삭제/이동/`data-imory-bind="post.content"`로 직접 노출해버릴 위험이 생긴다 — Quote Preset이 담당해야 할 영역을 지금 계약해 두지 않으면, AI 프롬프트로 이 경계를 강제하기가 사실상 불가능하다(자연어 지시는 새니타이저만큼 강제력이 없다).
4. **Studio Preview가 이미 "미리보기 = 진짜 데이터로 실시간 확인"을 핵심 가치로 잡고 있다**(PHASE 1B 11-1절). CATEGORY/POST 미리보기가 없으면 AI가 그 두 화면을 생성/수정해도 사용자가 확인할 방법이 없다 — 데이터 계약 없이는 Preview 확장도 설계할 수 없다.

즉 PHASE 1C는 "AI 없이 먼저 사람이 만들 수 있는 최소 계약"을 정의하는 단계이고, 이 계약이 서 있어야 PHASE 5(AI 연동)가 "이 계약대로 생성/수정하라"는 명확한 스펙을 프롬프트/검증 로직에 넣을 수 있다.

---

## 3. 공통 Context — page.type과 data-imory-if의 실제 한계

### 3-1. 채택 구조

```js
{
  site: {...},        // 공통, 기존과 동일
  profile: {...},      // 공통, 기존과 동일
  navigation: {...},   // 공통, 기존과 동일

  page: {
    type: "home" | "category" | "post",
    isHome: boolean,
    isCategory: boolean,
    isPost: boolean
  },

  home: {...} | undefined,
  category: {...} | undefined,
  post: {...} | undefined,

  images: {...}        // 공통, 기존과 동일(images/banners 네임스페이스 유지, 4-2절)
}
```

`site`/`profile`/`navigation`/`images`는 세 화면 모두 top-level 그대로 유지한다(기존 HOME 계약과 100% 동일 shape) — 4절에서 상세.

### 3-2. `page.type`을 왜 boolean 3종과 함께 두는가

`data-imory-if`는 **truthy/falsy 판정만** 지원하고 비교 연산(`===`)이 없다(1-4절). 즉 `data-imory-if="page.type"`은 항상 truthy("home"/"category"/"post" 문자열은 전부 truthy)라서 "지금이 HOME인가"를 표현할 수 없다. 이번 계약이 실제로 쓸 수 있는 형태는 `page.isHome`/`page.isCategory`/`page.isPost` 같은 boolean이다.

**다만 v0.1은 이 boolean들을 "한 문서 안에서 페이지별 섹션을 조건부로 감추는 용도"로 강제하지 않는다** — 10절에서 다루듯, v0.1은 페이지별로 **별도 template**을 렌더하는 방식(B안)을 권장하므로, `page.type` 조건 분기가 한 HTML 안에서 크게 쓰일 일이 없다. 그래도 `page.type`/`isHome`/`isCategory`/`isPost`는 계약에 넣어 둔다 — 이유:
- 세 template이 공유하는 헤더/푸터 조각 안에서 "지금 보고 있는 페이지가 카테고리 메뉴 중 하나면 active 표시" 같은 아주 지엽적인 조건에는 여전히 유용하다(예: `data-imory-if="page.isHome"`로 HOME에서만 보이는 홈 전용 버튼 하나 정도).
- A안(단일 html + 조건부 섹션)을 완전히 배제하지 않는다 — 나중에 실제 구현 단계에서 B안이 생각보다 무거우면 A안으로 되돌아갈 수 있는 여지를 컨텍스트 레벨에서는 남겨 둔다(SkinPackage 구조 자체를 바꾸는 것보다 컨텍스트에 필드 하나 남겨두는 게 훨씬 싸다).

### 3-3. `home`/`category`/`post`가 동시에 존재하는가

**아니다.** 렌더러는 항상 하나의 `page.type`에 대해서만 렌더하므로, 실제로 채워지는 것은 그 페이지에 해당하는 네임스페이스 하나뿐이다(예: CATEGORY 페이지 렌더 시 `context.category`만 채워지고 `context.post`는 `undefined`). `resolveSkinPath()`가 `undefined`/`null`을 안전하게 처리하므로(11절), 어떤 template이 실수로 다른 페이지의 네임스페이스를 바인딩해도 조용히 빈 값이 될 뿐 에러는 나지 않는다 — 다만 "왜 안 보이지"를 디버깅하기 어렵게 만드는 트레이드오프이므로, `metadata.requiredContext`(1-5절, 현재 미검증)를 이 시점에 실제로 검증하는 기능을 넣을지는 이후 Slice에서 검토할 열린 질문으로 남긴다(11절 참고).

---

## 4. HOME Contract — 기존과 완전히 동일(추가만, 파괴적 변경 없음)

### 4-1. 필드

기존 `buildSkinContext()` 출력(1-1절)을 그대로 `home` 네임스페이스로 옮기지 않는다 — **site/profile/navigation/images/banners는 계속 top-level에 남고, `home`은 HOME 페이지 전용 데이터만 담는다.** 즉:

```js
{
  site: { title, slug, faviconUrl, description, language },
  profile: { nickname, bio, avatarUrl },
  navigation: { categories: [...] },
  banners: { items: [...] },     // 기존과 동일 위치 유지(4-2절 이유)
  images: {...},

  page: { type: "home", isHome: true, isCategory: false, isPost: false },

  home: {
    recentPosts: [ { id, title, href, publishedAt, categoryName } ]  // 변경 없음
  }
}
```

### 4-2. `banners`가 왜 `home.banners`가 아니라 top-level에 남는가

`banners`는 원래 "홈 화면 전용"이 아니라 **"`type: 'banner'`인 카테고리가 있으면 그 카테고리에 연결된 배너들"**이다(1-1절 데이터 출처). 지금은 HOME에서만 노출하고 있을 뿐, 향후 배너 카테고리가 자기 자신의 페이지(카테고리 클릭 시 배너 그리드, 1-2절)를 가질 수 있으므로 처음부터 `home.banners`로 가두면 나중에 "카테고리 페이지에서도 배너 데이터가 필요하다"는 요구가 생겼을 때 계약을 옮겨야 한다. top-level `banners`로 두면 어느 `page.type`에서든 참조할 수 있는 여지가 생긴다(단, v0.1이 배너 카테고리 페이지 자체를 계약하지는 않는다 — 13-1절).

### 4-3. Backward compatibility

기존에 저장된 HOME Skin은 오직 `site.*`/`profile.*`/`navigation.*`/`home.*`/`banners.*`/`images.*`만 참조한다(1-4절 sanitizer가 dotted identifier만 허용하므로 새로 추가되는 `page.*` 경로를 우연히 참조하고 있을 수 없다). 이번 계약이 추가하는 것은 `page` 네임스페이스 하나뿐이고, 기존 필드는 값/구조 무엇 하나 바뀌지 않는다 — 즉 **기존 published HOME Skin은 이 계약이 실제 구현되어도 다시 저장하거나 재검증할 필요가 전혀 없다.**

---

## 5. CATEGORY Contract — post형 category만, v0.1

### 5-1. 필드

```js
context.category = {
  id: String,
  name: string,
  type: "post" | "banner",   // 미래 "gallery" 등은 13-3절
  href: string,               // buildSitePath(slug, `/category/${id}`) — 자기 자신의 permalink

  posts: [
    {
      id: String,
      title: string,          // maskSkinPostTitle()과 동일한 마스킹된 최종 문자열(5-3절)
      href: string,
      publishedAt: string     // ISO 문자열, created_at 그대로
    }
  ]
}
```

### 5-2. `category.type !== "post"`일 때 `category.posts`는 무엇을 담는가

**v0.1은 `type: "banner"`(또는 미래의 다른 non-post 타입) 카테고리 페이지의 데이터 계약을 정의하지 않는다.** 실제 구현 단계에서 CATEGORY Skin Renderer는 `category.type !== "post"`인 경우 이 계약을 아예 적용하지 않고(즉 Skin 렌더 경로 자체를 타지 않고) 기존 legacy 배너 렌더 흐름(1-2절, `renderBannerCategory()`)으로 폴백해야 한다 — `category.posts`에 억지로 빈 배열이나 배너 데이터를 밀어 넣지 않는다. 이 판단 근거는 13-1절.

### 5-3. visibility/secret 정책 재확인

`category.posts[].title`은 실제 `posts-format.js`의 `applyPostVisibilityTitle()`과 동일한 원칙(🔒 secret / 🙈 private 아이콘, 1-2절)을 그대로 따른다 — HOME의 `maskSkinPostTitle()`을 그대로 재사용할 수 있다(이미 순수 함수이고 DB 컬럼이 아니라 문자열만 다룬다). **`visibility` 원본 값 자체는 Context에 노출하지 않는다** — Skin은 HOME과 마찬가지로 visibility 개념을 몰라도 되고, 이미 아이콘이 섞인 최종 텍스트만 받는다(1절에서 확인한 기존 원칙 그대로 계승). 목록에서 실제로 공개 가능한 정보(제목-아이콘 조합, 날짜, id, 링크)만 노출하고, 본문/비밀번호 힌트 등은 애초에 이 목록 쿼리 자체가 select하지 않는다(1-2절 조사에서 확인한 실제 select 컬럼과 동일).

### 5-4. 왜 `categoryName`을 item에 넣지 않는가

`home.recentPosts[].categoryName`은 여러 카테고리를 섞어서 보여주는 목록이라 각 항목이 자기 카테고리를 표시해야 하지만, `category.posts[]`는 이미 하나의 카테고리 안에서만 도는 목록이라 `category.name`(상위 필드)로 충분하다 — item마다 같은 값을 반복해서 넣는 건 "불필요한 필드까지 노출하지 않는다"는 원칙(사용자 요청 7절)에 반한다.

### 5-5. pagination

**v0.1은 pagination을 계약하지 않는다**(1-2절 조사: 실제 legacy 목록도 페이지네이션 없이 전체를 한 번에 로드). `category.posts`는 v0.1에서 카테고리의 전체 글 목록이다 — 글이 아주 많은 사용자에게는 이미 오늘도 존재하는 성능 리스크이고, Skin 도입이 이 리스크를 새로 만드는 것은 아니다. 13-4절에서 향후 확장 방향만 기록한다.

---

## 6. POST Contract — outer chrome만

### 6-1. 필드

```js
context.post = {
  id: String,
  title: string,              // 마스킹된 최종 문자열(secret/private 아이콘 포함, 5-3절과 동일 원칙)
  publishedAt: string,        // ISO, created_at
  categoryName: string | null,
  categoryHref: string | null
}
```

### 6-2. `previous`/`next`를 넣지 않는 이유

조사 결과(1-3절) 실제 Post Viewer에는 이전글/다음글 개념 자체가 없다 — 대신 "같은 카테고리의 관련 글 목록"(`#postRelated`, `loadRelatedPosts()`)이 그 자리를 대신한다. 존재하지도 않는 UI 개념을 계약에 먼저 넣는 것은 YAGNI 위반이고, 실제로 필요해지면(관련 글 목록을 Skin이 표현하고 싶어지면) `post.relatedPosts[]`처럼 실제 UI와 대응되는 이름으로 추가하는 편이 낫다 — **v0.1은 이것도 넣지 않는다**(13-5절에서 향후 후보로만 기록). previous/next 자체도, related list도 지금 v0.1 POST 계약에는 없다 — 6절 필드 5개가 전부다.

### 6-3. `categoryName`/`categoryHref`가 둘 다 nullable인 이유

`posts.category_id`는 nullable일 수 있다(조사 대상은 아니었지만 `category_id` FK가 optional인 스키마 관례상 — 카테고리 없이 작성된 글 가능성). null이면 두 필드 모두 `null`이고, Skin은 `data-imory-if="post.categoryName"`으로 감싼 뒤에만 `post.categoryHref`를 바인딩해야 한다(10절 optional 규칙과 동일 패턴).

---

## 7. Protected Post-Body Contract — 가장 중요한 경계

### 7-1. 목표 구조

```
Skin (data-imory-* 바인딩, Skin CSS)
├── header / nav (공통)
├── post.title / post.categoryName 등 chrome
├── [PROTECTED REGION: post-body]  ← Skin은 이 "자리"만 만든다
└── footer / navigation (공통)
```

### 7-2. 왜 `data-imory-bind="post.content"`로 노출하지 않는가

`data-imory-bind`는 **textContent로만** 대입한다(1-4절, XSS 원천 차단이 이 함수의 유일한 설계 의도). 본문은 HTML 구조(문단, 인용구 스타일, 대화체 강조 등)를 가진 콘텐츠라 textContent로는 표현이 아예 불가능하다 — 즉 `post.content`를 일반 bind 값으로 노출하는 방식은 지금 렌더러 설계상 **작동조차 하지 않는다**(단순히 "피하고 싶은" 정도가 아니라 현재 문법 자체가 이걸 지원하지 못한다). 그렇다고 본문을 위해 새로운 "innerHTML 바인딩" 문법을 만드는 것은 Skin이 신뢰할 수 없는 위치(AI 생성/사용자 편집)에서 임의 HTML을 그대로 심는 문을 여는 것과 같다 — 지금 `skin-sanitize.js`가 지키는 경계(1-4절)를 정면으로 허문다.

### 7-3. 제안 — `data-imory-region="post-body"` (신규, 이번 문서에서 구현하지 않음)

**컨셉**: Skin HTML은 본문이 들어갈 "빈 자리"만 마크업으로 표시한다.

```html
<article class="skin-post">
  <h1 data-imory-bind="post.title"></h1>
  <p data-imory-if="post.categoryName" data-imory-bind="post.categoryName"></p>

  <div class="skin-post-body-slot" data-imory-region="post-body"></div>

</article>
```

Post Viewer(실제 페이지 컨트롤러)가 `renderSkin()`으로 Skin을 먼저 마운트한 뒤, 마운트된 DOM에서 `[data-imory-region="post-body"]`를 찾아 그 안에 Quote Preset Renderer의 결과(`renderStyledPostContentInto()`가 만드는 DOM/HTML)를 직접 주입한다. **`skin-render.js`는 `data-imory-region` 속성을 전혀 해석하지 않는다** — bind/repeat/if처럼 값을 resolve하지 않고, 그냥 빈 컨테이너로 남겨 둔 채 통과시킨다. 즉 이 계약은 skin-render.js에 새 로직을 추가하지 않고도(자리 표시만 새니타이저 화이트리스트에 추가하면) 성립한다 — **렌더러의 책임 경계를 넓히지 않는다.**

### 7-4. 왜 이 방식이 가장 단순한가 (대안 비교)

- **iframe으로 본문을 완전히 격리**: CSS/JS 샌드박싱은 확실하지만, Skin CSS가 본문 타이포그래피(폰트 크기 스케일링 등 기존 `#postDetailFontScale` 기능, 1-3절)와 자연스럽게 어우러지게 하려던 목적과 충돌한다 — 지금 즉시 채택할 이유가 없다(과한 엔지니어링).
- **Shadow DOM으로 본문만 격리**: CSS 누수를 원천 차단할 수 있어 매력적이지만, 지금 렌더러가 Shadow DOM을 전혀 안 쓰고 있어(1-4절 확인) 도입 비용이 region 마커 하나 추가하는 것보다 훨씬 크다 — v0.1 범위를 넘는다.
- **`data-imory-region` 마커 + Post Viewer가 직접 주입(채택)**: 새 렌더링 인프라가 필요 없고, 기존 "Post Viewer가 `#postDetailContent`를 소유하고 Quote Preset이 그 안에 그린다"는 현재 구조(1-3절)를 거의 그대로 재사용할 수 있다 — 유일한 차이는 그 컨테이너를 Post Viewer가 직접 만드는 대신 Skin이 만든 마크업에서 찾아 쓴다는 것뿐이다.

### 7-5. 책임 경계 (반드시 지킬 것)

| 주체 | 할 수 있는 것 | 할 수 없는 것 |
|---|---|---|
| **Skin (HTML/CSS)** | region 컨테이너의 위치, 바깥 여백/배경/보더, 그 컨테이너를 감싸는 레이아웃 전체를 결정 | region 컨테이너 **내부**의 구조/내용을 교체·주입·삭제 — Skin에는애초에 본문 데이터 자체가 주어지지 않는다(post.content는 Context에 없음, 6절) |
| **Skin Renderer(`skin-render.js`)** | `data-imory-region` 속성을 가진 엘리먼트를 다른 bind/repeat/if와 동일하게 트리에 그대로 유지(값 resolve 안 함) | region 내부에 무언가를 채워 넣는 로직 — 이건 렌더러 책임이 아니다 |
| **Post Viewer** | `renderSkin()` 마운트 완료 후 region 엘리먼트를 찾아 Quote Preset Renderer 호출, secret gate UI도 이 region 안에 렌더(잠금 상태의 "자리"도 결국 본문이 있어야 할 자리이므로) | chrome 영역(title/date/category)을 직접 DOM 조작하는 것 — 그건 Skin의 `data-imory-bind`가 담당(6절 필드가 이미 그 정보를 Context로 넘겨준다) |
| **Quote Preset Renderer** | region 컨테이너에 주어지는 실제 본문 렌더(오늘의 `renderStyledPostContentInto()`와 동일) | Skin이 무엇인지, 어떤 Context를 쓰는지 전혀 알 필요 없음(오늘과 동일하게 완전히 독립적) |

### 7-6. 알려진 미해결 지점 (구현 시 반드시 결정할 것, 이번 문서는 답을 내지 않는다)

1. **CSS 누수**: Skin CSS의 셀렉터(`p`, `.title` 등 범용 이름)가 region 내부 콘텐츠에도 그대로 적용될 수 있다 — `validateAndScopeSkinCss()`가 스코프 클래스를 skin root에만 붙이므로(1-1절), region 내부도 그 스코프 안에 물리적으로 위치하는 한 완전히 격리되지 않는다. Shadow DOM 없이 이 문제를 어디까지 허용할지는 실제 구현 Slice의 열린 질문.
2. **`renderSkin().update()`와의 충돌**: `mount()`가 매번 `container.innerHTML = ""`부터 다시 그린다(1-1절) — Post Viewer가 region에 주입한 내용은 `update()`가 다시 호출되는 순간 사라진다. v0.1 POST 페이지는 Studio처럼 실시간 재마운트가 필요 없는(1회 마운트) 화면이라 당장 문제는 아니지만, 15절 Studio POST Preview에서 페이지 탭을 전환할 때 이 재주입을 누가/언제 다시 트리거하는지는 정해야 한다.
3. **새니타이저 확장 필요**: `data-imory-region`을 실제로 저장 가능하게 하려면 `skin-sanitize.js`의 `SKIN_SANITIZE_BIND_ATTRS`(1-4절)에 이 속성을 추가해야 한다 —가벼운 변경이지만 "구현하지 않는다"는 이번 라운드 원칙에 따라 지금 건드리지 않는다.

---

## 8. Binding 문법 표 (v0.1 — 기존 5종 그대로, 신규 제안 1종 별도 표기)

| 문법 | 상태 | 값/제약 |
|---|---|---|
| `data-imory-bind="path"` | **기존, 변경 없음** | textContent만. `undefined`/`null` → 빈 문자열 |
| `data-imory-href="path"` | **기존, 변경 없음** | `isSafeSkinUrl()` 통과해야 적용, 실패 시 속성 제거 |
| `data-imory-src="path"` | **기존, 변경 없음** | 위와 동일 |
| `data-imory-repeat="path"` | **기존, 변경 없음** | 배열만, non-nested만 |
| `data-imory-if="path"` | **기존, 변경 없음** | truthy/falsy만, 비교 연산 없음 |
| `data-imory-region="name"` | **신규 제안, 미구현**(7절) | v0.1 유일한 값: `"post-body"`. resolve 대상 아님(값 자체가 경로가 아니라 고정 문자열 식별자) — 새니타이저/렌더러 양쪽 확장 필요 |

---

## 9. Optional / null / repeat 규칙

### 9-1. Optional 값이 없을 때

| Context 경로 | 없을 수 있는 경우 | 계약 |
|---|---|---|
| `profile.bio` | 소개글 미작성 | `null`. `data-imory-if="profile.bio"`로 감싼 뒤에만 bind(기존 HOME 계약과 동일, 1-1절에서 확인된 그대로) |
| `category.posts` | 글이 하나도 없는 카테고리 | `[]`(빈 배열, `undefined`/`null` 아님) — `data-imory-repeat`은 빈 배열이면 아무것도 렌더하지 않고 조용히 사라진다(1-4절 동작 그대로). "글이 없습니다" 같은 안내 문구가 필요하면 `data-imory-if="category.posts"`(빈 배열은 falsy, 1-4절 `isSkinTruthy`)로 감싼 반대 블록으로 표현해야 한다 — if만으로 "비어있음 전용 UI"를 만드는 패턴은 이미 HOME도 쓰고 있지 않으므로(현재 static-test-skin.json의 `data-imory-if="home.recentPosts"` 참고) 새 패턴이 아니다. |
| `post.categoryName`/`post.categoryHref` | 카테고리 없이 작성된 글 | 둘 다 `null`(6-3절). href만 단독으로 null이 되는 경우는 없다(항상 쌍으로 존재/부재). |
| `home.recentPosts[].categoryName` | 카테고리 없는 글이 최근글에 포함 | `null`(기존 동작 그대로, `skin-context.js:448`) |
| `images.*` | 이미지 슬롯 값 미설정 | `null`(1-1절 `buildSkinImages`) |

### 9-2. 원칙

값이 없다는 것은 **필드가 사라지는 게 아니라 항상 `null`(또는 빈 배열)로 존재**한다 — `resolveSkinPath()`가 중간 경로에서 `undefined`를 만나면 그 아래로는 더 내려가지 않고 즉시 `undefined`를 반환하므로(1-4절 구현), AI/사람 저작자가 "이 필드가 존재하는지"를 매번 걱정하지 않고 항상 `data-imory-if`로 감싸는 동일한 패턴만 익히면 되게 한다. 이 원칙은 새로 만드는 것이 아니라 **HOME이 이미 쓰고 있는 원칙을 CATEGORY/POST에도 명시적으로 확장 적용**하는 것뿐이다.

### 9-3. Repeat 대상 전체 목록

| 경로 | item 필드 |
|---|---|
| `navigation.categories` | `id, name, type, href, itemCount(null 고정)` |
| `home.recentPosts` | `id, title, href, publishedAt, categoryName` |
| `banners.items` | `id, imageUrl, href, alt` |
| `category.posts`(신규) | `id, title, href, publishedAt` |

nested repeat는 지금도 불가능하고(1-4절) v0.1도 이 제약을 그대로 유지한다 — 위 4개 배열 중 어떤 item도 그 안에 또 다른 배열 필드를 갖지 않는다(전부 스칼라/nullable 스칼라 필드만).

---

## 10. href/src 규칙

| Context 값 | 바인딩 | 통과 조건 |
|---|---|---|
| `profile.avatarUrl` | `data-imory-src` | `isSafeSkinUrl()`(https 또는 사이트 상대경로만, 1-4절) |
| `images.*` | `data-imory-src` | 위와 동일 |
| `item.href`(navigation/home.recentPosts/category.posts repeat 내부) | `data-imory-href` | `buildSitePath()`가 만든 사이트 내부 경로 — 항상 `/`로 시작, https 파싱 기준 통과(1-4절) |
| `banners.items[].imageUrl` | `data-imory-src` | 위와 동일 |
| `banners.items[].href` | `data-imory-href` | 사용자가 입력한 임의 URL일 수 있음(외부 링크 허용) — https만 통과, 실패 시 속성 제거(placeholder 없음) |
| `category.href`(신규) | `data-imory-href` | `item.href`와 동일 규칙 |
| `post.categoryHref`(신규) | `data-imory-href` | 위와 동일, null이면 9-1절 규칙대로 `data-imory-if`로 먼저 감싸야 함 |

protocol 제한은 기존 `isSafeSkinUrl()` 그대로다(1-4절) — v0.1이 이 함수 자체를 바꾸지 않는다.

---

## 11. category.type 미래 확장 — 지금 억지로 추상화하지 않는다

- **v0.1 대상**: `category.type === "post"`뿐.
- **`type: "banner"`**: 조사 결과(1-2절/5-2절)대로, 데이터 계약을 정의하지 않고 legacy 배너 렌더 흐름 그대로 둔다. Skin이 배너 카테고리 페이지를 담당하게 만들려면 그 자체로 별도 라운드가 필요하다(13-2절 후보만 기록).
- **`type: "gallery"`(미래)**: 코드에 아직 존재하지 않는다(1-2절). `category.posts`와 유사하지만 완전히 다른 item shape(이미지 그리드, 캡션 등)가 필요할 가능성이 높다 — 지금 `category.posts`를 `category.items`처럼 제네릭하게 이름 짓거나, post/gallery를 하나의 "collection" 추상화로 합치려는 시도는 **하지 않는다**(YAGNI, 사용자 요청 13절과 동일 판단). 대신 `category.type` 필드 자체가 이미 판별자로 존재하므로, 나중에 `category.type === "gallery"`일 때만 `category.images[]`(가칭) 같은 **별도 네임스페이스**를 추가하는 것으로 v0.1 계약을 전혀 깨지 않고 확장할 수 있다 — `category.posts`가 `category.type !== "post"`일 때 정의되지 않는다는 5-2절 원칙이 이미 이 확장을 위한 여지를 만들어 둔다.

---

## 12. SkinPackage Multi-page 구조 후보 비교

### 12-A. 단일 `html` 안에서 `page.type` 조건 처리

```js
{ schemaVersion, html /* 전체 페이지 조건부 섹션 포함 */, css, imageSlots, regions, metadata }
```

- 장점: SkinPackage 구조 변경 없음(필드 추가 자체가 없음).
- 단점: `data-imory-if`가 비교 연산을 지원하지 않으므로(1-4절), "이 섹션은 HOME에서만"을 표현하려면 `page.isHome`/`page.isCategory`/`page.isPost` 3개 boolean을 미리 발급해 둬야 하고, 페이지 하나 늘 때마다 boolean이 늘어난다. 하나의 html 문서 안에 세 화면의 마크업이 전부 뒤섞여 있어 **AI가 "카테고리 페이지만 수정해줘" 요청을 받았을 때 나머지 두 페이지 마크업까지 통째로 다시 봐야 한다** — 프롬프트 컨텍스트 낭비와 실수로 다른 페이지를 건드릴 위험이 커진다. Studio가 페이지별 미리보기 탭을 만들 때도 "이 큰 문서에서 지금 활성 페이지에 해당하는 섹션만 보이게" 처리해야 해서, 결국 렌더 후 CSS로 나머지를 완전히 숨겨야 하며 SEO/접근성 관점에서도 불필요한 DOM이 항상 함께 로드된다.

### 12-B. 페이지별 template 필드 (`templates: { home, category, post }`)

```js
{
  schemaVersion,
  templates: {
    home:     { html, css? },
    category: { html, css? },
    post:     { html, css? }
  },
  css,          // 공유 전역 스타일(색상 토큰, 폰트 등) — v0.1은 템플릿별 css를 두지 않고 이 하나만 유지(아래 근거)
  imageSlots,
  regions,
  metadata
}
```

- 장점: 페이지별로 독립된 문서라 **AI 생성/수정 단위가 자연스럽게 "이번엔 category만"으로 쪼개진다.** Studio Preview가 페이지 탭을 바꾸는 것도 "다른 template 문자열을 같은 iframe에 다시 postMessage"로 끝난다(15절과 직결). 렌더러 입장에서도 `renderSkin({ skin: { html: skin.templates[page.type] ?? skin.html, css: skin.css }, context })`처럼 아주 얕은 변경만 필요하다.
- 단점: SkinPackage 스키마가 늘어난다(다만 `schemaVersion` 자체는 안 바꿔도 된다, 14절). 템플릿마다 완전히 다른 구조라 "공통 헤더"를 세 template에 각각 복붙해야 하는 중복이 생길 수 있다 — 이건 v0.1이 해결하지 않는다(공통 조각 include 같은 기능은 범위 밖, 16절).

### 12-비교 결론

**B안을 채택한다.** 근거는 12-B 장점란과 2절("AI보다 먼저 필요한 이유")의 3번(생성 단위)·15절(Studio Preview 확장) 두 가지가 전부 B안 쪽으로 수렴하기 때문이다 — A안은 지금 당장 스키마를 안 바꿔도 된다는 이점 하나만 있고, 나머지는 전부 B안이 우월하다.

**템플릿별 `css`를 따로 두지 않고 공유 `css` 하나만 유지하는 이유**: 색상 토큰/폰트 같은 사이트 전역 톤은 세 화면이 같은 Skin이라면 당연히 통일돼야 하고(사용자 프롬프트 5절 "site/profile/navigation은 공통" 원칙의 CSS판), `validateAndScopeSkinCss()`(1-1절)가 지금 하나의 css 문자열을 검증/스코프하는 구조라 템플릿마다 별도 css를 두면 그 검증을 세 번 돌리고 스코프 namespace도 세 개 관리해야 한다 — v0.1이 감당할 필요 없는 복잡도다. 페이지별로 정말 다른 스타일이 필요하면(예: post 페이지만의 본문 폭) 각 template의 최상위 클래스(`.skin-home`/`.skin-category`/`.skin-post` 같은)를 selector로 쓰는 공유 css 규칙으로 충분히 표현된다.

---

## 13. 선택한 권장안 — 요약

- **Context**: 3절 구조(`site/profile/navigation/images/banners` top-level 공통 + `page.type`/`isHome`/`isCategory`/`isPost` + 페이지별 네임스페이스 `home`/`category`/`post` 중 하나만 채워짐).
- **SkinPackage**: 12-B(`templates: { home, category, post }` + 공유 `css`).
- **본문 보호**: 7절 `data-imory-region="post-body"` 제안(미구현, 새니타이저/렌더러 확장 필요 — 16절에서 재확인하듯 이번 라운드는 이 확장 자체를 하지 않는다).

---

## 14. Backward Compatibility

### 14-1. 기존 published/draft HOME Skin(schemaVersion 1, `html`/`css` top-level, `templates` 필드 없음)

렌더러가 다음 규칙으로 fallback하면 **기존 Skin은 단 한 byte도 다시 저장할 필요가 없다**:

```js
function resolveSkinTemplate(skinPackage, pageType) {
  return (
    skinPackage.templates?.[pageType] ??
    (pageType === "home" ? { html: skinPackage.html, css: skinPackage.css } : undefined)
  );
}
```

- `pageType === "home"`이고 `templates` 필드가 아예 없는 옛 Skin → 기존 top-level `html`/`css`를 그대로 씀(현재 동작과 100% 동일).
- `pageType === "category"`/`"post"`인데 `templates.category`/`templates.post`가 없는 Skin(= 아직 CATEGORY/POST를 만들지 않은 모든 기존 Skin) → `undefined` 반환 → CATEGORY/POST Skin Renderer는 이 경우 **legacy 렌더 경로로 폴백**해야 한다(`skin-home.js`가 published Skin 없을 때 legacy HOME으로 폴백하는 것과 완전히 동일한 패턴, 1-1절).

### 14-2. `metadata.supports`의 역할이 이번에 처음으로 실제로 쓰이게 된다

1-5절에서 확인했듯 `metadata.supports.{home,list,post}`는 지금 어디서도 읽지 않는 순수 정보성 필드였다. CATEGORY/POST 렌더러가 실제로 구현되는 시점에는 이 필드를 **처음으로 실제 분기 조건**(`skin.metadata?.supports?.list === true`일 때만 CATEGORY Skin 경로 시도)으로 쓰기 시작하는 편이 자연스럽다 — 다만 이것도 실제 구현 Slice의 몫이며, 이번 문서는 "이 필드가 그 역할을 맡을 후보"라고만 기록한다(구현 아님).

### 14-3. 새니타이저/스키마 하위 호환

`data-imory-region`을 새니타이저 화이트리스트에 추가하는 것은 **추가일 뿐 기존 허용 목록을 축소하지 않으므로** 기존에 저장된 어떤 Skin HTML도 이 변경으로 인해 다르게 sanitize되지 않는다(순수 additive).

---

## 15. Future Extension

### 15-1. Banner category

현재 배너 카테고리는 완전히 별도의 렌더 흐름(`renderBannerCategory()`, `banners` 테이블)을 갖고 있고(1-2절), Skin Context에도 이미 `banners.items[]`가 top-level로 존재한다(4-2절 이유). v0.1은 "배너 카테고리 자신의 페이지"를 Skin이 담당하는 계약은 만들지 않지만, 나중에 필요해지면 `category.type === "banner"`일 때 `category.banners[]`(가칭, `banners.items`와 같은 shape) 네임스페이스를 추가하는 것으로 확장 가능하다 — 11절의 `category.type` 판별자 원칙을 그대로 재사용.

### 15-2. Gallery

DB/코드 어디에도 아직 존재하지 않는 미래 타입(1-2절). `category.type === "gallery"`가 실제로 추가되는 시점에 `category.images[]`(가칭) 같은 새 네임스페이스로 확장 — `category.posts`와 나란히 두되 서로 영향 없음(11절).

### 15-3. Pagination

`category.posts`가 v0.1에서는 무제한 배열이다(5-5절). 실제로 필요해지면 두 방향이 있다:
- (a) `category.posts`는 첫 페이지만 담고 `category.pagination = { hasMore, nextCursor }` 같은 필드를 추가 — Skin이 "더 보기" 버튼을 그리게 하려면 클릭 이벤트가 필요한데 **지금 바인딩 문법에는 클릭 핸들러 개념이 전혀 없다**(1-4절 5종 전부 선언적 데이터 바인딩) — 이건 pagination 도입 시 반드시 같이 풀어야 할 더 큰 문제(상호작용 바인딩 자체의 부재)라는 점을 미리 기록해 둔다.
- (b) 페이지네이션을 URL 쿼리/경로로 처리하고(`/category/:id?page=2` 등) `category.posts`는 항상 "현재 페이지의 글만" 담게 하여 Skin 계약 자체는 그대로 두는 방법 — 이쪽이 지금 바인딩 문법 한계와 덜 충돌한다.
- v0.1은 어느 쪽도 선택하지 않는다 — 실제 필요가 생겼을 때 다시 판단.

### 15-4. Guestbook / Notice

조사 대상에 포함되지 않았고 현재 코드베이스에서 이런 개념 자체를 발견하지 못했다 — v0.1 범위 밖이며, 이 문서는 이 둘에 대해 추가로 기록할 조사 결과가 없다.

### 15-5. `post.relatedPosts`(참고용, 6-2절에서 이미 보류 결정)

실제 UI(`loadRelatedPosts()`)가 존재하므로 v0.1 이후 가장 먼저 추가될 가능성이 높은 필드다. 추가할 때는 `home.recentPosts`/`category.posts`와 동일한 item shape(`id, title, href, publishedAt`)을 재사용하면 새 패턴을 만들 필요가 없다.

---

## 16. Slice 구현 계획 (로드맵, 이번 라운드는 착수하지 않음)

**중요**: 아래는 "이후 이런 순서로 구현하면 이 문서와 일관된다"는 계획일 뿐, 이번 PHASE 1C 라운드에서 어떤 코드도 만들지 않는다(19절 재확인).

| Slice(가칭) | 내용 |
|---|---|
| 1C-A | ✅ 구현 완료(19절). `buildSkinContext()`를 확장해 `page`/`category`/`post` 네임스페이스를 만들 수 있게 하되, 실제 라우트(posts-view-list.js/posts-view-detail.js)에서는 아직 호출하지 않음(순수 함수 확장 + 유닛 테스트만) |
| 1C-B | `skin-sanitize.js`에 `data-imory-region` 추가, `skin-generator.js`/저장 RPC가 `templates` 필드를 다루도록 확장(14-1절 fallback 로직 포함) |
| 1C-C | CATEGORY Skin Renderer(`skin/skin-category.js` 가칭, `skin-home.js`와 동일한 폴백 원칙) — `posts-view-list.js`의 `openCategoryPage()` 진입부에 "published Skin이 CATEGORY를 지원하면 먼저 시도" 분기 추가(legacy 경로 완전 보존) |
| 1C-D | POST Skin Renderer + 7절 region 실제 연결(Quote Preset 주입 로직) |
| 1C-E | Studio Preview 페이지 탭(15절/17절 스케치대로 iframe 재사용) |
| 1C-F | 이후 PHASE 5(AI 생성/편집)가 이 계약 위에서 진행 |

---

## 17. 테스트 계획 (로드맵, 이번 라운드는 실행하지 않음)

실제 구현 Slice가 진행될 때 최소 아래를 검증해야 한다(지금은 계획만):

1. **Backward compat**: `templates` 필드가 없는 기존 published HOME Skin이 이 계약 도입 이후에도 재저장 없이 동일하게 렌더되는지.
2. **폴백 체인**: `templates.category`가 없는 Skin으로 카테고리 페이지 방문 시 legacy 렌더로 조용히 폴백하는지(`skin-home.js` Case A/B/C/D 패턴, 1-1절과 동일 원칙으로).
3. **optional 필드**: `category.posts === []`, `post.categoryName === null` 등 9절 표의 각 케이스에서 `data-imory-if` 가드 없이 bind했을 때도 에러 없이 빈 값으로 처리되는지.
4. **region 격리**(구현 시): Skin CSS가 post-body region 내부 텍스트 스타일을 얼마나 침범하는지 실측(7-6-1절 미해결 지점의 실제 영향 범위 확인).
5. **category.type 분기**: `"banner"` 카테고리가 실수로도 `category.posts` 계약을 타지 않는지(5-2절).
6. **기존 legacy CATEGORY/POST 페이지 무변경**: 이번 계약 관련 코드가 머지되어도(1C-A/B 단계까지는 실제 라우트에 연결하지 않으므로) 공개 페이지 동작이 전혀 바뀌지 않는지 회귀 확인.

---

## 18. 이번 라운드에서 하지 않은 것 / 하지 않을 것

- CATEGORY Skin Renderer 구현
- POST Skin Renderer 구현
- `data-imory-region` 실제 렌더러/새니타이저 코드 변경
- SkinPackage `templates` 필드 실제 저장 RPC/DB migration
- 기존 공개 `/category/:id`, `/post/:id` 페이지 동작 변경
- Studio HOME/CATEGORY/POST 전환 UI 구현
- OpenAI/Claude API 연동, AI 생성/편집
- Image Library
- Pagination 구현
- Banner/Gallery 카테고리 페이지 구현
- 기존 legacy customize 제거

이번 라운드는 조사 + 이 설계 문서 작성만 수행했다.

---

## 19. Slice 1C-A 구현 결과 (실제 구현 완료, 2026-09-05)

> 16절 로드맵의 1C-A("`buildSkinContext()`를 확장해 `page`/`category`/`post` 네임스페이스를 만들 수 있게 하되, 실제 라우트에서는 아직 호출하지 않음")가 실제로 구현됐다. 이 절은 "설계대로 됐다"의 재확인이 아니라, 구현 과정에서 확정된 **실제 runtime 규칙**을 기록한다 — 18절에서 명시한 범위(CATEGORY/POST Renderer 구현, region, DB migration, AI 연동, 공개 페이지 동작 변경, Studio multi-page toggle)는 이번에도 전부 손대지 않았다.

### 19-1. Context API — `skin/skin-context.js`

3절 구조를 그대로 구현했다. 함수 분리:

- `buildBaseSkinContext(ownerId, options, commonData?)` — `site`/`profile`/`navigation`/`banners`/`images` 공통 namespace만 만든다. `commonData`(내부 헬퍼 `fetchSkinCommonData()`의 결과)를 이미 갖고 있으면 재사용하고, 없으면 직접 조회한다.
- `buildHomeSkinContext(ownerId, options)` — `buildBaseSkinContext()` 결과 위에 `page:{type:"home",...}` + `home.recentPosts`를 얹는다. 기존 `buildSkinContext()`가 반환하던 값과 **key 하나(`page`) 추가를 제외하면 완전히 동일**하다.
- `buildCategorySkinContext(ownerId, categoryId, options)` — `page:{type:"category",...}` + `category:{id,name,type,href,posts:[...]}`. categoryId가 이 ownerId 소유가 아니거나 존재하지 않으면 `null`(throw 아님) — `fetchSkinProfile()` 등 기존 조회 헬퍼가 "없으면 null"을 쓰는 관례를 그대로 따른다. `ownerId`/`categoryId` 자체가 없으면(프로그래머 실수) throw한다.
- `buildPostSkinContext(ownerId, postId, options)` — `page:{type:"post",...}` + `post:{id,title,publishedAt,categoryName,categoryHref}`. 존재하지 않거나 다른 owner의 postId면 `null`. 인자 누락 시 throw.
- `buildSkinContext(ownerId, options)` — **기존 호출부(스킨-home.js, studio-preview.js) 하위 호환용 별칭**, `buildHomeSkinContext()`를 그대로 위임 호출한다. 시그니처/에러 조건 전부 기존과 동일.

새 fetch 헬퍼(`fetchSkinCategoryById`/`fetchSkinCategoryPosts`/`fetchSkinPostById`)는 `posts-view-list.js`/`posts-view-detail.js`가 실제로 select하는 컬럼(`id, title, created_at, visibility[, category_id]`)만 select한다 — `content`/`ooc_content`/`secret_password_hash`는 이 파일 어디서도 select하지 않는다(1-3절 GRANT 마이그레이션과 동일한 최소 컬럼 원칙).

### 19-2. Template 선택 API — `skin/skin-template.js` (신규 파일)

`resolveSkinTemplate(skinPackage, pageType)`과 `skinPackageSupportsPageType(skinPackage, pageType)` 두 순수 함수. 14-1절에서 제안한 함수를 그대로 구현했다:

```js
resolveSkinTemplate(skin, "home")
  // 1) skin.templates?.home 있으면 그것
  // 2) 없으면 { html: skin.html, css: skin.css } 로 폴백

resolveSkinTemplate(skin, "category" | "post")
  // 1) skin.templates?.[pageType] 있으면 그것
  // 2) 없으면 undefined — HOME html로 대체하지 않는다
```

`skinPackageSupportsPageType()`은 `resolveSkinTemplate(...) !== undefined`로만 판단한다 — `skin.metadata.supports`는 읽지 않는다(19-4절).

**이 파일은 이번 Slice에서 어디에도 연결(import)되지 않았다** — `skin-render.js`/`skin-home.js`/`preview-bridge.js`/`studio-preview.js`는 여전히 `skin.html`/`skin.css`를 직접 읽는다. 실제 배선은 CATEGORY/POST Renderer가 생기는 1C-C/1C-D의 몫이다.

### 19-3. Backward compatibility 확인

- `buildSkinContext()`의 시그니처, 에러 조건(`ownerId` 없으면 throw), 반환 shape(`site/profile/navigation/home/banners/images`)이 전부 그대로 유지된다 — 추가된 것은 `page` key 하나뿐.
- `skin-home.js`/`studio-preview.js`의 호출부는 코드 변경 없이 그대로 동작한다(이 함수들은 `buildSkinContext(ownerId, {...})` 형태로만 부르고, 반환값에서 `page`를 읽지 않으므로 추가된 key를 무시한다).
- `resolveSkinTemplate()`은 `templates` 필드가 없는 기존 Skin에 대해 `pageType==="home"`일 때 기존 `html`/`css`를 정확히 그대로 반환한다(테스트 [A]).

### 19-4. 확정된 runtime 규칙 (이번 구현으로 실제로 강제됨)

- **`templates.home ?? html`**: `resolveSkinTemplate()`이 구현하는 유일한 HOME fallback 규칙. category/post는 이 fallback 대상이 아니다(테스트 [F]).
- **category/post는 template 없으면 unsupported**: `templates.category`/`templates.post`가 없으면 `resolveSkinTemplate()`은 `undefined`를 반환한다 — HOME html을 억지로 재사용하지 않는다. 호출자가 이 값을 legacy 렌더 폴백 신호로 써야 한다는 계약은 문서 그대로 유지(아직 그 호출자 자체가 없음, 1C-C/D 몫).
- **`metadata.supports`는 runtime truth source가 아니다**: `skinPackageSupportsPageType()`은 `metadata.supports`를 전혀 읽지 않는다. 테스트로 직접 확인함 — `metadata.supports = {home:true, list:true, post:true}`로 우겨도 `templates`가 없으면 category/post는 여전히 미지원으로 판정된다.
- **`requiredContext`는 여전히 informational**: 이번 Slice도 이 필드를 검증하는 코드를 추가하지 않았다.
- **secret data exclusion**: `category.posts[]`/`post` 어디에도 `content`/`ooc_content`/`secret_password_hash`/원본 `visibility`가 없다 — select 단계에서부터 컬럼을 가져오지 않고, 혹시 row 객체에 그런 필드가 섞여 있어도(테스트 픽스처가 의도적으로 넣어 확인) 매핑 로직이 옮기지 않는다는 것까지 테스트로 확인했다.
- **region/protected post-body**: 이번 Slice는 손대지 않았다. `post.content`는 여전히 Context 어디에도 없다.

### 19-5. 테스트

`skin/skin-page-context-test.html` — 실제 Supabase 대신 이 페이지 안의 mock `supabaseClient`(고정 fixture, in-memory `eq`/`in`/`order`/`limit` 흉내)로 결정론적으로 검증하는 새 테스트 페이지(기존 `skin-context-test.html`은 실 데이터 기반 HOME 전용 테스트로 그대로 둠, 변경 없음). 브라우저에서 열면 A~G + 인자 누락 시 throw + `metadata.supports` 무시까지 총 32개 assertion을 리포트한다.

로컬에서 Node `vm` 모듈로 브라우저 없이 동일 로직을 재현해 실행한 결과: **32 passed, 0 failed** (커버: HOME/CATEGORY/POST의 `page.type` 정확성, 기존 `buildSkinContext()` shape 무변경, secret/private 마스킹, secret 필드 미노출, 없는/타인 소유 category·post → `null`, 필수 인자 누락 → throw, `resolveSkinTemplate()`의 A/B/F 케이스, `metadata.supports` 무시).

### 19-6. 다음 Slice(1C-B) 진행 가능 여부

**가능.** 이번 Slice가 만든 Context shape(`page`/`category`/`post`)와 template 선택 규칙(`resolveSkinTemplate`)이 1C-B(`skin-sanitize.js`에 `data-imory-region` 추가, `skin-generator.js`/저장 RPC가 `templates` 필드를 다루도록 확장)가 그대로 전제할 수 있는 안정된 기반이다. 1C-B부터는 이 문서의 7절(Protected Post-Body Contract)이 다루는 새니타이저/저장 RPC 변경이 필요하므로, DB migration이 필요한 시점도 그 즈음이 될 것으로 보인다(이번 Slice는 여전히 DB migration 없음).

---

## 20. Slice 1C-B 구현 결과 (실제 구현 완료, 2026-09-05)

> 이번 Slice 착수 시점에 16절 로드맵이 적어 둔 1C-B 범위(`data-imory-region`을 새니타이저에 추가 + 저장 RPC가 `templates`를 다루도록 "확장")는 **실제로 착수하지 않았다** — 재검토 결과 `save_skin_draft_version(p_content jsonb, ...)`가 이미 SkinPackage 전체 JSON을 받으므로 `templates` 필드를 위해 RPC 시그니처를 바꿀 필요가 전혀 없었고, `data-imory-region`/protected post-body(7절)는 CATEGORY/POST Renderer가 실제로 붙는 1C-C/1C-D의 몫으로 그대로 미룬다. 이번 Slice가 실제로 한 일은 좁게 정의된 목표 하나뿐이다: **"멀티페이지 SkinPackage(`templates.{home,category,post}`)가 기존 sanitize/validate/Studio edit/Save Draft 파이프라인을 안전하게 통과하도록 기반을 확장"**. DB migration/RPC 시그니처 변경 없음, `data-imory-region` 미구현, CATEGORY/POST route 연결 없음, Studio HOME/CATEGORY/POST toggle 없음 — 전부 18절 원칙 그대로 유지.

### 20-1. Canonical `templates` shape

19-2절에서 이미 구현된 `resolveSkinTemplate()`의 기대 shape을 그대로 확정했다(새 shape을 만들지 않음):

```js
{
  schemaVersion: 1,

  templates: {
    home:     { html, css? },   // 셋 다 optional — 존재하는 것만 채움
    category: { html, css? },
    post:     { html, css? }
  },

  css,          // 공유 top-level 하나 — v0.1은 template별 css를 두지 않는다(12-B절 결정 그대로)
  imageSlots,
  regions,
  metadata,

  html?         // legacy Skin 하위 호환용, templates가 없을 때만 HOME에서 읽힘
}
```

`templates.*.css`는 이번 Slice에서 아무 코드도 쓰지 않는다(read/write 둘 다) — `resolveSkinTemplate()`이 이미 그 필드가 있으면 우선 사용하도록 짜여 있지만(19-2절), 저장 경로 어디서도 이 필드를 채우지 않으므로 실질적으로 항상 공유 `css`로 폴백한다.

### 20-2. 변경/생성 파일

- **신규** `skin/skin-package-normalize.js` — `normalizeSkinPackageForDraft(skinPackage)`(비동기). "저장 시점" SkinPackage 정규화를 한 곳에 모은 유일한 공용 helper: legacy `html`(있으면) sanitize, `templates.home/category/post`(존재하는 것만) 각각 sanitize, 공유 `css` 하나만 validate. 실패(CSS가 구조적으로 깨짐)하면 throw — 호출자는 이 경우 아무것도 반영하지 않는다.
- **수정** `skin/skin-initializer.js` — 인라인 sanitize/validate 로직을 걷어내고 `normalizeSkinPackageForDraft()` 호출로 대체(중복 제거). `skin-css-validate.js` import는 side-effect import(`import "./skin-css-validate.js"`)로 형태만 바뀌었다 — studio 부모 문서에서 `window.validateAndScopeSkinCss`를 등록하는 유일한 정적 import 지점이라는 역할은 그대로 유지.
- **수정** `skin/skin-home.js` — 공개 HOME이 `skinPackage.html`을 직접 읽던 것을 `resolveSkinTemplate(skinPackage, "home")` 결과로 교체(10절 "additive라면 연결 가능" 판단 반영). `undefined`면 legacy HOME으로 폴백(다른 실패 케이스와 동일한 결).
- **수정** `studio/studio-preview.js` — `buildStudioHomePreviewSkin()` 헬퍼 추가(내부적으로 `resolveSkinTemplate(skin, "home")` 위임). Code 버튼/Apply/Preview postMessage 세 지점이 전부 이 헬퍼를 거치도록 교체. `applyWorkingSkinChanges()`는 `templates.home`이 있으면 그 안의 `html`만 교체(+ 공유 `css`), 없으면 기존처럼 top-level `html`/`css`를 교체 — 어느 쪽이든 `templates.category`/`post`/`imageSlots`/`regions`/`metadata`는 스프레드로 그대로 보존된다. `handleStudioSaveClick()`은 RPC 호출 직전에 `normalizeSkinPackageForDraft()`를 한 번 더 거친다(20-3절).
- **수정** `index.html`, `studio/index.html`, `studio/studio-lifecycle-scenario.html` — `skin/skin-template.js`(classic) 로드 추가. `studio/index.html`/`studio-lifecycle-scenario.html`은 `skin/skin-package-normalize.js` 로드도 추가.
- **신규 테스트** `skin/skin-package-normalize-test.html`, `studio/studio-multipage-test.html` — 20-5절.

### 20-3. Sanitize/validate 흐름 — "저장 시점" 신뢰 경계를 어디에 둘지

기존 파일들의 문서화된 원칙(`skin-sanitize.js`/`skin-css-validate.js` 파일 상단: "이 파일은 저장 시점에만 호출된다")을 그대로 따라, `normalizeSkinPackageForDraft()`는 **Apply가 아니라 Save 직전**에서만 호출한다:

- **Apply**(Code Editor onApply): 이미 `code-editor.js`가 사용자가 방금 편집한 raw html/css에 대해 자체적으로 sanitize/validate를 수행한 뒤에만 호출자 콜백을 부른다(기존 동작, 변경 없음) — Apply는 여전히 "즉시 Preview 반영"만 책임진다.
- **Save**(`handleStudioSaveClick`): RPC 호출 직전에 `currentWorkingSkin` 전체를 `normalizeSkinPackageForDraft()`에 통과시킨다. `currentWorkingSkin`은 보통 이미 Apply 단계에서 sanitize된 상태라 이 호출은 대부분 아무것도 바꾸지 않는(idempotent) no-op에 가깝지만, **Code Editor가 전혀 건드리지 않은 `templates.category`/`templates.post`까지 포함해 SkinPackage 전체를 다시 한번 sanitize하는 유일한 지점**이라는 점이 중요하다 — "sanitize되지 않은 template HTML이 Save Draft에 들어갈 수 있는 우회 경로를 만들지 않는다"는 요구를 이 함수 하나가 구조적으로 강제한다. 정규화가 실패하면(CSS가 구조적으로 깨짐) RPC 자체를 호출하지 않고 `currentWorkingSkin`/dirty 상태 무엇도 바꾸지 않는다.

### 20-4. Legacy `html` 하위 호환

`resolveSkinTemplate()`(1C-A에서 이미 구현) 우선순위를 그대로 재사용해서 배선했다 — 새 fallback 로직을 추가하지 않았다:

- Studio Code 버튼/Apply/Preview: `buildStudioHomePreviewSkin()`이 `templates.home`이 있으면 그것을, 없으면 top-level `html`/`css`를 편집/렌더 대상으로 삼는다.
- 공개 HOME(`skin-home.js`): 동일한 우선순위로 `renderSkin()`에 넘길 대상을 고른다.
- `templates` 필드가 아예 없는 기존 Skin은 이번 Slice의 어떤 코드 경로에서도 다시 저장하거나 shape을 바꾸도록 강제되지 않는다(회귀 테스트 20-5절 확인).

### 20-5. 테스트

**A. `skin/skin-package-normalize-test.html`**(신규, mock 없이 실제 `sanitizeSkinHTML`/`validateAndScopeSkinCss`/`resolveSkinTemplate` 사용) — legacy html-only 정규화, multi-page 세 template 각각 sanitize(스크립트/onclick/onerror 제거 + 안전 바인딩 보존), 공유 css 보존, 구조적으로 깨진 CSS는 throw, 이미 정규화된 결과를 다시 정규화해도 변하지 않는(멱등) 성질, `resolveSkinTemplate()`의 legacy-fallback/`templates.home`-우선/category·post-unsupported 세 케이스. **Playwright(Chromium)로 실행: 12개 중 12개 PASS.**

**B. `studio/studio-multipage-test.html`**(신규) + `studio/studio-lifecycle-scenario.html`에 추가한 `scenario=m` fixture(legacy `html` 없이 `templates.home/category/post`만 가진 SkinPackage, `category`/`post`에는 저장 전 제거되어야 할 `<script>`/`onclick`/`onerror`를 의도적으로 섞어 둠) — studio-preview.js/code-editor.js/skin-template.js/skin-package-normalize.js를 **실제 파일 그대로** 구동하는 통합 테스트. 확인 항목: Preview가 `templates.home`을 렌더하는지, Code Editor가 top-level `html`이 아니라 `templates.home.html`을 열어 보여주는지, Apply가 `templates.home.html`만 교체하고 공유 `css`만 갱신하는지, Save 시점에 Code Editor가 건드리지 않은 `templates.category`/`templates.post`까지 sanitize되어 위험한 마크업이 제거되면서도 안전한 바인딩/구조는 보존되는지, `save_skin_draft_version` RPC가 정확히 1회만 호출되고 `p_content`에 `templates` 전체가 그대로 실리는지(RPC 시그니처 변경 없음), HOME 편집 결과가 죽은 top-level `html` 필드로 새지 않는지. **Playwright(Chromium)로 실행: 16개 중 16개 PASS.**

**C. 회귀 — 기존 `studio/studio-lifecycle-test.html`**(scenario a/b, legacy html-only Skin) — 이번 Slice의 변경(특히 `handleStudioSaveClick`이 매 Save마다 `normalizeSkinPackageForDraft()`를 새로 거치게 된 것, `skin-initializer.js`의 로직 교체)이 기존 html-only Skin의 Draft 로드/Preview/Desktop-Mobile 전환/Questionnaire→생성 흐름에 회귀를 만들지 않는지 확인. **Playwright(Chromium)로 실행: 15개 중 15개 PASS**(수정 없이 그대로 통과 — 코드 변경 없이 기존 파일을 재사용).

### 20-6. DB/RPC 변경 여부

**변경 없음.** `save_skin_draft_version`/`create_skin_with_initial_version` 둘 다 시그니처/호출 방식 그대로다 — `p_content`가 이미 SkinPackage 전체를 받으므로 `templates` 필드는 그 JSON 안에 자연스럽게 실릴 뿐이다. `data-imory-region`도 이번 Slice에서 손대지 않아(18절 유지) 새니타이저 새 마이그레이션이 필요 없다.

### 20-7. 다음 Slice(1C-C, CATEGORY route 연결) 진행 가능 여부

**가능.** `templates.category`가 실제로 저장/보존/정규화되는 경로가 이번 Slice로 안정화되었고, `resolveSkinTemplate(skin, "category")`가 없으면 `undefined`를 돌려주는 계약(1C-A)도 그대로 유효하다 — 1C-C는 `skin/skin-category.js`(가칭)를 새로 만들어 `posts-view-list.js`의 `openCategoryPage()` 진입부에 "published Skin이 `templates.category`를 지원하면 먼저 시도, 없으면 legacy 렌더로 폴백" 분기를 추가하면 된다(legacy 경로 완전 보존, `skin-home.js`와 동일한 원칙). `data-imory-region`/protected post-body(7절)는 여전히 1C-D의 몫으로 남아 있다.

---

## 21. Slice 1C-C 구현 결과 (실제 구현 완료, 2026-09-05)

> 16절 로드맵의 1C-C("CATEGORY Skin Renderer — `openCategoryPage()` 진입부에 'published Skin이 CATEGORY를 지원하면 먼저 시도' 분기 추가, legacy 경로 완전 보존")가 실제로 구현됐다. 대상은 **post형 category만**이다 — banner category는 이번 Slice에서도 legacy `renderBannerCategory()` 경로 그대로다(11/13-1절 그대로 유지). Studio CATEGORY Preview, POST Viewer 연결, `data-imory-region`/protected post-body, pagination/gallery, DB migration/RPC 변경 — 전부 이번 Slice도 손대지 않았다(18절 원칙 그대로).

### 21-1. 변경/생성 파일

- **신규** `skin/skin-category.js` — `renderPublishedSkinCategory({ ownerId, categoryId, container }) -> Promise<boolean>`. `skin/skin-home.js`와 완전히 동일한 구조(RPC → schemaVersion 확인 → `resolveSkinTemplate(skin,"category")` → `buildCategorySkinContext()` → `renderSkin()`)이며, 추가로 `context.category.type !== "post"`면 `false`를 반환하는 분기 하나만 더 있다. `skin-home.js`와 동일하게 어떤 경우에도 throw하지 않는다.
- **수정** `index.html` — `window.skinHomeReady`와 같은 블록에 `window.skinCategoryReady` Promise 핸드셰이크를 추가로 선언하고, `<script type="module" src="./skin/skin-category.js">`를 `document.write`로 추가 로드한다. `skin-sanitize.js`/`skin-image-slots.js`/`skin-context.js`/`skin-template.js`는 이미 HOME 경로가 로드해 두므로 재로드하지 않는다.
- **수정** `posts/view/posts-view-list.js` — `tryRenderPublishedSkinCategory(categoryId, container)` 헬퍼(신규 함수)를 추가하고, `openCategoryPage()` 안에서 `currentPostCategoryType === "post"`로 확정된 뒤, `renderPostListItems()` 호출 직전에 이 헬퍼를 호출하도록 배선했다. 그 외 `openCategoryPage()`의 기존 로직(캐시, banner 분기, history pushState, 편집모드/배너 UI 리셋, `postsError` 처리)은 한 줄도 바뀌지 않았다.

### 21-2. 실제 CATEGORY route 연결 위치

`posts/editor/posts-router-init.js`의 `/^\/category\/(\d+)\/?$/` 매칭 → `openCategoryPage(id)` 호출 자체는 그대로다(라우트 패턴 변경 없음, 11절 요구사항 그대로). 새 분기는 `posts-view-list.js`의 `openCategoryPage()` 함수 **본문 안쪽**, 다음 지점 하나뿐이다:

```
category/posts 캐시 저장 직후
  → tryRenderPublishedSkinCategory(numericCategoryId, postList) 호출
  → true면 return (renderPostListItems() 도달 안 함)
  → false면 그대로 renderPostListItems() 진행(기존 코드 100% 동일)
```

이 지점은 이미 `currentPostCategoryType === "banner"` 분기가 위에서 먼저 `return`한 뒤이므로, 이 아래 도달하는 시점엔 category.type이 사실상 `"post"`로 확정돼 있다(banner는 이 코드에 아예 도달하지 않는다) — 그럼에도 `renderPublishedSkinCategory()` 내부에서 `context.category.type !== "post"` 재확인을 한 번 더 두어(21-1절), 호출 순서가 나중에 바뀌어도 banner가 실수로 Skin 경로를 타는 일이 없도록 이중으로 방어했다.

### 21-3. Skin/legacy 분기 흐름

`tryRenderPublishedSkinCategory()`가 순서대로 판단한다(true를 반환해야만 Skin이 적용됨):

1. `getSiteOwner()` — `owner.scoped && owner.ownerId`가 아니면(무필터 배포, not_found, error) 즉시 `false`.
2. **owner 본인 관리 화면 보호(신규 판단, 21-6절)**: `getSignedInUser()`로 현재 로그인 사용자를 확인해 `user.id === owner.ownerId`면 즉시 `false` — 로그인한 사이트 소유자가 자기 카테고리를 열람/관리할 때는 Skin을 시도하지 않고 legacy 관리 화면(글쓰기 버튼, 편집모드 토글, bulk 삭제)을 그대로 유지한다.
3. `window.skinCategoryReady` 핸드셰이크로 `renderPublishedSkinCategory` 함수 참조 획득.
4. `renderPublishedSkinCategory({ ownerId, categoryId, container })` 내부: `get_published_skin` RPC → published Skin 없음/RPC 에러/알 수 없는 schemaVersion이면 `false` → `resolveSkinTemplate(skin,"category")`가 `undefined`(=`templates.category` 없음)면 `false` → `buildCategorySkinContext()`가 `null`(category 없음/타인 소유)이면 `false` → `context.category.type !== "post"`면 `false` → `renderSkin()`이 throw하면 `false` → 전부 통과하면 `true`.

각 단계 실패는 전부 `console.error`(예상 밖 오류) 또는 `console.warn`(예상된 미지원, 예: schemaVersion 불일치)으로 로그를 남기고 조용히 `false`로 수렴한다 — `skin-home.js`와 동일한 에러 정책(14절 요구사항).

### 21-4. DOM ownership

`renderPublishedSkinCategory()`에 넘기는 `container`는 기존 `#postList` 그 자체다(별도 mount point를 새로 만들지 않음). `renderSkin()`의 `mount()`가 항상 `container.innerHTML = ""`부터 다시 그리므로(`skin-render.js:333`), 직전에 남아있던 "loading..." 마크업이나 이전 카테고리의 잔여 DOM도 안전하게 대체된다. Skin이 성공하면(`true` 반환) `openCategoryPage()`는 **즉시 `return`**하므로 `renderPostListItems()`가 이후 같은 `#postList`를 다시 덮어쓰는 일이 없다 — 반대로 실패/미지원(`false`)이면 `renderPostListItems()`가 지금과 완전히 동일하게 실행된다. `postListEditToggleButton`/`postListSelectBar`/`bannerGrid`/`bannerEditor`(edit-mode UI)는 `postList` 바깥의 별도 엘리먼트라 이번 변경의 영향을 받지 않는다 — 다만 21-6절 이유로 애초에 owner 본인 세션에서는 Skin 분기 자체가 시도되지 않는다.

### 21-5. template/context 사용 방식

`buildCategorySkinContext(ownerId, categoryId, { imageSlotNames, imageSlotValues })`를 그대로 호출한다(`skin-home.js`가 `buildSkinContext()`에 넘기는 것과 동일하게 `extractImageSlotNames(skinPackage)` + RPC의 `imageSlotValues`를 전달) — category 렌더러 자신은 `categories`/`posts` 테이블을 직접 조회하지 않는다. `resolveSkinTemplate(skin, "category")`도 그대로 사용하며, `metadata.supports`는 어디서도 읽지 않는다(사용자 요청 7절 원칙 그대로).

### 21-6. banner fallback + owner-view 보호(조사로 새로 발견한 사실)

- **banner**: 5-2/13-1절 그대로, `category.posts` 계약을 아예 타지 않고 legacy `renderBannerCategory()`로 폴백(21-2절에서 이미 이중 방어 확인).
- **owner-view 보호(이번 구현 중 새로 확인한 사실)**: 코드베이스 조사 결과 `posts-view-list.js`/`posts-router-init.js`는 사이트 소유자가 로그인해서 자기 사이트를 관리할 때와 익명 방문자가 같은 사이트를 읽을 때 **동일한 SPA/동일한 `openCategoryPage()`**를 탄다 — `updatePostAddButton()`(`posts/view/posts-view-transition.js`)이 "로그인 여부"만으로 글쓰기/편집모드 버튼을 켜고, `#postList`의 `.post-list-item` 마크업 자체는 owner/방문자 구분 없이 동일하다. 이 사실을 반영하지 않고 Skin을 무조건 적용했다면, 카테고리 템플릿을 가진 Skin을 publish한 소유자가 정작 **자기 글을 관리(추가/편집모드 bulk 삭제)하려고 자기 카테고리를 열 때마다 관리 UI 없는 장식용 화면**을 보게 되는 회귀가 생겼을 것이다. 그래서 `tryRenderPublishedSkinCategory()`가 `getSignedInUser().id === owner.ownerId`를 확인해 소유자 본인 세션에서는 Skin을 아예 시도하지 않도록 가드를 추가했다(21-3절 2번). 다른 로그인 사용자(이 사이트의 소유자가 아닌 계정)나 익명 방문자는 정상적으로 Skin이 적용된다.

### 21-7. empty/secret 처리

- **secret/visibility**: `buildCategorySkinContext()`를 그대로 재사용하므로 5-3/19-4절에서 이미 검증된 마스킹 정책(🔒/🙈 아이콘, `visibility` 원본 미노출, `content`/`ooc_content`/`secret_password_hash` select 자체가 없음)이 그대로 적용된다 — CATEGORY Skin Renderer는 이 정책을 다시 구현하지 않는다.
- **empty category**: `category.posts === []`일 때 `data-imory-repeat="category.posts"`는 아무것도 렌더하지 않고(기존 엔진 동작, 1-4절), Skin renderer 자신은 별도의 "글 없음" fallback DOM을 강제로 삽입하지 않는다(요청 12절 그대로).
- **binding 엔진의 기존 제약 재확인(신규 구현 아님, 보고만)**: `isSkinTruthy([])`가 `false`이므로(`skin-render.js:67-75`) `data-imory-if="category.posts"`로 감싼 블록은 빈 배열일 때 숨겨진다 — "글이 없습니다" 안내를 이 조건의 **반대**로 표시하려면 비교/부정 연산이 필요한데 엔진에 그런 연산자가 없다(9-1/1-4절에 이미 기록된 기존 제약, 이번 Slice가 새로 발견한 문제는 아니다). 이번 Slice는 이 문법을 확장하지 않았다 — Skin 저작자가 오늘 쓸 수 있는 유일한 패턴은 9-1절에 이미 적힌 대로 `data-imory-repeat`만으로 목록을 그리고, 별도 "안내 문구"는 v0.1에서 표현 불가능하다는 점을 그대로 계승한다.

### 21-8. 테스트

`node --check`로 `skin/skin-category.js`, `posts/view/posts-view-list.js` 구문 검증 통과. **실제 Supabase 프로젝트/브라우저를 이 세션에서 띄워 클릭 테스트를 수행하지는 못했다** — 아래 A~M은 코드 경로를 직접 추적해 확인한 것이지 실행 결과가 아니다. 다음 Slice(1C-D) 착수 전에 최소 A/C/H/K/L은 실제 브라우저에서 한 번 더 확인하는 것을 권장한다.

| # | 시나리오 | 확인 방법 | 결과 |
|---|---|---|---|
| A | published Skin 없음 | `get_published_skin` → `rpcData.skin` falsy → `false` 반환 지점 확인 | 코드상 확인 |
| B | published Skin + `templates.category` 없음 | `resolveSkinTemplate` → `undefined` → `false` | 코드상 확인 |
| C | published Skin + `templates.category` 있음 + post category | 전체 체인 통과 → `renderSkin()` 호출 | 코드상 확인 |
| D | `category.name` bind | `buildCategorySkinContext`가 `category.name` 그대로 전달, 기존 `data-imory-bind` 동작 재사용 | 코드상 확인(신규 로직 없음) |
| E | `category.posts` repeat(title/href/publishedAt) | `buildCategorySkinContext`의 기존 posts 매핑 재사용, 신규 필드 추가 없음 | 코드상 확인 |
| F | secret/visibility masking | `maskSkinPostTitle()` 그대로 재사용(21-7절) | 코드상 확인 |
| G | empty category | `[]` → repeat 무출력(21-7절), 강제 fallback DOM 없음 | 코드상 확인 |
| H | banner category | `currentPostCategoryType === "banner"` 분기가 `tryRenderPublishedSkinCategory` 호출 지점보다 먼저 `return`(21-2절 이중 방어) | 코드상 확인 |
| I | category context null(없음/타인 소유) | `buildCategorySkinContext` → `null` → `false` | 코드상 확인 |
| J | invalid/malicious stored template | `renderSkin()` 내부 `sanitizeSkinHTML`/`validateAndScopeSkinCss`가 매 mount마다 재검증(기존 신뢰 경계, 새 코드가 우회하지 않음) | 코드상 확인 |
| K | 기존 HOME published Skin | `skin-home.js`/`index.html`의 HOME 블록 미변경(같은 블록에 CATEGORY 핸드셰이크만 추가) | 코드 diff 확인 |
| L | POST route | `posts-view-detail.js`/POST 라우트 미변경(이번 Slice는 `posts-view-list.js`만 수정) | 코드 diff 확인 |
| M | 기존 category click/navigation | 라우트 패턴/`openCategoryPage(id)` 호출 시그니처 변경 없음 | 코드 diff 확인 |

### 21-9. 공개 HOME/POST 회귀 여부

**없음(코드 diff 기준).** `skin/skin-home.js`, `posts/view/posts-view-detail.js`, `posts/editor/posts-router-init.js`는 이번 Slice에서 전혀 수정하지 않았다. `index.html`의 변경은 HOME 블록 안에 CATEGORY용 Promise 선언 + 모듈 스크립트 태그를 "추가"한 것뿐이고, 기존 `window.skinHomeReady`/`tryRenderPublishedSkinHome`/`initHomeRenderer()` 코드는 한 글자도 바뀌지 않았다.

### 21-10. 다음 Slice(1C-D, Studio CATEGORY Preview / POST Skin Renderer) 진행 가능 여부

**부분적으로 가능.** `templates.category`가 실제 공개 라우트에서 legacy를 깨지 않고 안정적으로 시도되는 경로는 이번 Slice로 마련됐다. 다만 21-8절에 적었듯 **이 세션은 실제 브라우저/DB로 검증하지 못했다** — 1C-D(또는 Studio CATEGORY Preview) 착수 전에 실제 published Skin + post형 category 조합으로 A/C/H 최소 3개 시나리오를 한 번은 육안으로 확인하는 것을 권장한다. Studio CATEGORY Preview 자체(17절 스케치)는 이번 Slice가 손대지 않았으므로 여전히 HOME만 미리보기 가능한 상태다. POST Skin Renderer + `data-imory-region` 실제 연결(7절)은 여전히 미착수.

---

## 22. Slice 1C-D 구현 결과 (실제 구현 완료, 2026-09-05)

> 16절 로드맵이 1C-D로 적어 둔 범위 중 "Studio 안에서 HOME뿐 아니라 CATEGORY Preview도 볼 수 있게 한다" 부분만 이번 Slice가 다룬다 — **POST Skin Renderer + `data-imory-region` 실제 연결은 이번에도 착수하지 않았다**(여전히 다음 Slice 몫). POST Preview/protected region, banner category Skin preview, gallery, pagination, AI/OpenAI, DB migration, RPC 변경, public CATEGORY/HOME route 변경, 기존 owner management guard 변경, Code Editor의 페이지별 tab 확장, `templates.category` 편집 UI — 전부 18절 원칙 그대로 손대지 않았다.

### 22-1. 변경 파일

- **수정** `studio/index.html` — `#studioViewportToggle` 바로 위에 `HOME | CATEGORY` ghost text toggle(`#studioPageToggle`, 버튼 `data-page-type="home"|"category"`)을 추가했다. `#studioPageToggleCategory`는 HTML 단계에서 기본 `disabled` — 실제 활성화 여부는 mount 이후 `studio-preview.js`가 판단한다(22-3절). 새 iframe을 추가하지 않았다 — 기존 `#studioPreviewFrame` 하나를 그대로 재사용한다.
- **수정** `studio/studio.css` — `.studio-viewport-toggle`과 동일한 ghost text 스타일을 `.studio-page-toggle`로 복제하고, 두 토글을 세로로 쌓았다(`.studio-page-toggle` `top:54px`, `.studio-viewport-toggle`을 기존 `54px`에서 `78px`로 내림). `:disabled` 상태에 `opacity:0.4`만 추가했다 — 별도 큰 안내 UI 없이 버튼 자체의 흐린 표시만으로 "미리볼 글 카테고리가 없음"을 나타낸다(3절 권장안 그대로).

> **이후 업데이트(Studio chrome 재정리 라운드)**: 위 두 절이 설명하는 "Top Dock과 별개로 항상 노출되는 두 줄짜리 절대배치 toggle" 배치는 더 이상 유효하지 않다. `#studioPageToggle`/`#studioViewportToggle`은 이제 `#studioTopDock` 안 `.studio-top-dock-groups`로 옮겨져 Back/Save/Code/Settings와 한 줄에 놓이고, Top Dock 자체가 hover/focus가 아니라 `#studioTopDockHandle` 클릭으로만 열고 닫힌다(`AI_SKIN_PHASE1B_DESIGN.md` 11-3/11-4절 참고). `data-page-type`/`data-viewport-mode` 마크업과 `studio-preview.js`의 판별 로직(활성화 조건, unsupported 처리 등)은 이 라운드에서 전혀 바뀌지 않았다 — 위치만 이동했다.
- **수정** `studio/studio-preview.js` — 이번 Slice의 실제 로직 전부(22-2~22-6절).

### 22-2. Page Preview state 구조

`studioViewportMode`(Desktop/Mobile)와 완전히 분리된 새 module-level state를 추가했다:

```js
let currentPreviewPageType = "home";       // "home" | "category"
let currentPreviewCategoryId = null;       // 첫 post형 category id, 없으면 null
let currentCategoryContext = null;         // categoryId 하나에 대한 캐시
let categoryContextToken = 0;              // stale fetch 가드(mountToken과 동일 패턴)
let currentOwnerId = null;
let currentImageSlotNames = [];
let currentImageSlotValues = {};
```

`currentOwnerId`/`currentImageSlotNames`/`currentImageSlotValues`는 `mountStudioPreview()`가 HOME context를 만들 때 이미 조회해 둔 값을 그대로 저장해 뒀다가, CATEGORY context를 만들 때 재사용한다 — Studio가 category 데이터를 새로 조립하지 않고 `buildCategorySkinContext()`에 그대로 넘기기 위해서다(14절). `resetStudioWorkingState()`가 이 state 전부를 초기화하므로, Questionnaire 제출 후 재진입(`initStudio()` 재호출) 같은 기존 재마운트 경로도 그대로 안전하다.

### 22-3. CATEGORY 기본 선택 방식

`findFirstPostCategoryId(context)`가 HOME context의 `context.navigation.categories`(이미 `sort_order` 기준으로 정렬돼 내려온다, `skin-context.js`의 `fetchSkinCategories()` 참고)에서 `type === "post"`인 첫 항목의 `id`를 돌려준다. 별도로 `categories` 테이블을 다시 조회하지 않는다 — HOME context가 이미 가진 `navigation.categories`를 그대로 재사용한다(13절 "Studio가 category 데이터를 새로 조립하지 않는다"와 같은 원칙). `mountStudioPreview()`가 HOME context를 만든 직후 이 값을 `currentPreviewCategoryId`에 저장하고, `updateStudioPageToggleAvailability()`가 그 값의 유무로 CATEGORY 버튼의 `disabled`를 결정한다 — 하드코딩된 "첫 카테고리"가 아니라 state 하나(`currentPreviewCategoryId`)로 두었으므로, 나중에 category picker가 붙어도 이 값만 다시 대입하면 된다(13절 확장 여지).

### 22-4. context/template 전환 방식

`setPreviewPageType(pageType)`가 유일한 진입점이다:

- 같은 타입으로 다시 호출되면 즉시 no-op.
- `currentPreviewPageType` 갱신 → 토글 active class 갱신 → `updateStudioCodeButtonState()`(22-6절) → `renderHomePreview()` 또는 `renderCategoryPreview()`.

`renderHomePreview()`는 overlay를 곧장 숨기고 `buildStudioHomePreviewSkin(currentWorkingSkin)` + `currentSkinContext`를 기존 `postRenderToFrame()` 경로(`preview:render` postMessage)로 다시 보낸다 — HOME context는 mount 시점에 이미 메모리에 있으므로 네트워크 왕복이 없다.

`renderCategoryPreview()`는 `resolveSkinTemplate(currentWorkingSkin, "category")`를 호출해 template이 없으면 즉시 unsupported(22-5절)로 빠지고, 있으면 `currentPreviewCategoryId`가 `null`인지(empty, 22-5절) 확인한 뒤, `currentCategoryContext`가 이미 캐시돼 있으면 fetch 없이 바로 `postRenderToFrame()`, 없으면 `loadCategoryContextAndRender()`가 `buildCategorySkinContext(currentOwnerId, currentPreviewCategoryId, { imageSlotNames, imageSlotValues })`를 호출해 채운 뒤 캐시하고 렌더한다. **HOME/CATEGORY 어느 쪽도 새 iframe을 만들지 않는다** — 항상 같은 `#studioPreviewFrame`에 같은 `preview:render`/`preview:ready`/`preview:rendered`/`preview:error` 계약(`studio-preview.js` 파일 상단 주석, `preview-bridge.js`)을 그대로 재사용한다. `preview-bridge.js`는 이번 Slice에서 한 글자도 바뀌지 않았다 — `renderInstance.update(skin, context)`가 이미 skin/context가 바뀌는 모든 경우(Code Apply 포함)를 처리하고 있어서, "페이지가 바뀌었다"는 사실을 iframe 쪽이 구분할 필요가 없었다.

### 22-5. unsupported / empty / error / loading 처리

`setStudioPreviewOverlay(mode, text)`는 기존에도 `mode === "error"`일 때만 스타일을 다르게 주는 구조였다(`"loading"` 등 다른 문자열은 전부 중립 스타일) — 그래서 `"unsupported"`/`"empty"` 두 mode를 새 CSS 없이 그대로 추가할 수 있었다:

| 상태 | 조건 | overlay mode | 텍스트 |
|---|---|---|---|
| loading | category context 최초 fetch 중 | `"loading"` | "카테고리 미리보기를 불러오는 중..." |
| unsupported | `resolveSkinTemplate(skin,"category")`가 undefined | `"unsupported"` | "이 스킨에는 아직 CATEGORY 템플릿이 없습니다." |
| empty | `currentPreviewCategoryId === null`(post형 category 없음) | `"empty"` | "미리볼 글 카테고리가 없습니다." |
| error | `buildCategorySkinContext()` throw, 또는 결과가 `null`(소유자 불일치 등 방어적 케이스는 empty로 처리) | `"error"` | "카테고리 미리보기를 불러오지 못했습니다." |

unsupported/empty 상태에서는 **iframe에 아무 것도 다시 그리지 않는다** — 마지막으로 렌더된 내용(보통 HOME) 위에 반투명 overlay(`color-mix(in srgb, var(--system-bg) 88%, transparent)`, 기존 loading overlay와 동일 배경)만 얹는다. HOME으로 돌아가면 `renderHomePreview()`가 overlay를 곧장 숨기고 다시 렌더하므로 즉시 정상 화면으로 돌아온다 — legacy CATEGORY 화면이나 HOME html을 대신 띄우는 경로는 어디에도 없다(7절 요구사항).

### 22-6. Code Editor 처리

`updateStudioCodeButtonState()`가 `studioCodeButton.disabled = !currentWorkingSkin || currentPreviewPageType === "category"`로 통합했다 — 기존에 `resetStudioWorkingState()`/`mountStudioPreview()`가 각자 `studioCodeButton.disabled = true/false`를 직접 대입하던 두 지점을 이 함수 호출로 교체했다. CATEGORY Preview 중에는 버튼이 disabled라 클릭 자체가 안 되고, `title` 속성에 "현재 Code Editor는 HOME만 편집합니다"를 채워 hover 시 이유를 알 수 있게 했다 — 별도 모달/토스트 안내는 만들지 않았다(16절 "추천" 수준의 최소 처리).

### 22-7. Save/Apply와의 관계 — 회귀 여부

- **Apply(`applyWorkingSkinChanges`)**: 코드를 전혀 바꾸지 않았다. Code Editor가 CATEGORY Preview 중엔 애초에 열리지 않으므로(22-6절) 이 함수가 CATEGORY 상태에서 호출될 경로 자체가 없다 — "Apply가 실수로 CATEGORY 렌더 로직을 건드리는" 시나리오가 코드 구조상 발생하지 않는다.
- **Save(`handleStudioSaveClick`)**: 한 글자도 바꾸지 않았다. `currentWorkingSkin` 전체(schemaVersion/html/css/templates/imageSlots/regions/metadata)를 그대로 저장하는 기존 경로 그대로이고, page type을 참조하지 않는다(17절 요구사항).
- **mount(`mountStudioPreview`)**: HOME context 로드 직후 `currentOwnerId`/`currentImageSlotNames`/`currentImageSlotValues`/`currentPreviewCategoryId`/`currentPreviewPageType`/`currentCategoryContext`를 초기화하는 코드만 추가했다 — draft 로드, image slot 조회, `buildSkinContext()` 호출 등 기존 로직은 순서/내용 변경 없음.

### 22-8. 테스트

`node --check studio/studio-preview.js`, `node --check studio/studio-state.js` 구문 검증 통과. **이 세션은 실제 Supabase 프로젝트/브라우저를 띄워 클릭 테스트를 수행하지 못했다** — 21-8절과 동일한 한계다. 아래는 코드 경로를 직접 추적해 확인한 것이지 실행 결과가 아니다.

| # | 시나리오 | 확인 방법 | 결과 |
|---|---|---|---|
| A | Studio 최초 진입 → HOME Preview | `mountStudioPreview()`가 기존과 동일하게 `postRenderToFrame(home)`으로 끝남(22-7절, 변경 없음) | 코드상 확인 |
| B | HOME → CATEGORY + templates.category 존재 | `renderCategoryPreview()` → template 있음 → `loadCategoryContextAndRender()` → `buildCategorySkinContext()` → `postRenderToFrame()` | 코드상 확인 |
| C | category.name binding | `buildCategorySkinContext()` 재사용, 신규 매핑 없음(1C-C에서 이미 검증) | 코드상 확인(신규 로직 없음) |
| D | category.posts repeat | 위와 동일 | 코드상 확인 |
| E | CATEGORY → HOME 복귀 | `renderHomePreview()`가 캐시된 `currentSkinContext`로 즉시 재렌더 | 코드상 확인 |
| F | templates.category 없음 → unsupported | `resolveSkinTemplate` undefined → overlay `"unsupported"`, render 호출 없음 | 코드상 확인 |
| G | post형 category 없음 → empty | `currentPreviewCategoryId === null` → overlay `"empty"`, 버튼도 disabled(이중 방어) | 코드상 확인 |
| H | CATEGORY + MOBILE 유지 | viewport state(`studioViewportMode`)는 이번 Slice가 전혀 건드리지 않은 별도 변수 — page 전환 함수 어디서도 참조하지 않음 | 코드상 확인 |
| I | CATEGORY+MOBILE → HOME, Mobile 유지 | 위와 동일 이유 | 코드상 확인 |
| J | HOME+Desktop → CATEGORY, Desktop 유지 | 위와 동일 이유 | 코드상 확인 |
| K | 전환마다 iframe load count 불변 | `#studioPreviewFrame`은 `mountStudioPreview()` 최초 1회만 만들어지고, page 전환 함수 어디도 `src`/DOM 재생성을 하지 않음(기존 `postRenderToFrame()` 재사용) | 코드 diff 확인 |
| L | preview:ready lifecycle 회귀 없음 | `preview-bridge.js`/`PREVIEW_MSG_*` 상수·핸들러 미변경 | 코드 diff 확인 |
| M | currentWorkingSkin 기준 Preview | HOME/CATEGORY 모두 `resolveSkinTemplate(currentWorkingSkin, ...)` 사용, published Skin을 별도로 다시 읽지 않음 | 코드상 확인 |
| N | public HOME/CATEGORY/POST 코드 경로 미변경 | `skin/skin-home.js`, `skin/skin-category.js`, `posts/view/*` 미수정(diff 확인) | 코드 diff 확인 |
| O | owner management guard 미변경 | `posts-view-list.js`의 owner-view 가드(21-6절)는 이번 Slice가 건드리지 않음 | 코드 diff 확인 |
| P | Code Editor 오해 방지 | 22-6절, CATEGORY 중 버튼 disabled | 코드상 확인 |
| Q | Save Draft 회귀 없음 | 22-7절, `handleStudioSaveClick` 미변경 | 코드 diff 확인 |

### 22-9. 공개 route/guard 회귀 여부

**없음(코드 diff 기준).** 이번 Slice가 수정한 파일은 `studio/index.html`, `studio/studio.css`, `studio/studio-preview.js` 셋뿐이다 — `skin/` 디렉터리(HOME/CATEGORY/POST 렌더러, context 빌더, 새니타이저, 템플릿 선택), `posts/view/*`, `posts/editor/posts-router-init.js`, `home/*` 어디도 손대지 않았다. `studio/preview/preview-bridge.js`도 미변경 — 부모(`studio-preview.js`)가 보내는 `{skin, context}` payload의 **내용**만 페이지 타입에 따라 달라질 뿐, postMessage 계약 자체는 그대로다.

### 22-10. 실제 브라우저 확인 여부

**하지 못했다.** 이 세션은 Supabase 프로젝트/브라우저를 띄울 수 없는 환경이라 22-8절 표는 전부 코드 경로 추적 결과다. 다음 세션에서 최소 다음을 실제로 확인하는 것을 권장한다: (1) post형 category가 있는 draft Skin에서 CATEGORY 토글이 활성화되는지, (2) `templates.category`가 없는 기존 draft에서 unsupported 안내가 뜨는지, (3) HOME↔CATEGORY 전환 시 network 탭 기준 iframe 재로드가 없는지, (4) Mobile 모드에서 페이지 전환 시 390×844 유지 여부.

### 22-11. 다음 PHASE 1C-E 진행 가능 여부

**부분적으로 가능.** Studio가 CATEGORY template/context를 실시간으로 미리볼 수 있는 기반은 이번 Slice로 마련됐다 — 다만 22-10절의 실제 브라우저 검증이 먼저 필요하다. POST Skin Renderer(공개 라우트) + `data-imory-region`/protected post-body 실제 연결(7절), Studio POST Preview, Code Editor의 CATEGORY/POST 편집 UI, category picker(13절 확장) — 전부 여전히 미착수 상태로 남아 있다.
