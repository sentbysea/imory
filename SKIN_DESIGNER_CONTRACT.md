# Imory SkinPackage v1 — 스킨 제작 계약서 (디자이너용)

> 이 문서는 2026-09-06 기준 리포지토리의 **실제 코드**(`skin/*.js`, `studio/*`, `supabase/migrations/*`)를 조사해서 작성했습니다. 추측이나 희망 사항은 포함하지 않았고, 코드가 실제로 강제하는 것과 "적혀만 있고 강제되지 않는 것"을 명확히 구분했습니다. 근거 파일은 각 절에 표기합니다.
>
> 이 문서는 **SkinPackage JSON이 어떤 모양이어야 하는지**를 다룹니다. 그 스킨이 실제 화면에서 어떤 자리를 받고(표시 공간·스크롤), 화면 전환·소유자 관리 진입·Preview 일치가 어떻게 동작하는지는 [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md)에 있습니다.

---

## 0. 한눈에 보는 요약

- 스킨은 `schemaVersion: 1`인 **SkinPackage JSON** 하나입니다. HOME/CATEGORY/POST 세 화면을 각각 `templates.home` / `templates.category` / `templates.post`에 담습니다(레거시 단일 `html`/`css` 방식도 여전히 지원 — 1절).
- HTML에는 일반 태그 + `data-imory-*` 바인딩 속성 5종 + `data-imory-region` 3종(`"post-body"`, `"owner-tools"`, `"memo-tools"`) + Studio Direct Edit 표식 `data-imory-edit-id` 1종만 씁니다. **인라인 JS, `style` 속성, `id` 속성은 전부 저장 시점에 제거됩니다.**
- CSS는 저장 시점에 파싱되어 `.imory-skin-root` 스코프가 강제로 붙습니다. `@import`, `expression()`, `javascript:`/`data:` 스킴의 `url()`, 특정 "보호 대상 selector"는 제거됩니다.
- POST 화면은 본문(글 내용) 데이터 자체를 절대 받지 않습니다. `data-imory-region="post-body"`로 "자리"만 표시하면 플랫폼이 그 자리에 실제 본문을 채웁니다. 이 region이 없는 POST 템플릿은 아예 공개되지 않고 레거시 화면으로 대체됩니다.
- Studio에는 "SkinPackage JSON 전체 붙여넣기(Import)" 기능이 있고, 이 문서 13절이 그 검증 로직이 실제로 요구하는 정확한 shape입니다.

---

## 1. 완전한 SkinPackage JSON shape

근거: [skin/skin-template.js](skin/skin-template.js), [skin/skin-package-import.js](skin/skin-package-import.js), [skin/skin-package-normalize.js](skin/skin-package-normalize.js), [skin/skin-generator.js](skin/skin-generator.js)

현재 코드는 **두 가지 shape**을 동시에 지원합니다. `skin/skin-template.js`의 `resolveSkinTemplate()`이 이 우선순위로 읽습니다.

### 1-1. 멀티페이지 shape (권장 — Studio Import/Questionnaire가 만드는 형태)

```jsonc
{
  "schemaVersion": 1,

  "templates": {
    "home":     { "html": "<!-- HOME 페이지 전체 마크업 -->" },
    "category": { "html": "<!-- CATEGORY 페이지 전체 마크업 -->" },
    "post":     { "html": "<!-- POST 페이지 전체 마크업 (post-body region 필수) -->" },
    "banner":   { "html": "<!-- (선택) 배너 카테고리 페이지 -->" },
    "folder":   { "html": "<!-- (선택) 폴더 페이지 / Series Viewer — folder.posts 반복 안에 post-body region 필수 (2-7절) -->" },
    "memos":    { "html": "<!-- (선택) 메모 카테고리 — 없으면 플랫폼 기본 template으로 그려진다 (2-8절) -->" }
  },

  "css": "/* 모든 화면이 공유하는 CSS 하나 */",

  "imageSlots": [
    { "name": "profile", "label": "프로필 사진", "required": false, "aspectRatioHint": "1:1" }
  ],

  "regions": [],

  "metadata": {
    "title": "스킨 이름",
    "generatedBy": "manual",
    "supports": { "home": true, "list": true, "post": true },
    "requiredContext": ["site.title", "profile.nickname", "..."]
  }
}
```

- `templates.<page>.css`처럼 페이지별 `css` 필드를 넣는 것 **자체는 구조상 허용**되지만(`resolveSkinTemplate`이 있으면 그걸 쓰고 없으면 공유 `css`로 폴백), 저장 검증(`normalizeSkinPackageForDraft`)은 오직 공유 `css` 하나만 CSS validator에 통과시킵니다. 즉 페이지별 CSS를 넣어도 **검증되지 않은 채 그대로 저장**됩니다 — 현재 도구 체인은 "세 화면이 CSS 하나를 공유한다"는 전제로 만들어져 있으므로, 페이지별 CSS는 쓰지 않는 것을 권장합니다.
- Studio의 "SkinPackage Import" 기능(13절)은 **`templates.home`/`templates.category`/`templates.post` 세 개가 전부 존재하고 각각 `.html` 문자열을 가질 것**을 요구합니다. 셋 중 하나라도 없으면 Import 자체가 거부됩니다. `templates.banner`와 `templates.folder`, `templates.memos`는 **선택**입니다 — 있으면 함께 검증되고(folder는 post-body region 필수), 없으면 그 화면은 각각 legacy 배너 화면 / "폴더 페이지 없음"(폴더 링크가 그려지지 않음) / **플랫폼 기본 메모 화면**으로 동작합니다.

  `templates.memos`만 폴백이 다릅니다. 메모 카테고리에는 legacy 화면이 없어서 "지원하지 않으면 안 보여준다"가 성립하지 않기 때문에, 없으면 플랫폼이 들고 있는 기본 template(`getDefaultMemosTemplate()`, [skin/skin-template.js](skin/skin-template.js))으로 **같은 Context를 같은 renderer로** 그립니다. 그 기본값도 고정된 완성 HTML이 아니라 다른 스킨과 똑같은 `data-imory-*` 바인딩 마크업이므로, 그대로 복사해 고치는 것이 가장 빠른 출발점입니다.

### 1-2. 레거시 단일 페이지 shape (HOME 전용, 여전히 지원됨)

```jsonc
{
  "schemaVersion": 1,
  "html": "<!-- HOME 페이지 전체 마크업 -->",
  "css": "/* CSS */",
  "imageSlots": [ { "name": "profile", "label": "프로필 사진", "required": false, "aspectRatioHint": "1:1" } ],
  "regions": [],
  "metadata": { "title": "...", "generatedBy": "manual", "supports": { "home": true, "list": false, "post": false }, "requiredContext": [] }
}
```

- `templates` 필드가 아예 없으면 `resolveSkinTemplate(skin, "home")`이 top-level `html`/`css`로 폴백합니다. 단 이 shape은 **CATEGORY/POST를 지원할 수 없습니다**(`resolveSkinTemplate`이 category/post에는 `undefined`를 돌려줌 → 플랫폼이 자동으로 레거시 카테고리/글 화면을 보여줌).
- 실제 예: [skin/test-skins/static-test-skin.json](skin/test-skins/static-test-skin.json).

### 1-3. 필드별 의미와 강제 여부

| 필드 | 타입 | 실제로 강제/검증되는가 |
|---|---|---|
| `schemaVersion` | `1` 고정 | **강제**. 1이 아니면 공개 HOME/CATEGORY/POST 전부 즉시 레거시로 폴백(`skin-home.js`/`skin-category.js`/`skin-post.js`가 각각 확인). Import 시에도 `1`이 아니면 거부. |
| `templates.home/category/post.html` | string | **강제**(존재/문자열 여부만). 내용은 sanitize를 통과한 결과로 대체됨(2절). |
| `css` | string | 공유 CSS. **강제 검증**(CSS validator, 8절). 검증 실패 시 저장 자체가 거부됨(`normalizeSkinPackageForDraft`가 throw). |
| `imageSlots` | `{name,label,required,aspectRatioHint}[]` | `name`만 실제로 쓰입니다(`images.<name>` context 키가 됨, 10절). `label`/`required`/`aspectRatioHint`는 **코드 어디에서도 읽지 않는 순수 정보성 필드**입니다(Studio UI에서도 참조하는 곳이 없음). |
| `regions` | array | **완전 미사용**. 항상 빈 배열(`[]`)로만 존재하고 렌더러/새니타이저 어디도 이 필드를 읽지 않습니다. `data-imory-region`(HTML 속성)과 이름이 비슷하지만 이 최상위 `regions` 필드와는 무관합니다. |
| `metadata.supports` / `metadata.requiredContext` | object / string[] | **순수 정보성**. 렌더러/저장 RPC/Studio 어디도 이 값을 읽어서 분기하지 않습니다. 실제 지원 여부는 오직 `templates.<page>`가 존재하는지로만 판정됩니다. |

### 1-4. DB 저장 경로 (참고용)

`skins` / `skin_versions` 테이블에 append-only로 저장되고(`content` 컬럼이 SkinPackage 전체를 JSONB로), RPC(`create_skin_with_initial_version`/`save_skin_draft_version`/`publish_skin`)는 **콘텐츠 자체를 재검증하지 않습니다** — sanitize/validate는 전부 클라이언트(Studio JS) 책임이고, 최종 방어선은 매 렌더마다 다시 도는 `skin-render.js`입니다([skin-render.js](skin/skin-render.js) 파일 상단 주석, [20260905100000_add_skin_draft_write_rpcs.sql](supabase/migrations/20260905100000_add_skin_draft_write_rpcs.sql)).

---

## 2. HOME / CATEGORY / POST Context 필드 전체 + 실제 값 예시

근거: [skin/skin-context.js](skin/skin-context.js)

`site`/`profile`/`navigation`/`banners`/`images`는 **세 화면 공통**(top-level)이고, `page`/`home`/`category`/`post`는 페이지별로 하나만 채워집니다.

### 2-1. 공통 namespace (HOME/CATEGORY/POST 전부 동일)

```jsonc
{
  "site": {
    "title": "민지의 다이어리",          // site_settings.blog_title, 없으면 profiles.nickname, 그것도 없으면 "Imory"
    "slug": "minji",                     // profiles.slug
    "faviconUrl": null,                  // site_settings.favicon_url 또는 null
    "description": null,                 // 항상 null 고정(입력 UI 없음)
    "language": "ko"                     // 항상 "ko" 고정
  },
  "profile": {
    "nickname": "민지",
    "bio": "그림 그리고 일기 씁니다.",     // 없으면 null
    "avatarUrl": null                    // imageSlots에 "profile" 슬롯이 없으면 항상 null
  },
  "navigation": {
    "home": { "name": "민지의 다이어리", "href": "/minji", "enabled": true },
    "categories": [
      { "id": "3", "name": "일상", "type": "post", "href": "/minji/category/3", "itemCount": null },
      { "id": "5", "name": "링크", "type": "banner", "href": "/minji/category/5", "itemCount": null }
    ],
    "postCategories":  [ /* categories 중 type==="post" 만 필터, item shape 동일 */ ],
    "bannerCategories": [ /* categories 중 type==="banner" 만 필터, item shape 동일 */ ]
  },
  "banners": {
    "items": [
      { "id": "10", "imageUrl": "https://.../banner.png", "href": "https://instagram.com/...", "alt": "인스타그램" }
    ]
  },
  "viewer": {
    "isOwner": true,                     // 지금 이 화면을 보는 사람이 이 블로그 주인인가
    "writeHref": "/minji/category/3?write=1",  // 글쓰기 요청 주소 (비소유자 null)
    "adminHref": "/admin/",              // 관리 화면 (비소유자 null)
    "manageHref": "/minji/category/3?manage=1" // 이 화면의 목록 관리 (해당 없으면 null)
  },
  "images": {
    "profile": "https://.../avatar.png"   // imageSlots[].name 목록에 있는 슬롯만 키로 존재, 값 없으면 null
  }
}
```

- `navigation.categories`는 원본 순서를 보존합니다. 기존 스킨의 메뉴 호환을 위해 `postCategories`는 post와 gallery를 포함합니다. 종류별 메뉴는 `textPostCategories`(post만), `galleryCategories`, `bannerCategories`를 사용합니다. 알 수 없는 미래 타입은 전체 `categories`에 유지됩니다.
- `itemCount`는 항상 `null`입니다(계산 로직 없음).
- `banners.items[].href`는 사용자가 직접 입력한 외부 URL일 수 있고, `https://`만 통과합니다(없으면 `null`).
- `viewer`는 **링크를 그릴지만** 정합니다. 실제 권한 검사는 그 주소를 받은
  플랫폼이 다시 하고, 쓰기 권한은 DB(RLS)가 강제합니다 — 스킨은 작성·수정·삭제·
  인증을 구현하지 않습니다. 비소유자에게는 `isOwner: false`와 함께 세 href가 전부
  `null`이라, `data-imory-if`를 빠뜨려도 링크가 만들어지지 않습니다.
- `viewer.writeHref`는 화면에 따라 대상이 다릅니다. CATEGORY(글 카테고리)에서는
  **지금 보고 있는 그 카테고리**, FOLDER에서는 **지금 보고 있는 그 폴더**
  (`/{slug}/category/{cid}/folder/{fid}?write=1` — 작성 폼의 FOLDER 드롭다운이 그
  폴더로 미리 맞춰집니다), 그 외 화면에서는 글 카테고리가 하나뿐이면 그 카테고리,
  여러 개거나 없으면 HOME 주소입니다(받는 쪽이 고르게 하거나 안내).
- `viewer.manageHref`는 **그 화면에 실제로 목록 관리 화면이 있을 때만** 채워집니다 —
  현재는 글 카테고리(CATEGORY)뿐이고 HOME/POST/BANNER에서는 `null`입니다. 배너
  관리는 주소로 표현되는 동작이 아니라 화면 안의 토글이라 스킨이 대신 그릴 수
  없습니다.
- **스킨이 `manageHref`/`writeHref` 링크를 그리면 플랫폼은 같은 동작의 기본
  도구(`+` / `edit`)를 접습니다.** 그리지 않으면 기본 도구가 그대로 남으므로, 예전
  스킨은 아무것도 바뀌지 않습니다. 판정은 렌더된 DOM에 그 주소를 가리키는
  `<a href>`가 있는지로만 하고, 스킨 이름이나 클래스는 전혀 보지 않습니다.
- 기본 도구가 남는 경우 그 자리는 `data-imory-region="owner-tools"`로 지정할 수
  있습니다(3절). 지정하지 않으면 플랫폼이 스킨의 글 기둥 첫 줄을 재서 맞춥니다 —
  자세한 규칙: [IMORY_FOLDER3_DESIGN.md](./IMORY_FOLDER3_DESIGN.md) 4절.

### 2-2. `page` namespace (공통, 항상 존재)

```jsonc
{ "page": { "type": "home", "isHome": true, "isCategory": false, "isPost": false } }
```

`type`은 `"home"` / `"category"` / `"post"` 중 하나이고, `isHome`/`isCategory`/`isPost` boolean이 함께 옵니다. **`data-imory-if`는 비교 연산(`===`)을 지원하지 않으므로**(5절) `data-imory-if="page.type"`으로 "지금이 HOME인가"를 표현할 수 없습니다 — 반드시 `page.isHome` 같은 boolean을 써야 합니다.

### 2-3. `home` namespace (HOME 페이지에서만 채워짐)

```jsonc
{
  "home": {
    "recentPosts": [
      {
        "id": "42",
        "title": "🔒 오늘의 일기",              // secret이면 "🔒 ", private이면 "🙈 " 접두어 자동 포함
        "href": "/minji/post/42",
        "publishedAt": "2026-09-05T10:00:00+00:00",  // created_at ISO 원본 문자열 그대로(UTC, 호환성 유지 — 절대 변경/제거되지 않음)
        "publishedAtLabel": "2026. 09. 05",    // 화면 표시용 — Asia/Seoul(한국 시간) 기준 "YYYY. MM. DD". 값이 없거나 잘못된 날짜면 빈 문자열("")
        "categoryId": "3",                     // 없으면 null
        "categoryName": "일상",                 // 없으면 null
        "isSecret": true                       // visibility === "secret"
      }
    ]
  }
}
```

최근 글 최대 5개(`created_at` 내림차순, 페이지네이션 없음).

- `publishedAt`은 DB `created_at`(UTC) ISO 문자열 원본이고, `publishedAtLabel`은 그 값을 **Asia/Seoul(한국 시간)** 기준으로 변환해 `"YYYY. MM. DD"` 형태로 만든 화면 표시용 문자열이다(`skin/skin-context.js` `formatSkinPublishedAtLabel()`, 공용 순수 함수 하나로 세 namespace 모두 처리). 단순 UTC 날짜 슬라이싱이 아니라 실제 타임존 변환이므로, UTC 자정 근처 값(예: `2026-09-05T15:16:11+00:00`)은 한국 시간으로는 다음 날(`2026. 09. 06`)로 정확히 넘어간다 — 날짜가 하루 밀리는 문제를 피하기 위한 의도적 설계다.
- `publishedAt`이 `null`/`undefined`이거나 파싱 불가능한 날짜 문자열이면 `publishedAtLabel`은 에러 없이 빈 문자열(`""`)이다.

### 2-4. `category` namespace (CATEGORY 페이지에서만 채워짐)

```jsonc
{
  "category": {
    "id": "3",
    "name": "일상",
    "type": "post",                 // "post" | "banner" — DB에 CHECK 제약 없음, 코드가 실제 쓰는 값은 이 둘뿐
    "href": "/minji/category/3",
    "posts": [
      {
        "id": "42",
        "title": "🙈 비공개 글",
        "href": "/minji/post/42",
        "publishedAt": "2026-09-05T10:00:00+00:00",
        "publishedAtLabel": "2026. 09. 05",     // home.recentPosts와 동일 규칙(2-3절 참고)
        "isSecret": false
      }
    ]
  }
}
```

- **`type === "banner"`인 카테고리는 Skin 렌더 자체를 타지 않습니다** — `skin-category.js`가 `context.category.type !== "post"`이면 `false`를 반환해 레거시 배너 그리드 화면으로 폴백합니다. 즉 디자이너는 배너 카테고리 페이지를 Skin으로 커스터마이즈할 수 없습니다(현재 코드 기준).
- 글이 없으면 `posts`는 `undefined`가 아니라 **빈 배열**입니다.
- `category.posts[]`에는 `categoryName`이 없습니다(이미 `category.name`으로 상위에 있으므로 중복 노출 안 함).
- 페이지네이션 없음 — 카테고리의 모든 글을 한 번에 반환합니다.

#### 폴더를 쓰는 스킨 — `category.tree` / `category.hasFolders`

기준 문서: [IMORY_FOLDER1_DESIGN.md](./IMORY_FOLDER1_DESIGN.md)

사용자는 카테고리 안에서 글을 **폴더(최대 3단계)** 로 묶을 수 있습니다.
그 계층은 `category.posts`와 **나란히** 별도 필드로 옵니다.

```jsonc
{
  "category": {
    "posts": [ /* 기존 그대로 — 폴더를 모르는 스킨용 */ ],

    "hasFolders": true,
    "tree": [
      { "kind": "post",   "id": "12", "title": "폴더 없는 글", "href": "/me/post/12",
        "publishedAt": "...", "publishedAtLabel": "2026. 09. 01", "isSecret": false, "depth": 1 },
      { "kind": "folder", "id": "3", "name": "홍차", "depth": 1,
        "folderHref": "/me/category/1/folder/3",   // 폴더 페이지 링크 — 없으면 null (2-7절)
        "postCount": 1,                            // 이 폴더에 직접 든 보이는 글 수
        "children": [
        { "kind": "folder", "id": "4", "name": "Sentinel AU", "depth": 2, "folderHref": "/me/category/1/folder/4", "postCount": 1, "children": [
          { "kind": "post", "id": "20", "title": "첫 만남", "href": "/me/post/20", "depth": 3, "...": "..." }
        ] }
      ] }
    ]
  }
}
```

- **`category.posts`는 폴더가 생겨도 달라지지 않습니다.** 필드도 그대로, 순서도 최신순(`created_at DESC`) 그대로, 폴더 안에 들어간 글도 전부 포함입니다. 기존 목록형 스킨은 아무것도 고칠 필요가 없습니다.
- `category.tree`만 사용자가 관리 화면에서 drag로 정한 순서를 반영합니다. 폴더와 글이 한 컨테이너 안에서 섞여 정렬됩니다.
- **폴더에는 `href`가 없습니다.** 폴더 페이지 링크는 별도 키 **`item.folderHref`** 로 옵니다(FOLDER-2). 이 값은 스킨에 `templates.folder`가 있고 그 폴더에 직접 든 보이는 글이 하나 이상일 때만 문자열이고, 그 외에는 `null`입니다 — 반드시 `<a data-imory-if="item.folderHref" data-imory-href="item.folderHref">`처럼 가드하세요. `item.href`는 글 노드에만 있으므로 글/폴더 판정에 계속 쓸 수 있습니다.
- **`kind` 값으로 분기할 수 없습니다**(`data-imory-if`는 값 비교를 못 합니다). 대신 필드 존재로 갈라 쓰세요: 폴더는 `item.name`/`item.children`, 글은 `item.title`/`item.href`.
- 폴더가 하나도 없으면 `hasFolders`는 `false`이고, `tree`에는 root 글 노드만 관리 화면 순서(`sort_order`)로 옵니다(글이 없으면 빈 배열). 그래서 `category.tree`만 쓰는 스킨도 폴더가 없는 카테고리를 그릴 수 있습니다. 최신순 목록이 필요하면 `category.posts`를 쓰세요.
- **방문자에게 보이는 글이 하나도 없는 폴더는 `tree`에 아예 오지 않습니다** — 빈 폴더 이름이 화면에 남지 않습니다.
- **한 repeat 안에서 폴더 가지와 글 가지를 둘 다 두고 `data-imory-if`로 가릅니다.** 해당 없는 가지는 `hidden`이 되므로 스킨 CSS에 `[hidden] { display: none; }`이 있어야 합니다. 완성 예시: [skin/test-skins/imory-finder-folders-v1.json](skin/test-skins/imory-finder-folders-v1.json) — 1단계 폴더는 큰 폴더 카드, 그 안의 글은 작은 항목, 2·3단계 폴더는 카드 안의 들여쓴 묶음, root 글은 작은 항목입니다(글 하나하나가 폴더 카드가 되지 않습니다).

```html
<!-- 아코디언/들여쓰기 등 표현은 전적으로 스킨이 정합니다 -->
<ul data-imory-if="category.hasFolders">
  <li data-imory-repeat="category.tree">
    <span data-imory-if="item.name" data-imory-bind="item.name"></span>
    <a data-imory-if="item.href" data-imory-href="item.href" data-imory-bind="item.title"></a>

    <ul data-imory-if="item.children">
      <li data-imory-repeat="item.children">
        <span data-imory-if="item.name" data-imory-bind="item.name"></span>
        <a data-imory-if="item.href" data-imory-href="item.href" data-imory-bind="item.title"></a>
        <!-- 필요한 깊이만큼 같은 식으로 한 단계씩 더 (최대 4단계) -->
      </li>
    </ul>
  </li>
</ul>
```

### 2-7. `folder` namespace (FOLDER 페이지 — Series Viewer, `templates.folder`가 있을 때만)

기준 문서: [IMORY_FOLDER2_DESIGN.md](./IMORY_FOLDER2_DESIGN.md)

주소 `/{slug}/category/{cid}/folder/{fid}`. 폴더 하나의 **직접 든 글**(하위 폴더의 글은 포함하지 않음)을 관리 화면 순서대로, 각 글의 **실제 본문**이 같은 페이지에 위에서 아래로 이어지도록 보여주는 화면입니다.

```jsonc
{
  "page": { "type": "folder", "isFolder": true, "isCategory": false, "...": "..." },
  "category": { "id": "1", "name": "일상", "type": "post", "href": "/me/category/1" },
  "folder": {
    "id": "4", "name": "Sentinel AU", "depth": 2,
    "href": "/me/category/1/folder/4",
    "parentHref": "/me/category/1/folder/3",         // 가장 가까운 열 수 있는 상위(부모 폴더 페이지 또는 카테고리)
    "ancestors": [ { "kind": "folder", "id": "3", "name": "홍차", "depth": 1, "folderHref": "/me/category/1/folder/3", "postCount": 1 } ],
    "children":  [ /* 직속 하위 폴더(보이는 글이 있는 것만) — 같은 shape */ ],
    "posts": [
      { "id": "20", "title": "첫 만남", "href": "/me/post/20",
        "publishedAt": "...", "publishedAtLabel": "2026. 01. 01", "isSecret": false,
        "editHref": null }                          // 소유자에게만 "/me/post/20?edit=1"
    ],
    "postCount": 1
  },
  "viewer": { "isOwner": false, "writeHref": null, "manageHref": null, "...": "..." }  // 소유자면 이 폴더의 ?write=1 / 그 카테고리의 ?manage=1
}
```

- **본문은 여기 없습니다.** POST와 같은 원칙(7절)으로, 플랫폼이 렌더 뒤 각 글의 `post-body` region에 채웁니다.
- **필수 마크업**: `folder.posts`를 반복하고 반복되는 엘리먼트 **안에** 글마다 `data-imory-region="post-body"`를 하나 둡니다. 렌더러가 각 region에 그 글의 id를 찍어 두므로 순서가 바뀌거나 조건부로 숨겨도 다른 글의 본문이 섞이지 않습니다. 반복 밖의 region은 채워지지 않고, region이 하나도 없는 FOLDER 템플릿은 Import/공개 렌더에서 거부됩니다.

```html
<h1 data-imory-bind="folder.name"></h1>
<nav data-imory-if="folder.children">
  <a data-imory-repeat="folder.children" data-imory-if="item.folderHref" data-imory-href="item.folderHref" data-imory-bind="item.name"></a>
</nav>
<article data-imory-repeat="folder.posts">
  <h2 data-imory-bind="item.title"></h2>
  <p data-imory-bind="item.publishedAtLabel"></p>
  <a data-imory-if="item.editHref" data-imory-href="item.editHref">EDIT</a>
  <div data-imory-region="post-body"></div>
</article>
<a data-imory-href="folder.parentHref">← back</a>
```

- 비밀글은 방문자에게 그 글의 region 안에 비밀번호 폼으로 나타납니다(플랫폼 소유, 클래스 `.post-secret-gate*`). 소유자에게는 본문이 바로 보입니다. 비공개 글은 방문자에게 목록에도 없습니다.
- 읽기 흐름이 목적이므로 글 사이의 구분은 최소로 두는 것을 권장합니다(제목·날짜·얇은 구분선). 완성 예시: [skin/test-skins/imory-finder-folders-v2.json](skin/test-skins/imory-finder-folders-v2.json).
- 이 페이지를 그릴 수 없을 때(스킨에 `templates.folder`가 없음, 폴더 없음, 보이는 직접 글 없음) 플랫폼은 **그 카테고리 페이지로 돌려보냅니다** — 폴더 전용 폴백 화면은 없습니다.

### 2-5. `post` namespace (POST 페이지에서만 채워짐)

```jsonc
{
  "post": {
    "id": "42",
    "title": "🔒 오늘의 일기",
    "publishedAt": "2026-09-05T10:00:00+00:00",
    "publishedAtLabel": "2026. 09. 05",     // home.recentPosts와 동일 규칙(2-3절 참고)
    "categoryName": "일상",     // 카테고리 없이 쓴 글이면 null
    "categoryHref": "/minji/category/3", // categoryName이 null이면 이것도 null
    "href": "/minji/post/42"    // 이 글의 정식 공개 주소(쿼리 없음)
  }
}
```

POST에서만 `viewer`에 두 값이 더 채워집니다(HIGHLIGHT-1).

| 경로 | 값 |
|---|---|
| `viewer.toolsHref` | 글 뷰어 도구 메뉴(⋮)를 여는 주소 — 글자 크기 · 링크 복사, 주인장에게는 하이라이팅 모드 · 글 수정까지 |
| `viewer.highlightHref` | 하이라이팅 모드로 곧장 들어가는 주소(주인장에게만, 방문자는 null) |

`viewer.toolsHref`는 **주인장과 방문자 모두에게 값이 있습니다** — 이 메뉴는 권한 도구가 아니라 읽기 도구이기 때문입니다. 그래서 `data-imory-if="viewer.isOwner"`로 감싸면 안 되고 `data-imory-if="viewer.toolsHref"`로 감쌉니다. 메뉴 **안**의 항목만 권한에 따라 달라집니다.

이 링크를 그리면 플랫폼은 자기 ⋮ 버튼을 접습니다. 그리지 않으면 플랫폼의 기본 ⋮가 그대로 남습니다 — 어느 쪽이든 기능에 닿을 수 있고, 둘이 함께 나오는 일은 없습니다.

**`post.content`(본문)는 이 Context 어디에도 존재하지 않습니다.** 본문 데이터를 select조차 하지 않으므로 실수로도 노출될 수 없습니다 — 7절 참고.

### 2-8. `memos` namespace (메모 카테고리 — `/:slug/memos`)

하이라이트/메모 카드를 모아 보는 화면입니다. 여기서 말하는 **"폴더"는 원본 글의 카테고리**이고, 별도의 중첩 폴더 시스템이 아닙니다.

```jsonc
{
  "memos": {
    "view": { "isAll": true, "isFolders": false, "isFolder": false },  // 정확히 하나만 true

    "allHref": "/minji/memos",
    "foldersHref": "/minji/memos?view=folders",
    "allLabel": "전체",
    "foldersLabel": "폴더별",

    "showCards": true,     // 지금 카드 목록을 그릴 차례인가(폴더 격자를 보는 중이면 false)
    "isEmpty": false,
    "count": 12,
    "hasError": false,

    "cards": [
      {
        "id": "3f0c…",
        "excerpt": "긴 시간이 지난 뒤, 자식에게 애정을 베푸는 일 못지않게…",
        "note": "나는 오늘도 대가를 치르며 살아간다",
        "hasNote": true,
        "color": "#f6e0c8",
        "date": "2026-09-13T01:25:00+00:00",
        "dateLabel": "2026. 09. 13",
        "postId": "42",
        "postTitle": "오늘의 일기",
        "postHref": "/minji/post/42",
        "categoryName": "일상",
        "categoryHref": "/minji/category/3",
        "folderId": "3",
        "folderHref": "/minji/memos/category/3",
        "isMissing": false   // 원문이 바뀌어 그 자리를 찾지 못한 상태
      }
    ],

    "hasFolders": true,
    "foldersEmpty": false,
    "folders": [
      {
        "id": "3",                 // 원본 카테고리 id, 카테고리 없는 글은 "none"
        "name": "일상",
        "href": "/minji/memos/category/3",
        "count": 7,
        "countLabel": "7개",
        "coverUrl": "/api/post-cover?memo=3",   // hasCover가 false면 null
        "hasCover": true,
        "coverRatio": "3:4",       // "1:1" | "3:4" | "4:3" | "original"
        "coverFocusX": 50,
        "coverFocusY": 30
      }
    ],

    "folder": null,   // 폴더 하나를 연 화면에서만 그 폴더 객체

    "canManage": true // 표시용. 실제 권한은 DB가 강제한다
  }
}
```

- 카드가 어느 폴더에 속하는지는 **지금의** `posts.category_id`입니다 — 글의 카테고리를 옮기면 카드도 따라 옮겨갑니다.
- 목록도 개수도 "지금 이 사람이 볼 수 있는" 카드로만 만들어집니다. 비밀글·비공개 글의 발췌문은 어떤 경로로도 오지 않습니다.
- `data-imory-if`는 값을 비교할 수 없으므로 `memos.view`를 직접 검사하지 말고 `memos.showCards` / `memos.view.isFolders` 같은 미리 계산된 boolean을 쓰세요.
- `coverRatio`를 실제 비율로 표현하는 것은 스킨 CSS의 몫입니다(플랫폼 CSS는 스킨 template에 적용되지 않습니다).

**필수 마크업 — `memo-tools` region**

```html
<article data-imory-repeat="memos.cards">
  <blockquote data-imory-bind="item.excerpt"></blockquote>
  <p data-imory-if="item.hasNote" data-imory-bind="item.note"></p>
  <a data-imory-if="item.postHref" data-imory-href="item.postHref">원문 보기</a>

  <!-- 카드마다 하나. 비워 둡니다. -->
  <span data-imory-region="memo-tools"></span>
</article>
```

스킨 HTML에는 `<button>`이 들어갈 수 없으므로(8절), 주인장의 ⋮ 메뉴(메모 추가/수정/삭제, 하이라이트 삭제)는 플랫폼이 이 자리에 넣습니다. `memos.cards` repeat **안에** 두어야 하며, 렌더러가 그 자리에 카드 id를 키로 찍어 주므로 DOM 순서가 아니라 키로 짝지어집니다. 방문자에게는 빈 채로 남습니다 — 크기를 주거나 테두리를 그리지 마세요. 이 자리가 없으면 화면은 정상이지만 주인장이 자기 메모를 고칠 수 없습니다.

### 2-9. `navigation.memos` (공통)

```jsonc
{ "navigation": { "memos": { "name": "MEMO", "href": "/minji/memos", "enabled": true } } }
```

어느 화면에서든 메모 카테고리로 가는 링크입니다. **이 링크를 그리지 않으면 독자가 그 화면에 닿을 방법이 주소를 직접 치는 것뿐입니다.**

### 2-6. 값이 없을 때의 규칙

- 필드가 **사라지지 않습니다** — 항상 `null`(스칼라) 또는 `[]`(배열)로 존재합니다.
- 존재하지 않는 경로를 참조하면(`resolveSkinPath`) 에러 없이 조용히 `undefined`가 되고, `data-imory-bind`는 빈 문자열, `data-imory-if`는 falsy, `data-imory-repeat`은 그 엘리먼트 자체를 제거합니다.

---

## 3. 지원되는 `data-imory-*` 속성 전체

근거: [skin/skin-sanitize.js](skin/skin-sanitize.js) `SKIN_SANITIZE_BIND_ATTRS`/`SKIN_SANITIZE_REGION_ATTR`, [skin/skin-render.js](skin/skin-render.js)

**정확히 7개**만 존재합니다(그중 6개가 렌더러가 해석하는 것이고, 마지막 하나는 Studio 전용 표식입니다). 이 외의 `data-imory-*` 속성은 이름 자체를 아예 인식하지 않고, 저장 시점에 조용히 제거됩니다(경고 로그만 남김).

| 속성 | 값 형식 | 동작 |
|---|---|---|
| `data-imory-bind="path"` | dotted identifier | Context 값을 **`textContent`로만** 대입. HTML 렌더 아님(XSS 원천 차단). `undefined`/`null`이면 빈 문자열. |
| `data-imory-href="path"` | dotted identifier | resolve한 문자열이 URL 안전 검사(6절)를 통과하면 `href` 속성 설정, 실패하면 **속성 자체를 삭제**(대체 placeholder 없음). |
| `data-imory-src="path"` | dotted identifier | `data-imory-href`와 동일 로직, `src` 속성 대상. |
| `data-imory-repeat="path"` | dotted identifier | 값이 배열이면 그 엘리먼트를 템플릿 삼아 item마다 clone. 배열이 아니면(`undefined`/`null`/객체 등) **엘리먼트 자체를 제거**. |
| `data-imory-if="path"` | dotted identifier | truthy/falsy만 판정해 `el.hidden` 토글. |
| `data-imory-region="post-body"` | 고정 문자열 `"post-body"` 만 허용 | 값은 resolve 대상이 아님(경로 아니라 식별자). mount 시 이 엘리먼트의 **자식을 전부 비운 뒤**, 플랫폼(Post Viewer)이 실제 글 본문을 그 안에 주입할 자리로 씁니다. POST 템플릿에는 하나, FOLDER 템플릿에는 `folder.posts` 반복 안에 글마다 하나(2-7절) — 반복 안의 region에는 렌더러가 항목 id를 `data-imory-region-key`로 찍습니다(스킨이 직접 쓰는 속성이 아니며, 써도 제거됩니다). |
| `data-imory-region="memo-tools"` | 고정 문자열 `"memo-tools"` 만 허용 | **비워 두는 자리**입니다. 메모 카테고리의 카드마다 하나씩 `memos.cards` repeat 안에 둡니다 — 주인장에게만 카드 도구(⋮: 메모 추가/수정/삭제, 하이라이트 삭제)가 그 자리에 들어가고 방문자에게는 빈 채로 남습니다. 렌더러가 그 자리에 카드 id를 키로 찍어 주므로 DOM 순서가 아니라 키로 짝지어집니다. 자세한 규칙: [IMORY_HIGHLIGHT1_DESIGN.md](./IMORY_HIGHLIGHT1_DESIGN.md) §8-3. |
| `data-imory-region="owner-tools"` | 고정 문자열 `"owner-tools"` 만 허용 | **비워 두는 자리**입니다. 주인장에게만 보이는 플랫폼 버튼(＋ 새 글 / edit)이 그 자리에 맞춰 놓입니다 — 방문자에게는 아무것도 나타나지 않습니다. 이 자리를 그리지 않아도 되고(그때는 플랫폼이 스킨의 글 기둥을 재서 맞춥니다), 그리면 정확히 그 줄·그 오른쪽 끝에 옵니다. 자세한 규칙: [IMORY_FOLDER3_DESIGN.md](./IMORY_FOLDER3_DESIGN.md) 4절. |
| `data-imory-edit-id="..."` | 영문으로 시작하는 영문/숫자/`_`/`-` 문자열, 최대 64자 | **렌더러가 해석하지 않는 순수 표식**입니다(PHASE AI-6A). Skin Studio의 Direct Edit이 "이 요소"를 재렌더/재저장 뒤에도 다시 찾기 위해 붙이며, 생성된 CSS 규칙의 `[data-imory-edit-id="..."]` selector가 이 값을 가리킵니다. 디자이너가 직접 쓸 필요는 없고, 형태가 맞지 않으면 저장 시점에 제거됩니다. 자세한 내용: [AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md](./docs/ai-skin/AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md) 2절. |

### 3-1. 속성 값(경로) 문법 제약

`data-imory-bind`/`href`/`src`/`repeat`/`if`의 값은 이 정규식만 통과합니다:

```
^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$
```

즉 `home.recentPosts`, `item.href`, `post.categoryName`처럼 영문자/숫자/언더스코어와 마침표만 가능합니다. 대괄호 인덱싱(`home.recentPosts[0]`), 함수 호출, 공백, 따옴표는 전부 불가 — 이 패턴에 안 맞으면 저장 시점에 속성이 통째로 제거됩니다.

### 3-2. `id` 속성은 전면 금지

표준 HTML `id` 속성은 v0.1 정책상 **완전히 제거**됩니다(`SKIN_SANITIZE_DENY_ATTRS`). region/앵커 식별에도 표준 `id`를 쓸 수 없고, 오직 `data-imory-region`만 그 역할을 합니다.

---

## 4. repeat 안에서 쓸 수 있는 item 필드

근거: [skin/skin-render.js](skin/skin-render.js) `makeSkinItemResolver`, [skin/skin-context.js](skin/skin-context.js)

`data-imory-repeat="path"`가 걸린 엘리먼트 내부에서는 `item`(또는 `item.xxx`)이 그 배열의 현재 원소를 가리킵니다. `item`으로 시작하지 않는 경로는 **바깥(outer) 스코프로 그대로 폴백**합니다 — 즉 repeat 안에서도 `site.title` 같은 공통 값을 계속 쓸 수 있습니다.

| repeat 대상 경로 | item 필드 |
|---|---|
| `navigation.categories` / `navigation.postCategories` / `navigation.bannerCategories` | `item.id`, `item.name`, `item.type`, `item.href`, `item.itemCount`(항상 null) |
| `home.recentPosts` | `item.id`, `item.title`, `item.href`, `item.publishedAt`, `item.publishedAtLabel`, `item.categoryId`, `item.categoryName`, `item.isSecret` |
| `banners.items` | `item.id`, `item.imageUrl`, `item.href`, `item.alt` |
| `category.posts` | `item.id`, `item.title`, `item.href`, `item.publishedAt`, `item.publishedAtLabel`, `item.isSecret` |
| `category.tree` / `item.children` | 폴더: `item.kind`, `item.id`, `item.name`, `item.depth`, `item.children` · 글: `item.kind`, `item.id`, `item.title`, `item.href`, `item.publishedAt`, `item.publishedAtLabel`, `item.isSecret`, `item.depth` |

### 4-1. 중요한 제약

- **Nested repeat(반복 안에 또 반복)은 최대 5단계까지 지원합니다.** 그보다 깊으면 경고를 남기고 그 엘리먼트를 제거합니다. 폴더 트리를 끝까지 그리는 데 필요한 깊이는 4단계입니다(root → 1단계 폴더 안 → 2단계 폴더 안 → 3단계 폴더 안의 글).
- **안쪽 `item`은 바깥 `item`을 가립니다**(일반적인 반복문과 같습니다). `item`으로 시작하지 않는 경로(`category.name` 등)는 안쪽에서도 계속 닿습니다.
- `category.tree`를 제외한 위 배열들의 item 필드는 전부 스칼라(문자열/불리언/null)입니다.

---

## 5. `data-imory-if`의 정확한 동작과 표현식 제한

근거: [skin/skin-render.js](skin/skin-render.js) `applySkinIf`/`isSkinTruthy`

```js
function isSkinTruthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}
el.hidden = !isSkinTruthy(value);
```

- **truthy/falsy 판정만 합니다.** `===`, `!==`, `>`, `<`, `&&`, `||` 같은 연산자는 전혀 지원하지 않고, 애초에 값 자체가 dotted identifier 경로 하나(3-1절)만 올 수 있어서 표현식을 쓸 문법적 여지가 없습니다.
- 배열은 `length > 0`으로 판정합니다(빈 배열 = falsy).
- falsy 판정 시 엘리먼트가 DOM에서 삭제되는 게 아니라 **`hidden` 속성이 켜집니다**(`el.hidden = true`) — 즉 여전히 DOM에는 존재하지만 브라우저 기본 스타일(`display:none` 동등)로 숨겨집니다. Skin CSS에서 `[hidden]`을 임의로 `display: block` 등으로 오버라이드하면 숨김이 깨질 수 있으니 주의해야 합니다.
- **"반대 조건(else)" 문법이 없습니다.** "값이 있을 때 A, 없을 때 B"를 표현하려면 두 엘리먼트를 각각 `data-imory-if="path"`와 별도 조건으로 만들어야 하는데, `!path`(부정) 문법 자체가 없으므로 **현재 코드로는 "값이 없을 때만 보이는 블록"을 직접 만들 수 없습니다.** (예: "카테고리 없이 작성된 글"의 breadcrumb을 숨기는 건 가능하지만, 그 자리에 "카테고리 없음" 문구를 대신 보여주는 건 불가능합니다.)
- 예: `<p class="diary-bio" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>` — `bio`가 없으면 숨겨지고, 있으면 `bind`가 텍스트를 채웁니다. 같은 엘리먼트에 `if`와 `bind`를 동시에 걸 수 있습니다.

---

## 6. HOME / CATEGORY / POST 이동에 필요한 href 계약

근거: [core/lib/site-path.js](core/lib/site-path.js) `buildSitePath()`, [skin/skin-context.js](skin/skin-context.js)

플랫폼이 생성해 Context에 넣어주는 모든 `href`는 이미 완성된 사이트 내부 경로이므로, 디자이너는 그 값을 그대로 `data-imory-href`에 바인딩하기만 하면 됩니다.

| 이동 대상 | Context 경로 | 실제 값 형태 |
|---|---|---|
| HOME | `navigation.home.href` | `/{slug}` (예: `/minji`) |
| CATEGORY(목록 클릭) | `navigation.categories[].href` (또는 postCategories/bannerCategories) | `/{slug}/category/{id}` |
| CATEGORY(자기 자신) | `category.href` | `/{slug}/category/{id}` |
| POST(HOME 최근글) | `home.recentPosts[].href` | `/{slug}/post/{id}` |
| POST(카테고리 목록) | `category.posts[].href` | `/{slug}/post/{id}` |
| POST(브레드크럼 → 소속 카테고리) | `post.categoryHref` | `/{slug}/category/{id}` 또는 `null` |
| FOLDER(폴더 페이지, FOLDER-2) | `category.tree[].folderHref` / `folder.children[].folderHref` / `folder.ancestors[].folderHref` | `/{slug}/category/{cid}/folder/{fid}` 또는 `null`(스킨에 `templates.folder`가 없거나 직접 든 글이 없음) |
| FOLDER(자기 자신 / 상위) | `folder.href` / `folder.parentHref` | `/{slug}/category/{cid}/folder/{fid}` / 부모 폴더 페이지 또는 `/{slug}/category/{cid}` |
| POST 수정(소유자만) | `folder.posts[].editHref` | `/{slug}/post/{id}?edit=1` 또는 `null` |

- 항상 `/`로 시작하는 **경로형** URL이며 절대 도메인이 붙지 않습니다(SPA 내부 History API 라우팅).
- **prev/next(이전글/다음글) 개념 자체가 코드에 없습니다** — POST Context에는 그런 필드가 없습니다. "관련 글" UI는 Skin이 아니라 레거시 Post Viewer의 `#postRelated` 영역이 별도로 렌더합니다(Skin 영역 밖).
- `banners.items[].href`만 예외적으로 **사용자가 직접 입력한 임의의 외부 URL**일 수 있습니다(내부 라우팅 아님, `https://`만 허용).

### 6-1. `isSafeSkinUrl()` 판정 로직 (href/src 공통)

```js
function isSafeSkinUrl(rawUrl) {
  // javascript:/data:/vbscript:/file:/blob:/mailto:/tel: 스킴이면(공백/제어문자 위장 포함) 거부
  // new URL(trimmed, "https://imory-skin-url-base.invalid/") 로 파싱해서 protocol === "https:" 인지만 확인
}
```

이 구현의 실질적 의미: `/minji/post/42`처럼 스킴이 없는 **상대/절대 경로 문자열은 가상의 https 베이스에 대해 항상 파싱에 성공**하므로 통과합니다. 즉 이 함수는 "위험한 스킴만 차단"하는 블랙리스트에 가깝고, 스킴이 없는 임의 문자열(예: 오타난 경로)도 실제로는 통과시켜 버립니다 — 링크가 깨지는지 여부는 검증하지 않습니다.

---

## 7. POST 본문 protected region의 필수 HTML

근거: [skin/skin-render.js](skin/skin-render.js) `applySkinRegion`/`getRegion`, [skin/skin-post.js](skin/skin-post.js), [skin/skin-template.js](skin/skin-template.js) `htmlHasPostBodyRegion`

### 7-1. 왜 `post.content`를 직접 bind할 수 없는가

`data-imory-bind`는 항상 `textContent`로만 대입합니다(3절) — 본문은 문단/인용구/서식이 있는 HTML이라 애초에 이 방식으로 표현이 불가능합니다. 그래서 Context 자체에 `post.content` 필드가 존재하지 않습니다(본문 컬럼을 select조차 하지 않음, 2-5절).

### 7-2. 필수 마크업

POST 템플릿 안에는 **정확히 이 속성을 가진 엘리먼트가 하나 있어야** 합니다.

```html
<div class="skin-post-body-slot" data-imory-region="post-body">
  <p class="skin-authored-placeholder">본문이 여기 표시됩니다(미리보기용 placeholder)</p>
</div>
```

- 태그는 자유(`div`/`section`/`article` 등 허용 태그 중 아무거나)이지만 **`data-imory-region="post-body"` 속성값은 정확히 `"post-body"` 문자열**이어야 합니다(그 외 값은 저장 시점에 속성 자체가 제거됨).
- **placeholder 자식 콘텐츠는 실제로 화면에 절대 나타나지 않습니다** — mount 시점에 `applySkinRegion()`이 이 엘리먼트의 자식을 전부 비웁니다. 디자이너 편의를 위한 미리보기용 문구일 뿐이며, 없어도 무방합니다.
- 이 region 안에 `data-imory-bind`/`if`/repeat` 등 다른 바인딩 속성을 **함께 쓸 수 없습니다** — region은 단독으로만 처리되고, 다른 속성이 같은 엘리먼트에 있어도 무시됩니다. 단 region을 **repeat 안에** 두는 것은 FOLDER 템플릿에서 허용됩니다(2-7절) — 그때는 반복되는 엘리먼트의 자식으로 두세요(region 자신에 `data-imory-repeat`을 붙이지 않습니다).

### 7-3. 이 region이 없으면 어떻게 되는가

- **저장 단계(Studio Import)**: `templates.post.html`에 `[data-imory-region="post-body"]`가 없으면 `"POST 템플릿에는 글 본문이 표시되는 자리(post-body region)가 반드시 있어야 합니다."` 메시지로 Import 자체가 거부됩니다(`skin-package-import.js`).
- **공개 렌더 단계**: `skin-post.js`가 렌더 후 `getRegion("post-body")`로 실제 DOM을 다시 확인해서, 없으면(sanitize 과정에서 제거된 경우 포함) 컨테이너를 비우고 **레거시 POST 화면으로 자동 폴백**합니다. "본문 없는 반쪽 페이지"가 공개되는 일은 구조적으로 없습니다.

### 7-4. Skin이 할 수 있는 것 / 할 수 없는 것

| 주체 | 가능 | 불가능 |
|---|---|---|
| Skin | region 컨테이너의 위치, 바깥 여백/배경/보더, 페이지 레이아웃 전체 | region **내부**의 구조·내용 결정(애초에 본문 데이터가 주어지지 않음) |
| 플랫폼 | mount 후 region을 찾아 실제 본문(스타일 프리셋 적용 결과/raw HTML/비밀글 잠금 화면)을 그 안에 주입 | Skin의 chrome(title/date/category) 영역을 직접 건드리는 것 |

**알려진 한계**: Skin CSS의 범용 selector(`p`, `.title` 등)는 `.imory-skin-root` 스코프 클래스가 붙긴 하지만, region이 물리적으로 그 스코프 안에 위치하므로 **본문 내부 콘텐츠에도 그대로 적용될 수 있습니다**(Shadow DOM 격리 없음). 본문 스타일(폰트/줄간격 등)까지 Skin CSS가 의도치 않게 건드릴 수 있다는 뜻이므로, 범용 태그 selector 사용 시 주의가 필요합니다.

---

## 8. 허용·금지되는 HTML 태그와 속성

근거: [skin/skin-sanitize.js](skin/skin-sanitize.js)

### 8-1. 허용 태그(정확히 이 목록)

```
div section article header footer nav main aside figure figcaption
h1 h2 h3 h4 h5 h6 p span br hr
b strong i em u small mark blockquote cite sub sup
ul ol li dl dt dd
a img
details summary
```

### 8-2. 완전 제거 태그 (내용까지 통째로 삭제 — 자식 텍스트도 새어나오지 않음)

```
script iframe object embed applet link meta base
form input button select textarea
video audio source track canvas svg
style noscript template
```

### 8-3. 그 외 미지의/허용되지 않은 태그

허용 목록에도, 제거 목록에도 없는 태그(예: `table`, `img`가 아닌 임베드성 태그 등)는 **껍데기만 벗겨지고 자식은 살아남습니다**(unwrap). 즉 `<table><tr><td>텍스트</td></tr></table>`를 넣으면 `table`/`tr`/`td`는 사라지고 "텍스트"만 남습니다 — 표 형태를 만들고 싶다면 `table` 태그 대신 `div`+CSS Grid/Flex로 구현해야 합니다.

### 8-4. 속성

**공통 허용(모든 허용 태그)**: `class`, `lang`, `dir`, `title`, `role`, `aria-*`(전부 통과)

**태그별 허용**:
- `<img alt="...">`
- `<a href="...">` — `isSafeSkinUrl()` 통과 시에만(6-1절), 실패 시 속성 삭제
- `<img src="...">` — 위와 동일

**`data-imory-*`**: 3절의 7종만(그 외 `data-*`는 화이트리스트에 없으므로 전부 제거됨 — `data-foo="bar"` 같은 임의 커스텀 데이터 속성은 쓸 수 없습니다).

**전면 금지(값 무관 무조건 삭제)**:
```
style srcdoc formaction xlink:href
autofocus contenteditable draggable tabindex
id
```
그리고 `on`으로 시작하는 모든 속성(`onclick`, `onerror` 등 인라인 이벤트 핸들러) 전부.

### 8-5. 실무 함의

- **인라인 `style` 속성을 쓸 수 없으므로**, 모든 시각적 차이는 반드시 `class` + 공유 CSS로 표현해야 합니다(실제로 `skin-generator.js`도 레이아웃 분기를 전부 클래스 + CSS 커스텀 프로퍼티로만 만듭니다).
- `<form>`/`<input>`/`<button>` 등 입력 요소를 스킨 HTML 안에 만들 수 없습니다(비밀글 비밀번호 입력창 같은 UI는 플랫폼이 자체적으로 처리).
- `<svg>` 인라인 아이콘은 통째로 제거됩니다 — 아이콘이 필요하면 `<img src="https://...">`(외부 이미지)로 대체해야 합니다.

---

## 9. CSS 허용 범위와 금지 규칙

근거: [skin/skin-css-validate.js](skin/skin-css-validate.js)

파이프라인: `raw CSS → csstree로 파싱 → 위험 구문 제거 → 모든 selector 앞에 스코프 클래스 강제 삽입 → 문자열로 재생성`.

### 9-1. 구조적으로 파싱 불가능하면 전체 실패

`csstree`가 `onParseError`를 하나라도 보고하면 **CSS 전체가 빈 문자열로 대체**됩니다(부분 허용 없음, `ok: false`). Studio Import/저장 시점에는 이 경우 저장 자체가 거부됩니다.

### 9-2. 제거되는 구문

| 구문 | 처리 |
|---|---|
| `@import ...` | 통째로 제거 |
| `-moz-binding`, `behavior` 프로퍼티 | 선언 자체 제거 |
| custom property(`--*`)의 값에 `javascript:`/`vbscript:`/`expression(`/`-moz-binding`/`behavior:` 키워드가 포함 | 선언 제거(값이 opaque라 정밀 검증 불가 → 키워드 스캔) |
| 구조화되지 못한(Raw) 값의 일반 프로퍼티 선언(예: 따옴표 깨진 `url(...)`) | 선언 제거 |
| `expression(...)` 함수 | 제거 |
| `url(...)`의 스킴이 `javascript:`/`data:`/`vbscript:`/`file:`/`blob:` | 그 `url()` 제거 (https 또는 스킴 없는 상대경로만 허용) |
| 위 제거 결과 값이 완전히 비어버린 일반 선언 | 정리 제거 |
| **보호 대상 selector**: `#postDetailContent`, `.post-detail-content`, `.post-dialogue`, `.post-action`, `.post-inline-*` 를 포함하는 selector | selector 자체 제거(그 결과 rule의 selector list가 전부 비면 rule 통째로 제거) |

### 9-3. Selector 스코프 강제

모든 selector 앞에 `.imory-skin-root-<인스턴스ID>` 클래스가 자동으로 붙습니다(저장되는 CSS 자체에는 붙지 않고, **렌더될 때마다** 매번 적용).

- `:root`는 **맨 앞에 오기만 하면** 스코프 클래스로 치환됩니다 — 단독(`:root { }`)이든
  상태가 붙어 있든(`:root[data-imory-post-focus="on"] .sidebar { }`) 똑같습니다.
  이게 스킨이 자기 루트 엘리먼트를 가리킬 수 있는 유일한 방법입니다(아래 9-6).
- `html`/`body`는 **단독 compound일 때만** 치환됩니다. 그 외(`body.dark`처럼 다른
  selector와 결합된 경우)는 죽은 규칙이 됩니다(매치 대상 없음, 위험하지는 않음).

### 9-4. `@keyframes` 이름 격리

렌더 시점에 `@keyframes` 이름과 그걸 참조하는 `animation`/`animation-name` 값이 렌더 인스턴스별로 자동 변경됩니다(저장되는 원본 이름은 그대로 유지). 디자이너가 신경 쓸 부분은 없지만, "왜 개발자 도구에 내가 안 지은 keyframe 이름이 보이는지" 궁금하다면 이 때문입니다.

### 9-5. 실무 함의

- 외부 폰트/이미지 `url()`은 **https만** 허용됩니다.
- `@font-face`, 미디어 쿼리, CSS 커스텀 프로퍼티(`--*`), `@keyframes` 애니메이션은 전부 사용 가능합니다.
- `body`/`html`에 전역 스타일을 걸고 싶어도 스코프 처리 때문에 사실상 무력화되므로, 최상위 래퍼(`.skin-shell` 등 직접 만든 클래스)에 스타일을 거는 것을 전제로 설계해야 합니다.

### 9-6. 플랫폼이 알려 주는 화면 상태 (`data-imory-post-focus`)

POST 화면에서 플랫폼이 스킨 루트에 속성 하나를 실어 줍니다. **쓸지 말지는 스킨이
정합니다** — 이 속성을 CSS에서 받지 않으면 지금까지와 완전히 같은 화면이 나옵니다.

| 값 | 뜻 |
| --- | --- |
| `off` | 아직 펼쳐진 상태 — 전환의 시작 지점 |
| `on` | 읽기 모드 |

```css
/* 좁은 화면에서만 프로필·메뉴를 접는 예 */
@media (max-width: 720px) {
  :root[data-imory-post-focus] .sidebar {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows 340ms ease, opacity 200ms ease;
  }
  :root[data-imory-post-focus] .sidebar-inner { min-height: 0; overflow: hidden; }
  :root[data-imory-post-focus="on"] .sidebar { grid-template-rows: 0fr; opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  :root[data-imory-post-focus] .sidebar { transition: none; }
}
```

전환 시점은 플랫폼이 정합니다:

- 목록/HOME에서 글을 눌러 들어오면 `off` → `on`으로 바뀌므로 선언한 transition이
  실제로 재생됩니다.
- 직접 접속·새로고침·뒤로가기, POST → POST 이동, `prefers-reduced-motion: reduce`
  환경에서는 처음부터 `on`이라 애니메이션 없이 최종 상태로 나타납니다.
- 접었을 때 **돌아갈 길은 스킨이 남겨야 합니다** — 상단 띠의 사이트 제목 링크나
  `post.categoryHref` 링크처럼, 접히지 않는 자리에 하나는 남기세요.

---

## 10. 이미지 및 imageSlots 사용법

근거: [skin/skin-image-slots.js](skin/skin-image-slots.js), [skin/skin-context.js](skin/skin-context.js) `buildSkinImages`, [supabase/migrations/20260904100000_create_skins_skin_versions.sql](supabase/migrations/20260904100000_create_skins_skin_versions.sql)

### 10-1. 선언

```jsonc
"imageSlots": [
  { "name": "profile", "label": "프로필 사진", "required": false, "aspectRatioHint": "1:1" }
]
```

- **`name`만 기능적으로 쓰입니다.** `label`/`required`/`aspectRatioHint`는 코드 어디에서도 읽지 않는 순수 정보성 필드입니다(현재 Studio UI에도 이 값을 소비하는 화면이 없습니다).
- `name`은 DB(`skin_image_slot_values.slot_name`) 저장 시 `^[a-z][a-z0-9_]*$`(소문자로 시작, 소문자/숫자/언더스코어만, 50자 이하) 제약을 통과해야 합니다. 이 패턴을 벗어난 이름을 쓰면(대문자 포함 등) 이미지 URL을 그 슬롯에 실제로 저장할 수 없습니다 — 슬롯 이름은 **소문자 스네이크 케이스**로 짓는 것을 권장합니다.

### 10-2. HTML에서 사용

```html
<img class="diary-avatar" data-imory-src="profile.avatarUrl" alt="프로필 이미지">
```

또는 임의 슬롯(프로필 전용이 아닌 배경 이미지 등)이라면:

```html
<img data-imory-src="images.header" alt="상단 배경">
```

- `profile.avatarUrl`과 `images.profile`은 **항상 같은 값**입니다(둘 다 같은 `images` 맵에서 파생, `skin-context.js` `buildBaseSkinContext`). `imageSlots`에 `"profile"`이라는 이름의 슬롯을 선언하지 않으면 `profile.avatarUrl`도 `images.profile`도 항상 `null`입니다.
- 값이 없으면(`null`) `data-imory-src`는 `src` 속성 자체를 붙이지 않습니다(placeholder 이미지로 자동 대체되지 않음) — Skin CSS에서 `img:not([src])` 같은 selector로 기본 배경색/아이콘을 준비해 두는 것을 권장합니다.

---

## 11. Desktop/Mobile 반응형 조건

근거: [studio/studio.css](studio/studio.css), [studio/studio-preview.js](studio/studio-preview.js), [index.html](index.html)

### 11-1. 실제 공개 페이지

`<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`가 걸려 있으므로, 실제 방문자의 브라우저에서는 표준적인 `@media (max-width: ...)` 미디어 쿼리가 실제 기기 폭 기준으로 그대로 동작합니다. 플랫폼이 강제하는 별도 breakpoint 값은 없습니다 — 디자이너가 자유롭게 breakpoint를 정합니다.

### 11-2. Studio Preview의 시뮬레이션 조건

Studio에는 데스크톱/모바일 두 미리보기 모드가 있고, 정확히 이렇게 시뮬레이션합니다:

- **Desktop 모드**: iframe이 Studio 프리뷰 영역 전체(`width:100%; height:100%`)를 채웁니다 — 고정 폭 없이, Studio 창 크기에 그대로 반응합니다.
- **Mobile 모드**: iframe의 **레이아웃 뷰포트를 항상 390×844로 고정**합니다(iPhone 12/13/14 계열 논리 해상도). Studio 창이 이보다 좁으면 `transform: scale()`로 시각적으로만 축소하고, 레이아웃 계산 자체는 언제나 390×844 기준으로 이뤄집니다.

**따라서 모바일 대응 CSS를 만들 때는 `@media (max-width: 390px)`(또는 그보다 약간 여유를 둔 `768px` 등 통상적인 값)를 기준으로 설계하면, Studio Mobile Preview에서 본 화면과 실제 390px 폭 기기에서 보이는 화면이 정확히 일치합니다.**

### 11-3. Skin 자체의 반응형 강제 규칙

플랫폼이 특정 breakpoint 값이나 미디어 쿼리 존재 자체를 강제/검증하지는 않습니다(sanitizer/validator는 미디어 쿼리 문법이 유효한 CSS이기만 하면 통과시킵니다). 반응형 대응 여부는 전적으로 디자이너 책임입니다. 참고로 `skin-generator.js`(AI 없이 만드는 기본 스킨)는 2단/3단 레이아웃에서 `@media (max-width: 640px)`에 1열로 접는 규칙을 쓰고 있습니다.

---

## 12. sanitizer/validator를 통과하지 못하는 사례

근거: [skin/skin-sanitize.js](skin/skin-sanitize.js), [skin/skin-css-validate.js](skin/skin-css-validate.js), [skin/skin-package-import.js](skin/skin-package-import.js)

### 12-1. HTML — 제거되지만 저장 자체는 성공(조용히 걸러짐)

| 예시 | 결과 |
|---|---|
| `<div style="color:red">` | `style` 속성만 삭제, `<div>`는 남음 |
| `<div id="hero">` | `id` 속성만 삭제 |
| `<a href="javascript:alert(1)">` | `href` 속성 삭제(`<a>` 태그는 남음, 클릭해도 아무 일 없음) |
| `<img onerror="alert(1)" src="x">` | `onerror` 삭제, `src="x"`는 `isSafeSkinUrl` 통과 여부에 따라 남거나 삭제 |
| `<script>alert(1)</script>` | 태그와 내용 전체 삭제 |
| `<table><tr><td>메뉴</td></tr></table>` | `table`/`tr`/`td` 태그만 벗겨지고 "메뉴" 텍스트만 남음 |
| `<div data-imory-bind="home.recentPosts[0].title">` | 경로가 정규식(3-1절)에 안 맞아 속성 전체 삭제 |
| `<div data-imory-region="sidebar">` | 허용 값이 `"post-body"` 하나뿐이라 속성 전체 삭제 |
| repeat 내부에 또 `data-imory-repeat` — **6단계 이상** | 렌더 시점에 그 엘리먼트가 삭제됨(저장은 성공, **렌더할 때** 사라짐). 5단계까지는 FOLDER-1부터 정상 렌더된다(4-1절) |

### 12-2. CSS — 부분 제거되지만 저장은 성공

| 예시 | 결과 |
|---|---|
| `@import url("https://evil.example/x.css");` | 이 규칙만 제거 |
| `.x { background: url(javascript:alert(1)); }` | 이 선언만 제거 |
| `.x { behavior: url(x.htc); }` | 이 선언만 제거 |
| `#postDetailContent { color: red; }` | 이 selector가 제거되어 rule 자체가 사라짐 |
| `.post-dialogue p { font-size: 99px; }` | 위와 동일 |

### 12-3. CSS — 저장 자체가 완전히 거부되는 사례

- **CSS 문법이 깨져서 `csstree`가 파싱 에러를 하나라도 보고하는 경우** — 이때는 부분 제거가 아니라 CSS 전체가 빈 문자열로 처리되고, `normalizeSkinPackageForDraft()`/`validateSkinPackageImport()` 둘 다 이 경우 **throw/실패**로 처리해 저장·Import 자체를 막습니다(작업물이 반영되지 않은 "아무 일도 없었던" 상태로 남음).

### 12-4. Import(13절) 전용 — 구조 검증 실패로 거부

| 예시 | 결과 메시지 |
|---|---|
| `schemaVersion: 2` | "schemaVersion은 1이어야 합니다." |
| `templates` 필드 없음 | "templates 필드가 필요합니다." |
| `templates.category` 없음 | "templates.category.html이 필요합니다." |
| `templates.post.html`에 `data-imory-region="post-body"` 없음 | "POST 템플릿에는 글 본문이 표시되는 자리(post-body region)가 반드시 있어야 합니다." |
| `css`가 문자열이 아닌 숫자/객체 | "css는 문자열이어야 합니다." |
| JSON 자체가 깨짐 | "JSON 형식이 올바르지 않습니다: ..." |

### 12-5. 공개 렌더 시점(사후) 폴백 — 저장은 됐지만 방문자에게는 레거시 화면이 보임

- `templates.category`/`templates.post`가 아예 없는 Skin으로 카테고리/글 페이지 접근 → 레거시 화면
- `category.type === "banner"`인 카테고리 → Skin 렌더를 아예 시도하지 않고 레거시 배너 그리드
- POST 템플릿을 렌더했는데 sanitize 이후 실제 DOM에 `post-body` region이 살아있지 않음 → 컨테이너 비우고 레거시 POST 화면
- `schemaVersion !== 1`인 Skin이 발행되어 있음 → HOME/CATEGORY/POST 전부 레거시로 폴백

---

## 13. Import 기능으로 한 번에 가져올 수 있는 정확한 JSON 예시

근거: [skin/skin-package-import.js](skin/skin-package-import.js) `validateSkinPackageImport()`

Studio의 "SkinPackage Import"는 아래 최소 shape만 만족하면 통과합니다(`templates.home`/`category`/`post` 모두 존재 + `.html`이 문자열 + post에 post-body region + css가 유효한 CSS 문자열).

```json
{
  "schemaVersion": 1,
  "templates": {
    "home": {
      "html": "<div class=\"skin-shell\"><h1 data-imory-bind=\"site.title\"></h1><nav><ul><li data-imory-repeat=\"navigation.categories\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.name\"></a></li></ul></nav><ul data-imory-if=\"home.recentPosts\"><li data-imory-repeat=\"home.recentPosts\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.title\"></a></li></ul></div>"
    },
    "category": {
      "html": "<div class=\"skin-shell\"><h2 data-imory-bind=\"category.name\"></h2><ul><li data-imory-repeat=\"category.posts\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.title\"></a></li></ul></div>"
    },
    "post": {
      "html": "<div class=\"skin-shell\"><h1 data-imory-bind=\"post.title\"></h1><div data-imory-region=\"post-body\"></div></div>"
    }
  },
  "css": ".skin-shell { max-width: 720px; margin: 0 auto; font-family: system-ui, sans-serif; }",
  "imageSlots": [],
  "regions": [],
  "metadata": { "title": "Minimal Import Example", "generatedBy": "manual" }
}
```

이 JSON을 Studio Import 창에 그대로 붙여넣으면 통과합니다. `imageSlots`/`regions`/`metadata`는 생략(undefined)해도 각각 `[]`/`[]`/`{}`로 안전하게 채워집니다.

실제로 완성도 있는 3페이지 스킨 예시는 14절의 `imory-diary-v0.1.json` 전체가 바로 이 Import 기능을 그대로 통과하는 실물 예시입니다.

---

## 14. 기존 `imory-diary-v0.1.json` 전체 내용

근거: [skin/test-skins/imory-diary-v0.1.json](skin/test-skins/imory-diary-v0.1.json)

이 파일은 실제로 13절의 Import 검증을 통과하는(HOME/CATEGORY/POST 템플릿 + post-body region 포함) 리포지토리 내 실물 테스트 스킨입니다. 3절~10절에서 설명한 계약이 실제로 어떻게 조합되는지 확인할 수 있는 참고 자료로 그대로 인용합니다.

```json
{
  "schemaVersion": 1,
  "templates": {
    "home": {
      "html": "<div class=\"diary-shell\">\n    <aside class=\"diary-sidebar\">\n      <div class=\"diary-brand\">\n        <p class=\"diary-site-title\" data-imory-bind=\"site.title\"></p>\n      </div>\n      <div class=\"diary-profile\">\n        <img class=\"diary-avatar\" data-imory-src=\"profile.avatarUrl\" alt=\"프로필 이미지\">\n        <p class=\"diary-nickname\" data-imory-bind=\"profile.nickname\"></p>\n        <p class=\"diary-bio\" data-imory-if=\"profile.bio\" data-imory-bind=\"profile.bio\"></p>\n      </div>\n      <nav class=\"diary-nav\">\n        <a class=\"diary-home-link\" data-imory-if=\"navigation.home.enabled\" data-imory-href=\"navigation.home.href\">HOME</a>\n        <div class=\"diary-nav-section\">\n          <p class=\"diary-nav-label\">POSTS</p>\n          <ul class=\"diary-nav-list\"><li data-imory-repeat=\"navigation.postCategories\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.name\"></a></li></ul>\n        </div>\n        <div class=\"diary-banner-section\">\n          <p class=\"diary-nav-label\">LINKS</p>\n          <ul class=\"diary-banner-list\"><li data-imory-repeat=\"navigation.bannerCategories\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.name\"></a></li></ul>\n        </div>\n      </nav>\n    </aside>\n    <main class=\"diary-main\">\n      <section class=\"diary-hero\">\n        <p class=\"diary-greeting\">안녕하세요, 오늘의 이야기를 남깁니다.</p>\n      </section>\n      <section class=\"diary-post-list-section\">\n        <h2 class=\"diary-section-title\">최근 글</h2>\n        <ul class=\"diary-post-list\"><li class=\"diary-post-item\" data-imory-repeat=\"home.recentPosts\">\n            <a class=\"diary-post-link\" data-imory-href=\"item.href\">\n              <span class=\"diary-post-title\" data-imory-bind=\"item.title\"></span>\n              <span class=\"diary-post-secret\" data-imory-if=\"item.isSecret\">SECRET</span>\n              <span class=\"diary-post-date\" data-imory-bind=\"item.publishedAt\"></span>\n            </a>\n          </li></ul>\n      </section>\n    </main>\n  </div>"
    },
    "category": {
      "html": "<div class=\"diary-shell\">\n    <aside class=\"diary-sidebar\">\n      <div class=\"diary-brand\">\n        <p class=\"diary-site-title\" data-imory-bind=\"site.title\"></p>\n      </div>\n      <div class=\"diary-profile\">\n        <img class=\"diary-avatar\" data-imory-src=\"profile.avatarUrl\" alt=\"프로필 이미지\">\n        <p class=\"diary-nickname\" data-imory-bind=\"profile.nickname\"></p>\n        <p class=\"diary-bio\" data-imory-if=\"profile.bio\" data-imory-bind=\"profile.bio\"></p>\n      </div>\n      <nav class=\"diary-nav\">\n        <a class=\"diary-home-link\" data-imory-if=\"navigation.home.enabled\" data-imory-href=\"navigation.home.href\">HOME</a>\n        <div class=\"diary-nav-section\">\n          <p class=\"diary-nav-label\">POSTS</p>\n          <ul class=\"diary-nav-list\"><li data-imory-repeat=\"navigation.postCategories\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.name\"></a></li></ul>\n        </div>\n        <div class=\"diary-banner-section\">\n          <p class=\"diary-nav-label\">LINKS</p>\n          <ul class=\"diary-banner-list\"><li data-imory-repeat=\"navigation.bannerCategories\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.name\"></a></li></ul>\n        </div>\n      </nav>\n    </aside>\n    <main class=\"diary-main\">\n      <section class=\"diary-category-header\">\n        <h2 class=\"diary-section-title\" data-imory-bind=\"category.name\"></h2>\n      </section>\n      <ul class=\"diary-post-list\"><li class=\"diary-post-item\" data-imory-repeat=\"category.posts\">\n          <a class=\"diary-post-link\" data-imory-href=\"item.href\">\n            <span class=\"diary-post-title\" data-imory-bind=\"item.title\"></span>\n            <span class=\"diary-post-secret\" data-imory-if=\"item.isSecret\">SECRET</span>\n            <span class=\"diary-post-date\" data-imory-bind=\"item.publishedAt\"></span>\n          </a>\n        </li></ul>\n    </main>\n  </div>"
    },
    "post": {
      "html": "<div class=\"diary-shell\">\n    <aside class=\"diary-sidebar\">\n      <div class=\"diary-brand\">\n        <p class=\"diary-site-title\" data-imory-bind=\"site.title\"></p>\n      </div>\n      <div class=\"diary-profile\">\n        <img class=\"diary-avatar\" data-imory-src=\"profile.avatarUrl\" alt=\"프로필 이미지\">\n        <p class=\"diary-nickname\" data-imory-bind=\"profile.nickname\"></p>\n        <p class=\"diary-bio\" data-imory-if=\"profile.bio\" data-imory-bind=\"profile.bio\"></p>\n      </div>\n      <nav class=\"diary-nav\">\n        <a class=\"diary-home-link\" data-imory-if=\"navigation.home.enabled\" data-imory-href=\"navigation.home.href\">HOME</a>\n        <div class=\"diary-nav-section\">\n          <p class=\"diary-nav-label\">POSTS</p>\n          <ul class=\"diary-nav-list\"><li data-imory-repeat=\"navigation.postCategories\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.name\"></a></li></ul>\n        </div>\n        <div class=\"diary-banner-section\">\n          <p class=\"diary-nav-label\">LINKS</p>\n          <ul class=\"diary-banner-list\"><li data-imory-repeat=\"navigation.bannerCategories\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.name\"></a></li></ul>\n        </div>\n      </nav>\n    </aside>\n    <main class=\"diary-main\">\n      <nav class=\"diary-breadcrumb\" data-imory-if=\"post.categoryName\">\n        <a data-imory-href=\"post.categoryHref\" data-imory-bind=\"post.categoryName\"></a>\n      </nav>\n      <article class=\"diary-post-detail\">\n        <h1 class=\"diary-post-detail-title\" data-imory-bind=\"post.title\"></h1>\n        <p class=\"diary-post-detail-date\" data-imory-bind=\"post.publishedAt\"></p>\n        <div class=\"diary-post-body\" data-imory-region=\"post-body\">\n          <p class=\"skin-authored-placeholder\">본문이 여기 표시됩니다(미리보기용 placeholder — mount 시 제거되어야 함)</p>\n        </div>\n      </article>\n    </main>\n  </div>"
    }
  },
  "css": "\n.diary-shell { --diary-pink: #f6dbe4; --diary-pink-strong: #e39cb4; --diary-border: #e8e3e3;\n  --diary-text: #2b2b2b; --diary-muted: #8b8b8b; --diary-bg-side: #fdf7f9;\n  display: flex; align-items: flex-start; gap: 0; max-width: 1040px; margin: 0 auto;\n  background: #ffffff; color: var(--diary-text); font-family: \"Pretendard\", \"Apple SD Gothic Neo\", system-ui, sans-serif;\n  font-size: 15px; line-height: 1.6; box-sizing: border-box; }\n.diary-shell *, .diary-shell *::before, .diary-shell *::after { box-sizing: border-box; }\n.diary-sidebar { width: 240px; flex: 0 0 240px; border-right: 1px solid var(--diary-border);\n  background: var(--diary-bg-side); padding: 28px 20px; }\n.diary-brand { margin-bottom: 20px; }\n.diary-site-title { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }\n.diary-profile { padding-bottom: 20px; border-bottom: 1px solid var(--diary-border); margin-bottom: 20px; }\n.diary-avatar { width: 72px; height: 72px; border-radius: 4px; object-fit: cover; display: block;\n  background: var(--diary-pink); border: 1px solid var(--diary-border); margin-bottom: 10px; }\n.diary-nickname { margin: 0 0 6px; font-size: 15px; font-weight: 600; }\n.diary-bio { margin: 0; font-size: 13px; color: var(--diary-muted); word-break: keep-all; }\n.diary-home-link { display: block; margin-bottom: 18px; padding: 8px 10px; background: var(--diary-pink);\n  color: var(--diary-text); text-decoration: none; font-size: 13px; font-weight: 700; text-align: center; }\n.diary-nav-section, .diary-banner-section { margin-bottom: 18px; }\n.diary-nav-label { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.08em; color: var(--diary-muted); }\n.diary-nav-list, .diary-banner-list { list-style: none; margin: 0; padding: 0; }\n.diary-nav-list li, .diary-banner-list li { border-bottom: 1px solid var(--diary-border); }\n.diary-nav-list a, .diary-banner-list a { display: block; padding: 8px 2px; color: var(--diary-text);\n  text-decoration: none; font-size: 14px; }\n.diary-nav-list a:hover, .diary-banner-list a:hover { color: var(--diary-pink-strong); }\n.diary-main { flex: 1 1 auto; min-width: 0; padding: 32px 36px; }\n.diary-hero { margin-bottom: 24px; }\n.diary-greeting { margin: 0; font-size: 15px; color: var(--diary-muted); }\n.diary-section-title { margin: 0 0 16px; font-size: 17px; font-weight: 700; padding-bottom: 10px;\n  border-bottom: 2px solid var(--diary-pink); }\n.diary-category-header { margin-bottom: 8px; }\n.diary-post-list { list-style: none; margin: 0; padding: 0; }\n.diary-post-item { border-bottom: 1px solid var(--diary-border); }\n.diary-post-link { display: flex; align-items: baseline; gap: 8px; padding: 12px 4px; text-decoration: none;\n  color: var(--diary-text); flex-wrap: wrap; }\n.diary-post-title { font-size: 15px; font-weight: 600; word-break: keep-all; }\n.diary-post-link:hover .diary-post-title { color: var(--diary-pink-strong); }\n.diary-post-secret { font-size: 11px; font-weight: 700; color: var(--diary-pink-strong);\n  border: 1px solid var(--diary-pink-strong); padding: 1px 6px; }\n.diary-post-date { margin-left: auto; font-size: 12px; color: var(--diary-muted); white-space: nowrap; }\n.diary-post-list:empty::after { content: \"아직 작성된 글이 없습니다.\"; display: block; padding: 24px 4px;\n  color: var(--diary-muted); font-size: 13px; }\n.diary-breadcrumb { margin-bottom: 12px; }\n.diary-breadcrumb a { font-size: 13px; color: var(--diary-pink-strong); text-decoration: none;\n  border: 1px solid var(--diary-pink-strong); padding: 3px 10px; }\n.diary-post-detail-title { margin: 4px 0 8px; font-size: 22px; font-weight: 700; line-height: 1.4;\n  word-break: keep-all; overflow-wrap: break-word; }\n.diary-post-detail-date { margin: 0 0 24px; font-size: 12px; color: var(--diary-muted); }\n.diary-post-body { border-top: 1px solid var(--diary-border); padding-top: 20px; max-width: 100%; }\n\n@media (max-width: 720px) {\n  .diary-shell { flex-direction: column; }\n  .diary-sidebar { width: 100%; flex: 1 1 auto; border-right: none; border-bottom: 1px solid var(--diary-border); }\n  .diary-main { padding: 24px 18px; }\n  .diary-post-link { flex-direction: column; align-items: flex-start; gap: 2px; }\n  .diary-post-date { margin-left: 0; white-space: normal; overflow-wrap: anywhere; }\n}\n",
  "imageSlots": [
    {
      "name": "profile",
      "label": "프로필 사진",
      "required": false,
      "aspectRatioHint": "1:1"
    }
  ],
  "regions": [],
  "metadata": {
    "title": "Imory Diary v0.1",
    "generatedBy": "manual",
    "supports": {
      "home": true,
      "list": true,
      "post": true
    },
    "requiredContext": [
      "site.title",
      "profile.nickname",
      "profile.bio",
      "profile.avatarUrl",
      "navigation.home",
      "navigation.postCategories",
      "navigation.bannerCategories",
      "home.recentPosts",
      "category.name",
      "category.posts",
      "post.title",
      "post.publishedAt",
      "post.categoryName",
      "post.categoryHref"
    ]
  }
}
```

### 14-1. 이 예시에서 확인할 수 있는 실전 패턴

- `data-imory-if="navigation.home.enabled"` — boolean 필드도 `if`로 그대로 조건화 가능(항상 `true`지만 계약상 필드가 있으므로 방어적으로 감쌈).
- `data-imory-if="item.isSecret"` — repeat 내부 item의 boolean 필드로 "SECRET" 배지를 조건부 표시.
- `data-imory-if="post.categoryName"`으로 감싼 뒤에만 `post.categoryHref`를 bind — 6-3절/9절의 nullable 쌍 처리 정석 패턴.
- `.diary-post-list:empty::after { content: "아직 작성된 글이 없습니다."; }` — `data-imory-if`의 "else 없음" 한계(5절)를 CSS `:empty` 의사 클래스로 우회한 실전 트릭. `data-imory-repeat`이 빈 배열이면 리스트 엘리먼트 자체가 자식 없이 남으므로, 이 CSS가 실제로 동작합니다.
- `@media (max-width: 720px)` — Studio Mobile Preview(390px 고정, 11절)보다 넓은 값이지만, 유효한 CSS이므로 그대로 저장/렌더됩니다(플랫폼이 특정 breakpoint 값을 강제하지 않음, 11-3절).
