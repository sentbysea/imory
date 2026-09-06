# PHASE 1D-A — Skin List Data Contract Audit

티스토리형 감성 스킨의 글 목록(HOME `recentPosts` / CATEGORY `posts`)
디자인을 위해 사용 가능한 데이터 재료를 조사하고, 안전하게 확장
가능한 필드와 보류해야 할 필드를 분류한 감사 문서다.

관련: [AI_SKIN_PHASE1C_PAGE_CONTRACT.md](AI_SKIN_PHASE1C_PAGE_CONTRACT.md)
(Multi-page Skin Contract v0.1 — 5-4절에 `category.posts`가
`categoryName`을 item마다 반복하지 않는 이유가 이미 기록돼 있고,
이번 감사는 그 원칙을 그대로 계승한다).

---

## 1. 현재 HOME/CATEGORY 목록 data flow

```
buildHomeSkinContext(ownerId)
  └─ fetchSkinRecentPosts(ownerId)
       select: id, title, created_at, visibility, category_id
       from public.posts where user_id = ownerId
       order by created_at desc limit 5
  └─ home.recentPosts[] 매핑 (skin-context.js)

buildCategorySkinContext(ownerId, categoryId)
  └─ fetchSkinCategoryById(ownerId, categoryId)
       select: id, name, type
  └─ fetchSkinCategoryPosts(ownerId, categoryId)
       select: id, title, created_at, visibility
       from public.posts where user_id = ownerId and category_id = categoryId
       order by created_at desc
  └─ category.posts[] 매핑 (skin-context.js)
```

두 경로 모두 [skin-context.js](skin/skin-context.js)가 유일한 진입점이고,
DB row를 그대로 넘기지 않는다 — 항상 명시적 매핑을 거친다.

레거시(비-Skin) 목록도 동일한 select 컬럼을 쓴다
([posts-view-list.js](posts/view/posts-view-list.js)의
`fetchCategoryPageData()` — `id, title, created_at, visibility`).
즉 이번 조사는 "Skin만 컬럼이 부족한 상태"가 아니라 "레거시 목록도
원래 이 컬럼만 갖고 있었다"는 것을 확인했다 — Skin이 새로 도입한
제약이 아니다.

### posts 테이블 anon/authenticated column-level GRANT

[20260902110000_lock_down_posts_secret_password_hash.sql](supabase/migrations/20260902110000_lock_down_posts_secret_password_hash.sql)
기준 SELECT 허용 컬럼은 다음이 전부다:

```
id, user_id, category_id, title, content_type, visibility, created_at, quote_preset_id
```

`secret_password_hash`, 본문(`content`/`ooc_content`, 별도 테이블
`post_contents`)은 애초에 GRANT되지 않는다. 이 목록 밖의 필드는
Skin Context는 물론 어떤 클라이언트 코드도 anon/authenticated로
읽을 수 없다.

### 작성일(publishedAt)의 실제 원본

HOME/CATEGORY 모두 `posts.created_at`(단일 원본)에서 온다.
`published_at` 컬럼은 DB에 존재하지 않는다(테이블 자체가 최초
CREATE TABLE 마이그레이션이 저장소에 없어 대시보드에서 직접
생성된 것으로 추정 — `ToDo.md` 27번 모듈에 이미 기록된 기술부채).
formatter도 하나로 통일돼 있다 — 레거시는
`formatPostListDate()`([posts-format.js](posts/posts-format.js)),
Skin은 원본 ISO 문자열을 그대로 넘기고 Skin(html/css)이 표시
방식을 결정한다(PHASE1C 6절 원칙 그대로).

### 비밀글 노출 규칙 (RLS)

`posts`의 행 단위 RLS 정책 자체는 마이그레이션 파일로 저장소에
없다(대시보드에서 직접 생성 — `ToDo.md` 26번 모듈에 이미 `[?]`로
기록된 기존 미해결 항목, 이번 Slice가 새로 발견한 문제가 아니다).
다만 `20260902110000_*.sql` 주석과 기존 레거시 동작(익명 방문자도
비밀글 제목을 목록에서 보고 클릭해 비밀번호 입력 화면으로 갈 수
있음)으로 미루어, 정책은 "공개(public)/비밀(secret)글은 목록에
전체 노출, 비공개(private)글은 소유자만"으로 이미 운영 중이다.
Skin Context는 이 기존 RLS 경계를 그대로 신뢰하고(레거시와 동일한
select 범위), 새로운 컬럼이나 RPC를 추가하지 않았으므로 이번
Slice가 RLS 노출 범위를 넓히지 않는다.

---

## 2. 필드별 A/B/C/D 판정표

| 필드 | 판정 | 근거 / 처리 |
|---|---|---|
| `id` | A | 기존 제공. 변경 없음. |
| `title` | A | 기존 제공(`maskSkinPostTitle()`으로 이미 마스킹). 변경 없음. |
| `href` | A | 기존 제공. 변경 없음. |
| `publishedAt` | A | 기존 제공, `created_at` 단일 원본 확인. 변경 없음. |
| `categoryId` | A(HOME) / 해당 없음(CATEGORY) | HOME은 여러 카테고리가 섞이므로 item마다 실제 값이 다르다 — `posts.category_id`가 이미 select되어 있어 추가 조회 없이 채움(이번 Slice에서 구현). CATEGORY는 목록 전체가 이미 한 카테고리로 스코프돼 있어 `category.id`(상위 필드)와 매 item이 항상 같은 값 — item마다 반복하면 PHASE1C 5-4절이 이미 명시한 "불필요한 필드 반복 금지" 원칙 위반이라 추가하지 않음. |
| `categoryName` | A(HOME, 기존) / 해당 없음(CATEGORY) | HOME은 이미 제공 중(변경 없음). CATEGORY는 `categoryId`와 동일한 이유로 상위 `category.name`이 이미 있어 추가하지 않음(PHASE1C 5-4절). |
| `visibility`(원본) | D | 원본 enum은 어떤 page.type에도 노출하지 않는다 — 기존 PHASE1C 5-3/6-1절 결정을 그대로 계승. `private` 여부 등 세분화된 상태를 스킨에 알릴 이유가 없고, 이미 title 마스킹이 표시를 대신한다. |
| `isSecret` | A | `posts.visibility`는 이미 select되어 있다 — `visibility === "secret"`로 파생만 하면 되므로 새 컬럼/RPC 없이 안전하게 제공 가능(이번 Slice에서 구현, HOME/CATEGORY 둘 다). `secret_password_hash`나 비밀번호 관련 상태는 절대 포함하지 않는다. |
| `excerpt` | C | 안전한 전용 source(별도 컬럼 등)가 DB에 없다. 본문(`post_contents.content`)에서 자동 생성하는 방식은 이번 요청에서 명시적으로 금지됐고, 특히 비밀글 본문을 읽어야 하는 문제가 생겨 보안 원칙과 직접 충돌한다. **구현 보류** — 향후 별도 `excerpt`(또는 요약) 컬럼을 만들고 작성 시점에 사용자가 명시적으로 입력하게 하는 방식을 제안(13절 참고). |
| `thumbnail` | C | 대표 이미지 source가 DB에 전혀 없다(컬럼 없음, storage 규칙 없음). 본문 첫 이미지를 파싱하는 방식은 이번 요청에서 명시적으로 금지됐다(콘텐츠 파싱 규칙 신설 필요+ 비밀글 본문 접근 문제 동일 발생). **구현 보류** — 향후 `posts.thumbnail_url` 컬럼 + 업로드 UI, 또는 명시적 "대표 이미지 지정" 기능을 제안. |
| `isNotice` | C | "공지" 개념 자체가 DB/코드 어디에도 없다(컬럼도, RPC도, 에디터 UI도 없음). **구현 보류** — 향후 `posts.is_notice boolean default false` 컬럼 + 정렬 규칙(공지 우선 정렬) 설계가 필요. |
| `hasImage` | C | `thumbnail`과 동일한 이유로 source가 없다. 본문 안에 `<img>`가 있는지를 확인하려면 본문 파싱이 필요한데(추가로 비밀글은 본문 자체를 읽을 수 없음), 이번 요청이 금지한 "본문 HTML 파싱"에 해당한다. **구현 보류** — `thumbnail`이 먼저 해결되면(대표 이미지가 명시적으로 존재하는 컬럼이 생기면) `hasImage = Boolean(thumbnail)`로 파생 가능해진다. |

---

## 3. 확정한 공통 item shape (이번 Slice 반영 후)

```
home.recentPosts[] = {
  id: string,
  title: string,           // 마스킹 완료(🔒/🙈 아이콘 포함), 변경 없음
  href: string,             // 변경 없음
  publishedAt: string,      // ISO, posts.created_at, 변경 없음
  categoryId: string | null,   // 신규 — posts.category_id
  categoryName: string | null, // 기존 유지
  isSecret: boolean            // 신규 — posts.visibility === "secret"
}

category.posts[] = {
  id: string,
  title: string,           // 변경 없음
  href: string,             // 변경 없음
  publishedAt: string,      // 변경 없음
  isSecret: boolean          // 신규
}
```

`id`/`title`/`href`/`publishedAt`은 두 목록에서 완전히 동일한 의미로
쓰이고 필드명도 같다(3절 계약 원칙 충족). `categoryId`/`categoryName`은
CATEGORY에서 상위 `category.id`/`category.name`과 항상 같은 값이라
item에 중복하지 않는다 — 이 비대칭은 새로운 결정이 아니라 PHASE1C
5-4절에서 `categoryName`에 대해 이미 내려진 결정을 `categoryId`에도
동일하게 적용한 것이다.

---

## 4. 이번 Slice에서 구현한 필드

- `home.recentPosts[].categoryId` — [skin-context.js](skin/skin-context.js)
  `buildHomeSkinContext()`, 이미 select된 `post.category_id`를 문자열로
  변환(다른 id 필드와 동일한 관례).
- `home.recentPosts[].isSecret` — 같은 함수, `post.visibility === "secret"`.
- `category.posts[].isSecret` — `buildCategorySkinContext()`, 같은 파생 규칙.

세 필드 모두 마이그레이션/새 컬럼/새 RPC/RLS 변경/GRANT 확대가
전혀 필요 없다 — 이미 select하고 있던 컬럼에서 파생됐다. 기존
`id`/`title`/`href`/`publishedAt`/`categoryName` 필드는 값과 순서
모두 그대로 유지된다.

## 5. 보류한 필드와 이유

`excerpt`/`thumbnail`/`isNotice`/`hasImage` 4개 — 2절 표에 정리된
대로 전부 C(현재 DB에 안전한 source 없음)로 판정했고, 이번 요청
4절이 명시적으로 금지한 "DB 변경 없이 임의 구현"에 해당하는 경로
(본문 파싱, 컬럼 추측)를 타지 않고서는 만들 수 없어 구현하지
않았다. 미래 작업 제안:

1. **excerpt**: 글 작성/수정 시 사용자가 직접 입력하는 짧은 요약
   컬럼(`posts.excerpt text null`)을 신설 — 본문 자동 요약은 비밀글
   본문 접근 문제 때문에 애초에 채택 불가.
2. **thumbnail/hasImage**: 대표 이미지를 사용자가 명시적으로 지정하는
   컬럼(`posts.thumbnail_url text null`) + 업로드 UI 신설. 이후
   `hasImage`는 `Boolean(thumbnail)`로 별도 컬럼 없이 파생 가능.
3. **isNotice**: `posts.is_notice boolean not null default false` 컬럼 +
   에디터에 토글 UI + 목록 정렬 규칙(공지 우선) 설계 필요.

세 제안 모두 이번 Slice 범위 밖이며 구현하지 않았다.

## 6. 비밀글 보안 결과

- `content`/`ooc_content`/`secret_password_hash`는 이번 Slice 전후
  어디에서도 select되지 않는다(1절 select 컬럼 목록 그대로).
- 새로 추가한 `isSecret`은 이미 select 중이던 `visibility` 값에서만
  파생되고, 비밀번호 해시나 비밀번호 상태를 전혀 참조하지 않는다.
- `isSecret`은 `visibility === "secret"`일 때만 `true`다 — `private`
  글은 `isSecret === false`로 남는다(자물쇠 아이콘은 원래 `secret`
  전용이므로 기존 마스킹 규칙과 정확히 일치, [posts-format.js](posts/posts-format.js)
  `applyPostVisibilityTitle()`과 동일 원칙).
- [skin/skin-page-context-test.html](skin/skin-page-context-test.html)에
  `secret_password_hash`/`content`/`ooc_content`/원본 `visibility`가
  output에 전혀 없음을 확인하는 기존 assertion이 여전히 통과함을
  재검증했다(테스트 결과는 8절 참고).

## 7. 변경 파일

- [skin/skin-context.js](skin/skin-context.js) — `buildHomeSkinContext()`에
  `categoryId`/`isSecret` 추가, `buildCategorySkinContext()`에 `isSecret`
  추가. 파일 상단 주석에 이번 Slice 이력 기록.
- [skin/skin-page-context-test.html](skin/skin-page-context-test.html) —
  신규 필드에 대한 assertion 추가, 기존 "정확히 N개 키" assertion을
  새 키 개수에 맞게 갱신.
- 이 문서(`AI_SKIN_PHASE1D_A_LIST_DATA_AUDIT.md`) 신규 작성.

`skin/skin-generator.js`, `Concept.md`는 수정하지 않았다(9절/요청
원칙 — Generator 디자인 변경 없음, Concept.md 불가침).

## 8. 테스트 및 회귀 결과

[skin/skin-page-context-test.html](skin/skin-page-context-test.html)을
로컬 정적 서버(포트 8934, 기존 테스트 하네스 관례) + Playwright
headless Chromium으로 실행:

```
SUMMARY: 40 passed, 0 failed
```

포함된 검증(신규 8건 + 기존 32건 전부 통과):

- HOME item에 `categoryId`(string|null)/`isSecret`(boolean) 타입 정확
- HOME: secret 글(`isSecret===true`, `categoryId==="1"`) / private 글
  (`isSecret===false`) / public 글(`isSecret===false`) / 카테고리 없는
  글(`categoryId===null`) 각각 정확
- CATEGORY item이 정확히 5개 키(`id/title/href/publishedAt/isSecret`)만
  가짐 — 새 필드가 의도치 않게 늘어나지 않았는지 확인
- CATEGORY: secret/private/public 글의 `isSecret` 값 각각 정확
- 기존 `title`/`href`/`publishedAt`/`categoryName` 값과 마스킹 규칙
  회귀 없음(page.type 3종, buildSkinContext 하위 호환, category/post
  not-found 처리, 다른 owner 스코프 차단 등 기존 32개 assertion 그대로
  통과)
- `skin-generator.js`가 만드는 템플릿은 `item.href`/`item.title`/
  `item.publishedAt`만 참조해 이번 변경과 무관 — Generator/템플릿
  회귀 없음(코드 확인)
- Studio Code Editor(`studio-preview.js`/`preview-navigation.js`)는
  `recentPosts`/`category.posts`의 특정 키 목록을 하드코딩하지 않음을
  확인 — multipage/navigation/lifecycle/Code Editor 회귀 없음(코드
  확인, 별도 UI 스모크는 이번 Slice가 순수 데이터 계층만 바꿔 생략)

## 9. Git commit/push 결과

이 문서 작성 시점 기준 아직 커밋하지 않았다(사용자 확인 후 커밋
예정).
