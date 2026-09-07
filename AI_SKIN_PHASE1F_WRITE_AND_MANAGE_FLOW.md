# AI SKIN — PHASE 1F: 작성·관리 동선 정리 + Quiet Frame v3 배너 크기

PHASE 1E에서 소유자도 방문자와 같은 스킨으로 HOME/CATEGORY/POST/BANNER를
보게 됐고, 스킨 위에 WRITE/ADMIN 링크와 떠 있는 소유자 도구(+ / edit)가
생겼다. 그 다음 단계에서 실사용자가 보고한 것은 세 가지다.

| 보고 | 실제 원인 |
| --- | --- |
| WRITE를 누르면 옛 LOG 관리 목록이 먼저 나온다 | `viewer.writeHref`가 `/:slug/category/:id?manage=1`(카테고리 관리 목록)이었고, 거기서 `+`를 한 번 더 눌러야 작성 폼이 열렸다 |
| 탐색/관리 전환 중 옛 로딩 화면이나 흰색 페이드가 남아 있다 | `?manage=1` 진입은 `maybeSkinCandidate`가 false라서 `showPostArea()`의 380ms 흰색 커튼 + `"..."`/`"loading..."` 자리표시를 그대로 탔다 |
| 배너 이미지가 원본 크기대로 나와 제각각이다 | Quiet Frame v2의 `.quiet-banner-image { width: auto }` |

PHASE 1E의 "WRITE → legacy 목록 → `+`" 계약은 이 문서로 **철회**한다.

---

## 1. 주소 계약 — `?write=1` / `?edit=1`

`core/lib/site-path.js`에 `?manage=1`과 같은 모양의 쿼리 두 개를 더 둔다.
경로는 여전히 기존 세 패턴(`/:slug`, `/:slug/category/:id`,
`/:slug/post/:id`) 그대로다.

| 주소 | 뜻 | 받는 곳 |
| --- | --- | --- |
| `/:slug/?write=1` | 대상 카테고리가 아직 없는 작성 요청 | `startPostCompose()` |
| `/:slug/category/:id?write=1` | 그 카테고리에 새 글 작성 | `openNewPostEditor()` |
| `/:slug/post/:id?edit=1` | 그 글의 수정 폼 | `openPostEditor()` |
| `/:slug/category/:id?manage=1` | 목록 관리 패널 (기존 그대로) | `openCategoryPage()` |

세 쿼리 모두 **권한이 아니라 요청**이다. 실제로 열지는 받는 쪽이
`isSiteOwnerSignedIn()` / 글의 `user_id`로 다시 판단한다. 주소를 직접 쳐서
들어온 방문자는 화면이 열리지 않을 뿐 아니라 주소에서도 그 쿼리가 지워진다
— 그대로 두면 "화면은 읽기인데 새로고침하면 다시 작성 요청"이 되는
불일치가 남기 때문이다.

**POST의 `?manage=1`은 폐기했다.** 스킨 POST 위의 떠 있는 버튼이 곧장 수정
폼을 연다. 옛 `?manage=1` 주소로 들어오면 읽기 화면을 보여주면서 라우터가
쿼리를 지운다(`posts/editor/posts-router-init.js`).

---

## 2. `viewer.writeHref` (skin/skin-context.js)

```
POST 카테고리 1개  → buildSiteComposeUrl(그 카테고리 href)
그 외(0개/여러 개) → buildSiteComposeUrl(HOME href)
```

Skin은 여전히 category id도 작성 폼 주소도 모른다. 여러 개일 때 어느
카테고리에 쓸지는 받는 쪽(`posts/view/posts-view-compose.js`)이 고르게
하고, 하나도 없으면 같은 자리에서 안내 + 설정 진입점을 준다.

`WRITE`라는 링크 이름은 그대로다 — 이름을 바꾸거나 숨겨서 해결하지 않는다.

---

## 3. 화면들

| 화면 | 어디에 | 비고 |
| --- | --- | --- |
| 작성/수정 폼 | 기존 `#postEditor` | 에디터·저장/삭제·권한·비밀글·Quote Preset 전부 기존 코드 |
| 카테고리 선택 패널 | `#postComposePicker` (`posts/posts.html`) | 새로 추가된 유일한 화면. 스킨 HTML 밖의 플랫폼 UI |
| 목록 관리 패널 | 기존 `#postList` + 선택 바 | `postListEditToggleButton` — 기존 그대로 |
| 배너 관리 패널 | 기존 `#bannerGrid` + 폼 | `bannerEditToggleButton` — 기존 그대로 |

수정 폼에 `#postEditorDeleteButton`이 생겼다. 옛 상세 화면을 거쳐야만
삭제할 수 있던 자리를 대신하며, 확인 창·삭제 쿼리·삭제 후 이동은
`deleteCurrentPost()` 한 함수를 상세 화면의 delete 버튼과 공유한다
(`posts/editor/posts-list-detail-nav.js`).

### 3-1. mount contract 해제

`enterPlatformScreen()`(`posts/view/posts-view-transition.js`)이 플랫폼
화면을 열기 직전에 `post-container--skin-active` /
`post-area--skin-active` / `post-container--owner-tools`를 벗긴다.
벗기지 않으면 실제로 두 가지가 깨진다:

- 에디터가 프레임 폭/여백 없이 화면 가장자리에 붙는다.
- 떠 있는 소유자 도구의 버튼은 전부 hidden인데 알약 껍데기(테두리+배경)만
  남아 빈 캡슐이 떠 있다.

되돌리는 코드는 따로 두지 않는다 — 복귀는 `openCategoryPage()` /
`openPostPage()`가 렌더 결과에 따라 이 클래스를 다시 붙인다.

---

## 4. 전환

| 상황 | 전환 |
| --- | --- |
| 스킨 CATEGORY/POST 탐색 | 이전 화면 유지 → 완성 후 커튼 없이 교체 (PHASE 1D 그대로) |
| 관리 패널 진입(`?manage=1` 포함) | `useInstantReveal` — 커튼 없음, `"..."`/`"loading..."` 자리표시 없음 |
| 작성/수정/선택 패널 진입 | `showPostAreaInstant()` |
| 느린 응답 | 이전 화면 유지 + 300ms 뒤 작은 대기 표시(`#postPendingIndicator`) |
| 실패 | 오류 문구 + 뒤로가기 경로 복원 (기존 경로 그대로) |
| 연속 클릭 | `categoryPageRequestSeq` / `postPageRequestSeq` (기존 그대로) |

**스킨을 쓰지 않는 배포의 평소 탐색은 한 줄도 바뀌지 않았다.**
`useInstantReveal`은 `maybeSkinCandidate || wantsManageScreen`이고,
`wantsManageScreen`은 소유자 검사를 통과한 관리 요청일 때만 true다.

---

## 5. 종료 · 주소 · 상태

`rememberPlatformScreenReturn()` / `returnToPlatformScreenOrigin()`
(`posts/view/posts-view-transition.js`)이 진입 직전의 주소·화면 종류·스크롤
위치를 담아 두고, 복귀는 기존 렌더 경로를 그대로 다시 태운다.

- 진입은 `pushState`, 종료는 `replaceState` — 나가면서 `?write=1` /
  `?edit=1` 항목을 복귀 지점으로 덮어써서 주소에 남지 않게 한다.
- 주소를 직접 쳐서 들어온 경우(`updateUrl: false`)에는 복귀 지점을 기록하지
  않는다. 그 주소를 복귀 지점으로 삼으면 취소해도 쿼리가 그대로 남는다 —
  대신 호출자가 준 fallback(그 글 / 그 카테고리)으로 간다.
- 저장 후에는 `forgetPlatformScreenReturn()` + `replaceState` — 새 글은 그
  글의 스킨 상세로, 수정은 그 글의 읽기 주소로. 삭제는 그 카테고리 스킨으로.
- `#postArea`는 window가 아니라 자기 안에서 스크롤되므로 `scrollTop`과
  `window.scrollY`를 둘 다 기억한다.

### 5-1. 저장하지 않은 입력 보호

작성/수정 화면이 자기 주소를 갖게 되면서 "뒤로가기 한 번에 쓰던 글이
사라지는" 경로가 실제로 생겼다. `posts/view/posts-view-editor-load.js`가
에디터를 연 순간의 값(제목/본문/OOC)을 기준점으로 잡고, 나가려 할 때만
비교한다.

- 취소 버튼 — `confirm()`, 취소하면 폼에 그대로 머문다.
- 뒤로/앞으로가기 — `popstate`는 막을 수 없으므로, 남겠다고 하면 방금 떠난
  항목을 다시 `pushState`해서 화면과 주소를 되돌린다.
- 탭 닫기 — `beforeunload`(문구는 브라우저가 정한다).

---

## 6. Quiet Frame v3 배너 크기

제품 공용 CSS가 아니라 **SkinPackage의 CSS**에서 고쳤다.

```css
.quiet-banner-list  { display: flex; flex-direction: column;
                      align-items: flex-start; gap: 12px; }
.quiet-banner-item  { max-width: 100%; }
.quiet-banner-link  { padding: 0; gap: 6px; max-width: 100%; }
.quiet-banner-image { width: 240px; max-width: 100%; height: auto; }
```

- 표시 폭 240px, 좁은 화면에서는 `max-width: 100%`가 가용 폭 안으로 줄인다.
- `height: auto` + `object-fit` 미사용 → 자르거나 늘려 찌그러뜨리지 않는다.
- 왼쪽 정렬, 세로 목록, 사이 간격 12px(구분선 대신 `gap` 하나로).
- 프레임·프로필·메뉴·날짜·WRITE/ADMIN은 그대로다.

`.quiet-page *`가 `box-sizing: border-box`이므로 240px에는 1px 테두리
두 개가 포함된다 — 실제 이미지 content box는 238px이고 원본 비율은 거기서
유지된다.

파일: `skin/test-skins/imory-quiet-frame-v3.json` (E2E가 쓰는 사본),
`~/Downloads/imory-quiet-frame-v3.json` (Import용). **v2 파일과 저장된
사용자 스킨은 건드리지 않았다.**

---

## 7. 이 계약이 바꾸지 않는 것

- 에디터, 저장/삭제 로직, 권한 검사, 비밀글, Quote Preset — 전부 기존 코드
  재사용. 새 렌더 경로나 새 저장 경로를 만들지 않았다.
- 스킨을 쓰지 않는 배포의 legacy fallback — 삭제하지 않았다. 목표는
  "스킨 사용자의 동선에서 legacy 페이지 레이아웃 제거"다.
- HOME/CATEGORY/POST/BANNER의 스킨 프레임 폭·여백 — 그대로다.
- DB / RPC / RLS — 변경 없음.
- 사용자 스킨에 JS를 넣지 않는다 — WRITE는 평범한 `<a href>`이고, 그
  주소를 플랫폼(`skin-link-nav.js` / 라우터)이 해석한다.

---

## 8. 검증

| 대상 | 파일 |
| --- | --- |
| `viewer.writeHref` 단위(카테고리 0/1/여러 개, 탐색 링크와의 구분) | `skin/skin-page-context-test.html` |
| WRITE 진입 E2E(0/1/여러 개, 선택 패널, 비소유자·로그아웃 차단) | `skin/skin-write-manage-e2e-test.mjs` |
| CATEGORY `+` / 목록 관리 패널 E2E(전환 중 legacy 자리표시 미노출, 스크롤 복원, 프레임 유지) | `skin/skin-write-manage-e2e-test.mjs` |
| 뒤로가기/앞으로가기/새로고침 주소·화면 일치 E2E | `skin/skin-write-manage-e2e-test.mjs` |
| 느린 응답 / 연속 클릭 E2E | `skin/skin-write-manage-e2e-test.mjs` |
| v3 배너 폭·비율·간격·정렬(v2 대조군 포함) E2E | `skin/skin-write-manage-e2e-test.mjs` |
| POST 수정 동선 E2E(스킨 → 수정 폼 → 취소/저장, `?edit=1` 직접 접속, 비소유자) | `skin/skin-banner-page-e2e-test.mjs` (4-d) |
| WRITE → 작성 폼 E2E, 배너/카테고리 소유자 도구 | `skin/skin-banner-page-e2e-test.mjs` |
| POST 화면 전환 단위(스킨 읽기, secret gate/본문 mount lifecycle) | `skin/skin-post-lifecycle-test.html` (시나리오 E) |

저장/삭제의 실제 DB 반영은 위 E2E에서 검증하지 않는다 — Supabase 응답이
mock이라 화면 전환과 주소만 본다.
