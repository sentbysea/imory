# Imory — 작업 지침

이 문서는 이 저장소에서 작업할 때의 기본 지침이다. 상세 규칙은 각 기준 문서에
있고, 여기에는 핵심 원칙과 링크만 둔다.

| 주제 | 기준 문서 |
| --- | --- |
| 스킨 표시 공간 · 화면 전환 · 소유자/관리 · Preview 일치 | [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) |
| SkinPackage JSON shape (디자이너용) | [SKIN_DESIGNER_CONTRACT.md](./SKIN_DESIGNER_CONTRACT.md) |
| Skin Data Contract (템플릿이 받는 데이터) | [AI_SKIN_PHASE1C_PAGE_CONTRACT.md](./AI_SKIN_PHASE1C_PAGE_CONTRACT.md) |
| 제품 방향 · 단계 계획 | [IMORY_AI_SKIN_CUSTOMIZE_PLAN.md](./IMORY_AI_SKIN_CUSTOMIZE_PLAN.md) |
| 폴더(카테고리 안 3단계) · category.tree · 중첩 repeat | [IMORY_FOLDER1_DESIGN.md](./IMORY_FOLDER1_DESIGN.md) |
| Element Inspector · Direct Edit (식별자/patch 방식/보호 계약) | [AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md](./AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md) |
| Selected Element AI Edit (selectionContext/선택 범위 계약) | [AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md](./AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md) |
| AI 실패 진단 (error code / stage / 로그 규칙) | [AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md](./AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md) |
| 서비스 개념 / 디자인 토큰 / 상태 체크리스트 | [Concept.md](./Concept.md) · [Design.md](./Design.md) · [ToDo.md](./ToDo.md) |

---

## 1. 저장소 기본 사실

- **빌드 시스템이 없다.** 순수 HTML/CSS/JS. 번들러도 프레임워크도 `package.json`도
  없다. 스크립트는 `<script src="...">`로 순서대로 로드되며 전역 함수/변수를
  공유한다 — 새 파일을 추가하면 `index.html`의 로드 목록에 순서를 지켜 넣어야 한다.
- 예외적으로 `skin/skin-home.js` · `skin-category.js` · `skin-post.js` ·
  `skin-banner.js` · `skin-render.js`는 ES 모듈이고, classic script와는 명시적
  Promise 핸드셰이크(`window.skinHomeReady` 등)나 동적 `import()`로 연결한다.
- **배포**: Cloudflare Pages. `_redirects`의 `/* /index.html 200` 한 줄로 모든
  경로가 `index.html`로 rewrite되고, 라우팅은 전부 클라이언트 JS가 한다
  (`core/lib/site-path.js`).
- **백엔드**: Supabase (Postgres + Auth + Storage + RLS).
- **배포 버전 / 캐시**: `core/lib/build-version.js`의 `APP_BUILD_VERSION` 하나가
  유일한 소스다. CSS/JS를 고친 배포에서는 **이 문자열 하나만 올린다** — 다른
  파일에 값을 복사해 적지 않는다. 자세한 내용은 §5.
- JS 파일은 가능하면 1000줄 내외로 유지한다. 크게 넘기면 책임 분리를 먼저
  검토하되, 기능 응집도를 깨면서 억지로 나누지 않는다.

---

## 2. 핵심 원칙 — 스킨과 플랫폼

상세: [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md)

### 담당 범위

- **스킨**은 공개 페이지의 배치·색·글씨·장식을 담당한다.
- **플랫폼**은 표시 공간·스크롤·라우팅·로딩·오류·관리 진입을 담당한다.
- 작성·수정·삭제·인증·권한 검사를 사용자 스킨에 구현하지 않는다.
- 특정 스킨 이름이나 스킨 내부 CSS 클래스에 의존하는 제품 코드를 만들지 않는다.

### 표시 공간

- HOME / CATEGORY / POST / BANNER는 같은 표시 공간 계약을 따른다 — 플랫폼이 가용
  폭과 스크롤을 주고, 스킨 자체의 `max-width`·여백을 존중한다.
- legacy의 고정 폭·상단 여백·중앙 정렬·헤더가 스킨에 중복 적용되지 않아야 한다.
- 스크롤 담당 요소를 하나로 명확히 하고, 이중 스크롤이나 콘텐츠 잘림을 피한다.
- 플랫폼 장식 여백을 제거하더라도 모바일 safe area와 실제 플랫폼 UI 공간
  (`.menu-button` / `.music-button` / 소유자 도구)은 고려한다.
- **페이지별 임시 보정 CSS를 추가하기 전에 공통 host와 부모 DOM/CSS를 먼저
  확인한다.** 다만 원인이 거기라고 단정하지 말고 스킨 CSS·라우팅·캐시도
  후보로 함께 확인한다.
- 스킨 모드 진입·종료·실패 시 관련 클래스와 상태를 확실히 복원한다
  (`enterPlatformScreen()`).

### 화면 전환

- 내부 스킨 탐색은 기존 공통 라우팅 경로를 쓴다(`skin/skin-link-nav.js` → 기존
  SPA 라우터). 별도 라우터를 만들지 않는다.
- 외부 링크·새 탭·수정키 클릭 등 브라우저 기본 동작을 존중한다.
- 느린 응답에서는 가능한 한 이전 화면을 유지하고 작은 대기 표시를 쓴다.
- legacy 헤더·목록·흰색 커튼을 중간 화면으로 먼저 노출하지 않는다.
- 직접 접속처럼 이전 화면이 없는 경우의 로딩·오류 동작도 명시한다.
- 늦은 응답이 최신 화면을 덮어쓰지 않게 한다(요청 순번).
- 주소·관리 상태·뒤로가기·앞으로가기·새로고침 결과를 일치시킨다.
- 이동·복귀 시 스크롤 정책과 미저장 입력 보호를 명확히 한다.

### 소유자와 관리

- 일반 탐색은 소유자와 방문자 모두 같은 스킨을 쓴다.
- 권한에 따른 콘텐츠 차이와 관리 버튼 차이는 허용한다.
- 로그인했다는 이유만으로 legacy 읽기 화면으로 전환하지 않는다.
- 관리 기능은 명시적 플랫폼 진입점으로 연다. 종료 시 적절한 스킨 화면으로
  복귀한다.
- 템플릿 없음·렌더 실패 시 fallback은 유지하되, 임의로 다른 페이지 템플릿을
  복제하지 않는다.

### Preview와 공개 화면

- 같은 페이지는 같은 `template` · `Context` · `renderer` 계약을 쓴다.
- 같은 유효 뷰포트와 같은 데이터에서 스킨 프레임의 폭·여백이 일치해야 한다.
- Preview 특유의 의도된 차이(링크 제한 등)는 기준 문서에 적는다.
- 신규 페이지 지원 시 Import → normalize/validate → resolve → Preview/Code →
  Save/Publish → 공개 라우트 연결을 함께 확인한다.

---

## 3. 테스트

이 저장소에는 테스트 러너가 없다. 두 종류가 있다.

- **HTML 하네스** — `skin/*-test.html`, `studio/*-test.html`. 브라우저에서 열어
  검사 결과를 화면에 찍는다. ES 모듈 `import` 때문에 `file://`로는 못 열고 로컬
  정적 서버가 필요하다(관례상 포트 8934).
- **Playwright E2E** — `skin/*-e2e-test.mjs`, `studio/*-e2e-test.mjs`. 자기 정적
  서버를 직접 띄우고 `node <파일>.mjs`로 실행한다(`--browser=webkit`,
  `--only=<섹션>` 지원). Supabase 응답과 로그인 상태만 mock하고 HTML/CSS/JS는
  저장소의 실제 파일을 서빙한다. Studio 쪽은 `studio/studio-lifecycle-scenario.html`
  (production과 같은 스크립트 구성 + in-memory supabase mock)을 띄운다.

| 파일 | 포트 | 범위 |
| --- | --- | --- |
| `skin/skin-published-frame-e2e-test.mjs` | 8934 | 공개 스킨 프레임 좌표/폭 |
| `skin/skin-banner-page-e2e-test.mjs` | 8935 | BANNER·소유자 링크·POST 수정 동선 |
| `skin/skin-write-manage-e2e-test.mjs` | 8936 | WRITE/관리 동선·전환·배너 크기·CATEGORY EDIT·모바일 POST 읽기 모드 |
| `studio/studio-ai-panel-e2e-test.mjs` | 8937 | Skin Studio AI — 서버 방어선(`functions/api/skin-ai.js` 직접 호출) + 전송/검증/적용/되돌리기/참고 이미지 + 시스템 프롬프트의 `category.posts`/`category.tree` 계약(K) |
| `studio/studio-ai-panel-layout-e2e-test.mjs` | 8938 | AI 우측 사이드바 레이아웃(여닫기·폭 드래그·Preview 클릭 접기·textarea) + AI 적용 후 화면 유지 |
| `studio/studio-inspector-e2e-test.mjs` | 8939 | Element Inspector(Select) — hover/선택·navigation 차단·Direct Edit(텍스트/이미지/링크/컨테이너)·binding/imageSlot/POST region 보호·Save·Publish |
| `studio/studio-selected-ai-e2e-test.mjs` | 8940 | 선택 요소 AI 수정 — 서버 selectionContext 검증(+editId 실재 확인)·chip/선택 해제·요청 body 계약·선택 범위 적용·route 유지·Undo·참고 이미지 결합 + 반복 목록 fixture·오류 code/stage·back capability 감사 |
| `posts/posts-folder-manage-e2e-test.mjs` | 8941 | FOLDER-1 관리 트리 — 계층 렌더·체크박스/선택삭제 공존·폴더 CRUD 요청 계약·3단계 및 cycle drop 판정·모바일 터치 drag·저장 실패 롤백 |
| `skin/skin-folder-tree-e2e-test.mjs` | 8942 | Folder-aware 스킨 렌더 — published CATEGORY(소유자/방문자·모바일/데스크톱·폴더 없음·빈 카테고리·카드 안 글 → POST) + Studio Preview(`?scenario=t`) 동일 구조 + `category.posts` 스킨 5종 회귀(폴더 유무에 innerHTML 동일) |
| `studio/studio-file-ux-e2e-test.mjs` | 8943 | Skin Studio 파일 UX — Export(.json 다운로드·allowlist 필드·DB 키 제외) → 파일 선택/drag&drop Import 왕복 구조 동일·붙여넣기 Import 회귀·Save 회귀·legacy HOME-only draft 안내 (이미지 슬롯 drag&drop은 `studio/images/skin-image-library-e2e-test.mjs` 8935의 `[drop]` 절) |

**완료 기준** (상세: 기준 문서 §6)

- 정상 렌더뿐 아니라 진입 → 대기 → 성공/실패 → 종료/복귀까지 확인한다.
- 소유자/방문자, 직접 접속/내부 이동, 모바일/데스크톱 중 **영향받는 조합**을
  검증한다.
- 좌표 검증은 host뿐 아니라 실제 스킨 외곽 요소도 확인한다.
- mock 테스트 / 실제 DB 검증 / 배포 확인 / 실기기 확인을 구분해 보고한다.
- 영향 범위에 맞는 테스트만 실행하고 전체 스위트를 관성적으로 반복하지 않는다.
- 기존 계약으로 표현 가능한 새 스킨은 JSON만으로 적용 가능해야 한다.
- 제품 기능이 없으면 JSON 편법으로 우회하지 말고, 계약의 빈 부분을 기준 문서
  §5(남은 차이)에 적는다.

---

## 4. 캐시와 배포 버전

상세: [core/lib/build-version.js](./core/lib/build-version.js) 상단 주석 ·
[_headers](./_headers) 상단 주석

### 지금 실제로 동작하는 것

- 버전 원천은 `APP_BUILD_VERSION` **하나**다. 자산은 전부
  `?v=${APP_BUILD_VERSION}`으로 로드한다 —
  `loadVersionedScripts()` / `loadVersionedModules()` /
  `loadVersionedStyles()` / `writeVersionedImportMap()`
  (전부 `core/lib/build-version.js`).
- `build-version.js` **자신만** `?t=<Date.now()>`로 받는다. 자기가 정의하는
  값으로 자기 URL을 만들 수 없기 때문이다. 진입 문서(HTML)는 `_headers`의
  `no-cache`가 실제로 먹히므로 항상 최신이고, 그 문서가 매번 새 `?t=` URL을
  만들어 준다 — 그래서 이미 캐시를 물고 있는 브라우저도 **평범한 새로고침
  한 번**으로 새 버전 값을 받는다. Date.now()는 이 한 파일에만 쓴다.
- ES 모듈이 **정적 import로만** 끌어오는 파일(`skin/skin-render.js`,
  `skin/skin-css-validate.js`)은 import 지정자가 문자열 리터럴이라 `?v=`가
  붙지 않는다 — 진입 문서의 import map(`writeVersionedImportMap()`)이 그
  URL만 버전 붙은 URL로 돌린다.
- 진입 문서: `index.html`, `auth/index.html`, `invite/index.html`,
  `studio/index.html`, `studio/preview/preview-frame.html`. iframe은 독립된
  browsing context라 부모의 import map도 캐시 상태도 물려받지 않는다 —
  Preview 문서가 자기 몫을 따로 선언한다.

### `_headers`를 믿지 말 것

`_headers`의 `no-cache`는 **HTML에만** 실제로 도달한다. CSS/JS는 CDN에서
`max-age=14400`으로 덮인다(2026-09-07 imory.me 실측 — `_headers` 상단 주석에
측정값이 있다). 그래서:

- 캐시 문제를 `_headers`에 규칙을 더 넣는 것으로 해결했다고 판단하지 않는다.
  HTML이 아니면 **실제 응답 헤더를 재어** 확인한다.
- 캐시를 실제로 무효화하는 장치는 URL의 `?v=` 하나뿐이다.

원인을 저장소에서 더 좁힐 수는 없다. 확인하려면 Cloudflare 대시보드에서:
**imory.me zone → Caching → Configuration → Browser Cache TTL**,
그리고 **Caching → Cache Rules**(Browser TTL을 Override하는 규칙),
**Rules → Page Rules**(남아 있다면). Pages 쪽은
**Workers & Pages → imory → Settings**. 그 값이 4시간(14400초)으로
잡혀 있는지 본다.

### 새 자산을 추가할 때

고정 URL `<link>` / `<script src>`를 새로 만들지 않는다. 위 loader 중 하나를
쓰고, 모듈 정적 import가 새로 생기면 import map에 추가한다.

---

## 5. 문서 관리

- 상세 규칙은 **한 기준 문서**에서만 관리하고, 다른 문서에는 링크를 둔다.
- `AI_SKIN_PHASE*.md`는 각 라운드의 **기록**이다. 나중 라운드가 앞 계약을
  바꿨으면 앞 문서를 다시 쓰지 말고, 바뀐 지점에 "철회/변경됨 → 어느 문서"를
  적는다.
- 문서에는 "현재 구현" / "앞으로 지켜야 할 원칙" / "남은 차이"를 구분해서 쓴다.
  아직 공통화되지 않은 것을 이미 구현된 것처럼 쓰지 않는다.
- 실제 구현된 공통 함수·파일이 있으면 정확한 이름을 적는다.
