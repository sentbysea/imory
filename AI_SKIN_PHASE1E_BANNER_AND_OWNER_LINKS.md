# AI SKIN — PHASE 1E: BANNER 페이지 스킨 + 소유자 진입 링크

> **이 문서는 PHASE 1E 라운드의 기록이다.** 이후 라운드가 바꾼 것:
> WRITE의 2단계 진입은 [PHASE 1F](./AI_SKIN_PHASE1F_WRITE_AND_MANAGE_FLOW.md)가,
> POST의 `?manage=1`과 소유자 도구의 위치·모양은
> [PHASE 1G](./AI_SKIN_PHASE1G_WRITE_TARGET_AND_OWNER_TOOLS.md)가 철회했다.
> 서 있는 규칙은
> [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md)에 있다.

이 문서는 PHASE 1E에서 추가된 **세 개의 계약**만 정의한다.

1. **BANNER page type** — 배너 목록 카테고리를 Skin template으로 그린다.
2. **`viewer` namespace** — 소유자에게만 보이는 글쓰기/관리 진입 링크.
3. **관리 진입 계약(`?manage=1`)** — 화면을 "구경하는" 진입과
   "관리하는" 진입을 주소로 구분한다. CATEGORY(3-1절)에서 시작해
   BANNER(2-4절)와 POST(3-2절)까지 같은 규칙으로 마무리했고, 그 결과
   네 화면 어디에도 "로그인했다는 이유만으로 legacy가 되는 경로"가
   남아 있지 않다(3-3절 요약표).

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

**소유자 본인도 방문자와 같은 Skin을 본다** — banner와 post형 CATEGORY
모두 정책이 같다(`resolvePublishedSkinRouteOwnerId()`,
posts-view-list.js는 더 이상 "누가 보고 있는가"를 보지 않는다):

| | post형 CATEGORY | banner |
| --- | --- | --- |
| 소유자 본인 열람 | **Skin** | **Skin** |
| 그 외 방문자 | Skin | Skin |
| 소유자 + 명시적 관리 진입 | legacy 관리 화면 | legacy 관리 화면 |

즉 화면을 가르는 기준은 **"누구인가"가 아니라 "무엇을 하려고 들어왔는가"**
다(3절 관리 진입 계약).

**소유자 전용 진입점(2-4-1절)**

Skin이 목록을 그린 화면에서 소유자에게만 남는 두 버튼. 화면에 따라 실제로
보이는 `edit` 버튼만 다르고 구조는 같다:

| 버튼 | banner | post형 CATEGORY |
| --- | --- | --- |
| `+` (`#postAddButton`) | `openBannerForm()` — 배너 추가 폼 | `openNewPostEditor()` — 글 작성 폼 |
| `edit` | `#bannerEditToggleButton` → 배너 관리(순서 ↑↓ / 삭제 × / 카드 → 수정) | `#postListEditToggleButton` → 글 관리(선택 삭제 목록 + 선택 바) |

두 화면 모두 **기존 관리 기능을 그대로 쓴다.** 추가/편집모드/선택바 중
어느 것도 삭제하지 않았고, Skin HTML 안에 다시 구현하지도 않았다 —
`togglePostListEditMode()` / `toggleBannerEditMode()`가 원래 하던 일을
그대로 하고, 앞뒤로 "Skin을 접었다 편다"만 붙었다.

둘 다 원래 legacy `.post-header` 안에 있고, 그 헤더는 Skin mount
contract가 통째로 숨긴다. 그래서 `.post-container--owner-tools`
(posts/posts-base.css)로 **그 두 버튼만** 작은 플랫폼 도구로 되살린다
(제목/뒤로가기는 계속 숨김). 문서 흐름 밖에 있어서 Skin 프레임의 좌표/폭에
전혀 영향을 주지 않는다 — HOME/CATEGORY/POST와 같은 프레임이라는 계약이
그대로 유지된다.

> **변경됨(PHASE 1G).** 이 라운드에서는 "화면 오른쪽 아래에 떠 있는
> `position: fixed` 알약"이었다. `#postArea`의 `backdrop-filter` 때문에 그
> fixed가 실제로는 뷰포트 기준이 아니었고(화면 중간에 떠 보임), 지금은 표시
> 공간 오른쪽 **위**의 `position: absolute` 고스트 버튼이다 —
> [PHASE 1G](./AI_SKIN_PHASE1G_WRITE_TARGET_AND_OWNER_TOOLS.md) 2절.

관리 화면은 **명시적으로 열고 닫는다**: `edit`을 누르면 Skin 목록을 잠시
접고 기존 관리 화면을 열고, 다시 누르면 곧바로 Skin 목록으로 돌아온다
(`toggleBannerEditMode()`/`restoreBannerSkinList()`,
`togglePostListEditMode()`/`restoreCategorySkinList()`). 폼을 닫거나
저장/삭제를 마쳤을 때도 마찬가지로 Skin 목록으로 복귀한다 — "편집이
가능하려면 목록이 계속 legacy여야 한다"는 상태는 어디에도 없다.

Skin 목록으로 되돌릴 때는 별도 렌더 경로를 새로 만들지 않고
`openCategoryPage()`를 그대로 다시 태운다 — Skin 배너 렌더 경로가 이
저장소에 한 벌만 존재하게 유지하기 위해서다.

상태(`bannerSkinActive` / `categorySkinActive`)와 setter는 각 렌더러가
아니라 공용 상태 모듈(`posts/editor/posts-state.js`)에 있다.
`openCategoryPage()`는 어떤 카테고리를 열든 진입점에서 두 값을 끄므로,
배너 렌더러를 로드하지 않는 구성(예:
`skin/skin-transition-timing-test.html`)에서도 그 호출이 안전해야 하기
때문이다. 화면 전환 동작만 각 뷰 파일에 둔다.

**소유자 판정**: `isSiteOwnerSignedIn()`(posts/editor/posts-state.js). 이번
Slice 전에는 이 자리들이 "로그인했으면 주인"으로 취급해서, 다중 사용자
배포에서 **다른 계정으로 로그인한 방문자에게도** 글쓰기 `+`와 배너 `edit`이
보였다(누르면 RLS에 막혀 실패할 뿐이라 데이터가 새지는 않았다). 이제
slug로 해석한 실제 소유자와 비교한다 — `updatePostAddButton()`,
`renderBannerCategory()`, 배너 Skin 경로 셋 다 같은 함수를 쓴다. 표시만
바뀌고 실제 쓰기 권한은 여전히 각 쿼리의 user_id 필터와 RLS가 강제한다.

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

## 3. 관리 진입 계약 (`?manage=1`)

> **PHASE 1F에서 일부 개정됨** — `AI_SKIN_PHASE1F_WRITE_AND_MANAGE_FLOW.md`
> 참고. 카테고리의 `?manage=1`(목록 관리 패널)은 그대로지만, POST의
> `?manage=1`은 폐기되고 `?edit=1`(수정 폼 직행)로 대체됐다.

### 3-1. CATEGORY

소유자가 **"이 카테고리를 관리하겠다"** 고 명시적으로 고른 진입과, 그냥
카테고리를 구경하는 진입을 구분하는 최소 계약.

```
/:slug/category/:id            → 카테고리 화면(모두에게 Skin)
/:slug/category/:id?manage=1   → 기존 관리 화면(소유자에게만)
```

새 경로를 만들지 않았다. 기존 카테고리 경로에 쿼리 하나를 붙이는 것이
전부이고, 라우터의 `/^\/category\/(\d+)\/?$/` 패턴도 그대로다.

| 위치 | 역할 |
| --- | --- |
| `core/lib/site-path.js` | `SITE_MANAGE_QUERY_PARAM`, `buildSiteManageUrl()`, `isSiteManageRequested()` — 경로 모양을 아는 유일한 모듈 |
| `skin/skin-context.js` | `viewer.writeHref`를 이 URL로 만든다 |
| `skin/skin-link-nav.js` | Skin 링크 클릭에서 쿼리를 읽어 `openCategoryPage(id, { manage })`로 넘긴다 |
| `posts/editor/posts-router-init.js` | 직접 접속/새로고침/뒤로가기에서도 복원 |
| `posts/view/posts-view-list.js` | 실제 판단 — `manage === true && await isSiteOwnerSignedIn()` 일 때만 관리 화면을 연다 |

**쿼리는 권한이 아니라 요청이다.** 로그아웃 방문자나 다른 계정이 이 주소를
직접 쳐도 관리 화면은 열리지 않고 평소의 Skin 화면이 나온다. 관리 화면이
실제로 열렸을 때만 URL에 쿼리가 유지되므로(pushState), 새로고침과
뒤로가기가 그 화면을 그대로 복원한다. 평소 탐색에서는
`manage === false`라 `&&` 단락 평가로 소유자 조회조차 일어나지 않는다.

### 3-2. POST 상세 (PHASE 1E 후속)

POST에도 **같은 계약을 그대로** 적용했다. 카테고리와 달라진 건
경로 모양 하나뿐이다.

```
/:slug/post/:id            → 글 읽기 화면(모두에게 Skin)
/:slug/post/:id?manage=1   → 기존 관리 화면(소유자에게만)
```

라우터 패턴(`/^\/post\/(\d+)\/?$/`)은 그대로고, 새 경로도 새
컬럼/RPC도 없다.

| 위치 | 역할 |
| --- | --- |
| `posts/view/posts-view-detail.js` | 실제 판단 — `manage === true && await isSiteOwnerSignedIn()` 일 때만 관리 화면을 연다. 그 경우에만 Skin 시도를 건너뛴다 |
| `posts/editor/posts-router-init.js` | 직접 접속/새로고침/뒤로가기에서도 복원(카테고리와 같은 줄) |
| `posts/posts.html` + `posts/editor/posts-refs.js` | `#postManageToggleButton` — 소유자 전용 진입점 |
| `posts/editor/posts-state.js` | `postManageScreenActive` — 지금 화면이 관리 진입인지 |

**소유자도 방문자와 같은 화면으로 읽는다.** 예전에는
`tryRenderPublishedSkinPost()` 안에 "로그인한 사람이 이 사이트의
주인이면 Skin을 통째로 건너뛴다"는 분기가 있었다(수정/삭제 버튼이
legacy `#postDetail` 안에 있어서다). 이제 그 분기는 없고, 그
함수는 "누가 보고 있는가"를 전혀 모른다 — CATEGORY/BANNER와 같다.

**관리 진입점은 하나뿐이다.** Skin이 그린 글 화면 위의 `edit`
버튼(`#postManageToggleButton`)이다(위치는 PHASE 1G에서 오른쪽 위 고스트로
바뀌었고, 그 버튼이 여는 화면은 PHASE 1F에서 legacy 상세가 아니라 수정 폼이
됐다). 배너/글 목록의
edit 토글과 **같은 자리·같은 CSS**(`.post-container--owner-tools`,
`posts/posts-base.css`)를 쓰고, 화면에 따라 셋 중 하나만 보인다.

| 상태 | 화면 | 그 버튼 |
| --- | --- | --- |
| 읽기(기본) | POST Skin | 떠 있는 `edit` (`aria-pressed="false"`) → 관리 화면 |
| 관리 진입 | 기존 legacy 상세(edit/delete/관련 글/글자 크기) | legacy 헤더 안의 `edit` (`aria-pressed="true"`) → 읽기 화면 |

관리 화면은 **기존 코드 그대로**다. `#postDetailActions`(edit/delete)와
`updatePostOwnerActions()`, 비밀글 게이트, 관련 글, 글자 크기 조절
어느 것도 삭제하거나 Skin HTML 안으로 옮기지 않았다. 달라진 건
`updatePostOwnerActions()`가 "Skin이 이 글을 그린 상태
(`currentPostBodyMountTarget`)에서는 legacy 버튼을 켜지 않는다"는
한 줄이 붙은 것뿐이다 — 어차피 `#postDetail`이 통째로 hidden이라
화면에는 아무 변화가 없고, 보이지 않는 화면의 버튼을 켜 두지
않게 됐을 뿐이다.

**편집을 끝내면 항상 읽기 화면(Skin)으로 돌아온다.** 새 코드가
아니라 기존 복귀 경로가 그대로 그렇게 동작한다 —
`cancelPostEditor()`와 저장 후 처리가 모두 `openPostPage(postId)`를
`manage` 없이 부르기 때문이다. 삭제는 기존대로
`openCategoryPage()`로 나간다(그 화면도 Skin이다).

Skin 목록으로 되돌릴 때 `openCategoryPage()`를 다시 태우는 것과
같은 이유로, 읽기 화면 복귀도 **`openPostPage()`를 그대로 다시
태운다**(`togglePostManageScreen()`) — POST Skin 렌더 경로가 이
저장소에 한 벌만 존재하게 유지한다.

**돌아갈 Skin이 없으면 토글도 없다.** `templates.post`가 없는
기존 스킨(또는 렌더 실패)에서는 소유자도 예전과 100% 같은 legacy
상세를 보고, 관리 토글은 뜨지 않는다 — 누를 이유가 없기 때문이다.

**남은 제한(의도한 것)**: 관리 화면에서 수정 폼으로 들어갔다가
취소/저장으로 돌아오면 화면은 읽기(Skin)로 복귀하지만 주소창의
`?manage=1`은 남는다 — 복귀 경로가 기존대로 `updateUrl: false`로
부르기 때문이다(그 상태에서 새로고침하면 관리 화면이 열린다).
CATEGORY의 기존 동작과 같은 자리이므로 이번에도 손대지 않았다.

**비밀글/공개범위 계약은 그대로다.** 소유자는 잠금 없이 Skin의
protected post-body region에서 바로 읽고, 방문자에게는 그 자리에
기존 비밀번호 확인 폼(`#postSecretGate`)이 그대로 들어간다.
`post_contents`/`secret_password_hash`는 여전히 Skin Context에
노출되지 않고, Quote Preset/raw HTML 본문 렌더도 기존 함수를 그대로
쓴다(PHASE1C 6절).


### 3-3. 네 화면의 최종 표시 방식

| 화면 | 방문자 | 소유자(일반 탐색) | 소유자의 관리 진입 |
| --- | --- | --- | --- |
| HOME | Skin | **Skin** | 없음(SETTINGS/Studio는 ADMIN 링크) |
| CATEGORY(post형) | Skin | **Skin** + 떠 있는 `+`/`edit` | `?manage=1` 또는 `edit` → 기존 목록 관리 화면 |
| BANNER | Skin | **Skin** + 떠 있는 `+`/`edit` | `edit` → 기존 배너 관리 그리드 |
| POST | Skin | **Skin** + 떠 있는 `edit` | `?manage=1` 또는 `edit` → 기존 상세(수정/삭제) |

즉 **"로그인했다는 이유만으로 legacy가 되는 경로"는 네 화면 어디에도
남아 있지 않다.** 남은 legacy 폴백은 전부 "스킨이 없거나 못 그렸을
때"뿐이다(미발행/`templates.*` 없음/schemaVersion 모름/조회·렌더 실패).


---

## 4. `viewer` namespace (WRITE / ADMIN)

> **PHASE 1F에서 개정됨** — `viewer.writeHref`는 더 이상 관리 목록
> (`?manage=1`)이 아니라 작성 진입 주소(`?write=1`)를 가리킨다.
> `AI_SKIN_PHASE1F_WRITE_AND_MANAGE_FLOW.md` 2절 참고.
>
> **PHASE 1H에서 변경됨** — 아래 4-1의 shape에 `manageHref`가 하나 더
> 붙었고, `writeHref`는 CATEGORY 화면에서 "지금 보고 있는 그 카테고리"를
> 가리킨다. 또 스킨이 이 주소들을 자기 레이아웃 안에 그리면 플랫폼이
> 같은 동작의 떠 있는 도구를 접는다. 현재 계약은
> [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md)
> §3-1이 기준이다.

### 4-1. shape

모든 page context(HOME / CATEGORY / POST / BANNER)의 **공통 namespace**다.

```
viewer: {
  isOwner:   boolean,        // 지금 보는 사람이 이 블로그의 소유자인가
  writeHref: string | null,  // 글쓰기 시작 화면 (비소유자에겐 null)
  adminHref: string | null   // 관리 화면      (비소유자에겐 null)
}
```

### 4-2. 판정 기준

`resolveSkinViewerId()`가 `supabaseClient.auth.getSession()`으로 읽은
`session.user.id`가 `ownerId`와 같으면 소유자다 —
`home/home-skin-prompt.js`가 이미 쓰는 것과 **같은 기준**이다.
`getSession()`은 로컬 저장소를 읽으므로 로그아웃 방문자에게 네트워크 왕복이
추가되지 않는다. 어떤 이유로든 실패하면 항상 `null`(= 소유자 아님)로
떨어진다.

### 4-3. `writeHref` 정의

Imory에는 독립된 "글쓰기 URL"이 없다 — 글은 항상 **카테고리 화면의 `+`
버튼**(`posts/editor/posts-list-detail-nav.js`)에서 시작한다. 그래서
`writeHref`는 **첫 번째 POST 카테고리의 관리 진입 URL**
(`buildSiteManageUrl(...)` = 그 카테고리 경로 + `?manage=1`)이다.

- 그 화면이 곧 기존 글쓰기 진입점이고, 동시에 다른 카테고리를 고를 수 있는
  기존 카테고리 선택 흐름이기도 하다.
- **같은 카테고리를 그냥 보는 링크(`navigation.postCategories[].href`)와
  주소가 다르다.** 소유자가 메뉴에서 카테고리를 누르면 방문자와 똑같은
  CATEGORY Skin을 보고, WRITE를 눌렀을 때만 기존 관리 화면이 열린다.
- POST 카테고리가 하나도 없으면 보낼 목록이 없으므로 `adminHref`와 같은
  값(관리 화면)으로 떨어진다 — SETTINGS의 CATEGORY 탭에서 카테고리를 만들
  수 있다. "눌렀는데 아무 일도 안 일어난다"보다 "여기서 카테고리부터 만들면
  된다"로 이어지는 편이 낫다. 비소유자에게는 이 폴백도 적용되지 않는다
  (여전히 `null`).
- 어떤 카테고리인지는 **항상 `skin-context.js`가 정한다.** Skin은 category id를
  전혀 모르고 주소를 하드코딩하지 않는다.

`adminHref`는 `${SITE_BASE_PATH}/admin/` — `home/home-skin-prompt.js`가 Skin
Studio로 보낼 때 쓰는 것과 같은 조립 방식이다.

### 4-4. 표시 규칙과 권한

- 비소유자에게는 `isOwner: false`이고 **두 href도 `null`** 이다. Skin이
  실수로 `data-imory-if`를 빠뜨려도 링크가 만들어지지 않는다
  (`data-imory-href`는 값이 문자열이 아니면 href 속성 자체를 지운다).
- **링크를 숨기는 것과 실제 권한 검사는 별개다.** 글 작성/수정/배너 관리의
  권한 검사는 기존 화면과 RLS가 그대로 담당한다. 이 필드는 "링크를 보여줄지"만
  정한다.
- Skin에 JavaScript는 들어가지 않는다 — 평범한 `<a href>` 두 개다.

### 4-5. 링크 이동 동작

| 링크 | 동작 |
| --- | --- |
| WRITE (`/:slug/category/:id?manage=1`) | `skin/skin-link-nav.js`가 가로채 기존 SPA 라우터(`openCategoryPage`)로 넘긴다 — 문서 전체 재로드/흰색 커튼 없음. 소유자면 기존 관리 화면이 열리고, 거기 `+`를 누르면 기존 글 작성 폼이 뜬다. |
| WRITE (POST 카테고리 없음 → `/admin/`) | 관리 화면으로 이동해 카테고리를 먼저 만들게 한다. |
| ADMIN (`/admin/`) | slug 라우트가 아니므로 SPA 라우터가 가로채지 않고 평범한 문서 이동으로 관리 화면이 열린다. |

WRITE는 "카테고리까지 이동"이 아니라 **작성 폼이 실제로 열리는 것까지**를
완료 조건으로 본다 — E2E가 링크 클릭 → `+` 클릭 → `#postEditor`가 열리고
제목 입력이 실제로 되는 데까지 UI를 그대로 눌러서 확인한다
(`skin/skin-banner-page-e2e-test.mjs`).

WRITE의 2단계와 별개로, **CATEGORY Skin 위의 떠 있는 `+` 는 한 번에 작성
폼을 연다** — 이미 그 카테고리를 보고 있다면 관리 화면을 거칠 이유가 없다.

### 4-6. Studio Preview에서의 동작

Studio Preview의 iframe(`studio/preview/preview-bridge.js`)은 **같은 origin의
모든 앵커 클릭을 `preventDefault`** 하고 href 문자열만 parent로 보낸다.
parent(`studio/preview/preview-route.js`)는 HOME/CATEGORY/POST 세 패턴만
해석하고 나머지는 무시한다. 따라서 Preview 안의 WRITE/ADMIN 링크는

- iframe 안에서 관리 화면을 열지 않고,
- 편집 중인 draft를 잃게 만들지도 않는다.

기존 정책을 그대로 따른 결과이며, 이를 위해 새로 추가한 코드는 없다.

---

## 5. 이 계약이 바꾸지 않는 것

- `navigation.categories` / `postCategories` / `bannerCategories`,
  `banners.items`, `category.posts`, `home.recentPosts`, `post.*` — 값/순서/
  shape 전부 그대로.
- `templates.{home,category,post}`만 가진 기존 스킨의 렌더/Import/Save/Publish
  동작 — 그대로.
- 배너 추가/수정 기능과 실제 권한 검사 — 그대로. 진입점의 **위치**만 legacy
  헤더 안에서 떠 있는 도구로 옮겼고, 관리 화면 자체(그리드/폼/순서/삭제)는
  기존 코드 그대로다.
- 글 수정/삭제, 비밀글 소유자 접근과 방문자 비밀번호 확인, protected
  post-body mount, Quote Preset/raw HTML 본문 렌더 — 그대로. POST도 진입
  **경로**만 바뀌었다(3-2절).
- DB — 변경 없음.

---

## 6. 검증

| 대상 | 파일 |
| --- | --- |
| Context 단위(BANNER/viewer/URL 안전/소유자 판정/writeHref 폴백) | `skin/skin-page-context-test.html` |
| 공개 화면 E2E(프레임/항목/빈 목록/실패/폴백/날짜) | `skin/skin-banner-page-e2e-test.mjs` |
| 소유자 흐름 E2E(WRITE→작성 폼까지, 배너 Skin+관리 진입점, 비소유자 미노출) | `skin/skin-banner-page-e2e-test.mjs` |
| 소유자 POST E2E(스킨 읽기 → 관리 진입 → 수정 폼 → 취소/저장 복귀, ?manage=1 직접 접속, 비소유자/방문자, 비밀글, template 없음) | `skin/skin-banner-page-e2e-test.mjs` (4-d) |
| POST 화면 전환 단위(소유자 일반 탐색 vs 관리 진입, secret gate/본문 mount lifecycle) | `skin/skin-post-lifecycle-test.html` (시나리오 E) |
| Studio Preview(배너 template 경로 + CODE 대상) | `studio/studio-navigation-test.html` (Scenario X) |
| 기존 회귀 | `skin/skin-published-frame-e2e-test.mjs`, `studio/studio-import-test.html`, `studio/studio-multipage-test.html` |

---

## 7. 참고용 스킨

`skin/test-skins/imory-quiet-frame-v2.json` — HOME/CATEGORY/POST/BANNER 네
template과 WRITE/ADMIN 링크를 모두 갖춘 Import용 SkinPackage. 상단 문구
"IMORY ARCHIVE"는 각 template의 `<span class="quiet-topmark">` 한 줄이다
(4개 template 모두 같은 줄).
