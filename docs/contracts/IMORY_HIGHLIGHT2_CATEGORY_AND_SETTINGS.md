# HIGHLIGHT-2 — HIGHLIGHT 카테고리 · singleton 타입 · 설정 개편

이 문서는 **현재 구현**의 기준 문서다. HIGHLIGHT-1
([IMORY_HIGHLIGHT1_DESIGN.md](../archive/2026-09/IMORY_HIGHLIGHT1_DESIGN.md))이 만든 기능은
그대로이고, **이름과 카테고리 계약**이 여기서 바뀌었다.

---

## 0. 용어 (이 다섯 개를 섞지 않는다)

| 말 | 뜻 | 데이터 |
| --- | --- | --- |
| **Highlight** | 글을 읽다가 본문에서 고른 문장. 카드 한 장이 된다. | `post_highlights` 행 |
| **Highlight note** | 그 하이라이트에 붙이는 짧은 주석. | `post_highlights.note` |
| **Memo** | **아직 없다.** 나중에 사용자가 하이라이트와 무관하게 직접 쓰는 짧은 독립 글. | — |
| **Banner** | 링크 이미지 모음. 블로그당 하나. | `categories.type='banner'` + `banners` |
| **Guest** | **아직 없다.** 나중에 singleton 규칙을 그대로 재사용할 타입. | — |

이번 라운드에서 **수동 MEMO 기능은 만들지 않는다.** `memo` 라는 이름은
그 기능을 위해 비워 둔다 — 그래서 `categories.type` 의 CHECK 제약에도,
`core/lib/category-types.js` 의 목록에도 `memo` 와 `guest` 는 없다.

---

## 1. 카테고리 타입

| 타입 | 개수 | 의미 |
| --- | ---: | --- |
| `post` | 여러 개 | 일반 글 목록 |
| `gallery` | 여러 개 | 이미지형 글 목록 |
| `banner` | **1개** | 배너 모음 |
| `highlight` | **1개** | 본문에서 고른 하이라이트 카드 모음 |

"블로그당 하나"인 타입(**singleton**)의 목록은 두 곳에만 있다.

- 프런트: [`core/lib/category-types.js`](../../core/lib/category-types.js) 의
  `SINGLETON_CATEGORY_TYPES`
- DB: `categories_singleton_type_idx` 의 partial index predicate
  ([20260913160000](../../supabase/migrations/20260913160000_highlight_category_singleton_and_pagination.sql))

둘이 어긋나면 `supabase/highlight2-migration-test.mjs` 의 `[contract]` 절이
두 파일의 글자를 직접 비교해 깨진다.

`guest` 가 생기면 그 배열에 한 줄, 그리고 index 를 다시 만드는 후속
migration 한 줄이면 된다. **지금 없는 타입을 미리 허용하지 않는다** — 허용하는
순간 그 값을 가진 행이 기능보다 먼저 생긴다.

---

## 2. 이름 정리 — `memo` → `highlight`

HIGHLIGHT-1 은 이 기능을 "메모"라고 불렀다. 실제 수동 MEMO 기능과 충돌하므로
공식 계약을 전부 `highlight` 로 옮겼다.

| 무엇 | HIGHLIGHT-1 (레거시) | HIGHLIGHT-2 (공식) |
| --- | --- | --- |
| 정규 주소 | `/:slug/memos` | `/:slug/highlights` |
| page type | `memos` | `highlights` |
| page 플래그 | `page.isMemos` | `page.isHighlights` |
| template | `templates.memos` | `templates.highlights` |
| Context | `memos.*` | `highlights.*` |
| 내비게이션 | `navigation.memos` | `navigation.highlights` |
| 카드 도구 자리 | `data-imory-region="memo-tools"` | `data-imory-region="highlight-tools"` |
| 설정 테이블 | `memo_folder_settings` | `highlight_folder_settings` |
| 쓰기 RPC | `upsert_own_memo_folder_settings` | `upsert_own_highlight_folder_settings` |
| 커버 프록시 | `/api/post-cover?memo=<id>` | `/api/post-cover?highlight=<id>` |
| Context 빌더 | `buildMemosSkinContext` | `buildHighlightsSkinContext` |
| 화면 제목 기본값 | `MEMO` | `HIGHLIGHTS` |
| 설정 명칭 | 메모 폴더 | 하이라이트 폴더 |

### 2-1. 호환 alias — 무엇이 얼마나 살아 있는가

alias 는 전부 **같은 값을 가리킨다**. 두 이름을 모두 쓴 스킨에서도 화면이나
이벤트가 두 번 생기지 않는다.

| alias | 어떻게 살아 있는가 | 어디서 |
| --- | --- | --- |
| `/:slug/memos` | 라우터 정규식 하나가 두 갈래를 함께 받는다. 화면을 그리는 쪽이 주소를 canonical 로 정리한다(replaceState). | `posts/editor/posts-router-init.js` · `skin/skin-link-nav.js` · `posts/view/posts-view-highlights.js` |
| `templates.memos` | `resolveSkinHighlightsTemplate()` 이 `highlights` → `memos` 순으로 **하나만** 고른다. | `skin/skin-template.js` |
| `memos.*` Context | `highlights` 와 **같은 객체**를 두 키에 넣는다. | `skin/skin-context.js` |
| `navigation.memos` | 위와 같다(같은 객체). | `skin/skin-context.js` |
| `page.isMemos` | `page.isHighlights` 와 항상 같은 boolean. | `skin/skin-context.js` |
| `memo-tools` region | sanitizer 가 두 이름을 모두 허용하고, `collectHighlightToolRegions()` 가 둘을 합쳐 element 기준으로 한 번만 채운다. | `skin/skin-sanitize.js` · `posts/view/posts-view-highlight-card-tools.js` |
| `public.memo_folder_settings` | 읽기 전용 `security_invoker` view. | migration 20260913160000 |
| 옛 RPC 3개 | 새 함수를 부르는 wrapper. | 같은 migration |
| `?memo=<id>` | 프록시가 `?highlight=` 와 같은 뜻으로 받는다. | `functions/api/post-cover.js` |
| `viewer.canManageMemos` | `viewer.canManageHighlights` 와 같은 값. | `skin/skin-context.js` |

### 2-2. alias 를 언제 지울 수 있는가

- **주소 `/memos`** — 사용자가 공유한 링크에 남아 있을 수 있다. 지우려면
  "그 주소로 들어오는 요청이 30일간 0건"을 확인해야 한다. 그때까지는 유지.
- **`templates.memos` · `memos.*` Context · `memo-tools` region** — 그 이름으로
  저장된 published/draft 스킨이 **한 벌도 남지 않았을 때** 지운다. 확인 방법:
  `skins`/`skin_versions` 의 JSON 에 `"memos"` 문자열이 없는지 세어 본다.
- **`public.memo_folder_settings` view · 옛 RPC 3개 · `?memo=`** — CDN 의
  CSS/JS 캐시 수명(최대 4시간, [CLAUDE.md](../../CLAUDE.md) §4)이 지나면 기술적으로는
  안전하다. 다만 위 스킨 alias 와 함께 정리하는 편이 낫다 — 한 번에 한 후속
  migration 으로.
- **`site_settings.hide_memo_entry` 키** — 지우지 않는다. 이미 저장된 사용자
  설정이고, 키를 바꾸면 이 진입점을 껐던 사람의 설정이 조용히 풀린다.
  화면 문구만 "하이라이트 진입점 숨기기"로 바뀌었다.

---

## 3. 하이라이트와 노트

카드에 붙는 짧은 글은 **하이라이트 노트**다. 화면 문구도 그렇게 쓴다.

- "하이라이트에 노트 추가" / "노트 수정" / "노트 삭제"
- **노트 삭제**는 `post_highlights.note` 를 null 로 만든다. 카드는 남는다.
- **하이라이트 삭제**는 행을 지운다. 카드가 사라진다.

`post_highlights.note` 컬럼 이름은 그대로다(하위 호환).

폐기된 이전 설계(만들지 않는다): 여러 MEMO 카테고리 · `post_highlights.memo_category_id` ·
카드별 MEMO 카테고리 이동 · 미분류 MEMO · MEMO 카테고리별 폴더 설정 테이블.
하이라이트는 한 블로그의 **단일 HIGHLIGHT 카테고리**에 자동으로 전부 모인다.

---

## 4. HIGHLIGHT 카테고리

`categories.type = 'highlight'` 는 정식 카테고리 행이다. 사용자가 고칠 수
있는 것:

- 표시 이름 (`navigation.highlights.name` 과 화면 제목에 그대로 나온다)
- 카테고리 목록에서의 순서 (`sort_order`)
- 스킨에서의 디자인 (`templates.highlights`)
- 하이라이트 폴더 표시 순서 · 폴더별 커버/비율/구도
  (ADVANCED SETTINGS 의 HIGHLIGHT 패널)

### 4-1. 하나만 만들 수 있다

- `+ add category` 의 타입 드롭다운에서 `highlight` 가 **disabled** 가 된다
  (감추지 않는다 — 감추면 "왜 없지?"가 된다). `title` 로 이유를 붙이고,
  값이 바뀌면 저장 메시지 자리에도 같은 이유를 쓴다.
- 프런트 검증을 우회해도 DB 가 거절한다(23505) — `categories_singleton_type_idx`.
- 동시 요청 두 개 중 하나만 성공한다(unique index 가 하는 일이다).

### 4-2. 삭제해도 하이라이트는 남는다

`post_highlights` 는 `posts` 를 부모로 두고 있고, HIGHLIGHT 카테고리 행은
**표시·내비게이션 설정**일 뿐이다. 그 행을 지워도:

- 하이라이트·발췌문·노트가 그대로 남는다
- 나중에 HIGHLIGHT 카테고리를 다시 만들면 기존 카드가 다시 보인다
- 삭제 확인창에 이 동작을 적는다

### 4-3. 주소

정규 주소는 `/:slug/highlights` 하나다. 일반 카테고리 주소
(`/:slug/category/<id>`)로 들어와도 타입을 확인한 뒤 같은 화면을 열고 주소를
canonical 로 정리한다(`posts/view/posts-view-list.js` 의 `openCategoryPage`).

`navigation.categories` 안의 HIGHLIGHT 항목도 `href` 가 `/highlights` 다 —
그래야 플랫폼의 기본 진입점 칩이 "스킨이 이미 그렸다"를 알아본다(그 판정은
주소로만 한다, `skin/skin-highlight-entry.js`).

---

## 5. BANNER singleton 과 기존 중복 정리

BANNER 도 블로그당 하나다. 기존 DB 에 여러 개가 있을 수 있으므로,
partial unique index 를 만들기 **전에** migration 이 통합한다.

**대표 카테고리 선정 기준(결정적)**

```
sort_order ASC (null 은 뒤로)  →  created_at ASC  →  id ASC
```

`sort_order` 가 먼저인 이유: 사용자가 메뉴에서 위에 둔 것이 그 사람이 "진짜
배너"로 여기는 것이다. 같은 값이면 먼저 만든 것, 그래도 같으면 작은 id —
어떤 순서로 읽어도 같은 답이 나온다.

**절차**

1. BANNER 가 둘 이상인 사용자만 고른다(하나뿐인 사용자의 데이터는 건드리지 않는다)
2. 대표가 아닌 BANNER 에 **글이나 폴더가 남아 있으면 예외를 던지고 중단한다**
   (categories 를 지우면 cascade 로 함께 사라질 수 있다 — 그것은 조용한 삭제다)
3. `banners` 행을 대표로 옮기면서 상대 순서를 보존해 `sort_order` 를 1..n 재정렬
   (대표의 항목이 먼저, 그 뒤에 밀려난 카테고리 순서대로)
4. 이제 비어 있는 중복 category 행만 삭제
5. 전후 `banners` 개수를 비교해 다르면 예외 → 전체 rollback
6. 전 과정이 하나의 트랜잭션이다

**실측**: 프로덕션(imory.me)에는 BANNER 카테고리가 **1개**뿐이다(2026-09-13,
anon key 로 `categories?type=eq.banner` 조회). 이 배포에서 통합 블록은
아무것도 하지 않는다. 알고리즘은 PGlite 로 중복 3개 상황을 만들어 검증했다
(`[merge]` / `[blocked]` 절).

---

## 6. singleton DB 제약

```sql
create unique index categories_singleton_type_idx
  on public.categories (user_id, type)
  where type in ('banner', 'highlight');
```

- 생성·타입 변경 어느 경로로 와도 두 번째는 23505 로 거절된다
- 동시 요청 두 개가 들어와도 하나만 성공한다 (unique index 의 본래 성질)
- `change_own_category_type` RPC 도 `for update` 로 행을 잠그고 다시 검사한다
- 프런트의 disabled option 은 **안내일 뿐**이다

---

## 7. Settings 구조

### CATEGORIES (기본 관리만)

이름 변경 · 타입 변경 · 순서 ↑↓ · 삭제 · 추가.
타입 드롭다운: `post` / `gallery` / `banner` / `highlight`. `memo` 는 없다.

### ADVANCED SETTINGS

CATEGORIES 아래의 독립 영역([`admin/settings/admin-settings-advanced.js`](../../admin/settings/admin-settings-advanced.js)).
맨 위 드롭다운이 카테고리를 이름 + 타입으로 보여 준다(`TXT · 글`, `IMG · 갤러리`,
`BANNER · 배너`, `HIGHLIGHTS · 하이라이트`). 하나를 고르면 **그 타입에 필요한
설정만** 아래에 나온다.

저장 버튼은 CATEGORIES 와 공유한다 — 두 영역이 같은 `categories` 배열의 같은
객체를 고치므로, 저장을 나누면 "이름은 저장됐는데 페이지 설정은 아직"이라는
반쪽 상태가 생긴다.

**타입별 패널**

| 타입 | 내용 |
| --- | --- |
| `post` | 한 페이지당 글 개수 · 페이지 번호 표기 · 한 번에 보여 줄 번호 개수 (+ 미리보기) |
| `gallery` | 위와 같음 + 비밀글 커버 방식 · 지정 커버 이미지 |
| `highlight` | 원문 카테고리별 하이라이트 폴더 차례 · 폴더별 커버 · 비율 · 가로/세로 구도 |
| `banner` | `추가 설정 없음` |

---

## 8. UI 상태와 접근성

- **draft 가 사라지지 않는다** — 값은 `categories` 배열에 남는다. 고급 설정에서
  카테고리를 바꿔도 이 영역은 그 객체를 다시 읽어 그릴 뿐이다.
- **삭제된 카테고리는 즉시 목록에서 빠진다** — `renderCategories()` 가 목록을
  다시 만든다.
- **아직 DB id 가 없는 새 카테고리는 고급 설정을 잠근다** — 폴더 설정과 커버
  업로드가 category id 를 키로 쓴다. 이유를 화면에 적는다.
- **singleton option 은 이미 쓰고 있으면 disabled** + `title` 로 이유.
- **저장 중 중복 제출 방지** — 저장 버튼이 disabled 된다.
- **부분 실패를 정확히 알린다** — 카테고리 행은 저장됐는데 폴더 설정 저장이
  실패하면 그 사실을 그대로 쓴다(성공으로 표시하지 않는다).
- `<label>` 로 감싼 컨트롤 · `aria-label` · `focus-visible` 아웃라인 ·
  모바일 390px 가로 넘침 0 (`admin/admin-settings.css`).

---

## 9. 페이지네이션 공용 계약

post 와 gallery 가 **같은 계산기**를 쓴다.

**카테고리별 저장값** (`categories`)

| 컬럼 | 값 |
| --- | --- |
| `page_size` | 1..100 (기본 12) |
| `pagination_style` | `decimal` \| `roman_lower` (기본 decimal) |
| `pagination_window_size` | 1..25 (기본 **7**) |

**Skin Context** (`category.pagination`) — 스킨은 로마 숫자를 계산하지 않는다.

```
category.pagination.pages[]            창이 적용된 번호 (item.number/label/href/isCurrent)
category.pagination.allPages[]         전체 번호 (창을 쓰지 않는 스킨용)
category.pagination.style              "decimal" | "roman_lower"
category.pagination.isDecimal / isRomanLower
category.pagination.windowSize
category.pagination.hasLeadingEllipsis / hasTrailingEllipsis
category.pagination.prevHref / nextHref / firstHref / lastHref
category.pagination.currentPage / currentPageLabel
category.pagination.totalPages / totalPagesLabel / totalCount / pageSize
category.pagination.hasPages / hasPrev / hasNext
```

그리고 `category.paginationStyle` · `category.paginationWindowSize` ·
`category.hasPagination` 은 설정값 그대로다(`listStyle`/`pageSize` 와 같은 결).

**언제 켜지는가** — 렌더 중인 스킨의 CATEGORY template 이 `category.pagination`
을 **실제로 그릴 때만**이다(`skinTemplateUsesPagination()`). 갤러리 때와 같은
이유다: 페이지를 나누면 `category.posts` 가 "그 페이지의 글"이 되므로, 페이지
링크를 그리지 않는 기존 스킨이 아무것도 바꾸지 않았는데 목록이 잘려 보이고
나머지 글로 갈 방법이 사라진다.

**DB 조회** — `fetchSkinCategoryRootPostsPage()` 가 PostgREST Range +
`count=exact` 로 그 페이지의 행만 가져온다. 전체를 받아 CSS 로 숨기지 않는다.
범위 밖 페이지는 PGRST103 을 받아 마지막 페이지로 맞춘다(글이 줄어 마지막
페이지가 사라진 경우 포함).

---

## 10. 타입 변경 안전성

### post/gallery → highlight 또는 banner

1. **singleton 충돌을 먼저 본다** — 이미 그 타입이 있으면 목적지 선택 단계로
   들어가지 않고 바로 거절한다.
2. 원본에 글이나 폴더가 있으면 **옮길 목적지를 반드시 고르게 한다.** 목적지
   조건: 현재 사용자 소유 · 원본과 다름 · `post` 또는 `gallery` · 이번 저장에서
   삭제 예정이 아님. Escape / 취소 / 바깥 클릭은 전부 "바꾸지 않음"이다.
3. 저장할 때 `change_own_category_type(p_category_id, p_type, p_destination_category_id)`
   가 **한 트랜잭션**으로:
   폴더 이동 → 글 이동 → 타입 변경. 실패하면 전부 rollback.
   폴더의 `parent_id`/`depth` 와 글의 `folder_id` 는 건드리지 않으므로 구조가
   그대로 따라간다.

### banner → 다른 타입

배너 항목이 남아 있으면 **거절한다.** 옮길 다른 BANNER 는 singleton 규칙상
존재할 수 없고, 남겨 두면 어느 화면에도 나오지 않는 고립 데이터가 된다.
"먼저 비우라"가 유일하게 안전한 답이다.

### highlight → 다른 타입

`post_highlights` 는 손대지 않는다. HIGHLIGHT 카테고리 행은 하이라이트
데이터의 부모가 아니다.

### 어떤 변경이 RPC 를 거치는가

`post ↔ gallery` 는 옮길 데이터도 singleton 제약도 없다 — 지금까지처럼 평범한
`categories.update` 다. 그래야 이 migration 이 아직 적용되지 않은 배포에서도
그 변경이 계속 동작한다. RPC 는 **singleton 타입으로 들어가거나 나올 때만**
쓴다(`categoryTypeChangeNeedsRpc()`).

---

## 11. 라우트와 Skin 계약

**정규 주소**

```
/:slug/highlights
/:slug/highlights?view=folders
/:slug/highlights/category/:sourceCategoryId     (id 는 숫자 또는 "none")
```

**호환 주소** — 같은 화면을 열고, 새로 만드는 링크는 전부 정규 주소다.

```
/:slug/memos
/:slug/memos?view=folders
/:slug/memos/category/:sourceCategoryId
```

**Skin 계약**

```
page.type = "highlights"        page.isHighlights   (alias: page.isMemos)
templates.highlights            (alias: templates.memos)
navigation.highlights           (alias: navigation.memos)
highlights.cards / .folders / .view / .folder / .count / .isEmpty /
  .showCards / .hasFolders / .foldersEmpty / .hasError / .canManage /
  .allHref / .foldersHref / .allLabel / .foldersLabel
data-imory-region="highlight-tools"    (alias: "memo-tools")
```

**렌더 우선순위**

1. `templates.highlights`
2. `templates.memos` (레거시)
3. 플랫폼 기본 template (`getDefaultHighlightsTemplate()`)

**중복 렌더 방지** — `navigation.categories` 에 실제 HIGHLIGHT 카테고리가 한 번
들어가고 그 `href` 도 `/highlights` 다. 플랫폼의 기본 진입점 칩은 "화면에 그
주소를 가리키는 `<a>` 가 하나도 없을 때"만 나온다. 즉 **플랫폼이 자동으로 두
번 그리는 경로는 없다.** 스킨이 `navigation.categories` 와
`navigation.highlights` 를 모두 돌려 그리면 그건 스킨이 스스로 두 개를 그린
것이다.

Skin import / export / normalize / sanitize / AI schema / Studio Preview 모두
`highlights` 를 정식 지원한다. AI 에게는 **highlights 한 이름만** 보여 준다 —
옛 이름으로 저장된 스킨도 `normalizeSkinAiInputPackage()` 가 highlights 로
바꿔 보여 주고, 결과를 Import 경로가 highlights 로 저장한다(옛 키는 사라진다).

---

## 12. DB 명칭 처리 — 무엇을 했고 왜인가

**적용 여부 실측** (2026-09-13, anon key 로 프로덕션 REST 조회)

- `post_highlights` — 존재하고 **행이 있다**
- `memo_folder_settings` — 존재(비어 있음)
- `posts.updated_at` SELECT 권한 — 열려 있음
- ⇒ `20260913100000` 과 `20260913110000` 은 **프로덕션에 적용되어 있다**
  (메모리에 남아 있던 "미적용"은 낡은 기록이었다)

**rename 을 고른 이유**

담고 있는 데이터의 의미가 하나도 바뀌지 않았다 — "하이라이트 화면에서 이
원본 카테고리를 몇 번째로, 어떤 커버로 그릴까" 그대로다. 새 테이블 + 복사는
같은 뜻의 행을 두 곳에 두는 것이고, 그 순간부터 어느 쪽이 진짜인지 정하는
코드가 필요해진다. `alter table ... rename to` 는 행/PK/RLS/GRANT/인덱스를
그대로 들고 이름만 바꾼다.

**그런데도 옛 이름을 남긴 이유**

CSS/JS 는 CDN 에서 최대 4시간 캐시된다([CLAUDE.md](../../CLAUDE.md) §4). migration
적용 직후에도 브라우저는 `from("memo_folder_settings")` 를 부르는 예전 번들을
들고 있을 수 있다. 그래서 옛 이름을 **읽기 전용 `security_invoker` view** 로
남기고(밑에 있는 것은 같은 테이블 하나, RLS 도 그 테이블 정책 그대로),
쓰기 RPC 3개는 새 함수를 부르는 wrapper 로 바꿨다.

**함수는 반드시 다시 만들었다** — plpgsql 본문은 텍스트로 저장돼 호출 시점에
파싱된다. 테이블만 rename 하면 `upsert_own_memo_folder_settings` 는 다음
호출에서 "relation does not exist" 로 깨진다.

**파일 경로는 그대로다** — 하이라이트 폴더 커버의 Storage object key 는
HIGHLIGHT-1 때의 규칙을 유지한다. 이름을 바꾸면 이미 올라간 파일이 고아가 된다.

---

## 13. 남은 차이 / 만들지 않은 것

- **수동 MEMO 기능** — 이번 라운드에서 만들지 않는다. `memo` 이름은 비어 있다.
- **`guest` 타입** — singleton 규칙은 그대로 재사용할 수 있게 설계했지만 지금
  허용하지 않는다.
- **하이라이트 화면의 페이지네이션** — 하이라이트 카드 목록은 아직 페이지를
  나누지 않는다(요구사항 9는 post/gallery 만 말한다). 카드가 아주 많아지면
  같은 계산기를 붙일 수 있다.
- **`categories` 의 CREATE TABLE** — 여전히 저장소에 없다(Supabase 콘솔에서
  만들어졌다). 그래서 제약을 고칠 때마다 카탈로그를 직접 읽어 이름을 찾는다.
- **admin/index.html 의 일부 `<script src>`** — `core/lib/*.js` 몇 개가 아직
  `?v=` 없이 고정 URL 로 실린다(HIGHLIGHT-2 이전부터). 이번에 추가한
  `category-types.js` 는 `?v=` 가 붙는 `adminDependencyScripts` 쪽에 넣었다.

---

## 14. 테스트

| 파일 | 무엇 |
| --- | --- |
| [`supabase/highlight2-migration-test.mjs`](../../supabase/highlight2-migration-test.mjs) | **실제 Postgres(PGlite)** 로 migration 실행. `[type]` `[singleton]` `[pagination]` `[rename]` `[merge]` `[blocked]` `[retype]` `[contract]` |
| `admin/admin-settings-e2e-test.mjs` | `--only=category` 타입 드롭다운 · `--only=singleton` disabled/우회 · `--only=advanced` 타입별 패널·draft 유지·모바일 390px · `--only=memofolder` 폴더 차례 |
| `posts/posts-highlight-e2e-test.mjs` | `--only=legacy` 옛 주소 ↔ 새 주소가 같은 데이터·중복 렌더 없음 · `--only=entry` 진입점 칩과 스킨 링크(두 이름 모두) |
| `studio/studio-highlight-preview-e2e-test.mjs` | Preview 카드 도구 + 옛 이름(`memos.cards`/`memo-tools`) 스킨 회귀 |
| `skin/skin-folder-tree-e2e-test.mjs` · `skin/skin-published-frame-e2e-test.mjs` · `studio/studio-file-ux-e2e-test.mjs` | 회귀 |
