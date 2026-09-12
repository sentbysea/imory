# FOLDER-2 — 폴더 라우트 + Series Viewer

FOLDER-1([IMORY_FOLDER1_DESIGN.md](./IMORY_FOLDER1_DESIGN.md))이 만든 폴더를
**실제로 열 수 있게** 한다. 폴더 전용 주소를 두고, 그 폴더의 direct 글을
관리 화면에서 정한 순서대로 **각 글의 본문이 위에서 아래로 이어지는** 한
화면(Series Viewer)으로 보여준다.

이 문서가 폴더 페이지의 **기준 문서**다. FOLDER-1 문서의 "폴더에 href가
없다" 절은 이 문서로 대체됐다.

---

## 0. 한 줄 원칙

> **폴더 페이지도 스킨이 그리고, 본문은 플랫폼이 region에만 채운다.**

폴더 페이지는 `templates.folder`가 있는 스킨에서만 존재한다. 플랫폼은
폴더 전용 폴백 화면을 만들지 않고, 본문을 Skin Context에 넣지 않으며,
secret/private 글의 접근 규칙을 한 줄도 바꾸지 않는다.

---

## 1. 현재 구현

### 1-1. 주소

```
/:slug/category/:cid/folder/:fid
```

| 어디서 | 파일 |
| --- | --- |
| 공개 라우터(직접 접속·새로고침·뒤로가기) | [posts/editor/posts-router-init.js](posts/editor/posts-router-init.js) `handlePostRoute()` — category 패턴 앞에 4-segment 패턴 |
| 스킨 안 링크 → SPA | [skin/skin-link-nav.js](skin/skin-link-nav.js) `resolveInSiteSkinRoute()` → `openFolderPage()` |
| Studio Preview | [studio/preview/preview-route.js](studio/preview/preview-route.js) `resolveStudioPreviewTarget()` → `{ type: "folder", categoryId, folderId }` |
| 링크 생성 | [skin/skin-context.js](skin/skin-context.js) `buildSkinFolderHref()` |

- `cid`를 URL에 두는 이유: 폴더의 `category_id`는 불변이고(`move_tree_node`가
  다른 카테고리로의 이동을 거절한다), 폴더가 다른 부모 밑으로 옮겨져도 주소가
  바뀌지 않으며, 폴더를 그릴 수 없을 때 돌아갈 곳이 주소에 이미 있다.
- 검증은 "폴더가 존재하고, 이 owner의 것이고, `category_id = cid`"다. 하나라도
  어긋나면 **그 카테고리로 복귀**한다.
- 폴더 주소에는 `?manage=1` / `?write=1` / `?edit=1` 요청 쿼리가 **정의되지
  않는다**. 붙어 들어오면 주소에서 지운다. 관리·작성은 폴더 페이지의
  `viewer.manageHref` / `viewer.writeHref`가 그 **카테고리**의 기존 주소를
  그대로 준다 — 새 글은 어차피 카테고리 root에 생기고(FOLDER-1 §1-5), 배치는
  그 카테고리의 관리 화면에서 한다.

  > **`?write=1` 부분은 FOLDER-3에서 변경됨 →
  > [IMORY_FOLDER3_DESIGN.md](./IMORY_FOLDER3_DESIGN.md) 2절.** 폴더 주소에
  > `?write=1`이 **정의됐다** — 그 폴더에 새 글을 쓰는 요청이고, 작성 폼의 FOLDER
  > 드롭다운이 그 폴더로 미리 맞춰진다. `?manage=1` / `?edit=1`은 여전히 정의되지
  > 않아 그대로 지운다.
- history state는 `{ page: "folder", categoryId, folderId }`,
  `currentPostView`에 `"folder"` 값이 추가됐다(`currentPostFolderId`는
  [posts/view/posts-view-folder.js](posts/view/posts-view-folder.js)가 선언).

### 1-2. 카테고리로 복귀하는 경우 (폴더 전용 폴백 없음)

다음은 전부 `fallbackFolderPageToCategory()`(posts-view-folder.js) 하나로
끝난다 — 링크로 들어왔으면 카테고리 주소를 push, 직접 접속이면 현재
history 항목을 카테고리 주소로 replace한 뒤 `openCategoryPage()`.

- published 스킨에 `templates.folder`가 없다
- 폴더가 없다(삭제됨) / 이 카테고리의 폴더가 아니다 / 다른 owner다
- **이 뷰어에게 보이는 direct 글이 하나도 없다** — 방문자에게 private 글뿐인
  폴더, 하위 폴더에만 글이 있는 폴더, 빈 폴더(사용자 결정: 빈 폴더 페이지를
  만들지 않는다)
- 스킨 후보가 아닌 배포(비-scoped) / 렌더 실패 / FOLDER 템플릿에 본문 자리가
  없다

### 1-3. Skin Context

**`category.tree`의 폴더 노드 (additive)** — [skin/skin-context.js](skin/skin-context.js) `buildSkinCategoryTree()`

```js
{ kind: "folder", id, name, depth,
  folderHref,   // 문자열 | null
  postCount,    // 이 폴더에 직접 든(하위 폴더 제외) 보이는 글 수
  children: [...] }
```

- **`href`가 아니라 `folderHref`다.** 스킨과 AI 프롬프트가 "글 가지 = `item.href`가
  있는 노드"로 분기하므로(FOLDER-1 §1-10), 폴더에 `href`를 넣으면 폴더에서 글
  가지까지 그려진다. `item.href` = 글 판정 계약은 그대로다.
- `folderHref`는 두 조건을 모두 만족할 때만 문자열이다:
  1. 렌더 중인 스킨에 `templates.folder`가 있다 — 호출자가
     `options.supportsFolderPage`로 넘긴다(`skin/skin-category.js`는
     `skinPackageSupportsPageType(skinPackage, "folder")`,
     `studio/preview/preview-navigation.js`는 `resolveSkinTemplate(currentWorkingSkin, "folder")`).
  2. 그 폴더에 보이는 direct 글이 하나 이상 있다(`postCount > 0`).
  그 외에는 `null` — 눌러도 아무 일이 없는 링크를 노출하지 않는다. 스킨은
  반드시 `data-imory-if="item.folderHref"`로 감싼다.
- `category.posts`, 글 노드 shape, 정렬은 FOLDER-1 그대로다.

**폴더 페이지 context** — `buildFolderSkinContext(ownerId, categoryId, folderId, options)`

```js
page:     { type: "folder", isFolder: true, isCategory: false, ... }
category: { id, name, type, href }                      // 상위 카테고리
folder: {
  id, name, depth,
  href,        // 이 폴더 페이지
  parentHref,    // 가장 가까운 열 수 있는 상위 — 부모 폴더 페이지 또는 카테고리
  ancestors: [ { kind: "folder", id, name, depth, folderHref, postCount } ],  // 카테고리 바로 아래부터 부모까지
  children:  [ { kind: "folder", id, name, depth, folderHref, postCount } ],  // 직속 하위 폴더(보이는 글이 있는 것만)
  posts:     [ { id, title, href, publishedAt, publishedAtLabel, isSecret, editHref } ],  // direct 글만, sort_order 순
  postCount
}
viewer: { ...base, writeHref: 카테고리 ?write=1, manageHref: 카테고리 ?manage=1 }  // 소유자만, 아니면 null
                   // ↑ writeHref는 FOLDER-3에서 **이 폴더의 ?write=1**로 변경됨
                   //   (IMORY_FOLDER3_DESIGN.md 2절)
```

- 같은 카테고리의 `category.tree`를 만드는 것과 **같은 조회·정렬·마스킹·
  잘라내기**를 거친 뒤 그 트리에서 노드 하나를 꺼낸다 — CATEGORY 화면의 폴더
  카드 안 순서와 폴더 페이지의 순서가 어긋날 수 없다(FOLDER-1 §1-2 "세 군데가
  같아야 한다"에 네 번째 소비자가 아니라 같은 함수가 추가된 것이다).
- `folder.posts`는 **direct 글만**이다. 하위 폴더의 글은 재귀 포함하지 않는다
  (사용자 결정). 하위 폴더는 `folder.children`으로 **탐색만** 한다.
- `editHref`는 소유자에게만 `?edit=1` 수정 폼 주소이고 방문자에게는 `null`이다.
  쿼리는 요청일 뿐이고 작성자 검사는 `openPostEditor()`가 다시 한다.
- `parentHref`는 **정적인 상위 링크**다(부모 폴더 페이지, 없으면 카테고리).
  이름을 `backHref`로 두지 않은 이유: "뒤로 가기"(browser history)는 스킨
  계약으로 표현할 수 없다는 것이 AI-6B.1의 감사 항목이고
  (`studio/studio-selected-ai-e2e-test.mjs` H3/H4가 `skin-context.js`에
  `backHref`가 없음을 소스 검사한다), 이 값은 그 capability가 아니다.
- **본문은 없다.** `content`/`ooc_content`/`visibility`는 어디에도 없다.

### 1-4. 렌더러 — repeat 안의 post-body region N개

[skin/skin-render.js](skin/skin-render.js)

- 폴더 템플릿은 `data-imory-repeat="folder.posts"` 안에 글마다
  `data-imory-region="post-body"`를 둔다. region 이름은 여전히 `post-body`
  하나뿐이다(sanitizer 변경 없음).
- `applySkinRepeat()`가 clone을 만든 뒤 그 안의 region에 **항목 키**를
  플랫폼 소유 속성 `data-imory-region-key="<item.id>"`로 찍는다. 이 속성은
  스킨 HTML에서 올 수 없다(속성 화이트리스트에 없어 저장·렌더 전에 제거된다).
  안쪽 repeat이 먼저 찍으므로 중첩에서도 가장 가까운 항목의 키가 남는다.
- 새 API `instance.getRegions(name) -> [{ key, element }]` (DOM 순서, repeat
  밖은 `key: null`). 기존 `getRegion()`(첫 번째 하나)은 그대로다 — POST 계약
  불변.
- 채우는 쪽은 DOM 순서가 아니라 **키로** 글과 region을 짝짓는다.

### 1-5. Series Viewer — 본문 채우기 (published)

[posts/view/posts-view-folder.js](posts/view/posts-view-folder.js) `openFolderPage()` → `fillFolderSeriesBodies()`

1. 스킨을 detached 스크래치에 그린 뒤(요청 순번 + 화면 종류로 늦은 응답
   차단) `#postList`로 옮기고 `revealPostArea(true)`. mount 클래스·소유자
   도구는 CATEGORY와 같은 계약이다(목록 편집 토글만 폴더 페이지에서는 켜지
   않는다 — 그 토글은 CATEGORY 전용 동작이라 관리는 스킨의 EDIT으로 간다).
2. `instance.getRegions("post-body")`에서 키 있는 region만 모은다.
3. `posts`에서 그 글들의 `content_type / visibility / quote_preset_id`를
   `.in()` 한 번으로 읽는다(Context에는 없는 값, 같은 RLS를 거친다).
4. **읽을 수 있는 본문**만 `post_contents`를 `.in()` 한 번으로 읽는다 —
   비소유자 뷰어에게는 secret 글 id를 배치에 넣지 않는다(§2).
5. region마다 순차로: secret + 비소유자 → `mountPostSecretGate(element, …)`;
   그 외 → `renderPostBodyInto(element, …)`. 순차인 이유: Quote Preset 로더가
   전역 `postStyleSettings`를 덮어쓴다.

**공용화한 두 함수(FOLDER-2에서 꺼냄, 동작 변경 없음)**

| 함수 | 파일 | 무엇을 |
| --- | --- | --- |
| `renderPostBodyInto(target, contentType, contentText, quotePresetId)` | [posts/view/posts-view-detail.js](posts/view/posts-view-detail.js) | 원래 `renderPostDetailBody()`의 Skin 분기. POST region·폴더 region·비밀글 해제가 전부 이것을 쓴다 |
| `requestSecretPostContent(postId, password)` | [posts/view/posts-view-secret-gate.js](posts/view/posts-view-secret-gate.js) | `get_secret_post_content` RPC 호출의 유일한 지점. legacy 싱글턴 폼과 `mountPostSecretGate()`가 공유 |

`mountPostSecretGate(target, { postId, contentType, quotePresetId })`는 같은
클래스 구조(`.post-secret-gate*`, id 없음)의 폼을 글마다 새로 만들어 그 글의
region에 둔다. legacy `#postSecretGate` 싱글턴은 POST 화면에서 그대로 쓰인다.

### 1-6. 스크롤·복귀

- 목록 스크롤 기억(`skin/skin-post-focus.js`)에 `folder:<fid>` 키가 추가됐다.
  폴더 → 글 → 뒤로가기면 폴더의 위치로, 카테고리 → 폴더 → 뒤로가기면
  카테고리의 위치로 돌아온다(한 칸 메모라 그 이상은 기억하지 않는다).
- 수정 폼 취소 복귀(`returnToPlatformScreenOrigin`, posts-view-transition.js)에
  `view: "folder"` 분기가 추가됐다.

### 1-7. Studio Preview

- `previewHistory` 항목 `{ type: "folder", categoryId, folderId }`,
  `currentPreviewPageType = "folder"`(CODE 버튼이 `templates.folder`를 편집
  대상으로 잡는다). [studio/preview/preview-navigation.js](studio/preview/preview-navigation.js) `renderFolderPreviewFor()`.
- 본문은 `preview:post-body`와 같은 별도 채널 **`preview:folder-bodies`**
  (`{ bodies: [{ key, html, containerStyle, isHtmlContent }] }`).
  [studio/preview/preview-post-body.js](studio/preview/preview-post-body.js)
  `buildStudioFolderBodiesPayload()`가 만들고 [studio/preview/preview-bridge.js](studio/preview/preview-bridge.js)가
  `getRegions()`의 키로 채운다. Studio는 소유자 세션이라 gate 분기가 없다.
- `templates.folder`가 없으면 unsupported overlay("이 스킨에는 아직 FOLDER
  템플릿이 없습니다") — 공개 화면은 카테고리로 복귀하지만 편집자에게는 "없다"를
  보여주는 편이 맞다. 폴더가 없거나 보여줄 글이 없으면 empty overlay.
- 본문 자리가 없는 FOLDER 템플릿은 POST와 같은 unsupported 처리
  (`hasPostBodyRegion`), CODE Apply도 같은 검사(`applyWorkingSkinChanges`).
- fixture: `studio/studio-lifecycle-scenario.html?scenario=t`에 folder 템플릿과
  `post_contents`가 추가됐다.

### 1-8. Import / Export / normalize / AI

- `templates.folder`는 **선택**이다(banner와 같은 규칙) — [skin/skin-template.js](skin/skin-template.js)
  `SKIN_TEMPLATE_PAGE_TYPES`, [skin/skin-package-import.js](skin/skin-package-import.js)
  (있으면 post-body region 필수, reason `folder-template` / `folder-body-region`),
  [skin/skin-package-normalize.js](skin/skin-package-normalize.js), [skin/skin-package-export.js](skin/skin-package-export.js).
- [functions/api/skin-ai.js](functions/api/skin-ai.js): 스키마의 `templates.folder`(null 허용),
  결과 병합은 banner와 같은 한 방향 관대함, 시스템 프롬프트에 `folderHref`
  규칙과 "### FOLDER" 절(경로·direct 글만·`folder.*` 필드·repeat 안 region·
  읽기 흐름). 검증: `studio/studio-ai-panel-e2e-test.mjs` A6 / K2 / K3 / K9.
- Element Inspector / Selected AI는 pageType 일반형이라 `folder` 라벨만 추가됐다
  ([studio/ai/studio-ai-selection.js](studio/ai/studio-ai-selection.js)).

### 1-9. 예시 스킨

[skin/test-skins/imory-finder-folders-v2.json](skin/test-skins/imory-finder-folders-v2.json)
— v1에 (1) CATEGORY 폴더 카드 머리의 `OPEN` 링크(`data-imory-if="item.folderHref"`),
(2) `templates.folder`: breadcrumb(HOME / 카테고리 / 열 수 있는 조상) →
제목(`folder.name`) + 글 수 → 하위 폴더 칩 → `folder.posts` 반복(제목·날짜·
소유자 EDIT · `post-body` region) → BACK. 글 사이는 점선 하나뿐이다.
기존 published 스킨을 자동으로 바꾸지 않는다.

---

## 2. 보안

### 2-1. production 실측 (2026-09-09, anon key)

| 대상 | posts 행 | post_contents 행 |
| --- | --- | --- |
| public | 보임 | 본문 반환 |
| secret | 제목 행 보임 | **0건** (`post_id=in.(…)` 직접 조회, `content=not.is.null` 필터 우회 시도도 0건) |
| private | **0건** | 보이지 않는 글의 본문 행 없음 |

`get_secret_post_content(id, 틀린 비밀번호)`는 `P0001`로 거절된다.
authenticated **비소유자** 계정으로는 실측하지 못했다(계정 없음) — 그래서
클라이언트가 RLS와 무관하게 아래 규칙을 지킨다.

### 2-2. 규칙

- 비소유자 뷰어의 `post_contents` 배치 요청에 **secret 글 id를 넣지 않는다.**
  본문은 비밀번호를 맞힌 뒤 `get_secret_post_content` RPC로만, 글 하나씩 온다.
  폴더 단위 해제나 새 배치 RPC는 없다.
- 본문은 Skin Context에 절대 넣지 않는다(`data-imory-bind`로 본문에 닿는 경로가
  없다). region 채움 방식만 쓴다.
- private 글은 RLS가 행을 주지 않으므로 방문자의 목록·본문 어디에도 없다.
  소유자에게는 🙈 제목으로 포함된다.
- html 모드 글의 raw `innerHTML`은 기존 POST와 같은 신뢰 경계다(새 정책 아님).
  한 화면에 여러 개가 들어갈 뿐이다.
- 폴더 이름 공개(FOLDER-1 §2-1)는 그대로다. 보이는 글이 없는 폴더의 주소는
  카테고리로 복귀하므로 이름만 있는 빈 페이지는 생기지 않는다.

---

## 3. 앞으로 지켜야 할 원칙

1. **폴더 링크는 `folderHref`, 글 링크는 `href`.** 폴더 노드에 `href`를 넣지
   않는다 — 그 순간 folder-aware 스킨의 글 판정이 깨진다.
2. **`folderHref`는 열 수 있을 때만 문자열이다.** 스킨에 폴더 페이지가 없거나
   direct 글이 없으면 null. 조건을 늘리려면 이 문서를 먼저 고친다.
3. **폴더 전용 폴백 화면을 만들지 않는다.** 그릴 수 없으면 카테고리로.
4. **본문은 Context가 아니라 region이다.** 폴더 페이지도, 앞으로 생길 어떤
   목록형 본문 화면도 같다.
5. **secret 본문의 경로는 `requestSecretPostContent()` 하나.** 비소유자 배치
   조회에 secret id를 넣지 않는다.
6. **`folder.posts`는 direct 글만.** 재귀 포함은 별도 결정 사항이다.
7. `sort_order` 정렬의 소비자는 관리 트리 · `category.tree` · `folder.posts`
   (같은 함수) 셋이다. legacy 목록/HOME/`category.posts`는 `created_at DESC`
   그대로다.

---

## 4. 남은 차이 / 이번에 하지 않은 것

| 항목 | 상태 |
| --- | --- |
| **stale 응답 자동 테스트** | 폴더 → 다른 화면 이동 중 늦게 도착한 폴더 응답이 화면을 덮지 않는 보호는 구현돼 있으나(요청 순번 + 화면 종류), e2e는 0ms RTT라 재현하지 못한다. 실기/지연 서버 확인 항목 |
| **authenticated 비소유자 RLS 실측** | 계정이 없어 anon만 실측. 클라이언트 규칙(§2-2)으로 방어 |
| **폴더 페이지의 목록 편집 토글** | 켜지 않는다. 관리는 스킨 EDIT(카테고리 `?manage=1`) 또는 카테고리 화면의 도구로 |
| **하위 폴더 글 재귀 포함** | 없음(사용자 결정). 필요하면 별도 옵션으로 |
| **`ooc_content` anon 노출** | 실측 중 발견한 기존 상태. 이번 범위 밖 |
| **mount 클래스 붙이는 곳** | 기준 문서 §5 D2의 반복이 한 벌 더 늘었다(posts-view-folder.js) |
| **Studio에서 폴더 페이지 첫 진입** | Preview는 CATEGORY의 OPEN 링크를 통해서만 간다(공개 화면과 같다). 별도 page selector는 없다 |

---

## 5. 테스트

| 무엇을 | 어디서 |
| --- | --- |
| `getRegions()` 키 매핑 · 스킨이 쓴 `data-imory-region-key` 제거 · `getRegion()` 불변 | [skin/skin-render-test.html](skin/skin-render-test.html) D-4 |
| `folderHref` 조건 · `postCount` · `buildFolderSkinContext()` shape/direct only/ancestors/children/editHref/null 경우 | [skin/skin-page-context-test.html](skin/skin-page-context-test.html) FOLDER-2 절 |
| 공개 화면 — OPEN 링크 조건, 폴더 페이지(direct only·본문·children·breadcrumb·BACK·EDIT), 소유자 secret/private 본문, 방문자 글별 gate(오답/정답, 네트워크에 secret id 없음), 카테고리 복귀 5종, 직접 접속·뒤로가기·모바일, templates.folder 없는 스킨 | [skin/skin-folder-page-e2e-test.mjs](skin/skin-folder-page-e2e-test.mjs) (포트 8944) |
| Studio Preview — 같은 JSON으로 OPEN 링크·폴더 페이지·`preview:folder-bodies`·CODE 활성·empty/unsupported overlay | 같은 파일 `--only=preview` |
| AI 프롬프트/스키마 계약 | [studio/studio-ai-panel-e2e-test.mjs](studio/studio-ai-panel-e2e-test.mjs) A6 / K2 / K3 / K9 |
| 회귀 — folder-aware v1 스킨과 `category.posts` 스킨 5종 | [skin/skin-folder-tree-e2e-test.mjs](skin/skin-folder-tree-e2e-test.mjs) (8942) |

**구분해서 읽을 것**: 위는 전부 mock/로컬 결과다. 실제 Supabase RLS는 §2-1의
anon 실측만 했고, Cloudflare 배포 확인과 실기기 확인은 하지 않았다.
