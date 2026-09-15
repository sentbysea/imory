# IMORY SANDBOX SKIN — 0단계 조사 및 구현 설계

**상태: 설계(§A~§F) + 구현 기록(§G SANDBOX-0 · §H SANDBOX-1 · §I 켜기 ·
§J SANDBOX-2).**
§A~§F 의 "현재 구조"는 2026-09-15 기준 저장소를 직접 읽고 확인한
사실이고, 그 안의 "설계"는 제안이다. **실제로 저장소에 들어간 코드는
§G(SANDBOX-0) · §H(SANDBOX-1) · §J(SANDBOX-2)에만 적혀 있다.** 섞어
읽지 말 것 (CLAUDE.md §5 — "현재 구현 / 앞으로 지켜야 할 원칙 /
남은 차이"를 구분한다).

§A~§F 와 §H·§J 가 어긋나는 지점(설계가 나중에 바뀐 곳):

| 어긋난 곳 | 설계(§A~§F) | 실제 |
| --- | --- | --- |
| 메시지 이름 | §D-2 `IMORY_READY` / `IMORY_INIT` / `IMORY_ERROR` | `IMORY_FRAME_READY` / `IMORY_RENDER_PAGE` / `IMORY_FRAME_ERROR` (§G-7 · §H-6 · §J-2 가 정본) |
| style-src | §D-4 · §G-6 TODO: `'unsafe-inline'` 이 필요해진다 | **nonce 로 해결**했다 — `renderSkin({ styleNonce })` (§H-7) |
| img/font-src | §F#6: 호스트 allowlist 를 하지 않는다(`https:` 전체) | **지금 쓰는 출처만** 열었다. 외부 자유 이미지·웹폰트는 다음 단계의 명시적 결정 (§H-7) |
| viewer | §D-1: `isOwner` · `adminHref` · `writeHref` 를 보낸다 | **방문자 값으로 고정**(§H-5) — SANDBOX-2 에서도 그대로 |
| `IMORY_NAVIGATE` | §D-2: `{ href }` 를 보내고 부모가 파싱한다 | **href 를 보내지 않는다.** 부모가 발급한 정수 `navId` 하나뿐 (§J-2) |
| CATEGORY / POST | §E: SANDBOX-3 | **SANDBOX-2 에서 함께 했다** (§J-4) |

목표: 기존 `SkinPackage`·native 렌더링을 **한 byte도 바꾸지 않은 채**,
`renderMode: "sandbox"`인 스킨만 별도 origin의 iframe에서 그리는 경로를
추가한다.

---

## A. 확인한 현재 구조

### A-1. SkinPackage 저장·불러오기

**DB (실제 migration 확인)**

| 대상 | 파일 | 내용 |
| --- | --- | --- |
| 테이블 | `supabase/migrations/20260904100000_create_skins_skin_versions.sql` | `skins` / `skin_versions` / `skin_image_slot_values` |
| RLS/GRANT | `20260904110000_rls_skins_skin_versions.sql` | anon은 세 테이블에 아무 권한 없음 |
| 공개 읽기 | `20260904120000_add_get_published_skin_rpc.sql` | `get_published_skin(p_user_id uuid)` |
| 쓰기 | `20260905100000_add_skin_draft_write_rpcs.sql` | `save_skin_draft_version`, `publish_skin` |
| 이미지 슬롯 | `20260907100000_create_skin_image_library.sql` | `save_skin_draft_version_with_image_slots`, `create_skin_image`, `delete_skin_image` |

- `skins.current_draft_version_id` / `current_published_version_id`가 draft/published의
  **유일한 근거**다 — `skin_versions`에 status 컬럼이 없다. row는 append-only
  (UPDATE/DELETE GRANT 자체가 없다).
- SkinPackage 전체는 `skin_versions.content jsonb` **한 컬럼**에 들어간다.
  CSS도 `content.css`, 템플릿도 `content.templates.*.html`로 같은 jsonb 안이다.
  별도 CSS 컬럼이나 파일 스토리지는 없다.
- `schema_version smallint`은 `skin_versions`의 **별도 컬럼**이면서
  `content.schemaVersion`에도 같은 값이 들어간다. 오늘 유일한 값은 `1`이다.
- **imageSlots는 두 군데로 나뉜다**:
  `content.imageSlots`는 슬롯 *선언*(공유 가능, 이름/라벨/비율 힌트),
  실제 선택된 이미지 URL은 `skin_image_slot_values` 테이블(개인 데이터).
  `get_published_skin`이 둘을 합쳐 `{ skin, schemaVersion, imageSlotValues }`로 돌려준다.

**실제 SkinPackage 모양** (`skin/test-skins/imory-diary-v0.1.json` 실측)

```
schemaVersion, templates, css, imageSlots, regions, metadata
```

`templates`의 page type은 `home`/`category`/`post`(필수) +
`banner`/`folder`/`highlights`(선택, `memos`는 legacy alias).
`metadata.supports`는 **신뢰 경계가 아니다** — 지원 판정은 언제나
`resolveSkinTemplate()`이 값을 돌려주는지로만 한다
(`skin/skin-template.js` 주석에 명시).

**흐름**

```
생성   skin/skin-generator.js generateInitialSkin(answers)
        -> skin/skin-package-normalize.js normalizeSkinPackageForDraft()
        -> skin/skin-initializer.js createInitialSkinFromAnswers()
        -> RPC create_skin_with_initial_version

Import  studio/editor/import-editor.js
        -> skin/skin-package-import.js validateSkinPackageImport(rawJsonText)
             구조검사 -> sanitizeSkinHTML -> validateAndScopeSkinCss
             -> **원본을 스프레드하지 않고** 알려진 필드만 새 리터럴에 담는다
             -> auditSkinPackageMaterials() 경고(거부 아님)
        -> studio/studio-preview.js applyImportedSkinPackage()

Export  skin/skin-package-export.js buildSkinPackageExport()
        allowlist 필드만 — DB 키가 섞여 있어도 파일에 안 실린다

Save    studio/studio-preview.js handleStudioSaveClick()
        -> normalizeSkinPackageForDraft(snapshot)
        -> studio/studio-write.js saveSkinDraftVersion[WithImageSlots]()

Publish studio/studio-preview.js handleStudioPublishConfirmed()
        -> studio/studio-write.js publishSkin(skinId)   (포인터 이동만)
```

핵심: **SkinPackage가 DB로 들어가는 문은 `normalizeSkinPackageForDraft()` 하나**,
**밖에서 들어오는 문은 `validateSkinPackageImport()` 하나**다. 새 필드
(`renderMode`)를 추가할 때 고쳐야 할 지점이 그만큼 적다.

### A-2. 공개 렌더링 흐름

**진입 파일 (6종, 전부 ES 모듈 + `window.skin*Ready` Promise 핸드셰이크)**

| page | 진입 모듈 | 호출자 | mount 컨테이너 |
| --- | --- | --- | --- |
| HOME | `skin/skin-home.js` `renderPublishedSkinHome()` | `index.html` `tryRenderPublishedSkinHome()` (3676행대) | `#themeMount` (+`.theme-mount--skin`) |
| CATEGORY | `skin/skin-category.js` | `posts/view/posts-view-list.js` | `#postSkinContainer` |
| POST | `skin/skin-post.js` | `posts/view/posts-view-detail.js` | `#postSkinContainer` |
| BANNER | `skin/skin-banner.js` | `posts/view/posts-view-list.js` | `#postSkinContainer` |
| FOLDER | `skin/skin-folder.js` | `posts/view/posts-view-folder.js` | `#postSkinContainer` |
| HIGHLIGHTS | `skin/skin-highlights.js` | `posts/view/posts-view-highlights.js` | `#postSkinContainer` |

`#postSkinContainer`는 `posts/posts.html:532`에 있고 `index.html`이 fetch로
끼워 넣는 조각이다. 참조는 `posts/editor/posts-refs.js:137`.

**여섯 파일이 공유하는 동일한 시퀀스**

```
supabaseClient.rpc("get_published_skin", { p_user_id: ownerId })
  -> null 이면 조용히 legacy 폴백 (절대 throw하지 않는다)
  -> schemaVersion !== 1 이면 폴백
  -> resolveSkinTemplate(skinPackage, pageType)  ... undefined면 폴백
  -> extractImageSlotNames(skinPackage)
  -> build<Page>SkinContext(ownerId, ..., { imageSlotNames, imageSlotValues, supports* })
  -> renderSkin({ container, skin: template, context, mode: "view" })
```

`supports*` 옵션은 **템플릿 마크업을 실제로 읽어서** 정한다
(`skinTemplateUsesGallery` / `UsesPagination` / `UsesRootPostList` /
`UsesHomeHighlights`, `skinPackageSupportsPageType`) — metadata 플래그가 아니다.

**skin-context가 만드는 데이터** (`skin/skin-context.js`, 4512줄)

- 공통(`buildBaseSkinContext`): `site` / `profile` / `navigation` / `banners` /
  `viewer` / `images`
- page별 namespace: `page`(`buildSkinPageMeta` — `isHome`/`isCategory`/`isPost`/
  `isBanner`/`isFolder`/`isHighlights`, 항상 정확히 하나만 true) +
  `home` / `category` / `folder` / `post` / `highlights` / `banner`
- **본문(post content)은 Context에 없다.** 의도적 설계다 — 스킨은
  `data-imory-bind` 경로로 본문에 접근할 수 없다.
- Context에 사용자 UUID가 없다. `ownerId`는 인자로만 쓰이고 반환 객체에
  들어가지 않는다(실측 확인).

**resolveSkinTemplate 이후 DOM 출력** (`skin/skin-render.js`, 741줄)

`renderSkin()`은 호출될 때마다 **매번** sanitize + CSS validate를 다시 한다
(Slice 3.5 신뢰 경계 — DB row도 신뢰하지 않는다):

1. `sanitizeSkinHTML(skin.html, doc)`
2. `validateAndScopeSkinCss(skin.css, { namespace: "i<N>" })` — 인스턴스별 scope class
3. `<div class="imory-skin-root imory-skin-root-i<N>" data-skin-root>` 생성
4. 그 안에 `<style>`(scoped CSS) + `<template>.innerHTML` 파싱 후 clone
5. `walkSkinTree()`로 `repeat > region > if > bind/src/href/kind/color` 순 적용
6. 반환 `{ update, destroy, getRegion(name), getRegions(name) }`

- 데이터 주입은 **항상 `textContent`**. `innerHTML`로 데이터를 넣는 코드는
  이 파일 어디에도 없다.
- `data-imory-region`은 자식을 **비우고** 끝낸다 — caller가 채울 자리다.
- `container.ownerDocument`로만 동작하는 document-agnostic 코드다.
  **이미 iframe 안에서 그대로 돌아간다**(Preview가 그 증거).

**사용자 CSS 적용 위치**: `renderSkin()` 안 `<style>` 엘리먼트 하나.
scope는 `.imory-skin-root-i<N>` prefix 강제 + `@keyframes` namespace.
추가로 플랫폼 폭 계약 `core/content-width.css` + `installContentWidthContract()`
(`core/content-width.js`)가 걸린다.

### A-3. Studio 미리보기 흐름

```
studio/index.html
  └ #studioPreviewFrame  (same-origin iframe)
       └ studio/preview/preview-frame.html
            └ studio/preview/preview-bridge.js  (ES 모듈)
                 └ import { renderSkin } from "../../skin/skin-render.js"
```

- 부모 로직: `studio/studio-preview.js`(3050줄) + `studio/preview/preview-navigation.js`(1671줄)
- 부모가 **공개 화면과 같은 `build*SkinContext()`를 직접 호출**하고,
  결과를 `postMessage`로 iframe에 넘긴다.
- iframe은 `renderSkin()`만 부른다. 데이터 조회를 하지 않는다.
- **양쪽 다 `targetOrigin`에 `window.location.origin`을 쓴다. `"*"`는 없다.**
  수신 측은 `event.origin` + `event.source` + shape 세 가지를 모두 확인한다.

**현재 postMessage 계약** (preview-bridge.js 상단에 명문화되어 있음)

```
parent -> iframe : preview:render / render-banner / ping /
                   post-body / folder-bodies /
                   inspector-mode / inspector-select / inspect-preview
iframe -> parent : preview:ready / rendered / error / navigate /
                   inspect-hover / inspect-select / inspect-rects / inspect-escape
```

`preview:inspect-*`는 **DOM도 HTML 문자열도 담지 않는다** — 식별자
(`data-imory-edit-id`) 1개, 태그 이름, 좌표 4개뿐이다.

**AI 응답이 적용되는 곳**

```
studio/ai/studio-ai-panel.js
  -> POST /api/skin-ai            (functions/api/skin-ai.js, Cloudflare Pages Function)
  -> OpenAI Responses API (Structured Outputs)
  -> window.validateSkinPackageImport()   ← Import와 **같은 검증 함수**
  -> window.applyAiSkinPackage()          (studio/studio-preview.js)
       -> applyImportedSkinPackage()      ← Import/Undo와 **같은 적용 함수**
       -> renderPreviewAfterSkinPackageChange()
```

서버는 모델이 만들 수 있는 범위를 기계적으로 제한한다 —
`templates.*.html` 6종 + `css` + `summary`만. `schemaVersion`/`imageSlots`/
`regions`/`metadata`는 요청으로 받은 값을 **그대로 되돌려준다**.
(→ `renderMode`도 같은 취급이어야 한다. D-4 참고.)

**preview와 publish가 공유하는 코드**

| 공유 | 파일 |
| --- | --- |
| 렌더러 | `skin/skin-render.js` |
| sanitize / CSS | `skin/skin-sanitize.js`, `skin/skin-css-validate.js` |
| 템플릿 선택 | `skin/skin-template.js` |
| Context 빌더 | `skin/skin-context.js` (6개 빌더 전부) |
| 폭 계약 | `core/content-width.js` / `.css` |
| 본문 서식 | `posts/posts-sanitize.js`, `posts/style/posts-style-render.js` 등 |
| 하이라이트 카드 UI | `posts/view/posts-view-highlight-card-tools.js` 등 |

**공유하지 않는 것(경계선)**

- 공개: 라우팅·본문 mount가 **같은 문서 안의 DOM 이동**이다.
  `posts-view-detail.js`가 `skinPostResult.bodyRegion.appendChild(...)`로
  실제 노드를 **옮긴다**(clone 아님).
- Preview: 같은 일을 **메시지로** 한다.
  `studio/preview/preview-post-body.js`가 서식까지 끝낸 HTML **문자열**을
  만들어 `preview:post-body { html, containerStyle, isHtmlContent }`로 보내고,
  bridge가 `region.innerHTML = data.html`로 채운다.

> **이것이 sandbox 설계의 출발점이다.** cross-origin iframe에서는 DOM을 옮길 수
> 없으므로 본문은 반드시 "문자열 + 메시지"여야 하는데, **그 경로가 이미
> 존재하고 이미 검증돼 있다**(e2e 8937/8944). sandbox는 Preview가 쓰는 쪽을
> 공개 화면에도 쓰는 것이다.

### A-4. 배포·보안 현황 (실측)

- Cloudflare Pages. `_redirects` 한 줄 `/* /index.html 200`.
- `functions/_middleware.js`가 **모든 요청**을 먼저 받는다
  (`*.pages.dev` → `imory.me` 301 + 글 주소에 og/twitter meta 주입).
- **CSP 헤더가 지금 저장소 어디에도 없다.** `_headers`에도 Function에도 없다.
  `X-Frame-Options`도 없다.
- 인증 세션은 **Supabase JS 기본 저장소 = localStorage**
  (`core/lib/supabase-client.js`는 `createClient(url, key)`만 부른다 — 커스텀
  storage/쿠키 설정 없음). 인증 쿠키가 없다.
  → **다른 origin의 iframe은 세션에 구조적으로 닿을 수 없다.**
- 스킨은 오늘 JS를 실행할 수 없다. `skin/skin-sanitize.js`가
  `script/iframe/object/embed/canvas/svg/video/audio/style/form/input/button/
  template`을 **내용까지 통째로 제거**하고, `style`/`id`/`on*` 속성을 전면
  금지한다. 허용 태그는 33종, 허용 속성은 class/lang/dir/title/role +
  `data-imory-*` 9종뿐.
- 자산 버전은 `core/lib/build-version.js`의 `APP_BUILD_VERSION` 하나.
  진입 문서만 `?t=Date.now()`로 그 파일을 받고, 나머지는 전부 `?v=`.
  `preview-frame.html`이 **iframe은 부모의 import map/캐시를 물려받지 않는다**는
  것을 이미 다루고 있다(자기 몫을 따로 선언).

---

## B. 최소 변경 설계

### 설계 원칙 (이 라운드의 불변식)

1. **`renderMode`가 없으면 오늘과 byte 단위로 동일한 경로를 탄다.**
   새 코드는 전부 `if (renderMode === "sandbox" && flagOn)` 안쪽에만 있다.
2. **iframe은 렌더러다. 데이터 클라이언트가 아니다.**
   `supabaseClient`도 `build*SkinContext`도 iframe에 로드하지 않는다.
   부모가 오늘 하는 조회·Context 조립·본문 서식을 그대로 하고, 결과만 보낸다.
3. **본문·권한·작성·삭제는 계속 플랫폼 쪽이다** (CLAUDE.md §2).
4. **새 렌더러를 만들지 않는다.** iframe 안에서도 `renderSkin()`을 그대로 쓴다.
5. **Studio Preview와 공개 화면이 같은 frame 문서를 쓴다** (최종 목표).
   SANDBOX-1에서는 공개 화면만 붙이고, 통합은 SANDBOX-4에서 한다.

### B-1. 신규 파일

| 파일 | 역할 |
| --- | --- |
| `skin/sandbox/skin-sandbox-config.js` | classic script. `SANDBOX_SKIN_ORIGIN`(배포별 상수), `SANDBOX_SKIN_FRAME_PATH`, `SANDBOX_SKIN_PARENT_ORIGINS`(frame이 신뢰할 부모 목록), `isSandboxSkinEnabled()`. 이 파일이 **유일한 기능 플래그**다. |
| `skin/sandbox/skin-sandbox-protocol.js` | classic script + frame 양쪽이 각자 로드하는 **순수 함수**. 메시지 봉투 생성기와 타입별 검증기(`validateSandboxMessage`). 두 문서가 전역을 공유하지 않으므로 `studio-inspector-model.js`/`studio-inspector-crop-model.js`가 이미 쓰는 "의존 없는 순수 파일을 양쪽에 각각 로드" 패턴을 그대로 따른다. |
| `skin/sandbox/skin-sandbox-context.js` | classic script. `projectSkinContextForSandbox(context, pageType)` — 기존 Context에서 **알려진 키만** 새 리터럴로 옮기는 투영 함수. 이것이 데이터 신뢰 경계다. |
| `skin/sandbox/skin-sandbox-host.js` | ES 모듈. 부모 쪽 호스트. iframe 생성/파괴, INIT 전송, 높이 반영, NAVIGATE/COPY_LINK 수신 → 기존 라우터 위임. `window.skinSandboxHostReady` 핸드셰이크로 classic script에 노출. |
| `skin/sandbox/frame.html` | **별도 origin에서만** 서빙되는 iframe 진입 문서. `preview-frame.html`과 같은 구성(=`?t=` build-version → `loadVersionedStyles`/`loadVersionedScripts`/`writeVersionedImportMap`). |
| `skin/sandbox/skin-sandbox-frame.js` | ES 모듈. frame 안의 bridge. `renderSkin()` 호출 + ResizeObserver 높이 보고 + 링크 가로채기. `preview-bridge.js`의 축소판이며 **Inspector 관련 코드는 전혀 없다**. |
| `skin/sandbox/skin-sandbox-e2e-test.mjs` | Playwright E2E (포트 8957 제안 — 8956까지 사용 중). |

### B-2. 수정 파일

| 파일 | 수정 내용 | 위험도 |
| --- | --- | --- |
| `skin/skin-template.js` | `resolveSkinRenderMode(skinPackage)` 추가. `"sandbox"`만 인정하고 그 외/없음은 `"native"`. 순수 함수 1개 추가, 기존 함수 무수정. | 낮음 |
| `skin/skin-package-import.js` | `renderMode`를 allowlist에 추가(문자열이 아니거나 모르는 값이면 `reason:"render-mode"`로 거부). 결과 리터럴에 실어 준다. | 낮음 |
| `skin/skin-package-export.js` | `renderMode`를 export allowlist에 추가. | 낮음 |
| `skin/skin-package-normalize.js` | `renderMode` 보존(현재 `{...skinPackage}`로 시작하므로 **이미 보존된다** — 확인만 하면 된다). | 없음 |
| `skin/skin-home.js` | `renderPublishedSkinHome()` 안, `resolveSkinTemplate()` 직후에 sandbox 분기 6~10줄. 실패하면 오늘과 똑같이 `false`. | 중간 |
| `index.html` | `loadVersionedScripts`에 `skin-sandbox-*.js` 3개, module 목록에 `skin-sandbox-host.js` 1개, `window.skinSandboxHostReady` 선언. | 낮음 |
| `functions/_middleware.js` | ① sandbox host로 들어온 요청은 `/skin/sandbox/` 아래만 허용, 나머지는 404. ② 그 문서에 CSP + `X-Frame-Options` 대체(`frame-ancestors`) 헤더 부여. | 중간 |
| `core/lib/build-version.js` | 변경 없음(배포마다 값만 올린다). | 없음 |

**SANDBOX-2 이후 추가로 손댈 파일**(이번 범위 아님, 미리 표시):
`skin/skin-link-nav.js`(라우팅 dispatch를 재사용 가능한 함수로 분리),
`skin/skin-category.js`/`skin-post.js`/`skin-folder.js`/`skin-highlights.js`/
`skin-banner.js`, `posts/view/posts-view-detail.js`(본문을 문자열로 보내는 경로),
`studio/studio-preview.js` + `studio/preview/*`(Preview 통합),
`functions/api/skin-ai.js`(renderMode 그대로 되돌려주기).

### B-3. 데이터 흐름 (sandbox 모드, HOME 기준)

```
index.html tryRenderPublishedSkinHome(ownerId)
  └ skin/skin-home.js renderPublishedSkinHome({ ownerId, container })
       ├ get_published_skin RPC                       ← 오늘과 동일
       ├ schemaVersion 검사                            ← 오늘과 동일
       ├ resolveSkinTemplate(pkg, "home")              ← 오늘과 동일
       ├ resolveSkinRenderMode(pkg)  ─ "native" ─> renderSkin(...)   ← 오늘과 동일
       │                             └ "sandbox" ┐
       ├ extractImageSlotNames / buildSkinContext(...)  ← 오늘과 동일 (부모에서)
       └ (sandbox) await window.skinSandboxHostReady
            └ mountSandboxSkin({ container, template, context, pageType })
                 ├ projectSkinContextForSandbox(context, "home")
                 ├ <iframe src="https://<SANDBOX_ORIGIN>/skin/sandbox/frame.html">
                 ├ (frame) IMORY_READY  ──────────────>
                 ├ <──────────────────  IMORY_INIT { templates, css, data }
                 │       (frame) renderSkin() → 실제 DOM
                 ├ (frame) IMORY_HEIGHT ─────────────> iframe.style.height
                 ├ (frame) IMORY_NAVIGATE ───────────> 기존 SPA 라우터
                 └ (frame) IMORY_COPY_LINK ──────────> navigator.clipboard (부모)
```

부모가 실패를 감지하면(타임아웃/에러/origin 미설정) iframe을 제거하고
`false`를 반환한다 → 오늘의 legacy 폴백이 그대로 작동한다.

---

## C. SandboxSkinPackage 초안

**결론: 새 패키지 타입을 만들지 않는다. 기존 SkinPackage에 선택 필드
`renderMode` 하나를 더한다.**

```jsonc
{
  "schemaVersion": 1,            // 그대로 1. 2로 올리면 안 된다(아래 이유)
  "renderMode": "sandbox",       // 신규 · 선택 · 없으면 "native"

  "templates": {
    "home":     { "html": "<div class=\"wrap\">…</div>" },
    "category": { "html": "…" },
    "post":     { "html": "… <div data-imory-region=\"post-body\"></div> …" }
    // banner / folder / highlights 는 오늘과 같이 선택
  },

  "css": "…",                    // 오늘과 같은 공유 CSS 한 벌
  "js": "",                      // 신규 · 선택 · **SANDBOX-1~2에서는 실행하지 않는다**

  "imageSlots": [ { "name": "profile", "label": "…", "required": false } ],
  "regions": [],
  "metadata": {
    "title": "…",
    "sandbox": { "frameContract": 1 }   // 프레임 계약 버전(선택)
  }
}
```

### 왜 `schemaVersion`을 올리지 않는가

여섯 진입 모듈이 전부 `if (schemaVersion !== 1) return false`다.
2로 올리면 **이미 배포된 모든 클라이언트가 그 스킨을 legacy 화면으로
폴백시킨다** — 사용자 입장에서 스킨이 통째로 사라진다.
`renderMode`를 모르는 옛 배포는 이 필드를 **조용히 무시하고 native로
그린다**. SANDBOX-1~2에서는 sandbox 패키지도 native 마크업 계약을
그대로 지키므로 그 폴백 결과가 정상 화면이다.

**남은 차이(정직하게 기록)**: SANDBOX-5에서 `js`가 실제로 실행되기
시작하면, 옛 배포/native 폴백에서는 그 JS가 조용히 빠진 채 그려진다.
그 시점에 `metadata.sandbox.requiresJs: true`를 보고 "native로는 못
그린다 → legacy 폴백"으로 판정하는 분기를 넣어야 한다. 지금 넣지 않는다.

### `js`를 지금 스키마에만 두고 실행하지 않는 이유

Import/Export/AI 왕복에서 필드가 **소실되지 않는 것**을 먼저 확정해야,
나중에 실행을 켤 때 "저장은 됐는데 사라진다"류의 버그를 안 만난다.
`skin/skin-package-import.js`는 문자열 타입만 검사하고 sanitize는 하지
않는다(sanitize할 것이 아니라 **실행 경계**로 막을 것이므로).

### `regions` / `imageSlots` / `metadata`

의미가 바뀌지 않는다. `imageSlotValues`는 오늘과 같이 부모가
`get_published_skin`에서 받아 Context의 `images.*`로 넣어 보낸다 —
**iframe은 슬롯이라는 개념 자체를 모른다**(해석된 URL만 받는다).

---

## D. 데이터·메시지 계약

### D-1. 최소 공개 데이터 계약 (`projectSkinContextForSandbox`)

**규칙**: 오늘 공개 Context에 **이미 존재하는 필드만** 쓴다.
투영 함수는 `skin/skin-package-import.js`와 같은 원칙으로 짠다 —
**원본을 스프레드하지 않고, 알려진 키만 하나씩 새 리터럴에 옮긴다.**
그래야 나중에 Context에 필드가 늘어도 자동으로 새어 나가지 않는다.

```jsonc
{
  "contract": 1,
  "pageType": "home",            // home|category|post|banner|folder|highlights

  "page":   { "type": "home", "isHome": true, "isCategory": false, … },

  "site":    { "title", "slug", "faviconUrl", "description", "language" },
  "profile": { "nickname", "bio", "avatarUrl" },

  "navigation": {
    "home":              { "name", "href", "enabled", "type", "iconKind" },
    "categories":        [ { "id", "name", "type", "href", "iconKind", … } ],
    "postCategories":    [ … ],
    "galleryCategories": [ … ],
    "textPostCategories":[ … ],
    "bannerCategories":  [ … ],
    "highlights":        { "name", "href", "enabled" },
    "memos":             { … }   // legacy alias, 같은 객체
  },

  "banners": { "items": [ { "id", "imageUrl", "href", "alt" } ] },

  "viewer": {
    "isOwner", "writeHref", "adminHref", "manageHref",
    "toolsHref", "highlightHref",
    "canManageHighlights", "canManageMemos"
  },

  "images": { "<slotName>": "https://… | null" },

  // pageType에 따라 **하나만** 채워진다
  "home":       { "highlights": { cards, featured, card, hasCard, count, isEmpty, hasError },
                  "recentPosts": [ { id, title, href, publishedAt, publishedAtLabel,
                                     categoryId, categoryName, isSecret } ] },
  "category":   { "id","name","type","href","posts","hasFolders","tree","showPostsList",
                  "listStyle","pageSize","paginationStyle","paginationWindowSize",
                  "paginatePosts","hasPagination","isGallery","isList","gallery","pagination" },
  "post":       { "id","title","publishedAt","publishedAtLabel",
                  "categoryName","categoryHref","href" },
  "folder":     { "id","name","depth","href","isSeries","isList","listHref","seriesHref",
                  "parentHref","ancestors","children","posts","postCount" },
  "highlights": { … 오늘 buildHighlightsSkinContext가 만드는 그대로 },
  "banner":     { … 오늘 buildBannerSkinContext가 만드는 그대로 }
}
```

**절대 넣지 않는 것 (투영 함수가 구조적으로 만들 수 없다)**

| 제외 | 근거 |
| --- | --- |
| 글 본문 / OOC | 오늘도 Context에 없다. 본문은 별도 메시지로만 간다(D-2). |
| 비밀글 제목 | `maskSkinPostTitle()`이 이미 Context 단계에서 마스킹한다. |
| 비밀글 비밀번호/해시 | `secret_password_hash`는 RLS가 막는다. 어떤 조회에도 select되지 않는다. |
| 사용자 UUID(`auth.users.id`) | 오늘 Context에 없다(실측). 투영 함수에도 키가 없다. |
| 이메일, 로그인 상태 토큰 | 조회 자체를 안 한다. |
| `skin_id` / `version_id` / DB row 키 | `get_published_skin`이 `content`만 준다. |
| imageSlot **id** | 부모가 URL로 해석해서 넣는다. |
| 관리자 정보 / operator 데이터 | 스킨 경로에 존재하지 않는다. |

`viewer.*Href`는 오늘 native 스킨이 이미 받는 값이고, **쿼리는 권한이 아니라
요청**이다(받는 쪽이 `isSiteOwnerSignedIn()`으로 다시 판정한다 —
`core/lib/site-path.js` 주석). sandbox에서도 이 원칙은 그대로다.

### D-2. 메시지 계약

**봉투**

```jsonc
{ "imory": 1, "type": "IMORY_INIT", "seq": 7, "payload": { … } }
```

- `imory: 1`은 다른 라이브러리의 postMessage 노이즈를 1차로 거른다.
- `seq`는 늦게 도착한 응답이 최신 화면을 덮지 않게 한다
  (기존 `mountToken`/`previewNavToken`/`postPageRequestSeq`와 같은 장치).

**parent → frame**

| type | payload | 검증 |
| --- | --- | --- |
| `IMORY_INIT` | `{ contract:1, pageType, template:{html,css}, data, flags:{isOwner} }` | `pageType`이 6종 리터럴 중 하나 · `template.html`/`template.css`가 문자열 · `data`가 plain object |
| `IMORY_RENDER` | `IMORY_INIT`과 동일 shape | 같음. 재렌더용(인스턴스 유지 → `update()`) |
| `IMORY_POST_BODY` | `{ bodies: [ { key\|null, html, containerStyle, isHtmlContent } ] }` | 배열 · 각 항목 타입 검사. **`preview:post-body`/`preview:folder-bodies`와 같은 shape** |

**frame → parent**

| type | payload | 검증 |
| --- | --- | --- |
| `IMORY_READY` | `{ contract:1 }` | 그대로 |
| `IMORY_HEIGHT` | `{ height:number }` | 정수 · `1 <= h <= 200000` · 직전 값과 1px 이하 차이면 무시(진동 방지) |
| `IMORY_NAVIGATE` | `{ href:string }` | 문자열 · 길이 ≤ 2048 · **부모가 `new URL(href, parentOrigin)`로 파싱하고 라우트 판정까지 한다.** frame은 route business logic을 모른다(기존 `preview:navigate`와 같은 분리) |
| `IMORY_COPY_LINK` | `{ href:string }` | 위와 같은 검증 후 **부모 origin의 경로로 정규화한 문자열만** 클립보드에 넣는다 |
| `IMORY_ERROR` | `{ message:string }` | 문자열 · 길이 ≤ 500 · 로그에만 쓴다(화면에 그대로 찍지 않는다) |

**검증 방법 (양방향 공통, `skin-sandbox-protocol.js` 한 곳)**

1. `event.origin`이 **하드코딩된 상대 origin과 정확히 일치**하는가
   - 부모는 `SANDBOX_SKIN_ORIGIN` 상수와 비교
   - frame은 `SANDBOX_SKIN_PARENT_ORIGINS` 상수 목록과 비교
     (production은 `https://imory.me` 하나. 로컬 개발 origin은
     `location.hostname === "localhost"`일 때만 목록에 더한다 —
     production 번들이 절대 localhost를 신뢰하지 않게)
2. `event.source`가 기대한 window인가
   (부모: `iframe.contentWindow` / frame: `window.parent`) — 기존 코드와 동일
3. `data.imory === 1 && typeof data.type === "string"`
4. 타입별 필드 검사. **알려진 키만 읽는다**(`{...data}` 금지).
5. 실패는 **조용히 무시**한다. 응답도 로그도 최소화한다(프로빙 신호 차단).

**`targetOrigin`을 `"*"`로 쓰지 않는 구조**

- 부모 → frame: `frame.contentWindow.postMessage(msg, SANDBOX_SKIN_ORIGIN)`
- frame → 부모: `window.parent.postMessage(msg, SANDBOX_SKIN_PARENT_ORIGIN)`
  (frame이 **자기 상수**를 쓴다. INIT 메시지가 알려 준 값을 쓰지 않는다 —
  공격자가 값을 심을 수 있는 경로를 만들지 않는다.)

> **이 구조가 `allow-same-origin`을 요구하는 이유**:
> `sandbox`에 `allow-same-origin`이 없으면 iframe은 **opaque origin**이 되어
> `event.origin`이 `"null"`이 되고, 부모는 `postMessage(msg, "null")`을 쓸 수
> 없어 `"*"`로 떨어진다. 요구사항("`*`를 쓰지 않는다")과 직접 충돌한다.
> 자세한 안전성 근거는 D-4.

### D-3. iframe이 할 수 있는 것 / 없는 것

**할 수 있는 것**

- 자기 문서 안에 `renderSkin()`으로 DOM을 그린다
- 스킨 CSS를 적용한다 (부모 CSS와 완전히 격리 — 양방향)
- 허용된 origin에서 이미지/폰트를 불러온다
- 위 5종 메시지를 부모에 보낸다
- (SANDBOX-5 이후) 저자 JS를 자기 문서 안에서만 실행한다

**할 수 없는 것 (구조적으로)**

| 못 하는 것 | 막는 장치 |
| --- | --- |
| Imory 로그인 세션 읽기 | **다른 origin → localStorage 접근 불가.** Supabase 세션은 `imory.me` localStorage에만 있다(인증 쿠키 없음) |
| 관리 화면 DOM 읽기/조작 | cross-origin `parent.document` 접근은 브라우저가 차단 |
| Supabase 클라이언트 사용 | frame 문서가 `supabase-js`도 `supabase-client.js`도 로드하지 않는다 + CSP `connect-src 'none'` |
| 임의 네트워크 호출 | CSP `connect-src 'none'` (fetch/XHR/WebSocket/beacon 전부) |
| 부모 페이지 이동 | `allow-top-navigation` 없음 |
| 팝업/새 탭 | `allow-popups` 없음 — 외부 링크도 부모가 연다 |
| 폼 전송 | `allow-forms` 없음 + CSP `form-action 'none'` |
| `alert`/`confirm` | `allow-modals` 없음 |
| 다른 문서 iframe으로 끼우기 | CSP `frame-src 'none'` |
| 플러그인/워커 | CSP `object-src 'none'`, `worker-src 'none'` |
| 자기 CSP 우회 | 응답 헤더로 오므로 문서가 못 바꾼다 |
| 자기 sandbox 속성 제거 | 부모 DOM 접근 불가 → 못 한다(단, D-4의 same-origin 조건 필수) |

**본체가 반드시 검증해야 하는 것 (한 줄 요약)**

`origin` → `source` → `imory:1` → `type` → 타입별 필드 → **알려진 키만 읽기**.
그리고 `IMORY_NAVIGATE`/`IMORY_COPY_LINK`의 `href`는
**절대 그대로 쓰지 않는다** — 부모 origin 기준으로 파싱해서
기존 `resolveInSiteSkinRoute()` 규칙에 맞는 것만 SPA 라우터에 넘기고,
그 외는 오늘 `skin-link-nav.js`가 하는 그대로 처리한다.

### D-4. 별도 origin 구성

**제안: 1단계는 단일 호스트 `skin-frame.imory.me`**

| 후보 | 장점 | 단점 | 판단 |
| --- | --- | --- | --- |
| `skin-frame.imory.me` | Cloudflare Pages 커스텀 도메인 하나 추가로 끝. 인증서 자동. | 모든 사용자 스킨이 **같은 origin**을 공유 → 스킨끼리는 서로 격리되지 않는다 | **SANDBOX-1 채택.** 스킨은 저장소도 세션도 안 쓰므로 당장 문제가 없다 |
| `{slug}--skin.imory.me` | 스킨끼리도 격리. 저자 JS를 켤 때 필요해진다 | Pages 와일드카드 커스텀 도메인 필요. slug 검증·CSP `frame-ancestors` 동적 생성 필요 | **SANDBOX-5에서 재검토.** 저자 JS를 켜는 시점의 전제 조건으로 기록 |
| 완전히 다른 등록 도메인 | eTLD+1이 달라 쿠키 도메인도 공유 안 됨. 가장 강한 격리 | 도메인 구매·관리·인증서. Pages 프로젝트 분리 검토 | 필요해지면. 지금은 과하다 |

**Cloudflare Pages에서의 현실적 구성**

같은 Pages 프로젝트에 커스텀 도메인을 하나 더 붙이면 **같은 파일 트리가 두
호스트에서 전부 보인다**. 즉 `skin-frame.imory.me/index.html`로 앱 전체가,
`imory.me/skin/sandbox/frame.html`로 프레임 문서가 열린다. 그대로 두면
안 된다(프레임 origin에서 앱이 뜨면 그 origin에 별개 세션이 생길 수 있고,
메인 origin에서 프레임이 뜨면 same-origin 격리가 깨진다).

`functions/_middleware.js`가 이미 모든 요청을 먼저 받으므로 거기서 잘라낸다:

```
if (host === SANDBOX_HOST) {
    /skin/sandbox/ 아래 + 버전 로더가 필요로 하는 자산만 통과, 나머지 404
    통과하는 HTML 응답에는 아래 CSP 부여
} else {
    /skin/sandbox/frame.html 요청은 404          // 메인 origin에서 못 열게
    ... 기존 pages.dev 리다이렉트 + og meta 주입 그대로
}
```

**frame 문서에 부여할 CSP (SANDBOX-1)**

```
default-src 'none';
script-src  'self';
style-src   'self' 'unsafe-inline';
img-src     https: data: blob:;
font-src    https: data:;
media-src   'none';
connect-src 'none';
frame-src   'none';
object-src  'none';
worker-src  'none';
form-action 'none';
base-uri    'none';
frame-ancestors https://imory.me;
```

- `style-src 'unsafe-inline'`: `renderSkin()`이 스킨 CSS를
  `<style>.textContent`로 넣으므로 필요하다. **이것이 sandbox origin이
  필요한 이유 그 자체다** — 메인 origin에 이런 CSP를 줄 수는 없다.
- `script-src 'self'`: 저자 JS는 아직 실행하지 않는다. SANDBOX-5에서
  `blob:`을 더하고 JS를 Blob URL 모듈로 주입한다(인라인 `'unsafe-inline'`
  으로 여는 것보다 좁다).
- `frame-ancestors https://imory.me`: **이 문서를 남이 자기 사이트에 못
  끼운다.** `X-Frame-Options` 대신 이것을 쓴다(더 정밀하다).
- `connect-src 'none'`: iframe이 데이터를 어디로도 못 보낸다. 유출
  경로를 메시지 채널 하나로 좁히는 핵심 조항이다.

**iframe 속성**

```html
<iframe
  src="https://skin-frame.imory.me/skin/sandbox/frame.html?v=<APP_BUILD_VERSION>"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
  loading="eager"
  title="스킨"
  scrolling="no">
```

**`allow-same-origin`의 필요성과 위험 — 명확히**

- 위험한 조합은 **`allow-scripts allow-same-origin`을 *부모와 같은 origin*의
  문서에 주는 것**이다. 그러면 iframe이 `parent.document`로 나가
  자기 `sandbox` 속성을 지우고 리로드해 샌드박스를 벗을 수 있다.
- 여기서는 **origin이 진짜로 다르다**. `allow-same-origin`은
  "이 문서가 **자기 자신의** origin(`skin-frame.imory.me`)을 유지한다"는
  뜻이지 "부모와 같아진다"는 뜻이 아니다. 부모 DOM 접근은 여전히
  브라우저가 막는다.
- 반대로 이것을 빼면: origin이 opaque가 되어 ① `targetOrigin`을 `"*"`로
  쓸 수밖에 없고(요구사항 위반), ② CSP의 `'self'`가 아무것도 가리키지
  못하며, ③ 나중에 스킨이 자기 저장소를 쓰는 길이 완전히 막힌다.
- **결론: 별도 origin + `allow-scripts allow-same-origin`이 정답이고,
  이 조합의 안전성은 전적으로 "origin이 실제로 다르다"에 의존한다.**
  그래서 `_middleware.js`의 호스트 분기(메인 origin에서 frame.html 404)가
  보안 장치이지 정리정돈이 아니다. 테스트에 반드시 넣는다.

**쿠키 분리**

- Imory는 인증 쿠키를 쓰지 않는다(Supabase = localStorage). 그래서
  세션 관점의 쿠키 분리는 이미 성립한다.
- `skin-frame.imory.me`는 `imory.me`의 서브도메인이라 `Domain=.imory.me`로
  설정된 쿠키(예: Cloudflare 계열)는 전송될 수 있다. 스킨 JS가 실행되기
  전까지는 읽을 주체가 없고, 실행을 켜는 시점(SANDBOX-5)에는
  **별도 등록 도메인 또는 `{slug}--skin` 분리**를 전제 조건으로 다시 본다.
  — 이것을 "남은 차이"로 명시해 둔다.

---

## E. 구현 순서

각 단계는 **혼자서 검증 가능**하고, 실패하면 그 단계만 되돌릴 수 있다.

### SANDBOX-0 — origin과 빈 프레임 (코드 아주 적음) — **완료, §G 참고**

- `skin/sandbox/frame.html` + `skin-sandbox-frame.js`가 `IMORY_READY`만 보낸다.
- `_middleware.js` 호스트 분기 + CSP.
- 검증: ① `skin-frame.imory.me/skin/sandbox/frame.html`이 CSP 헤더와 함께
  200 · ② `imory.me/skin/sandbox/frame.html`이 404 ·
  ③ `skin-frame.imory.me/` 가 404(앱이 안 뜬다) ·
  ④ 프레임 안에서 `fetch()`가 CSP로 막힌다 ·
  ⑤ 프레임 안에서 `parent.document` 접근이 SecurityError.
- **DB도 스킨도 안 건드린다.** 이 단계가 통과하지 않으면 다음이 무의미하다.

### SANDBOX-1 — HOME 한 장 (최소 프로토타입) — **완료, §H 참고**

- `renderMode` 계약 + `resolveSkinRenderMode()` + Import/Export 왕복.
- `projectSkinContextForSandbox()` + `IMORY_INIT` + 프레임 안 `renderSkin()`.
- `IMORY_HEIGHT` 높이 반영.
- 링크는 **비활성**(클릭해도 아무 일 없음). 네비게이션은 다음 단계.
- 검증: native HOME과 sandbox HOME이 **같은 폭·같은 innerHTML 구조**를 낸다.

### SANDBOX-2 — 네비게이션과 링크

- `skin/skin-link-nav.js`의 dispatch 부분을
  `navigateToSkinRoute(route, url)`로 **추출**(동작 무변경 리팩터링).
  click 리스너와 `IMORY_NAVIGATE` 핸들러가 그 함수 하나를 공유한다.
- 외부 링크는 부모가 `window.open(url, "_blank", "noopener")`.
- `IMORY_COPY_LINK`.
- 검증: 뒤로가기/앞으로가기/새로고침/직접 접속이 native와 동일.

### SANDBOX-3 — CATEGORY / POST / FOLDER (본문)

- 본문은 `posts/view/posts-view-detail.js`가 오늘 **DOM으로 옮기는** 것을
  `studio/preview/preview-post-body.js`가 오늘 하는 **문자열 + 메시지**로
  바꿔서 보낸다(`IMORY_POST_BODY`). 두 경로의 서식 함수는 이미 같다.
- 비밀글 gate는 **부모에 남긴다**(입력 폼이 sandbox 안으로 들어가면 안 된다).
  `post-body` region 자리에 부모가 자기 gate를 겹쳐 놓거나,
  gate 상태를 `data`로 보내 프레임이 "잠김" 표시만 그린다.
  → 이 선택은 SANDBOX-3 착수 시 별도로 결정한다(지금 확정하지 않는다).
- 소유자 도구(`owner-tools`), 하이라이트 도구(`highlight-tools`)도 같은 문제.
  region 좌표를 프레임이 보고하고 부모가 그 위에 자기 버튼을 얹는 방식이
  유력하다(Inspector overlay가 이미 같은 일을 한다).

### SANDBOX-4 — Studio Preview 통합

- `studio/preview/preview-frame.html`이 sandbox 스킨일 때
  `skin/sandbox/frame.html`을 **중첩해서** 띄우거나, Studio가 처음부터
  sandbox frame을 직접 띄운다.
- 목표: 공개 화면과 Preview가 **같은 frame 문서**를 쓴다
  (CLAUDE.md §2 "같은 template · Context · renderer 계약").
- Inspector/Direct Edit/크롭은 프레임 안 DOM 좌표를 필요로 한다 —
  `preview:inspect-*`와 같은 성격의 메시지를 sandbox 계약에 더해야 한다.
  **범위가 큰 단계다. 여기서 한 번 끊고 재설계한다.**

### SANDBOX-5 — 저자 JS

- `script-src 'self' blob:` + Blob URL ES 모듈 주입.
- 그 전에 origin 전략 재결정(스킨끼리 격리 필요 → `{slug}--skin`).
- CPU/메모리 폭주, 무한 높이 증가, 외부 리소스 정책을 함께 정한다.

---

## F. 위험 요소

| # | 위험 | 왜 생기나 | 완화 |
| --- | --- | --- | --- |
| 1 | **기존 스킨 호환성** | 새 분기가 native 경로에 끼어들 수 있다 | `renderMode` 없으면 함수 호출 자체가 늘지 않게 분기를 `resolveSkinTemplate()` 직후 한 곳에만 둔다. e2e 8934/8942/8944/8956을 **변경 없이** 통과해야 한다 |
| 2 | **모바일 높이** | iframe은 콘텐츠 높이를 스스로 못 준다. `100%`면 0이 되고, 고정값이면 잘린다 | `ResizeObserver`(documentElement) + 이미지 `load` 재측정 + 렌더 직후 1회. 1px 히스테리시스로 진동 방지. iframe `scrolling="no"` + 내부 `overflow:hidden`으로 **이중 스크롤 금지**(CLAUDE.md §2) |
| 3 | **`position: fixed`/`sticky`가 다르게 보인다** | iframe 뷰포트 = 콘텐츠 높이가 되므로 `fixed`가 화면이 아니라 문서 전체에 고정된다 | 기존 스킨은 `style` 속성도 못 쓰고 CSS에서 `position:fixed`를 쓰는 스킨이 실제로 있는지 먼저 조사. 필요하면 `sandbox` 모드 CSS validator가 `position:fixed`를 경고한다(거부 아님) |
| 4 | **뒤로가기와 URL** | 주소는 부모가 갖고 화면은 프레임이 그린다 | 프레임은 history를 절대 만지지 않는다. `IMORY_NAVIGATE`만 올리고 주소·history·스크롤 정책은 전부 부모(기존 라우터)가 오늘처럼 한다 |
| 5 | **늦게 도착한 렌더가 최신 화면을 덮는다** | 메시지는 비동기다 | `seq` 대조(기존 `mountToken`/`postPageRequestSeq`와 같은 장치). 프레임도 자기가 받은 마지막 `seq`만 그린다 |
| 6 | **외부 이미지/폰트** | CSP `img-src`/`font-src`를 좁히면 기존 스킨이 깨진다 | 오늘 `isSafeSkinUrl()`이 이미 https만 허용한다. CSP도 `https:`로 맞춘다(호스트 allowlist는 하지 않는다 — 그러면 기존 스킨이 깨진다) |
| 7 | **3D 모델 / canvas / video** | 오늘 스킨은 이것들을 **쓸 수 없다**(sanitizer가 태그를 통째로 제거). sandbox가 이 문을 여는 것으로 오해되기 쉽다 | SANDBOX-1~4는 **같은 sanitizer를 그대로 쓴다.** 태그 allowlist 완화는 별도 라운드의 별도 결정이다. `models/heart.glb`는 legacy_sua 테마 위젯이고 스킨과 무관하다(실측) |
| 8 | **Preview와 공개 화면 불일치** | sandbox 공개 화면이 생기는 순간 Preview(native iframe)와 렌더 경로가 갈라진다 | SANDBOX-1~3 동안 sandbox 스킨은 **Studio에서 편집할 수 없게** 막거나(Import 경고), native로도 같게 그려지는 범위만 허용한다. SANDBOX-4가 이 갭을 닫는 전용 단계다 |
| 9 | **CDN 캐시와 프레임 문서** | iframe은 부모의 import map도 캐시 상태도 물려받지 않는다(이미 겪은 함정 — `preview-frame.html` 주석) | frame.html은 `_headers`에 `no-cache`를 넣고, 자기 `?t=` → `?v=` 사슬을 **스스로** 선언한다. 부모가 넘기는 `?v=`와 frame 내부 값이 어긋나지 않는지 e2e로 잰다(8955와 같은 방식) |
| 10 | **메인 origin에서 frame.html이 열린다** | Pages가 두 호스트에 같은 파일을 서빙한다 | `_middleware.js` 호스트 분기. **보안 장치이므로 e2e 필수 항목**(D-4 참고) |
| 11 | **서브도메인 쿠키** | `skin-frame.imory.me`는 `.imory.me` 쿠키를 받는다 | 지금은 읽을 주체(JS)가 없다. SANDBOX-5의 전제 조건으로 기록 |
| 12 | **소유자 도구 자리** | `owner-tools`/`highlight-tools` region은 부모가 **DOM을 넣는** 자리다 | SANDBOX-3의 미해결 항목. 좌표 보고 + 부모 overlay가 유력하나 확정하지 않았다 |

---

---

## G. SANDBOX-0 구현 기록 (2026-09-15)

**상태: 이 절과 §H 가 "현재 구현"이다.** 위의 A~F는 조사와 설계이다
(CLAUDE.md §5). 문서 맨 끝의 SANDBOX-1 지시문은 **이미 수행된**
작업 지시서이고, 그 결과는 §H에 있다.

### G-1. 이 라운드가 만든 것

| 파일 | 역할 |
| --- | --- |
| `skin/sandbox/skin-sandbox-config.js` | classic. **유일한 기능 플래그**(`isSandboxSkinEnabled()`) + origin 상수. |
| `skin/sandbox/skin-sandbox-protocol.js` | classic. 부모·frame이 **각각 로드**하는 순수 검증 함수. `buildSandboxMessage()` / `validateSandboxMessage()`. |
| `skin/sandbox/skin-sandbox-host.js` | ES 모듈. 부모 쪽 iframe 생성기 `mountSandboxSkinFrame()` / `destroySandboxSkinFrame()`. `window.skinSandboxHostReady` 핸드셰이크. |
| `skin/sandbox/frame.html` | frame 진입 문서. 자기 몫의 `?t=` → `?v=` 사슬을 스스로 선언한다. |
| `skin/sandbox/skin-sandbox-frame.js` | classic. frame 쪽 bridge. 화면에 `SANDBOX FRAME READY` 한 줄. |
| `core/lib/skin-sandbox-server.js` | 호스트 분기·경로 allowlist·CSP·nonce. **`functions/` 아래 두지 않았다** — 그 디렉터리의 `.js`는 그 자체로 공개 라우트가 된다. |
| `skin/skin-sandbox-test.html` | 부모 쪽 수동 하네스. |
| `skin/sandbox/skin-sandbox-unit-test.mjs` | 단위 테스트(node). |
| `skin/sandbox/skin-sandbox-e2e-test.mjs` | E2E(Playwright). 부모 8957 / frame 8958. |

고친 기존 파일은 **둘뿐이고 둘 다 서버 쪽**이다:
`functions/_middleware.js`(호스트 분기 + CSP), `_headers`(frame 문서 no-cache).
`index.html`·`skin/skin-home.js`를 비롯한 **클라이언트 렌더링 경로는 한 줄도
고치지 않았다** — SANDBOX-0의 "기존 렌더링 무변경"은 조건부 분기가 아니라
파일을 건드리지 않은 것으로 성립한다. 호출자는 SANDBOX-1이 붙인다.

### G-2. 기능 플래그

> **변경됨 → §I.** 아래는 SANDBOX-0 시점의 기록이다. 2026-09-15에
> production 관문이 "opt-in 신호"에서 **"블로그 slug allowlist"**로
> 바뀌었고, `SANDBOX_SKIN_ENABLED_HOSTS`도 더 이상 비어 있지 않다.
> 쿼리·localStorage opt-in은 **로컬 개발 호스트 전용**으로 남았다.

`isSandboxSkinEnabled()`는 **두 관문을 모두** 통과해야 true다.

1. hostname이 로컬 개발 호스트이거나 `SANDBOX_SKIN_ENABLED_HOSTS`에
   사람이 적어 넣은 호스트인가 — 지금 그 배열은 **비어 있다**.
2. `?sandboxSkin=1` 또는 `localStorage["imory.sandboxSkin"]`이 있는가.

(2)만으로는 켜지지 않는다. 그래서 `imory.me` 방문자가 주소에
`?sandboxSkin=1`을 붙여도 아무 일도 일어나지 않는다(단위 테스트
`[flag]` 절이 그것을 판정한다). production에서 켜려면 **파일을 고쳐
배포**해야 한다.

`SANDBOX_SKIN_PRODUCTION_ORIGIN`도 빈 문자열이다 — 비어 있으면
`resolveSandboxSkinFrameOrigin()`이 `""`를 돌려주고 host 모듈이 iframe을
아예 만들지 않는다. **부모 자신의 origin으로는 절대 폴백하지 않는다**
(그러면 same-origin + `allow-same-origin`이라는 위험한 조합이 된다).

### G-3. 실제 origin 구성 (측정값 포함)

| 항목 | 값 |
| --- | --- |
| 부모(메인) | `https://imory.me` — Cloudflare 프록시, NS `macy.ns.cloudflare.com` |
| frame(production) | `https://skin-frame.imory.me` — Pages 커스텀 도메인 Active(2026-09-15). **이 라운드 착수 시점에는 NXDOMAIN이었고**, 도메인이 붙은 뒤 `SANDBOX_SKIN_PRODUCTION_ORIGIN`에 값을 채웠다 |
| frame(로컬 개발) | `http://localhost:8958` — 부모 `http://localhost:8957`과 **포트로** origin이 갈린다 |

`https://imory.me/skin/sandbox/frame.html`은 **오늘 200 text/html**을
돌려준다(실측). `_redirects`의 SPA fallback이 index.html을 주기 때문이다.
즉 호스트 분기가 없으면 배포 즉시 메인 origin에서도 프레임 경로가 열린다 —
그래서 `_middleware.js`의 404는 정리정돈이 아니라 보안 장치다(§F#10).

### G-4. `{slug}--skin.imory.me` 가능한가 — 지금은 아니다

저장소 안에 Cloudflare 설정 파일이 없다(`wrangler.toml`/`pages.json` 없음,
`.wrangler/`는 로컬 캐시이고 `.gitignore` 대상). 그래서 **저장소만으로는
판단할 수 없고**, DNS를 직접 재어 판단했다.

| 확인한 것 | 결과 | 결론 |
| --- | --- | --- |
| `imory.me` | 존재, Cloudflare 프록시 | apex는 설정돼 있다 |
| `www.imory.me` | NXDOMAIN | 와일드카드 DNS가 **없다** |
| `skin-frame.imory.me` | NXDOMAIN | 고정 frame 호스트도 아직 없다 |
| `test--skin.imory.me` | NXDOMAIN | `{slug}--skin` 형태가 지금 뜨지 않는다 |

DNS 와일드카드는 **가장 왼쪽 레이블 전체**에만 걸린다. `*--skin.imory.me`는
유효한 와일드카드가 아니므로 `*.imory.me`를 써야 하고, 그러면 `--skin`
접미사 규칙은 DNS가 아니라 **애플리케이션(여기 미들웨어)**이 강제해야 한다.
인증서 쪽은 Cloudflare Universal SSL이 `imory.me` + `*.imory.me` 한 단계를
덮으므로 `alice--skin.imory.me`가 그 범위 안이지만, **Pages 커스텀 도메인이
와일드카드를 받는지는 대시보드를 봐야 확정된다**(§G-8 사람 작업 목록).

→ **SANDBOX-0의 선택: 고정된 단일 frame origin.**
로컬은 포트로 가른 `http://localhost:8958`, production은 붙인 뒤
`skin-frame.imory.me` 하나.

> ★ 제약 (반드시 지킨다)
> **여러 사용자의 임의 JS를 같은 origin에서 실행하면 안 된다.**
> 단일 frame origin에서는 스킨끼리 격리되지 않는다 — A의 스킨 JS가
> 같은 origin의 저장소·캐시·(같은 origin으로 열린) 다른 문서에 닿는다.
> 지금은 실행되는 저자 JS가 **하나도 없어서** 문제가 없을 뿐이다.
> SANDBOX-5에서 `js` 실행을 켜기 전에 origin 전략을 먼저 바꾼다
> (`{slug}--skin` 또는 별도 등록 도메인). 이것이 SANDBOX-5의
> **전제 조건**이지 최적화가 아니다.
> 서브도메인 쿠키(`Domain=.imory.me`)도 같은 시점의 재검토 항목이다(§F#11).

### G-5. iframe sandbox 속성

```html
<iframe
  src="https://<frame-origin>/skin/sandbox/frame.html?v=<APP_BUILD_VERSION>"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
  loading="eager"
  title="스킨"
  scrolling="no">
```

`allow-top-navigation` / `allow-popups` / `allow-forms` / `allow-modals` /
`allow-downloads`는 **주지 않는다**(e2e가 속성 문자열로 직접 판정한다).
`allow-same-origin`이 필요한 이유와 그것이 여기서 안전한 이유는 §D-4와
`skin/sandbox/skin-sandbox-host.js` 상단 주석에 있다.

### G-6. CSP 전문 (실제 응답 헤더, 2026-09-15 측정)

```
default-src 'none';
script-src 'self' 'nonce-<요청마다 새로>';
style-src 'nonce-<같은 값>';
img-src 'none';
font-src 'none';
media-src 'none';
connect-src 'none';
frame-src 'none';
child-src 'none';
object-src 'none';
worker-src 'none';
manifest-src 'none';
form-action 'none';
base-uri 'none';
frame-ancestors https://imory.me;
sandbox allow-scripts allow-same-origin
```

- **`unsafe-inline`도 `unsafe-eval`도 없다.** frame.html의 인라인
  부트스트랩 두 개와 `<style>` 하나는 nonce로 허용한다. nonce는
  `_middleware.js`가 응답을 내보낼 때 만들어 **헤더와 문서에 같은 값**을
  넣는다 — 그래서 그 문서는 `Cache-Control: no-store`다.
- frame이 ES 모듈을 쓰지 않는 것은 의도적이다. 모듈을 쓰면 인라인
  `<script type="importmap">`이 필요해지고 CSP를 한 칸 더 넓혀야 한다.
- `sandbox` 지시어를 헤더로도 건다 — 누가 이 문서를 최상위 탭으로
  직접 열어도 같은 제약을 받는다.

**TODO — 나중에 열어야 하는 지점** (`core/lib/skin-sandbox-server.js`의
`buildSandboxCsp()` 주석에 같은 내용이 있다):

| 단계 | 넓혀야 하는 것 | 이유 |
| --- | --- | --- |
| SANDBOX-1 | `style-src`에 `'unsafe-inline'` | `renderSkin()`이 스킨 CSS를 `createElement("style")`로 붙인다. 동적 `<style>`도 style-src 적용 대상이고 렌더러는 nonce를 모른다. **메인 origin에 이 CSP를 줄 수 없다는 것이 별도 sandbox origin이 필요한 이유 그 자체다.** |
| SANDBOX-1 | `img-src https: data: blob:` · `font-src https: data:` | 스킨 이미지·imageSlot·웹폰트. 호스트 allowlist는 하지 않는다(기존 스킨이 깨진다 — §F#6). `isSafeSkinUrl()`이 이미 https만 허용한다. |
| SANDBOX-1 | `script-src`에 import map 한 칸 | nonce로 덮을 수 있으면 nonce, 안 되면 해시. `'unsafe-inline'`으로 열지 않는다. |
| SANDBOX-5 | `script-src blob:` | 저자 JS를 Blob URL ES 모듈로 주입. |
| SANDBOX-5 | **GLB(3D 모델)** → `connect-src` | GLB는 보통 `fetch()`로 받는다. `connect-src 'none'`은 "iframe이 데이터를 어디로도 못 보낸다"를 지탱하는 핵심 조항이라 **가장 늦게, 가장 좁게**(자산 전용 호스트 하나) 연다. 태그 자체(`<canvas>`/`<model>`)는 오늘 sanitizer가 제거하므로 CSP와 **별개의 결정**이다(§F#7). |

### G-7. 메시지 계약 (이번 라운드에서 실제로 도는 것)

```
frame  -> parent   IMORY_FRAME_READY  { contract: 1 }
parent -> frame    IMORY_FRAME_ACK    { contract: 1 }
```

봉투는 `{ imory: 1, type, seq, payload }`. 검증은
`skin/sandbox/skin-sandbox-protocol.js` **한 곳**에서,
`origin → source → 봉투(imory:1) → type → 방향 → seq → payload(알려진 키만)`
순으로 한다. 실패는 **조용한 무시**다(응답도 화면 표시도 없다).

- `targetOrigin`에 `"*"`가 **없다.** 부모는 자기가 해석한 frame origin
  상수를, frame은 자기 상수 목록에서 고른 값을 쓴다. frame은 부모가
  메시지로 알려 준 origin을 절대 쓰지 않는다.
- `direction`이 있어서 **부모가 `IMORY_FRAME_ACK`을 받지 않는다**
  (반대도 같다).
- payload에 모르는 키가 하나라도 있으면 거부한다(`{...payload}` 금지).

> ★ 이름 정리: §D-2는 같은 신호를 `IMORY_READY`로 적고 있다.
> SANDBOX-0 지시문의 `IMORY_FRAME_READY`/`IMORY_FRAME_ACK`을 정본으로
> 삼았다. SANDBOX-1에서 §D-2 표를 이 이름으로 맞춘다.

### G-8. Cloudflare 설정 (2026-09-15 완료)

사용자가 대시보드에서 마친 것 — 코드로는 할 수 없는 일이다.

| 항목 | 값 | 상태 |
| --- | --- | --- |
| Custom domain | `skin-frame.imory.me` | **Active** |
| Custom domains 전체 | `imory.me` · `skin-frame.imory.me` **둘뿐** | 확인됨 |
| 환경변수 | `SANDBOX_SKIN_HOST = skin-frame.imory.me` | 설정됨 |
| 환경변수 | `SANDBOX_SKIN_PARENT_ORIGINS = https://imory.me` | 설정됨 |
| 환경변수 | `IMORY_EXTRA_HOSTS` | **설정 안 함** — 위 목록이 둘뿐이므로 불필요 |

> ★ 커스텀 도메인을 **나중에 더 붙이면** 그 도메인은 404가 된다.
> 이 라운드부터 `_middleware.js`가 예상하지 않은 Host를 거부하기
> 때문이다. 도메인을 추가할 때 `IMORY_EXTRA_HOSTS`(공백 구분)에
> 함께 넣어야 한다.

**아직 확인하지 않은 것**: Pages가 와일드카드 커스텀 도메인
(`*.imory.me`)을 받는지. SANDBOX-5의 `{slug}--skin` 전략이 거기에
달려 있다 — 그 단계 착수 전에 확인한다.

**환경변수 오설정에서도 메인이 죽지 않는 이유**
`classifyImoryHost()`는 sandbox를 먼저 보지만, `imory.me`는 코드
상수(`IMORY_MAIN_HOST`)로 항상 `main`이다. 환경변수가 없거나 비었거나
오타여도 최악은 "sandbox 경로가 안 열린다"에서 끝난다. 유일하게
위험했던 값은 `SANDBOX_SKIN_HOST = imory.me`(메인이 sandbox로 분류되어
allowlist 5개 경로만 남는다)인데, `resolveSandboxServerConfig()`가 그
값을 **없는 것으로 친다**. e2e `[env]` 절이 8가지 오설정 × 메인/admin
경로로 실제 미들웨어에 먹여 판정한다.

`APP_BUILD_VERSION`은 **올리지 않았다** — 이 라운드는 기존 CSS/JS를
한 파일도 고치지 않았다(새 파일과 서버 코드뿐). 기존 자산의 캐시를
무효화할 이유가 없다.

### G-9. 검증 결과 (구분해서)

| 종류 | 결과 |
| --- | --- |
| 단위 테스트 (node) | `skin/sandbox/skin-sandbox-unit-test.mjs` **80/80** |
| E2E (mock, Playwright chromium) | `skin/sandbox/skin-sandbox-e2e-test.mjs` **119/119** |
| E2E (mock, Playwright webkit) | 같은 파일 (초판 74/74; `[regress]`/`[env]` 추가 후 chromium으로 재확인) |
| 기존 회귀 (mock) | 8934 **64/64** · 8942 **71/71** · 8956 **58/58** · 8954(share-card, 같은 `_middleware.js`) **175/175** · 8944 **70/1 실패** — 그 1건은 이 라운드 **이전부터** 실패하던 것(변경을 stash하고 돌려 동일 결과 확인) |
| 실제 DB 검증 | **해당 없음** — DB도 스키마도 건드리지 않았다 |
| 배포 확인 | §G-10 |
| 실기기 확인 | **미실시** |

E2E가 쓰는 origin 두 개는 **포트로 가른 실제 다른 origin**이고, 두 서버 모두
요청을 **배포되는 그 `functions/_middleware.js`에 그대로 통과**시킨다 —
호스트 분기와 CSP가 테스트용 복제본이 아니다.

### G-10. 배포 확인 (2026-09-15, 실제 네트워크)

커밋 `aeb974d`(SANDBOX-0) + `cd98c90`(Pages 리다이렉트 대응) 배포 후,
캐시 우회 질의와 `Cache-Control: no-cache`로 직접 재었다.

| 주소 | 결과 |
| --- | --- |
| `https://imory.me/` | **200** |
| `https://imory.me/skin/sandbox/frame.html` | **404** |
| `https://imory.me/skin/sandbox/frame` | **404** |
| `https://skin-frame.imory.me/skin/sandbox/frame` | **200** (정본) |
| `https://skin-frame.imory.me/skin/sandbox/frame.html` | **308** → `/skin/sandbox/frame` |
| `https://skin-frame.imory.me/` | **404** |
| `https://skin-frame.imory.me/index.html` | **404** |
| `https://skin-frame.imory.me/core/lib/supabase-client.js` | **404** |
| `https://skin-frame.imory.me/skin/skin-render.js` | **404** |
| `https://skin-frame.imory.me/skin/sandbox/skin-sandbox-config.js` | **200** + `nosniff` |

frame 문서 응답 헤더: `Cache-Control: no-store` · `X-Content-Type-Options: nosniff` ·
`Referrer-Policy: no-referrer` · CSP 전문은 §G-6과 **글자 그대로 동일**.
nonce는 요청마다 달랐고(`x4Qc…` / `Bdua…`), 문서 안의 인라인 블록 셋에
같은 값으로 들어갔다.

실제 브라우저(Chromium)로 배포된 두 origin을 열어 확인한 것:

- 공개 홈 · `/admin/` · `/auth/` · `/invite/` 전부 200, 페이지 오류 0
- `imory.me`에서 플래그가 **OFF**이고 iframe이 **0개**
- 플래그만 덮어 배포된 host 모듈을 부르면
  `imory.me` → `skin-frame.imory.me` **cross-origin iframe**이 뜨고
  화면에 `SANDBOX FRAME READY`, **READY → ACK 왕복 성립**
- 프레임에서 `parent.document` / `parent.localStorage` → **SecurityError**
- 프레임 `localStorage`가 **비어 있다**(Imory 세션 키 없음)
- 프레임 안 `fetch()` → CSP로 **차단**
- 프레임에 `supabase` 전역 **없음**
- 390px에서 부모·프레임·공개 홈 모두 가로 넘침 **0**

#### 배포에서만 드러난 것 둘

**① Cloudflare Pages의 HTML URL handling** — `/foo.html`은 200이 아니라
**308 → `/foo`**다(`/admin/index.html` → `308 /admin/`으로 실측). 1차 배포에서
frame 문서만 404였던 원인이 이것이다. 로컬 테스트 서버가 `.html` 파일을 그대로
줬기 때문에 로컬에서는 잡히지 않았다 — 지금은 e2e 서버가 질의 문자열까지
포함해 Pages와 같이 308을 낸다. 정본 주소는 확장자 없는 쪽이고, **두 주소 모두**
sandbox origin에서 허용되고 메인 origin에서 막힌다.

**② Cloudflare Web Analytics beacon** — Cloudflare가 이 Function이 돌려준 HTML에
`/cdn-cgi/.../beacon.min.js`를 **나중에** 끼워 넣는다. 스크립트는 same-origin이라
`script-src 'self'`로 받지만, beacon이 `/cdn-cgi/rum`으로 보내려는 요청은
`connect-src 'none'`에 막혀 프레임 콘솔에 CSP 위반이 한 줄 남는다.
**고장이 아니라 그 조항이 일하고 있다는 증거다** — 분석을 살리자고
connect-src를 열지 않는다. (`/cdn-cgi/*`는 우리 Function보다 앞단의
Cloudflare 인프라 경로이고, `/cdn-cgi/rum` 자체는 이 호스트에서 404다.)


---

## H. SANDBOX-1 구현 기록 (2026-09-15)

**상태: §G와 함께 "현재 구현"이다.** 위의 A~F는 조사와 설계이고,
아래 §H는 실제로 저장소에 들어간 코드다(CLAUDE.md §5).

이 라운드의 범위는 **HOME 한 장**이다. CATEGORY/POST/FOLDER/
HIGHLIGHTS/BANNER, 네비게이션, 저자 JS, Studio Preview 통합은
들어가지 않았다.

### H-1. 만든 것 / 고친 것

| 새 파일 | 역할 |
| --- | --- |
| `skin/sandbox/skin-sandbox-context.js` | classic. `projectSkinContextForSandbox()` / `isSandboxContextShape()`. **데이터 신뢰 경계**. |
| `skin/test-skins/imory-sandbox-home-v1.json` | `renderMode:"sandbox"` fixture 스킨(저자 JS 없음). |
| `skin/sandbox/skin-sandbox-package-test.html` | Import/Export 왕복 하네스(부모 origin 전용). |

| 고친 파일 | 내용 |
| --- | --- |
| `skin/skin-template.js` | `resolveSkinRenderMode()` / `isKnownSkinRenderMode()` 추가. **기존 함수 무수정**. |
| `skin/skin-package-import.js` | `renderMode` allowlist. 모르는 값은 `reason:"render-mode"`로 거부. |
| `skin/skin-package-export.js` | `renderMode`를 export allowlist에 추가(아는 값만). |
| `skin/skin-render.js` | **선택 인자** `styleNonce`. 넘기지 않는 호출자의 결과는 그대로. |
| `skin/skin-home.js` | `resolveSkinTemplate()`+Context 조립 뒤, `renderSkin()` 바로 앞에 분기 한 곳. |
| `index.html` | classic 3 + module 1 + `window.skinSandboxHostReady`. |
| `core/lib/build-version.js` | `writeVersionedImportMap(paths, nonce)` — **선택** 두 번째 인자. `APP_BUILD_VERSION` 상향. |
| `skin/sandbox/frame.html` | 렌더러 사슬 + import map + nonce 전달. 진단 문구 제거(렌더 컨테이너가 됐다). |
| `skin/sandbox/skin-sandbox-frame.js` | classic → **ES 모듈**. `renderSkin()` 호출 + 높이 보고. |
| `skin/sandbox/skin-sandbox-host.js` | `mountSandboxSkin()` 추가(기존 `mountSandboxSkinFrame()`은 그대로 남아 하위 계층이 됐다). |
| `skin/sandbox/skin-sandbox-protocol.js` | 메시지 4종 추가 + 타입별 값 검사(`check`). |
| `core/lib/skin-sandbox-server.js` | 경로 allowlist 5개 추가, CSP 세 칸 확장, media origin 해석. |
| `functions/_middleware.js` | `sandboxFrameHeaders()`에 config 전체를 넘긴다(한 줄). |
| `skin/skin-sandbox-test.html` | 부모 하네스가 실제 렌더 경로를 돈다(native 비교 렌더 포함). |

**DB migration 없음.** `renderMode`는 `skin_versions.content jsonb`
안이라 스키마가 바뀌지 않는다. `schemaVersion`은 **1 그대로**다 —
2로 올리면 renderMode를 모르는 기존 배포가 그 스킨을 legacy 화면으로
통째로 폴백시킨다(§C).

### H-2. native / sandbox 분기가 있는 곳 — **한 곳뿐이다**

```
skin/skin-home.js  renderPublishedSkinHome()
  ├ get_published_skin RPC          ← 오늘과 동일
  ├ schemaVersion 검사               ← 오늘과 동일
  ├ resolveSkinTemplate(pkg,"home")  ← 오늘과 동일
  ├ buildSkinContext(...)            ← 오늘과 동일
  │
  ├ resolveSkinRenderMode(pkg) === "sandbox"  ← ★ 유일한 분기
  │     └ tryMountSandboxSkinHome() → true 면 여기서 끝
  │
  └ renderSkin({container, skin, context})    ← 오늘과 동일
```

조회·Context 조립이 분기 **위**에 있는 것이 핵심이다. sandbox는
"그 결과를 어디에 그리는가"만 다르므로 조건문이 한 줄에 모인다.

**다른 다섯 진입 모듈(`skin-category.js` / `skin-post.js` /
`skin-folder.js` / `skin-highlights.js` / `skin-banner.js`)은 이
라운드에서 한 줄도 고치지 않았다.**

### H-3. CATEGORY/POST에서 sandbox 스킨은 어떻게 되는가

**native로 그린다.** "미지원"이라며 화면을 비우지 않는다.

근거: SANDBOX-1~2의 sandbox 패키지는 native 마크업 계약을 그대로
지키므로(§C) native 렌더 결과가 정상 화면이다. 그리고 그 다섯
모듈이 `renderMode`를 **아예 보지 않으므로**, 코드 경로가 이
라운드 이전과 byte 단위로 같다 — "기존 native 스킨 렌더링 결과
변경 금지"가 조건문이 아니라 **파일을 건드리지 않은 것**으로
성립한다.

> 남은 차이: 한 사이트 안에서 HOME만 cross-origin 프레임이고
> 나머지는 같은 문서다. 사용자에게는 보이지 않지만(둘 다 같은
> 스킨·같은 렌더러), HOME↔CATEGORY 이동이 문서 경계를 넘나든다.
> SANDBOX-3이 나머지 화면을 가져가면 사라진다.

### H-4. HOME payload 전체 schema

`projectSkinContextForSandbox(context, "home")`의 결과가 그대로
`IMORY_RENDER_HOME`의 `data`다. **원본 Context를 스프레드하지 않고
알려진 키만 새 리터럴로 옮긴다** — 필드를 늘리려면 그 파일을 고쳐야
하고, 고치는 사람이 "이것을 다른 origin에 보내도 되는가"를 한 번
묻게 된다.

```jsonc
{
  "contract": 1,
  "pageType": "home",

  "page": { "type", "isHome", "isCategory", "isPost",
            "isBanner", "isFolder", "isHighlights", "isMemos" },
            // ★ pageType 하나로 **다시 만든다**(정확히 하나만 true)

  "site":    { "title", "slug", "faviconUrl", "description", "language" },
  "profile": { "nickname", "bio", "avatarUrl" },

  "navigation": {
    "home":               navItem,
    "categories":        [navItem],
    "postCategories":    [navItem],
    "galleryCategories": [navItem],
    "textPostCategories":[navItem],
    "bannerCategories":  [navItem],
    "highlights":         highlightsNav,
    "memos":              highlightsNav   // ★ 같은 객체(값이 갈라질 수 없다)
  },

  "banners": { "items": [ { "id", "imageUrl", "href", "alt" } ] },

  "viewer": {                              // ★ 언제나 방문자 값 — H-5
    "isOwner": false,
    "writeHref": null, "adminHref": null, "manageHref": null,
    "toolsHref": null, "highlightHref": null,
    "canManageHighlights": false, "canManageMemos": false
  },

  "images": { "<slotName>": "https://… | null" },
            // 슬롯 이름은 /^[A-Za-z][A-Za-z0-9_-]{0,63}$/ 만
            // (그대로 옮기면 "__proto__" 같은 키가 섞일 수 있다)

  "home": {
    "highlights": {
      "cards":    [highlightCard],
      "featured": [highlightCard],   // ★ cards 에서 다시 만든다
      "card":      highlightCard|null,
      "hasCard", "count", "isEmpty", "hasError"
    },
    "recentPosts": [ { "id", "title", "href", "publishedAt",
                       "publishedAtLabel", "categoryId",
                       "categoryName", "isSecret" } ]
  }
}

navItem        = { id, name, type, href, iconKind, itemCount, enabled }
highlightsNav  = { name, href, type, iconKind, hasCategory,
                   showStandaloneLink, categoryId, enabled }
highlightCard  = { id, excerpt, note, hasNote, color, date, dateLabel,
                   postId, postTitle, postHref, hasNoPostLink,
                   categoryName, folderName, folderNamePath,
                   sourcePathLabel, sourcePathSegments, categoryHref,
                   folderId, folderHref, placement, isMissing,
                   isPlacementUnknown, isPlaced, placementLabel }
```

**투영은 양쪽에서 각각 한 번씩 돈다** — 보내기 전에 부모가, 받은 뒤에
프레임이. 프레임이 부모를 믿지 않아도 되고, 위조 메시지가 프로토콜
검사를 통과하더라도 `renderSkin()`에는 알려진 키만 닿는다.

### H-5. 프레임에 **넣지 않는** 것

| 제외 | 어떻게 보장되나 |
| --- | --- |
| Supabase client | 투영 함수에 키가 없다. 애초에 구조화 복사도 안 된다. |
| access / refresh token | 조회 자체를 안 한다. Context에 없다. |
| 사용자 UUID(`ownerId`) | 오늘 Context에 없다(실측). 투영 함수에도 키가 없다. |
| 이메일 | 같음. |
| DOM node · 함수 | 구조화 복사 불가 + 투영 함수가 문자열/불리언/배열만 만든다. |
| 글 본문 · OOC | 오늘도 Context에 없다(의도적 설계). |
| 비밀글 원문 / 비밀번호 | RLS가 막고, 제목은 `maskSkinPostTitle()`이 Context 단계에서 이미 마스킹한다. |
| `skin_id` / `version_id` / DB row 키 | `get_published_skin`이 `content`만 준다. 투영 함수에도 키가 없다. |
| imageSlot **id** | 부모가 URL로 해석해 넣는다. 프레임은 "슬롯"을 모른다. |
| **관리자 여부 · 관리자 전용 링크** | ↓ |

**★ `viewer`를 방문자 값으로 고정한 것은 이 라운드의 결정이다.**

§D-1의 계약은 `viewer.isOwner` / `adminHref` / `writeHref` /
`manageHref`를 포함하고, native HOME은 지금도 그 값들을 받는다.
그러나 SANDBOX-1 지시문이 "관리자 여부 및 관리자 전용 링크"를
전달 금지 목록에 **명시**했다. 그 문장을 그대로 지켰다.

결과와 남은 차이:

- sandbox HOME은 **주인장에게도 방문자 화면으로 보인다.** 스킨이
  그린 WRITE/ADMIN/EDIT 링크가 나오지 않는다.
- 이 라운드에서는 실질적 손실이 거의 없다 — 프레임 안 링크가
  전부 비활성이고(네비게이션은 SANDBOX-2), 소유자 도구 자리
  (`owner-tools`)를 cross-origin에서 채우는 방법도 아직 정해지지
  않았다(§F#12, SANDBOX-3).
- 되돌리는 지점은 한 곳이다:
  `skin/sandbox/skin-sandbox-context.js`의
  `SANDBOX_VIEWER_VISITOR_ONLY`. false로 바꾸면 그 아래 코드가
  이미 실제 값을 투영하도록 쓰여 있다.
- 켤 때 함께 판단할 것: `viewer.*Href`는 "권한"이 아니라 "요청"이다
  (받는 쪽이 `isSiteOwnerSignedIn()`으로 다시 판정한다 —
  `core/lib/site-path.js`). 즉 유출이 아니라 **표시 정보**다.

### H-6. 메시지 흐름과 검증

```
(부모)  mountSandboxSkin({ container, pageType:"home", template, context })
          │  projectSkinContextForSandbox(context, "home")   ← 원본은 여기서 끝
          │  <iframe src="https://<frame-origin>/skin/sandbox/frame?v=…"
          │          sandbox="allow-scripts allow-same-origin"
          │          referrerpolicy="no-referrer" scrolling="no">
          │
(프레임) ─┼─ IMORY_FRAME_READY  { contract }                 ──▶
(부모)    │◀── IMORY_FRAME_ACK   { contract }
(부모)    │◀── IMORY_RENDER_HOME { contract, pageType, renderSeq,
          │                        template:{html,css}, data }
          │        프레임: isSandboxContextShape(data) → 재투영 →
          │                renderSkin({ …, styleNonce })
(프레임) ─┼─ IMORY_RENDERED     { contract, pageType, renderSeq, height } ──▶
(프레임) ─┼─ IMORY_HEIGHT       { contract, renderSeq, height }           ──▶
(프레임) ─┴─ IMORY_FRAME_ERROR  { contract, code }                        ──▶
```

**검증 순서(양쪽 공통, `skin/sandbox/skin-sandbox-protocol.js` 한 곳)**

```
event.origin (상수와 정확히 일치)
  → event.source (부모: iframe.contentWindow / 프레임: window.parent)
  → data.imory === 1
  → data.type 이 아는 여섯 중 하나
  → 방향(direction) — 부모는 to-frame 메시지를 받지 않는다
  → data.seq 가 1 이상 정수
  → payload 가 plain object 이고 **알려진 키만** (모르는 키 하나면 거부)
  → payload.contract === 1
  → 타입별 값 검사(spec.check)
       pageType 은 "home" 만          (모르면 sandbox로 추측하지 않는다)
       height   은 1..200000 정수     (NaN·Infinity·소수·문자 거부)
       renderSeq는 1 이상 정수
       template 은 {html,css} 문자열 쌍, 각 2,000,000자 이하
       data     은 plain object
       code     은 정해진 4개 중 하나 (자유 문장 금지)
  → 통과하면 **알려진 키만** 새 리터럴로 옮겨 돌려준다
```

실패는 **조용한 무시**다 — 응답도, 화면 표시도 없다(프로빙 신호 차단).

**`renderSeq` — 늦게 도착한 응답이 최신 화면을 덮지 않게.** 봉투의
`seq`는 "이 채널에서 몇 번째 메시지인가"이고, payload의 `renderSeq`는
"어느 렌더에 대한 것인가"다. 부모는 자기가 기다리는 값이 아닌
RENDERED/HEIGHT를 버리고, 프레임도 자기가 받은 마지막 renderSeq만
그린다.

**`targetOrigin`에 `"*"`가 없다.** 부모는 자기가 해석한 frame origin
상수를, 프레임은 자기 상수 목록에서 고른 값을 쓴다. 프레임은 부모가
메시지로 알려 준 origin을 절대 쓰지 않는다.

**중복 READY**: 두 번째 READY는 `duplicate-ready`로 무시한다 —
ACK도 렌더도 다시 보내지 않는다.

### H-7. CSP 전문 (SANDBOX-1, 실제 응답 헤더)

```
default-src 'none';
script-src 'self' 'nonce-<요청마다 새로>' https://cdn.jsdelivr.net/npm/@eslint/css-tree@4.1.0/dist/csstree.esm.js;
style-src 'self' 'nonce-<같은 값>';
img-src data: blob: https://vtwcuvouyipohfonfukj.supabase.co https://imory.me;
font-src 'self' data:;
media-src 'none';
connect-src 'none';
frame-src 'none';
child-src 'none';
object-src 'none';
worker-src 'none';
manifest-src 'none';
form-action 'none';
base-uri 'none';
frame-ancestors https://imory.me;
sandbox allow-scripts allow-same-origin
```

SANDBOX-0에서 넓어진 것은 **세 칸뿐**이고, 어느 것도
`'unsafe-inline'`/`'unsafe-eval'`이 아니다.

#### style-src — `'unsafe-inline'` 대신 **nonce**를 골랐다

§G-6의 TODO는 "렌더러는 nonce를 모르므로 `'unsafe-inline'`이
필요해진다"고 적었다. 실제로 재어 보니 그럴 필요가 없었다.

**2026-09-15 실측(chromium, 독립 probe)** — `style-src 'self' 'nonce-X'`
아래에서:

| 하는 일 | 결과 |
| --- | --- |
| `el.style.setProperty(...)` (CSSOM 쓰기) | **적용된다**(CSP 대상이 아니다) |
| `el.setAttribute("style", ...)` | 차단 |
| `createElement("style")` + append | 차단 |
| 같은 `<style>`에 nonce를 달면 | **적용된다** |

그래서:

- `renderSkin()`에 **선택 인자 `styleNonce` 하나**를 더했다. 문자열일
  때만 `<style>`에 nonce를 단다 — 넘기지 않는 기존 호출자(공개
  HOME/CATEGORY/POST, Studio Preview)의 결과는 한 byte도 바뀌지
  않는다. e2e가 그것을 직접 판정한다(`native 렌더는 nonce 를 받지
  않는다`).
- `core/content-width.js`의 폭 계약은 **CSSOM 쓰기**라 아무 영향이
  없다. `style-src-attr 'unsafe-inline'`을 따로 열 필요가 없었다.
  (우리 코드 경로에 `setAttribute("style", …)`가 없다 — grep으로
  확인했다.)
- `'self'`가 함께 있는 이유: `renderSkin()`이
  `core/content-width.css`를 `<link>`로 건다.
- **보안 경계**: 스킨 CSS는 여전히 `validateAndScopeSkinCss()`를
  거쳐 `.imory-skin-root-i<N>`로 스코프된 뒤에만 그 `<style>`에
  들어간다. nonce는 "이 요소를 적용해도 된다"만 말하고, 내용의
  안전성은 렌더러의 검증이 그대로 진다. `'unsafe-inline'`이었다면
  **프레임 문서 안의 아무 인라인 스타일이나** 허용됐을 것이다 —
  지금은 우리가 만든 그 요소 하나만 허용된다.

chromium과 webkit 양쪽 e2e에서 같은 결과다(226/226 × 2).

#### script-src — 호스트가 아니라 **파일 하나**

`skin/skin-css-validate.js`가 css-tree를 CDN에서 정적 import한다
(그 파일 상단에 패키지/버전/URL이 적혀 있다). CSS 검증을 건너뛰거나
부모가 대신 하는 것은 이번 라운드의 금지 항목이라, **그 URL 하나만**
허용한다(CSP 경로는 `/`로 끝나지 않으면 정확히 일치해야 한다).
`https://cdn.jsdelivr.net` 호스트 전체를 연 것이 아니다.

import map은 `document.write`로 만들어지는 **parser-inserted 인라인
script**라 CSP 검사를 그대로 받는다. frame.html의 인라인 블록이
자기 nonce(`document.currentScript.nonce`)를 읽어
`writeVersionedImportMap(paths, nonce)`에 넘긴다 — 해시도
`'unsafe-inline'`도 쓰지 않았다. 그 두 번째 인자는 **선택**이라
다른 진입 문서의 호출은 그대로다.

#### img-src / font-src — `https:` 전체를 열지 않았다

지금 HOME이 실제로 부르는 그림만 조사해서 열었다:

| 무엇 | 출처 |
| --- | --- |
| `profile.avatarUrl` · `images.<slot>` | Supabase Storage |
| `banners.items[].imageUrl` | Supabase Storage |
| `/api/post-cover` (대표 이미지) | 메인 origin(= `parentOrigins`) |
| 에디터가 만든 인라인 이미지 | `data:` / `blob:` |

목록은 `resolveSandboxMediaOrigins()`가 만든다(Supabase origin 상수 +
`parentOrigins` + 환경변수 `SANDBOX_SKIN_MEDIA_ORIGINS`).

> ★ **남은 차이 — 알고 남긴다.** 스킨 CSS와 HTML은 임의의 https
> 이미지·웹폰트를 쓸 수 있다(`skin/skin-sanitize.js`의
> `isSafeSkinUrl()`은 https면 통과시킨다). 그런 스킨을 sandbox로
> 그리면 **그 그림/폰트만 빠진 채** 나온다. §F#6은 "호스트
> allowlist를 하지 않는다(기존 스킨이 깨진다)"고 적었는데, 이
> 라운드는 지시문의 "근거 없이 `https:` 전체를 열지 않는다"를
> 우선했다. 외부 자유 이미지·웹폰트 정책은 다음 단계의 **명시적
> 결정**으로 남긴다 — sandbox는 아직 플래그가 꺼져 있고
> fixture 스킨 하나만 쓰므로 지금 깨지는 사용자가 없다.

`connect-src`는 이 라운드에서도 **`'none'` 그대로**다.

### H-8. 경로 allowlist (sandbox origin에서 200인 것 **전부**)

```
/skin/sandbox/frame            (정본)
/skin/sandbox/frame.html       (308 → 위)
/core/lib/build-version.js
/skin/sandbox/skin-sandbox-config.js
/skin/sandbox/skin-sandbox-protocol.js
/skin/sandbox/skin-sandbox-context.js     ← SANDBOX-1
/skin/sandbox/skin-sandbox-frame.js
/skin/skin-sanitize.js                    ← SANDBOX-1
/skin/skin-render.js                      ← SANDBOX-1
/skin/skin-css-validate.js                ← SANDBOX-1
/core/content-width.js                    ← SANDBOX-1
/core/content-width.css                   ← SANDBOX-1
```

그 밖은 전부 404다 — `/`도, `/index.html`도, `supabase-client.js`도,
`skin-context.js`도, `skin-home.js`도, `admin/`도, `studio/`도,
그리고 fixture 스킨 JSON도. e2e가 그 목록을 하나씩 재 본다.

### H-9. 높이와 모바일

**프레임 쪽** (`skin-sandbox-frame.js`)

- 재는 대상은 `document.documentElement`가 **아니라 렌더 컨테이너**다.
  html/body는 뷰포트(= 지금 iframe 높이)만큼을 늘 차지하므로, 그것을
  재면 "부모가 준 높이"를 되돌려주는 꼴이 되어 **줄어들 수가 없다**.
- 렌더 직후 1회 + `ResizeObserver` + 프레임 안 `img`의 `load`/`error`
  (capture 단계 — load는 버블하지 않는다) + `document.fonts.ready`.
- 직전에 보낸 값과 **1px 이하** 차이면 보내지 않는다(진동 방지).
- 렌더 하나당 보고 **120회** 상한. 스킨 CSS가 `vh`처럼 뷰포트 높이에
  반응하면 "적용 → 높이 변화 → 다시 보고"의 고리가 돌 수 있다.
  상한에 닿으면 조용히 멈춘다.

**부모 쪽** (`skin-sandbox-host.js`)

- 프로토콜이 이미 정수·범위를 봤고, 부모는 **더 좁게** 다시 본다
  (1..40000). 적용 횟수도 렌더당 200회 상한이다. 어느 한쪽 버그로
  루프가 생겨도 화면이 멈추지 않는다.
- `iframe`은 `scrolling="no"`, 프레임 문서는 `overflow:hidden` —
  **이중 스크롤을 만들지 않는다**(CLAUDE.md §2).
- 프레임 문서의 html/body가 `background: transparent`라 iframe이
  투명하다. 부모 페이지 배경이 그대로 비쳐서 native HOME과 같은
  바탕 위에 놓인다.

실측(chromium, e2e): 짧은 HOME `iframe 538 / content 538`,
긴 HOME `2746 / 2746`, 390px `516 / 515`. 프레임·부모 모두 가로 넘침
0, 프레임 안 세로 스크롤 0, 700ms 뒤에도 높이가 같은 값(진동 없음).

### H-10. 실패와 폴백

`renderPublishedSkinHome()`은 **여전히 절대 throw하지 않는다.**

| 상태 | 결과 |
| --- | --- |
| 기능 플래그 OFF | sandbox 경로를 **타지 않는다**. iframe 0개. native 렌더. |
| frame origin 없음/부모와 같음 | iframe을 만들지 않는다. native 렌더. |
| READY timeout(4s) | iframe을 **치우고** native 렌더. |
| RENDERED timeout(6s) | 같음. |
| `IMORY_FRAME_ERROR` | 같음. 코드만 콘솔에 남는다. |
| 잘못된 HOME payload | 프레임이 `bad-payload` 코드만 보낸다(원문 없음). |
| `renderSkin` 예외 | 프레임이 `render-failed` 코드만 보낸다. stack도 SkinPackage 원문도 보내지 않고 콘솔에도 찍지 않는다. |

**사용자에게 백지를 보여 주지 않는다** — 어떤 실패든 같은
SkinPackage를 native로 그린다. **다시 시도하지 않는다**(무한 재시도
금지). native마저 던지면 그때 오늘의 legacy HOME 폴백이다.

프레임 자신의 오류 화면은 숨어 있는 `#sandboxFrameNotice` 한 줄
("화면을 불러오지 못했습니다.")뿐이다. 보통은 부모가 그 전에
폴백하므로 보이지 않는다.

### H-11. 검증 결과 (구분해서)

| 종류 | 결과 |
| --- | --- |
| 단위 테스트 (node) | `skin/sandbox/skin-sandbox-unit-test.mjs` **131/131** — renderMode 판정 · payload allowlist · 메시지 값 검사 |
| E2E (mock, chromium) | `skin/sandbox/skin-sandbox-e2e-test.mjs` **226/226** |
| E2E (mock, webkit) | 같은 파일 **226/226** |
| 기존 회귀 (mock) | 8934 **64/64** · 8935 **248/248** · 8942 **71/71** · 8956 **58/58** · 8943 **42/42** · 8954 **175/175** · 8955 **37/37** · 8944 **70/1 실패** |
| 실제 DB 검증 | **해당 없음** — DB도 스키마도 건드리지 않았다 |
| 배포 확인 | **미실시** — 이 라운드는 commit/push를 하지 않았다 |
| 실기기 확인 | **미실시** |

8944의 1건(`Preview FOLDER ?series=1` — Studio Preview의
`preview:folder-bodies`)은 **이 라운드 이전부터 실패하던 것**이다.
`git archive HEAD`로 뽑은 깨끗한 트리에서 같은 테스트를 돌려 **같은
한 건이 같은 값으로 실패**하는 것을 확인했다(§G-9의 기록과 동일).

E2E가 쓰는 origin 두 개는 **포트로 가른 실제 다른 origin**이고, 두
서버 모두 요청을 배포되는 그 `functions/_middleware.js`에 그대로
통과시킨다.

`--only=home` 절은 하네스가 아니라 **실제 `index.html`** 을 열고
Supabase 응답만 mock 한다 — 즉 §H-2의 분기가 진짜 공개 진입점에서
도는 것을 확인한다. 그 절이 보는 네 가지:

1. renderMode 없는 스킨 -> 같은 문서에 그려지고 iframe 0개
2. sandbox 스킨 + 플래그 OFF -> **같은 결과**(배포에 이 코드가 있어도
   공개 화면이 바뀌지 않는다)
3. sandbox 스킨 + 플래그 ON -> `#themeMount` 안 cross-origin iframe
   하나, 같은 문서에는 중복 렌더 없음, 프레임에 `supabase` 전역 없음,
   프레임 localStorage 비어 있음
4. 프레임 문서를 끊으면 -> **같은 스킨이 native 로** 그려지고 iframe은
   남지 않는다(백지 아님)

### H-12. 배포 전에 필요한 것

**환경변수: 새로 필요한 것은 없다.** SANDBOX-0에서 설정한
`SANDBOX_SKIN_HOST` / `SANDBOX_SKIN_PARENT_ORIGINS`가 그대로 쓰인다.
`SANDBOX_SKIN_MEDIA_ORIGINS`가 새로 생겼지만 **선택**이다 — 비우면
Supabase origin + 부모 origin이 기본값이다.

`APP_BUILD_VERSION`은 **올렸다**(`2026-09-14-1` → `2026-09-15-1`).
SANDBOX-0과 달리 이번에는 기존 자산을 고쳤다 — `skin/skin-render.js`,
`skin/skin-home.js`, `skin/skin-template.js`,
`skin/skin-package-{import,export}.js`, `index.html`,
`core/lib/build-version.js`.

**기능 플래그는 계속 꺼져 있다.** `SANDBOX_SKIN_ENABLED_HOSTS`가 빈
배열이라 `imory.me`에서는 `?sandboxSkin=1`을 붙여도 아무 일도
일어나지 않는다. production에서 켜려면 그 파일을 고쳐 배포해야 한다.

> **변경됨 → §I.** 그 뒤 같은 날, 테스트 계정 `test1` 하나에만
> 켜는 배포를 했다.

### H-13. SANDBOX-2 진행 가능 여부

**가능하다.** 이 라운드가 남긴 전제가 다 섰다 — 별도 origin, 메시지
채널과 검증, 투영 함수, 높이 계약, 폴백.

SANDBOX-2(네비게이션)가 먼저 할 일:

1. `skin/skin-link-nav.js`의 dispatch 부분을
   `navigateToSkinRoute(route, url)`로 **추출**(동작 무변경 리팩터링).
   click 리스너와 `IMORY_NAVIGATE` 핸들러가 그 함수 하나를 공유한다.
2. 프레임의 `swallowClicks()`를 "preventDefault + href를 부모로"로
   바꾼다. 부모가 `new URL(href, parentOrigin)`로 파싱하고 라우트
   판정까지 한다 — 프레임은 route 규칙을 모른다.
3. `IMORY_COPY_LINK`.
4. 외부 링크는 부모가 `window.open(url, "_blank", "noopener")`.

**blocker는 없다.** 다만 SANDBOX-2에서 함께 결정해야 하는 것:

- **`viewer` 고정을 풀 것인가**(§H-5). 네비게이션이 생기면 스킨이
  그린 WRITE/ADMIN 링크가 실제로 동작해야 의미가 있다. 풀지 않으면
  주인장이 sandbox HOME에서 자기 도구를 못 쓴다.
- **img-src/font-src를 넓힐 것인가**(§H-7). 실제 사용자 스킨을
  올려 보기 전에 정해야 한다.

---


## I. 켜기 — production 에서 test1 하나만 (2026-09-15)

**상태: 현재 구현.** §G-2의 플래그 계약을 대체한다. 코드는
`skin/sandbox/skin-sandbox-config.js` 한 파일이고, 렌더링 경로
(`skin/skin-home.js`·`skin/sandbox/skin-sandbox-host.js`)는
**한 줄도 고치지 않았다** — 무엇이 켜지는가만 바뀌었다.

### I-1. 무엇이 바뀌었나

`isSandboxSkinEnabled(win)`이 호스트 종류에 따라 갈린다.

| 호스트 | 관문 |
| --- | --- |
| production (`SANDBOX_SKIN_ENABLED_HOSTS` = `["imory.me"]`) | 경로 첫 칸(= 블로그 slug)이 `SANDBOX_SKIN_ENABLED_SLUGS` = `["test1"]` 에 있는가. **쿼리도 localStorage도 읽지 않는다.** |
| 그 밖의 production 호스트(`*.pages.dev` 포함) | 언제나 false |
| 로컬 개발(`localhost` 등) | 예전 그대로 `?sandboxSkin=1` · `localStorage["imory.sandboxSkin"]`. 하네스 경로에는 slug가 없어서 slug로 가를 수 없다 |

새 함수 둘: `readSandboxSkinSlug(win)`(경로 첫 칸, 소문자),
`isSandboxSkinEnabledSlug(slug)`(목록 대조 — 목록이 비면 "아무 제한
없음"이 아니라 **"아무도 아님"**이다).

`getSiteOwnerSlugFromPath()`(`core/lib/site-path.js`)를 부르지
않는다 — 그 함수는 `RESERVED_SLUGS` 로드 순서에 묶인 classic 전역이고,
이 파일은 node 단위 테스트에서도 그대로 읽히는 독립 파일이다. 예약어는
어차피 slug 목록에 없으므로 결과가 같다.

### I-2. 왜 DB 컬럼이 아니라 배열인가

"누가 이 실험을 받는가"는 블로그 주인이 고르는 설정이 아니라 배포하는
사람이 고르는 것이다. 사용자 설정으로 만들면 되돌릴 때도 migration이
필요해진다. 이 라운드는 **migration을 만들지 않았다.**

### I-3. 무엇이 그대로인가

- `renderMode`가 없거나 `"native"`인 스킨은 이 플래그와 무관하게
  오늘과 같은 경로다(판정은 `skin/skin-home.js`). 플래그는 "프레임을
  써도 되는가"이고, 프레임을 **쓰는가**는 SkinPackage가 정한다.
- HOME 한 장만 프레임이다(§H-3). CATEGORY/POST/FOLDER/HIGHLIGHTS/
  BANNER는 sandbox 스킨이어도 native 렌더다.
- 저자 JS는 여전히 실행하지 않는다(`js` 필드는 스키마에만 있다).
- 프레임이 안 뜨면 **같은 스킨을 native로** 그린다(§H-9 폴백).

### I-4. 검증

| 종류 | 결과 |
| --- | --- |
| 단위 (`node skin/sandbox/skin-sandbox-unit-test.mjs`) | 141 passed / 0 failed. `[flag]` 절을 새 계약으로 다시 씀 — 허용 slug ON, 다른 블로그는 `?sandboxSkin=1`·localStorage 에도 OFF, 허용 목록 밖 호스트는 slug가 맞아도 OFF, `pathname` 없는 window는 OFF |
| e2e mock (`node skin/sandbox/skin-sandbox-e2e-test.mjs`, 8957+8958) | 226 passed / 0 failed (`--only=home` 23 passed 포함) |
| 배포 확인 | §I-5 |
| 실기기 | 사람이 `https://imory.me/test1` 에서 확인 (§I-5) |

**production 판정 자체는 e2e로 못 돈다** — 로컬 e2e의 호스트가
`localhost`라 언제나 dev 분기다. 그래서 그 갈림은 순수 함수로 떼어
단위 테스트가 판정한다.

### I-5. 켜졌는지 확인하는 법

`https://imory.me/test1` 을 열고 (브라우저 개발자 도구)

```js
document.querySelectorAll("iframe.imory-skin-sandbox-frame").length   // 1
document.querySelector("iframe.imory-skin-sandbox-frame").src          // https://skin-frame.imory.me/skin/sandbox/frame?v=...
document.querySelectorAll("#themeMount .imory-skin-root").length       // 0 (중복 렌더 없음)
isSandboxSkinEnabled(window)                                           // true
```

Network 탭에서는 `skin-frame.imory.me` 문서 요청 하나가 보이고,
그 응답에 `Content-Security-Policy: ... frame-ancestors https://imory.me`
가 붙어 있다. 다른 블로그(`https://imory.me/<다른 slug>`)에서는 같은
선택자가 0개이고 `.imory-skin-root`가 1개다.

---


## J. SANDBOX-2 구현 기록 (2026-09-15) — CATEGORY·POST·안전한 페이지 이동

**상태: 구현 + 로컬 검증 완료. commit/push 하지 않았고 배포 확인도 하지
않았다.** §A~§F 의 설계는 CATEGORY/POST 를 SANDBOX-3 으로 미루고 있었지만,
이 라운드의 지시문이 둘을 함께 요구해서 앞당겼다 — 설계 문서를 다시
쓰지 않고 여기 바뀐 지점을 적는다(CLAUDE.md §5).

### J-1. 라우팅 단일 출처

`skin/skin-link-nav.js` 의 click 위임 본문을
**`navigateToSkinRoute(route, url)`** 로 그대로 들어냈다(동작 무변경
리팩터링 — 순서도 분기도 한 줄 바뀌지 않았고 들여쓰기만 두 칸 줄었다).

지금 이 함수를 부르는 곳은 둘뿐이다:

1. 같은 파일의 click 위임 — published Skin 안에서 시작된 클릭 (native)
2. `skin/sandbox/skin-sandbox-host.js` 의 `IMORY_NAVIGATE` 핸들러 (sandbox)

sandbox 전용 라우팅은 **한 줄도 만들지 않았다.** 주소·history·스크롤
정책·미저장 입력 보호·요청 순번은 전부 기존 라우터가 오늘처럼 한다.

### J-2. 이동 계약 — 프레임은 **주소를 보내지 않는다**

설계 문서 §D-2 는 `IMORY_NAVIGATE { href }` 로 적혀 있었다. 실제로는
**정수 하나**만 보낸다:

```
frame -> parent   IMORY_NAVIGATE { contract, renderSeq, navId }
```

| 왜 | 어떻게 |
| --- | --- |
| 프레임이 지어낸 문자열을 부모가 파싱할 일이 없다 | 표(navId → route)는 부모 realm 에만 있다 |
| 위조한 정수는 아무 일도 못 한다 | 표에 없으면 조용히 무시 |
| 표에 있는 정수를 찍어 맞혀도 권한 상승이 없다 | 표에는 **이번 화면의 Context 가 실제로 내려보낸 공개 주소**뿐 |
| 옛 화면의 클릭이 새 화면을 옮기지 않는다 | `renderSeq` 대조 |

표를 만드는 곳은 `skin/sandbox/skin-sandbox-nav.js` 하나다. 투영 함수가
Context 의 href 를 옮길 때마다 `mint(href)` 가 불리고, 그 자리에서
**공개 경로 판정과 같은 함수**(`resolveInSiteSkinRoute()`)로 검사한다.

`mint()` 는 주소를 **바꾸지 않는다.** 화면에 그려지는 `<a href>` 는
native 렌더와 글자 단위로 같다(SANDBOX-1 의 렌더 일치 검증이 그대로
서 있어야 한다). 프레임은 도착한 표로 **anchor 요소 → navId** 대응을
자기 realm 의 `WeakMap` 에 만든다 — DOM 에 속성을 더하지 않는다.

### J-3. 허용/거부 규칙 (`skin-sandbox-nav.js`)

허용(전부 "지금 이 블로그의 공개 화면"):
`/:slug` · `/:slug/category/:id`(BANNER 카테고리 포함) · `/:slug/post/:id` ·
`/:slug/category/:cid/folder/:fid` · `/:slug/highlights…`(옛 `/memos` 포함)

거부:

| 거부하는 것 | 어디서 |
| --- | --- |
| `javascript:` `data:` `blob:` `vbscript:` `file:` 등 모든 scheme | `isSandboxNavPathShape()` — "`/` 로 시작하고 `//` 가 아니다" 한 줄 |
| protocol-relative(`//evil.example`) · 외부 origin | 같은 줄 + 파싱 뒤 `url.origin` 재확인 |
| 다른 사람의 블로그(`/other/...`) | `siteOwnerSlug` 대조 + `resolveInSiteSkinRoute()` |
| `/admin` `/auth` `/invite` `/studio` `/api` … | `RESERVED_SLUGS` 대조 |
| `?write=1` `?edit=1` `?manage=1` `?tools=1` `?highlight=1` | 쿼리 키 목록 + route 플래그 재확인(두 겹) |
| `..` · `%2e%2e` · `%2f` · `%5c` | 모양 검사 |
| Context 가 내려보내지 않은 임의 주소 | 표에 없다 |

외부 링크(배너의 https 주소 등)는 **그려지되 표에 들어가지 않는다** —
눌러도 아무 일이 없다. 부모가 새 창을 여는 경로(`window.open`)는 이번
라운드에 넣지 않았다(남은 차이).

### J-4. 페이지별 전달 schema

`projectSkinContextForSandbox(context, pageType, options)` 의 최상위 키는
**언제나 같다**(그 페이지가 아니면 `null`):

```
contract pageType page site profile navigation banners viewer images
home category post nav
```

- `category` — id/name/type/href · `posts[]` · `tree`(폴더, 깊이 상한 8) ·
  `showPostsList` · 표시 설정 · `gallery`(카드·사진) · `pagination`
- `post` — id/title/publishedAt(+Label)/categoryName/categoryHref/href
  **본문은 여기 없다.** 별도 메시지(`IMORY_POST_BODY`)로 간다 —
  "Context 로는 본문에 닿을 수 없다"(PHASE1C 7-2절)를 프레임 경계에서도
  같은 모양으로 세운 것이다.
- `nav` — `{ entries: [{ id, href }] }`

새로 넣지 않은 것은 SANDBOX-1 과 같다(토큰·UUID·이메일·DB row 키·
관리자 링크·비밀글 원문). `viewer` 는 여전히 **방문자 값 고정**이다.

이미지 주소는 부모가 옮길 때 자기 origin 기준 **절대 주소**로 바꾼다 —
`/api/post-cover?image=7` 같은 상대 주소는 프레임 origin 에서 404 가
나기 때문이다(CSP `img-src` 에 부모 origin 이 이미 들어 있다).

### J-5. 비밀글

**비밀글 POST 만 기존 native viewer 로 폴백한다**(지시문 5절의 명시적
선택). 비밀글은 암호 입력 폼(`postSecretGate`)을 본문 자리로 **옮겨서**
보여 주고 정답 뒤 같은 자리에 본문을 넣는데, 그 폼을 다른 origin 안으로
들여보내는 것은 이 라운드에서 안전하게 설계할 수 없다. 같은 블로그의
다른 글은 그대로 sandbox 로 그려진다.

판정은 `posts/view/posts-view-detail.js` 가 `post.visibility === "secret"`
을 `skin/skin-post.js` 에 넘겨서 한다 — Context 조립 **전에** 갈린다.
e2e 가 그때 문서 어디에도 비밀 본문이 없음을 함께 잰다.

### J-6. 주인장 기능

- 관리자·편집 URL 은 여전히 프레임에 가지 않는다(`viewer` 고정 + nav
  표의 쿼리 거부, 두 겹).
- 소유자 도구(`+`/edit)와 하이라이트 도구는 부모가 오늘처럼 그린다.
  sandbox 화면에서는 스킨이 그 자리를 그리지 않으므로 플랫폼 기본 도구가
  남는다.
- 주인장의 OOC 메모는 sandbox POST 에서 **그리지 않는다** — 숨겨진
  legacy 그릇에 조용히 써 넣지 않는다(남은 차이).

### J-7. iframe 을 "그려 두고 옮길" 수 없다는 문제

CATEGORY/POST 의 기존 경로는 떨어진 스크래치 엘리먼트에 먼저 그린 뒤
요청 순번이 최신일 때만 화면으로 **옮긴다**. iframe 은 DOM 에서 옮기는
순간 문서가 다시 로드된다 — 그 방식을 쓸 수 없다.

그래서 mount 를 둘로 쪼갰다(`prepareSandboxSkin` / `prepared.mount`):

- **prepare** — 조회·template·Context 투영·nav 표 발급 (느린 일, 늦게
  끝나도 화면을 건드리지 않는다)
- **mount** — 실제 iframe 생성 (호출자가 요청 순번을 확인한 뒤
  **살아 있는 컨테이너**에 대고 한 번)

"늦은 응답이 최신 화면을 덮지 않는다"는 성질은 그대로다 — 늦게 끝난
prepare 의 mount 는 호출되지 않고, 그래도 미끄러진 경우를 위해 mount
결과에도 요청 순번 검사와 `iframe.isConnected` 검사를 두었다.

### J-8. 검증 결과 (구분해서)

- **mock 자동 검증** — `node skin/sandbox/skin-sandbox-unit-test.mjs`
  172/172 · `node skin/sandbox/skin-sandbox-e2e-test.mjs` 274/274
  (chromium) · `--browser=webkit` 274/274.
  새 절: `--only=pages`(CATEGORY/POST 렌더·비밀글 폴백·native 회귀) ·
  `--only=nav`(링크·뒤로/앞으로·직접 접속·새로고침·모바일·위조 거부).
- **기존 회귀** — 8934 64/64 · 8935 248/248 · 8936 155/155 ·
  8942 71/71 · 8952 122/122 · 8956 58/58.
  8944 는 70/71, 8948 은 332/333 인데 **두 실패 모두 이 변경 이전부터
  나던 것**이다(같은 커밋에서 변경분을 stash 하고 돌려 확인).
- **실제 DB 검증 · 배포 확인 · 실기기 확인 — 하지 않았다.**

### J-9. dev opt-in 이 바뀐 점

SANDBOX-1 까지 로컬 opt-in 은 `?sandboxSkin=1` 쿼리 하나로 충분했다 —
화면이 HOME 한 장이라 주소가 바뀌지 않았기 때문이다. 이제 프레임 안
링크가 주소를 바꾸므로(그것이 이 라운드의 목적이다) 쿼리가 사라진다.
그래서 dev 호스트에서는 frame origin 도 `localStorage["imory.sandboxSkinOrigin"]`
로 기억한다. **production 은 이 분기를 타지 않는다** — 거기서는 hostname +
slug allowlist 만 보고 쿼리도 localStorage 도 읽지 않는다.

### J-10. 이 라운드에서 하지 않은 것

- Studio Preview 통합 (SANDBOX-4)
- 저자 JS (SANDBOX-5)
- FOLDER / HIGHLIGHTS / BANNER 페이지의 sandbox 렌더 — **이동은 된다**
  (그 주소들이 nav 표에 들어간다). 도착한 화면은 native 로 그려진다.
- 외부 링크를 부모가 새 창으로 여는 것 (`IMORY_COPY_LINK` 도 없다)
- 프레임 안 본문의 글자 크기 조절·하이라이트·소유자 OOC
- commit / push

---


## 남은 차이 (아직 정하지 않은 것)

- 비밀글 gate를 프레임 안/밖 어디에 둘 것인가 (SANDBOX-3)
- `owner-tools` / `highlight-tools` region을 cross-origin에서 어떻게 채울 것인가
- Studio Inspector/Direct Edit/크롭의 sandbox 대응 (SANDBOX-4)
- 저자 JS를 켤 때의 origin 전략과 리소스 상한 (SANDBOX-5)
  — **여러 사용자의 임의 JS를 같은 origin에서 실행하지 않는다**가 그 단계의
  전제 조건이다(§G-4). 지금은 단일 frame origin이고 실행되는 저자 JS가 없다.
- sandbox 전용 태그 allowlist 완화 여부 — **아직 아무것도 정해지지 않았다**
- **프레임에 `viewer`(주인장 여부·주인장 링크)를 보낼 것인가** — SANDBOX-1은
  보내지 않기로 했다(§H-5). 네비게이션이 생기는 SANDBOX-2에서 다시 본다.
- **외부 자유 이미지·웹폰트를 sandbox CSP 가 허용할 것인가** — SANDBOX-1은
  지금 쓰는 출처만 열었다(§H-7). 실제 사용자 스킨을 올려 보기 전에 정한다.
- HOME만 프레임이고 나머지 화면은 같은 문서라는 **혼합 상태**(§H-3) —
  SANDBOX-3이 나머지를 가져가면 사라진다.

---

---

# SANDBOX-1 최소 프로토타입 구현 지시문 — **수행 완료 (2026-09-15)**

> 이 지시문은 **이미 수행됐다.** 결과는 §H다. 아래 본문은 그때
> 무엇을 요구했는지 남겨 두는 기록이고, 실제로 무엇이 들어갔는지와
> 요구와 달라진 지점(메시지 이름·style-src·img-src·viewer)은
> §H에 적혀 있다. 새 작업을 시작할 때는 §H를 먼저 읽는다.

```
IMORY SANDBOX-1 — 공개 HOME을 별도 origin iframe에서 그린다

이 라운드의 범위는 HOME 한 장이다. CATEGORY/POST/FOLDER/HIGHLIGHTS/BANNER,
네비게이션, 저자 JS, Studio Preview 통합은 전부 이번 범위가 아니다.
기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md

## 불변식 (이것을 깨면 이 라운드는 실패다)

1. renderMode가 없는 SkinPackage는 오늘과 완전히 동일한 코드 경로를 탄다.
   기존 e2e 8934 / 8942 / 8944 / 8956이 한 줄도 고치지 않고 통과해야 한다.
2. iframe 안에는 supabaseClient도 build*SkinContext도 로드하지 않는다.
   조회와 Context 조립은 전부 부모가 오늘처럼 한다.
3. 새 렌더러를 만들지 않는다. iframe 안에서도 skin/skin-render.js의
   renderSkin()을 그대로 쓴다.
4. targetOrigin에 "*"를 쓰지 않는다. 양쪽 다 자기가 가진 상수를 쓴다.
5. 실패는 언제나 조용한 폴백이다. renderPublishedSkinHome()은 지금도
   절대 throw하지 않는다 — 그 계약을 유지한다.

## 만들 파일

skin/sandbox/skin-sandbox-config.js      classic. SANDBOX_SKIN_ORIGIN /
                                          SANDBOX_SKIN_PARENT_ORIGINS /
                                          SANDBOX_SKIN_FRAME_PATH /
                                          isSandboxSkinEnabled()
skin/sandbox/skin-sandbox-protocol.js     classic. 의존 없는 순수 함수.
                                          buildSandboxMessage() /
                                          validateSandboxMessage(event, expect)
                                          부모와 frame이 **각각** 로드한다
                                          (studio-inspector-model.js 선례)
skin/sandbox/skin-sandbox-context.js      classic. projectSkinContextForSandbox()
                                          알려진 키만 새 리터럴로 옮긴다.
                                          원본 스프레드 금지
                                          (skin-package-import.js와 같은 원칙)
skin/sandbox/skin-sandbox-host.js         ES 모듈. mountSandboxSkin() /
                                          destroySandboxSkin().
                                          window.skinSandboxHostReady 핸드셰이크
skin/sandbox/skin-sandbox-e2e-test.mjs    Playwright, 포트 8957

(frame.html / skin-sandbox-frame.js는 SANDBOX-0 산출물을 확장한다)

## 고칠 파일

skin/skin-template.js        resolveSkinRenderMode(skinPackage) 순수 함수 추가.
                             "sandbox"만 인정, 그 외/없음은 "native".
                             기존 함수는 건드리지 않는다
skin/skin-package-import.js  renderMode allowlist 추가. 문자열이 아니거나
                             모르는 값이면 reason:"render-mode"로 거부.
                             결과 리터럴에 실어 준다
skin/skin-package-export.js  renderMode를 export allowlist에 추가
skin/skin-home.js            resolveSkinTemplate() 직후 sandbox 분기.
                             await window.skinSandboxHostReady 후
                             mountSandboxSkin(). 실패하면 false
index.html                   loadVersionedScripts에 config/protocol/context 3개,
                             module 목록에 skin-sandbox-host.js,
                             window.skinSandboxHostReady 선언.
                             **로드 순서 주의** — CLAUDE.md §1
_headers                     /skin/sandbox/frame.html 에 no-cache

## 메시지 (이번 라운드에서 구현하는 것만)

parent -> frame  IMORY_INIT   { contract:1, pageType:"home",
                                template:{html,css}, data, flags:{isOwner} }
frame  -> parent IMORY_READY  { contract:1 }
frame  -> parent IMORY_HEIGHT { height:number }
frame  -> parent IMORY_ERROR  { message:string }

IMORY_NAVIGATE / IMORY_COPY_LINK / IMORY_RENDER / IMORY_POST_BODY 는
이번에 만들지 않는다. 프레임 안의 링크는 클릭해도 아무 일도 일어나지
않게 한다(click에서 preventDefault만).

검증 순서(양쪽 공통, skin-sandbox-protocol.js 한 곳):
  event.origin 상수 일치 -> event.source 일치 -> data.imory === 1 ->
  data.type -> 타입별 필드 typeof -> 알려진 키만 읽기.
  실패는 조용히 무시(응답 없음).

## 높이

frame: ResizeObserver(document.documentElement) + 렌더 직후 1회 +
       프레임 안 img의 load에서 재측정.
       직전에 보낸 값과 1px 이하 차이면 보내지 않는다(진동 방지).
parent: iframe.style.height = `${h}px`. iframe은 scrolling="no",
        프레임 문서는 overflow:hidden. 이중 스크롤을 만들지 않는다.

## 검증 (E2E 8957)

[render]   같은 SkinPackage를 native / sandbox 두 번 그려
           .imory-skin-root 안의 innerHTML 구조와 폭이 같은가
[fallback] renderMode 없는 패키지 -> iframe이 생기지 않는다
           (문서에 <iframe>이 0개)
[fallback] SANDBOX_SKIN_ORIGIN이 비어 있으면 native로 그린다
[fallback] frame이 2초 안에 IMORY_READY를 안 보내면 iframe을 지우고
           legacy HOME으로 간다
[origin]   frame -> parent 로 origin이 다른 메시지를 보내면 무시된다
[origin]   parent 가 보낸 메시지를 source가 다른 window로 흉내내면 무시된다
[isolate]  프레임 안에서 parent.document 접근이 SecurityError
[isolate]  프레임 안에서 localStorage에 Imory 세션 키가 없다
[isolate]  프레임 안의 fetch()가 CSP로 막힌다
[host]     imory.me/skin/sandbox/frame.html 이 404
[height]   콘텐츠가 길어지면 iframe 높이가 따라오고, 내부 스크롤바가 없다
[mobile]   390px에서 가로 넘침 0
[package]  renderMode:"sandbox" 패키지가 Import -> Export -> Import
           왕복에서 필드를 잃지 않는다
[package]  renderMode:"weird" 는 Import가 거부하고 reason이 "render-mode"

기존 회귀: 8934 / 8942 / 8944 / 8956 을 변경 없이 돌려 통과 확인.

## 하지 않을 것

- DB migration (renderMode는 content jsonb 안이라 스키마 변경이 없다)
- schemaVersion 상향 (기존 클라이언트가 전부 폴백해 버린다)
- 저자 JS 실행 (`js` 필드는 스키마에만 두고 실행하지 않는다)
- sanitizer 태그 allowlist 완화
- Studio 쪽 변경 (sandbox 스킨은 이번 라운드에서 Studio로 편집하지 않는다)
- commit / push

## 보고할 것

- mock e2e 결과 / 실제 DB 검증 / 배포 확인 / 실기기 확인을 구분해서
  (CLAUDE.md §3 완료 기준)
- Cloudflare 대시보드에서 사람이 해야 하는 일(커스텀 도메인 추가)은
  코드로 못 하므로 목록으로 남긴다
```
