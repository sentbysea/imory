# GALLERY-1 — 카테고리 갤러리 표시 · 글 대표 이미지 · 페이지 이동

이 문서는 갤러리 1차 기능의 **기준 문서**다. 상세 규칙은 여기에만 두고 다른
문서에는 링크만 남긴다(CLAUDE.md §5).

문서는 세 가지를 구분해서 쓴다 — **현재 구현** / **앞으로 지켜야 할 원칙** /
**남은 차이**.

관련 문서:
[SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) ·
[IMORY_FOLDER1_DESIGN.md](./IMORY_FOLDER1_DESIGN.md) ·
[IMORY_FOLDER2_DESIGN.md](./IMORY_FOLDER2_DESIGN.md) ·
[docs/ai-skin/AI_SKIN_PHASE1C_PAGE_CONTRACT.md](./docs/ai-skin/AI_SKIN_PHASE1C_PAGE_CONTRACT.md)

---

## 1. 무엇을 만들었나 (현재 구현)

기존 **글 카테고리**의 표시 방식으로 `목록`과 `갤러리` 중 하나를 고를 수 있다.
글·작성 화면·개별 POST 주소·공개 범위는 전부 기존 것을 그대로 쓴다 — 갤러리는
**목록을 그리는 방법**만 바꾼다.

- 글 하나 = 갤러리 카드 하나, 누르면 기존 `/:slug/post/:id`로 간다.
- 기존 카테고리는 전부 `list_style='list'`로 남아 지금까지의 화면 그대로다.
- 갤러리는 페이지를 나눠 **그 페이지의 글만 조회**한다(`?page=N`).

티스토리 스킨 문서의 세 갈래 분리(목록 데이터 / 목록 스타일 / 페이징)를 참고했고,
아이모리에서는 이렇게 대응된다:

| 티스토리 | 아이모리 |
| --- | --- |
| 목록 데이터 | `category.gallery.cards` (플랫폼이 만든다) |
| 목록 스타일 | 스킨의 HTML/CSS (`data-imory-repeat`) |
| 페이징 | `category.pagination` (플랫폼이 계산한다) |

새 치환자 문법은 만들지 않았다 — 전부 기존 `data-imory-*` 5종으로 그린다.

---

## 2. 카테고리 설정 (현재 구현)

Settings > CATEGORY의 각 post형 카테고리 아래에 표시 설정 줄이 붙는다
(`admin/settings/admin-settings-category-display.js`).

| 설정 | 컬럼 | 값 |
| --- | --- | --- |
| 표시 방식 | `categories.list_style` | `list`(기본) / `gallery` |
| 페이지당 글 수 | `categories.page_size` | 6 / 12 / 18 / 24 (기본 12) |
| 비밀글 미리보기 | `categories.secret_cover_mode` | `lock`(기본) / `image` |
| 지정 이미지 | `categories.secret_cover_path` | 버킷 안 경로(공개 주소는 없다, §3-5) |

보호 설정(EXIF 제거 · 우클릭/복사 차단)은 카테고리가 아니라 **블로그
전체** 설정이라 Settings > HOME > ETC에 있다(§13).

- `page_size`는 갤러리에서만 의미가 있어 목록 표시일 때 select가 비활성된다.
  값은 지우지 않는다 — 갤러리로 되돌리면 고른 값이 살아난다.
- `secret_cover_mode='image'`인데 지정 이미지가 없으면 **기본 잠금 카드로
  되돌아간다**(Context 단계에서 정규화, `normalizeSkinCategoryDisplay`).
- banner형 카테고리에는 이 줄이 붙지 않는다(배너에는 글 목록이 없다).
- migration이 아직 적용되지 않은 배포에서는 컬럼 조회가 42703으로 실패하므로,
  기본 컬럼만으로 한 번 더 읽고 표시 설정 줄을 그리지 않는다. UPDATE에도 넣지
  않는다 — 넣으면 카테고리 저장 전체가 실패한다.

지정 이미지의 업로드 시점은 글 대표 이미지와 같은 규칙이다(§3-1).

---

## 3. 글 대표 이미지 (현재 구현)

### 3-1. 저장 순서 — 절대 규칙

작성/수정 폼의 COVER 칸(`posts/editor/posts-cover-image.js`).

1. **파일을 고르는 순간에는 아무것도 올리지 않는다.** 미리보기는 objectURL이고
   파일은 메모리에만 있다.
   → 새 글 작성을 취소하면 Storage에 임시 파일이 남지 않는다. 교체하다 그만둬도
     예전 사진은 손대지 않은 채다. "임시 파일 정리" 문제 자체가 생기지 않는다.
2. 저장을 누르면 **새 경로에 먼저 올린다** — `{user_id}/{uuid}.{ext}`,
   `upsert:false`. 기존 파일을 덮어쓰는 경로가 코드에 존재하지 않는다.
3. **글이 저장된 뒤에야** `upsert_own_post_cover()`로 등록하고, 그 RPC가 돌려준
   **이전 storage_path를 그때 지운다**.
4. 어느 단계든 실패하면 되돌린다:
   - 글 저장 실패 → 방금 올린 파일만 삭제(`rollbackPostCoverUpload`).
     `post_covers`는 건드리지 않았으므로 기존 대표 이미지가 그대로 남는다.
   - 등록(RPC) 실패 → 같은 롤백. 글은 이미 저장됐으므로 안내만 한다.
   - 이전 파일 삭제 실패 → 고아 파일이 남지만 어떤 화면에도 나타나지 않는다
     (skin_images와 같은 정책, 자동 정리 작업은 만들지 않는다).

"제거"도 같다 — 누른 순간에는 예약만 하고, 저장할 때 `delete_own_post_cover()`가
행을 지우고 돌려준 경로의 파일을 지운다.

사진만 바꾸고 나가려 하면 "저장하지 않은 내용" 확인 창이 뜬다
(`postEditorHasUnsavedChanges`).

### 3-2. 왜 posts의 컬럼이 아니라 새 테이블인가

요구: *비밀글의 실제 대표 이미지를 방문자에게 보내고 CSS로 가리는 방식 금지.*

`posts.cover_image_url` 컬럼으로는 이 요구를 **DB에서 강제할 수 없다.** 비밀글은
행 자체가 방문자에게 보여야 하고(제목이 목록에 나온다), RLS는 행 단위 · GRANT는
컬럼 단위라 "이 행에서는 이 컬럼만 가려라"를 표현할 방법이 없다. 클라이언트가
select 목록에서 빼는 것은 관례일 뿐이고

```
/rest/v1/posts?select=id,cover_image_url&visibility=eq.secret
```

한 줄로 전부 새어나간다.

그래서 **행 단위로 분리**한다. `public.post_covers`는 글마다 한 행이고, 그 행의
SELECT 정책이 "이 글이 public인가 / 내가 주인인가"를 직접 판정한다.
`post_contents`가 본문을 분리한 것과 완전히 같은 이유·같은 모양이다.

```sql
create policy post_covers_public_read on public.post_covers
for select to anon, authenticated
using (
  exists (
    select 1 from public.posts p
     where p.id = public.post_covers.post_id
       and (p.visibility = 'public' or p.user_id = auth.uid())
  )
);
```

쓰기는 GRANT하지 않는다 — RPC 두 개(`upsert_own_post_cover` /
`delete_own_post_cover`)만이 이 테이블에 쓴다. `storage_path`와 `user_id`는
SELECT GRANT에서도 뺐다. §3-5 이후로는 파일 주소 컬럼(`public_url`) 자체가
없어서, 이 조회로 화면이 알게 되는 것은 **"이 글에 대표 이미지가 있다"**뿐이다.

### 3-3. 비밀글 카드는 소유자에게도 같다 — 결정

비밀글 카드의 `thumbnailUrl`은 **절대 그 글의 실제 대표 이미지가 아니다.**
카테고리 설정이 "지정 이미지"면 그 공통 이미지, 아니면 `null`(잠금 카드)이다.

소유자에게도 같은 카드를 준다. 이유:

- 소유자가 "내 갤러리가 방문자에게 어떻게 보이는가"를 그대로 본다.
- 소유자/방문자 화면이 갈라지는 코드 경로 자체가 없어진다.
- 그 결과 **비밀글의 id를 대표 이미지 조회에 아예 넣지 않게 되어**(
  `fetchSkinPostCoverMap`), "비밀글 원본 주소가 목록 응답에 없다"가 RLS와
  클라이언트 양쪽에서 동시에 참이 된다.

잠금 표시(`isLocked`)는 지정 이미지를 쓸 때도 유지된다.

### 3-4. 스킨 장식용 Images와의 구분

| | 스킨 이미지 슬롯 | 글 대표 이미지 |
| --- | --- | --- |
| 버킷 | `skin-images` | `post-covers` |
| 테이블 | `skin_images` + `skin_version_image_slots` | `post_covers` |
| 매달린 대상 | **스킨 버전**(Publish 시점에 연결이 굳는다) | **글** |
| 수명 | 스킨/버전이 살아 있는 동안 | 글이 지워지면 함께(cascade) |

같은 라이브러리에 섞으면 "글을 지웠는데 스킨이 참조하던 이미지가 사라졌다"가
생긴다. 그래서 버킷도 테이블도 분리한다.

### 3-5. Storage 접근 경계 — 비공개 저장소 + 요청마다 권한 확인

**측정한 사실 (2026-09-10, 프로덕션 실측)**

public 버킷은 **RLS를 통째로 우회한다.** apikey도 Authorization도 없이 보낸
요청이 그대로 열린다:

```
GET /storage/v1/object/public/user-avatars/<uid>/avatars/<uuid>
  -> HTTP/1.1 200 OK, Content-Type: image/jpeg, 47862 bytes
GET /storage/v1/object/user-avatars/<uid>/avatars/<uuid>   (RLS 경로)
  -> HTTP/1.1 200 OK  (같은 바이트)
```

그래서 §3-2의 `post_covers` RLS가 보장하는 것은 **목록 응답에서 URL을 숨기는
것까지**였다. 두 가지를 구분해야 한다:

| 무엇 | 무엇이 막는가 |
| --- | --- |
| 목록 응답·DOM·이미지 요청에 비밀글의 대표 이미지가 들어 있지 않다 | `post_covers` RLS + 클라이언트가 비밀글 id를 조회에 넣지 않음(§3-3) |
| **이미 알던 주소로 다시 요청했을 때 받을 수 없다** | 아래 — 비공개 버킷 + 프록시 |

**철회 — 경로 회전 (2026-09-10)**

한 번은 "글이 public을 벗어나면 파일을 새 경로로 복사하고 옛 경로를 지운다"로
옛 주소를 죽였다(`rotate_own_post_cover`). 그 방식은 **철회한다**. 두 가지를
보장하지 못했기 때문이다:

1. 회전의 마지막 단계(옛 파일 삭제)가 실패하면 옛 주소가 그대로 살아 있다.
   즉 **정리 실패 = 접근 허용**이었다.
2. 회전을 부르는 곳이 글 저장 경로 하나뿐이라, 그 경로를 지나지 않고 공개
   범위가 바뀌면 아무 일도 일어나지 않는다.

**현재 구현 — 파일 자체에 권한을 건다**

```
                    <img src="/api/post-cover?post=123">
                                   │
               functions/api/post-cover.js  (anon 키 + 요청자 쿠키만)
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        │ get_post_cover_object(123)                          │  ← 지금 public인가
        │   posts.visibility = 'public' or posts.user_id=me    │     내 글인가
        └──────────────────────────┬──────────────────────────┘
                                   │  경로
        ┌──────────────────────────┴──────────────────────────┐
        │ storage.objects SELECT 정책                          │  ← 같은 판정을
        │   post_cover_object_is_readable(name)                │     파일 단위로
        └─────────────────────────────────────────────────────┘
```

- **버킷이 비공개다.** `post-covers`의 `/object/public/...` 주소는 이제
  존재하지 않는다(항상 404). RLS를 우회하던 경로 자체가 사라졌다.
- **화면은 파일 주소를 받지 않는다.** `post_covers.public_url` 컬럼과
  `categories.secret_cover_url` 컬럼을 지웠다. 목록 응답에 오는 것은
  "이 글에 대표 이미지가 있다"는 사실(`post_id`)뿐이고, `<img>`에 들어가는
  주소는 글 id를 가리키는 우리 도메인 경로다
  (`buildPostCoverUrl`, `core/lib/post-cover-url.js`).
- **판정은 매 요청 DB에서 한다.** 그래서 공개 범위를 바꾸는 순간, **파일을
  하나도 옮기거나 지우지 않아도** 그 다음 요청부터 막힌다. 정리 실패는 이제
  용량 문제일 뿐 접근 경계와 무관하다.
- **프록시는 anon 이상의 권한을 갖지 않는다.** Service Role 키를 두지 않았다 —
  프록시에 결함이 있어도 anon이 볼 수 없는 바이트는 나갈 수 없다.

**소유자의 `<img>`는 어떻게 본인을 증명하나**

`<img>`는 Authorization 헤더를 실을 수 없다. 그래서 로그인 상태에서 access
token을 **경로가 `/api/post-cover`로 제한된** 쿠키에 넣어 둔다
(`Path=/api/post-cover; SameSite=Strict; Secure`, Max-Age는 토큰 만료까지 —
`core/lib/post-cover-url.js`). 프록시는 그 값을 검증하지 않고 그대로 Supabase에
넘기고, 서명·만료·권한 판정은 DB가 한다. 쿠키가 없거나 낡았으면 anon으로 한 번
더 시도한다(공개 글의 사진은 그래도 보여야 한다).

주소(query string)에 토큰을 넣지 않은 이유: 주소는 복사되고 공유되고 Referer와
로그에 남는다. 그러면 "권한 확인을 우회하는 URL"을 다시 만드는 셈이다.

**캐시**

```
Cache-Control: private, no-cache, max-age=0, must-revalidate
ETag: "c<파일 경로 해시>"
```

`no-cache`는 "저장은 하되 **쓸 때마다 서버에 물어보라**"는 뜻이다 — 브라우저에
남은 사본이 권한 확인을 건너뛰고 다시 쓰이는 일이 없다. ETag를 함께 주어
재확인이 304로 끝나게 한다(권한은 매번 다시 보고, 바이트는 다시 보내지 않는다).
재확인 시점에 권한이 사라졌으면 304가 아니라 404다. `private`이라 공유 캐시
(CDN)에는 남지 않는다.

**서명 URL을 쓰지 않은 이유**: 서명 URL은 만료 전까지 권한 확인을 우회하는
주소다. 공개 글이던 동안 받아 둔 서명 URL은 그 글이 비밀글로 바뀐 뒤에도
만료까지 계속 열린다 — 이번에 없애려는 성질이 정확히 그것이다.

**카테고리 비밀글 지정 이미지도 같은 경로로 나간다.** 그 파일은 의도적으로
모두에게 보이는 대체 이미지라 판정이 없을 뿐, 주소는 마찬가지로
`/api/post-cover?category=<id>`이고 버킷의 공개 주소는 존재하지 않는다.

**글 삭제**: 글이 지워지면 `post_covers` 행이 cascade로 사라지고 그 순간 접근도
끊긴다(참조하는 행이 없으니 위 판정에 걸리지 않는다). 그래도 Storage 객체는
남으므로, 삭제 화면들은 지우기 **전에** `get_own_post_cover_paths()`로 경로를
받아 두고 삭제가 성공한 **뒤에** 파일을 지운다. 이 정리가 실패해도 이제
보안 문제가 아니다.

**하지 않는 것**: 이미 내려받은 파일(브라우저 캐시, 저장된 사본)의 회수. 어떤
방식으로도 불가능하고 이 보완이 노리는 것도 아니다.

**강제 경계(정직하게)**: 공개 범위 판정은 **읽는 쪽**에 있다. 그래서 소유자가
PostgREST로 `posts.visibility`를 직접 PATCH해도 다음 요청부터 곧바로 새 공개
범위가 적용된다 — 전환 시점에 무엇을 호출했는지에 기대지 않는다. 남는 것은
프록시 자체의 가용성뿐이다: `/api/post-cover`가 죽으면 사진이 보이지 않는다
(과하게 열리는 방향이 아니라 닫히는 방향으로 실패한다).

---

## 4. 갤러리가 켜지는 조건 — 하위 호환의 핵심 (원칙)

갤러리 모드는 **두 조건이 모두 참일 때만** 켜진다.

1. 카테고리 설정이 `list_style='gallery'`
2. **렌더 중인 스킨의 CATEGORY template이 `category.gallery` 또는
   `category.pagination`을 실제로 그린다** (`skinTemplateUsesGallery()`,
   `skin/skin-template.js` — DOMParser로 `data-imory-*` 값을 확인한다)

2번이 필요한 이유: 갤러리 모드에서는 `category.posts`가 "그 페이지의 글"이 된다.
갤러리를 모르는 기존 스킨이 그 데이터를 받으면 **아무것도 바꾸지 않았는데 목록이
12개로 잘려 보인다.** 그래서 갤러리 계약을 쓰지 않는 스킨에서는 플랫폼이 갤러리
모드 자체를 켜지 않고 GALLERY-1 이전과 **완전히 동일한** 조회·정렬·shape을 쓴다.
설정은 DB에 남아 있고, 갤러리를 아는 스킨으로 바꾸면 그때 살아난다.

판정 근거를 metadata 플래그가 아니라 마크업에서 뽑는 것은
`skinPackageSupportsPageType()`이 `metadata.supports`를 신뢰 경계로 쓰지 않는
것과 같은 원칙이다(PHASE1C 1-5/14-2절).

**갤러리를 지원하지 않는 기존 스킨의 처리 방식(요구사항 5절)**: 목록으로 그린다.
스킨 HTML/CSS는 한 글자도 자동으로 바뀌지 않고, 주소에 `?page=`도 생기지 않는다
(붙어서 들어와도 지운다).

---

## 5. 스킨 데이터 계약 (현재 구현)

`category` namespace에 추가된 것. 기존 `posts` / `tree` / `hasFolders`의 의미는
§4의 조건이 성립하지 않는 모든 렌더에서 그대로다.

### 5-1. 표시 방식

| 경로 | 값 | 설명 |
| --- | --- | --- |
| `category.listStyle` | `"list"` \| `"gallery"` | 설정값 그대로 |
| `category.pageSize` | 6/12/18/24 | 설정값 그대로 |
| `category.isGallery` | boolean | **이번 렌더가 실제로 갤러리인가** |
| `category.isList` | boolean | 그 반대 |

`data-imory-if`는 부정(`!`)을 표현할 수 없어서 두 상태를 각각 boolean으로 준다
(FOLDER-2가 `folder.isList`/`isSeries`를 나란히 준 것과 같은 이유).

### 5-2. 카드

`category.gallery`는 갤러리가 아니면 `null`이다.

```
category.gallery = {
  cards: [...],
  count,            // 이 페이지의 카드 수
  hasCards,
  isEmpty,          // 이 페이지가 비었다
  isEmptyCategory   // 카테고리 전체에 글이 하나도 없다
}
```

카드 하나:

| 키 | 설명 |
| --- | --- |
| `id` `title` `href` `publishedAt` `publishedAtLabel` `isSecret` | `category.posts` item과 같은 의미 |
| `isPrivate` | 비공개 글(소유자에게만 온다) |
| `thumbnailUrl` | 그릴 이미지의 주소. 파일 주소가 아니라 `/api/post-cover?post=<id>`(§3-5)이고 **없으면 null** |
| `thumbnailAlt` | 마스킹 아이콘 없는 원래 제목 |
| `hasThumbnail` | 사진 카드인가 |
| `isPlaceholder` | 대체(사진 없음) 카드인가 = `!hasThumbnail` |
| `isLocked` | 잠금 표시를 유지할 카드인가 = `isSecret` |

사진 없는 글도 **목록에서 누락되지 않는다** — `isPlaceholder` 카드로 남는다.

### 5-3. 조회 범위 — 폴더와 카드의 경계

갤러리 카드는 **카테고리 root의 direct 글**(`folder_id is null`)만 담는다.
폴더 안의 글은 폴더 영역이 그린다. 그리고 갤러리 모드에서 `category.tree`에는
**폴더 노드만** 들어간다(root 글 노드가 빠진다).

즉 "폴더 영역 / 카드 영역"의 경계를 스킨의 관례가 아니라 **데이터에서** 정한다 —
같은 글이 두 군데 나오는 것이 구조적으로 불가능하다(요구사항 5절).

목록 모드에서는 지금까지처럼 `category.tree`에 글 가지도 함께 있다.

### 5-4. 페이지 이동

`category.pagination`은 갤러리가 아니면 `null`이다.

| 키 | 설명 |
| --- | --- |
| `currentPage` `currentPageLabel` | 유효 범위로 맞춰진 현재 페이지 |
| `pageSize` `totalCount` `totalPages` `totalPagesLabel` | |
| `hasPages` | 페이지가 둘 이상인가(이동 영역을 접는 데 쓴다) |
| `hasPrev` `hasNext` `prevHref` `nextHref` `firstHref` `lastHref` | |
| `pages[]` | `{ number, label, href, isCurrent }` |

페이지 계산·데이터 조회·권한 처리는 전부 플랫폼이 하고, 스킨은 `pages[]`를
repeat으로 그리기만 한다.

---

## 6. 갤러리 화면 · 샘플 스킨 (현재 구현)

샘플: `skin/test-skins/imory-gallery-grid-v1.json`
(생성기: `skin/test-skins/build-gallery-grid-v1.mjs` — JSON에 한 줄로 밀어 넣기
전의 읽을 수 있는 원본. `node skin/test-skins/build-gallery-grid-v1.mjs`로 다시
만든다.)

기본 디자인: 데스크톱 3열 / 모바일 2열, 정사각 썸네일 `object-fit: cover`,
사진 아래 제목 한 줄, 연한 테두리, 하단 번호 페이지 이동.

디자인 값은 전부 CSS 한 곳에서 바꾼다(전용 Inspector 창은 이번 범위 밖):

```css
.gg-page {
  --gg-cols: 3;      /* 데스크톱 열 수 */
  --gg-cols-sm: 2;   /* 모바일 열 수 */
  --gg-ratio: 1;     /* 썸네일 비율(1 = 정사각) */
  --gg-gap: 14px;    /* 카드 간격 */
}
.gg-card-title { }   /* display:none 이면 사진만 남는다 */
```

**사진 없음 / 이미지 로드 실패**: `.gg-thumb` 안에 대체 표시를 항상 깔고 그 위에
`<img>`를 얹는다. `item.hasThumbnail`이 false면 img가 접히고, 주소는 있는데
로드에 실패하면 img가 빈 상자로 남아 뒤의 대체 표시가 그대로 비친다. 스킨
HTML에는 스크립트를 쓸 수 없으므로 `onerror` 대신 이 구조로 해결한다.

**빈 카테고리**: `category.gallery.isEmpty`로 안내 문구를 띄운다.

이 스킨은 목록/갤러리 두 레이아웃을 함께 갖고 `category.isGallery` /
`category.isList`로 하나만 그린다 — 카테고리 설정을 바꾸면 같은 스킨에서 두 화면이
모두 나온다.

---

## 7. 페이지 이동 계약 (현재 구현)

- 주소: `/:slug/category/:id?page=N`. **1페이지는 쿼리를 붙이지 않는다**(정규 주소).
  `buildSiteCategoryPageUrl()` / `getSiteRequestedPage()` (`core/lib/site-path.js`).
- 조회: `posts` 한 번에 `range(offset, limit)` + `count=exact`. 그 페이지의 행과
  전체 개수를 한 왕복으로 받는다. **전체를 받아 CSS로 숨기지 않는다.**
- 정렬: `created_at DESC, id DESC`. 같은 시각의 글이 있어도 페이지마다 순서가
  흔들리지 않는다(id가 유일하므로 전순서가 확정된다). FOLDER-1 backfill이 쓴
  tie-break와 같은 규칙이다.
- 직접 접속·새로고침·뒤로가기·앞으로가기가 전부 같은 페이지를 연다
  (라우터가 `?page=`를 그대로 넘기고, 유효 범위 판정은 실제 글 수를 아는
  Context가 한다).
- 글에 들어갔다 뒤로 오면 보던 갤러리 페이지로 돌아온다(history 항목이 그 주소다).
- 주소 정정(전부 `replaceState` — 누른 적 없는 항목을 history에 쌓지 않는다):
  - 범위를 벗어난 `?page=99` → 마지막 페이지
  - 갤러리가 아닌데 `?page=`가 붙어 있음 → 쿼리 제거
  - 갤러리인데 1페이지 → 쿼리 제거
- 페이지당 개수를 바꿔 페이지가 줄면 위 규칙에 따라 유효한 페이지로 간다.
- 빈 카테고리는 `totalPages = 1`, 카드 0개, 이동 영역은 접힌다.

PostgREST는 범위를 벗어난 offset을 416/PGRST103으로 거절한다. 그 경우에만
개수만 세는 가벼운 질의를 한 번 더 하고 마지막 페이지로 맞춰 다시 조회한다 —
**정상 경로에는 추가 왕복이 없다**.

---

## 8. 소유자 / 방문자 (현재 구현)

| | 목록·개수 | 대표 이미지 |
| --- | --- | --- |
| 공개 글 | 둘 다 포함 | 실제 대표 이미지 |
| 비밀글 | 둘 다 포함(제목에 🔒) | 카테고리 지정 이미지 또는 잠금 카드 — 소유자도 동일(§3-3) |
| 비공개 글 | **방문자에게는 목록에도 개수에도 없다**(RLS가 행을 주지 않는다). 소유자에게는 지금까지의 목록과 똑같이 보인다(제목에 🙈) | 실제 대표 이미지(소유자만) |

그래서 소유자와 방문자의 `totalCount`가 다를 수 있다 — 목록 표시에서도 원래
그랬던 것과 같다.

---

## 9. Studio Preview (현재 구현)

Preview는 공개 화면과 **같은 `buildCategorySkinContext()`, 같은 판정, 같은
template**을 쓴다(`studio/preview/preview-navigation.js`). 갤러리 지원 판정도
`skinTemplateUsesGallery(categoryTemplate)`로 똑같이 하고, Preview 안의 페이지
링크(`?page=N`)도 `resolveStudioPreviewTarget()`이 그대로 해석해 넘긴다.

그래서 "Preview에서는 갤러리인데 공개 화면에서는 목록"이 구조적으로 생길 수 없다.

---

## 9-2. AI 스킨 수정 (현재 구현)

`functions/api/skin-ai.js`의 시스템 프롬프트에 `#### Category gallery` 절이
있다(CATEGORY 항목과 POST 항목 사이, 폴더 절 바로 뒤). 담고 있는 것:

- 표시 조건 — `category.isGallery` / `category.isList` 중 하나만 참이고
  `data-imory-if`는 부정을 못 하므로 둘 다 존재한다는 것, `listStyle`로
  분기하지 말 것.
- 카드 item shape 전체와 `isEmpty` / `isEmptyCategory`의 차이.
- 썸네일 규칙 — `item.hasThumbnail` 가드 필수, 사진 없는 글도 대체 카드로 남길
  것, 스킨에는 `onerror`가 없으므로 뒤에 깔린 대체 표시로 해결할 것, 비밀글의
  `thumbnailUrl`은 실제 이미지가 아니며 잠금 표시를 유지할 것.
- 페이지 이동 — `pages[]` 필드, **href를 직접 만들지 말 것**(`?page=`를
  붙이지 말 것), 전체를 받아 CSS로 숨기지 말 것, `isCurrent`는 클래스를 바꿀 수
  없으므로 자식 요소로 표시할 것.
- **갤러리는 템플릿이 `category.gallery`/`category.pagination`을 실제로 그릴
  때만 켜진다**는 조건(§4) — 그 바인딩을 지우면 소유자의 갤러리 설정이 조용히
  꺼진다는 경고. 목록↔갤러리 강제 변환 금지.
- 폴더와의 범위 경계(§5-3) — 갤러리 렌더의 `category.tree`에는 폴더 노드만
  있으므로 폴더 영역과 카드 영역을 함께 그려도 중복되지 않는다.

AI 수정 예시 UI는 이번 범위 밖이다(§11-3).

---

## 10. 변경 파일

**DB**
- `supabase/migrations/20260910100000_gallery_category_and_post_covers.sql` (신규)
- `supabase/migrations/20260911100000_post_covers_private_access.sql` (신규 — §3-5:
  버킷 비공개 전환 · 공개 주소 컬럼 제거 · 판정 함수/정책/조회 RPC · 경로 회전 철회)
- (철회) `20260910110000_post_cover_path_rotation.sql` — 파일을 지웠다. 이미
  적용했다면 위 migration이 `rotate_own_post_cover()`를 지운다.
- §13(보호 설정)은 `site_settings`의 key/value를 쓰므로 **migration이 없다.**

**데이터 계약 / 렌더**
- `skin/skin-context.js` — 표시 설정 조회, 페이지 조회, 카드/페이지 계산
- `skin/skin-template.js` — `skinTemplateUsesGallery` / `skinPackageUsesGallery`
- `skin/skin-category.js` — page 전달, outcome 반환
- `skin/skin-link-nav.js` — `?page=` 전달
- `core/lib/site-path.js` — `buildSiteCategoryPageUrl` / `getSiteRequestedPage`

**플랫폼 라우팅**
- `posts/view/posts-view-list.js` — `page` 옵션, 주소 정정
- `posts/editor/posts-router-init.js` — `?page=` 파싱

**글 대표 이미지**
- `functions/api/post-cover.js` (신규 — §3-5 프록시, 배달 경로 전부)
- `core/lib/post-cover-url.js` (신규 — 주소 생성 + 소유자 증명 쿠키)
- `posts/editor/posts-cover-image.js` (신규 — 저장 순서 + 삭제 정리 + EXIF 제거)
- `posts/editor/posts-list-detail-nav.js` · `posts/view/posts-view-list-select.js` — 삭제 시 파일 정리
- `posts/posts.html` · `posts/posts-editor.css` — COVER 칸
- `posts/editor/posts-save.js` — 저장 순서
- `posts/view/posts-view-editor-load.js` — 로드/초기화/취소/미저장 판정
- `index.html` — 스크립트 로드 목록

**카테고리 설정**
- `admin/settings/admin-settings-category-display.js` (신규 — 표시 설정 + §13 보호 체크박스)
- `admin/settings/admin-settings-load.js` · `admin-settings-save.js` · `admin/admin-settings.css`
- `admin/index.html` — 스크립트 로드 목록

**보호 설정 (§13)**
- `core/lib/content-protection.js` (신규 — 설정 조회/캐시 · 주인장 판정 ·
  우클릭/복사 차단 · EXIF 제거)
- `home/site-meta.js` — 공개 화면에서 한 번 건다
- `admin/settings/admin-etc-settings.js` (신규 — HOME > ETC 화면)
- `admin/index.html` · `admin/admin-settings.css` — ETC 섹션

**관리 화면 정리 (2026-09-11, §14)**
- `admin/settings/admin-image-setting.js` (신규 — FAVICON/CURSOR 공용 구현)
- `admin/settings/admin-favicon.js` · `admin-cursor.js`(신규) — 설정만 넘긴다
- `admin/settings/admin-settings-load.js` · `admin-settings-save.js` — 커서 코드 이관
- `admin/admin.js` · `admin-settings-load.js` — 설정 안쪽 탭 기억

**AI**
- `functions/api/skin-ai.js` — `#### Category gallery` 절 (§9-2)

**Studio Preview**
- `studio/preview/preview-navigation.js` · `preview-route.js`
- `studio/index.html` — `core/lib/post-cover-url.js` 로드
- `studio/studio-lifecycle-scenario.html` — mock 확장(is/not/range/count/복합 order) + scenario g

**샘플 스킨 / 테스트**
- `skin/test-skins/imory-gallery-grid-v1.json` + `build-gallery-grid-v1.mjs` (신규)
- `skin/skin-gallery-e2e-test.mjs` (신규, 포트 8948)
- `studio/studio-ai-panel-e2e-test.mjs` — L절(갤러리 프롬프트 계약 + 왕복 유지)

---

## 11. 남은 차이

1. **모든 대표 이미지 요청이 우리 서버를 거친다.** 파일 단위 권한을 얻은 대가다
   (§3-5). 갤러리 한 페이지가 12장이면 12번의 프록시 왕복이고, 각 왕복은 RPC 한
   번 + Storage 한 번이다. `no-cache` + ETag 덕분에 두 번째 방문부터는 대부분
   304로 끝나지만(바이트는 다시 안 보낸다) **권한 확인 자체는 매번 한다** — 그게
   이 설계의 요점이라 줄일 수 없다. 트래픽이 커지면 프록시 안에서 (요청자·글
   단위로) 짧은 메모리 캐시를 두는 정도가 다음 수단이고, 지금은 넣지 않았다.
   이미 내려받은 사본의 회수는 어떤 방식으로도 범위 밖이다.
2. **대표 이미지는 사용자가 직접 지정하는 방식뿐이다.** 본문 첫 이미지 자동 추출은
   하지 않는다 — 목록을 그리려고 본문을 내려받거나 파싱하지 않는다는 규칙(요구사항
   2절)과 정면으로 부딪히기 때문이다. 자동 추출을 하려면 저장 시점에 본문에서
   뽑아 `post_covers`에 적는 별도 경로가 필요하다.
3. **AI 수정 예시 UI가 없다.** 시스템 프롬프트에는 갤러리 계약이 들어갔지만(§9-2),
   AI 패널에서 갤러리용 예시 문구를 제시하는 UI는 만들지 않았다(이번 범위 밖).
4. **전용 Inspector 설정창이 없다.** 열 수·비율·간격·제목 표시는 스킨 CSS의 변수로
   바꾼다(§6). Select mode에서 슬라이더로 조절하는 UI는 만들지 않았다.
5. **`page_size`를 바꿔도 이미 열려 있는 화면은 자동으로 갱신되지 않는다.**
   Settings에서 저장한 뒤 카테고리를 다시 열면 반영된다.
6. **고아 파일 자동 정리 작업이 없다.** 교체·삭제 정리의 마지막 단계(파일 삭제)가
   실패하면 Storage object가 남는다. §3-5 이후로 이것은 **용량 문제일 뿐**이다 —
   그 파일을 참조하는 행이 없으면 판정에 걸리지 않아 아무도 받을 수 없다.
   `skin_images`와 같은 정책이다.
7. **`category.posts`는 갤러리 모드에서 "그 페이지의 root 글"이다.** 갤러리를
   선언한 스킨에만 해당하고(§4), 그 스킨은 이미 카드로 같은 데이터를 보고 있다.
   전체 목록과 갤러리 페이지를 한 화면에서 동시에 쓰고 싶다면 별도 namespace가
   필요하다 — 지금은 없다.

---

## 12. 검증

`node skin/skin-gallery-e2e-test.mjs` (포트 8948, **119 PASS**).
`--only=` 로 절을 고른다: `published` / `secret` / `paging` / `compat` /
`cover` / `access` / `protect` / `preview`.

`secret` 절과 `access` 절은 **다른 것**을 잰다(§3-5의 표와 같은 구분):

- `secret` — 목록 응답·DOM·이미지 요청에 비밀글의 대표 이미지가 들어 있지 않다.
- `access` — 화면이 쓰는 주소(`/api/post-cover?post=N`)로 **다시 요청**했을 때
  지금 이 요청자가 받을 수 있는가. 이 절에서 도는 것은 mock이 아니라
  **실제 Pages Function**이다 — 정적 서버가 `functions/api/post-cover.js`를
  그대로 import해서 돌리고, 그 함수가 부르는 Supabase만 migration의 SQL과
  같은 규칙으로 흉내 낸다.

`access` 절이 실제로 확인한 것(21 PASS):

- 공개 글 → 비밀글로 바꾼 뒤 방문자가 같은 주소로 다시 요청하면 404다.
  그 전환에서 **Storage 요청이 한 건도 나가지 않았고** 파일도 행의 경로도
  그대로다 — 즉 정리에 실패한 것과 같은 상태에서도 막힌다.
- 같은 순간 소유자는 자기 사진을 그대로 본다(쿠키로 본인 증명) — fetch뿐 아니라
  **실제 <img>가 그려지는 것**까지 확인한다(`naturalWidth > 0`).
- 다시 공개로 바꾸면 방문자에게 다시 열린다.
- 비공개(private) 글도 같다(방문자 404 / 소유자 200).
- 버킷의 `/object/public/...` 주소는 공개 글이어도 열리지 않는다.
- 응답이 `private, no-cache, must-revalidate` + ETag다.
- 글을 지우면 소유자에게도 404이고, 파일 정리는 여전히
  "경로 조회 → 글 삭제 → 파일 삭제" 순서다.

`protect` 절(17 PASS)은 §13을 잰다 — 방문자에게는 목록 화면과 글 화면
모두에서 우클릭/복사가 막히고 **주인장에게는 막히지 않으며**, 설정이 없는
블로그에서는 전부 꺼진 상태로 화면이 멀쩡하다. EXIF는 **APP1 세그먼트를
실제로 넣은 JPEG**를 올려, 켜져 있으면 Storage로 나가는 바이트에 `Exif`
마커가 없고 꺼져 있으면 원본 그대로 올라가는 것을 확인한다. Settings >
HOME > ETC가 HOME 탭 **맨 아래**에 있고 저장이 세 값을 한 번에 보내는
것도 같은 절에서 본다.

관리 화면 자체는 `node admin/admin-settings-e2e-test.mjs`
(포트 8949, **35 PASS**)가 잰다 — §14를 참고.

AI 계약은 `node studio/studio-ai-panel-e2e-test.mjs` (**142 PASS**)의 L절 —
프롬프트에 표시 조건·카드 shape·썸네일 규칙·페이지 이동 규칙이 실제로 들어 있고,
`imory-gallery-grid-v1.json`이 서버 왕복을 거쳐도 카드 바인딩과 페이지 링크
12종이 모두 살아남는지 확인한다.

migration 두 개는 PGlite(실제 Postgres 엔진)에서 그대로 실행해 확인했다 —
`auth.uid()` / `storage` 스키마 / `anon`·`authenticated` 역할만 최소로 흉내 내고
파일은 저장소의 것을 그대로 돌렸다. **41개 항목**: 버킷이 비공개인지, 지운 컬럼과
함수(`public_url` · `secret_cover_url` · `rotate_own_post_cover`)가 실제로 없는지,
`anon`의 SELECT 컬럼 목록, 공개/비밀/비공개 × 방문자/남/소유자의 조회 판정,
**공개 범위를 바꾸는 것만으로 파일을 건드리지 않고 접근이 끊기고 되돌리면 다시
열리는지**, storage 정책의 파일 단위 판정(고아 파일 포함), 글 삭제 후 파일이
남아 있어도 읽히지 않는지, 쓰기 RPC의 소유권 검사, 그리고 두 파일을 그대로
재실행해도 안전한지.

**프로덕션 DB에는 아직 적용하지 않았다**(이 환경에 DDL 수단이 없다 — Supabase
SQL Editor로 사용자가 적용한다). **실기기·실제 배포 확인도 아직이다.**

적용 순서:

1. `20260910100000_gallery_category_and_post_covers.sql`
2. `20260911100000_post_covers_private_access.sql`

2번은 1번이 만든 것을 고치므로 순서를 바꿀 수 없다. 보호 설정(§13)은
`site_settings`를 쓰므로 적용할 migration이 없다.

migration과 코드 배포 사이에는 대표 이미지가 잠깐 보이지 않는 구간이 있다
(migration만 적용된 상태에서는 옛 코드가 사라진 `public_url`을 찾고, 코드만
배포된 상태에서는 새 코드가 아직 없는 RPC를 부른다). **두 작업을 붙여서 하고,
순서는 migration → 배포**를 권한다 — 그래야 "주소는 이미 죽었는데 화면이 아직
옛 주소를 쓴다"는 방향(닫히는 방향)으로만 틀린다.

회귀로 8934 / 8935(banner) / 8935(images) / 8936 / 8937 / 8939 / 8941 / 8942 /
8943 / 8944 / 8947을 재실행해 전부 통과했다.

---

## 13. 블로그 보호 설정 (현재 구현)

Settings > **HOME > ETC**의 체크박스 세 개
(`admin/settings/admin-etc-settings.js`). **블로그 전체**에 걸리는
설정이고, 값은 `site_settings`의 key/value에 들어간다
(`blog_title` / `favicon_url` / `cursor_url`과 같은 자리 — 새 컬럼도
migration도 없다). 값은 `"on"` / `"off"` 문자열이다.

| 설정 | key | 적용 대상 |
| --- | --- | --- |
| 이미지 EXIF 제거 | `strip_image_exif` | 이 블로그에 올리는 이미지(글 대표 이미지 · 비밀글 지정 이미지 · 파비콘 · 커서) |
| 우클릭 방지 | `block_context_menu` | 이 블로그의 모든 공개 화면 (주인장 제외) |
| 텍스트 복사 방지 | `block_text_copy` | 위와 같음 (주인장 제외) |

세 값 모두 기본은 꺼짐이라 기존 블로그의 화면과 동작이 그대로다.

**왜 카테고리가 아니라 사이트 단위인가**: 처음에는 카테고리 컬럼으로
만들었지만, 그러면 카테고리가 없는 화면(HOME·배너)에 적용할 대상이
없어 "블로그를 보호한다"가 되지 못한다. 사이트 단위로 옮기면서
`categories`에 컬럼을 더하던 migration은 **철회했다**(파일을 지웠다).

### 13-1. 무엇을 보장하고 무엇을 보장하지 않는가

**우클릭 / 복사 방지는 접근 통제가 아니다.** 브라우저의 기본 동작을
막는 것이고, 개발자 도구·소스 보기·화면 캡처·확장 프로그램·JS를 끈
브라우저 앞에서는 무력하다. 서버가 보낸 바이트는 이미 상대의 컴퓨터에
있다. 그래서 이 설정은 **화면 동작만** 바꾸고 응답 내용은 바꾸지
않는다 — 데이터 경계는 §3-5(대표 이미지)와 기존 비밀글 gate가
담당한다. 설정 화면의 안내 문구에도 이 한계를 그대로 적어 두었다.

**EXIF 제거는 다르다.** 파일을 올리기 **전에** 브라우저에서 다시
인코딩해 좌표·기기·촬영 시각이 서버로 아예 가지 않게 한다. 되돌릴 수
없는 실제 처리다.

### 13-2. 어디서 한 번 거는가

공개 화면에서 이 설정을 거는 곳은 `home/site-meta.js`의
`loadSiteMeta()` **하나**다(제목/파비콘/커서를 적용하는 그 자리).
사이트 단위 설정이라 화면이 바뀔 때마다 다시 걸 필요가 없다 —
SPA 안에서 카테고리·글·폴더를 오가도 그대로 유지된다.

세 조회(제목·파비콘·커서)보다 **먼저** 띄우고 기다리지 않는다.
뒤에 두면 왕복 세 번이 끝난 다음에야 보호가 걸린다.

### 13-3. 주인장 제외 — 먼저 걸고 나중에 푼다

설정 조회와 주인장 판정을 **동시에** 띄운다. 설정이 오면 곧바로 걸고,
주인장으로 확인되면 곧바로 푼다. 순서대로 기다리면 주인장 화면에서
우클릭이 잠깐 막히는 것이 눈에 보이고, 반대로 판정을 먼저 기다리면
그동안 방문자에게 보호가 비어 있다.

주인장 판정은 `core/lib/content-protection.js`가 **직접** 한다
(`imoryViewerIsSiteOwner`). `posts/editor/posts-state.js`에 같은
판정(`isSiteOwnerSignedIn`)이 있지만 그 파일에 기대지 않는다 — 이
경로는 부팅 직후에 도는데 그 시점에 `posts/*`는 아직 로드되지 않았을
수 있고, 실제로 "주인장인데 우클릭이 막힌다"가 그 이유였다.

### 13-4. 구현 (`core/lib/content-protection.js`)

- 설정은 한 번만 읽고 promise를 캐시한다. `site_settings`를 key 세 개로
  **한 번에** 조회한다.
- 차단은 `contextmenu` / `copy` / `cut`의 capture 단계
  `preventDefault()`와 `body.imory-no-copy`의 `user-select: none`이다.
  `stopPropagation`은 하지 않는다(다른 기능의 동작을 가로채지 않기 위해).
- **입력 요소는 예외다** — 비밀글 비밀번호처럼 방문자가 직접 쓰고
  고쳐야 하는 자리까지 굳으면 화면이 고장 난 것처럼 보인다.
- 조회에 실패하면(오류·잘못된 slug) **전부 꺼짐**으로 본다. 보호 설정을
  못 읽었다고 화면을 못 보여줄 이유가 없다.
- EXIF 제거는 `createImageBitmap(file, { imageOrientation: "from-image" })`
  → canvas → `toBlob(같은 mime, 0.92)`다. 픽셀만 남으므로 EXIF/GPS/XMP
  블록이 결과 파일에 **존재하지 않는다**(특정 태그만 지우는 파서보다
  확실하다). 방향(Orientation)은 지우기 전에 픽셀에 반영해서 그린다 —
  그래서 세로로 찍은 사진이 눕지 않는다.
- **GIF는 건드리지 않는다.** GIF에는 EXIF 세그먼트가 없고, 다시
  인코딩하면 애니메이션이 첫 프레임으로 납작해진다.
- **제거에 실패하면 올리지 않는다.** 사용자가 "지워라"라고 켜 둔
  설정이라 조용히 원본을 올리는 것은 그 설정을 배신하는 일이다.
  저장을 멈추고 안내한다.

### 13-5. 남은 차이

1. **주인장 판정 전 아주 짧은 순간에는 주인장에게도 걸려 있다.**
   두 조회를 동시에 띄워 그 창을 최소화했지만 0은 아니다. 반대 방향
   (판정을 기다리는 동안 방문자가 보호를 안 받는 것)보다 낫다고 봤다.
2. **Studio Preview에는 적용하지 않는다.** Preview는 소유자만 보는
   화면이고, 주인장은 어차피 제외 대상이다.
3. **이미 올라간 사진의 EXIF는 지우지 않는다.** 설정을 켜기 전에 올린
   파일은 그대로다 — 다시 올리면 그때 지워진다. 일괄 재처리 기능은
   만들지 않았다.
4. **본문에 붙인 외부 이미지 주소는 대상이 아니다.** 이 저장소에는
   본문 이미지 업로드 경로가 없어(대표 이미지·배너·아바타·파비콘·
   커서·스킨 이미지만) EXIF 제거가 걸릴 자리도 없다. 배너·아바타·
   스킨 이미지 업로드에는 아직 연결하지 않았다(이번 범위 밖).
5. **설정을 바꿔도 이미 열려 있는 방문자 화면은 그대로다.** 다음
   방문(새로고침)부터 반영된다.

---

## 14. 관리 화면 정리 (2026-09-11, 현재 구현)

보호 설정을 HOME > ETC로 옮기면서 같은 화면의 오래된 문제 네 가지를
함께 고쳤다. 전부 `node admin/admin-settings-e2e-test.mjs`
(포트 8949, **35 PASS**)가 확인한다.

### 14-1. FAVICON / CURSOR — URL 칸 제거, 매번 새 경로

두 화면 모두 (1) 이미지 URL을 직접 입력하는 칸이 있었고, (2) 업로드는
**항상 같은 경로**(`{user_id}/favicon`)에 upsert로 덮어썼다. 그래서:

- 주소가 안 바뀌니 브라우저·CDN이 **예전 이미지를 계속 보여준다.**
  "파비콘을 바꿨는데 예전 게 그대로"의 원인이 이것이다(파비콘은 특히
  오래 물고 있는다).
- 저장(site_settings 반영)이 실패해도 파일은 이미 덮어써진 뒤라
  되돌릴 수 없다.

지금은:

- URL 입력 칸이 없다. **이미지를 고르는 것 하나**로 끝나고, 미리보기는
  두 화면 모두 같은 자리에 같은 모양으로 뜬다(커서도 파비콘과 동일).
- 업로드는 **매번 새 경로**(`{user_id}/{uuid}`, `upsert:false`)다.
  주소가 달라지므로 캐시가 끼어들 자리가 없다.
- 저장이 성공한 **뒤에야** 밀려난 예전 파일을 지운다(§3-1의 순서 규칙과
  같다). 저장이 실패하면 방금 올린 파일을 남겨 두어 다시 save를 누르면
  된다.
- URL 칸이 사라졌으니 "비우기"는 **remove 버튼**이다 — 누른 순간에는
  예약만 하고 저장할 때 실제로 값이 비고 파일이 지워진다.

두 화면의 동작이 완전히 같아서 공용 구현
(`admin/settings/admin-image-setting.js`)을 쓰고, `admin-favicon.js` ·
`admin-cursor.js`는 key/버킷/DOM id만 넘긴다. 커서 코드는 그러면서
`admin-settings-load.js`/`admin-settings-save.js`에서 빠져나왔다(두
파일 모두 1,000줄을 넘고 있었다).

여기 올리는 이미지에도 §13의 EXIF 제거 설정이 적용된다.

### 14-2. 설정 안쪽 탭 유지

`onAuthStateChange`는 토큰 갱신이나 **탭 복귀**마다 다시 불리고, 그때
`restoreAdminView()`가 SETTINGS 화면을 다시 연다. 그 자리에서 무조건
`showSettingsSection("profile")`을 부르고 있어서, 다른 앱에 갔다
돌아오는 것만으로 보고 있던 탭이 PROFILE로 튀었다.

큰 화면(`currentAdminView`)을 sessionStorage에 기억하는 것과 **같은
방식**으로 안쪽 탭도 기억한다(`admin-settings-section`). 탭을 누를
때마다 적히고, 화면을 다시 열 때 그 값으로 연다.

### 14-3. 남은 차이

1. **아바타·MY BANNER는 아직 옛 방식이다.** 둘 다 고정 경로 upsert라
   같은 캐시 문제가 있을 수 있다. 이번에는 사용자가 지목한 파비콘·커서만
   고쳤다 — 같은 공용 구현으로 옮기면 되지만 화면 구성이 조금 달라
   (배너는 링크 URL이 따로 있다) 그대로 두었다.
2. **업로드 파일 크기·형식 검사를 새로 넣지 않았다.** 기존과 같은
   `accept` 목록만 쓴다. 커서로 쓰기엔 너무 큰 이미지는 브라우저가
   조용히 무시한다(대략 128px 이하 권장).
3. **`restoreAdminView()`가 탭 복귀마다 화면 전체를 다시 여는 것**
   자체는 그대로다. 안쪽 탭이 튀는 것만 고쳤다.
