# PUBLIC-NUMBER-1 — 공개 URL 번호

공개 주소에 쓰는 번호를 DB 의 PK 와 분리한다. 블로그마다 1 부터
세는 번호를 따로 붙이고, `/:slug/category/:n` · `/:slug/post/:n` 의
`n` 은 그 번호다.

| 문서 | 내용 |
| --- | --- |
| [migration](./supabase/migrations/20260915100000_public_numbers_for_categories_and_posts.sql) | 컬럼 · 카운터 · 트리거 · backfill · rollback |
| [core/lib/public-number.js](./core/lib/public-number.js) | 번호 ↔ 내부 id 환전소(프런트의 유일한 지점) |
| [supabase/public-number-migration-test.mjs](./supabase/public-number-migration-test.mjs) | 실제 Postgres(PGlite)로 migration 실행 |
| [skin/skin-public-number-e2e-test.mjs](./skin/skin-public-number-e2e-test.mjs) | 번호와 id 를 **일부러 다르게** 준 공개 화면 e2e |

---

## 1. 무엇이 문제였나

공개 주소가 DB 전체에서 하나뿐인 PK 를 그대로 드러냈다.

```
/test1/category/7      <- categories.id
/test1/post/38         <- posts.id
```

두 가지가 따라온다.

1. 서비스 전체의 데이터 양이 주소에 새어 나간다.
2. 새로 가입한 사람의 **첫 글** 주소가 앞선 사용자들이 쓴 글 수에
   따라 `/post/312` 처럼 나온다.

---

## 2. 현재 구현

### 2-1. 컬럼

`categories.public_no` · `posts.public_no` — 둘 다 `bigint`,
`NOT NULL`, `(user_id, public_no)` UNIQUE.

이름을 `public_no` 로 정한 근거: 이 스키마는 snake_case 에 뜻이 그대로
드러나는 이름을 쓰고(`sort_order` · `page_size` · `secret_cover_mode` ·
`pagination_window_size`), 숫자 순번에는 짧은 접미사를 이미 쓴 전례가
있다(`posts.share_label_seq`). `public_id` 는 PK 인 `id` 와 한 글자
차이라 코드에서 눈으로 걸러지지 않으므로 피했다.

**내부 관계는 하나도 바뀌지 않는다.** `id` 는 PK 그대로고,
`posts.category_id` · `post_folders.category_id` ·
`post_highlights.post_id` · `post_gallery_images.post_id` ·
`post_contents.post_id` 는 전부 계속 `id` 를 가리킨다. sequence 를
건드리지 않고 기존 행의 `id` 를 한 개도 바꾸지 않는다.

### 2-2. 번호 발급 — 왜 `max + 1` 이 아닌가

`select max(public_no) + 1` 은 두 가지로 깨진다.

1. 두 요청이 같은 순간에 읽으면 같은 번호를 본다.
2. 맨 끝 글을 지우면 그 번호가 **다시 발급된다** — 이미 공유된 주소가
   다른 글을 연다.

그래서 사용자별·자원별 카운터 테이블을 둔다.

```sql
public.public_no_counters (user_id, resource, last_no)
```

발급은 한 문장이다.

```sql
insert into public.public_no_counters as c (user_id, resource, last_no)
values (new.user_id, v_resource, 1)
on conflict (user_id, resource) do update
   set last_no = c.last_no + 1
returning c.last_no into v_next;
```

이 문장이 카운터 행에 row lock 을 잡으므로 동시에 들어온 두 INSERT 는
자동으로 줄을 선다(읽기와 쓰기가 한 문장이라 그 사이에 끼어들 틈이
없다). 카운터는 올라가기만 하므로 **삭제된 번호는 재사용되지 않고,
기존 번호는 재정렬되지 않는다.**

`(user_id, public_no)` UNIQUE 인덱스가 최종 방어선이다 — 발급 경로가
뚫려도 DB 가 막는다.

### 2-3. 클라이언트는 번호를 정할 수 없다

- INSERT 로 들어온 `public_no` 는 트리거가 버리고 다시 발급한다.
- UPDATE 로 바꾸려 해도 트리거가 이전 값으로 되돌린다(불변).
- GRANT 는 SELECT 에만 준다(`posts` 는 컬럼 단위, `categories` 는
  테이블 단위라 자동 포함).
- 카운터 테이블에는 anon/authenticated 권한이 **전혀** 없고 RLS 가
  켜져 있으며 정책이 하나도 없다. 만지는 것은 SECURITY DEFINER 인
  `public.assign_public_no()` 하나뿐이고, 그 함수는 `search_path` 를
  `''` 로 고정하고 모든 이름을 스키마까지 적는다.

함수가 `auth.uid()` 를 다시 보지 않는 이유: RLS 가 이미 "자기
user_id 로만 INSERT" 를 강제하고 있고, 여기서 `auth.uid()` 를 요구하면
관리자 RPC·backfill·트리거 연쇄 INSERT 가 전부 막힌다. 함수가 검증하는
것은 `new.user_id` 가 있다는 것뿐이고(없으면 예외), 번호를 붙일 주인은
그 값이다.

### 2-4. backfill

사용자별로 `created_at` 오름차순, 동률이면 `id` 오름차순으로 1 부터.
이미 값이 있는 행은 건드리지 않고, 새로 매기는 번호는 그 사용자의
현재 최댓값 **다음**부터 시작한다 — 그래서 재실행해도 번호가 겹치지
않고 기존 번호가 재정렬되지도 않는다.

### 2-5. 프런트 — 환전소 하나

[core/lib/public-number.js](./core/lib/public-number.js) 가 번호와
내부 id 사이를 오가는 **유일한 지점**이다. 내부 id 를 주소 문자열에
직접 끼워 넣는 코드는 저장소에 남아 있지 않다.

표는 두 방향이고 안전 조건이 다르다.

| 방향 | 키 | 왜 |
| --- | --- | --- |
| `id -> public_no` | kind 별 | `id` 는 DB 전체에서 유일하다 |
| `public_no -> id` | kind × **주인** 별 | 번호는 블로그마다 1 부터 다시 센다 |

화면을 그리기 전에 우리는 거의 언제나 행을 이미 읽었다(목록·상세·
Skin Context 의 select 에 `public_no` 를 넣었다). 그래서 본 행을 표에
적어 두고, 주소를 만들 때는 표를 먼저 본다. 표에 없을 때만 DB 에 한 번
물어본다. 표가 낡을 걱정이 없는 이유는 `public_no` 가 불변이기
때문이다.

주요 함수:

```
rememberPublicNo / rememberPublicNoRows   읽은 행을 표에 적는다
publicRouteFromRow(kind, row)             행을 손에 들고 있을 때(동기)
publicRouteForKnownId(kind, id)           표에 있는 것이 확실할 때(동기)
publicCategoryRoute / publicPostRoute     id -> "/category/3"(비동기)
publicFolderRoute(categoryId, folderId)   "/category/3/folder/44"
publicNoToScreenId(kind, publicNo)        주소의 번호 -> 화면이 쓸 id
resolvePublicNoToIdForOwner(...)          주인을 명시로 받는 변형(Studio)
```

### 2-6. 없는 번호는 404 다

조회는 언제나 `(user_id, public_no)` 한 쌍으로만 한다. 이 블로그에 그
번호가 없으면 **다른 블로그의 같은 번호로 넘어가지 않고**
`PUBLIC_NO_MISSING_ID`(= 0)가 내려간다. identity 는 1 부터 시작하므로
id 가 0 인 행은 존재할 수 없고, 그래서 기존 화면의 "없는 글/없는
카테고리" 경로가 그대로 탄다 — 404 전용 화면을 새로 만들지 않았다.

### 2-7. 환전이 일어나는 경계

주소 → 화면(번호 → id)은 딱 세 곳이다.

| 경계 | 파일 |
| --- | --- |
| 공개 라우터 | [posts/editor/posts-router-init.js](./posts/editor/posts-router-init.js) `handlePostRoute()` |
| 스킨 링크의 유일한 출구 | [skin/skin-link-nav.js](./skin/skin-link-nav.js) `navigateToSkinRoute()` — sandbox 프레임의 이동도 여기로 온다 |
| Skin Studio Preview | [studio/preview/preview-navigation.js](./studio/preview/preview-navigation.js) `handlePreviewNavigateMessage()` |

`resolveInSiteSkinRoute()` / `resolveStudioPreviewTarget()` 은 주소만
보는 순수 함수라 DB 를 모른다 — 번호를 그대로 담아 돌려주고, 환전은
화면을 여는 쪽이 한 번에 한다.

화면 → 주소(id → 번호)는 href 를 만드는 모든 자리다. Skin Context 는
네 함수로 모았다(`skinCategoryHref` / `skinCategoryHrefById` /
`skinPostHref` / `skinPostHrefById`, [skin/skin-context.js](./skin/skin-context.js)).

### 2-8. 기존 주소가 어떻게 바뀌는가

| 전 | 후 |
| --- | --- |
| `/test1/category/7` | `/test1/category/1` |
| `/test1/post/38` | `/test1/post/1` |
| `/test1/category/7/folder/44` | `/test1/category/1/folder/44` |
| `/test1/highlights/category/7` | `/test1/highlights/category/1` |
| `/api/og/post?post=38&v=…` | `/api/og/post?slug=test1&post=1&v=…` |

**옛 global-id 주소의 임시 이중 조회는 넣지 않았다**(사용자 결정).
넣으면 새 번호와 충돌해 다른 글이 열린다 — `/test1/post/38` 은 이제
"이 블로그의 38 번 글"이고, 없으면 404 다.

`/api/og/post` 는 `slug` 가 필수가 됐다. 번호만으로는 주인을 거꾸로
찾을 수 없기 때문이다(예전에는 글 id 하나로 찾았다). 대신 주인을
찾던 왕복 하나가 없어졌다.

`/api/post-cover?post=<id>` 는 그대로 **내부 id** 를 받는다 — 화면
주소가 아니라 파일 프록시이고, 요청마다 공개 여부를 다시 본다.
`functions/api/og/post.js` 는 그래서 `context.postRowId`(내부 id)와
`context.postId`(공개 번호)를 나눠 들고 다닌다.

---

## 3. 앞으로 지켜야 할 원칙

- **주소에 내부 id 를 적지 않는다.** 새 링크를 만들 때는
  `publicRouteFromRow` / `publicCategoryRoute` 계열을 쓴다. 문자열
  템플릿으로 `` `/post/${post.id}` `` 라고 쓰는 순간 깨진다.
- **번호로 조회할 때는 언제나 주인과 함께.** `public_no` 단독 조회는
  다른 블로그의 행을 가져올 수 있다.
- **FK 는 계속 id 다.** `post_id` / `category_id` 가 이름에 들어간
  컬럼에 공개 번호를 넣지 않는다.
- 새 화면이 공개 주소를 가지면 §2-7 의 세 경계에 환전을 함께 넣는다.
- 새 select 가 href 의 근거가 되면 `public_no` 를 함께 읽고
  `rememberPublicNoRows()` 로 표에 적는다.

---

## 4. 남은 차이

1. **폴더 번호는 아직 내부 id 다.** `/:slug/category/:n/folder/:fid`
   의 `fid` 는 `post_folders.id` 그대로다. 이번 범위가 카테고리와
   글이어서 그렇고, 같은 방식(카운터 + 트리거 + `(user_id, public_no)`)
   을 그대로 적용할 수 있다.
2. **Skin Data Contract 의 `item.id` 는 아직 내부 id 다.**
   `category.posts[].id` · `navigation.categories[].id` 등이
   `String(row.id)` 다. 주소에는 쓰이지 않지만 스킨이 바인딩하면
   화면에 나올 수 있고, sandbox 프레임 payload 에도 그대로 간다.
   바꾸려면 기존 스킨의 계약이 바뀌므로 별도 라운드가 필요하다.
3. **`/api/post-cover?post=<id>` · `?image=<uuid>`** 는 내부 id 를
   드러낸다(§2-8). 페이지 주소가 아니라 자산 프록시라 이번 범위에
   넣지 않았다.
4. **unscoped 배포**(주소에 slug 가 없는 레거시 단일 사용자 배포)에는
   좁힐 주인이 없다. 그때는 좁히지 않고 읽되 두 행 이상이 걸리면
   "찾지 못한 것"으로 친다 — 아무거나 하나를 고르지 않는다.
5. **다른 e2e 의 mock 은 `public_no` 를 id 와 같은 값으로 준다.**
   각 파일이 원래 확인하던 주소를 유지하기 위해서다. 번호와 id 가
   다를 때의 동작은 `skin/skin-public-number-e2e-test.mjs` 가 본다.

---

## 5. 프로덕션 적용 순서

이 라운드는 **적용하지 않았다.** 적용할 때의 순서는 이렇다.

1. **migration 을 먼저** Supabase SQL Editor 에 붙여넣어 실행한다
   (`begin;` ~ `commit;` 포함). 컬럼이 추가되고 backfill 이 돌고
   NOT NULL + UNIQUE 가 걸린다.
2. **그 다음 프런트를 배포한다.** 순서를 뒤집으면 컬럼이 없는 DB 에
   새 프런트가 붙어 `public_no` 를 고른 select 가 전부 실패한다 —
   공개 화면의 링크가 전부 `/` 가 되고 라우터가 글을 못 찾는다.
   (반대로 1 만 끝난 상태는 안전하다: 옛 프런트는 이 컬럼을 모른다.)
3. `APP_BUILD_VERSION` 을 올린다([core/lib/build-version.js](./core/lib/build-version.js))
   — 새 JS 가 옛 캐시에 가리지 않게 하는 유일한 장치다.
4. 배포 뒤 확인: 공개 HOME 의 링크가 `/category/1` 로 시작하는가,
   글 하나를 새로 써서 다음 번호를 받는가, 지운 뒤 다시 써도 그
   번호가 재사용되지 않는가.

**주의**

- 이미 공유된 옛 주소(`/test1/post/38`)는 배포 순간부터 404 가 된다.
  테스트 단계라 영구 호환을 요구하지 않는다는 사용자 결정에 따른다.
- SNS 가 캐시하고 있는 옛 `og:image`(`?post=<id>` · slug 없음)는
  `slug` 가 없으므로 400 이 된다. 새 주소는 다음 크롤에서 받아간다.
- rollback 은 migration 파일 맨 아래 주석 블록에 있다. 되돌릴 때는
  **프런트를 먼저** 옛 배포로 되돌린 뒤 실행한다.
