# Category/gallery 및 모바일 본문 변경

## 조사한 구조

- Category의 실제 표시 필드는 `categories.list_style`이며 기존 값은 `list`/`gallery`였다. 타입은 `post`/`banner`였다.
- 2026-09-11 공개 Supabase API 읽기에서 post/list 3행, banner/list 1행을 확인했다. 공개 API에 보이지 않는 행과 운영 DB catalog/전체 RLS는 확인하지 못했다. 기본 categories/posts DDL은 저장소에 없다.
- 글 메타데이터는 `posts`, 본문/OOC는 `post_contents`, 대표 이미지는 `post_covers`에 분리되어 있다.
- 최근 GALLERY-1은 대표 이미지 한 장으로 카드를 만들고, 지원하는 스킨에서만 pagination을 켠다. 이미지 파일은 후속 migration에서 비공개 `post-covers` 버킷과 `/api/post-cover`로 전환됐다.
- 공개/Studio는 `skin-context.js`, `skin-render.js`와 같은 템플릿 해석 계약을 사용한다. 기존 CATEGORY 템플릿과 POST의 보호된 `post-body` region은 유지한다.

## 최종 데이터와 동작

| 종류 | 작성 | 기본 공개 화면 |
| --- | --- | --- |
| post | 제목/본문, 기존 선택적 cover | 제목·날짜·상세 링크 목록 |
| gallery | 여러 사진, 선택적 대표 지정, 제목은 선택 가능 | 반응형 사진 카드와 추가 사진 |
| banner | 기존 이미지/외부 링크 | 기존 배너 화면 |

Category의 별도 목록/갤러리 표시 선택은 제거했다. `list_style`은 기존 클라이언트 호환용으로 남기며 새 설정 UI는 type에 맞춰 mirror 값을 저장한다. 디자인은 스킨 소유다.

사진은 `post_gallery_images`에 순서와 선택적 `is_primary`를 저장한다. 지정 대표가 없으면 첫 사진을 사용한다. 같은 파일을 cover로 다시 업로드하지 않는다. `post_covers`와 기존 post cover RPC/정리 경로는 유지한다. 새 갤러리 사진이 없는 기존 글은 기존 cover를 썸네일로 계속 사용할 수 있다.

사진 목록과 플랫폼이 만든 HTML 본문은 하나의 DB 함수에서 함께 저장한다. 업로드/DB 실패 시 새 파일만 정리하고 기존 참조를 유지한다. 글 메타데이터·OOC·비밀번호는 기존 별도 저장 흐름이므로 전체 SAVE가 하나의 트랜잭션인 것은 아니다. 생성 후 실패 시 같은 post ID로 재시도한다.

## 추가된 스킨 계약

- `category.type`: post/gallery/banner. 알 수 없는 타입은 기존 fallback 원칙을 따른다.
- 기존 `category.gallery.cards[]`에 `images[]` (`id/url/alt/isPrimary`), `additionalImages[]`, `hasImages`, `hasAdditionalImages`, `imageCount`를 추가했다. `thumbnailUrl`은 선택 대표 → 첫 사진 → 기존 cover 순서다.
- 기존 `category.posts`, `category.isList`, `category.isGallery`, pagination 계약은 유지한다. gallery를 사용하지 않는 기존 스킨은 전체 목록을 계속 받는다.
- `navigation.postCategories`는 기존 갤러리 메뉴가 사라지지 않도록 post/gallery를 포함한다. 분리된 메뉴에는 `textPostCategories`, `galleryCategories`, `bannerCategories`를 사용한다.
- CATEGORY 템플릿이 없는 gallery에는 플랫폼 기본 갤러리를 제공한다. 초기 generator도 목록/갤러리 분기를 제공한다. 별도의 필수 gallery 템플릿을 도입하지 않았다.
- 사용자 JS 금지, HTML/CSS sanitization, protected post-body, 플랫폼 본문 렌더링은 유지한다.

## 이미지 보안

사진 메타데이터와 파일 접근 모두 현재 공개 상태를 검사한다. 비밀글 카드는 실제 사진 정보를 받지 않는다. 비밀번호로 본문을 연 독자에게는 기존 비밀번호 RPC를 재검증한 뒤 1시간짜리 불투명 토큰을 발급한다. 토큰은 사진 API 경로의 쿠키로 전달하며, DB가 매 요청의 공개 범위·현재 비밀번호 hash·만료를 재확인한다. private 전환/비밀번호 변경/삭제 시 이전 토큰은 파일 접근 권한을 주지 않는다. 비밀번호나 Storage signed URL을 브라우저에 저장하지 않는다.

Storage 요청 헤더의 DB 전달은 [Supabase Storage의 scope 구현](https://github.com/supabase/storage/blob/master/src/internal/database/postgres/scope.ts)을 확인했다. 운영 배포의 Storage 버전/게이트웨이에서 해당 헤더가 유지되는지는 staging 실파일 검증이 필요하다. 로컬 검증은 실제 Pages Function과 모의 Storage, 실제 PostgreSQL 정책 검증을 분리해서 수행한다.

## 모바일 폭

기존 HTML fit은 `width:max-content`로 본문을 확장한 후 전체를 transform scale로 줄였다. 변환 전 layout 폭은 남고 글자도 함께 작아졌으며, protected region을 쓰는 스킨에는 이 보정이 적용되지 않았다.

`core/content-width.css/js`를 공개 HOME/CATEGORY/POST, legacy와 Studio에 공통 적용한다. 일반 요소/미디어 폭을 제한하고 긴 문자열을 줄바꿈하며 표·코드는 내부 가로 스크롤로 처리한다. 고정 grid 열이나 nowrap flex가 실제 컨테이너보다 클 때만 플랫폼이 보정한다. 리사이즈 시 원래 값을 복원해 데스크톱 디자인을 유지한다. 본문 전체 scale과 새 overflow-x:hidden 처리는 사용하지 않는다. 기존 앱의 고정 viewport/내부 세로 스크롤 구조는 유지한다.

부모가 이미 잘라내는 요소(`overflow-x`가 `visible`이 아닌 부모의 자식)는 폭 보정에서 제외한다. 그런 요소는 viewport까지 넘치지 않고, 좁히면 의도한 구도가 깨진다 — 이미지 자르기 프레임은 프레임보다 큰 사진을 일부러 담고 있어서(`AI_SKIN_PHASE_AI6D_IMAGE_CROP.md`) 프레임 폭으로 clamp하면 자르기가 없애려던 빈틈이 그대로 생긴다. `skin/skin-crop-published-e2e-test.mjs`의 P5/P9가 이 경계를 검사한다.

`core/content-width.css`와 `core/content-width.js`는 고정 URL `<link>`/`<script src>`로 걸지 않는다. 진입 문서(`index.html`, `studio/preview/preview-frame.html`)가 `loadVersionedStyles()`로 CSS를, `index.html`이 `loadVersionedModules()`로 JS를 건다. `skin/skin-render.js`가 `core/content-width.js`를 정적 import하므로 두 진입 문서의 `writeVersionedImportMap()`에 `/core/content-width.js`를 넣었다 — loader가 만드는 URL과 import map이 돌리는 URL이 같아야 모듈 인스턴스가 하나로 유지된다(설치 상태를 모듈 변수로 들고 있다). 진입 문서가 CSS를 걸어 두지 않은 document에서는 `renderSkin()`이 같은 버전 쿼리를 붙여 직접 넣고, 중복 삽입은 `data-*` 표식이 아니라 **경로**로 판정한다(진입 문서의 `<link>`에는 `?v=`가 붙어 있다). CSS/JS가 바뀌었으므로 `APP_BUILD_VERSION`을 `2026-09-12-1`로 올렸다(CLAUDE.md 4절).

## 배포 및 검증

운영 DB를 변경하거나 commit/push하지 않았다. 먼저 `supabase/tests/20260911_category_gallery_state_check.sql`로 대상 스키마/제약/전체 저장값/정책을 확인한다.

적용 순서:

1. 기존 `20260910100000_gallery_category_and_post_covers.sql`
2. 기존 `20260911100000_post_covers_private_access.sql`
3. 새 `20260911120000_gallery_content.sql`
4. 프런트엔드와 `functions/api/post-cover.js`를 함께 배포한다.

새 migration은 type 컬럼이 text/varchar인지 catalog로 확인하고 type-only CHECK에 gallery만 추가한다. 예상하지 못한 스키마는 transaction을 중단한다. `type='post' AND list_style='gallery'`만 gallery로 바꾸며 ID/slug/글/배너는 수정하지 않는다. 기존 폴더 생성 함수의 알려진 post-only 타입 검사도 post/gallery로 확장한다. 로컬에서 선행 migration과 새 migration의 두 번 적용을 검증했다.

실행 명령:

```text
node supabase/tests/gallery-content-test.mjs
node skin/skin-gallery-e2e-test.mjs
node skin/skin-banner-page-e2e-test.mjs
node skin/skin-crop-published-e2e-test.mjs
node studio/studio-crop-e2e-test.mjs
node studio/studio-ai-panel-e2e-test.mjs
node admin/admin-settings-e2e-test.mjs
```

PostgreSQL 로컬 테스트 의존성은 git에서 제외된 `supabase/.temp/gallery-validation`에 설치되어 있다. E2E는 실제 앱 파일과 실제 Pages Function을 실행하고 Supabase 응답을 fixture로 대체한다. 운영 저장/Publish는 수행하지 않았으므로 프로덕션 반영 후 실파일 저장, 비밀글 인증, Studio/공개 화면을 마지막으로 확인해야 한다.

검증 결과(2026-09-12 최종 재실행, Playwright chromium):

| 스위트 | 결과 |
| --- | --- |
| `skin/skin-gallery-e2e-test.mjs` (gallery2/contracts/width/published/secret/paging/compat/cover/access/protect/preview 전부) | 193 PASS / 0 FAIL |
| `skin/skin-banner-page-e2e-test.mjs` | 226 PASS / 0 FAIL |
| `skin/skin-published-frame-e2e-test.mjs` | 64 PASS / 0 FAIL |
| `skin/skin-folder-tree-e2e-test.mjs` | 71 PASS / 0 FAIL |
| `skin/skin-folder-page-e2e-test.mjs` | 61 PASS / 0 FAIL |
| `skin/skin-crop-published-e2e-test.mjs` | 13 PASS / 0 FAIL |
| `skin/skin-write-manage-e2e-test.mjs` | 155 PASS / 0 FAIL |
| `studio/studio-crop-e2e-test.mjs` (기본 + frame/free/freegeo/freealign/freelimit/sliders) | 104 + 11 + 18 + 7 + 29 + 6 + 6 PASS / 0 FAIL |
| `studio/studio-inspector-e2e-test.mjs` | 34 PASS / 0 FAIL |
| `studio/studio-direct-edit-e2e-test.mjs` | 37 PASS / 0 FAIL |
| `studio/studio-ai-panel-e2e-test.mjs` | 142 PASS / 0 FAIL |
| `studio/studio-ai-panel-layout-e2e-test.mjs` | 90 PASS / 0 FAIL |
| `studio/studio-selected-ai-e2e-test.mjs` | 99 PASS / 0 FAIL |
| `studio/studio-file-ux-e2e-test.mjs` | 42 PASS / 0 FAIL |
| `studio/images/skin-image-library-e2e-test.mjs` | 95 PASS / 0 FAIL |
| `posts/posts-folder-manage-e2e-test.mjs` | 61 PASS / 0 FAIL |
| `admin/admin-settings-e2e-test.mjs` | 38 PASS / 0 FAIL (`--only=category` 3개 포함) |
| `supabase/tests/gallery-content-test.mjs` (PGlite) | 7개 그룹 PASS |

- HTML 하네스(로컬 정적 서버 + chromium): `skin-generator` 24, `skin-render-security` 23, `skin-post-region` 17, `skin-package-normalize` 12, `studio-publish` 13, `skin-render` 60, `skin-page-context` 115, `studio-multipage` 16, `studio-import` 12 — 전부 0 FAIL.
- `studio/studio-navigation-test.html`의 "3. CATEGORY 경로가 정확히 매칭된다"는 **이번 변경 이전부터 실패**한다. HEAD(3f8b5e5)를 별도 worktree로 꺼내 같은 하네스를 돌려 동일하게 실패함을 확인했다 — 이 라운드의 회귀가 아니고, 이 라운드의 범위도 아니다.
- PGlite: 이제 FOLDER-1의 세 migration(`20260908100000`/`20260908110000`/`20260908120000`)을 fixture에 함께 적용한다. 그래서 새 migration의 `create_post_folder` 타입 guard 패치가 **실제 함수 본문**에 적용되는 것을 검사한다 — 패치 뒤 `pg_get_functiondef`에 새 guard만 남고, 옮겨진 gallery 카테고리와 기존 post 카테고리에서는 폴더가 만들어지며, banner 거부 · 남의 카테고리 거부 · depth 3 상한 · 미인증 거부 · anon EXECUTE 없음이 모두 그대로다. fixture에는 이를 위해 `categories.user_id`/`sort_order`, `posts.created_at`, `service_role` 역할, 다른 소유자의 카테고리를 추가했다.
- 변경 JS/MJS 문법 검사(24개)와 `git diff --check` 통과.
- 폭 계약 로딩 실측: `index.html`과 `studio/preview/preview-frame.html` 모두 `/core/content-width.css?v=…` 1회, `/core/content-width.js?v=…` 1회만 요청한다(중복 `<link>` 없음).

HTML 본문 폭 측정(현재 갤러리 스킨 fixture, 단위 px):

| viewport | 공개 skin 본문 | Studio 같은 template | legacy 본문 |
| --- | --- | --- | --- |
| 320 | 292 | 292 | 276 |
| 375 | 347 | 347 | 331 |
| 390 | 362 | 362 | 346 |
| 1280 | 680 | 680 | 720 |

모든 폭에서 고정 1200px 콘텐츠, 큰 이미지, 고정 900px grid 열, 긴 URL/단어, table/pre/iframe을 포함했다. 전체 본문 transform은 none이고 table/pre에만 내부 가로 스크롤이 발생했다.

## 변경 파일

- [admin/admin-settings-e2e-test.mjs](../admin/admin-settings-e2e-test.mjs)
- [admin/settings/admin-settings-category-display.js](../admin/settings/admin-settings-category-display.js)
- [admin/settings/admin-settings-load.js](../admin/settings/admin-settings-load.js)
- [admin/settings/admin-settings-save.js](../admin/settings/admin-settings-save.js)
- [core/content-width.css](../core/content-width.css)
- [core/content-width.js](../core/content-width.js)
- [core/lib/build-version.js](../core/lib/build-version.js)
- [docs/CATEGORY_GALLERY_MOBILE_20260911.md](../docs/CATEGORY_GALLERY_MOBILE_20260911.md)
- [functions/api/post-cover.js](../functions/api/post-cover.js)
- [functions/api/skin-ai.js](../functions/api/skin-ai.js)
- [index.html](../index.html)
- [posts/editor/format/posts-editor.js](../posts/editor/format/posts-editor.js)
- [posts/editor/posts-gallery.js](../posts/editor/posts-gallery.js)
- [posts/editor/posts-save.js](../posts/editor/posts-save.js)
- [posts/posts.html](../posts/posts.html)
- [posts/posts-editor.css](../posts/posts-editor.css)
- [posts/posts-view-html-fit.js](../posts/posts-view-html-fit.js)
- [posts/view/posts-view-compose.js](../posts/view/posts-view-compose.js)
- [posts/view/posts-view-editor-load.js](../posts/view/posts-view-editor-load.js)
- [posts/view/posts-view-secret-gate.js](../posts/view/posts-view-secret-gate.js)
- [posts/view/posts-view-transition.js](../posts/view/posts-view-transition.js)
- [skin/skin-category.js](../skin/skin-category.js)
- [skin/skin-context.js](../skin/skin-context.js)
- [skin/skin-gallery-e2e-test.mjs](../skin/skin-gallery-e2e-test.mjs)
- [skin/skin-generator.js](../skin/skin-generator.js)
- [skin/skin-generator-test.html](../skin/skin-generator-test.html)
- [skin/skin-render.js](../skin/skin-render.js)
- [skin/skin-template.js](../skin/skin-template.js)
- [SKIN_DESIGNER_CONTRACT.md](../SKIN_DESIGNER_CONTRACT.md)
- [studio/preview/preview-frame.html](../studio/preview/preview-frame.html)
- [studio/preview/preview-navigation.js](../studio/preview/preview-navigation.js)
- [supabase/migrations/20260911120000_gallery_content.sql](../supabase/migrations/20260911120000_gallery_content.sql)
- [supabase/tests/20260911_category_gallery_state_check.sql](../supabase/tests/20260911_category_gallery_state_check.sql)
- [supabase/tests/gallery-content-test.mjs](../supabase/tests/gallery-content-test.mjs)
