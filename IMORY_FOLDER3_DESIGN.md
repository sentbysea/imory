# FOLDER-3 — 폴더 안에서 바로 쓰기 · 소유자 도구의 자리

작성일: 2026-09-12

앞선 라운드: [IMORY_FOLDER1_DESIGN.md](./IMORY_FOLDER1_DESIGN.md)(카테고리 안 3단계
폴더) · [IMORY_FOLDER2_DESIGN.md](./IMORY_FOLDER2_DESIGN.md)(폴더 라우트 · Series
Viewer). 이 문서는 그 두 문서가 남겨 둔 두 가지를 다룬다.

---

## 0. 이 라운드가 바꾼 것 (요약)

| | 이전 | 지금 |
| --- | --- | --- |
| 글쓰기 폼 | CATEGORY 드롭다운 하나 | CATEGORY 아래 **FOLDER 드롭다운**이 하나 더 |
| 폴더 배치 | 글을 쓴 뒤 `?manage=1` 관리 트리에서 끌어다 놓기 | 쓰면서 고른다(수정 폼에서도 옮길 수 있다) |
| 폴더 페이지의 WRITE | 그 **카테고리**의 작성 주소 | 그 **폴더**의 작성 주소(`?write=1`) |
| 소유자 도구(＋/edit) | 표시 공간 오른쪽 위 12px에 고정 | 스킨이 지정한 자리, 없으면 스킨의 글 기둥 첫 줄 |

전부 특정 스킨에 의존하지 않는다 — 새로 만드는 스킨도 예전 스킨도 JSON을
고치지 않고 그대로 적용받는다(4절의 슬롯은 **선택**이다).

---

## 1. 글쓰기 폼의 FOLDER 드롭다운

**현재 구현**: [posts/editor/format/posts-editor-folder.js](./posts/editor/format/posts-editor-folder.js)
· 마크업은 [posts/posts.html](./posts/posts.html)의 `#postEditorFolderField`.

- CATEGORY 드롭다운 바로 아래에 있고, **지금 고른 카테고리의 폴더만** 보여준다.
  카테고리를 바꾸면 목록을 다시 채우고 고르던 값은 버린다(DB 트리거도 같은
  판단을 한다 — 카테고리를 옮기면 `folder_id`가 `null`로 돌아간다).
- 폴더가 하나도 없는 카테고리에서는 **칸 자체가 숨는다**. 고를 것이 없는 빈
  드롭다운을 남기지 않는다.
- 계층은 `ㄴ` 들여쓰기로 나타낸다(`<select>`는 중첩을 표현할 수 없고,
  `optgroup`은 고를 수 없는 머리글이라 폴더 자체를 못 고르게 된다):

  ```
  폴더 없음
  홍차
  ㄴSentinel AU
  ㄴㄴ3단 폴더
  2002
  ```

- 순서는 관리 트리와 같다: 형제끼리 `sort_order` → `id`, 부모 다음에 자식(DFS).
- 수정 폼에서는 그 글이 **지금 들어 있는 폴더**가 미리 골라진 채로 열리고,
  바꾸면 저장할 때 옮겨진다.

### 1-1. 저장은 왜 `move_tree_node()`로만 하는가

`posts.folder_id`에는 **INSERT/UPDATE GRANT가 없다**
([20260908110000_add_posts_folder_id_sort_order.sql](./supabase/migrations/20260908110000_add_posts_folder_id_sort_order.sql)
5절). 클라이언트가 직접 쓰면 depth/cycle/소유권 검증을 통째로 우회할 수 있기
때문이다. 그래서 이 폼도 관리 트리의 drag와 **같은 RPC**를 쓴다.

순서는 이렇다.

1. 글을 평소대로 저장한다(새 글은 카테고리 root에 만들어진다 — posts 트리거가
   root 컨테이너의 맨 위 `sort_order`를 준다).
2. 고른 폴더가 지금 들어 있는 폴더와 **다를 때만** `move_tree_node('post', …)`를
   부른다. 같으면 요청을 보내지 않는다 — 폴더를 건드리지 않은 저장이 그 글의
   순서를 맨 위로 끌어올리면 안 된다.
3. 자리는 그 컨테이너의 **맨 위**다. `move_tree_node()`는 이웃을 주지 않으면
   `sort_order` 100에 놓으므로, 대상 컨테이너의 첫 노드를 `next` 이웃으로 넘겨
   그 앞에 끼운다. 새 글이 root 맨 위에 오는 규칙(FOLDER-1 D-1)과 같게 맞춘 것이다.

**실패했을 때**: 글은 이미 저장돼 있다. "글은 저장했지만 폴더 이동에
실패했습니다"를 폼에 남기고 화면을 넘기지 않는다 — 새 글이었다면 수정 모드로
전환해 두므로 save를 다시 눌러도 글이 하나 더 생기지 않는다.

---

## 2. 폴더 안에서 WRITE

**현재 구현**: `viewer.writeHref`(폴더 페이지) — [skin/skin-context.js](./skin/skin-context.js) ·
라우터 — [posts/editor/posts-router-init.js](./posts/editor/posts-router-init.js) ·
받는 쪽 — [posts/view/posts-view-compose.js](./posts/view/posts-view-compose.js).

주소는 새로 만들지 않는다. 폴더 경로에 기존 쿼리 하나만 붙인다.

```
/{slug}/category/{cid}/folder/{fid}?write=1
```

- 이 주소는 **요청**이지 권한이 아니다. `?manage=1` / `?write=1` / `?edit=1`과
  같은 규칙으로, 실제로 열지는 `startPostCompose()`가 `isSiteOwnerSignedIn()`으로
  다시 판단한다. 방문자가 주소를 직접 쳐도 폼은 열리지 않고, 주소에서 쿼리를
  떼어 그 **폴더의 읽기 화면**으로 돌아간다(카테고리로 떨어뜨리지 않는다).
- 도달 경로는 셋이고 전부 같은 곳으로 모인다 — 스킨이 그린 WRITE 링크
  (`skin/skin-link-nav.js`), 주소로 직접 접속/새로고침/뒤로가기
  (`posts-router-init.js`), 스킨이 WRITE를 안 그렸을 때 남는 플랫폼 ＋ 버튼
  (`posts-list-detail-nav.js`).
- 폼이 열리면 주소도 그 폴더의 작성 주소로 남는다. 새로고침·뒤로가기·앞으로가기
  어디서 다시 들어와도 같은 폴더가 골라진 폼이 열린다.
- **취소**하면 시작한 그 폴더로 돌아간다. `?write=1` 주소로 곧장 들어와 "진입 전
  화면"이 없는 경우에도 그렇다(`composeOriginFolderId`).
- 관리(EDIT)는 그대로 그 **카테고리**의 관리 화면이다 — 폴더 전용 관리 화면은
  없다.

### 2-1. FOLDER-2에서 철회된 결정

FOLDER-2는 폴더 페이지의 `writeHref`를 카테고리 작성 주소로 두면서 "새 글은 항상
카테고리 root에 생기고 폴더 배치는 관리 화면에서 한다(FOLDER-1 §1-5)"를 근거로
들었다. **이 라운드에서 철회한다** — 실제로는 폴더 안에서 쓰기 시작한 글이 밖에
나와 있고, 관리 화면에 다시 들어가 끌어다 놓아야 했다. FOLDER-1 §1-5의 "새 글은
root에 생긴다"는 DB 층위에서는 그대로다(2번 항목: 만든 뒤 옮긴다).

---

## 3. 왜 폴더 선택을 폼에 넣었나 (관리 트리를 두고)

관리 트리(`?manage=1`)는 **여러 글을 한꺼번에 정리**하는 화면이고, 폼의
드롭다운은 **이 글 하나의 자리**를 정하는 것이다. 둘은 경쟁하지 않는다 — 드롭다운이
생겨도 트리의 drag는 그대로고, 둘 다 같은 RPC를 쓰므로 판정(depth/cycle/소유권)과
순서 계약이 갈라질 여지가 없다.

---

## 4. 소유자 도구(＋ / edit)의 자리

**현재 구현**: [posts/view/posts-view-owner-tools.js](./posts/view/posts-view-owner-tools.js)
· CSS는 [posts/posts-base.css](./posts/posts-base.css)의 `--tools-anchored`.

### 4-1. 문제

PHASE 1E 이후 이 도구는 표시 공간(`#postArea`)의 오른쪽 위 12px에 절대배치돼
있었다. 스킨은 자기 상단에 장식 띠(브라우저 창 모양 헤더 등)를 그리는 경우가
많아, 그 자리에 놓인 edit은 스킨의 어떤 줄과도 맞지 않고 장식 위에 "떠 있는"
것처럼 보였다. 스킨이 바뀔 때마다 픽셀을 손보는 것은 특정 스킨에 의존하는 제품
코드가 되므로 할 수 없다
([SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) 0절).

### 4-2. 두 단계 규칙

**1) 스킨이 자리를 지정했으면 그 자리.** 렌더된 DOM에서
`[data-imory-region="owner-tools"]`를 찾아 **그 요소의 오른쪽 끝, 그 요소가 놓인
줄의 세로 가운데**에 앉힌다.

```html
<nav class="breadcrumb">
  <a data-imory-href="navigation.home.href">HOME</a> /
  <a data-imory-href="post.categoryHref" data-imory-bind="post.categoryName"></a>
  <span data-imory-region="owner-tools"></span>
</nav>
```

```css
.breadcrumb { display: flex; align-items: center; justify-content: space-between; }
```

- 자리 표시는 **비워 둔다.** 스킨은 그 안에 아무것도 넣지 않는다(넣어도 렌더러가
  비운다 — `post-body`와 같은 처리다).
- 방문자에게는 빈 채로 남고 아무것도 나타나지 않는다. 그러니 고정 높이를 주거나
  테두리/라벨을 그리지 않는다.
- 새니타이저 허용 값은 `post-body`와 `owner-tools` 둘뿐이다
  ([skin/skin-sanitize.js](./skin/skin-sanitize.js)). 그 밖의 값은 저장 시점에
  속성째 제거된다.

**2) 지정하지 않았으면 재서 맞춘다.** 스킨의 **본문 블록**을 찾아 그 블록의
콘텐츠 상자(테두리/padding 안쪽) 윗변 높이에, 오른쪽 끝에 맞춰 앉힌다.

- 본문 블록은 POST/FOLDER에서는 플랫폼 표식(`post-body` region)을 품은 top-level
  블록으로 **정확히** 알 수 있다. 표식이 없는 CATEGORY/BANNER에서는 가장 높은
  블록을 본문으로 본다(장식 띠·프로필 띠보다 목록이 크다는 것 외에는 아무것도
  가정하지 않는다).
- 사이드바가 있는 스킨에서는 한 단계 더 좁힌다. region의 조상 사슬을 따라
  내려가되, 그 자식이 **부모 콘텐츠보다 좁거나**(오른쪽 끝을 당기거나) **부모
  콘텐츠가 시작되는 그 줄에서 시작할 때만** 내려간다. 둘 다 아니면 그 자식은 이미
  첫 줄 밑으로 쌓인 본문 자체라 멈춘다.
- 스킨 이름도 클래스도 보지 않는다. 잴 수 없으면 지금까지의 기본 자리를 쓴다.

### 4-3. DOM을 옮기지 않는 이유

슬롯 안으로 `.post-header`를 실제로 옮기면 줄맞춤은 공짜로 얻지만, 스킨 컨테이너를
비우는 지점(`#postList` / `#postSkinContainer`의 `innerHTML` 교체)이 여러 렌더
경로에 흩어져 있어서 한 군데만 복원을 빠뜨려도 ＋/edit 버튼이 문서에서 영영
사라진다. 그래서 DOM은 원래 자리에 그대로 두고 **좌표만** 맞춘다 — 복원할 상태가
CSS 변수 두 개와 클래스 하나뿐이다.

### 4-4. 언제 다시 재는가

렌더 직후(다음 프레임), 스킨 루트의 크기가 바뀔 때(`ResizeObserver` — 사진이 늦게
로드되는 경우), 창 크기가 바뀔 때. 플랫폼 자기 화면(에디터/관리 목록/배너 폼)으로
들어갈 때는 전부 거둔다(`enterPlatformScreen()` · `enterCategoryManageScreen()` ·
`hideBannerSkinListForManagement()`).

### 4-5. 스킨이 EDIT/WRITE를 직접 그린 경우

지금까지와 같다 — 플랫폼 도구 자체가 접히므로(`skin/skin-owner-entry.js`) 이
자리 잡기는 아예 일어나지 않는다.

---

## 5. AI가 만드는 스킨

[functions/api/skin-ai.js](./functions/api/skin-ai.js)의 시스템 프롬프트에
"모든 템플릿의 첫 콘텐츠 줄 오른쪽 끝에 `owner-tools` 자리를 하나 두라"를
넣었다. 앞으로 생성되는 스킨은 4-2의 1)을 타고, 넣지 않은(또는 예전) 스킨은
2)를 탄다.

---

## 6. 확인 범위

| 테스트 | 무엇을 확인했나 |
| --- | --- |
| `skin/skin-folder-page-e2e-test.mjs --only=write` (8944) | 폴더 WRITE href · 폼의 카테고리/폴더 선택 · `ㄴ` 들여쓰기 목록 · 카테고리 변경 시 목록 교체와 칸 숨김 · 취소 복귀 · 직접 접속 · 방문자 거절과 주소 정리 |
| `skin/skin-banner-page-e2e-test.mjs` (8935) | 소유자 도구가 스킨 글 기둥 첫 줄에 맞는지(데스크톱/모바일) · `owner-tools` 슬롯을 그린 스킨에서 그 슬롯에 맞는지 · 슬롯이 비어 있는지 · 방문자에게 안 나오는지 |

**아직 하지 않은 것**

- 실제 DB/프로덕션 확인. 위 두 가지는 전부 mock supabase 위에서 돌린 결과다.
  특히 `move_tree_node()`의 실제 응답(권한·depth 오류 메시지)은 mock이 항상
  성공으로 답하므로 검증되지 않았다.
- 실기기 확인.

---

## 7. 남은 차이

- **`owner-tools` 슬롯은 POST/CATEGORY/FOLDER/BANNER 어디에 두든 동작한다.**
  다만 저장소의 예시 스킨(`skin/test-skins/*.json`)에는 아직 넣지 않았다 — e2e가
  런타임에 끼워 넣어 검증만 한다.
- **HOME에는 소유자 도구가 없다.** HOME은 스킨이 자기 WRITE/ADMIN을 그리는 화면
  이고 플랫폼 ＋/edit이 나타나지 않으므로, 슬롯을 그려도 아무 일도 하지 않는다.
- **폴더 이동 실패의 사용자 문구가 하나뿐이다.** `move_tree_node()`가 돌려주는
  이유(권한/depth/다른 카테고리)를 구분해 보여주지 않는다.
- **갤러리 카테고리의 폴더**는 이 라운드에서 따로 다루지 않았다. `post_folders`는
  카테고리 종류를 가리지 않으므로 갤러리 카테고리에 폴더가 있으면 드롭다운에
  그대로 나온다 — 갤러리 화면이 폴더를 어떻게 보여줄지는 GALLERY 쪽 미해결
  과제다([IMORY_GALLERY1_DESIGN.md](./IMORY_GALLERY1_DESIGN.md)).
