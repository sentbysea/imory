# AI SKIN — PHASE 1G: 작성 대상 선택 제거 + 소유자 도구 위치

PHASE 1F에서 WRITE가 옛 LOG 목록을 거치지 않고 곧장 작성 폼으로 가게 됐다.
그 뒤 실사용자가 보고한 것은 두 가지다.

| 보고 | 실제 원인 |
| --- | --- |
| HOME에서 WRITE를 누르면 "어느 카테고리에 쓸까요?"가 먼저 뜬다. 작성 폼에 CATEGORY 드롭다운이 이미 있는데 굳이 필요 없다 | PHASE 1F의 `#postComposePicker` — 글 카테고리가 여러 개일 때만 거치는 선택 패널 |
| 글에 들어가면 오른쪽 **중간**에 `edit` 알약 버튼이 떠 있다 | `.post-container--owner-tools`가 `position: fixed`인데, 담고 있는 `#postArea`에 `backdrop-filter`가 걸려 있어 fixed의 기준이 뷰포트가 아니라 `#postArea`가 된다 |

PHASE 1F의 "카테고리 선택 패널" 계약과 PHASE 1E/1F의 "오른쪽 아래 떠 있는 알약"
설명은 이 문서로 **철회**한다.

> 이 문서는 이 라운드의 기록이다. 표시 공간·화면 전환의 **서 있는 규칙**은
> [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md)가
> 관리한다.

---

## 1. 작성 대상 카테고리 — 중간 화면 없음

`startPostCompose()`(`posts/view/posts-view-compose.js`)의 규칙이 이렇게 바뀌었다.

| 상황 | 예전 (1F) | 지금 |
| --- | --- | --- |
| `categoryId`가 정해져 있음 | 그 카테고리 작성 폼 | 그대로 |
| POST 카테고리 1개 | 그 카테고리 작성 폼 | 그대로 |
| POST 카테고리 여러 개 | 선택 패널 → 고르면 작성 폼 | **첫 카테고리(`sort_order` 최상단)의 작성 폼** |
| POST 카테고리 0개 | 선택 패널 자리에 안내 | **안내 패널**(같은 화면, 목록 없음) |

어느 카테고리에 쓸지는 작성 폼 안의 `#postEditorCategory` 드롭다운이 담당한다.
주소는 `/:slug/category/:id?write=1`로 남으므로 새로고침·뒤로가기 동작은 1F 그대로다
(드롭다운으로 바꾼 대상은 주소에 반영되지 않는다 — 폼의 다른 입력값과 같다).

### 1-1. 드롭다운이 유일한 선택 자리가 됐으므로

`loadPostEditorCategories()`(`posts/editor/format/posts-editor.js`)가 예전에는
`categories` 전체를 조건 없이 불러 채웠다 — 배너 타입 카테고리도, 소유자 scope도
가리지 않았다. 선택 패널이 그 필터를 대신 갖고 있었기 때문에 드러나지 않던 차이다.

지금은 두 자리가 같은 함수를 쓴다:

```
startPostCompose()          ─┐
                             ├─ fetchOwnerPostCategories()   (posts/view/posts-view-compose.js)
loadPostEditorCategories()  ─┘   소유자 scope + type === "post"
```

`keepCategoryId` 옵션 하나만 드롭다운 전용이다 — 수정 중인 글이 이미 들어 있는
카테고리는 type이 어긋나도 목록에 남긴다. 빼 버리면 `select.value`가 `""`가 되어
저장할 때 카테고리가 조용히 바뀐다.

### 1-2. 없어진 것 / 이름이 바뀐 것

| 예전 | 지금 |
| --- | --- |
| `#postComposePicker` (선택 패널) | `#postComposeNotice` (카테고리 없음 안내) |
| `#postComposePickerList`, `.post-compose-picker-item` | 삭제 — 고를 목록이 없다 |
| `#postComposePickerHint` / `Admin` / `Close` | `#postComposeNoticeHint` / `Admin` / `Close` |
| `openComposeCategoryPicker(categories, opts)` | `openComposeCategoryNotice(opts)` |
| `closeComposeCategoryPicker()` | `closeComposeCategoryNotice()` |
| `.post-compose-picker*` CSS | `.post-compose-notice*` (`posts/posts-base.css`) |

안내 패널의 "설정에서 카테고리 만들기" 링크는 이제 항상 보인다 — 이 화면 자체가
카테고리가 하나도 없을 때만 열리기 때문이다(예전에는 `hidden`을 토글했다).

---

## 2. 소유자 도구 — 표시 공간 오른쪽 위 고스트

`.post-container--skin-active.post-container--owner-tools .post-header`
(`posts/posts-base.css`)

| | 예전 | 지금 |
| --- | --- | --- |
| positioning | `position: fixed`, `bottom: 18px`, `right: 16px` | `position: absolute`, `top: 12px`, `right: calc(max(16px, safe-area) + 40px)` |
| 모양 | 흰 배경 + 테두리 + `border-radius: 999px` 알약 | 테두리·배경 없음(고스트), 버튼도 알약 껍데기 없이 회색 글자 |
| 스크롤 | `#postArea`와 함께 흐름 (의도한 적 없음) | `#postArea`와 함께 흐름 (의도한 대로 — 글 위쪽에 속한 도구다) |

**왜 `fixed`가 화면 기준이 아니었나** — `#postArea`에 `backdrop-filter: blur(5px)`가
있다. `backdrop-filter`가 걸린 요소는 그 안의 `position: fixed` 후손에게 containing
block이 된다. 그래서 예전 알약은 "뷰포트 아래"가 아니라 "`#postArea` 아래"에
놓였고, 본문이 짧으면 아무것도 없는 흰 여백 한가운데에, 긴 글을 읽는 중에는 화면
중간 오른쪽에 떠 있는 것처럼 보였다. 지금은 기준을 숨기지 않고 `absolute`로
못 박았다.

**오른쪽 40px 여백** — 같은 모서리를 `.music-button`(`home/bgm.css` — fixed, 오른쪽
위 16px, 28px)이 쓴다. BGM을 설정한 사이트에서만 나타나므로 "있을 때만 비키는"
규칙을 만들 수 없어, 그 자리(16 + 28)를 항상 비워 두고 그 왼쪽에 앉는다.

이 규칙은 배너 관리(`#bannerEditToggleButton`), 글 목록 관리
(`#postListEditToggleButton`), 글 상세 관리(`#postManageToggleButton`), 추가
(`#postAddButton`)에 모두 적용된다 — 예전과 같이 화면에 따라 셋 중 하나만 보인다.

**남은 차이** — 좁은 화면에서 스킨이 자기 상단 띠 오른쪽에 무언가를 그리면 그 위에
얹힐 수 있다. 스킨 계약에 소유자 도구용 자리(slot)가 없어 플랫폼이 좌표로만
피할 수 있기 때문이다(기준 문서 §5 D3 / D5).

---

## 3. 이 변경이 바꾸지 않는 것

- 에디터, 저장/삭제 로직, 권한 검사, 비밀글, Quote Preset — 전부 기존 코드 그대로.
- `viewer.writeHref`(`skin/skin-context.js`) — 카테고리가 여러 개면 여전히 HOME
  작성 주소(`/:slug?write=1`)를 준다. 스킨은 category id도 작성 폼 주소도 모른다.
- `?write=1` / `?edit=1` / `?manage=1` 주소 계약, 복귀·스크롤·미저장 입력 보호.
- 스킨을 쓰지 않는 배포의 legacy 경로.
- DB / RPC / RLS — 변경 없음.

---

## 4. 검증

`node skin/skin-write-manage-e2e-test.mjs` → **96 passed, 0 failed**
`node skin/skin-banner-page-e2e-test.mjs` → **214 passed, 0 failed**
(둘 다 headless Chromium, mobile-390 / desktop-1280 두 뷰포트)

| 대상 | 파일 |
| --- | --- |
| WRITE → 고르는 화면 없이 첫 카테고리 작성 폼 (0/1/여러 개) | `skin/skin-write-manage-e2e-test.mjs` |
| 드롭다운이 소유자의 POST 카테고리만 보여주고(배너 카테고리 제외) 대상 변경이 되는지 | 같은 파일 |
| 카테고리 0개 → 안내 패널 + 설정 진입점 | 같은 파일 |
| 비소유자·로그아웃의 `?write=1` 차단과 주소 정리 | 같은 파일 |
| 소유자 도구가 표시 공간 오른쪽 **위**에 있는지(offset), 알약 껍데기가 없는지 | `skin/skin-banner-page-e2e-test.mjs` |
| `headerPosition === "absolute"` (CATEGORY / POST 소유자 화면) | 같은 파일 |

저장/삭제의 실제 DB 반영은 위 E2E에서 검증하지 않는다 — Supabase 응답이 mock이라
화면 전환과 주소만 본다. 실기기 확인과 배포 확인은 하지 않았다.
