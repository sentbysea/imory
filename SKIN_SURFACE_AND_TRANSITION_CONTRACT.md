# Imory — 스킨 표시 공간 · 화면 전환 계약

> **이 문서가 기준 문서다.** 공개 페이지(HOME / CATEGORY / POST / BANNER)의
> 표시 공간, 화면 전환, 소유자·관리 동선, Preview와 공개 화면의 일치에 관한
> 상세 규칙은 여기서만 관리한다. 작업 지침([CLAUDE.md](./CLAUDE.md))에는 핵심
> 원칙과 이 문서 링크만 둔다.
>
> 작성 기준: 2026-09-07, `main`(`f1a92a7` + 이번 라운드 로컬 커밋). 아래 §1~§4의
> 파일·함수·클래스 이름은 전부 저장소에서 확인한 실제 이름이다.
>
> 표기:
> **[구현]** 코드에 실제로 있는 것 · **[원칙]** 앞으로 지켜야 할 규칙 ·
> **[차이]** 원칙과 현재 구현 사이에 남아 있는 간극(§5에 모아 둔다).
>
> 관련 문서: [SKIN_DESIGNER_CONTRACT.md](./SKIN_DESIGNER_CONTRACT.md)(SkinPackage
> JSON shape) · [AI_SKIN_PHASE1C_PAGE_CONTRACT.md](./AI_SKIN_PHASE1C_PAGE_CONTRACT.md)
> (Skin Data Contract) · [IMORY_AI_SKIN_CUSTOMIZE_PLAN.md](./IMORY_AI_SKIN_CUSTOMIZE_PLAN.md)
> (제품 방향).

---

## 0. 담당 범위

| | 담당 |
| --- | --- |
| **스킨** | 공개 페이지의 배치, 색, 글씨, 장식. 자기 `max-width`·여백·내부 정렬 |
| **플랫폼** | 표시 공간, 스크롤, 라우팅, 로딩, 오류, 관리 진입, 권한 |

**[원칙]**

- 작성·수정·삭제·인증·권한 검사를 사용자 스킨에 구현하지 않는다. 스킨이 그리는
  것은 평범한 `<a href>`뿐이고, 그 주소의 뜻은 플랫폼이 해석한다.
- 특정 스킨 이름이나 스킨 내부 CSS 클래스에 의존하는 제품 코드를 만들지 않는다.
  제품 코드가 붙잡아도 되는 것은 플랫폼이 소유한 id/클래스(`#postArea`,
  `#postContainer`, `.post-container--skin-active` 등)와 스킨 렌더러가 붙이는
  루트 클래스(`.imory-skin-root`)까지다.
- 사용자 스킨에 JS를 넣지 않는다(저장 시점에 인라인 JS·`style`·`id`가 제거된다 —
  [SKIN_DESIGNER_CONTRACT.md](./SKIN_DESIGNER_CONTRACT.md)).

---

## 1. 스킨 표시 공간

### 1-1. 현재 구현 **[구현]**

네 페이지가 각자 다른 DOM 자리에 mount된다.

| 페이지 | mount 컨테이너 | 렌더 진입점 | 표시 공간 계약 |
| --- | --- | --- | --- |
| HOME | `#themeMount` (`index.html`) | `renderPublishedSkinHome()` — `skin/skin-home.js` | `.theme-mount--skin` (`home/home-base.css`) |
| CATEGORY | `#postList` | `renderPublishedSkinCategory()` — `skin/skin-category.js` | `.post-container--skin-active` + `.post-area--skin-active` (`posts/posts-base.css`) |
| BANNER | `#postList` | `renderPublishedSkinBanner()` — `skin/skin-banner.js` | 위와 같음 |
| POST | `#postSkinContainer` | `renderPublishedSkinPost()` — `skin/skin-post.js` | 위와 같음 |

네 진입점 모두 `skin/skin-render.js`의 `renderSkin()` 하나만 통해 DOM에 닿는다 —
sanitize / CSS scope / namespace가 강제되는 유일한 신뢰 경계다. 네 함수 모두
throw하지 않고 `false`를 반환해 호출자가 legacy 화면으로 조용히 폴백한다.

**두 계약이 실제로 하는 일**

- `.theme-mount--skin` — `#themeMount`는 평소 `.viewer-area`의 shrink-wrap flex
  item이다(legacy 카드용). 스킨이 실제로 mount됐을 때만 이 클래스를 붙여
  `flex: 1 1 auto` + `align-self: stretch` + `min-*: 0` + `overflow-y: auto`로
  뒤집는다. 스킨이 가용 폭과 높이를 전부 받고, 세로로 길면 이 안에서 스크롤한다.
- `.post-container--skin-active` — legacy `post-header`를 숨기고
  `.post-container`의 `max-width: 720px`를 푼다.
- `.post-area--skin-active` — `#postArea`의 legacy 여백(`72px 24px 24px`)을 0으로
  만든다. 이 여백은 원래 legacy 헤더 자리를 위한 것이라, 스킨이 자기 여백을
  이미 갖고 있는 화면에서는 두 번 겹친다.

**스크롤 담당 요소** — `html` / `body` / `.viewer-area`는 고정 `100dvh`이고, 실제로
스크롤하는 것은 항상 **하나**다: HOME은 `#themeMount`, CATEGORY/BANNER/POST는
`#postArea`. 둘 다 "내부 스크롤 컨테이너" 패턴이고, 스킨 자신은 스크롤 컨테이너를
만들지 않는다.

**소유자 도구** — `.post-container--owner-tools`가 legacy `post-header` 안의
버튼(`#postAddButton` / `#bannerEditToggleButton` / `#postListEditToggleButton` /
`#postManageToggleButton`)만 표시 공간 오른쪽 위의 고스트 버튼으로 다시 꺼낸다.
문서 흐름에서 빠져 있어(`position: absolute`) 스킨 프레임의 좌표·폭에 영향을 주지
않는다. `.music-button`(`home/bgm.css` — fixed, 오른쪽 위 16px, 28px)의 자리는
항상 비워 두고 그 왼쪽에 앉는다.

> `#postArea`에는 `backdrop-filter`가 있다. **`backdrop-filter`가 걸린 요소는 그
> 안의 `position: fixed` 후손에게 containing block이 된다** — `#postArea` 안에서
> `fixed`는 뷰포트가 아니라 `#postArea` 기준이 되고 스크롤과 함께 흐른다.
> 소유자 도구가 "화면 오른쪽 아래"가 아니라 짧은 글에서는 빈 여백 한가운데,
> 긴 글에서는 화면 중간 오른쪽에 떠 있던 실사용자 버그의 원인이 이것이다.
> 지금은 `position: absolute`로 못 박아 기준을 숨기지 않는다.

### 1-2. 원칙 **[원칙]**

1. HOME / CATEGORY / POST / BANNER는 **같은 표시 공간 계약**을 따른다 — 플랫폼은
   가용 폭과 하나의 스크롤 컨테이너를 제공하고, 그 안의 `max-width`·여백·정렬은
   스킨이 정한다. 플랫폼이 스킨의 폭이나 여백을 대신 정하지 않는다.
2. legacy의 고정 폭(`max-width: 720px`), 상단 여백(`72px`), 중앙 정렬, legacy
   헤더가 스킨 위에 **중복 적용되지 않아야 한다**.
3. 스크롤 담당 요소는 페이지마다 하나로 명확해야 한다. 이중 스크롤(스크롤
   컨테이너 안의 스크롤 컨테이너)이나 콘텐츠 잘림을 만들지 않는다.
4. 플랫폼 장식 여백을 제거하더라도 모바일 safe area(`env(safe-area-inset-*)`,
   `viewport-fit=cover`)와 실제로 플랫폼 UI가 차지하는 자리(`.menu-button` 왼쪽
   위 / `.music-button` 오른쪽 위 / 소유자 도구)는 계속 고려한다. 플랫폼 chrome끼리
   겹치게 두지 않는다.
5. **페이지별 임시 보정 CSS를 추가하기 전에 공통 host와 부모 DOM/CSS를 먼저
   확인한다.** 부모 쪽 규칙(부모의 flex shrink-wrap, 부모의 legacy padding,
   부모의 `backdrop-filter`)이 실제 원인이었던 사례가 있어 먼저 볼 값어치가
   있다는 뜻이지, 원인이 항상 거기라는 뜻은 아니다. 스킨 CSS 자체, 라우팅(어떤
   화면이 열렸는지), 캐시(옛 CSS/JS가 남아 있는지)도 원인 후보로 함께 확인한다.
   어느 쪽이든 `.imory-skin-root`에 `!important`를 얹어 증상만 덮는 수정은
   하지 않는다.
6. 스킨 모드 진입·종료·실패 시 관련 클래스와 상태를 확실히 복원한다. 플랫폼
   화면(에디터 / 안내 패널 / 관리 패널)을 열기 직전에는 `enterPlatformScreen()`
   (`posts/view/posts-view-transition.js`)이 세 클래스를 모두 벗긴다 — 벗기지
   않으면 에디터가 프레임 없이 화면 가장자리에 붙고, 버튼이 전부 hidden인 빈
   소유자 도구 껍데기가 남는다.

---

## 2. 화면 전환

### 2-1. 현재 구현 **[구현]**

**내부 탐색** — `skin/skin-link-nav.js`가 `.imory-skin-root` **안에서 시작된**
클릭만 가로채서 기존 SPA 라우터(`openPostPage()` / `openCategoryPage()` /
`closePostArea()` / `startPostCompose()` / `openPostEditor()`)로 넘긴다. 새 라우팅
경로를 만들지 않는다. 다음은 가로채지 않고 브라우저 기본 동작에 맡긴다:

- 스킨 바깥에서 시작된 클릭
- 다른 오리진, `target=_blank`, `download`, 수정키/보조버튼 클릭
- 이 사이트의 세 패턴(`/:slug`, `/:slug/category/:id`, `/:slug/post/:id`)이 아닌 주소
- 이미 다른 핸들러가 `preventDefault()`한 클릭
- posts 모듈이 아직 로드되기 전의 첫 클릭

**주소 계약** — `core/lib/site-path.js`. 경로는 위 세 패턴 그대로이고, 요청은
쿼리로 표현한다.

| 주소 | 뜻 | 빌더 / 판별 |
| --- | --- | --- |
| `/:slug/category/:id?manage=1` | 목록 관리 패널 | `buildSiteManageUrl()` / `isSiteManageRequested()` |
| `/:slug/?write=1`, `/:slug/category/:id?write=1` | 작성 요청 | `buildSiteComposeUrl()` / `isSiteComposeRequested()` |
| `/:slug/post/:id?edit=1` | 수정 요청 | `buildSiteEditUrl()` / `isSiteEditRequested()` |

세 쿼리는 **권한이 아니라 요청**이다. 실제로 열지는 받는 쪽이 다시 판단하고, 열 수
없으면 주소에서 그 쿼리를 지운 뒤 평소 화면으로 돌려보낸다.

**커튼과 대기 표시**

| 상황 | 전환 |
| --- | --- |
| 스킨 후보 화면 탐색 | 이전 화면 유지 → 완성 후 `revealPostArea()`로 커튼 없이 교체 |
| 관리 / 작성 / 수정 / 안내 패널 진입 | `showPostAreaInstant()` — 커튼 없음, `"..."`/`"loading..."` 자리표시 없음 |
| 느린 응답 | 이전 화면 유지 + 300ms 뒤 `#postPendingIndicator`(`schedulePendingIndicator()`) |
| 스킨을 쓰지 않는 배포의 평소 탐색 | `showPostArea()`의 380ms 흰색 커튼 — 예전 그대로 |

분기 이름: `maybeSkinCandidate`(`posts-view-list.js` / `posts-view-detail.js`),
`wantsManageScreen`, `useInstantReveal = maybeSkinCandidate || wantsManageScreen`.

**늦은 응답** — `categoryPageRequestSeq`(`posts-view-list.js`) /
`postPageRequestSeq`(`posts-view-detail.js`) 요청 순번으로, 늦게 도착한 응답이 최신
화면을 덮어쓰지 않게 한다.

**진입 · 복귀 · 스크롤 · 미저장 입력** — `posts/view/posts-view-transition.js`

- `rememberPlatformScreenReturn()` — 플랫폼 화면에 들어가기 직전의 주소·화면
  종류·스크롤(`#postArea.scrollTop`과 `window.scrollY` 둘 다)을 기록한다. 이미
  기록이 있으면 덮어쓰지 않는다(중간 화면으로 되돌아가지 않기 위해). 주소를 직접
  쳐서 들어온 경우(`updateUrl: false`)에는 기록하지 않는다 — 그 주소를 복귀
  지점으로 삼으면 취소해도 쿼리가 남는다.
- `returnToPlatformScreenOrigin()` / `restorePlatformScreenScroll()` — 기존 렌더
  경로를 그대로 다시 태워 복귀한다.
- `forgetPlatformScreenReturn()` — 저장 후처럼 복귀 지점이 무의미해졌을 때.
- 진입은 `pushState`, 종료는 `replaceState` — 나가면서 `?write=1` / `?edit=1`
  항목을 복귀 지점으로 덮어써 주소에 남기지 않는다.
- 미저장 입력: `posts/view/posts-view-editor-load.js`가 에디터를 연 순간의
  값(제목/본문/OOC)을 기준점으로 잡고(`capturePostEditorSnapshot()`) 나갈 때만
  비교한다. 취소는 `confirm()`, 뒤로/앞으로가기는 막을 수 없으므로 남겠다고 하면
  방금 떠난 항목을 다시 `pushState`해서 되돌리고, 탭 닫기는 `beforeunload`다.

### 2-2. 원칙 **[원칙]**

1. 내부 스킨 탐색은 위 공통 라우팅 경로를 쓴다. 스킨 링크를 위한 별도 라우터를
   만들지 않는다.
2. 외부 링크·새 탭·수정키 클릭 등 브라우저 기본 동작을 존중한다.
3. 느린 응답에서는 가능한 한 **이전 화면을 유지**하고 작은 대기 표시만 쓴다.
4. legacy 헤더·목록·흰색 커튼을 중간 화면으로 먼저 노출하지 않는다. "옛 화면을 한
   번 그렸다가 그 위에 진짜 화면을 여는" 2단계를 만들지 않는다.
5. 직접 접속처럼 **이전 화면이 없는 경우**의 로딩·오류 동작도 함께 정한다. 복귀
   지점이 없으면 호출자가 준 fallback(그 글 / 그 카테고리)으로 간다.
6. 늦은 응답이 최신 화면을 덮어쓰지 않게 한다(요청 순번).
7. 주소·관리 상태·뒤로가기·앞으로가기·새로고침 결과를 일치시킨다. 화면에서 열 수
   없는 요청 쿼리는 주소에서도 지운다.
8. 이동·복귀 시 스크롤 정책과 미저장 입력 보호를 명확히 한다.

---

## 3. 소유자와 관리

### 3-1. 현재 구현 **[구현]**

- 일반 탐색에서 소유자와 방문자는 **같은 스킨**을 본다(HOME/CATEGORY/POST/BANNER).
  로그인했다는 이유만으로 legacy 읽기 화면으로 바뀌지 않는다.
- 권한에 따라 다른 것은 **콘텐츠**(비밀글 본문 등)와 **관리 버튼**이다.
  `skin/skin-context.js`가 `viewer.isOwner` / `viewer.writeHref` /
  `viewer.adminHref`를 주고, 스킨은 그 값으로 링크를 그릴지만 정한다.
- 소유자 검사는 받는 쪽이 다시 한다 — `isSiteOwnerSignedIn()`
  (`posts/editor/posts-state.js`), 글 수정은 `posts.user_id` 대조. 실제 쓰기 권한은
  저장 시점의 `user_id` 필터와 RLS가 강제한다.
- 관리 기능은 명시적 플랫폼 진입점으로 연다: 표시 공간 오른쪽 위의 소유자
  도구(`+` / `edit`)와 위 §2-1의 요청 쿼리.
- 작성 대상 카테고리는 `fetchOwnerPostCategories()`
  (`posts/view/posts-view-compose.js`) 하나가 정한다 — 소유자의 `type === "post"`
  카테고리만. 작성 폼의 CATEGORY 드롭다운(`loadPostEditorCategories()`,
  `posts/editor/format/posts-editor.js`)도 같은 함수를 쓴다. 어느 카테고리에 쓸지는
  그 드롭다운이 담당하고, 고르기 위한 중간 화면은 없다.
- 종료하면 진입 전의 스킨 화면으로 복귀한다(§2-1).
- 템플릿 없음 / 렌더 실패 시 fallback은 유지된다 — `renderPublishedSkin*()`이
  `false`를 반환하고 호출자가 legacy 경로를 탄다.

### 3-2. 원칙 **[원칙]**

1. 일반 탐색은 소유자와 방문자 모두 같은 스킨을 쓴다.
2. 권한에 따른 콘텐츠 차이와 관리 버튼 차이는 허용한다.
3. 로그인했다는 이유만으로 legacy 읽기 화면으로 전환하지 않는다.
4. 관리 기능은 명시적 플랫폼 진입점으로만 연다. 읽기 화면이 관리 화면을 겸하지
   않는다.
5. 종료 시 적절한 스킨 화면으로 복귀한다.
6. 템플릿 없음·렌더 실패 시 fallback은 유지하되, **임의로 다른 페이지 템플릿을
   복제하지 않는다** — POST 템플릿이 없다고 CATEGORY 템플릿을 대신 그리지 않는다.

---

## 4. Preview와 공개 화면

### 4-1. 현재 구현 **[구현]**

Studio Preview(`studio/preview/preview-frame.html` +
`studio/preview/preview-bridge.js`)는 공개 화면과 **같은 renderer**를 쓴다 —
`import { renderSkin } from "../../skin/skin-render.js"`. 템플릿 선택도 공용
`resolveSkinTemplate()`(`skin/skin-template.js`)이다. POST 본문 region은 양쪽 다
`applySkinRegion()`이 만든 자리에 플랫폼이 채운다
(`studio/preview/preview-post-body.js`).

배포 버전은 `core/lib/build-version.js`의 `APP_BUILD_VERSION` 하나가 소스이고, 자산은
전부 `?v=${APP_BUILD_VERSION}`으로 로드된다(`loadVersionedScripts()` /
`loadVersionedModules()` / `loadVersionedStyles()` / `writeVersionedImportMap()`).
`build-version.js` 자신만 `?t=<Date.now()>`로 받는다 — 자기가 정의하는 값으로 자기
URL을 만들 수 없기 때문이고, 진입 문서(HTML)는 `_headers`의 `no-cache`가 실제로
먹히므로 그 문서가 매번 새 `?t=` URL을 만들어 준다.

`_headers`의 `no-cache`는 **HTML에만** 도달한다 — CSS/JS는 CDN에서
`max-age=14400`으로 덮인다(2026-09-07 imory.me 실측, `_headers` 상단 주석에 측정값).
그래서 캐시를 실제로 무효화하는 장치는 URL의 `?v=` 하나뿐이다. 진입 문서는
`index.html` / `auth/index.html` / `invite/index.html` / `studio/index.html` /
`studio/preview/preview-frame.html` 다섯이고, iframe은 부모의 import map도 캐시
상태도 물려받지 않으므로 Preview 문서가 자기 몫을 따로 선언한다.

### 4-2. 원칙 **[원칙]**

1. 같은 페이지는 같은 `template` · `Context` · `renderer` 계약을 쓴다. Preview 전용
   렌더 경로를 새로 만들지 않는다.
2. 같은 유효 뷰포트와 같은 데이터에서 스킨 프레임의 폭·여백이 일치해야 한다.
3. Preview 특유의 의도된 차이(링크 클릭 제한 등)는 이 문서에 적는다 — 현재 확인된
   것은 `studio/preview/preview-navigation.js`의 내비게이션 차단/치환이다.
4. 신규 페이지 지원을 추가할 때는 한 줄을 끝까지 확인한다:
   **Import → normalize/validate → resolve → Preview/Code → Save/Publish → 공개
   라우트 연결**.
5. 배포 시 HTML/JS/CSS 버전이 어긋나지 않도록 기존 방식을 따른다 — 자산은 위
   loader 중 하나로 걸고, 모듈 정적 import가 새로 생기면 import map에 추가한다.
   고정 URL `<link>` / `<script src>`를 새로 만들지 않는다. 캐시 문제를
   `_headers`에 규칙을 더 넣는 것으로 해결했다고 판단하지 않는다 — HTML이 아니면
   실제 응답 헤더를 재어 확인한다(CLAUDE.md §4).

---

## 5. 남은 차이 **[차이]**

원칙과 현재 구현이 아직 다른 지점이다. **여기 적힌 것은 후속 목록일 뿐이고, 이
문서를 근거로 자동으로 개발을 시작하지 않는다.**

| # | 남은 차이 | 근거 |
| --- | --- | --- |
| D1 | **표시 공간 계약이 두 벌이다.** HOME은 `.theme-mount--skin`(`home/home-base.css`), CATEGORY/POST/BANNER는 `.post-container--skin-active` + `.post-area--skin-active`(`posts/posts-base.css`). 결과 동작(가용 폭 + 내부 스크롤)은 같지만 공통 함수도 공통 클래스도 없다. §1-2의 "같은 표시 공간 계약"은 아직 **규칙**이지 코드가 아니다. | `home/home-base.css`, `posts/posts-base.css` |
| D2 | **mount 클래스를 붙이는 곳이 흩어져 있다.** 벗기는 쪽만 `enterPlatformScreen()` 한 곳으로 모여 있고, 붙이는 쪽은 `posts-view-list.js`·`posts-view-detail.js`·`posts-view-banner.js`·`posts-view-list-select.js`에 10곳 넘게 반복된다. 새 페이지를 추가하면 그 반복이 한 벌 더 는다. | 위 4개 파일 |
| D3 | **소유자 도구가 스킨 상단 띠와 겹칠 수 있다.** 표시 공간 기준 오른쪽 위 absolute라, 좁은 화면에서 스킨이 자기 상단 띠 오른쪽에 무언가를 그리면 그 위에 얹힌다. 스킨 계약에 소유자 도구용 자리(slot)가 없어서 플랫폼이 좌표로만 피할 수 있다. | `posts/posts-base.css`, `AI_SKIN_PHASE1C_PAGE_CONTRACT.md` |
| D4 | **Preview와 공개 화면의 프레임 폭 일치를 자동으로 검증하지 않는다.** 공개 화면끼리의 일치(HOME 대 CATEGORY 대 POST 프레임 좌표/폭)는 `skin/skin-banner-page-e2e-test.mjs`의 `sameFrame()`이 보지만, Preview 쪽과 대조하는 테스트는 없다. §4-2의 2번은 아직 **규칙**이다. | `skin/skin-banner-page-e2e-test.mjs`, `studio/*-test.html` |
| D5 | **`viewer` 계약이 좁다.** 스킨이 받는 것은 `isOwner` / `writeHref` / `adminHref`뿐이라, 관리 진입점을 스킨 레이아웃 안에 두고 싶어도 표현할 방법이 없다(D3의 배경). 사용자가 Skin Data Contract 확장을 동결한 상태라 그대로 둔다. | `skin/skin-context.js`, `AI_SKIN_PHASE1D_B_NAVIGATION_CONTRACT.md` |
| D6 | **CDN이 `_headers`의 `no-cache`를 CSS/JS에서 `max-age=14400`으로 덮는다.** 저장소 쪽에서는 `?v=`로 우회했지만 원인 자체는 남아 있다 — Cloudflare 대시보드(imory.me zone → Caching → Configuration → Browser Cache TTL, Caching → Cache Rules, Rules → Page Rules)를 볼 수 없어 확인하지 못했다. 그대로 두면 `_headers`에 규칙을 넣고 "해결됐다"고 착각하기 쉽다. 또 `functions/_middleware.js`가 `*.pages.dev`를 301로 돌려서 Pages 기본 도메인과 imory.me의 같은 파일 응답을 비교할 수 없다 — 원인 격리에 필요한 대조군이 막혀 있다. | `_headers`, `functions/_middleware.js` |
| D7 | **`/admin/`은 아직 버전이 붙지 않는다.** 공개 화면·Studio·Preview·auth·invite는 모든 자산이 `?v=`로 걸리지만, `/admin/`은 `build-version.js`를 부르지 않아 CSS/JS 20개가 고정 URL이다 — 그쪽 배포는 여전히 최대 4시간 늦게 반영될 수 있다. | `admin/index.html` |

---

## 6. 관련 변경의 완료 기준

이 문서가 다루는 영역을 건드리는 변경은 아래를 확인한 뒤에 "됐다"고 말한다.

- **정상 렌더만 보지 않는다** — 진입 → 대기 → 성공/실패 → 종료/복귀까지 본다.
- **영향받는 조합을 고른다** — 소유자/방문자, 직접 접속/내부 이동, 모바일/데스크톱
  중 이번 변경이 실제로 닿는 조합.
- **좌표 검증은 host만 보지 않는다** — `#postArea` / `#postContainer`뿐 아니라 실제
  스킨 외곽 요소(`.imory-skin-root`와 스킨이 그린 프레임)의 좌표도 본다.
- **검증 수준을 구분해 보고한다** — mock 테스트 / 실제 DB 검증 / 배포 확인 / 실기기
  확인은 서로 다른 것이다. 현재 E2E는 Supabase 응답과 로그인 상태만 mock하고
  HTML·CSS·JS는 저장소의 실제 파일을 정적 서빙한다 — 저장/삭제의 DB 반영은
  검증하지 않는다.
- **영향 범위에 맞는 테스트만 실행한다.** 전체 스위트를 관성적으로 반복하지 않는다.
- **기존 계약으로 표현 가능한 새 스킨은 JSON만으로 적용 가능해야 한다.**
- **제품 기능이 없으면 JSON 편법으로 우회하지 않는다** — 계약의 빈 부분을 §5에
  적는다.
