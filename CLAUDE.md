# Imory — 작업 지침

이 문서는 이 저장소에서 작업할 때의 기본 지침이다. 상세 규칙은 각 기준 문서에
있고, 여기에는 핵심 원칙과 링크만 둔다.

| 주제 | 기준 문서 |
| --- | --- |
| 스킨 표시 공간 · 화면 전환 · 소유자/관리 · Preview 일치 | [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) |
| **배치 primitive**(stack · grid · free · sidebar · panel) · `data-imory-layout*` / `data-imory-item*` / `data-imory-slot` · 직접 편집과 AI 가 같은 model 을 고친다 · 모바일 안전 | [IMORY_LAYOUT_PRIMITIVE_DESIGN.md](./IMORY_LAYOUT_PRIMITIVE_DESIGN.md) · [skin/skin-layout.js](./skin/skin-layout.js) · [skin/skin-layout.css](./skin/skin-layout.css) |
| SkinPackage JSON shape (디자이너용) | [SKIN_DESIGNER_CONTRACT.md](./SKIN_DESIGNER_CONTRACT.md) |
| **스킨 CSS 판정**(구조 오류는 차단 · 선언 하나의 문법 오류/허용 안 되는 주소는 그 부분만 제외 · `@import`/`javascript:`/`expression()` 은 들일 때 차단, 렌더/저장은 제외 · 줄·열 오류 문장) · **SkinPackage 공용 파이프라인**(Import Validate/Apply · Code 적용 · AI 전체/선택 · Export→Import 가 한 함수: 슬롯 정규화 → sanitize → CSS strict) · **이미지 슬롯 정규화**(선언 누락 복구 · 중복 병합 · DB 이름 규칙 · AI 첨부 `imory-attachment:N` → 슬롯 + 업로드 + 연결) | [IMORY_CSS_IMPORT_DESIGN.md](./IMORY_CSS_IMPORT_DESIGN.md) · [skin/skin-css-validate.js](./skin/skin-css-validate.js) `analyzeSkinCss` · [skin/skin-package-images.js](./skin/skin-package-images.js) · [skin/skin-package-import.js](./skin/skin-package-import.js) `runSkinPackageContentPipeline` |
| Skin Data Contract (템플릿이 받는 데이터) | [AI_SKIN_PHASE1C_PAGE_CONTRACT.md](./docs/ai-skin/AI_SKIN_PHASE1C_PAGE_CONTRACT.md) |
| 제품 방향 · 단계 계획 | [IMORY_AI_SKIN_CUSTOMIZE_PLAN.md](./IMORY_AI_SKIN_CUSTOMIZE_PLAN.md) |
| 폴더(카테고리 안 3단계) · category.tree · 중첩 repeat | [IMORY_FOLDER1_DESIGN.md](./IMORY_FOLDER1_DESIGN.md) |
| 폴더 라우트 · Series Viewer · folderHref · templates.folder · repeat 안 post-body region | [IMORY_FOLDER2_DESIGN.md](./IMORY_FOLDER2_DESIGN.md) |
| 글쓰기 폼의 폴더 선택 · 폴더 안에서 WRITE(`?write=1`) · 소유자 도구(＋/edit) 자리(`owner-tools` region) | [IMORY_FOLDER3_DESIGN.md](./IMORY_FOLDER3_DESIGN.md) |
| 갤러리 표시 · 글 대표 이미지(post_covers) · category.gallery/pagination · ?page=N | [IMORY_GALLERY1_DESIGN.md](./IMORY_GALLERY1_DESIGN.md) |
| 본문 사진(post/gallery 공통 에디터) · 대표 사진 지정 · 발췌(PREVIEW/export/copy)의 사진 | [IMORY_POST_BODY_IMAGE_DESIGN.md](./IMORY_POST_BODY_IMAGE_DESIGN.md) |
| 올리는 이미지 준비(메타데이터 제거 + 압축, 모든 업로드 경로 공용) | [IMORY_GALLERY1_DESIGN.md](./IMORY_GALLERY1_DESIGN.md) §13-6 · [core/lib/image-upload.js](./core/lib/image-upload.js) |
| Quote Preset ↔ 에디터 PREVIEW ↔ export 렌더 기준 실측 · auto/uniform · 출력 조건(비율·가로 픽셀)은 프리셋 CANVAS에서만 저장 | [IMORY_QUOTE_PRESET_RENDER_AUDIT.md](./IMORY_QUOTE_PRESET_RENDER_AUDIT.md) |
| 형광펜 높이 · 문단 강조선 · 캔버스 배경 사진 · 에디터 컬러피커 · **색 고르기 두 단계** · **본문 블록(복사 상자/메모/구분선)** · **HTML 디자인 PNG** | [IMORY_EDITOR_DECOR_DESIGN.md](./IMORY_EDITOR_DECOR_DESIGN.md) |
| 글 뷰어 도구 메뉴(⋮) · 하이라이트/노트 · 하이라이트 화면 · **진입점 칩** · **위치 확인 3상태** · **폴더 차례 끌기** | [IMORY_HIGHLIGHT1_DESIGN.md](./IMORY_HIGHLIGHT1_DESIGN.md) (이름·카테고리 계약은 아래 문서가 대체) |
| **HIGHLIGHT 카테고리 · singleton 타입(banner/highlight) · `memo`→`highlight` 개명과 호환 alias · Settings ADVANCED SETTINGS · post/gallery 공용 페이지네이션 · 타입 변경 시 글 이동** | [IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md](./IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md) |
| 카테고리 타입 / 페이지 번호 공용 상수 (DB 제약과 짝) | [core/lib/category-types.js](./core/lib/category-types.js) |
| **공개 URL 번호**(`categories.public_no` · `posts.public_no` — 블로그마다 1부터) · 번호↔내부 id 환전소 · 환전이 일어나는 세 경계 | [IMORY_PUBLIC_NUMBER_DESIGN.md](./IMORY_PUBLIC_NUMBER_DESIGN.md) · [core/lib/public-number.js](./core/lib/public-number.js) |
| **글 공유 카드(X large image) · SETTINGS > SHARE(BANNER/CARD) · og/twitter meta 주입 · `/api/og/post`** | [IMORY_SHARE_CARD_DESIGN.md](./IMORY_SHARE_CARD_DESIGN.md) |
| **Bottom Dock**(`bottomDock` 설정 + `templates.dock` 디자인) · 자리(auto/fixed/sticky/static) · 접기와 trigger · `data-imory-dock` 두 자리 · **Studio Dock 패널(사용자에게는 켜기 · 열기 버튼 · 항목 · 이동할 곳만 — 적용하면 fixed + collapsed)** · **아이모리 아이콘과 "스킨이 안 그린 자리만 채우기"** · AI 처리 | [IMORY_BOTTOM_DOCK_DESIGN.md](./IMORY_BOTTOM_DOCK_DESIGN.md) §3 · §9 · [skin/skin-bottom-dock.js](./skin/skin-bottom-dock.js) · [skin/skin-bottom-dock-visual.js](./skin/skin-bottom-dock-visual.js) · [skin/skin-dock-icons.css](./skin/skin-dock-icons.css) |
| **전환 primitive**(none · fade · slide · scale · fade-slide · fade-scale × duration · easing · direction) · `data-imory-transition*` / `data-imory-panel` / `data-imory-toggle` · appear(페이지 전환) · show/hide 상태 기계 · `bottomDock.transition` 객체 · Direct Edit 전환 폼 · AI 처리 | [IMORY_TRANSITION_PRIMITIVE_DESIGN.md](./IMORY_TRANSITION_PRIMITIVE_DESIGN.md) · [skin/skin-transition.js](./skin/skin-transition.js) · [skin/skin-transition.css](./skin/skin-transition.css) |
| **Skin Studio 화면 구조**(상단 세 그룹 · Publish 만 primary · Import|Export 한 덩어리) · **왼쪽 패널**(Select · Images · Dock 이 같은 자리, Images/Dock 을 다녀와도 선택 유지, Dock 사본 보존) · Preview 위에는 테두리·이름표·핸들만 · **Undo/Redo**(working draft 변경 기록 · **사용자가 되돌리는 곳은 상단 ↶ ↷ 하나** — Inspector·AI 패널의 되돌리기 버튼은 1.1 에서 걷었다 · 한 칸 = 확정 한 번 · Save/Publish 뒤 ↶ 는 서버를 건드리지 않고 dirty) · 좁은 화면(두 줄 + ··· 메뉴 · 아래 시트) · **모바일 편집 시트 세 단계**(MOBILE-SHEET-1 — 접힘 · 내용 보기 · 전체 화면 · 패널별 기본 단계 · 손잡이 · Escape 단계 내리기 · 시트 머리의 Quick Bar 와 `···` · **Preview 가림 방지**: 시트 높이만큼 Preview 문서 끝의 Studio 전용 여유 + `ensureSelectedElementVisibleAboveSheet()` · visualViewport 키보드) | [IMORY_STUDIO_SHELL_DESIGN.md](./IMORY_STUDIO_SHELL_DESIGN.md) §5-1 · [studio/studio-shell.js](./studio/studio-shell.js) · [studio/studio-sheet.js](./studio/studio-sheet.js) · [studio/studio-sheet-drag.js](./studio/studio-sheet-drag.js) · [studio/preview/preview-sheet-inset.js](./studio/preview/preview-sheet-inset.js) · [studio/studio-history.js](./studio/studio-history.js) · [studio/studio-shell.css](./studio/studio-shell.css) |
| Element Inspector · Direct Edit (식별자/patch 방식/보호 계약) | [AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md](./docs/ai-skin/AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md) |
| **클릭하고 바로 고치는 Select**(DIRECT-UX-1) · **선택 우선순위**(글자 → 이미지 → 버튼·링크 → 구성 요소 → 래퍼, 래퍼만 있는 자리 = 빈 곳) · **사람이 읽는 요소 이름**(태그·클래스·경로 미노출, 패널·이름표·메뉴·AI 가 한 함수) · 겹친 요소 메뉴 · 바깥 영역 선택 · **더블클릭 글자 편집** · 자유 배치 **본체 끌기** · Quick Bar(이미지 변경 · 앞으로/뒤로 · 숨기기 · AI로 수정) · 종류별 항목만(**배치·전환 상세 칸은 일반 UI 에서 숨김, 값은 보존** · 개발/테스트 스위치 `IMORY_STUDIO_ADVANCED_INSPECTOR`) · AI 빠른 제안 · 저장·공개 상태 문구 · 처음 쓰는 사람 안내 · **반응형 적용 범위 조사(계약 없음 → 만들지 않음)** | [IMORY_DIRECT_UX_DESIGN.md](./IMORY_DIRECT_UX_DESIGN.md) · [skin/skin-inspect-target.js](./skin/skin-inspect-target.js) · [studio/preview/preview-inspect-direct.js](./studio/preview/preview-inspect-direct.js) · [studio/inspector/studio-inspector-names.js](./studio/inspector/studio-inspector-names.js) · [studio/inspector/studio-inspector-quickbar.js](./studio/inspector/studio-inspector-quickbar.js) |
| "이 요소를 고를 수 있는가" 규칙 — Studio · native Preview · sandbox 프레임 **세 realm 공용** | [skin/skin-inspect-target.js](./skin/skin-inspect-target.js) |
| **sandbox 프레임 안 Select**(Element Inspector) · INSPECT 메시지 다섯 · 위조 선택 대조 · **SANDBOX-SELECT-PARITY-1: native 와 같은 선택 우선순위 · 겹친 메뉴 · 바깥 영역 · 더블클릭 · 본체 끌기 · 패널/Quick Bar**(직접 조작 메시지 일곱 · 글자 확정은 begin 을 받은 뒤만 · 이미지 크기/자르기만 잠김 · 스크롤 좌표 보정) | [IMORY_SANDBOX_SKIN_DESIGN.md](./IMORY_SANDBOX_SKIN_DESIGN.md) §Q · §S · [skin/sandbox/skin-sandbox-inspect.js](./skin/sandbox/skin-sandbox-inspect.js) · [skin/sandbox/skin-sandbox-inspect-direct.js](./skin/sandbox/skin-sandbox-inspect-direct.js) |
| **선택 복원의 근거**(승격된 id vs 지문) · 관문은 `bumpStudioWorkingRevision()` 하나 · 모바일 Select 진입 · admin 의 "데스크탑 전용" 안내 해제 | [IMORY_SANDBOX_SKIN_DESIGN.md](./IMORY_SANDBOX_SKIN_DESIGN.md) §R · [studio/inspector/studio-inspector-model.js](./studio/inspector/studio-inspector-model.js) `resolveInspectorSelectionTarget` |
| Selected Element AI Edit (selectionContext/선택 범위 계약) | [AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md](./docs/ai-skin/AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md) |
| AI 실패 진단 (error code / stage / 로그 규칙) | [AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md](./docs/ai-skin/AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md) |
| 직접 편집 — 텍스트 내용 · 이미지 크기 (임시/확정 분리, 모서리 드래그) | [AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md](./docs/ai-skin/AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md) |
| 직접 편집 — 이미지 자르기 (프레임 래퍼 · 비율/확대/구도 · 크기 조절과의 경계) | [AI_SKIN_PHASE_AI6D_IMAGE_CROP.md](./docs/ai-skin/AI_SKIN_PHASE_AI6D_IMAGE_CROP.md) |
| 프레임 좌표 (보이는 사각형) · 팝오버 자리 · 구도 이동 기어비 | [AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md](./docs/ai-skin/AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md) |
| 자유 비율 자르기 (변·모서리 핸들) · Inspector 슬라이더 규칙 | [AI_SKIN_PHASE_AI6F_FREE_CROP_AND_SLIDERS.md](./docs/ai-skin/AI_SKIN_PHASE_AI6F_FREE_CROP_AND_SLIDERS.md) |
| **재료 일치**(Studio↔공개) · `data-imory-kind`/`color` · `iconKind` · `category.showPostsList` · 하이라이트 `sourcePathLabel` · SkinPackage 감사 경고 | [AI_SKIN_PHASE_AI7_MATERIAL_PARITY.md](./docs/ai-skin/AI_SKIN_PHASE_AI7_MATERIAL_PARITY.md) |
| **Sandbox 스킨**(별도 origin iframe) · `renderMode` · 기능 플래그 · frame CSP/nonce · 호스트 분기 · 프레임에 넘기는 데이터 투영 · **프레임 안 이동(navId)** · **화면별 sandbox 진입**(HOME·CATEGORY·GALLERY·POST·BANNER·HIGHLIGHTS / FOLDER 는 native) · **Skin Studio Preview 도 같은 프레임**(중첩 iframe · Select 는 §Q·§S 에서 native 와 같게) | [IMORY_SANDBOX_SKIN_DESIGN.md](./IMORY_SANDBOX_SKIN_DESIGN.md) (**§G · §H · §J · §K · §L · §O 만 현재 구현** — §A~§F 는 설계이고 여러 곳이 어긋나 있다, 문서 머리말 표 참고. **저자 JS 를 두 번째 블로그에 열기 전에 §O-9(공유 origin) 를 먼저 읽는다**) |
| **본문이 그려지는 네 화면의 공용 CSS**(공개 뷰어 · 에디터 PREVIEW · Quote Preset 미리보기 · Studio Preview · sandbox 프레임) | [posts/posts-body-shared.css](./posts/posts-body-shared.css) · [IMORY_SANDBOX_SKIN_DESIGN.md](./IMORY_SANDBOX_SKIN_DESIGN.md) §N |
| **스킨 저자 JS**(`SkinPackage.js`) · 프레임 안에서만 실행 · nonce script · kill switch · `window.imorySkin` API · 다시 그릴 때 realm 을 버린다 | [IMORY_SANDBOX_SKIN_DESIGN.md](./IMORY_SANDBOX_SKIN_DESIGN.md) §O · [skin/sandbox/skin-sandbox-author-js.js](./skin/sandbox/skin-sandbox-author-js.js) |
| 스킨 링크 클릭의 **유일한 출구**(native · sandbox 공용) | [skin/skin-link-nav.js](./skin/skin-link-nav.js) `navigateToSkinRoute()` |
| 프레임에서 **어디로 갈 수 있는가**(URL 허용/거부 규칙 · navId 표) | [skin/sandbox/skin-sandbox-nav.js](./skin/sandbox/skin-sandbox-nav.js) |
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
| `skin/skin-banner-page-e2e-test.mjs` | 8935 | BANNER·소유자 링크·POST 수정 동선 · 본문/OOC가 소유자 전용 RPC(`get_own_post_content` / `upsert_own_post_content`)로만 오가는지 · **읽기 화면의 OOC**(주인장에게만 본문 위에 한 번, 방문자에게는 요소도 응답도 없음) · **소유자 도구(＋/edit)의 자리**(스킨 글 기둥 첫 줄에 맞춤 · `owner-tools` 슬롯을 그린 스킨에서는 그 슬롯 · 슬롯은 빈 채 · 방문자에게 없음) |
| `skin/skin-write-manage-e2e-test.mjs` | 8936 | WRITE/관리 동선·전환·배너 크기·CATEGORY EDIT·모바일 POST 읽기 모드 |
| `studio/studio-ai-panel-e2e-test.mjs` | 8937 | Skin Studio AI — 서버 방어선(`functions/api/skin-ai.js` 직접 호출) + 전송/검증/적용/되돌리기/참고 이미지 + 시스템 프롬프트의 `category.posts`/`category.tree` 계약(K) + `category.gallery`/`category.pagination` 계약(L, 갤러리 스킨 왕복 시 카드 바인딩·페이지 링크 유지) |
| `studio/studio-ai-panel-layout-e2e-test.mjs` | 8938 | AI 우측 사이드바 레이아웃(여닫기·폭 드래그·Preview 클릭 접기·textarea) + AI 적용 후 화면 유지 |
| `studio/studio-inspector-e2e-test.mjs` | 8939 | Element Inspector(Select) — hover/선택·navigation 차단·Direct Edit(텍스트/이미지/링크/컨테이너)·binding/imageSlot/POST region 보호·Save·Publish · `--only=identity`: **구조 경로 id 만으로 선택을 되살리지 않는다**(고른 요소 삭제로 뒤 형제가 같은 id 를 물려받음 · 앞 형제 삽입/삭제 · 순서 변경 → 전부 `mismatch` 해제, CSS 만 바뀌면 유지, **승격된 id 는 자리가 밀려도 그 요소를 따라간다**) · **완전히 같은 형제**(글자 단위로 똑같은 카드 셋 중 하나를 지우면 지문이 같아도 다른 형제로 넘어가지 않고 해제 · 겉만 같고 속이 다른 형제의 순서 바꾸기도 해제 · 승격된 id 라도 HTML 안에 둘이면 `ambiguous` 해제 · 관계없는 형제의 글자만 바뀌면 유지) · `--only=narrow`: **390px Studio 창의 Select**(버튼이 화면 안 · 터치 pointerdown 으로 선택 · 팝오버가 Top Dock 밑에 깔리지 않음 · AI chip 연결 · Escape 해제 · 모드 끄기 · 가로 넘침 0) |
| `studio/studio-direct-edit-e2e-test.mjs` | 8945 | Select mode 직접 편집 — 텍스트 내용(여러 줄·IME·적용/취소·줄바꿈 유지·바인딩 안내) + 이미지 너비(슬라이더/숫자/모서리 드래그 일치·비율 유지·Undo 한 번·Desktop/Mobile·AI 패널·모바일 가로 넘침) + Save/재로드/Export→Import 유지 |
| `studio/studio-selected-ai-e2e-test.mjs` | 8940 | 선택 요소 AI 수정 — 서버 selectionContext 검증(+editId 실재 확인)·chip/선택 해제·요청 body 계약·선택 범위 적용·route 유지·Undo·참고 이미지 결합 + 반복 목록 fixture·오류 code/stage·back capability 감사 · `--only=stale`: **응답이 오는 사이 draft 가 바뀌면 적용하지 않는다**(응답을 늦춘 뒤 그 틈에 고른 요소를 지운다 → 규칙이 엉뚱한 요소에 붙지 않고 draft 는 내 변경 그대로, `SELECTION_TARGET_NOT_FOUND` 안내, 선택 해제. 대조군: draft 가 그대로면 늦은 응답도 정상 적용. **완전히 같은 형제 셋 중 하나가 그 틈에 지워지는 경우**도 같다 — 규칙이 살아남은 형제에 붙지 않고, 형제를 건드리지 않은 대조군에서는 정상 적용) |
| `posts/posts-folder-manage-e2e-test.mjs` | 8941 | FOLDER-1 관리 트리 — 계층 렌더·체크박스/선택삭제 공존·폴더 CRUD 요청 계약·3단계 및 cycle drop 판정·모바일 터치 drag·저장 실패 롤백 |
| `skin/skin-folder-tree-e2e-test.mjs` | 8942 | Folder-aware 스킨 렌더 — published CATEGORY(소유자/방문자·모바일/데스크톱·폴더 없음·빈 카테고리·카드 안 글 → POST) + Studio Preview(`?scenario=t`) 동일 구조 + `category.posts` 스킨 5종 회귀(폴더 유무에 innerHTML 동일) |
| `skin/skin-folder-page-e2e-test.mjs` | 8944 | FOLDER-2 폴더 페이지(Series Viewer) — OPEN 링크(folderHref) 조건 · direct 글만 + 본문 region 채움 · children/breadcrumb/BACK/EDIT · 소유자 secret/private 본문 · 방문자 글별 gate(오답/정답, 네트워크에 secret id 없음) · 카테고리 복귀(삭제/빈/direct 없음/템플릿 없음/다른 카테고리) · 직접 접속·뒤로가기·모바일 + Studio Preview(`?scenario=t`) 동일 구조·`preview:folder-bodies`·CODE 활성·overlay · `--only=write`: **FOLDER-3 폴더 안에서 쓰기**(폴더 WRITE href·폼의 카테고리/폴더 미리 선택·`ㄴ` 들여쓰기 목록·카테고리 변경 시 목록 교체와 칸 숨김·취소 복귀·직접 접속·방문자 거절과 주소 정리) |
| `skin/skin-crop-published-e2e-test.mjs` | 8947 | 자르기 결과의 **공개 화면** 렌더 — Studio에서 자르고 Save/Export한 .json을 그대로 `get_published_skin`에 넣어 실제 `index.html`로 렌더 · sanitizer/CSS validator 이후 래퍼와 자르기 규칙 생존 · Studio Preview와 프레임/구도 일치 · desktop/mobile 빈틈·가로 넘침 · 자른 이미지의 링크 클릭 |
| `studio/studio-crop-e2e-test.mjs` | 8946 | Select mode 이미지 자르기 — 비율(정사각/가로/세로·현재 비율)·확대·드래그 구도·빈틈 없음 + 임시/취소/Escape/Undo + 자르기 초기화 + 크기 조절과 공존(프레임이 주인) + 래퍼 중복 방지 + 좌표(Desktop/Mobile 축소·AI 패널) + Save/재로드/Export→Import + 보호 영역·로드 실패·이미지 교체 + `--only=frame`: 조상 overflow가 잘라내는 프레임의 테두리/드래그 판 위치·구도 이동이 포인터와 1:1·위치 슬라이더/방향 버튼·팝오버 고정 + `--only=free`/`freegeo`: 자유 비율(네 변·모서리 핸들·왜곡/빈틈 없음·자유↔고정 전환은 **그려진 사진**으로 판정·삼등분 가이드선) + `--only=freealign`: 왼쪽/가운데/오른쪽 정렬 × 네 변·모서리에서 잡은 변은 포인터 1:1·반대쪽 변 고정(모바일 배율 포함)·적용 시 임시 위치 해제 + `--only=freelimit`: 확대 상한에서 핸들 정지·안내 + `--only=sliders`: 슬라이더 토큰·방향키·채움 비율·비활성 |
| `skin/skin-gallery-e2e-test.mjs` | 8948 | GALLERY-1 — 갤러리 공개 렌더(3열/2열·정사각 썸네일·사진 없음 대체 카드·본문 요청 0건·모바일 가로 넘침) · 비밀글 보호(대표 이미지 주소가 응답/DOM/이미지 요청 어디에도 없음, 지정 이미지 + 잠금 유지) · 페이지 이동(?page=N 클릭/직접 접속/새로고침/뒤로가기/범위 밖/빈 카테고리) · 하위 호환(갤러리를 모르는 스킨은 전체 목록 그대로, 목록·폴더·이어읽기 회귀, migration 이전 배포) · `--only=body`: **post/gallery 공통 본문 에디터**(사진 버튼 위치·커서 자리 다중 삽입·글→사진→글 저장/재편집·대표 지정/변경/해제/삭제 fallback·저장 RPC가 본문을 덮어쓰지 않음·재업로드 없음·undo·예전 갤러리 글과 COVER 데이터 보존·발췌 버튼 차이·취소 시 임시 파일 없음·저장 실패 롤백) · `--only=excerpt`: **발췌에 들어가는 본문 사진**(본문 순서·원본 비율·가운데 정렬·간격, 한 장을 쪼개지 않는 페이지 경계와 명시적 PAGE break, AUTO 높이, 저장 전 사진/저장된 사진(`/api/post-cover`), 느린 로딩·실패 시 자리표시자와 재시도, **실제 export PNG를 디코드해** 사진이 그려진 위치·크기가 PREVIEW/copy와 같은지, 모바일, gallery 버튼 숨김 유지. `IMORY_EXCERPT_OUT=<디렉터리>`를 주면 눈으로 볼 발췌 PNG를 남긴다) · `--only=access`: **파일 자체의 접근 경계** — 비공개 버킷 + 요청마다 권한 확인(`/api/post-cover`, **실제 Pages Function**을 그대로 돌린다). 공개→비밀/비공개 전환 뒤 같은 주소 재요청이 404가 되고(그 전환에서 파일을 하나도 건드리지 않는다), 같은 순간 소유자는 보이며, 다시 공개로 바꾸면 열린다 · `--only=protect`: 블로그 보호 설정(Settings > HOME > ETC) — 이미지 EXIF 제거(APP1을 실제로 넣은 JPEG로 확인)·**올리는 이미지 압축**(긴 변 2048px·투명 없는 png → jpeg·투명 있으면 png 유지·경로 확장자·원본보다 작아짐)·우클릭/복사 방지(주인장 제외, 목록·글 화면 모두)·저장 payload · Studio Preview 일치(`?scenario=g`) |
| `admin/admin-settings-e2e-test.mjs` | 8949 | 관리 설정 화면 — FAVICON/CURSOR(URL 칸 없음·**고를 때마다 새 경로**·save 전에는 DB/예전 파일 그대로·저장 뒤 예전 파일 삭제·remove·저장 실패 시 재시도 가능) · HOME>ETC 설정(보호 3개 + **메모 진입점 숨기기**) 불러오기/저장 · 설정 안쪽 탭이 화면 복귀(`restoreAdminView`) 뒤에도 유지되는지 · `--only=memofolder`: **메모 폴더 차례**(데스크톱 드래그·모바일 꾹 눌러 끌기·**꾹 누르기 전에 움직이면 스크롤이라 순서가 안 바뀐다**·↑↓ 병행·저장 payload가 화면 차례 그대로·원본 카테고리 `sort_order` 불변) · `--only=singleton`: **BANNER/HIGHLIGHT는 블로그당 하나**(이미 쓰는 타입은 disabled·자기 타입은 잠기지 않음·disabled를 우회해도 값이 되돌아가고 이유가 나옴) · `--only=advanced`: **ADVANCED SETTINGS**(카테고리 드롭다운이 이름 `·` 타입·타입별 패널만·CATEGORIES 줄에 고급 설정 없음·**카테고리를 바꿔도 저장 안 한 draft 유지**·로마자 미리보기·banner는 `추가 설정 없음`·모바일 390px 넘침 0) |
| `admin/admin-asset-version-e2e-test.mjs` | 8955 | 관리 화면의 **배포 버전 일치** — CDN 실측값(HTML `no-cache` / CSS·JS `max-age=14400`)을 흉내낸 서버 위에서 돌려 브라우저가 실제로 캐시하게 한다. 이 화면이 받는 자기 CSS·JS·HTML 조각이 전부 `?v=APP_BUILD_VERSION` 한 값인가(`build-version.js`만 `?t=`) · 같은 파일을 두 주소로 받지 않는가(CUSTOMIZE iframe 포함) · `--only=stale`: **옛 배포를 먼저 열어 CSS를 캐시시킨 뒤 새 배포를 연다** — 고정 URL이던 옛 문서에서는 옛 CSS가 이기고(대조군), 고친 문서에서는 `?v=`로 주소가 달라져 옛 캐시가 이길 수 없다 · `--only=fouc`: CSS를 늦게 내려도 첫 그리기가 그 뒤다(무스타일 노출 없음) · `--only=mobile`: 390px SHARE>CARD·CATEGORY·PROFILE를 **새 캐시/이전 캐시** 두 상황에서. WebKit은 BrowserContext 캐시를 재사용하지 않아 `stale` 절이 SKIP으로 표시된다 |
| `admin/share-card-e2e-test.mjs` | 8954 | 글 공유 카드 — SETTINGS > SHARE 탭(기존 BANNER 기능 그대로 + CARD 설정 저장/재로드/version) · **CARD 화면 순서**(PREVIEW가 맨 위 · 기본 사진은 썸네일 없이 `change · edit · remove` · BLACK/WHITE 버튼 대신 네모 컬러 피커 + 강도 한 줄 · 폰트 + 제목 크기 한 줄 · 카드 라벨, 390px에서도 한 줄) · 카드 레이아웃 실측(1200×628 · **기준선이 바닥에서 110~120px**로 X 검은 링크 바를 피함 · 좌우 48px · 긴 제목 2줄 · 배경이 바뀌어도 제목 자리 고정 · 제목 크기만 커지고 기준선 고정 + 범위 클램프 · **오버레이 색의 밝기가 글자색을 정함**, 밝은 쪽은 짙은 회색) · **카드 안에서 걷어낸 것**(좌하단 카테고리 라벨 · `@slug · 카테고리` 메타 줄 — 남는 글자는 제목·라벨·도메인 셋뿐) · **우상단 카드 라벨**(사용자 지정이 이기고, 비우면 `카테고리 · 001`, 폴더 안의 글은 폴더 이름, 이름도 번호도 없으면 그리지 않음) · `--only=crop`: **기본 사진 위치 조정 모달**(1200:628 프레임 · `object-fit: cover` · `touch-action: none` · 끄는 대로 구도가 움직임 · **모달의 위치 = 카드 배경의 위치** · cancel/모달 save는 서버에 쓰지 않음 · 설정 save에서 `image_position_x/y`) · **실제 Pages Function**(`functions/_middleware.js` · `functions/api/og/post.js`)의 og/twitter meta와 1200×628 PNG · **`og:title`은 글 제목 / `twitter:title`은 블로그 제목만**(글 제목·slug·카테고리·`\|` 없음, 비면 `imory.me`) · 렌더 문서의 crop 값이 설정 화면과 **같은 함수**에서 나오는가 · `share_label_seq` 컬럼이 없는 배포에서도 화면과 카드가 나오는가 · 비밀글/비공개 글의 제목·발췌·대표 이미지 비노출 · **카드 배경이 글의 대표 사진**(본문 사진 중 `is_primary` → 본문 첫 사진 → 예전 `post_covers` → 기본 사진 순, 대표를 바꾸면 `og:image`의 `v`가 달라짐) · 렌더러 미설정/실패 시 기본 카드 · **같은 post+v 재요청에 렌더 호출 0**(Workers Cache)이면서 **캐시가 공개 여부 확인을 건너뛰지 않는가**(비공개 전환 즉시 차단·항목 삭제, 공개 전환 즉시 복구) · `--only=photo`: **저장한 기본 사진이 실제 카드에 그려지는가** — 1×1 mock이 아니라 **진짜 사진**(1200×1256 두 색 띠)을 HTTP로 서빙하고 카드 HTML을 **진짜 브라우저로 그려서** 찍힌 픽셀로 판정한다(저장 성공 전에는 `saved` 없음 · 새로고침 뒤 미리보기가 저장된 그 주소 그대로 · 서버가 같은 `share_card` 행을 읽음 · 대표 이미지 우선 · 구도 적용 · **일시적 렌더 실패는 재시도하고 실패를 굳히지 않으며 이유를 `X-Imory-Share-Card` 헤더로 말한다** · 사진을 바꾸면 `og:image`의 `v`가 바뀐다). `IMORY_SHARE_SHOT=<디렉터리>`를 주면 모바일/데스크톱 설정 화면·위치 조정 모달·실제 카드 PNG를 남긴다 |
| `admin/quote/quote-render-parity-e2e-test.mjs` | 8950 | Quote Preset 미리보기 ↔ 에디터 PREVIEW ↔ export ↔ 발행 본문이 **같은 계산**을 쓰는지 — `--only=paragraph`: 문단 간격이 `paragraphSpacing`을 실제로 따르는가(일반 줄바꿈/문단 구분/의도적 연속 빈 줄/PAGE break 구분, 인라인 서식·사진 앞뒤 문단 보존) · `--only=parity`: 본문 폭·줄바꿈 위치(글자 단위)·문단 간격·제목/출처 자리·페이지 수가 두 화면에서 같은가(Desktop/Mobile, 고정 비율/AUTO, 넘치는 샘플의 페이지 이동, 표시 배율은 contain) · `--only=legacy`: 설정이 빠진 옛 프리셋 열기→저장→다시 열기(명시적 0·알 수 없는 필드·canvas 값 보존) · `--only=export`: 고정 비율·auto·uniform export PNG의 실제 픽셀 크기(**auto도 `레이아웃 높이 × 배율`과 정확히 일치** — 나눈 뒤 페이지 높이를 정수로 확정)와 출력 너비를 바꿔도 줄바꿈/페이지 수가 그대로인지 · `--only=published`: 발행 본문의 문단 간격 · `--only=uniform`: uniform이 auto와 **같은 분할**(페이지 수·각 장의 글자·사진 자리)을 쓰고 가장 높은 페이지 높이로 통일되는가, 짧아지면 줄어드는가, **늘어난 공간이 고른 세로 정렬(top/center/bottom)대로 놓이고 높이는 그대로인가**(정렬 컨트롤은 auto에서만 숨는다) · `--only=options`: Preview 출력 조건 UI(uniform/auto/custom 상시 노출·프리셋 고정 비율 → custom 대응·**출력 너비 입력은 없고 크기 표시만**·접기/펼치기 유지·새 편집 세션 초기화·gallery 숨김) · `--only=cache`: 공용 렌더러/스타일의 **실제 요청 URL**(두 문서가 같은 배포 버전, iframe 포함 중복 로드 없음) · `--only=panel`: 발췌 여닫기 버튼(흐름 속 고스트 버튼·**가운데 정렬**·데스크톱/모바일 공통·`aria-expanded`/`aria-controls`·라벨 `발췌 ▾`/`발췌 접기 ▴`·**접으면 export/copy가 함께 숨고 cancel/save는 남는다**)과 패널 정리(중복 PREVIEW 문구·닫기 × 없음, 세로 정렬과 상세 비율이 custom에서만 **그려짐**, 접은 채로 export가 펼친 상태와 동일, 모바일 핀치 유지) · `--only=labels`: Quote Preset 한국어 라벨(**헤더 행 전체**(큰 탭·구역 제목·오른쪽 보조 문구·화면 부제)는 영어, 구역을 펼쳤을 때 나오는 설정명·선택값·동작 버튼은 한국어, 데스크톱과 모바일 탭 5개에서 잘림/가로 넘침 없음, 폼 왕복에서 저장값 enum·키 불변). `IMORY_QUOTE_SHOT=<디렉터리>`를 주면 두 화면 스크린샷을 남긴다 |
| `posts/posts-editor-decor-e2e-test.mjs` | 8951 | 본문 장식 — **색 고르기는 두 단계다**(색 견본 → 프리셋 색 목록 → 직접 선택 → 컬러피커. 목록만 열고 닫으면 undo 기록에 흔적 없음·목록에서 고른 색은 그 자리 확정 undo 한 칸) · 컬러피커(끄는 내내 열림·선택 유지·실시간 미리보기·Apply/Cancel/Escape/바깥클릭·드래그 전체가 undo 한 칸·redo·**선택만 있고 가만히 둘 때 selectionchange 무한 고리가 돌지 않음**) · `[picker/native]` **기본(OS) 색상 선택기**(판정 규칙 native/custom·**직접 선택이 진짜 보이는 `<input type="color">`**여서 코드가 숨은 칸을 대신 눌러 주지 않는다(그것이 "눌러도 아무것도 열리지 않던" 원인)·열리지 않으면 watchdog이 커스텀 팝오버로 이음·씨앗 적용·조정 중 본문 노드를 다시 만들지 않음(MutationObserver 0)·문서 선택을 다시 설정하지 않음(selectionchange 0)·undo 한 칸·강조선도 선택이 사라진 뒤 이어짐. Playwright WebKit에는 `<input type="color">`도 `maxTouchPoints`도 없어 **아이폰 자동 판정과 OS 창 거동은 실기기 항목**) · `--only=picker`의 **`[picker/touch]` 절은 반드시 `--browser=webkit`으로도 돌린다**(WebKit은 터치에서 pointerdown preventDefault 뒤 click을 만들지 않아, 마우스/chromium만으로는 아이폰에서 버튼이 안 눌리는 것을 못 잡는다) · 형광펜 재적용이 중첩되지 않음 · 형광펜 높이 · 문단 강조선(문단 전체·여러 줄 한 줄기·대사 자동과 개별 해제·수동 우선·개별 색·공개 뷰어) · `--only=gap`: 강조선 거리 **두 벌**(BODY·SOURCE — **대사 자동 강조선은 BODY의 색·굵기·거리를 따른다**, 옛 dialogueRule* 값이 이기지 않음·옛 프리셋 12px 유지·0 보존·범위 자르기)과 `[numbers]` 네모 숫자 칸(직접 입력·저장 왕복·범위) + `[numbers/gone]` **DIALOGUE는 자동 적용 체크만**(색·굵기·거리 칸 없음·옛 프리셋의 그 값은 열고 저장해도 보존·원래 없던 프리셋에는 만들지 않음) · `--only=fixed`: 확대 **1~200%**(저장은 0.01~3까지 살아남아 슬라이더가 고른 값이 저장에서 깎이지 않는다)·**사진을 캔버스보다 작게 줄이기**(드러난 자리는 배경색, 덮개는 사진 위에만)·흐림이 크기를 바꾸지 않음·**이미지 크기 고정**(같은 너비의 서로 다른 높이에서 사물 크기 동일, 첫 페이지 글 길이 무관, 켤 때 현재 크기 유지, 옛 확대 값이 열기만으로 깎이지 않음) · `--only=toolbar`: **정확히 세 줄**(page break·H·P·L·clear + 오른쪽 undo·redo / FORMAT·B·I·U·S·photo·preset / INSERT·copy box·memo·divider)·**세 행의 왼쪽 시작점이 같다**·축약 라벨의 접근성 이름·`[strike]` 취소선(혼합·undo/redo·저장 왕복·옛 strike/del·뷰어·발췌) · `--only=excerpt`: 발췌 설정(강조선 색 견본 제거·본문 툴바 H/P/L는 유지·size 한 줄·크기 표시가 대지 우측 위 바깥·페이지마다 갱신·**사진 교체 후에도 프리셋 덮개/흐림 유지**·reset) · **저장되는 PNG의 실제 픽셀**(배경·강조선·형광펜 높이·**흐림은 `ctx.filter`가 없는 환경에서도 구워진다** — WebKit SKIP 없음, 미리보기 스크린샷과 번짐 폭 비교 + 픽셀 폴백이 σ만큼 흐리는지 직접 호출·**줄인 배경의 자리·크기가 화면과 일치**) · `--only=blocks`: **복사 상자·메모·구분선**(삽입/종류 변경/삭제/undo·저장 HTML에 조작 UI 없음·재편집에서 다시 붙음·**복사되는 것은 내용만**이고 백틱·연속 공백·따옴표·HTML 글자·빈 줄이 그대로·실패를 성공으로 표시하지 않음·공개 뷰어에는 복사 버튼, 발췌에는 없음·상자 안 기호가 대사/지문으로 바뀌지 않음·강조선이 상자를 감싸지 않음·페이지보다 긴 상자에서 내용 유실도 무한 분할도 없음·clear가 블록을 지우지 않음) · `--only=html`: **HTML 모드**(감싼 코드 울타리만 벗김·안쪽 백틱/따옴표 보존·짝이 안 맞거나 블록 둘이면 손대지 않음·여러 번 그려도 더 깎이지 않음·저장된 글자는 그대로·**디자인만 PNG로**(OOC·제목·사이트 UI 제외, Quote Preset이 덮어쓰지 않음)·실제 PNG를 디코드해 해상도/잘림/빈 이미지 확인·빈 입력은 이유를 알림) · 모바일 터치와 기존 제스처 · 프리셋 왕복과 옛 프리셋 기본값 |
| `posts/posts-highlight-e2e-test.mjs` | 8952 | HIGHLIGHT-1 — 글 뷰어 도구 메뉴(주인장/방문자 항목 차이·글자 크기·정식 링크·Escape·모바일 폭) · 하이라이팅(범위 선택 → 색 → 저장, 같은 범위 재선택은 색만, 부분 겹침 거절, 떨어진 범위는 별개, 완료 후 표시 유지, **새로고침 후 유지**, 본문 글자 불변) · 메모(말풍선 자리·팝업·저장·읽기 상태에서 읽기·방문자에게 편집 도구 없음) · 메모 카테고리(최신순·메모 있는 카드만 메모 영역·원본 제목/카테고리·카드 ⋮·**메모 삭제와 하이라이트 삭제의 차이**·폴더별 보기·모바일 가로 넘침) · `--only=entry`: **메모 화면 기본 진입점**(스킨이 메모 링크를 안 그렸을 때만 플랫폼 칩·SPA 라우터로 이동·메모 화면에서는 사라짐·Settings에서 끄면 없음·스킨이 그렸으면 중복 없음·모바일 넘침) · `--only=state`: **원문 위치 확인 3상태**(확인 전/찾음/못 찾음, 글을 열면 기록·본문을 고치면 확인 전으로 되돌아감·`posts.updated_at` 권한 없는 배포에서도 목록은 나옴)와 **조회 실패 처리**(방문자에게 DB 오류 없음·주인장에게 "지금은 쓸 수 없다"+다시 시도·재시도로 모드가 열림) · `--only=protect`: 비밀글 발췌문이 방문자의 DOM에도 응답에도 없고 같은 순간 주인장에게는 보인다 · **정상 해제한 방문자는 그 발췌문·메모를 읽는다**(오답이면 아무것도 오지 않는다) · `--only=break`: **발췌문의 줄바꿈**(두 문단에 걸쳐 고르면 저장·팝업·카드에 빈 줄이 남는다 · 줄바꿈 이전에 저장된 옛 발췌문도 그대로 찾아 칠한다)과 **읽는 모습**(메모 말풍선이 누른 줄이 아니라 하이라이트 덩어리 **전체** 위에 서고 꼬랑지·반투명 판 · 하이라이트에 점선 없음·각진 모서리 · 팝업/textarea/취소/SAVE가 알약이 아닌 radius 토큰 · 토스트가 아이모리 핑크) · `--only=legacy`: **옛 주소 `/memos`와 새 주소 `/highlights`**가 같은 카드 목록을 열고 화면이 한 번만 그려지며, 그 안에서 새로 만드는 링크는 정규 주소다 |
| `studio/studio-highlight-preview-e2e-test.mjs` | 8953 | Studio Preview 하이라이트 카드 도구 — 실제 `preview-frame.html`을 iframe에 띄워 `preview:render`를 보낸다. 카드 ⋮ 가 열리고(메모 있음/없음 메뉴 차이) 메모 팝업이 공개 화면과 같은 외형으로 뜨는가 · **미리보기 조작이 저장되지 않는가**(supabase로 나간 요청 0건으로 판정) · 주인장/방문자 칩 전환에 따라 ⋮ 가 나타나고 사라지는가 · 하이라이트 화면이 아닐 때는 칩 없이 기본 진입점만 나오는가 · **옛 이름 스킨**(`memos.cards` + `memo-tools`)에서도 카드와 ⋮ 가 그대로 나오는가 |
| `skin/skin-bottom-dock-e2e-test.mjs` | 8962 | **BOTTOM-DOCK-1 화면 아래 dock** — 진짜 `index.html` 로 연다(supabase 만 mock). 설정대로 항목이 그려지고 주소는 플랫폼이 만든 것 · `auto` 가 실측으로 정해지고(짧은 HOME→fixed, 스크롤 있는 CATEGORY→sticky) 명시 설정이 그것을 이김 · fixed 면 콘텐츠 아래에 dock 높이만큼 여백 · 접기(트리거는 항상 남고, 화면을 옮겨도 접은 상태 유지, 새로고침하면 기본값) · `open` 패널 토글 · navigate 가 기존 SPA 라우터를 탐 · **어느 화면에서도 dock 은 문서 전체에 하나**(HOME↔CATEGORY↔POST·뒤로가기·직접 접속·새로고침) · 주인장 전용 항목이 방문자 DOM/응답에 없음 · 스킨이 그린 `templates.dock` 과 `bottom-dock` region · 390px 넘침 0 과 44px 터치 영역 · **dock 없는 스킨 회귀** · `--only=visual`: 고른 표시(아이모리 아이콘 · 이모지 · 글자 · 이미지)를 **스킨이 그리지 않은 자리만** 플랫폼이 채운다(스킨이 `[data-kind]::before` 로 그렸으면 손대지 않음 · 글자만 받는 트리거도 빈 버튼이 아님) · `--only=studioflow`: **실제 Studio(시나리오 y)에서 빈 항목 추가 → 표시 방식 변경 → 값 입력 → 적용 → Save 한 content 그대로** 진짜 `index.html` 을 데스크톱/390px 로 연다(접힌 채 열기 버튼 하나 → 펼침 → 접힘 → 항목 클릭으로 지정한 카테고리 → 새 화면·직접 접속도 접힘 · 펼친 항목 위에 하이라이트 칩이 겹치지 않음). `IMORY_DOCK_SHOT=<디렉터리>` 를 주면 스크린샷을 남긴다. 단위 테스트는 `node skin/skin-bottom-dock-test.mjs`(정규화가 무엇을 거부하는가 · Context 조립 · template 선택 · **아이콘 목록 ↔ `skin-dock-icons.css` 양방향 대조**, 브라우저 없이) |
| `studio/dock/studio-dock-panel-e2e-test.mjs` | 8963 | **Studio Dock 설정 패널** — 기본 구성 채우기 · **자리/처음 상태/전환 칸과 개발자용 낱말(position·token·SVG·표식 …)이 없다** · 적용하면 **fixed + collapsed**(전환은 보존) · Preview 는 열기 버튼 하나이고 **누르면 실제로 펼쳐진다** · 표시 방식 넷 · **아이콘은 그림 고르기(토큰 글자 없음)** · **placeholder 는 값이 아니고 더 옅다** · 방식별 안내 문구가 **그 항목 바로 아래**(내부 경로 없음) · 빈 항목 추가 → 적용 전에 안내 · 옛 asset/svg/스킨 고유 아이콘/패널 열기 보존 · 항목 추가·삭제·↑↓ 순서 · **취소는 draft 불변** · 사용 안 함/지우기 · 펼친 Preview 항목을 누르면 패널이 열림 · Export→Import 왕복 · 390px. `--browser=webkit` 도 돈다 |
| `skin/skin-layout-e2e-test.mjs` | 8964 | **LAYOUT-1 배치 primitive 의 실제 좌표** — 실제 `renderSkin()` 이 그린 화면을 `getBoundingClientRect()` 로 잰다(class 가 붙었는지가 아니라 **어디에 그려졌는지**). stack(세로/가로·간격·순서) · grid(열 수·span·간격·min auto-fit) · **free(비율 좌표 · x=1 이 오른쪽 끝에 안쪽으로 붙음 · 1100/700/390px 세 폭에서 컨테이너를 못 벗어남)** · sidebar(왼쪽/오른쪽·폭·본문 자식이 여럿일 때) · panel(최대 폭·담기만) · **중첩**(panel>sidebar>(stack\|grid), panel>free>stack) · **반복 clone 도 자기 칸 값을 받는다** · 390px(열 감소·span 은 한 줄 통째로·사이드바가 본문 위로 접힘·**가로 넘침 0**) · 저장 경계(범위 밖 값은 속성만 사라지고 요소는 남는다) · **legacy 회귀(배치 속성이 없으면 `style` 속성조차 생기지 않는다)**. 단위 테스트는 `node skin/skin-layout-test.mjs`(값 규칙·정규화·컴파일·감사 + **컴파일러가 쓰는 custom property 와 스타일시트가 읽는 `var()` 를 두 파일을 실제로 읽어 양방향 대조** + AI 프롬프트가 같은 계약을 말하는가, 브라우저 없이). 손으로 보려면 `skin/skin-layout-render-harness.html` |
| `studio/studio-layout-e2e-test.mjs` | 8965 | **LAYOUT-1 Studio 직접 편집**(`?scenario=lay`) — working draft 의 속성과 Preview 화면이 **언제나 함께** 맞는가. 배치 폼이 나오는 자리(자식 있는 컨테이너)와 안 나오는 자리(텍스트) · 배치 방식 고르기와 **종류를 바꿀 때 이전 종류 전용 파라미터가 걷힘** · 열 수는 **고른 컨테이너만**(요구사항 12절) · 범위 밖 거부 · 격자 자식의 칸(span) · **형제 순서 ↑↓**(HTML 순서가 바뀌고 간격은 유지) · **자유 배치 이동 손잡이 드래그**(포인터와 1:1 기어비 · 상한에서 멈춤 · 한 번의 드래그가 Undo 한 칸 · 숫자 칸은 % 로 보여주고 비율로 저장) · 사이드바 영역 슬롯과 side 뒤집기 · Undo · **저장 payload 에 배치 속성이 실리고 `style` 은 없다** · **저장한 자리가 다시 열어도 그대로**(저장된 content 를 addInitScript 로 심어 문서를 새로 연다) · 390px Studio 창 |
| `skin/skin-transition-e2e-test.mjs` | 8966 | **TRANSITION-1 전환 primitive** — 실제 `renderSkin()` 이 그린 요소를 애니메이션 **t=0 에 멈춰 세워** 잰다. `[types]` 여섯 종류 × 네 방향의 나타날 때 자세(opacity · 12px 이동 방향 · 92% 확대와 고정 가장자리)와 끝난 뒤 제자리 · **free 배치 transform 과 공존** · `[showhide]` 패널(닫힌 채 시작 · 열기/닫기 · **닫히는 중에도 클릭을 가로채지 않는다** · 키보드 · 링크 토글이 페이지를 옮기지 않음 · 일반 show/hide API) · `[rapid]` 7~11번 연속 클릭에서 **마지막 요청이 최종 상태** · 방향이 바뀔 때 튀지 않음 · 남는 애니메이션 0 · `[reduced]` prefers-reduced-motion 이면 재생도 대기도 없음 · `[mobile]` 390/320px 좌우 슬라이드 중 가로 넘침 0(**대조군: clip 을 떼면 넘친다**) · `[sanitize]` 속도 자르기와 버리기 · `[legacy]` 전환 없는 스킨은 속성/애니메이션 0 · 진짜 `index.html` 로 `[routes]` HOME→CATEGORY→POST→뒤로→HOME(HOME 은 **복귀 때만** 재생)·직접 접속 · `[dock]` dock 접기/펴기가 같은 primitive(bottomDock 의 속도) · 연속 토글 · 사라지는 항목이 클릭을 안 받음 · dock 패널 · none · 옛 문자열 설정 · `[routes-reduced]` · `[routes-mobile]`. **`--browser=webkit` 도 돌린다.** 단위 테스트는 `node skin/skin-transition-test.mjs`(값 규칙 · 24 조합 자세 · **CSS↔JS 이름 양방향 대조** · 서버 값 목록 대조 · 프롬프트 · dock 정규화 · 진입 문서와 sandbox allowlist · 예시 스킨) |
| `studio/studio-transition-e2e-test.mjs` | 8967 | **TRANSITION-1 Studio 직접 편집**(`?scenario=lay`) — 전환 폼이 나오는 자리와 칸 · 효과를 고르면 속성이 적히고 **Preview 는 편집 재렌더에서 appear 를 다시 돌리지 않고 확정 뒤 한 번만 재생** · 속도/방향/움직임 · fade 로 바꾸면 방향이 걷힘 · **고른 요소만** · ▶ 미리 보기 · "없음"은 속성 넷을 전부 걷음 · Undo · 저장 payload 에 런타임 흔적 없음 · **Dock 패널의 전환 네 칸 → working draft 의 `bottomDock.transition` 객체** · 390px |
| `studio/studio-shell-e2e-test.mjs` | 8968 | **STUDIO-SHELL-1 Studio 화면 구조**(`?scenario=y`) — `toolbar`: 세 그룹의 구성 · Publish 만 primary · Import|Export 가 붙은 한 덩어리 · id 마다 요소 하나 · 가운데 그룹이 바 정중앙 · 현재 페이지 표시가 Preview 이동을 따라감 · Code/Import/Export 가 새 자리에서 동작 · Desktop/Mobile · `panels`: Select/Images/Dock 이 **같은 왼쪽 패널**(modal 아님)이고 stage 가 패널만큼 비킴 · **Images·Dock 을 다녀와도 고른 요소 그대로** · Dock 의 적용 안 한 사본이 다른 내용·Escape 를 지나도 남음 · 취소는 draft 불변 · 왼쪽+AI 동시에 열면 stage 가 둘 사이이고 Mobile Preview 가 가운데 · 하나씩 접을 때마다 다시 가운데 · 접힌 채 Select = 다시 열기, 보여 주는 중 Select = 모드 끄기 · `inspect`: 팝오버가 패널 안이고 프레임과 겹치지 않음 · Preview 위에는 테두리·**이름표**·핸들만 · 접힌 채 새 요소를 고르면 Select 로 열림 · `history`: 직접 편집/Dock 적용을 Undo·Redo(dirty 복원 · 선택 유지 · Save 뒤 Undo 는 dirty) · `units`(STUDIO-SHELL-1.1): **Inspector·AI 패널에 되돌리기 버튼이 없다** · tooltip/aria · 작업마다 **정확히 한 칸**(텍스트 · 이미지 모서리 드래그 · 이미지 교체 · Dock · Code · AI · Import · 자유 배치 이동 드래그 — 드래그는 pointermove 16번이어도 한 칸)이고 ↶ = 직전 / ↷ = 직후 draft 가 글자 단위로 같다 · **↷ 는 AI 를 다시 부르지 않는다** · 편집기 textarea 안의 단축키는 가로채지 않는다 · 새 작업이 ↷ 기록을 비운다 · **Save/Publish 뒤 ↶ 는 RPC 0 + dirty**, 다시 Save 해야 저장 · `toolbar` A6b: 현재 페이지 HOME/CATEGORY/POST 표시가 드롭다운이 아니다 · 단축키는 입력칸에서 가로채지 않음 · `narrow`: 390px 가로 넘침 0 · 첫 줄 Select/Images/Dock/Save/Publish/··· · ··· 메뉴(Code/Import/Export, Escape·바깥·Preview 누르기로 닫힘) · 왼쪽 패널은 아래 시트 · AI 와 번갈아 열림. `--browser=webkit` 도 돈다 |
| `studio/studio-mobile-sheet-e2e-test.mjs` | 8972 | **MOBILE-SHEET-1 모바일 편집 시트 세 단계**(`?scenario=dux`, 390px, Preview 안은 진짜 포인터) — `states`: Select 로 고르면 접힘(68px) · 버튼으로 접힘 ↔ 내용(≤55%) ↔ 전체(상단 바와 여닫기 탭 아래) · aria-expanded · 스크린리더 문구 · Escape 사다리(전체 → 내용 → 접힘 → 선택 해제, Preview 안 Escape 도) · 손잡이 드래그(12px 흔들림은 그대로 · 끄는 동안 그 높이 · 위/아래로 한 단계 · 가장 가까운 단계 · 접힘에서 아래로 = 닫힘 · 톡 = 접힘 ↔ 내용) · touch-action 은 손잡이만 · 기록/dirty 불변 · `preview`: **짧은 페이지(100vh) 맨 아래 글을 시트를 닫지 않고 스크롤해 고른다**(Preview 문서 끝의 Studio 전용 여유 `<imory-studio-spacer>` · scroll-padding-bottom · 스킨 루트/body 에 style 0) · 펼치면 **가려진 만큼만** 스크롤(시트 위 12px) · 문서 좌표 · draft · 기록 불변 · 접어도/닫아도 튀지 않음 · 긴 페이지 위쪽 요소는 스크롤 0 · Mobile Preview 축소 배율 · `panels`: Select 입력 값 · Images 목록 스크롤 · Dock 적용 안 한 값 유지 · Images/Dock 은 내용 보기 · Quick Bar 이미지 변경 → 붙이면 Select 접힘 · Dock 적용 뒤 시트 유지 · AI 를 열면 숨고 닫으면 같은 단계 · `quickbar`: 머리 한 줄 · 40×44 · 넘치면 `···`(같은 버튼을 옮김) · 목록 Escape · `keyboard`: visualViewport 흉내 — 시트 아래 끝이 키보드 위 · 적용 버튼 보임 · 전체 화면도 키보드 위 · 입력칸 Escape · Preview 글자 편집 중 잠시 접힘 · `desktop`: 1280px 왼쪽 패널 · Quick Bar · Escape 가 예전 그대로. `--browser=webkit` 도 돈다. `IMORY_SHEET_SHOT=<디렉터리>` 로 스크린샷 |
| `studio/studio-direct-ux-e2e-test.mjs` | 8969 | **DIRECT-UX-1 클릭하고 바로 고치는 Select**(`?scenario=dux`, Preview 안은 **진짜 포인터** — 새 선택 규칙은 좌표를 본다) — `priority`: 투명 덮개 밑의 글자가 래퍼보다 먼저 · 합성 클릭은 예전 규칙(대조군) · 래퍼/배경 여백 = 선택 해제 · 격자 빈틈 = 격자 · 바깥 영역 선택이 한 칸씩(맨 바깥에서 버튼 없음) · hover 이름표·손가락 커서 · `names`: 홈 이름·프로필 이미지·카테고리 메뉴·최근 글 목록·글 카드·배경이 패널·이름표·AI chip 에 같은 문자열 · 태그/클래스/경로/식별자 미노출 · `overlap`: 겹친 자리의 "무엇을 선택할까요?"(바깥 영역은 맨 아래 · 고르면 그 요소 · Esc/바깥 클릭 · 한 사슬이면 메뉴 없음) · `text`: 더블클릭 편집(입력 중 기록 0 · Ctrl/⌘+Enter 한 칸 · Escape 취소·선택 유지 · 포커스 잃으면 적용 · ↶↷ 글자 단위 · 링크 이동 0 · 바인딩 글자는 안 열림) · `image`: Quick Bar 이미지 변경 → 그 슬롯을 고른 Images 패널 · 한 칸 · HTML 불변 · `move`: 자유 배치 본체 끌기(끄는 중 Preview 가 따라옴 · 기록 0 → 놓으면 한 칸 · 4px 문턱) · `quickbar`: 겹침 순서/형제 순서 · 숨기기(Select 중 흐리게, 끄면 사라짐)/보이기 · AI로 수정(전송 0) · 빠른 제안은 입력만 · `fields`: 종류별 항목만 · 배치/전환 상세 칸 없음 · 움직임 효과 상태 줄 · `preserve`: **격자+효과 요소의 글자색만 → Save → 새로 열기 → Preview 에 격자·효과 그대로** · AI→글자 · Code→이미지 · Import→이동 · 효과 요소의 내용 · Desktop→Mobile · `status`: 저장·공개 상태 문구(실패 포함) · `coach`: 세 걸음 · 막지 않음 · 다시 보기 · `narrow`: 390px 넘침 0 · Quick Bar 는 시트 안 · 겹친 요소 메뉴는 아래 시트 · 이름표 화면 안 · 끌기/더블클릭 |
| `skin/skin-material-parity-e2e-test.mjs` | 8956 | Skin/Studio/Public **재료 일치** — 같은 SkinPackage + 같은 행을 공개 화면과 Studio Preview(`?scenario=k`)에 주고 비교한다. `sidebar`(사용자가 이름 붙인 HIGHLIGHT 카테고리까지 메뉴 항목·이름·종류·href가 두 화면에서 동일) · `icons`(`item.iconKind` → `data-kind`, 순서를 뒤집어도 종류 유지, CSS가 종류별로 실제로 다르게 그림, glyph 없음) · `roots`(폴더 3개 + 루트 글 `Prompt`에서 페이지네이션 ON/OFF 모두 루트 글이 정확히 한 번, `category.posts`를 안 그리는 스킨에서는 페이지 나누기를 켜지 않아 글이 사라지지 않음) · `highlights`(실제 카드 · `--imory-color` 강조선 · `TXT > 2002 > 1` · Studio에서 메뉴 링크로 진입 · 390px 넘침 0) · `homehighlight`(**HOME의 발췌 카드** `home.highlights` — 공개/Studio가 같은 카드, `featured`로 한 장만, 강조선이 그 하이라이트 색, HOME에는 `highlight-tools` 슬롯 없음, 0건이면 공개는 접히고 Studio는 샘플, 390px 넘침 0) · `legacy`(`templates.memos`/`navigation.memos`/`memo-tools` 회귀) · `audit`(실제 Import 검증이 돌려주는 경고 — supports만 선언·category.posts 없는 페이지네이션·nth-child 아이콘·Studio 전용 샘플 문구, 전부 거부가 아니라 경고) |
| `studio/studio-file-ux-e2e-test.mjs` | 8943 | Skin Studio 파일 UX — Export(.json 다운로드·allowlist 필드·DB 키 제외) → 파일 선택/drag&drop Import 왕복 구조 동일·붙여넣기 Import 회귀·Save 회귀·legacy HOME-only draft 안내 (이미지 슬롯 drag&drop은 `studio/images/skin-image-library-e2e-test.mjs` 8935의 `[drop]` 절) |
| `studio/studio-import-css-image-e2e-test.mjs` | 8973 | **IMPORT-CSS-IMAGE-1** — `css`: 첨부 스킨 FOREVER, MY FOE 의 실제 원인(129행 11열 닫히지 않은 문자열 → 그 선언만 제외 + 수정 예) · **브라우저 CSSOM 이 원문과 잘라낸 CSS 에서 같은 규칙을 읽는다**(275개 글자 단위) · 현대 CSS 통과 · 줄/열 · 선언만 제외 · 중괄호/괄호 차단 · `@import`/`javascript:`/`expression()` 차단(렌더는 제외) · data:/http:(custom property·image-set 포함) 선언 제외 · 보호 선택자 둘 제거 뒤 목록 재작성 · 렌더 경로도 같은 판정 · `import`: Import 창 Validate(목록에 줄·열·수정 방법)→Apply(=Validate 결과)→Preview 에 FOE 디자인→Export→재Import 동일 · `errors`: 중괄호/`@import`/오류 여러 개(첫 오류+개수)·Apply 잠김 · `code`: Code 적용이 같은 파이프라인(차단이면 모달 유지+위치, 선언 하나면 빼고 적용+toast, HTML 의 `images.extraArt` → `extra_art` 슬롯 선언) · `slots`: 선언 누락 복구·중복 병합·DB 이름 규칙·기존 슬롯 보존·첨부 자리표시자(독립 Import = 빈 슬롯 안내)·아이콘/data: 는 슬롯 아님·Images 패널 · `ai`: 첨부 한 장 → 업로드 한 번 → `hero_photo`(label=alt·필수·3:4) 선언+연결 → **Preview 에 실제 디코드**·object-fit/position 유지 → Images 패널 표시·변경 → ↶ 한 칸에 스킨+슬롯+연결 → Export→Import 뒤 연결 유지 · 두 장 순서 · 업로드 실패 = 빈 슬롯+안내 · 넣으라 하지 않으면 업로드 0 |
| `skin/sandbox/skin-sandbox-e2e-test.mjs` | 8957 + 8958 | SANDBOX-0 origin 격리 + SANDBOX-1 HOME 렌더 + SANDBOX-2 CATEGORY/POST·이동 — **두 개의 실제 origin**(포트로 가름)을 띄우고 둘 다 배포되는 그 `functions/_middleware.js`에 통과시킨다. 메인 origin의 `/skin/sandbox/frame.html`이 404 · sandbox origin에서 앱/supabase client가 안 나옴 · 예상 못 한 Host 거부 · 실제 CSP 헤더 전문과 요청마다 바뀌는 nonce · 기능 플래그 OFF면 iframe이 0개 · `IMORY_FRAME_READY`→`IMORY_FRAME_ACK` 왕복 · 위조 origin/다른 source/알 수 없는 type/모르는 payload 키 거부 · 프레임에서 parent DOM·parent localStorage·fetch가 막힘 · 390px 넘침 0 · 메인 origin 회귀 · `--only=render`: **HOME 한 장이 프레임에서 실제로 그려지는가** (READY→ACK→RENDER_HOME→RENDERED · 제목/프로필/카테고리/최근 글/발췌 카드 · 스킨 CSS 적용 · `data-imory-kind`→CSS · `data-imory-color`→CSS 변수 · **native 렌더와 outerHTML 이 글자 단위로 같고 폭도 같다** · 스킨 style 요소만 nonce 를 받고 **native 렌더는 안 받는다** · 링크는 눌러도 아무 일 없음) · `--only=payload`: **wire 위의 data** — 프레임 realm 에서 실제로 도착한 값을 읽어 토큰·UUID·이메일·비밀글 본문·DB row 키·관리자 링크가 하나도 없고 최상위 키가 계약 그대로인가 · `--only=height`: iframe 높이가 콘텐츠를 따라가고(짧은/긴/390px) 프레임 안에 스크롤이 없으며 **진동하지 않는가** · `--only=fallback`: renderMode 없음 / frame origin 없음 / READY timeout 세 경우에 **iframe 을 치우고 native 로** 가는가(재시도 없음) · `--only=package`: `renderMode` 의 Import→Export→Import 왕복과 모르는 값의 `reason:"render-mode"` 거부(`skin/sandbox/skin-sandbox-package-test.html`) · `--only=home`: **하네스가 아니라 진짜 `index.html`** 로 공개 HOME 경로를 탄다(supabase 만 mock) — renderMode 없음/플래그 OFF 는 같은 문서에 그대로 그려지고(배포에 코드가 있어도 공개 화면이 안 바뀐다), sandbox 는 `#themeMount` 안 cross-origin iframe 하나에 **중복 렌더 없이** 뜨며, 프레임이 안 뜨면 **같은 스킨을 native 로** 그린다(백지 아님). · `--only=pages`: **CATEGORY/POST 도 프레임에서 그려진다**(카테고리 이름·글 목록·비밀글은 자물쇠 제목만 · 글 제목 + **본문은 Context 가 아니라 `IMORY_POST_BODY` 로 따로 온다** · **비밀글 POST 는 글 자리에 프레임을 만들지 않고 native 로 폴백**하며 그때 비밀 본문이 문서 어디에도 없다 · renderMode 없는 스킨의 CATEGORY/POST 회귀) · `--only=surfaces`: **GALLERY/BANNER/HIGHLIGHTS 도 프레임에서 그려진다**(화면마다 그 화면의 프레임 1개 · HOME 과 같은 스킨 CSS 가 프레임에 적용 · 그 화면의 namespace 만 도착(`highlights === memos`) · 하이라이트 카테고리 주소가 `/highlights` 로 정리 · 직접 접속/새로고침/뒤로가기에 프레임이 쌓이지 않음 · 390px 부모·프레임 양쪽 넘침 0 · `renderMode` 없는 같은 스킨의 native 회귀 · `templates.banner`/`templates.highlights` 가 없으면 프레임이 아니라 legacy 배너 / 플랫폼 기본 template 이고 **카드는 그대로 보인다**. 프레임 안 하이라이트는 주인장에게도 읽기 전용이다 — 카드 ⋮ 는 §K-6 의 알려진 차이) · `--only=nav`: **프레임 안 링크가 실제로 눌린다**(HOME→CATEGORY→POST→카테고리 복귀, 주소도 함께 바뀜 · 뒤로가기/앞으로가기 · 직접 접속/새로고침 · 모바일 390px · **문서 전체에 프레임 하나**(SANDBOX-5B 이후 — 그 전에는 컨테이너별로만 셌다) · **위조 거부**: 표에 없는 navId·href 를 끼운 payload·옛 renderSeq·contract 불일치·봉투 위조·모르는 type·부모 자신이 쏜 메시지) · `--only=bodyparity`: **같은 글이 native 와 프레임에서 같은 모양인가** — 같은 스킨을 renderMode 만 바꿔 두 번 열고 컨테이너·형광펜(여백·`box-decoration-break`)·강조선 마커(`display:none`)·강조선 상자·포인트 색·문단 간격·복사 상자·구분선의 **계산 스타일**과 DOM 구조를 견준다. 프리셋에서 오는 인라인 선언(§M)만이 아니라 **class 규칙**(`posts/posts-body-shared.css` · `posts-body-blocks.css`)까지 프레임에 도착하는지, 그리고 읽는 이의 하이라이트 표시는 여전히 native 에만 덧칠된다는 **알려진 차이**를 숫자로 못박는다. · `--only=authorjs`: **SANDBOX-5A 저자 JS** — 프레임 안에서 **정확히 한 번** 돌고(script 요소도 한 개) 클릭으로 패널이 열리고 파티클이 rAF 로 움직이고 카드가 끌려오는가 · 타이머가 한 벌인가 · **저자 JS 전용 opt-in 이 없으면 0회**(화면은 그대로) · native 스킨은 프레임도 JS 도 0 · 문법/런타임 오류가 HTML/CSS 렌더를 깨지 않는다 · **탈출 시도**(parent.document · parent.localStorage · top.location · window.open · form 제출 · fetch/XHR/WebSocket/EventSource/sendBeacon · 외부 script · 위조 postMessage · 관리자 주소 navigate)가 전부 막히고 **example.com 으로 나간 요청이 0건** · 390px 넘침 0 · **nonce 는 전역으로 남지 않지만 실행 중인 저자 JS 가 자기 script 의 nonce 를 읽는다는 사실도 그대로 기록한다**(허가 표식이지 보안 경계가 아니다 — 설계 문서 §O-3) · `--only=authorjspages`: 공개 다섯 화면(HOME·CATEGORY·GALLERY·POST·BANNER·HIGHLIGHTS)에서 한 번씩 돌고, 화면을 오가고 뒤로가기해도 **타이머가 쌓이지 않으며**(realm 을 버린다) `imorySkin.navigate()` 가 실제로 화면과 주소를 옮긴다. · `--only=screens`: **SANDBOX-5B 화면 전환 수명** — 어떤 공개 route 에서도 **문서 전체**에 지금 화면의 sandbox 프레임이 정확히 1개인가(비밀글처럼 native 로 가는 화면은 0개). HOME→CATEGORY→POST→HOME · BANNER/HIGHLIGHTS/GALLERY 왕복 · 뒤로/앞으로 20회 · 직접 접속과 새로고침(늦게 도착하는 `initHomeRenderer()` 의 HOME 렌더가 프레임을 하나 더 만들지 않는가) · 390px · native 회귀. 옛 프레임이 **가려진 것이 아니라 없어졌는가**를 세 가지로 잰다 — iframe 요소 수 · 브라우저의 frame tree · 프레임 origin 저장소에 realm 마다 적히는 박동표(키 개수 = 지금 돌고 있는 realm 수)와 `pagehide` cleanup 기록(fixture `skin/test-skins/imory-sandbox-screens-v1.json`) · `--only=transition`: **TRANSITION-1 전환 primitive 가 프레임 안에서도 돈다**(appear 스타일시트 도착 · CSSOM 값 · 가로 자르기 · 패널이 닫힌 채 시작 · **저자 JS 없이** 토글이 열고 닫음 · 390px 넘침 0, fixture `skin/test-skins/imory-sandbox-transition-v1.json`). 단위 테스트는 `node skin/sandbox/skin-sandbox-unit-test.mjs` (플래그·메시지 검증·호스트 분기·CSP·**renderMode 판정**·**payload allowlist**·**저자 JS 관문과 kill switch**·**`js` 보존**·**`imorySkin` API 모양**·**이동 판정**(javascript:/data:/blob:/외부 origin/protocol-relative/다른 블로그/`/admin`·`/auth`·`/invite`/관리 쿼리/traversal 거부)·**navId 표**·**SANDBOX-6A Inspector 메시지**(식별자/태그/사각형 형태·모르는 키·방향·오류 코드·세 파일의 식별자 정규식 일치), 브라우저 없이) |

| `studio/studio-sandbox-preview-e2e-test.mjs` | 8959 + 8960 | SANDBOX-4 Skin Studio Preview 통합 — **두 개의 실제 origin**(Studio 8959 / frame 8960)을 띄우고 둘 다 배포되는 그 `functions/_middleware.js` 에 통과시킨다. `renderMode:"sandbox"` 스킨의 Studio Preview 에 cross-origin iframe 이 **정확히 1개**(별도 origin · 공개 화면과 같은 sandbox 속성 · Preview 문서에 중복 렌더 0 · Select 잠김) · `--only=edit`: **Save 하지 않은 HTML/CSS 수정이 즉시 반영되고 iframe 을 다시 만들지 않는다** · `--only=pages`: HOME/CATEGORY/GALLERY/POST/BANNER/HIGHLIGHTS 를 오가도 프레임은 하나이고 본문은 `preview:post-body` 로 프레임 안 region 에 들어간다 · `--only=nav`: **프레임 안 링크가 실제 공개 페이지로 나가지 않고** 미리보기 페이지만 바꾼다(Studio 주소 불변 · Preview Back) · `--only=native`: renderMode 없는 스킨은 iframe 0개(회귀), 플래그 OFF 면 sandbox 스킨도 native · `--only=parity`: 프레임에 도착한 payload 최상위 키가 공개 계약 그대로이고 **비밀글 본문·토큰이 하나도 없다** · `--only=mobile`: 390px 부모·프레임 양쪽 넘침 0 · `--only=bodyparity`: **Studio Preview 의 native 와 프레임이 같은 본문**(글꼴·크기·색·행간·자간·정렬·줄바꿈·형광펜에 더해 **형광펜 좌우 여백**과 **줄바꿈 처리**, **강조선 마커 숨김**, **강조선 굵기·색** — class 규칙이 프레임까지 오는가) · `--only=reject`: 깨진 `preview:render` · 알 수 없는 type · 옛 `renderSeq` 렌더 거부 · `--only=authorjs`: **SANDBOX-5A 저자 JS** — Studio 미리보기의 프레임 안에서 한 번 돌고 Studio 문서에서는 돌지 않는가 · **Code Editor 의 JS 칸을 고치면 Save 전에 곧바로 다시 돌고**(새 realm 이라 실행 횟수가 다시 1, 타이머도 한 벌, 프레임은 여전히 1개) · 전용 opt-in 이 없으면 0회 · sandbox 가 아닌 스킨에서는 "이 JS 는 sandbox 모드에서만 실행된다" 안내가 나온다 · `--only=inspect`: **SANDBOX-6A Select(Element Inspector)** — 프레임 안에서 hover/선택이 되고 그것이 Studio 의 선택 상태가 되는가(테두리는 **프레임 안**에만 하나, Studio 는 팝오버만) · 종류별(텍스트·이미지·카드·링크·카드 안 글자)과 화면별(HOME·CATEGORY·POST·BANNER·HIGHLIGHTS) · **반복 항목은 반복 template 하나로 매핑**(세 번째를 눌러도 같은 editId) · post-body 안쪽은 못 고른다 · Inspect 중에는 링크도 저자 JS 도 실행되지 않고 **끄면 다시 눌린다**(저자 JS 는 다시 돌지 않는다) · **위조 거부**(지금 template 에 없는 식별자 · 옛 renderSeq · 모르는 payload 키/type) · 선택 요소 AI 가 **그 범위만** 고치고 Save 전에 프레임에 반영 · 재렌더 뒤 복원, 자리가 없어지면 조용한 해제 · overlay 가 iframe 높이도 가로 폭도 바꾸지 않는다 · Mobile 모드 + 터치(tap) · native 회귀(테두리는 Studio 가, 직접 수정은 안 잠긴다) · `--only=slots`: **IMPORT-CSS-IMAGE-1 자동 슬롯**(Code 적용의 `images.heroPhoto` → 공용 파이프라인이 `hero_photo` 선언 → 연결한 이미지가 native 와 프레임에서 같은 주소·크기·object-fit/position) |
| `studio/studio-sandbox-select-parity-e2e-test.mjs` | 8970 + 8971 | **SANDBOX-SELECT-PARITY-1 sandbox 스킨의 Select = 일반 Preview** — DIRECT-UX-1 의 `dux` fixture 에 `renderMode:"sandbox"` 만 더해 두 실제 origin 으로 연다(프레임 안 클릭은 **진짜 포인터**). `priority`(덮개 밑 글자 · 합성은 예전 규칙 대조 · 래퍼 빈 곳 해제 · 격자 빈틈 · 바깥 영역 사슬 · hover 이름표/커서) · `names`(**같은 요소의 이름이 native 와 글자 단위로 같다** · AI chip/selectionContext · 코드 이름 미노출) · `overlap`(Studio 의 겹친 메뉴 · 프레임 안에는 메뉴 0) · `text`(더블클릭 · 입력 중 기록 0 · Ctrl/⌘+Enter 한 칸 · Esc · blur · ↶↷ · 링크 이동 0 · 바인딩 안 열림 · 패널 칸 임시 미리보기) · `image`(이미지 변경 → 슬롯 · 크기/자르기 칸 없음과 이유) · `quickbar` · `move`(본체 끌기) · `restore`(패널/Undo/Redo/Save/AI/Code/이미지 뒤 같은 요소 · 지운 요소는 해제) · `preserve`(격자+효과 요소의 글자색만 → Undo/Redo → Save → 다시 열어 Select 없는 렌더) · `zoom`(Mobile 축소 좌표 · **스크롤 뒤 이름표**) · `narrow`(390px 시트) · `forge`(지어낸 후보/글자/지시 · 다른 origin) · `sheet`(MOBILE-SHEET-1 — 390px 에서 접힘 · 바깥 Preview 문서의 여유 · 펼치면 바깥 문서만 최소 스크롤 · 안쪽 프레임은 스크롤 0). `--browser=webkit` 도 돈다 |

| `posts/style/posts-body-style-extract-test.mjs` | — | **sandbox 프레임으로 나가는 본문 서식의 allowlist** — 프레임 CSP 에는 `style-src 'unsafe-inline'` 이 없어 본문의 inline style 이 전부 무시된다. 그래서 부모가 선언을 검증해 nonce 가 붙은 `<style>` 규칙으로 옮긴다(`posts/style/posts-body-style-extract.js`). 이 테스트는 그 **판정 규칙**을 본다 — `url()`·`image-set()`·`cross-fade()`·`element()`·`attr()`·`expression()` 거부(= CSS 로 외부 요청 불가), 선언 탈출(`;` `}`)·`@import`·`</style>`·역슬래시 이스케이프·주석 닫기·길이 상한 거부, 본문이 실제로 쓰는 속성 스물하나는 통과, `position`/`z-index`/`transform`/단축 속성(`background`/`border`/`font`)은 목록에 없음. 브라우저 없이 `node posts/style/posts-body-style-extract-test.mjs` 로 돈다. |

| `skin/skin-public-number-e2e-test.mjs` | 8961 | **PUBLIC-NUMBER-1 공개 URL 번호** — 두 블로그(alpha/beta)에 **id 와 다른** 공개 번호를 일부러 주고(카테고리 id 7·12 → 번호 1·2, 글 id 38·31 → 번호 1·2) 실제 `index.html` 로 연다. HOME/CATEGORY 링크가 번호인가(문서 어디에도 내부 id 주소가 없다) · HOME→CATEGORY→POST 클릭과 주소 · 뒤로/앞으로가기 · 직접 접속·새로고침 · **두 블로그의 `/post/1` 이 서로 다른 글** · **없는 번호와 옛 global-id 주소가 남의 글로 넘어가지 않고 "없음"** · 폴더 주소(`/category/:번호/folder/:내부id`) · 390px |
| `supabase/public-number-migration-test.mjs` | — | **실제 Postgres(PGlite)로 migration 실행** — 공개 URL 번호(`categories.public_no` / `posts.public_no`). 사용자별 `created_at`·`id` 순 backfill(블로그마다 1부터·재실행 안전) · 카운터에서 원자적으로 발급 · **맨 끝 번호를 지워도 재사용하지 않고 앞 번호를 지워도 당겨지지 않는다** · UPDATE 로 바꿀 수 없다 · `(user_id, public_no)` UNIQUE 가 우회를 막는다 · 한 문장 50건 동시 삽입에도 번호 중복 0 · **id/FK 불변** · GRANT 는 SELECT 만이고 카운터 테이블은 anon/authenticated 권한 0 + RLS · 파일 안의 rollback 블록을 **실제로 실행**해 원상복구·재적용까지. `node supabase/public-number-migration-test.mjs` 로 돈다. |
| `supabase/highlight2-migration-test.mjs` | — | **실제 Postgres(PGlite)로 migration 실행** — `categories.type='highlight'` 허용 · singleton unique index(두 번째 생성/타입 변경 우회 거절, 사용자별 독립) · 중복 BANNER 통합(**배너 항목 손실 0**·대표 선정 결정적·상대 순서 보존·재실행 안전·글이 남아 있으면 **중단**) · `memo_folder_settings`→`highlight_folder_settings` rename(행 보존·옛 이름 view·옛 RPC wrapper) · 페이지네이션 컬럼 제약 · `change_own_category_type`(글/폴더 이동·rollback·`post_highlights` 보존) · `[contract]` 프런트 상수와 DB predicate 일치. Playwright가 아니라 `node supabase/highlight2-migration-test.mjs` 로 돈다. |
| `supabase/share-label-seq-migration-test.mjs` | — | **실제 Postgres(PGlite)로 migration 실행** — 공유 카드 자동 라벨의 번호(`posts.share_label_seq`). 기존 공개 글 backfill(컨테이너별 created_at asc · 재실행 안전) · 새 글은 공개되는 순간 max+1 · **앞 글을 지우거나 비공개로 돌려도 번호가 바뀌지 않는다**(이 컬럼의 존재 이유) · 폴더/카테고리 이동 시 그쪽 맨 끝 · 기존 folder/sort_order 트리거가 **먼저** 도는 이름 순서 · GRANT는 SELECT만. `node supabase/share-label-seq-migration-test.mjs` 로 돈다. |

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
  `admin/index.html`, `studio/index.html`, `studio/preview/preview-frame.html`.
  진입 문서 안에서는 CSS·JS·동적으로 읽는 HTML 조각까지 **전부** 같은
  `?v=`를 쓴다 — 하나라도 고정 URL로 남기면 그 문서만 "새 HTML + 새 JS +
  옛 CSS"가 된다. iframe은 독립된
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
- AI 스킨 라운드 문서는 `docs/ai-skin/`에 모여 있다 (`AI_SKIN_*.md`). 코드
  주석은 디렉터리 없이 파일명만 적고 있으니, 찾을 때는 그 폴더에서 본다.
- `docs/ai-skin/AI_SKIN_PHASE*.md`는 각 라운드의 **기록**이다. 나중 라운드가 앞
  계약을 바꿨으면 앞 문서를 다시 쓰지 말고, 바뀐 지점에 "철회/변경됨 → 어느
  문서"를 적는다.
- 문서에는 "현재 구현" / "앞으로 지켜야 할 원칙" / "남은 차이"를 구분해서 쓴다.
  아직 공통화되지 않은 것을 이미 구현된 것처럼 쓰지 않는다.
- 실제 구현된 공통 함수·파일이 있으면 정확한 이름을 적는다.
