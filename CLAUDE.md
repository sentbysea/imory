# Imory — 작업 지침

이 문서는 이 저장소에서 작업할 때의 기본 지침이다. 상세 규칙은 각 기준 문서에
있고, 여기에는 핵심 원칙과 링크만 둔다.

| 주제 | 기준 문서 |
| --- | --- |
| 스킨 표시 공간 · 화면 전환 · 소유자/관리 · Preview 일치 | [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md) |
| SkinPackage JSON shape (디자이너용) | [SKIN_DESIGNER_CONTRACT.md](./SKIN_DESIGNER_CONTRACT.md) |
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
| 글 뷰어 도구 메뉴(⋮) · 하이라이트/메모 · 메모 카테고리 · memo-tools region · **메모 진입점 칩** · **위치 확인 3상태** · **폴더 차례 끌기** | [IMORY_HIGHLIGHT1_DESIGN.md](./IMORY_HIGHLIGHT1_DESIGN.md) |
| Element Inspector · Direct Edit (식별자/patch 방식/보호 계약) | [AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md](./docs/ai-skin/AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md) |
| Selected Element AI Edit (selectionContext/선택 범위 계약) | [AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md](./docs/ai-skin/AI_SKIN_PHASE_AI6B_SELECTED_ELEMENT_AI.md) |
| AI 실패 진단 (error code / stage / 로그 규칙) | [AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md](./docs/ai-skin/AI_SKIN_PHASE_AI6B1_SELECTED_AI_DIAGNOSTICS.md) |
| 직접 편집 — 텍스트 내용 · 이미지 크기 (임시/확정 분리, 모서리 드래그) | [AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md](./docs/ai-skin/AI_SKIN_PHASE_AI6C_DIRECT_TEXT_AND_IMAGE_SIZE.md) |
| 직접 편집 — 이미지 자르기 (프레임 래퍼 · 비율/확대/구도 · 크기 조절과의 경계) | [AI_SKIN_PHASE_AI6D_IMAGE_CROP.md](./docs/ai-skin/AI_SKIN_PHASE_AI6D_IMAGE_CROP.md) |
| 프레임 좌표 (보이는 사각형) · 팝오버 자리 · 구도 이동 기어비 | [AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md](./docs/ai-skin/AI_SKIN_PHASE_AI6E_FRAME_GEOMETRY.md) |
| 자유 비율 자르기 (변·모서리 핸들) · Inspector 슬라이더 규칙 | [AI_SKIN_PHASE_AI6F_FREE_CROP_AND_SLIDERS.md](./docs/ai-skin/AI_SKIN_PHASE_AI6F_FREE_CROP_AND_SLIDERS.md) |
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
| `studio/studio-inspector-e2e-test.mjs` | 8939 | Element Inspector(Select) — hover/선택·navigation 차단·Direct Edit(텍스트/이미지/링크/컨테이너)·binding/imageSlot/POST region 보호·Save·Publish |
| `studio/studio-direct-edit-e2e-test.mjs` | 8945 | Select mode 직접 편집 — 텍스트 내용(여러 줄·IME·적용/취소·줄바꿈 유지·바인딩 안내) + 이미지 너비(슬라이더/숫자/모서리 드래그 일치·비율 유지·Undo 한 번·Desktop/Mobile·AI 패널·모바일 가로 넘침) + Save/재로드/Export→Import 유지 |
| `studio/studio-selected-ai-e2e-test.mjs` | 8940 | 선택 요소 AI 수정 — 서버 selectionContext 검증(+editId 실재 확인)·chip/선택 해제·요청 body 계약·선택 범위 적용·route 유지·Undo·참고 이미지 결합 + 반복 목록 fixture·오류 code/stage·back capability 감사 |
| `posts/posts-folder-manage-e2e-test.mjs` | 8941 | FOLDER-1 관리 트리 — 계층 렌더·체크박스/선택삭제 공존·폴더 CRUD 요청 계약·3단계 및 cycle drop 판정·모바일 터치 drag·저장 실패 롤백 |
| `skin/skin-folder-tree-e2e-test.mjs` | 8942 | Folder-aware 스킨 렌더 — published CATEGORY(소유자/방문자·모바일/데스크톱·폴더 없음·빈 카테고리·카드 안 글 → POST) + Studio Preview(`?scenario=t`) 동일 구조 + `category.posts` 스킨 5종 회귀(폴더 유무에 innerHTML 동일) |
| `skin/skin-folder-page-e2e-test.mjs` | 8944 | FOLDER-2 폴더 페이지(Series Viewer) — OPEN 링크(folderHref) 조건 · direct 글만 + 본문 region 채움 · children/breadcrumb/BACK/EDIT · 소유자 secret/private 본문 · 방문자 글별 gate(오답/정답, 네트워크에 secret id 없음) · 카테고리 복귀(삭제/빈/direct 없음/템플릿 없음/다른 카테고리) · 직접 접속·뒤로가기·모바일 + Studio Preview(`?scenario=t`) 동일 구조·`preview:folder-bodies`·CODE 활성·overlay · `--only=write`: **FOLDER-3 폴더 안에서 쓰기**(폴더 WRITE href·폼의 카테고리/폴더 미리 선택·`ㄴ` 들여쓰기 목록·카테고리 변경 시 목록 교체와 칸 숨김·취소 복귀·직접 접속·방문자 거절과 주소 정리) |
| `skin/skin-crop-published-e2e-test.mjs` | 8947 | 자르기 결과의 **공개 화면** 렌더 — Studio에서 자르고 Save/Export한 .json을 그대로 `get_published_skin`에 넣어 실제 `index.html`로 렌더 · sanitizer/CSS validator 이후 래퍼와 자르기 규칙 생존 · Studio Preview와 프레임/구도 일치 · desktop/mobile 빈틈·가로 넘침 · 자른 이미지의 링크 클릭 |
| `studio/studio-crop-e2e-test.mjs` | 8946 | Select mode 이미지 자르기 — 비율(정사각/가로/세로·현재 비율)·확대·드래그 구도·빈틈 없음 + 임시/취소/Escape/Undo + 자르기 초기화 + 크기 조절과 공존(프레임이 주인) + 래퍼 중복 방지 + 좌표(Desktop/Mobile 축소·AI 패널) + Save/재로드/Export→Import + 보호 영역·로드 실패·이미지 교체 + `--only=frame`: 조상 overflow가 잘라내는 프레임의 테두리/드래그 판 위치·구도 이동이 포인터와 1:1·위치 슬라이더/방향 버튼·팝오버 고정 + `--only=free`/`freegeo`: 자유 비율(네 변·모서리 핸들·왜곡/빈틈 없음·자유↔고정 전환은 **그려진 사진**으로 판정·삼등분 가이드선) + `--only=freealign`: 왼쪽/가운데/오른쪽 정렬 × 네 변·모서리에서 잡은 변은 포인터 1:1·반대쪽 변 고정(모바일 배율 포함)·적용 시 임시 위치 해제 + `--only=freelimit`: 확대 상한에서 핸들 정지·안내 + `--only=sliders`: 슬라이더 토큰·방향키·채움 비율·비활성 |
| `skin/skin-gallery-e2e-test.mjs` | 8948 | GALLERY-1 — 갤러리 공개 렌더(3열/2열·정사각 썸네일·사진 없음 대체 카드·본문 요청 0건·모바일 가로 넘침) · 비밀글 보호(대표 이미지 주소가 응답/DOM/이미지 요청 어디에도 없음, 지정 이미지 + 잠금 유지) · 페이지 이동(?page=N 클릭/직접 접속/새로고침/뒤로가기/범위 밖/빈 카테고리) · 하위 호환(갤러리를 모르는 스킨은 전체 목록 그대로, 목록·폴더·이어읽기 회귀, migration 이전 배포) · `--only=body`: **post/gallery 공통 본문 에디터**(사진 버튼 위치·커서 자리 다중 삽입·글→사진→글 저장/재편집·대표 지정/변경/해제/삭제 fallback·저장 RPC가 본문을 덮어쓰지 않음·재업로드 없음·undo·예전 갤러리 글과 COVER 데이터 보존·발췌 버튼 차이·취소 시 임시 파일 없음·저장 실패 롤백) · `--only=excerpt`: **발췌에 들어가는 본문 사진**(본문 순서·원본 비율·가운데 정렬·간격, 한 장을 쪼개지 않는 페이지 경계와 명시적 PAGE break, AUTO 높이, 저장 전 사진/저장된 사진(`/api/post-cover`), 느린 로딩·실패 시 자리표시자와 재시도, **실제 export PNG를 디코드해** 사진이 그려진 위치·크기가 PREVIEW/copy와 같은지, 모바일, gallery 버튼 숨김 유지. `IMORY_EXCERPT_OUT=<디렉터리>`를 주면 눈으로 볼 발췌 PNG를 남긴다) · `--only=access`: **파일 자체의 접근 경계** — 비공개 버킷 + 요청마다 권한 확인(`/api/post-cover`, **실제 Pages Function**을 그대로 돌린다). 공개→비밀/비공개 전환 뒤 같은 주소 재요청이 404가 되고(그 전환에서 파일을 하나도 건드리지 않는다), 같은 순간 소유자는 보이며, 다시 공개로 바꾸면 열린다 · `--only=protect`: 블로그 보호 설정(Settings > HOME > ETC) — 이미지 EXIF 제거(APP1을 실제로 넣은 JPEG로 확인)·**올리는 이미지 압축**(긴 변 2048px·투명 없는 png → jpeg·투명 있으면 png 유지·경로 확장자·원본보다 작아짐)·우클릭/복사 방지(주인장 제외, 목록·글 화면 모두)·저장 payload · Studio Preview 일치(`?scenario=g`) |
| `admin/admin-settings-e2e-test.mjs` | 8949 | 관리 설정 화면 — FAVICON/CURSOR(URL 칸 없음·**고를 때마다 새 경로**·save 전에는 DB/예전 파일 그대로·저장 뒤 예전 파일 삭제·remove·저장 실패 시 재시도 가능) · HOME>ETC 설정(보호 3개 + **메모 진입점 숨기기**) 불러오기/저장 · 설정 안쪽 탭이 화면 복귀(`restoreAdminView`) 뒤에도 유지되는지 · `--only=memofolder`: **메모 폴더 차례**(데스크톱 드래그·모바일 꾹 눌러 끌기·**꾹 누르기 전에 움직이면 스크롤이라 순서가 안 바뀐다**·↑↓ 병행·저장 payload가 화면 차례 그대로·원본 카테고리 `sort_order` 불변) |
| `admin/quote/quote-render-parity-e2e-test.mjs` | 8950 | Quote Preset 미리보기 ↔ 에디터 PREVIEW ↔ export ↔ 발행 본문이 **같은 계산**을 쓰는지 — `--only=paragraph`: 문단 간격이 `paragraphSpacing`을 실제로 따르는가(일반 줄바꿈/문단 구분/의도적 연속 빈 줄/PAGE break 구분, 인라인 서식·사진 앞뒤 문단 보존) · `--only=parity`: 본문 폭·줄바꿈 위치(글자 단위)·문단 간격·제목/출처 자리·페이지 수가 두 화면에서 같은가(Desktop/Mobile, 고정 비율/AUTO, 넘치는 샘플의 페이지 이동, 표시 배율은 contain) · `--only=legacy`: 설정이 빠진 옛 프리셋 열기→저장→다시 열기(명시적 0·알 수 없는 필드·canvas 값 보존) · `--only=export`: 고정 비율·auto·uniform export PNG의 실제 픽셀 크기(**auto도 `레이아웃 높이 × 배율`과 정확히 일치** — 나눈 뒤 페이지 높이를 정수로 확정)와 출력 너비를 바꿔도 줄바꿈/페이지 수가 그대로인지 · `--only=published`: 발행 본문의 문단 간격 · `--only=uniform`: uniform이 auto와 **같은 분할**(페이지 수·각 장의 글자·사진 자리)을 쓰고 가장 높은 페이지 높이로 통일되는가, 짧아지면 줄어드는가, **늘어난 공간이 고른 세로 정렬(top/center/bottom)대로 놓이고 높이는 그대로인가**(정렬 컨트롤은 auto에서만 숨는다) · `--only=options`: Preview 출력 조건 UI(uniform/auto/custom 상시 노출·프리셋 고정 비율 → custom 대응·**출력 너비 입력은 없고 크기 표시만**·접기/펼치기 유지·새 편집 세션 초기화·gallery 숨김) · `--only=cache`: 공용 렌더러/스타일의 **실제 요청 URL**(두 문서가 같은 배포 버전, iframe 포함 중복 로드 없음) · `--only=panel`: 발췌 여닫기 버튼(흐름 속 고스트 버튼·**가운데 정렬**·데스크톱/모바일 공통·`aria-expanded`/`aria-controls`·라벨 `발췌 ▾`/`발췌 접기 ▴`·**접으면 export/copy가 함께 숨고 cancel/save는 남는다**)과 패널 정리(중복 PREVIEW 문구·닫기 × 없음, 세로 정렬과 상세 비율이 custom에서만 **그려짐**, 접은 채로 export가 펼친 상태와 동일, 모바일 핀치 유지) · `--only=labels`: Quote Preset 한국어 라벨(**헤더 행 전체**(큰 탭·구역 제목·오른쪽 보조 문구·화면 부제)는 영어, 구역을 펼쳤을 때 나오는 설정명·선택값·동작 버튼은 한국어, 데스크톱과 모바일 탭 5개에서 잘림/가로 넘침 없음, 폼 왕복에서 저장값 enum·키 불변). `IMORY_QUOTE_SHOT=<디렉터리>`를 주면 두 화면 스크린샷을 남긴다 |
| `posts/posts-editor-decor-e2e-test.mjs` | 8951 | 본문 장식 — **색 고르기는 두 단계다**(색 견본 → 프리셋 색 목록 → 직접 선택 → 컬러피커. 목록만 열고 닫으면 undo 기록에 흔적 없음·목록에서 고른 색은 그 자리 확정 undo 한 칸) · 컬러피커(끄는 내내 열림·선택 유지·실시간 미리보기·Apply/Cancel/Escape/바깥클릭·드래그 전체가 undo 한 칸·redo·**선택만 있고 가만히 둘 때 selectionchange 무한 고리가 돌지 않음**) · `[picker/native]` **기본(OS) 색상 선택기**(판정 규칙 native/custom·**직접 선택이 진짜 보이는 `<input type="color">`**여서 코드가 숨은 칸을 대신 눌러 주지 않는다(그것이 "눌러도 아무것도 열리지 않던" 원인)·열리지 않으면 watchdog이 커스텀 팝오버로 이음·씨앗 적용·조정 중 본문 노드를 다시 만들지 않음(MutationObserver 0)·문서 선택을 다시 설정하지 않음(selectionchange 0)·undo 한 칸·강조선도 선택이 사라진 뒤 이어짐. Playwright WebKit에는 `<input type="color">`도 `maxTouchPoints`도 없어 **아이폰 자동 판정과 OS 창 거동은 실기기 항목**) · `--only=picker`의 **`[picker/touch]` 절은 반드시 `--browser=webkit`으로도 돌린다**(WebKit은 터치에서 pointerdown preventDefault 뒤 click을 만들지 않아, 마우스/chromium만으로는 아이폰에서 버튼이 안 눌리는 것을 못 잡는다) · 형광펜 재적용이 중첩되지 않음 · 형광펜 높이 · 문단 강조선(문단 전체·여러 줄 한 줄기·대사 자동과 개별 해제·수동 우선·개별 색·공개 뷰어) · `--only=gap`: 강조선 거리 **두 벌**(BODY·SOURCE — **대사 자동 강조선은 BODY의 색·굵기·거리를 따른다**, 옛 dialogueRule* 값이 이기지 않음·옛 프리셋 12px 유지·0 보존·범위 자르기)과 `[numbers]` 네모 숫자 칸(직접 입력·저장 왕복·범위) + `[numbers/gone]` **DIALOGUE는 자동 적용 체크만**(색·굵기·거리 칸 없음·옛 프리셋의 그 값은 열고 저장해도 보존·원래 없던 프리셋에는 만들지 않음) · `--only=fixed`: 확대 **1~200%**(저장은 0.01~3까지 살아남아 슬라이더가 고른 값이 저장에서 깎이지 않는다)·**사진을 캔버스보다 작게 줄이기**(드러난 자리는 배경색, 덮개는 사진 위에만)·흐림이 크기를 바꾸지 않음·**이미지 크기 고정**(같은 너비의 서로 다른 높이에서 사물 크기 동일, 첫 페이지 글 길이 무관, 켤 때 현재 크기 유지, 옛 확대 값이 열기만으로 깎이지 않음) · `--only=toolbar`: **정확히 세 줄**(page break·H·P·L·clear + 오른쪽 undo·redo / FORMAT·B·I·U·S·photo·preset / INSERT·copy box·memo·divider)·**세 행의 왼쪽 시작점이 같다**·축약 라벨의 접근성 이름·`[strike]` 취소선(혼합·undo/redo·저장 왕복·옛 strike/del·뷰어·발췌) · `--only=excerpt`: 발췌 설정(강조선 색 견본 제거·본문 툴바 H/P/L는 유지·size 한 줄·크기 표시가 대지 우측 위 바깥·페이지마다 갱신·**사진 교체 후에도 프리셋 덮개/흐림 유지**·reset) · **저장되는 PNG의 실제 픽셀**(배경·강조선·형광펜 높이·**흐림은 `ctx.filter`가 없는 환경에서도 구워진다** — WebKit SKIP 없음, 미리보기 스크린샷과 번짐 폭 비교 + 픽셀 폴백이 σ만큼 흐리는지 직접 호출·**줄인 배경의 자리·크기가 화면과 일치**) · `--only=blocks`: **복사 상자·메모·구분선**(삽입/종류 변경/삭제/undo·저장 HTML에 조작 UI 없음·재편집에서 다시 붙음·**복사되는 것은 내용만**이고 백틱·연속 공백·따옴표·HTML 글자·빈 줄이 그대로·실패를 성공으로 표시하지 않음·공개 뷰어에는 복사 버튼, 발췌에는 없음·상자 안 기호가 대사/지문으로 바뀌지 않음·강조선이 상자를 감싸지 않음·페이지보다 긴 상자에서 내용 유실도 무한 분할도 없음·clear가 블록을 지우지 않음) · `--only=html`: **HTML 모드**(감싼 코드 울타리만 벗김·안쪽 백틱/따옴표 보존·짝이 안 맞거나 블록 둘이면 손대지 않음·여러 번 그려도 더 깎이지 않음·저장된 글자는 그대로·**디자인만 PNG로**(OOC·제목·사이트 UI 제외, Quote Preset이 덮어쓰지 않음)·실제 PNG를 디코드해 해상도/잘림/빈 이미지 확인·빈 입력은 이유를 알림) · 모바일 터치와 기존 제스처 · 프리셋 왕복과 옛 프리셋 기본값 |
| `posts/posts-highlight-e2e-test.mjs` | 8952 | HIGHLIGHT-1 — 글 뷰어 도구 메뉴(주인장/방문자 항목 차이·글자 크기·정식 링크·Escape·모바일 폭) · 하이라이팅(범위 선택 → 색 → 저장, 같은 범위 재선택은 색만, 부분 겹침 거절, 떨어진 범위는 별개, 완료 후 표시 유지, **새로고침 후 유지**, 본문 글자 불변) · 메모(말풍선 자리·팝업·저장·읽기 상태에서 읽기·방문자에게 편집 도구 없음) · 메모 카테고리(최신순·메모 있는 카드만 메모 영역·원본 제목/카테고리·카드 ⋮·**메모 삭제와 하이라이트 삭제의 차이**·폴더별 보기·모바일 가로 넘침) · `--only=entry`: **메모 화면 기본 진입점**(스킨이 메모 링크를 안 그렸을 때만 플랫폼 칩·SPA 라우터로 이동·메모 화면에서는 사라짐·Settings에서 끄면 없음·스킨이 그렸으면 중복 없음·모바일 넘침) · `--only=state`: **원문 위치 확인 3상태**(확인 전/찾음/못 찾음, 글을 열면 기록·본문을 고치면 확인 전으로 되돌아감·`posts.updated_at` 권한 없는 배포에서도 목록은 나옴)와 **조회 실패 처리**(방문자에게 DB 오류 없음·주인장에게 "지금은 쓸 수 없다"+다시 시도·재시도로 모드가 열림) · `--only=protect`: 비밀글 발췌문이 방문자의 DOM에도 응답에도 없고 같은 순간 주인장에게는 보인다 · **정상 해제한 방문자는 그 발췌문·메모를 읽는다**(오답이면 아무것도 오지 않는다) · `--only=break`: **발췌문의 줄바꿈**(두 문단에 걸쳐 고르면 저장·팝업·카드에 빈 줄이 남는다 · 줄바꿈 이전에 저장된 옛 발췌문도 그대로 찾아 칠한다)과 **읽는 모습**(메모 말풍선이 누른 줄이 아니라 하이라이트 덩어리 **전체** 위에 서고 꼬랑지·반투명 판 · 하이라이트에 점선 없음·각진 모서리 · 팝업/textarea/취소/SAVE가 알약이 아닌 radius 토큰 · 토스트가 아이모리 핑크) |
| `studio/studio-memo-preview-e2e-test.mjs` | 8953 | Studio Preview 메모 카드 도구 — 실제 `preview-frame.html`을 iframe에 띄워 `preview:render`를 보낸다. 카드 ⋮ 가 열리고(메모 있음/없음 메뉴 차이) 메모 팝업이 공개 화면과 같은 외형으로 뜨는가 · **미리보기 조작이 저장되지 않는가**(supabase로 나간 요청 0건으로 판정) · 주인장/방문자 칩 전환에 따라 ⋮ 가 나타나고 사라지는가 · 메모 화면이 아닐 때는 칩 없이 기본 메모 진입점만 나오는가 |
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
- AI 스킨 라운드 문서는 `docs/ai-skin/`에 모여 있다 (`AI_SKIN_*.md`). 코드
  주석은 디렉터리 없이 파일명만 적고 있으니, 찾을 때는 그 폴더에서 본다.
- `docs/ai-skin/AI_SKIN_PHASE*.md`는 각 라운드의 **기록**이다. 나중 라운드가 앞
  계약을 바꿨으면 앞 문서를 다시 쓰지 말고, 바뀐 지점에 "철회/변경됨 → 어느
  문서"를 적는다.
- 문서에는 "현재 구현" / "앞으로 지켜야 할 원칙" / "남은 차이"를 구분해서 쓴다.
  아직 공통화되지 않은 것을 이미 구현된 것처럼 쓰지 않는다.
- 실제 구현된 공통 함수·파일이 있으면 정확한 이름을 적는다.
