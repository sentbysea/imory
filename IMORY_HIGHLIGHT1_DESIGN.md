# HIGHLIGHT-1 — 글 뷰어 도구 · 하이라이트 · 메모 카테고리

글 읽기 화면에서 문장을 하이라이트하고 메모를 남기는 기능, 그리고 그 카드를
한 화면에 모아 보는 메모 카테고리의 기준 문서.

| 구분 | 내용 |
| --- | --- |
| DB | [supabase/migrations/20260913100000_post_highlights_and_memo_folders.sql](./supabase/migrations/20260913100000_post_highlights_and_memo_folders.sql) |
| 위치 계산 | [posts/view/posts-view-highlight-anchor.js](./posts/view/posts-view-highlight-anchor.js) |
| 저장소 | [posts/view/posts-view-highlight-store.js](./posts/view/posts-view-highlight-store.js) |
| 화면·조작 | [posts/view/posts-view-highlight-mode.js](./posts/view/posts-view-highlight-mode.js) |
| 도구 메뉴 | [posts/view/posts-view-tools-menu.js](./posts/view/posts-view-tools-menu.js) |
| 팝오버 | [posts/view/posts-view-popover.js](./posts/view/posts-view-popover.js) |
| 메모 화면 | [posts/view/posts-view-memos.js](./posts/view/posts-view-memos.js) · [skin/skin-memos.js](./skin/skin-memos.js) |
| 폴더 설정 | [admin/settings/admin-settings-memo-folders.js](./admin/settings/admin-settings-memo-folders.js) |
| 스타일 | [posts/posts-highlight.css](./posts/posts-highlight.css) |
| 테스트 | [posts/posts-highlight-e2e-test.mjs](./posts/posts-highlight-e2e-test.mjs) (포트 8952) |

---

## 0. 담당 범위

- **하이라이트·메모는 방문자도 읽는다.** 생성·수정·삭제는 그 블로그 주인장만.
- **기존 열람 제한을 그대로 따른다.** 비밀글·비공개 글·삭제된 글의 발췌문은
  방문자에게 어떤 경로로도 가지 않는다.
- **기존 본문 강조 서식과 새 하이라이트는 별개다.** 기존 강조를 카드로
  변환하지 않고, 새 표시를 지우면 기존 강조가 그대로 드러난다.
- **카드별 비밀번호는 이번 범위가 아니다.** 확장 가능한 저장·권한 구조만 두고
  UI도 컬럼도 만들지 않는다(§8).

---

## 1. 현재 구현 — 저장 구조

### 1-1. `public.post_highlights`

하이라이트 한 행이 곧 **메모 카드 한 장**이다. `note`가 null이면 "메모 없는
카드"이고, 메모 삭제는 `note`를 null로 만드는 것이지 행을 지우는 게 아니다.

```
id uuid pk / post_id bigint fk(cascade) / user_id uuid
color text (#rrggbb, 소문자 정규화)
excerpt text / prefix text(≤120) / suffix text(≤120) / text_start int
note text(≤5000, null 허용)
created_at / updated_at
```

**왜 posts나 post_contents의 컬럼이 아닌가** — 발췌문은 원문의 일부를 그대로
복제한 값이다. 비밀글의 발췌문이 새면 본문이 조각조각 새는 것과 같다. RLS는
행 단위라 "이 글의 하이라이트 행 전체"를 공개 범위로 판정할 수 있고, 그게
정확히 필요한 모양이다 — `post_covers`가 대표 이미지를 분리한 것과 완전히
같은 이유·같은 구조다.

### 1-2. 읽기 경계 (RLS)

```sql
using (exists (select 1 from posts p
               where p.id = post_highlights.post_id
                 and (p.visibility = 'public' or p.user_id = auth.uid())))
```

- 내 글의 하이라이트는 공개 범위와 무관하게 내가 다 본다.
- 남의 글은 그 글이 **public일 때만**.
- 그래서 목록 응답에도, 개수에도, embed에도 보호된 내용이 섞이지 않는다.
- 원문이 삭제되면 cascade로 함께 사라진다.

비밀글을 비밀번호로 연 방문자만은 예외적으로 읽을 수 있어야 하는데, 그 경로는
`get_secret_post_highlights(post_id, password)` **하나뿐**이다. 이 함수는
비밀번호 대조를 직접 하지 않고 원문과 **같은 문**
(`public.get_secret_post_content`)을 호출해 통과 여부만 본다 — 나중에 그쪽
정책이 바뀌어도(잠금 횟수 제한 등) 이 경로가 따로 뒤처지지 않는다.

### 1-3. 쓰기 경계 (RPC 전용)

테이블에는 INSERT/UPDATE/DELETE GRANT가 없다. 네 RPC만이 쓴다.

| RPC | 하는 일 |
| --- | --- |
| `save_own_post_highlight` | 새 항목 / 같은 범위면 색만 변경. 겹침 판정 포함 |
| `update_own_post_highlight_color` | 색만 |
| `update_own_post_highlight_note` | 메모만(빈 값이면 메모 삭제) |
| `delete_own_post_highlight` | 하이라이트 + 카드 삭제 |

전부 `SECURITY DEFINER` + `search_path = ''` + `auth.uid()` 소유권 재확인.
`anon` EXECUTE는 명시적 revoke.

### 1-4. `public.memo_folder_settings`

메모 화면의 폴더(= 원본 글 카테고리)별 표시 설정. `categories`에 컬럼을 더하지
않고 **옆 테이블**로 둔다 — 메모 폴더의 순서·커버를 바꿔도 원본 카테고리의
순서·갤러리 커버가 바뀌지 않고, 반대도 마찬가지다.

```
category_id bigint pk fk(cascade) / user_id uuid
sort_order int
cover_path text(비공개 버킷 경로, SELECT GRANT 없음)
has_cover boolean (generated — 화면이 필요한 건 존재 여부 한 비트뿐)
cover_ratio text ('1:1'|'3:4'|'4:3'|'original')
cover_focus_x / cover_focus_y smallint (0~100)
```

행이 없는 카테고리는 기본값(원본 순서, 커버 없음, 원본 비율, 가운데)으로
그려진다 — 이 기능을 쓰지 않으면 데이터가 하나도 생기지 않는다.

커버 파일은 글 대표 이미지와 **같은 비공개 버킷**(`post-covers`)을 쓰고 같은
프록시가 배달한다: `/api/post-cover?memo=<카테고리 id>` →
`get_memo_folder_cover_object()`. 카테고리 장식이라 카테고리와 같은 공개
범위이고, 판정 없이 경로만 준다(`get_category_cover_object`와 동일).

---

## 2. 현재 구현 — 글 뷰어 도구 메뉴 (⋮)

예전 EDIT 버튼 자리가 메뉴가 됐다.

| | 주인장 | 방문자 |
| --- | --- | --- |
| 글자 크기 조절 | O | O |
| 하이라이팅 모드 | O | — |
| 글 링크 복사 | O | O |
| 글 수정 | O | — |

- **글자 크기**는 기존 `posts/posts-reader-scale.js`를 그대로 쓴다. 그릇만
  스킨의 `post-body` region으로 바꿨다(`initReaderFontScaleForCurrentPost(target)`).
  바꾸는 것은 이번 읽기 화면의 인라인 `font-size` 하나뿐이고, 원본 본문·Quote
  Preset·스킨 저장값은 건드리지 않는다. 비율은 기존대로 localStorage에 남는다.
- **글 링크 복사**는 기존 `buildPostRoute()`로 경로를 만들고 origin만 붙인다.
  관리 쿼리·초대 토큰·비밀번호가 붙을 자리가 없다.
- 메뉴는 `document.body`의 자식이다 — `#postArea`의 `backdrop-filter` 안에서는
  `position: fixed`의 기준이 뷰포트가 아니게 되기 때문이다.
- 바깥 클릭·Escape로 닫히고, 위/아래 화살표로 항목을 오간다. 폭은 화면 너비로
  묶이고 좌우로 잘리지 않는다.

### 2-1. 스킨이 버튼을 바꿀 수 있다

점 세 개는 **기본 외형일 뿐**이다. 스킨이 자기 자리에
`<a data-imory-href="viewer.toolsHref">`를 그리면 플랫폼은 자기 버튼을 접고 그
링크에 같은 메뉴를 연결한다 — 같은 동작이 두 번 나타나지 않는다. 판정 근거는
스킨 이름도 클래스도 아니고 **주소**(`?tools=1`)뿐이다. 스킨이 아무것도 그리지
않으면 플랫폼의 ⋮가 그대로 남는다.

`viewer.toolsHref`는 **주인장/방문자 모두에게 값이 있다** — 이 메뉴는 권한
도구가 아니라 읽기 도구이기 때문이다. 메뉴 안의 항목만 권한에 따라 달라진다.

### 2-2. 자리

떠 있는 도구의 좌표 계산은 기존
[posts/view/posts-view-owner-tools.js](./posts/view/posts-view-owner-tools.js)를
그대로 쓴다. 바뀐 것은 판정 클래스 하나다 — 글 상세에서는
`.post-container--owner-tools`가 아니라 `.post-container--viewer-tools`이고,
CSS 규칙은 `:is(...)`로 둘 다 받는다.

`mountPlatformOwnerTools()`는 **`setupPostViewerTools()` 뒤에** 부른다. 헤더의
높이는 "안에 무엇이 보이느냐"로 정해지는데 ⋮의 `hidden`을 푸는 것이
`setupPostViewerTools()`라, 순서를 바꾸면 아직 비어 있는 헤더를 재게 되어 몇 px
어긋난다.

---

## 3. 현재 구현 — 위치 식별 (§9 요구사항)

**저장하지 않는 것**: CSS 선택자, 화면 좌표, 노드 경로. 스킨이 바뀌면 선택자는
그 순간 의미를 잃고, 글자 크기 한 번이면 좌표가 어긋난다.

**저장하는 것**: 본문의 글자 그 자체 — `excerpt` / `prefix`(앞 120자) /
`suffix`(뒤 120자) / `text_start`(본문 평문 기준 시작 위치).

**다시 찾는 규칙** — "확실할 때만 연결한다":

| 후보 수 | 결과 |
| --- | --- |
| 1개 | 그 자리에 연결 |
| 여러 개 | `text_start`와 **정확히** 같은 후보가 있으면 그것, 없으면 연결하지 않음 |
| 0개 | 연결하지 않음 |

연결하지 않는다는 것은 "잘못된 문장에 표시하지 않는다"는 뜻이고, 발췌문과
메모는 그대로 남아 카드에 보인다. 같은 문장이 여러 번 나오는 글에서 임의의
첫 번째에 붙는 일이 구조적으로 일어나지 않는다.

**평문에 무엇을 세는가**: 본문 그릇 안의 텍스트 노드 전부. 단 플랫폼이 나중에
끼워 넣은 것은 뺀다 — OOC 메모(`.post-detail-ooc`), 복사 상자의 복사
버튼(`.post-copy-box-copy`), 편집 도구(`.post-block-tool`), 이 기능이 만든
UI(`[data-post-hl-ui]`). 세어지면 같은 글인데 주인장과 방문자의 offset이
달라진다. 하이라이트 `<span>`은 글자를 더하지도 빼지도 않으므로 영향이 없다.

**서식을 훼손하지 않는 칠하기**: 범위를 감싸는 요소를 만들어 노드를 옮기지
않는다. 범위에 걸친 텍스트 노드를 각각 쪼개 그 조각만 `<span class="post-highlight">`로
감싼다. 그래서 `<em>`·`<strong>`·형광펜 등 원본 인라인 서식의 구조가 그대로
유지되고, 여러 문단에 걸친 선택도 문단 경계를 넘어 요소를 옮기지 않는다.
지울 때는 그 `<span>`을 자식으로 풀고 `normalize()`한다.

---

## 4. 현재 구현 — 겹침 규칙 (§8 요구사항)

범위는 `[text_start, text_start + length(excerpt))` 반열린 구간이다.

| 경우 | 결과 |
| --- | --- |
| 정확히 같은 범위 | 기존 항목의 **색만** 변경. 메모 유지, 중복 카드 없음 |
| 부분 겹침 / 포함 | 저장 거절 + "그 표시를 눌러 색을 바꿔 주세요" 안내 |
| 경계만 맞닿음 | 겹침이 아니다(반열린 구간이라 자동으로 통과) |
| 떨어진 범위 | 각각 별도 항목 |

**판정을 DB에서 하는 이유**: 클라이언트에서만 판정하면 빠르게 두 번 누른 두
요청이 서로를 못 보고 둘 다 통과한다. 판정과 삽입이 한 트랜잭션 안에 있어야
한다. 추가로 `unique (post_id, text_start, md5(excerpt))` 인덱스가 마지막
방어선이고, 클라이언트도 저장 중에는 다음 저장 요청을 막는다.

---

## 5. 현재 구현 — 하이라이팅 모드와 말풍선

### 5-1. 모드

모드에 들어가도 화면을 다시 그리지 않는다. 화면 아래에 작은 띠(모드 표시 +
**완료**)가 하나 더해질 뿐이다. 완료하면 선택용 도구만 사라지고 저장된
하이라이트는 남는다.

- 모바일은 꾹 눌러, 데스크톱은 드래그로 고른다 — 둘 다 브라우저의 기본 텍스트
  선택이고, 끝났다는 신호가 `selectionchange`다(320ms 디바운스).
- 선택 범위 근처에 색 목록이 뜬다. UI는 에디터의 것을 그대로 재사용한다
  (`openImoryColorMenu`, [posts/editor/posts-color-picker.js](./posts/editor/posts-color-picker.js)).
- **재사용하되 처리는 다르다**: `document.execCommand`도 본문 저장도 없고
  `save_own_post_highlight` RPC 하나만 부른다.

### 5-2. 선택이 풀려 적용되지 않는 문제

두 겹으로 막는다.

1. 색 목록을 여는 **그 순간** 저장할 값(excerpt/prefix/suffix/textStart)을 이미
   확정한다. 그 뒤 선택이 풀리든 말든 저장에 쓰이는 값은 변하지 않는다.
2. 색 목록 안의 버튼은 `pointerdown`에서 기본 동작을 막는다(`bindImoryTapButton`) —
   애초에 선택이 풀리지 않는다.

본문 그릇 밖(제목·버튼·메뉴)이 섞인 선택은 `rangeToPostHighlightAnchor()`가
null을 돌려주어 저장 대상이 되지 않는다.

### 5-3. 말풍선

| 상태 | 누르면 |
| --- | --- |
| 읽기 · 메모 있음 | 메모를 읽는 말풍선(주인장/방문자 공통, 편집 도구 없음) |
| 읽기 · 메모 없음 | 아무것도 열리지 않는다 |
| 하이라이팅 모드 | 메모 / 삭제 (메모가 있으면 "메모도 함께" 표시) |

자리 규칙(`posts-view-popover.js`):

- 기준은 요소가 아니라 **사각형을 돌려주는 함수**다. 여러 줄에 걸친
  하이라이트는 누른 지점이 들어 있는 `getClientRects()` 사각형을 기준으로
  삼는다 — "클릭한 줄 기준".
- 스크롤·회전·크기 변경·글자 크기 변경에 다시 잰다(`scroll` capture + `resize` +
  `orientationchange`, rAF 1회로 합침).
- 위가 모자라면 아래로 뒤집고, 좌우는 화면 안으로 당긴다.
- 기준이 화면 밖으로 나가면 **숨긴다**(닫지는 않는다 — 다시 들어오면 그대로 보인다).

---

## 6. 현재 구현 — 메모 팝업과 카드

메모 팝업: 위에 발췌문, 아래 textarea, 오른쪽 아래 SAVE. 기존 메모를 불러오고,
저장 중/성공/실패를 구분해 알리며, **실패하면 쓴 내용을 그대로 남긴 채 팝업을
닫지 않는다**. 글자 수 제한은 500자가 아니라 5000자다(참고 이미지의 제한을
그대로 들여오지 않는다). 모바일 키보드가 열리면 패널을 화면 안으로 끌어온다.

카드에 들어가는 것: 발췌문 · (있을 때만) 메모 · 원본 글 제목 · 원래 카테고리명 ·
날짜 · 하이라이트 색 · 원문 이동 · (주인장) ⋮.

⋮ 메뉴:

| 상태 | 항목 |
| --- | --- |
| 메모 없음 | 메모 추가 / 하이라이트 삭제 |
| 메모 있음 | 메모 수정 / 메모 삭제 / 하이라이트 삭제 |

- **메모 삭제** = `note`만 null. 하이라이트와 카드는 남는다.
- **하이라이트 삭제** = 행 삭제. 카드도 함께 사라진다(확인 대화상자에서 범위를
  분명히 알린다).

**원문 이동**: 주소에 발췌문도 메모도 싣지 않는다. "이 카드로 간다"만
`sessionStorage`에 적어 두고, 도착한 글이 그 카드를 **실제로 찾았을 때만** 그
자리로 스크롤하고 잠깐 테두리를 준다. 못 찾으면 글은 정상적으로 열리고 "원문이
변경되어 위치를 찾을 수 없습니다"를 알린다 — 엉뚱한 문장으로 데려가지 않는다.

뷰어와 메모 화면은 같은 저장소를 쓰고(`posts-view-highlight-store.js`), 쓰기
RPC가 `imory:post-highlights-changed` 이벤트를 쏜다. 메모 화면은 그 이벤트
하나로만 다시 그린다.

---

## 7. 현재 구현 — 메모 카테고리

| 주소 | 화면 |
| --- | --- |
| `/:slug/memos` | 전체 보기(최신순) |
| `/:slug/memos?view=folders` | 폴더별 보기 |
| `/:slug/memos/category/:id` | 그 폴더의 카드 목록 (`id`는 카테고리 id 또는 `none`) |

여기서 **폴더 = 원본 글의 카테고리**다. 별도의 중첩 폴더 시스템(`post_folders`)을
만들지 않는다.

- 카드가 어느 폴더에 속하는지는 저장된 값이 아니라 **지금의**
  `posts.category_id`다. 그래서 글의 카테고리를 옮기면 카드도 따라 옮겨가고,
  사용자가 카드를 손으로 옮길 일이 없다. 카테고리가 없는 글의 카드는
  "카테고리 없음"(`none`) 폴더에 모여 누락되지 않는다.
- 폴더 카드에는 커버 · 카테고리명 · **열람 가능한** 하이라이트 개수가 나온다.
  개수도 RLS를 통과한 행으로만 센다.
- 전체/폴더별은 "보기 방식"이고, 카드 목록의 기본 정렬은 최신순이다.
  빈 상태·오류 상태를 따로 제공한다(`memos.isEmpty` / `memos.foldersEmpty` /
  `memos.hasError`).

### 7-1. 폴더 표시 설정

Settings의 카테고리 한 줄 아래, 갤러리 표시 설정과 같은 자리에 "메모 폴더" 줄이
붙는다: 순서(↑↓) · 커버 · 비율(1:1 / 3:4 / 4:3 / 원본) · 구도(가로/세로 %).

- 순서는 카테고리 순서를 바꾸는 것과 **같은 ↑↓ 조작**이지만 움직이는 배열이
  다르다(`memoFolderOrder`). 원본 카테고리 배열은 건드리지 않는다.
- 커버 업로드 시점은 글 대표 이미지·카테고리 지정 이미지와 같다 — 고를 때는
  미리보기만, SAVE에서 새 경로에 올린 뒤 행이 저장되면 그때 예전 파일을 지운다.
- 카테고리 행이 모두 저장된 **뒤에** 따로 저장한다. 메모 폴더 저장이 실패해도
  카테고리 저장은 이미 끝나 있고, 그 사실을 그대로 알린다.
- migration이 적용되지 않은 배포에서는 이 줄을 아예 그리지 않는다.

---

## 8. 현재 구현 — 스킨 재료

### 8-1. 새 page type `memos`

`templates.memos`는 banner/folder와 같은 **선택** 템플릿이지만 폴백이 다르다 —
없으면 그 화면이 사라지는 게 아니라 **플랫폼 기본 template**으로 그려진다
(`getDefaultMemosTemplate()`, [skin/skin-template.js](./skin/skin-template.js)).
메모는 스킨의 장식이 아니라 사용자의 데이터라 legacy 화면이 따로 없기 때문이다.

그래서 이 화면은 스킨이 있든 없든 **항상 같은 계약**(`data-imory-*`)으로
그려진다 — 기본값도 고정된 완성 HTML이 아니라 다른 스킨과 똑같은 바인딩
마크업이고, 제작자는 그 구조를 복사해 요소의 순서·태그·클래스를 바꾸면 된다.

Import / Export / normalize / AI 응답 스키마 / Studio Preview 전부 `memos`를
알고 있다.

### 8-2. Context 추가분

| 경로 | 값 |
| --- | --- |
| `page.isMemos` | 메모 화면인가 |
| `navigation.memos` | `{ name, href }` — 어느 화면에서든 메모 화면으로 |
| `viewer.toolsHref` | (POST) 도구 메뉴를 여는 주소. 주인장/방문자 모두 값이 있다 |
| `viewer.highlightHref` | (POST, 주인장) 하이라이팅 모드 지름길 |
| `viewer.canManageMemos` | 표시용. 실제 권한은 DB가 강제한다 |
| `post.href` | 그 글의 정식 공개 주소 |
| `memos.view.{isAll,isFolders,isFolder}` | 보기 방식(정확히 하나만 true) |
| `memos.allHref` / `foldersHref` / `allLabel` / `foldersLabel` | 보기 전환 |
| `memos.cards[]` | `id, excerpt, note, hasNote, color, dateLabel, postTitle, postHref, categoryName, categoryHref, folderHref, isMissing` |
| `memos.showCards` / `isEmpty` / `count` / `hasError` | 상태 |
| `memos.folders[]` | `id, name, href, count, countLabel, coverUrl, hasCover, coverRatio, coverFocusX, coverFocusY` |
| `memos.hasFolders` / `foldersEmpty` / `folder` | 폴더 상태 |

갤러리 재료(`category.gallery`의 커버·비율·제목·링크·목록,
`category.pagination`)는 GALLERY-1에서 이미 제공되고 있으며 이번 라운드에서
바뀌지 않았다 — [IMORY_GALLERY1_DESIGN.md](./IMORY_GALLERY1_DESIGN.md) 참고.

### 8-3. `memo-tools` region

스킨 HTML에는 `<button>`이 들어갈 수 없다(새니타이저가 지운다). 그래서 주인장의
⋮는 카드마다 하나씩 있는 `[data-imory-region="memo-tools"]` 자리에 플랫폼이
넣는다. 그 자리는 `memos.cards` repeat 안에 있어 렌더러가 카드 id를 키로
찍어 두므로(`data-imory-region-key`) DOM 순서가 아니라 **키로** 카드와
짝지어진다. 방문자에게는 빈 채로 남는다. `post-body`/`owner-tools`와 같은
성격의 고정 식별자다.

---

## 9. 앞으로 지켜야 할 원칙

1. **권한은 화면이 아니라 DB가 정한다.** 스킨이 `viewer.canManageMemos`를 무시하고
   도구를 그려도 아무것도 저장되지 않는다. 화면에서 숨기는 것으로 보호를
   대신하지 않는다.
2. **위치는 글자로만 저장한다.** 선택자·좌표·노드 경로를 저장 포맷에 넣지
   않는다. 새 렌더 경로가 생기면 평문 색인에서 제외할 UI에
   `data-post-hl-ui`를 붙인다.
3. **찾지 못하면 표시하지 않는다.** 후보가 애매하면 카드만 남기고 본문에는
   손대지 않는다.
4. **메모는 글자다.** 저장도 표시도 `textContent`로만 한다. 어떤 경로에서도
   HTML로 해석하지 않는다.
5. **실패를 성공으로 표시하지 않는다.** 저장 실패는 입력을 남긴 채 실패라고
   말한다.
6. **메모 폴더 설정과 원본 카테고리 설정을 섞지 않는다.** 한쪽을 바꾸는 코드가
   다른 쪽 컬럼을 건드리면 안 된다.

---

## 10. 추후 — 카드별 비밀번호

이번 단계에서는 **컬럼도 UI도 만들지 않는다**(작동하지 않는 비밀번호 설정을
노출하지 않기 위해). 나중에 붙일 때의 모양만 적어 둔다.

- `post_highlights`에 `lock_password_hash text` 한 컬럼과 해제 RPC 하나를 더하고,
  §1-2의 SELECT 정책은 그대로 두되 "잠긴 카드는 excerpt/note를 빈 값으로 바꾼"
  경로를 새로 얹는다.
- **카드 비밀번호와 원문 비밀번호는 끝까지 별개**다. 카드 잠금을 풀었다고
  보호된 원문에 접근할 수 있으면 안 되고, 그 반대도 아니다.
- 뷰어의 연결 메모와 메모 카테고리 카드는 같은 잠금 정책을 써야 한다 — 둘 다
  같은 행을 보므로 정책을 행 단위로 두면 자동으로 일치한다.
- 잠금 표시(`item.isLocked` 등)도 그때 스킨 재료로 함께 낸다.

---

## 11. 남은 차이 (아직 구현되지 않은 것)

1. **"원문에서 위치를 찾을 수 없음"은 마지막으로 그 글을 열었을 때의 결과다.**
   메모 목록을 그리려고 카드 수만큼의 원문 본문을 받아 다시 판정하지 않는다.
   확인한 적이 없으면 `isMissing`은 false(= 아직 모른다)이고, 그 기록은 이
   브라우저의 localStorage에 있어 다른 기기에서는 그 글을 한 번 열기 전까지
   표시가 없다. 발췌문과 메모는 어느 쪽이든 보존된다.
2. **메모 화면으로 가는 링크는 스킨이 그려야 한다.** `navigation.memos`를
   제공하지만 기존 스킨들은 그 링크를 갖고 있지 않다 — 주소를 직접 치거나
   스킨을 고쳐야 닿는다. 플랫폼 전역 내비게이션에 넣는 것은 다음 라운드다.
3. **메모 폴더 순서는 ↑↓ 조작이다.** 폴더 트리의 "꾹 눌러 끌기"
   ([posts/manage/posts-folder-sortable.js](./posts/manage/posts-folder-sortable.js))는
   `#postArea` 안의 트리 DOM에 묶여 있어 Settings 화면에 그대로 재사용할 수
   없었다. 조작 자체는 기존 카테고리 순서 변경과 같은 모양(↑↓)을 썼다.
4. **Studio Preview로 메모 화면에 가려면 스킨에 그 링크가 있어야 한다.**
   폴더 페이지와 같은 제약이다(페이지 선택 드롭다운이 따로 없다).
5. **카드 목록의 페이지 나누기가 없다.** 하이라이트가 수천 개가 되면 한 번에
   받는다. 갤러리와 같은 `?page=N` 계약을 붙이는 것은 다음 라운드다.
6. **Studio Preview의 메모 카드에는 ⋮가 붙지 않는다.** 그 자리는 공개 화면에서
   플랫폼이 채우는 곳이고, Studio에서 편집자가 볼 것은 자리 자체이지 동작하는
   버튼이 아니다(POST 본문 region과 같은 결).
