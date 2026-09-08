# FOLDER-1 — 카테고리 안의 폴더(최대 3단계)

카테고리 → 글이던 구조에 **선택적인 폴더**를 넣는다. 폴더는 최대 3단계까지
중첩되고, 글은 어느 depth의 폴더에도 들어갈 수 있으며, 폴더 없이 카테고리
root에 그냥 있을 수도 있다.

이 문서가 폴더 기능의 **기준 문서**다. 다른 문서에는 링크만 둔다.

---

## 0. 한 줄 원칙

> **Folder는 콘텐츠 구조이고 Skin은 표현 방식이다.**

DB에도 Skin Context에도 "폴더면 아이콘으로 보여라" 같은 UI 의미를 넣지
않는다. 구조 데이터만 주고, 📁 아이콘이든 들여쓰기 목록이든 아코디언이든
각 Skin의 html/css가 정한다. 폴더를 모르는 기존 Skin은 폴더가 생겨도
**한 픽셀도 달라지지 않아야 한다.**

---

## 1. 현재 구현

### 1-1. DB

| 대상 | migration |
| --- | --- |
| `post_folders` 테이블 · 트리거 · RLS · GRANT | [20260908100000_create_post_folders.sql](supabase/migrations/20260908100000_create_post_folders.sql) |
| `posts.folder_id` · `posts.sort_order` · backfill · 트리거 · GRANT | [20260908110000_add_posts_folder_id_sort_order.sql](supabase/migrations/20260908110000_add_posts_folder_id_sort_order.sql) |
| 폴더 CRUD/이동 RPC | [20260908120000_add_post_folder_rpcs.sql](supabase/migrations/20260908120000_add_post_folder_rpcs.sql) |

```
post_folders
  id · user_id · category_id · parent_id(nullable, on delete restrict)
  name · depth(1~3, 트리거가 유지) · sort_order · created_at · updated_at

posts (추가)
  folder_id(nullable, on delete restrict) · sort_order(not null)
```

**depth를 컬럼으로 저장하는 이유**: CHECK 제약은 재귀 질의를 못 해서
"4단계 금지"를 선언적으로 쓸 방법이 없다. 트리거가 `parent.depth + 1`로
항상 다시 계산하고 `check (depth between 1 and 3)`이 최종 방어선이 된다.
폴더를 옮겨 depth가 바뀌면 AFTER 트리거가 자손 행을 touch해서 연쇄로 다시
계산하고, 그 과정에서 4가 되면 트랜잭션 전체가 롤백된다 — "3단계 폴더 안에
2단계 서브트리를 통째로 넣는 이동"도 이 연쇄가 잡는다.

**cycle을 depth만으로 못 막는 이유**: `A(1) > B(2)` 에서 A를 B 안으로
옮기면 새 depth는 3이라 상한을 통과하지만 A와 B가 서로를 가리킨다.
그래서 부모의 조상 체인에 자기 자신이 있는지 재귀 CTE로 따로 확인한다.

**`on delete restrict`**: 폴더를 지울 때 안의 글/폴더가 같이 사라지면 안
되므로 cascade를 쓸 수 없다. 이 FK가 "RPC를 우회한 삭제"를 물리적으로
막는다.

### 1-2. 정렬

`sort_order`는 **같은 컨테이너 안의 순서**이고, 폴더와 글이 **정렬 공간을
공유한다**. 컨테이너 키는 폴더 기준 `(user_id, category_id, parent_id)`,
글 기준 `(user_id, category_id, folder_id)`.

```
root:  Folder A 100 · Post X 200 · Folder B 300 · Post Y 400
A 안:  Post 1 100 · Folder C 200 · Post 2 300
```

- gap 100. 중간 삽입은 이웃 두 값의 중간값.
- 자리가 없을 때(`next - prev < 2`)만 **그 컨테이너 하나만** 다시 매긴다.
- 한 번의 drag가 카테고리 전체 행을 다시 쓰지 않는다.
- 컨테이너 안의 비교 순서는 세 군데가 **정확히 같아야** 한다:
  `sort_order → kind('folder' < 'post') → id`
  (DB `post_container_rebalance`/`move_tree_node`, 관리 화면
  `buildPostFolderTree`, Skin Context `buildSkinCategoryTree`).

### 1-3. RPC

| 함수 | 하는 일 |
| --- | --- |
| `create_post_folder(category_id, parent_id, name)` | 컨테이너 **맨 끝**에 생성. 부모 depth ≥ 3이면 거절 |
| `rename_post_folder(folder_id, name)` | 이름만 |
| `delete_post_folder(folder_id)` | 자식 승격 + **자리 물려주기** + 삭제를 한 트랜잭션으로 |
| `move_tree_node(node_type, node_id, target_folder_id, prev_*, next_*)` | 폴더/글 공통 이동 |

**클라이언트는 `sort_order` 숫자를 보내지 않는다.** "무엇을, 어디로,
누구와 누구 사이에"만 보내고 자리 계산은 서버가 한다 — 두 기기에서 동시에
끌어도 서로의 숫자를 덮어쓰지 않는다. 반환값은 이동 후 그 컨테이너의 최종
순서라, 프론트가 낙관적으로 그린 화면을 서버 확정값으로 다시 맞출 수 있다.

**삭제 시 자리 물려주기**(사용자 결정):

```
A                    A
Sentinel      =>     Post 1
  Post 1             Folder B
  Folder B           C
C
```

자식들은 부모 컨테이너의 맨 끝이 아니라 **삭제된 폴더가 있던 자리**를
이어받는다. 구현은 부모 컨테이너를 `(자식 수 + 1) * 1000` 간격으로 한 번
다시 매겨 빈 구간을 확보한 뒤 그 사이에 끼워 넣고, 마지막에 100 간격으로
정리한다.

### 1-4. 권한

- `post_folders`: anon/authenticated에게 **SELECT 컬럼 권한만**. INSERT/
  UPDATE/DELETE는 어느 role에도 GRANT하지 않는다 → 쓰기 경로는 RPC뿐이다.
- `posts`: 기존 GRANT를 건드리지 않고 `folder_id`/`sort_order`를
  **SELECT에만** 추가했다. UPDATE에 넣지 않은 것은 의도적이다 — 넣으면
  클라이언트가 depth/cycle/소유권 검증을 통째로 우회할 수 있다.
- `secret_password_hash`는 이번에도 SELECT GRANT에 등장하지 않는다.
- RPC는 전부 `SECURITY DEFINER` + `search_path = ''` + `auth.uid()` 소유권
  재확인 + anon/PUBLIC EXECUTE revoke.

### 1-5. 신규 글의 위치

새 글은 **root 컨테이너의 맨 위**에 온다(`min(sort_order) - 100`,
BEFORE INSERT 트리거). 오늘의 체감(`created_at DESC`라 새 글이 맨 위)을
그대로 유지하기 위해서다. `posts/editor/posts-save.js`는 `sort_order`를
전혀 모르고, INSERT GRANT에도 없어서 값을 보낼 수조차 없다.

글의 카테고리를 수정 폼에서 바꾸면 트리거가 `folder_id`를 null로 풀고 새
카테고리 root의 맨 위로 보낸다 — 이 처리가 없으면 "폴더에 든 글은 카테고리를
바꿀 수 없다"는 회귀가 생긴다.

### 1-6. 관리 화면 (`?manage=1`)

| 파일 | 책임 |
| --- | --- |
| [posts/manage/posts-folder-data.js](posts/manage/posts-folder-data.js) | 조회 · 트리 구성 · RPC 래퍼 · 스냅샷/롤백 |
| [posts/manage/posts-folder-tree.js](posts/manage/posts-folder-tree.js) | 트리 DOM · 접기/펼치기 · 폴더 CRUD · 오류 문구 |
| [posts/manage/posts-folder-sortable.js](posts/manage/posts-folder-sortable.js) | SortableJS 배선 · drop 판정 · 저장/롤백 |
| [posts/manage/posts-folder-tree.css](posts/manage/posts-folder-tree.css) | 트리 전용 스타일 |

- ~~**한 화면에 정리와 삭제가 같이 있다**(사용자 결정 F-2)~~ —
  **철회됨(관리 UI 정리 라운드, 아래 1-6b)**. 모든 글 행에 체크박스가
  줄지어 서 있는 화면이 관리자 테이블처럼 보인다는 판단이었다. 지금은
  기본 상태가 "정리"이고, 삭제는 별도 모드다.
- `?manage=1`은 이제 **들어가자마자** 이 화면이다. 예전에는 읽기 목록이
  먼저 나오고 `edit`을 한 번 더 눌러야 했는데, PHASE 1H가 스킨의
  `manageHref`를 이 주소로 보내기 시작한 뒤로는 "관리하러 왔는데 읽기
  목록이 나온다"가 됐다.
- 글 행은 트리 안에서도 기존 `.post-list-item` 클래스를 그대로 쓴다 —
  기존 CSS와 선택삭제 동작을 그대로 물려받기 위해서다.
- 폴더 조회에 실패하면 트리 대신 기존 평면 관리 목록이 그려진다. 관리
  화면 자체가 열리지 않는 경로를 만들지 않는다.

### 1-6b. 관리 화면의 두 상태 (관리 UI 정리 라운드)

관리 화면은 이미 사용자가 **명시적으로 관리하러 들어온** 시스템 UI다.
그래서 이 화면의 관리 action은 트리 자신의 상단 툴바 하나로 모은다.

| 상태 | 글 행 | 상단 툴바 | 하단 선택삭제 바 |
| --- | --- | --- | --- |
| 기본(정리) | `≡ 제목 … 날짜` | `+ folder` `+ post` `− delete` … `done` | 없음 |
| 삭제 모드 | `≡ □ 제목 … 날짜` | `+ folder` `+ post` `cancel` … `done` | 하나 이상 골랐을 때만 |

- **체크박스는 삭제 모드에서만 만들어진다**(`postFolderDeleteModeOn`,
  [posts/manage/posts-folder-tree.js](posts/manage/posts-folder-tree.js)).
  그때도 제목과 떨어진 독립 컬럼이 아니라 `≡` 바로 옆 — 관리 action
  영역에 붙는다. 모드를 나가면 선택 상태까지 함께 비운다.
- 삭제 자체는 기존 `deleteSelectedPosts()`를 그대로 쓴다. 새 삭제
  경로를 만들지 않는다.
- **legacy 헤더의 떠 있는 `edit` / `＋` 는 이 화면에서 감춘다**
  (`categoryManageScreenActive`,
  [posts/view/posts-view-transition.js](posts/view/posts-view-transition.js)).
  같은 일을 하는 진입점이 툴바와 헤더에 둘 있으면 어느 쪽이 지금의
  관리 도구인지 알 수 없다. 그래서 나가는 길로 툴바에 `done`을 둔다 —
  `?manage=1`을 뗀 같은 카테고리를 `openCategoryPage()`로 다시 연다.
- **published Skin 쪽 `EDIT` / `WRITE` 진입점 계약은 그대로다.**
  Skin → EDIT → 이 관리 화면으로 들어오는 흐름과 주소(`?manage=1`)는
  바뀌지 않았다.
- 폴더 접기(`▾`/`▸`)는 **화면에서만** 접는다 — `sort_order`도
  `parent_id`도 건드리지 않고 서버 요청도 없다. 접힘 목록
  (`postFolderCollapsedIds`)은 관리 세션 동안만 살아 있고 DB에
  저장하지 않는다. 자식이 없는 폴더의 토글은 비활성이다(빈 폴더의
  컨테이너는 drop 대상으로 계속 열려 있어야 한다).
- 접기는 트리를 통째로 다시 그리지 않고 그 폴더의 자식 컨테이너만
  여닫는다 — 다시 그리면 Sortable 인스턴스와 스크롤이 통째로 날아간다.
  `.folder-tree-container[hidden] { display: none }` 규칙이 반드시
  있어야 한다: UA의 `[hidden]{display:none}`은
  `.folder-tree-container{display:block}`보다 명시도가 낮아 그대로는
  무시된다(이 규칙이 없어서 접기가 동작하지 않던 버그를 여기서 고쳤다).

### 1-7. drag & drop

SortableJS **1.15.6 고정 버전**을 jsDelivr에서 받는다. 방문자에게는 필요
없는 파일이므로 관리 트리를 처음 그릴 때 한 번만 지연 로드한다. 외부 CDN
자산이므로 `?v=${APP_BUILD_VERSION}`을 붙이지 않는다 — URL의 고정 버전이
이미 그 역할을 한다.

- `handle: ".tree-drag-handle"` — 행 전체가 아니라 작은 `≡`만.
- `delay: 180` + `delayOnTouchOnly: true` + `touchStartThreshold: 6` +
  `fallbackTolerance: 4` — 모바일 세로 스크롤과 drag를 갈라놓는다.
- `fallbackOnBody` + `swapThreshold: 0.65` + `invertSwap` — 중첩 리스트
  권장 조합.
- `onMove`에서 자기 자신/자손 drop과 4단계가 되는 drop을 **미리** 막는다.
  서버도 같은 규칙을 강제하지만, 놓을 수 없는 자리를 놓을 수 있는 것처럼
  보여주고 나서 거절하는 것보다 낫다.
- SortableJS를 못 받으면 순서 변경만 조용히 빠지고 폴더 CRUD와 선택삭제는
  그대로 동작한다.

**저장 실패 정책**: ① 스냅샷 → ② 화면/로컬 상태에 먼저 반영 → ③ RPC →
④ 성공하면 서버가 돌려준 컨테이너 순서로 확정 → ⑤ 실패하면 스냅샷으로
되돌리고 다시 그린 뒤 DB에서 재조회 → ⑥ 짧은 오류 문구. 성공 경로에서는
다시 그리지 않는다(펼침 상태와 스크롤이 튀지 않게).

### 1-8. Skin Context

[skin/skin-context.js](skin/skin-context.js)의 `buildCategorySkinContext()`가
`category.posts` 옆에 **additive로** 두 필드를 더 준다.

```js
category: {
  id, name, type, href,

  // 기존 그대로 — 폴더를 모르는 스킨용
  posts: [ { id, title, href, publishedAt, publishedAtLabel, isSecret } ],

  // 신규 — 폴더를 아는 스킨용
  hasFolders: true,
  tree: [
    { kind: "folder", id, name, depth, children: [...] },
    { kind: "post", id, title, href, publishedAt, publishedAtLabel, isSecret, depth }
  ]
}
```

**`category.posts`는 의미도 필드도 정렬도 그대로다.**

- 6개 키 그대로(`href,id,isSecret,publishedAt,publishedAtLabel,title`)
- `created_at DESC` 그대로
- 폴더에 들어간 글도 **빠짐없이** 들어 있다
- 폴더를 만들었다는 이유만으로 이 목록이 달라지면 하위 호환 위반이다.
  그래서 `category.posts`를 트리 DFS 순서로 바꾸지 **않는다**.

`category.tree`만 사용자가 관리 화면에서 정한 `sort_order`를 반영한다.

**폴더에 `href`가 없다**: 폴더를 여는 라우트가 아직 없으므로, 눌러도 아무
일이 없는 링크를 스킨에 노출하지 않는다(PHASE 1H가 banner 카테고리의
`manageHref`를 null로 둔 것과 같은 판단). Series Viewer가 생기는 시점에
additive로 추가한다.

**`kind`로 분기할 수 없다**: `data-imory-if`는 truthy 판정만 하고 비교
연산이 없다. 그래서 폴더에만 있는 필드(`name`/`children`)와 글에만 있는
필드(`title`/`href`)가 겹치지 않게 두 shape를 설계했다 —
`data-imory-if="item.name"` / `data-imory-if="item.title"`로 갈라 쓴다.

### 1-9. Skin 렌더러 — 중첩 repeat

[skin/skin-render.js](skin/skin-render.js)가 FOLDER-1부터 중첩
`data-imory-repeat`을 지원한다(`SKIN_MAX_REPEAT_DEPTH = 5`).

그 전에는 `repeatDepth > 0`이면 경고 후 요소를 **삭제**했기 때문에 어떤
스킨도 계층 구조를 그릴 수 없었다. 폴더 트리를 끝까지 그리려면 4단계가
필요하다(root → 1단계 폴더 안 → 2단계 폴더 안 → 3단계 폴더 안의 글).
한 단계를 여유로 둬 5로 잡았다.

기존 스킨 동작은 바뀌지 않는다 — 지금까지 중첩 repeat은 아예 렌더되지
않았으므로 이 완화로 **사라지던 요소가 되살아날 뿐**이고, 1단계 repeat만
쓰는 기존 스킨의 코드 경로는 이전과 동일하다.

안쪽 `item`은 바깥 `item`을 가린다(일반적인 반복문 관례). 바깥 스코프의
다른 경로(`category.name` 등)는 계속 닿는다.

---

## 2. 보안 — 무엇이 공개되고 무엇이 아닌가

### 2-1. 폴더 이름은 공개된다

`post_folders`는 `categories`와 같은 수준으로 anon SELECT가 가능하다.
공개 페이지가 폴더 구조를 그려야 하기 때문이다. 따라서 **private 글만 들어
있는 폴더라도 그 이름은 REST로 직접 읽을 수 있다.**

이것이 기존 보호를 약화시키지는 않는다:

- 글의 제목/본문/공개 범위는 여전히 `posts`/`post_contents`의 기존 RLS가
  가린다(비소유자에게는 private 글의 **행 자체가 오지 않는다** — 2026-09-08
  프로덕션 실측으로 확인).
- `post_folders`에는 글에 대한 어떤 정보도 없다(글 수도, 제목도).
- 이번 migration은 `posts`/`post_contents`의 RLS를 한 줄도 건드리지 않는다.
- `secret_password_hash`는 SELECT GRANT에 여전히 없다.

폴더 단위 privacy는 FOLDER-1의 범위 밖이다(사용자 결정). 필요해지면 §4에
적힌 대로 별도 설계 항목으로 다룬다.

### 2-2. 방문자에게 아무것도 보이지 않는 폴더

`skin-context.js`의 `buildSkinCategoryTree()`가 **보이는 글이 하나도 없는
폴더 서브트리를 `category.tree`에서 잘라낸다.**

posts는 RLS가 이미 걸러서 오므로, 이 정리는 뷰어별 분기를 따로 쓰지 않아도
저절로 맞는다:

- 방문자 → private 글의 행이 애초에 없다 → 그 글만 든 폴더는 비어 보이고
  → 잘려서 화면에 안 나온다.
- 소유자 → 자기 글이 다 보인다 → 폴더도 다 보인다.
- 글이 아예 없는 빈 폴더도 공개 화면에서는 잘린다(관리 화면에서는 당연히
  보인다 — 거기서 만들고 지운다).

**★ 이것은 표현 계층의 정리이지 보안 경계가 아니다.** 폴더 이름은 §2-1대로
REST로 직접 읽을 수 있다. 화면에서 안 보이는 것과 접근할 수 없는 것은
다르다.

---

## 3. 앞으로 지켜야 할 원칙

1. **폴더 기능을 특정 스킨 디자인에 종속시키지 않는다.** DB/Context에 UI
   의미를 넣지 않는다.
2. **`category.posts`의 의미·필드·정렬을 바꾸지 않는다.** 폴더를 아는 새
   데이터가 필요하면 `category.tree`처럼 별도 네임스페이스를 additive로
   추가한다.
3. **폴더 쓰기는 RPC로만.** `post_folders`나 `posts.folder_id`/`sort_order`에
   대한 INSERT/UPDATE GRANT를 클라이언트 role에 주지 않는다.
4. **정렬 비교는 세 군데가 같아야 한다**(§1-2). 한 곳만 고치면 저장은
   성공했는데 화면 순서가 다른 상태가 된다.
5. **sort_order 정렬을 쓰는 범위를 넓히지 않는다.** 지금은 관리 트리와
   `category.tree`뿐이다. legacy 읽기 목록 / 관련글 / HOME 최신글 / 기존
   스킨의 `category.posts`는 `created_at DESC` 그대로다.
6. **폴더 삭제는 절대 자식을 지우지 않는다.** 승격 정책을 바꾸려면 이
   문서를 먼저 고친다.
7. **직접 만든 drag 엔진을 도입하지 않는다.**

---

## 4. 남은 차이 / 이번에 하지 않은 것

| 항목 | 상태 |
| --- | --- |
| **Series Viewer** | 미구현(범위 밖). `post_folders.id`가 안정적 식별자이고 `category.tree`에 폴더 노드가 있으므로 `/category/:id/folder/:fid` 라우트 + `folder.href`를 additive로 얹으면 된다. **secret/private 글이 섞인 폴더의 본문 이어보기는 기존 비밀글 접근 구조와 충돌 가능성이 있어 별도 보안 설계가 필요하다.** |
| **폴더 단위 privacy/비밀번호** | 없음(범위 밖). §2-1의 "폴더 이름은 공개" 전제가 이 기능이 생기면 달라진다. |
| **폴더 아이콘/색 등 표현 속성** | DB에 두지 않는다(§0). 필요하면 Skin CSS로 한다. |
| **작성 폼에서 폴더 선택** | 없다. 새 글은 항상 root에 생기고, 배치는 관리 화면에서 한다. |
| **폴더 이름 중복 방지** | 제약 없음. 같은 컨테이너에 같은 이름을 둘 수 있다. |
| **HOME/관련글/최신글의 폴더 인식** | 없다. 폴더는 CATEGORY 안의 개념이다. |
| **4단계 이상** | 구조적으로 막혀 있다(CHECK + 트리거 + RPC + UI 3중). |
| **데스크톱 네이티브 drag의 자동 테스트** | 없다. SortableJS가 데스크톱에서 쓰는 HTML5 native DnD는 Playwright 마우스 API로 일으킬 수 없어서, 포인터 drag는 터치 경로로만 자동 검증한다(§5). 데스크톱 drag는 실기 확인 항목이다. |

---

## 5. 테스트

| 무엇을 | 어디서 | 결과 |
| --- | --- | --- |
| SQL 구조·트리거·RPC·backfill·GRANT | 실제 PostgreSQL(PGlite)에서 migration 3종을 그대로 실행 | 54/54 통과 |
| 실제 Supabase 인스턴스 확인 절차 | [supabase/tests/20260908_post_folders_manual_test.sql](supabase/tests/20260908_post_folders_manual_test.sql) | **미실행 — 사용자 확인 필요** |
| 관리 트리 렌더·CRUD·drop 판정·터치 drag·롤백 | [posts/posts-folder-manage-e2e-test.mjs](posts/posts-folder-manage-e2e-test.mjs) (포트 8941) | 30/30 통과 |
| `category.tree` shape·마스킹·잘라내기·`category.posts` 불변 | [skin/skin-page-context-test.html](skin/skin-page-context-test.html) | 99/99 통과 |
| 중첩 repeat 4단계 + 상한 | [skin/skin-render-test.html](skin/skin-render-test.html) | 44/44 통과 |
| 기존 관리/스킨 동선 회귀 | `skin/skin-write-manage-e2e-test.mjs` · `skin-published-frame` · `skin-banner-page` · `studio/studio-inspector` | 147 / 64 / 216 / 34 전부 통과 |

**구분해서 읽을 것**: 위 표에서 "통과"는 전부 **mock 또는 로컬 엔진** 결과다.
실제 Supabase DB 반영, Cloudflare 배포 확인, 실기기(iOS/Android) drag 확인은
아직 하지 않았다.
