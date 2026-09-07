# AI SKIN — PHASE 1E: BANNER 페이지 스킨 + 소유자 진입 링크

이 문서는 PHASE 1E에서 추가된 **두 개의 계약**만 정의한다.

1. **BANNER page type** — 배너 목록 카테고리를 Skin template으로 그린다.
2. **`viewer` namespace** — 소유자에게만 보이는 글쓰기/관리 진입 링크.

두 계약 모두 **DB 스키마 변경이 없다**. 새 컬럼/RPC/RLS/마이그레이션을
하나도 추가하지 않았고, 이미 조회하던 `categories` / `banners` /
Supabase 세션에서 파생된 값만 노출한다.

관련 문서: `AI_SKIN_PHASE1A_DESIGN.md`(Skin Context v0.1),
`AI_SKIN_PHASE1C_PAGE_CONTRACT.md`(Multi-page Skin Contract),
`AI_SKIN_PHASE1D_B_NAVIGATION_CONTRACT.md`(navigation 확장).

---

## 1. 배경

PHASE 1C/1D를 거치며 HOME / CATEGORY / POST 세 화면은 published Skin으로
렌더되지만, **배너 카테고리(`categories.type === "banner"`)만 legacy
화면으로 남아 있었다.** 공개 화면에서도 Studio Preview에서도 마찬가지라,
스킨을 적용한 사이트에서 배너 목록에 들어가면 프레임/프로필/메뉴가 통째로
사라지고 플랫폼 기본 그리드가 나타났다.

또 스킨은 방문자용 화면만 그리기 때문에, 소유자가 자기 사이트에서 글쓰기나
관리 화면으로 갈 방법이 없었다(브라우저 주소창에 직접 입력해야 했다).

---

## 2. BANNER page type

### 2-1. page type 목록

`skin/skin-template.js`의 `SKIN_TEMPLATE_PAGE_TYPES`에 `"banner"`가
네 번째로 추가됐다. `resolveSkinTemplate()`의 규칙 자체는 **한 줄도 바뀌지
않았다**:

| 상황 | 결과 |
| --- | --- |
| `templates.banner`가 있다 | 그 template을 쓴다 |
| `templates.banner`가 없다 | `undefined` — HOME/CATEGORY html을 대신 쓰지 않는다 |

즉 `templates.banner`는 **선택 필드**이며, 없는 기존 스킨은 legacy 배너
화면(`posts/view/posts-view-banner.js`)으로 폴백한다.

### 2-2. BANNER Skin Context

`buildBannerSkinContext(ownerId, categoryId, options)`
(`skin/skin-context.js`)가 만든다. 공통 namespace(`site` / `profile` /
`navigation` / `banners` / `viewer` / `images`)는 다른 페이지와 완전히
동일하고, 그 위에 아래 두 가지가 얹힌다.

```
page: {
  type: "banner",
  isHome: false, isCategory: false, isPost: false, isBanner: true
}

bannerCategory: {
  id:    string,          // 카테고리 id
  name:  string,          // 카테고리 이름
  type:  string,          // 실제 categories.type (판정은 호출자 몫)
  href:  string,          // 이 배너 카테고리의 공개 경로
  items: [
    {
      id:       string,
      name:     string,          // 배너 이름(없으면 "")
      alt:      string | null,   // 이름과 같은 값(이미지 대체 텍스트용)
      href:     string | null,   // 안전한 https URL이 아니면 null
      imageUrl: string | null    // 안전한 https URL이 아니면 null
    }
  ]
}
```

**`page.isCategory`는 `banner` 화면에서 `false`다.** 배너 화면이
`/:slug/category/:id` 라우트 위에 있긴 하지만, "항상 정확히 하나의
page boolean만 true"라는 기존 불변식(PHASE1C 3-2절)을 유지한다.

**글 목록 계약을 재사용하지 않는다.** `category.posts`(제목/날짜/내부 링크)와
`bannerCategory.items`(이미지/외부 링크)는 항목의 의미가 다르므로 별도
namespace로 둔다. CATEGORY template을 배너에 복제하지도, 강제로 재사용하지도
않는다.

### 2-3. 데이터 출처와 안전 경계

- 조회는 **기존 함수 그대로**다: `fetchSkinCategoryById()`,
  `fetchSkinBanners()`. 둘 다 `user_id`(+ `category_id`)로 scope되어 있어
  다른 사용자의 배너나 다른 카테고리의 배너가 섞일 수 없다. 정렬은
  `sort_order` 원본 순서.
- `href` / `imageUrl`은 Context 단계에서 `isSafeSkinUrl()`
  (`skin/skin-sanitize.js`)로 한 번 거른다. 안전하지 않으면 **항목을 숨기지
  않고 그 필드만 `null`** 로 만든다(이름은 계속 보인다).
- 렌더 시점에는 `skin-render.js`의 `data-imory-href` / `data-imory-src`가
  다시 검증한다(이중 방어). `href`가 없으면 `<a>`에 href 속성 자체가
  남지 않으므로 어디로도 이동하지 않는 평범한 텍스트가 된다.
- 빈 목록(`items: []`)은 **실패가 아니다.** 그대로 렌더하고, "배너가 없다"는
  표현은 Skin 자신의 CSS/마크업 몫이다(CATEGORY의 빈 글 목록과 동일).

### 2-4. 공개 화면 진입점

`skin/skin-banner.js`의 `renderPublishedSkinBanner({ ownerId, categoryId,
container })`. `skin-category.js` / `skin-post.js`와 **완전히 같은 구조**다:

- 절대 throw하지 않는다. 실패/미지원이면 항상 `false` → 호출자가 legacy 배너로
  폴백한다.
- `false`가 되는 경우: published Skin 없음 / RPC 에러 / 모르는
  `schemaVersion` / `templates.banner` 없음 / 카테고리 없음(또는 다른 소유자) /
  `bannerCategory.type !== "banner"` / `renderSkin` 실패.
- `index.html`이 `window.skinBannerReady` 핸드셰이크를 선언하고
  `posts/view/posts-view-list.js`가 그것을 받아 쓴다(폴링 없음).

**소유자 본인이 열람할 때는 Skin을 시도하지 않는다.** post형 CATEGORY와
동일한 정책이며(`resolvePublishedSkinRouteOwnerId()`, posts-view-list.js),
그래야 소유자가 기존 배너 추가/순서변경/삭제 UI를 잃지 않는다. 익명 방문자와
다른 로그인 사용자에게는 정상적으로 Skin이 적용된다.

Skin이 실제로 렌더되면 `post-container--skin-active` /
`post-area--skin-active`를 붙여 legacy 헤더와 `.post-area`의 legacy padding을
걷어낸다 — HOME/CATEGORY/POST와 똑같은 mount contract라 네 화면의 프레임
좌표/폭이 정확히 일치한다.

### 2-5. Studio Preview

`studio/preview/preview-navigation.js`의 `renderBannerSkinPreviewFor()`가
**공개 화면과 같은 template · 같은 Context · 같은 `renderSkin` 경로**를 탄다
(Studio 전용 렌더 경로를 따로 만들지 않았다). `templates.banner`가 없으면
기존 read-only adapter(`renderBannerCategoryPreviewFor()`)로 떨어진다.

배너 template을 보고 있을 때 `currentPreviewPageType`은 `"banner"`가 되어
CODE 버튼이 `templates.banner`를 편집 대상으로 잡는다.
`resolveCodeEditorSource()` / `applyWorkingSkinChanges()` / Save는 pageType
문자열을 그대로 넘기는 일반형이라 별도 분기가 필요 없었다.

### 2-6. Import / Save

- `skin/skin-package-import.js`: `templates.banner`는 **선택**이다. 없으면
  기존 3종 SkinPackage가 지금까지와 100% 동일하게 통과한다. 넣었는데 모양이
  틀리면(`html`이 문자열이 아님 등) 조용히 무시하지 않고 실패시킨다.
- `skin/skin-package-normalize.js`: 저장 직전 정규화 대상 page type에 banner를
  추가했다. "있으면 sanitize" 목록이라 기존 스킨의 저장 결과는 byte 단위로
  동일하다.

---

## 3. `viewer` namespace (WRITE / ADMIN)

### 3-1. shape

모든 page context(HOME / CATEGORY / POST / BANNER)의 **공통 namespace**다.

```
viewer: {
  isOwner:   boolean,        // 지금 보는 사람이 이 블로그의 소유자인가
  writeHref: string | null,  // 글쓰기 시작 화면 (비소유자에겐 null)
  adminHref: string | null   // 관리 화면      (비소유자에겐 null)
}
```

### 3-2. 판정 기준

`resolveSkinViewerId()`가 `supabaseClient.auth.getSession()`으로 읽은
`session.user.id`가 `ownerId`와 같으면 소유자다 —
`home/home-skin-prompt.js`가 이미 쓰는 것과 **같은 기준**이다.
`getSession()`은 로컬 저장소를 읽으므로 로그아웃 방문자에게 네트워크 왕복이
추가되지 않는다. 어떤 이유로든 실패하면 항상 `null`(= 소유자 아님)로
떨어진다.

### 3-3. `writeHref` 정의

Imory에는 독립된 "글쓰기 URL"이 없다 — 글은 항상 **카테고리 목록 화면의 `+`
버튼**(`posts/editor/posts-list-detail-nav.js`)에서 시작한다. 그래서
`writeHref`는 **첫 번째 POST 카테고리의 목록 경로**다.

- 그 화면이 곧 기존 글쓰기 진입점이고, 동시에 다른 카테고리를 고를 수 있는
  기존 카테고리 선택 흐름이기도 하다.
- POST 카테고리가 하나도 없으면 `null`(링크 자체가 사라진다).
- 어떤 카테고리인지는 **항상 `skin-context.js`가 정한다.** Skin은 category id를
  전혀 모르고 주소를 하드코딩하지 않는다.

`adminHref`는 `${SITE_BASE_PATH}/admin/` — `home/home-skin-prompt.js`가 Skin
Studio로 보낼 때 쓰는 것과 같은 조립 방식이다.

### 3-4. 표시 규칙과 권한

- 비소유자에게는 `isOwner: false`이고 **두 href도 `null`** 이다. Skin이
  실수로 `data-imory-if`를 빠뜨려도 링크가 만들어지지 않는다
  (`data-imory-href`는 값이 문자열이 아니면 href 속성 자체를 지운다).
- **링크를 숨기는 것과 실제 권한 검사는 별개다.** 글 작성/수정/배너 관리의
  권한 검사는 기존 화면과 RLS가 그대로 담당한다. 이 필드는 "링크를 보여줄지"만
  정한다.
- Skin에 JavaScript는 들어가지 않는다 — 평범한 `<a href>` 두 개다.

### 3-5. 링크 이동 동작

| 링크 | 동작 |
| --- | --- |
| WRITE (`/:slug/category/:id`) | `skin/skin-link-nav.js`가 가로채 기존 SPA 라우터(`openCategoryPage`)로 넘긴다 — 문서 전체 재로드/흰색 커튼 없음. 소유자라 legacy 관리 화면 + `+` 버튼이 나온다. |
| ADMIN (`/admin/`) | slug 라우트가 아니므로 SPA 라우터가 가로채지 않고 평범한 문서 이동으로 관리 화면이 열린다. |

### 3-6. Studio Preview에서의 동작

Studio Preview의 iframe(`studio/preview/preview-bridge.js`)은 **같은 origin의
모든 앵커 클릭을 `preventDefault`** 하고 href 문자열만 parent로 보낸다.
parent(`studio/preview/preview-route.js`)는 HOME/CATEGORY/POST 세 패턴만
해석하고 나머지는 무시한다. 따라서 Preview 안의 WRITE/ADMIN 링크는

- iframe 안에서 관리 화면을 열지 않고,
- 편집 중인 draft를 잃게 만들지도 않는다.

기존 정책을 그대로 따른 결과이며, 이를 위해 새로 추가한 코드는 없다.

---

## 4. 이 계약이 바꾸지 않는 것

- `navigation.categories` / `postCategories` / `bannerCategories`,
  `banners.items`, `category.posts`, `home.recentPosts`, `post.*` — 값/순서/
  shape 전부 그대로.
- `templates.{home,category,post}`만 가진 기존 스킨의 렌더/Import/Save/Publish
  동작 — 그대로.
- 배너 추가/수정 진입점과 권한 검사 — 그대로(소유자는 계속 legacy 화면).
- DB — 변경 없음.

---

## 5. 검증

| 대상 | 파일 |
| --- | --- |
| Context 단위(BANNER/viewer/URL 안전/소유자 판정) | `skin/skin-page-context-test.html` |
| 공개 화면 E2E(프레임/항목/빈 목록/실패/폴백/WRITE·ADMIN/날짜) | `skin/skin-banner-page-e2e-test.mjs` |
| Studio Preview(배너 template 경로 + CODE 대상) | `studio/studio-navigation-test.html` (Scenario X) |
| 기존 회귀 | `skin/skin-published-frame-e2e-test.mjs`, `studio/studio-import-test.html`, `studio/studio-multipage-test.html` |

---

## 6. 참고용 스킨

`skin/test-skins/imory-quiet-frame-v2.json` — HOME/CATEGORY/POST/BANNER 네
template과 WRITE/ADMIN 링크를 모두 갖춘 Import용 SkinPackage. 상단 문구
"IMORY ARCHIVE"는 각 template의 `<span class="quiet-topmark">` 한 줄이다
(4개 template 모두 같은 줄).
