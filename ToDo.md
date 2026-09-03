# Imory ToDo

> 관련 문서: [Concept.md](./Concept.md) · [Design.md](./Design.md)
>
> 살아있는 개발 계획서. 처음부터 다시 만드는 계획이 아니라, 현재 코드/DB를 기준으로 한 상태 체크리스트다. 2026-09-02 기준(`main`, `906dcc1`)으로 작성했으며, 이후 코드가 바뀌면 이 문서도 갱신되어야 한다.

---

## 5-1. 상태 표시

**구현 상태**
- `[x]` 코드 경로와 필요한 구성요소가 모두 연결되어 있음
- `[-]` 일부 구현 또는 연결 미완료
- `[ ]` 미구현
- `[!]` 버그 또는 보안상 우선 확인 필요
- `[?]` 코드만으로 판단 불가, 사용자 확인 필요

**검증 수준** (구현 상태와 별도로 각 모듈에 표기)
- `코드 검증`: 프론트→DB/RPC→RLS까지 경로가 논리적으로 맞는지 코드 추적으로 확인했는지
- `로컬 화면 검증`: 실제 브라우저에서 클릭해 동작을 확인했는지
- `Supabase 연동 검증`: 원격 Supabase 프로젝트(RLS/RPC/데이터)로 실제 확인했는지
- `배포 환경 검증`: Cloudflare Pages 배포본에서 확인했는지
- `사용자 확인`: 프로젝트 소유자가 화면에서 직접 확인했는지

이 문서를 쓰는 시점 기준, 저는(Claude) 코드 읽기만 가능하고 브라우저 조작·원격 Supabase 조회·배포본 접속은 할 수 없다. 따라서 아래 모든 모듈의 `로컬 화면 검증`/`Supabase 연동 검증`/`배포 환경 검증`/`사용자 확인`은 별도 표기가 없는 한 기본적으로 **미실시/필요**이며, `코드 검증`만 모듈별로 다르게 표기한다.

---

## 5-2. 모듈 단위 구성

1. 공용 기반 구조 2. Design Token 3. 공용 UI 컴포넌트 4. 테마 5. Supabase 클라이언트 6. 인증 7. Google OAuth 8. 사용자 Profile 9. 온보딩 10. 기간 한정 신규 가입 11. 공개 시작 페이지 12. 사용자별 공개 홈페이지 13. 카테고리 14. 폴더와 중첩 구조 15. 게시글 16. 비밀글 17. 글 에디터 18. 글 뷰어 19. Quote Preset 20. 발췌 프리뷰 21. 이미지 내보내기 22. 배너 23. Settings 24. 홈 커스터마이징 25. Storage 26. RLS와 권한 27. migration 28. 오류 처리 29. 접근성 30. 모바일 대응 31. 성능 32. 배포 33. 테스트 34. 문서화

---

## 5-3. 모듈별 명세

### 1. 공용 기반 구조
- **목적**: 빌드 없이 정적 HTML/CSS/JS를 순차 로드하는 저장소 구조
- **현재 상태**: `[x]` — `index.html`이 프래그먼트(sua-home, posts.html)를 fetch로 조립하는 구조가 일관되게 동작 · 코드 검증: 완료
- **관련 파일**: `index.html`, `_redirects`, `functions/_middleware.js`
- **입력/출력**: 입력 없음 / 조립된 SPA 셸
- **DB/Storage**: 없음
- **의존 관계**: 모든 화면의 기반
- **보안 주의**: 없음
- **완료 조건**: -(계속 유지되는 구조)
- **비개발자 테스트**: `imory.me`(또는 배포 URL) 접속 → 화면이 정상적으로 뜨는지

### 2. Design Token
- **목적**: 색상/타이포/여백/radius 등 반복값을 CSS 변수로 통일
- **현재 상태**: `[-]` — 토큰 정의(`design-tokens.css`)는 완성도 높지만, 다크모드/breakpoint/z-index 토큰이 없고 일부 컴포넌트(Button/Input)는 아직 실서비스에 부분 적용 · 코드 검증: 완료
- **관련 파일**: `core/design-tokens.css`, `core/design-tokens-mapping.md`
- **입력/출력**: 없음(CSS 변수 정의)
- **DB/Storage**: 없음
- **의존 관계**: 3(컴포넌트), 4(테마)의 기반
- **보안 주의**: 없음
- **완료 조건**: 다크모드 토큰 추가, breakpoint 토큰화(제안, Design.md 4-3 참고)
- **비개발자 테스트**: `core/design-tokens-preview.html`을 브라우저로 열어 색상/타이포 견본이 보이는지

### 3. 공용 UI 컴포넌트
- **목적**: Button/Field/Label/Tabs/Section Header/Form Actions 등 재사용 컴포넌트
- **현재 상태**: `[-]` — 정의는 있으나 `admin/index.html`·`onboarding/`·`customize/editor/`에만 부분 적용, 글 에디터·posts 쪽은 자체 CSS 유지 · 코드 검증: 완료
- **관련 파일**: `core/components/*.css`, `core/patterns/*.css`
- **입력/출력**: 없음
- **DB/Storage**: 없음
- **의존 관계**: 2에 의존, 대부분의 화면이 이를 사용(또는 아직 미사용)
- **보안 주의**: 없음
- **완료 조건**: `button-preview.html`/`input-preview.html` 주석의 "미적용" 표기를 실제 적용 현황에 맞게 갱신, posts 에디터 버튼도 Core로 치환할지 결정
- **비개발자 테스트**: `core/components/button-preview.html`, `input-preview.html`을 열어 컴포넌트 샘플이 정상 표시되는지

### 4. 테마(라이트/다크)
- **목적**: 시스템 UI의 라이트/다크 모드 전환
- **현재 상태**: `[ ]` — 관련 코드 전무 · 코드 검증: 완료(부재 확인)
- **관련 파일**: 없음(신규 작성 필요)
- **입력/출력**: 사용자의 토글 클릭 → `data-theme` 속성/localStorage
- **DB/Storage**: 없음(localStorage만)
- **의존 관계**: 2(토큰)
- **보안 주의**: 없음
- **완료 조건**: Design.md 4-7의 확정 정책대로 시스템 설정 우선순위 + 저장값 + FOUC 방지 구현
- **비개발자 테스트**: 시스템(OS) 다크모드를 켠 상태로 접속 시 자동으로 어두운 화면이 뜨는지, 화면에서 직접 전환 버튼을 눌러도 바뀌는지, 새로고침해도 선택이 유지되는지

### 5. Supabase 클라이언트
- **목적**: 전역 `supabaseClient` 초기화
- **현재 상태**: `[x]` — publishable(anon) 키만 사용, service_role 노출 없음 확인 · 코드 검증: 완료
- **관련 파일**: `core/lib/supabase-client.js`
- **입력/출력**: 없음 / 전역 `supabaseClient`, `SUPABASE_URL`, `SUPABASE_KEY`
- **DB/Storage**: 전체 테이블/Storage 접근의 진입점
- **의존 관계**: 모든 Supabase 사용 모듈의 선행 조건
- **보안 주의**: 이 키가 anon/publishable이 아니라 service_role로 바뀌는 실수가 없도록 항상 확인
- **완료 조건**: -(유지)
- **비개발자 테스트**: 없음(개발자 확인 사항)

### 6. 인증(세션)
- **목적**: 로그인 여부 판정, 로그인/비로그인 UI 전환
- **현재 상태**: `[x]` — `checkSession()` + `onAuthStateChange`로 세션 존재 여부 판정 · 코드 검증: 완료
- **관련 파일**: `admin/admin-session.js`, `core/lib/auth-shared.js`
- **입력/출력**: Supabase 세션 / 로그인·로그아웃 UI 전환
- **DB/Storage**: 없음(Supabase Auth 자체 세션)
- **의존 관계**: 5에 의존, 7·8과 연결
- **보안 주의**: 별도 서버 세션 없이 Supabase Auth 세션에만 의존 — 클라이언트 조작으로 세션을 위조할 수 없는지는 Supabase 자체 보증에 의존(확인 필요 없음, 표준 SDK 사용)
- **완료 조건**: -(유지)
- **비개발자 테스트**: 로그인 후 새로고침해도 로그인 상태가 유지되는지, 로그아웃 버튼이 정상 동작하는지

### 7. Google OAuth
- **목적**: Google 계정으로 로그인
- **현재 상태**: `[x]` — `signInWithOAuth` → `auth/auth-callback.js`에서 세션/프로필/가입기간 판정 후 분기 · 코드 검증: 완료
- **관련 파일**: `admin/admin-session.js`, `auth/index.html`, `auth/auth-callback.js`
- **입력/출력**: Google 로그인 클릭 / `/admin/` 또는 `/onboarding/`으로 리다이렉트
- **DB/Storage**: `profiles`, `app_config` 조회
- **의존 관계**: 6, 8, 9, 10
- **보안 주의**: Supabase 대시보드의 OAuth redirect URL 허용 목록에 실제 배포 도메인이 등록되어 있어야 함(코드로 확인 불가) — **확인 필요**
- **완료 조건**: -(유지), 10번(가입 기간) 완성 시 이 콜백 로직도 함께 확장 필요
- **비개발자 테스트**: `/auth/`가 아니라 로그인 버튼을 눌러 Google 계정 선택 화면이 뜨는지, 로그인 후 정상적으로 관리자 화면 또는 온보딩으로 이동하는지

### 8. 사용자 Profile
- **목적**: `profiles` 테이블로 사용자 정체성(닉네임/slug/home_mode) 관리
- **현재 상태**: `[x]` — 생성은 RPC로만, 공개 select는 RLS+column GRANT로 제한 · 코드 검증: 완료
- **관련 파일**: `supabase/migrations/20260830132600_*.sql`, `20260830140000_*.sql`, `home/site-owner.js`
- **입력/출력**: `complete_onboarding()` RPC 호출 / `profiles` row
- **DB/Storage**: `profiles`
- **의존 관계**: 9(온보딩)가 이 테이블을 생성, 12(공개 홈)가 조회
- **보안 주의**: INSERT/UPDATE 정책이 의도적으로 없음(RPC 전용) — 직접 `profiles` insert/update를 허용하는 정책이 실수로 추가되지 않도록 주의
- **완료 조건**: -(유지)
- **비개발자 테스트**: Supabase Dashboard → Table Editor → `profiles`에서 본인 row의 `slug`/`nickname`/`home_mode` 값이 올바른지 확인

### 9. 온보딩
- **목적**: 최초 로그인 사용자의 닉네임/슬러그 설정
- **현재 상태**: `[x]` — 클라이언트 1차 검증 + RPC 내부 최종 검증(형식/길이/예약어/중복) 이중 방어 · 코드 검증: 완료
- **관련 파일**: `onboarding/index.html`, `onboarding.js`, `onboarding.css`, `core/lib/reserved-slugs.js`, `20260831120000_*.sql`
- **입력/출력**: 닉네임, 슬러그 / `profiles`+`home_customize` row 생성
- **DB/Storage**: `profiles`, `home_customize`(RPC `complete_onboarding`)
- **의존 관계**: 7(OAuth)에서 진입, 8(Profile) 생성
- **보안 주의**: `RESERVED_SLUGS`가 JS(`core/lib/reserved-slugs.js`)와 SQL(RPC 내부) 두 곳에 중복 정의 — 한쪽만 수정하면 불일치 발생(기술부채, 아래 참고)
- **완료 조건**: -(유지), 예약어 이중 소스는 backlog
- **비개발자 테스트**: 신규 Google 계정으로 로그인 → 닉네임/슬러그 입력 → 이미 쓰이는 슬러그나 `admin` 같은 예약어를 입력했을 때 오류 메시지가 뜨는지, 정상 입력 시 관리자 화면으로 이동하는지

### 10. 기간 한정 신규 가입
- **목적**: 정해진 기간에만 신규 가입 허용, 기존 회원은 항상 로그인 가능
- **가입 3단계 구분**: ① Supabase Auth 사용자 생성(`auth.users`) → ② Imory `profiles` 생성·온보딩 완료(`complete_onboarding()`) → ③ Imory 서비스 이용. 현재 검사는 ②~③만 제한하고 있어 아래 상태를 `[-]`가 아닌 `[!]`로 표시한다.
- **현재 상태**: `[!]` — boolean(`signup_open`) 검사가 온보딩 진입(②~③단계)만 막고, **①단계(Supabase `auth.users` 신규 생성) 자체를 막는 서버 측 장치(Before User Created Hook)가 없다.** `signup_opens_at`/`signup_closes_at`(timestamptz) 컬럼은 DB에 있지만 코드 미사용 · 코드 검증: 완료(Hook 부재 확인 포함)
- **관련 파일**: `auth/auth-callback.js`, `supabase/migrations/20260830132600_*.sql`(컬럼 정의), `20260831120000_*.sql`(`complete_onboarding()`, 가입 상태 미검사 확인)
- **입력/출력**: (계획) 운영자가 KST로 오픈/마감 시각 설정 / UTC로 저장, 서버 시각과 비교해 판정
- **DB/Storage**: `app_config`
- **의존 관계**: 7(OAuth), 6(인증) — ①단계는 Supabase Auth 설정(Hook) 영역이라 이 저장소의 프론트 코드만으로는 제어 불가
- **보안 주의**: 브라우저 로컬 시각으로 판정하면 우회 가능 — 서버(DB) 시각 기준 판정 필수. **callback의 클라이언트 측 분기는 UX 보조일 뿐 최종 보안 장벽이 아니다** — 최종 방어는 Hook(1차)과 RPC(3차)가 담당해야 한다.
- **완료 조건**(3중 방어 모두 구현):
  1. Before User Created Hook이 `signup_open` + `signup_opens_at`/`signup_closes_at`(서버 시각)을 검사해 신규 `auth.users` 생성 자체를 거절(기존 사용자 로그인은 영향 없음)
  2. `auth-callback.js`가 `profiles`/가입 상태에 따라 admin/onboarding/안내로 분기(현재 구현된 역할과 동일, 보조 검사로 유지)
  3. `complete_onboarding()` RPC가 서버 시각 기준으로 가입 상태를 재검사해, Hook 누락·RPC 직접 호출 상황에도 가입 마감 시 `profiles` 생성을 거절
- **비개발자 테스트**: Supabase Dashboard에서 `app_config.signup_open`을 false로 바꾼 뒤 (a) 새 Google 계정으로 로그인 시도 → 온보딩 진입이 막히는지, (b) Supabase Dashboard → Authentication → Users에 그 신규 계정이 그래도 생성되어 있는지 확인(Hook 구현 전이라면 생성될 것으로 예상됨 — 이것이 ①단계가 아직 안 막혀 있다는 증거), (c) 기존 계정은 계속 로그인되는지

### 11. 공개 시작 페이지
- **목적**: 로고, 라이트/다크 전환, SIGN IN이 있는 진짜 첫 화면
- **현재 상태**: `[ ]` — 현재는 "개발 중" placeholder(`.landing-screen`)만 존재 · 코드 검증: 완료(미구현 확인)
- **관련 파일**: `index.html`(`.landing-screen` 영역)
- **입력/출력**: SIGN IN 클릭 / OAuth 시작
- **DB/Storage**: 없음(진입점 역할만)
- **의존 관계**: 4(테마), 7(OAuth), 2(로고 확정 시)
- **보안 주의**: 없음
- **완료 조건**: 5-5의 세부 단계 참고
- **비개발자 테스트**: 5-5 각 단계 참고

### 12. 사용자별 공개 홈페이지
- **목적**: `/:slug`로 각 사용자의 공개 홈을 노출
- **현재 상태**: `[!]` — 데이터 스코핑은 되지만(카테고리/글/메타), **테마 렌더링은 모든 owner에게 동일한 sua 마크업이 노출됨**(`home_mode` 미분기) · 코드 검증: 완료
- **관련 파일**: `index.html`(`gateHomeByOwner`, `loadSuaTheme`), `home/site-owner.js`, `themes/sua/*`
- **입력/출력**: URL의 slug / 해당 owner의 홈 화면
- **DB/Storage**: `profiles`(slug→user_id), `categories`/`posts`/`site_settings`(owner 스코프)
- **의존 관계**: 8(Profile), 13(카테고리), 15(게시글), 24(홈 커스터마이징 완성 시)
- **보안 주의**: 데이터 유출은 아니지만(정적 마크업), 다른 사용자의 실명/소개문이 그대로 노출되는 **개인정보/신뢰 문제** — 출시 전 필수(5-6 참고)
- **완료 조건**: `home_mode`에 따라 `legacy_sua`/`customize` 렌더러 분기(세부 완료 조건 6개는 5-5 0단계 참고 — legacy_sua 계정 유지, customize 계정에 타인 정보 미노출, 빈 layout_json에 대한 안전한 empty state, 존재하지 않는 slug 처리 유지, 조회 실패 시 타인 화면으로 fallback 금지, 로그인 여부 무관 동일 결과)
- **비개발자 테스트**: 신규 테스트 계정으로 가입 후 자신의 `/:slug` 페이지에 접속했을 때 sua 계정(`@sentbys_a`)의 프로필이 아니라 자신에게 맞는 화면(또는 빈 상태 안내)이 보이는지

### 13. 카테고리
- **목적**: 글을 분류하는 평면 목록형 카테고리
- **현재 상태**: `[x]` — owner 스코프 조회, `type`(post/banner) 구분 동작 · 코드 검증: 완료
- **관련 파일**: `home/categories.js`, `admin/index.html`(CATEGORY 탭)
- **입력/출력**: 카테고리 CRUD / 메뉴 목록
- **DB/Storage**: `categories`(id, name, slug, sort_order, type, user_id로 추정 — 확인 필요: 정확한 전체 컬럼은 admin CRUD 코드 추가 확인 필요)
- **의존 관계**: 15(게시글), 22(배너 카테고리)
- **보안 주의**: 조회 시 `user_id` 스코핑이 항상 걸리는지 재확인(코드상으로는 확인됨)
- **완료 조건**: -(유지)
- **비개발자 테스트**: 관리자 CATEGORY 탭에서 카테고리를 추가/순서변경 후 공개 홈 메뉴에 즉시 반영되는지

### 14. 폴더와 중첩 구조
- **목적**: 카테고리를 계층적으로 묶는 기능
- **현재 상태**: `[ ]` — `categories` select에 `parent_id` 등 계층 필드 없음, 평면 리스트만 존재 · 코드 검증: 완료(미구현 확인)
- **관련 파일**: 없음
- **입력/출력**: -
- **DB/Storage**: -
- **의존 관계**: 13
- **보안 주의**: 없음
- **완료 조건**: 범위/우선순위 자체가 아직 미정(Concept.md 13번 "앞으로 구현할 범위"에도 미포함) — **확인 필요**(사용자에게 우선순위 재문의 필요 시점에 진행)
- **비개발자 테스트**: -

### 15. 게시글
- **목적**: 글 작성/조회/수정/삭제
- **현재 상태**: `[x]` — 본문은 `post_contents`로 분리 저장(비밀글 보호 목적), 컬럼 단위 권한 정리 완료(906dcc1) · 코드 검증: 완료
- **관련 파일**: `posts/editor/posts-save.js`, `posts/view/posts-view-*.js`, `posts/editor/posts-router-init.js`
- **입력/출력**: 제목/본문/카테고리/공개범위 / `posts`+`post_contents` row
- **DB/Storage**: `posts`(id, user_id, category_id, title, content_type, visibility, created_at, updated_at, quote_preset_id, secret_password_hash), `post_contents`(post_id, content, ooc_content)
- **의존 관계**: 13(카테고리), 16(비밀글), 19(Quote Preset 참조)
- **보안 주의**: `secret_password_hash`는 SELECT 권한에서 제외됨(906dcc1) — 컬럼 단위 GRANT 회귀 여부를 향후 migration 작성 시 항상 재확인
- **완료 조건**: -(유지)
- **비개발자 테스트**: 글 작성 → 저장 → 목록/상세에 정상 반영, 수정 후 반영, 삭제 후 목록에서 사라지는지

### 16. 비밀글
- **목적**: 비밀번호로 보호되는 글
- **현재 상태**: `[x]` — 비밀번호 대조는 처음부터 `get_secret_post_content` RPC(SECURITY DEFINER) 내부에서만 수행, 906dcc1로 컬럼 직접 노출 경로 차단 · 코드 검증: 완료
- **관련 파일**: `posts/view/posts-view-secret-gate.js`, `posts/editor/posts-save.js`, `20260902110000_*.sql`
- **입력/출력**: 방문자가 입력한 비밀번호 / 본문 노출 여부
- **DB/Storage**: `posts.secret_password_hash`(쓰기 전용, 읽기 불가), RPC `set_post_secret_password`/`get_secret_post_content`
- **의존 관계**: 15
- **보안 주의**: 이미 하드닝 완료. 다만 두 RPC의 정확한 파라미터 시그니처/내부 구현은 SQL Editor에서 직접 작성돼 저장소 migration 파일에 전체 소스가 없음 — **확인 필요**(RPC 정의 자체를 별도로 덤프해 저장소에 기록해두는 것을 권장, 기술부채)
- **완료 조건**: RPC 원본 SQL을 migration으로 백필(기술부채, 아래 참고)
- **비개발자 테스트**: 비밀글 작성 → 로그아웃 상태에서 해당 글 접속 → 잘못된 비밀번호 입력 시 거부, 올바른 비밀번호 입력 시 본문 노출 확인

### 17. 글 에디터
- **목적**: 리치텍스트/HTML 모드 글 작성 UI
- **현재 상태**: `[x]` — 실행취소, 하이라이트 툴바, 굵게/기울임/밑줄 등 지원 · 코드 검증: 완료
- **관련 파일**: `posts/editor/*.js`, `posts/posts-editor.css`
- **입력/출력**: 사용자 입력 / DOM 상태(저장 전)
- **DB/Storage**: 15와 동일
- **의존 관계**: 15, 19(프리셋 선택)
- **보안 주의**: `posts-sanitize.js`가 리치텍스트 모드에서 sanitize 수행 — HTML 모드는 의도적으로 sanitize 없이 raw 저장(주석에 명시) → **본인 글에만 적용되는 기능인지, 저장 시 XSS 위험이 없는지 재확인 필요**(같은 계정 소유자가 자기 글을 HTML로 저장/조회하는 구조이므로 일반적 XSS 위험은 낮으나, 다른 사용자가 그 글을 볼 때 렌더링 방식은 확인 필요)
- **완료 조건**: -(유지), 위 sanitize 확인 필요 항목은 보안 우선 확인(5-6)에도 등록
- **비개발자 테스트**: 굵게/기울임/밑줄/실행취소가 정상 동작하는지, HTML 모드 전환 시 입력한 태그가 뷰어에 그대로 반영되는지

### 18. 글 뷰어
- **목적**: 저장된 글을 읽기 화면으로 렌더
- **현재 상태**: `[x]` · 코드 검증: 완료
- **관련 파일**: `posts/view/posts-view-detail.js`, `posts-view-list.js`, `posts-view-transition.js`, `posts-view-html-fit.js`
- **입력/출력**: post id / 렌더된 글 화면
- **DB/Storage**: 15와 동일
- **의존 관계**: 15, 16
- **보안 주의**: 비공개/비밀글 필터링이 뷰어 단에서도 RLS와 일치하는지(이중 방어) — 코드상 일치 확인됨
- **완료 조건**: -(유지)
- **비개발자 테스트**: 카테고리 목록 → 글 클릭 → 상세 화면 전환이 자연스러운지, 비공개글이 다른 계정에서 안 보이는지

### 19. Quote Preset
- **목적**: 발췌 스타일(폰트/색/배경/비율 등) 프리셋 저장·적용
- **현재 상태**: `[x]` — CRUD, "사용 중" 지정(단일 활성), 실시간 프리뷰 동작 · 코드 검증: 완료
- **관련 파일**: `admin/quote/*.js`, `admin-quote-panel.html`
- **입력/출력**: 폼 입력 / `quote_presets` row, 실시간 DOM 미리보기
- **DB/Storage**: `quote_presets`(id, user_id, name, settings jsonb, is_active, updated_at)
- **의존 관계**: 15(글의 `quote_preset_id`), 20(발췌 프리뷰)
- **보안 주의**: 모든 CRUD가 `.eq("user_id", ...)`로 소유자 확인 — RLS 정책 자체는 migration에 없어 **확인 필요**(대시보드에서 직접 설정된 것으로 추정)
- **완료 조건**: `quote_presets` 테이블의 RLS를 migration으로 백필(기술부채)
- **비개발자 테스트**: QUOTE 패널에서 새 프리셋 생성 → 값 변경 시 미리보기가 즉시 바뀌는지 → 저장 → "사용 중" 지정 후 실제 글 발췌에도 반영되는지

### 20. 발췌 프리뷰
- **목적**: Quote Preset이 적용된 발췌를 화면에 미리보기
- **현재 상태**: `[x]` — 페이지 자동 분할, 모바일 핀치줌 지원 · 코드 검증: 완료
- **관련 파일**: `posts/preview/*.js`, `posts/style/*.js`
- **입력/출력**: 글 내용 + 활성 프리셋 / 페이지 단위 미리보기 DOM
- **DB/Storage**: 15, 19 참조(직접 쓰기 없음)
- **의존 관계**: 15, 19, 21
- **보안 주의**: 없음
- **완료 조건**: -(유지)
- **비개발자 테스트**: 글 에디터에서 프리뷰 섹션을 열어 텍스트가 넘칠 때 자동으로 페이지가 나뉘는지, 모바일에서 핀치줌이 되는지

### 21. 이미지 내보내기
- **목적**: 발췌 프리뷰를 PNG 이미지로 저장/공유
- **현재 상태**: `[x]` — html2canvas 기반, CSS 변수/하이라이트/transform 관련 우회 처리 다수 · 코드 검증: 완료
- **관련 파일**: `posts/export/*.js`, `posts-preview-export.css`
- **입력/출력**: 프리뷰 DOM / PNG 다운로드·클립보드·공유
- **DB/Storage**: 없음(클라이언트 캡처)
- **의존 관계**: 20
- **보안 주의**: 없음(외부 전송 없이 클라이언트에서만 처리)
- **완료 조건**: -(유지)
- **비개발자 테스트**: 데스크톱에서 다운로드 버튼 클릭 시 PNG가 저장되는지, 모바일에서 공유 버튼으로 카메라롤 저장이 되는지, 클립보드 복사 후 다른 곳에 붙여넣기가 되는지

### 22. 배너
- **목적**: (a) MY BANNER — 타 사이트가 나를 링크할 때 쓰는 이미지/URL 저장, (b) 배너 카테고리 — 친구 사이트 링크 모음
- **현재 상태**: `[x]`(둘 다 저장 기능은 완성) — 단, MY BANNER는 설계상 공개 홈에 자동 노출되지 않음(Concept.md 14번, Q3 결정) · 코드 검증: 완료
- **관련 파일**: `admin/settings/admin-my-banner.js`, `posts/view/posts-view-banner*.js`
- **입력/출력**: 이미지 파일 + URL / Storage 업로드 + `site_settings`(MY BANNER) 또는 `banners` row(배너 카테고리)
- **DB/Storage**: `site_settings`(key=`banner_url`), `banners`(id, name, url, image_url, image_path, sort_order, category_id, user_id), Storage `user-banners`
- **의존 관계**: 13(배너 카테고리는 `categories.type='banner'`에 의존), 25(Storage)
- **보안 주의**: 배너 삭제 시 Storage 파일도 함께 정리하는 로직 있음(고아 파일 방지) — 정상 동작 여부 확인 필요
- **완료 조건**: (일반 백로그) UI 문구가 "공개 노출"을 암시하지 않는지 검토 — 아래 5-6 참고
- **비개발자 테스트**: SETTINGS에서 MY BANNER 이미지 업로드 → image url 복사 버튼으로 주소가 복사되는지. 배너 카테고리에서 배너 추가 → 그리드에 정상 표시, 클릭 시 새 탭으로 이동하는지

### 23. Settings
- **목적**: 파비콘/커서/BGM/블로그 타이틀/MY BANNER 등 사이트 설정
- **현재 상태**: `[x]`(DATA 탭의 백업/내보내기 제외 — 그건 `[ ]`, 버튼 disabled) · 코드 검증: 완료
- **관련 파일**: `admin/settings/*.js`, `admin/admin-settings.css`
- **입력/출력**: 파일 업로드/텍스트 입력 / `site_settings` upsert, Storage 업로드
- **DB/Storage**: `site_settings`(user_id, key, value — key: blog_title/favicon_url/cursor_url/bgm_url/banner_url), Storage `user-favicons`/`user-cursors`/`user-banners`
- **의존 관계**: 25(Storage), 12(공개 홈이 일부 값을 소비)
- **보안 주의**: 없음(모두 소유자 본인 upsert)
- **완료 조건**: DATA 탭(스킨 내보내기/백업)은 별도 기획 필요 — 확인 필요
- **비개발자 테스트**: 파비콘/커서 이미지 업로드 후 실제 브라우저 탭 아이콘/커서가 바뀌는지, 블로그 타이틀 변경이 공개 홈에 반영되는지

### 24. 홈 커스터마이징
- **목적**: 블록 기반으로 공개 홈페이지 레이아웃을 직접 편집
- **현재 상태**: `[-]` — 에디터 UI/미리보기(`preview-frame.html`)는 동작하지만 **Supabase 저장/불러오기 연결 없음**(SAVE 버튼 disabled), `layout_json`을 읽고 쓰는 코드는 온보딩 RPC의 초기값 삽입뿐 · 코드 검증: 완료
- **관련 파일**: `customize/editor/*`, `customize/renderer/*`
- **입력/출력**: 블록 드래그/속성 편집 / (계획) `home_customize.layout_json`
- **DB/Storage**: `home_customize`(user_id, layout_json jsonb)
- **의존 관계**: 12(공개 홈 렌더링이 이를 사용해야 함, 현재 미연결)
- **보안 주의**: RLS는 이미 준비됨(소유자만 쓰기, 공개 읽기) — 저장 로직 구현 시 그대로 활용 가능
- **완료 조건**: 저장/불러오기 연결, `render-layout.js`가 실제 저장된 `layout_json`을 공개 홈에서 렌더링하도록 12번과 연결
- **비개발자 테스트**: (구현 후) 에디터에서 블록을 옮기고 저장 → 공개 홈페이지 새로고침 시 바뀐 레이아웃이 보이는지

### 25. Storage
- **목적**: 사용자 업로드 파일(파비콘/커서/배너) 저장
- **현재 상태**: `[x]`(favicons/cursors), `[?]`(banners 버킷 자체는 migration에 CREATE 문 없음 — 대시보드에서 만들어진 것으로 추정) · 코드 검증: 완료(favicons/cursors), banners는 확인 필요
- **관련 파일**: `20260902100000_*.sql`, 각 업로드 JS
- **입력/출력**: 파일 / 공개 URL(고정 경로, upsert)
- **DB/Storage**: `user-favicons`, `user-cursors`, `user-banners`(버킷)
- **의존 관계**: 22, 23
- **보안 주의**: 세 버킷 모두 `public=true` + 크기/mime 제한 없음(코드 accept 속성으로만 안내) — 악성 파일 업로드 방어는 owner-only 쓰기 RLS에만 의존, 파일 크기 제한이 없어 대용량 업로드로 인한 스토리지 남용 가능성 — **확인 필요**(우선순위는 낮음, backlog)
- **완료 조건**: `user-banners` 버킷 생성 migration을 저장소에 백필(기술부채)
- **비개발자 테스트**: Supabase Dashboard → Storage에서 버킷 3개(`user-favicons`/`user-cursors`/`user-banners`)가 존재하고 본인 파일이 올바른 경로에 있는지 확인

### 26. RLS와 권한
- **목적**: 테이블/컬럼 단위 접근 통제
- **현재 상태**: `[-]` — `profiles`/`app_config`/`home_customize`/`posts`는 RLS+column GRANT 정리 완료. `categories`/`banners`/`quote_presets`/`site_settings`/`post_contents`/`daily_visits`는 migration 파일이 없어 **저장소 조사만으로는 RLS 정책을 확인할 수 없음** · 코드 검증: 부분 완료
- **관련 파일**: 5개 migration 파일 전체
- **입력/출력**: -
- **DB/Storage**: 전체 테이블
- **의존 관계**: 모든 DB 접근 모듈
- **보안 주의**: **[!] 출시 전 필수** — migration 파일이 없는 테이블들의 실제 RLS를 Supabase Dashboard에서 직접 확인해 저장소에 백필해야, 향후 이 문서와 실제 DB 상태가 어긋나지 않는다
- **완료 조건**: 6개 테이블의 RLS를 Supabase Dashboard에서 export해 migration으로 백필
- **비개발자 테스트**: Supabase Dashboard → Authentication → Policies에서 각 테이블에 정책이 있는지 육안 확인 후 캡처해서 공유

### 27. migration
- **목적**: DB 스키마 변경 이력 관리
- **현재 상태**: `[-]` — 5개 파일 존재, 다만 `posts`/`categories`/`banners`/`quote_presets`/`site_settings`/`post_contents`/`daily_visits`의 최초 CREATE TABLE이 저장소에 없음(대시보드에서 직접 생성된 것으로 추정) · 코드 검증: 완료(현황 확인)
- **관련 파일**: `supabase/migrations/*.sql`
- **입력/출력**: -
- **DB/Storage**: -
- **의존 관계**: 26
- **보안 주의**: 스키마 소스가 대시보드와 저장소로 이원화되어 있어 향후 로컬-원격 불일치 위험 — 기술부채
- **완료 조건**: 누락된 테이블들의 스키마를 pg_dump 또는 Dashboard export로 migration에 백필
- **비개발자 테스트**: 해당 없음(개발 프로세스 사항)

### 28. 오류 처리
- **목적**: API 실패/네트워크 오류 시 사용자 안내
- **현재 상태**: `[-]` — 각 기능이 개별적으로 `console.error` + 간단한 메시지 표시(예: "저장하지 못했습니다") 패턴을 따름, 공통 오류 컴포넌트는 없음 · 코드 검증: 부분 완료
- **관련 파일**: 각 기능 파일 산재
- **입력/출력**: -
- **DB/Storage**: -
- **의존 관계**: 없음(횡단 관심사)
- **보안 주의**: 오류 메시지에 내부 정보(SQL 오류 등)가 사용자에게 노출되지 않는지 — 코드상 `console.error`(개발자 콘솔)와 사용자 메시지(일반 문구)가 분리되어 있어 양호
- **완료 조건**: 공용 Error state 컴포넌트(Design.md 4-6 "아직 없는 것" 참고) 설계 시 함께 정리
- **비개발자 테스트**: 인터넷 연결을 끊고 저장을 시도했을 때 이해할 수 있는 오류 문구가 뜨는지

### 29. 접근성
- **목적**: 키보드/스크린리더 사용자도 이용 가능하게
- **현재 상태**: `[?]` — 일부 컴포넌트에 focus-visible 규칙 존재, 전면 감사 안 됨 · 코드 검증: 부분 완료
- **관련 파일**: `core/components/*.css`, `core/patterns/*.css`
- **입력/출력**: -
- **DB/Storage**: -
- **의존 관계**: 3
- **보안 주의**: 없음
- **완료 조건**: Design.md 4-8의 확인 필요 항목들 전수 점검
- **비개발자 테스트**: 마우스 없이 Tab 키만으로 로그인부터 글 작성까지 가능한지

### 30. 모바일 대응
- **목적**: 데스크톱/모바일 반응형
- **현재 상태**: `[-]` — 주요 화면(posts, admin, quote)에 `@media (max-width:600px)` 대응 존재, breakpoint 값이 화면마다(600px/900px) 다름 · 코드 검증: 완료
- **관련 파일**: `posts-mobile.css`, `admin-quote.css`, `customize/editor/editor.css` 등
- **입력/출력**: -
- **DB/Storage**: -
- **의존 관계**: 2(breakpoint 토큰화 시)
- **보안 주의**: 없음
- **완료 조건**: breakpoint 통일 여부 결정(Design.md 4-5 제안 참고)
- **비개발자 테스트**: 실제 스마트폰으로 주요 화면(로그인/글쓰기/발췌/설정)을 한 번씩 열어보기

### 31. 성능
- **목적**: 로딩 속도/응답성
- **현재 상태**: `[?]` — 별도 측정 기록 없음 · 코드 검증: 미실시(측정 도구 접근 불가)
- **관련 파일**: -
- **입력/출력**: -
- **DB/Storage**: -
- **의존 관계**: -
- **보안 주의**: 없음
- **완료 조건**: 측정 필요(Lighthouse 등) — 확인 필요
- **비개발자 테스트**: 체감상 페이지 전환이 느리게 느껴지는 화면이 있는지 기록해두기

### 32. 배포
- **목적**: Cloudflare Pages 배포, 커스텀 도메인 리다이렉트
- **현재 상태**: `[x]` — `_redirects`(SPA fallback), `functions/_middleware.js`(`*.pages.dev`→`imory.me` 301) · 코드 검증: 완료
- **관련 파일**: `_redirects`, `functions/_middleware.js`
- **입력/출력**: git push / 배포된 사이트
- **DB/Storage**: 없음
- **의존 관계**: 없음
- **보안 주의**: 없음
- **완료 조건**: -(유지)
- **비개발자 테스트**: `*.pages.dev` 원본 주소로 접속했을 때 `imory.me`로 자동 이동하는지

### 33. 테스트
- **목적**: 자동화된 코드 검증
- **현재 상태**: `[ ]` — `package.json`, 테스트 파일, CI 설정 전부 없음 · 코드 검증: 완료(부재 확인)
- **관련 파일**: 없음
- **입력/출력**: -
- **DB/Storage**: -
- **의존 관계**: -
- **보안 주의**: 없음
- **완료 조건**: 이번 범위 밖(빌드 도구 도입 자체가 기술 스택 변경에 해당하므로 신중한 별도 논의 필요) — 확인 필요
- **비개발자 테스트**: 해당 없음

### 34. 문서화
- **목적**: Concept/Design/ToDo 3종 문서 유지
- **현재 상태**: `[-]` — 이번에 처음 작성됨, 앞으로 코드가 바뀔 때마다 갱신 필요 · 코드 검증: 해당 없음
- **관련 파일**: `Concept.md`, `Design.md`, `ToDo.md`
- **입력/출력**: -
- **DB/Storage**: -
- **의존 관계**: 모든 모듈
- **보안 주의**: 없음
- **완료 조건**: 각 기능 변경 시 관련 섹션 갱신을 습관화
- **비개발자 테스트**: 해당 없음

---

## 5-4. DB 구조

> 원격 Supabase 프로젝트에 직접 접근하지 못했다. 아래는 **저장소(migration + 코드 사용처)에서 확인 가능한 범위**로 작성했다. `[?]`로 표시한 부분은 Supabase Dashboard에서 직접 확인이 필요하다.

### profiles
- 역할: 사용자 정체성(닉네임/slug/home_mode)
- PK: `user_id`(FK `auth.users.id`)
- 소유권 컬럼: `user_id`(본인)
- 주요 컬럼: `nickname`, `slug`(unique, 형식/길이 제약), `bio`, `home_mode`(`customize`\|`legacy_sua`, 기본값 `customize`), `onboarding_completed`, `terms_agreed_at`, `created_at`/`updated_at`
- 공개 읽기: `user_id,slug,nickname,bio,home_mode` 컬럼만 anon/authenticated select
- owner 쓰기: 없음(RPC `complete_onboarding` 전용, 직접 insert/update 불가)
- RLS: 있음(`20260830140000_*.sql`)
- 코드 사용처: `auth-callback.js`, `home/site-owner.js`, `onboarding.js`
- migration: 있음
- 확인 필요: 기존 sua 계정(`@sentbys_a`)의 실제 `home_mode` 값(기본값이 `customize`라 만약 아직 안 바꿨다면 `legacy_sua`로 수동 변경 필요)

### app_config
- 역할: 전역 설정(싱글턴, id=1)
- PK: `id`(smallint, 항상 1)
- 소유권 컬럼: 없음(전역)
- 주요 컬럼: `signup_open`(bool), `signup_opens_at`/`signup_closes_at`(timestamptz, 미사용)
- 공개 읽기: `id, signup_open`만
- owner 쓰기: 없음(대시보드에서 수동 변경만)
- RLS: 있음
- 코드 사용처: `auth-callback.js`
- migration: 있음

### home_customize
- 역할: 사용자별 홈 레이아웃 JSON
- PK: `user_id`(FK `profiles.user_id`)
- 소유권 컬럼: `user_id`
- 주요 컬럼: `layout_json`(jsonb — version/theme/contentArea/blocks 구조)
- 공개 읽기: `user_id, layout_json`
- owner 쓰기: 본인만(ALL, `auth.uid()=user_id`)
- RLS: 있음
- 코드 사용처: `complete_onboarding()` RPC(초기 생성)만 — 에디터 저장/공개 홈 렌더링 미연결
- migration: 있음

### posts
- 역할: 글 메타데이터
- PK: `id`(코드에서 bigint로 추정 — 확인 필요)
- 소유권 컬럼: `user_id`
- 주요 컬럼: `category_id`, `title`, `content_type`, `visibility`, `created_at`/`updated_at`, `quote_preset_id`, `secret_password_hash`(쓰기 전용)
- 공개 읽기: `secret_password_hash` 제외 전체(anon/authenticated)
- owner 쓰기: insert(제한 컬럼)/update(제한 컬럼)/delete
- RLS: 있음(정책 자체 SQL은 이 마이그레이션들에 없고, column-level GRANT만 906dcc1에 있음) — `[?]` 실제 RLS 정책 내용은 확인 필요
- 코드 사용처: `posts/editor/posts-save.js`, `posts/view/*.js`
- migration: 컬럼 권한만 있음(`20260902110000_*.sql`), 최초 CREATE TABLE 없음 `[?]`

### post_contents
- 역할: 글 본문(비밀글 보호를 위해 posts와 분리)
- PK: `[?]`(코드상 `post_id`로 upsert, 확인 필요)
- 소유권 컬럼: `post_id`를 통해 간접(직접 `user_id` 컬럼 여부 확인 필요)
- 주요 컬럼: `post_id`, `content`, `ooc_content`
- 공개/owner 권한, RLS: `[?]` 확인 필요
- 코드 사용처: `posts-save.js`, `posts-view-detail.js`, `posts-view-editor-load.js`
- migration: 없음 `[?]`

### categories
- 역할: 글 분류
- PK: `id`
- 소유권 컬럼: `user_id`(추정, 코드에서 필터에 사용)
- 주요 컬럼: `name`, `slug`, `sort_order`, `type`(post\|banner)
- 공개/owner 권한, RLS: `[?]` 확인 필요
- 코드 사용처: `home/categories.js`, `posts-view-list.js`, `posts-view-banner.js`
- migration: 없음 `[?]`

### banners
- 역할: 배너 카테고리 내 링크 카드
- PK: `id`
- 소유권 컬럼: `user_id`
- 주요 컬럼: `name`, `url`, `image_url`, `image_path`, `sort_order`, `category_id`
- 공개/owner 권한, RLS: `[?]` 확인 필요
- 코드 사용처: `posts/view/posts-view-banner*.js`
- migration: 없음 `[?]`

### quote_presets
- 역할: 발췌 스타일 프리셋
- PK: `id`
- 소유권 컬럼: `user_id`
- 주요 컬럼: `name`, `settings`(jsonb), `is_active`, `updated_at`
- 공개/owner 권한, RLS: `[?]` 확인 필요(코드 레벨 `.eq("user_id",...)` 필터만 확인됨)
- 코드 사용처: `admin/quote/*.js`, `posts/style/posts-style-preset.js`
- migration: 없음 `[?]`

### site_settings
- 역할: key-value 사이트 설정(파비콘/커서/BGM/타이틀/배너URL)
- PK: `[?]`(복합키 추정 `(user_id, key)`, `onConflict:"user_id,key"` 사용 확인)
- 소유권 컬럼: `user_id`
- 주요 컬럼: `key`, `value`
- 공개/owner 권한, RLS: `[?]` 확인 필요
- 코드 사용처: `home/bgm.js`, `home/site-meta.js`, `admin/settings/*.js`
- migration: 없음 `[?]`

### daily_visits
- 역할: 일별 방문 카운트
- PK: `[?]`
- 소유권 컬럼: `[?]`
- 주요 컬럼: `visit_count`(추정)
- 코드 사용처: `site-footer.js`(`increment_daily_visit_kst` RPC 사용)
- migration: 없음 `[?]`

---

## 5-5. 구현 순서

각 단계는 독립적으로 테스트·커밋 가능한 크기로 나눴다. 총 0~5단계, 하위 단계를 포함하면 10개 작업 단위다.

### 0단계 — [!] home_mode 렌더러 분기 (출시 전 필수, 최우선)

- **수정 예정 범위**: `index.html`의 홈 렌더링 로직(`loadSuaTheme`/`gateHomeByOwner` 주변)이 `profiles.home_mode`를 조회해 분기하도록 수정
- **선행 조건**: 없음(다른 단계보다 먼저 진행 가능)
- **완료 조건**(전부 충족):
  - `legacy_sua` 계정에서는 기존 sua 홈페이지가 그대로 표시됨
  - `customize` 계정에서는 sua 하드코딩 정보(다른 사람의 프로필·소개문)가 전혀 표시되지 않음
  - `customize` 계정인데 아직 `layout_json`이 없거나 손상된 경우 안전한 empty state(빈 화면 안내)가 표시됨(에러 화면이나 타인 정보 노출이 아님)
  - 존재하지 않는 slug는 기존 404/안내 동작을 그대로 유지
  - `profiles.home_mode` 조회 자체가 실패(네트워크 오류 등)했을 때 **타 사용자의 legacy_sua 화면으로 fallback하지 않음**(안전한 오류 상태로 처리)
  - 로그인 여부와 무관하게(로그인 상태든 비로그인 방문자든) 동일한 공개 홈페이지 결과가 보임
- **테스트 방법**: (a) 테스트용 신규 계정으로 가입 후 `/:slug` 접속 → sua 프로필이 아닌 안내 화면 확인, (b) sua 계정 자신의 `/:slug`도 정상 유지되는지 확인, (c) 존재하지 않는 slug로 접속해 기존과 동일하게 처리되는지, (d) 로그아웃 상태에서도 (a)(b)가 동일하게 보이는지
- **DB 작업 여부**: 없음(기존 컬럼 재사용). Supabase Dashboard에서 sua 계정의 `home_mode`가 `legacy_sua`로 되어 있는지 수동 확인 필요
- **예상 위험**: 낮음(읽기 전용 분기 추가) — sua 계정의 `home_mode` 값이 잘못돼 있으면 정작 sua 계정 자신의 홈이 깨질 수 있어 반드시 함께 테스트
- **커밋 단위**: 1개 커밋

### 1단계 — 공개 시작 페이지 기본 헤더와 로고

- **수정 예정 범위**: `index.html`의 랜딩(`.landing-screen`) 영역에 한정해 `imory` 로고(텍스트+CSS, serif 소문자, 우측 분홍 세로선, 라이트/다크 대응)를 구현
- **범위 제한**: 이번 단계는 **공개 시작 페이지에만** 적용한다. `auth/index.html`, `onboarding/index.html` 등 다른 화면의 `<h1>`은 이번 단계에서 함께 바꾸지 않는다 — 이 프로젝트는 빌드 과정이 없는 정적 구조라, 실제로 재사용되지 않는 마크업을 "동일한 로고 컴포넌트"라고 부르지 않는다. 다른 화면으로 확장할지, 확장한다면 이 정적 구조에 맞는 방식(예: 공통 fetch 삽입)을 어떻게 쓸지는 시작 페이지 디자인이 확정되고 사용자가 확인한 뒤 별도 후속 항목으로 진행한다.
- **선행 조건**: 없음
- **완료 조건**: 공개 시작 페이지에서 로고가 의도한 모양으로 보임
- **테스트 방법**: 랜딩 화면에서 로고가 소문자·serif·우측 분홍 선으로 보이는지(라이트/다크 각각)
- **DB 작업 여부**: 없음
- **예상 위험**: 낮음(순수 CSS, 범위가 시작 페이지 한 곳으로 한정됨)
- **커밋 단위**: 1개 커밋

### 2A단계 — 다크 모드 시스템 토큰

- **수정 예정 범위**: `core/design-tokens.css`에 dark용 `--system-*` semantic 토큰을 정의(기존 `--theme-*`는 건드리지 않고 분리 유지)
- **선행 조건**: 없음
- **완료 조건**: 다크 토큰 추가 후 기존 라이트 모드 화면에 시각적 회귀가 없음(토큰만 추가하고 아직 적용 로직은 없으므로 화면은 기존과 동일해야 함)
- **테스트 방법**: 주요 화면(관리자/에디터/온보딩)을 라이트 모드로 열어 기존과 동일하게 보이는지 확인
- **DB 작업 여부**: 없음
- **예상 위험**: 낮음(신규 토큰 추가만, 기존 참조 없음)
- **커밋 단위**: 1개 커밋(2B와 분리)

### 2B단계 — 테마 전환 로직과 버튼

- **수정 예정 범위**: `prefers-color-scheme` 감지, `data-theme` 속성 적용, localStorage 저장/복원, FOUC 방지 인라인 스크립트, 시작 페이지의 라이트/다크 토글 버튼(키보드로 조작 가능, `aria-label` 포함)
- **선행 조건**: 2A 완료(토큰이 있어야 전환 로직이 실제로 색을 바꿀 수 있음)
- **완료 조건**: 시스템 설정 자동 반영, 수동 전환, 새로고침 후 선택 유지 3가지 모두 동작, 키보드만으로 토글 가능
- **테스트 방법**: 4번 모듈의 비개발자 테스트 항목 참고
- **DB 작업 여부**: 없음
- **예상 위험**: 중간(전역 적용이라 기존 화면 색상 회귀 가능성) — 적용 후 전체 화면 육안 점검 필요
- **커밋 단위**: 1개 커밋(2A와 분리)

### 3단계 — SIGN IN과 기존 OAuth 진입 연결

- **수정 예정 범위**: 공개 시작 페이지에 SIGN IN 버튼 추가, 클릭 시 기존 `admin/admin-session.js`의 Google OAuth 흐름 재사용
- **선행 조건**: 1단계(로고)와 독립적으로 진행 가능
- **완료 조건**: 비로그인 방문자가 랜딩에서 바로 로그인 시작 가능
- **테스트 방법**: 랜딩에서 SIGN IN 클릭 → Google 계정 선택 → 관리자 또는 온보딩으로 정상 이동(이 시점까지는 가입 제어 로직(4A~4D)이 아직 없으므로 누구나 온보딩까지 진행됨 — 정상)
- **DB 작업 여부**: 없음
- **예상 위험**: 낮음(기존 OAuth 로직 재사용)
- **커밋 단위**: 1개 커밋

### 4A단계 — 서버 측 가입 가능 여부 판정 함수

- **수정 예정 범위**: `signup_open` + `signup_opens_at`/`signup_closes_at`(서버 시각 기준)을 검사하는 SQL 함수를 새로 작성(예: `is_signup_open()`) — Hook과 RPC 양쪽에서 공유해 재사용
- **선행 조건**: 없음(0~3단계와 독립적)
- **완료 조건**: 함수가 세 가지 케이스(기간 전 / 기간 중 / 기간 후)를 정확히 판정
- **테스트 방법**: SQL Editor에서 `app_config` 값을 바꿔가며 함수를 직접 호출해 결과 확인(개발자 작업, 사용자는 결과만 보고받음)
- **DB 작업 여부**: 있음(신규 함수 migration)
- **예상 위험**: 낮음(신규 함수, 기존 로직 미변경)
- **커밋 단위**: 1개 커밋(migration)

### 4B단계 — Before User Created Hook 연결

- **수정 예정 범위**: Supabase Dashboard의 Auth Hooks 설정에서 Before User Created Hook을 활성화하고 4A 함수를 호출하도록 연결. **Hook 함수 작성(SQL/Edge Function)과 Dashboard에서 Hook을 활성화하는 작업은 서로 다른 단계이므로 구현 시 분리해서 진행**(함수만 만들고 Dashboard 연결을 깜빡하면 아무 효과가 없음)
- **선행 조건**: 4A 완료
- **완료 조건**: 가입 기간이 아닐 때 신규 Google 계정으로 로그인 시도 시 **`auth.users`에 계정 자체가 생성되지 않음**(단순히 온보딩 화면만 막히는 것이 아님), 기존 사용자 로그인은 영향 없음
- **테스트 방법**: 가입 기간을 닫아둔 상태에서 새 Google 계정으로 로그인 시도 → 로그인 자체가 거부되는지, Supabase Dashboard → Authentication → Users에 그 계정이 생성되지 않았는지 확인. 이어서 기존 계정으로 로그인해 정상 동작 확인
- **DB 작업 여부**: 있음(Supabase Dashboard 설정 — migration 파일로 표현되지 않는 대시보드 전용 설정일 가능성이 높음, **확인 필요**)
- **예상 위험**: 높음(인증 흐름 전체에 영향 — 설정 실수 시 모든 신규/기존 로그인이 막힐 수 있음) — 반드시 테스트 계정으로 먼저 검증
- **커밋 단위**: Hook 함수 migration 1개 + Dashboard 설정 변경(코드 커밋 없음, 설정 변경 사실을 별도로 기록)

### 4C단계 — complete_onboarding() 서버 측 재검사

- **수정 예정 범위**: `complete_onboarding()` RPC 내부에 4A 함수 호출을 추가해, Hook 설정 누락이나 RPC 직접 호출 상황에서도 가입이 닫혀 있으면 `profiles` 생성을 거절
- **선행 조건**: 4A 완료(4B와는 독립적으로 진행 가능 — 3중 방어 중 하나이므로)
- **완료 조건**: 가입이 닫힌 상태에서 RPC를 직접 호출해도 `profiles`가 생성되지 않음
- **테스트 방법**: (개발자 작업) 가입 기간을 닫아둔 상태에서 RPC를 직접 호출해 오류가 반환되는지 확인
- **DB 작업 여부**: 있음(RPC 수정 migration)
- **예상 위험**: 중간(기존 온보딩 로직 회귀 가능) — 테스트 계정으로 정상 가입 흐름도 함께 재확인 필요
- **커밋 단위**: 1개 커밋(migration)

### 4D단계 — auth callback의 화면 분기 및 안내

- **수정 예정 범위**: `auth-callback.js`가 4A 판정 결과(boolean뿐 아니라 기간 정보)를 반영해 상황별 안내 문구를 다듬음(예: "아직 가입 기간이 아닙니다" / "가입이 마감되었습니다")
- **선행 조건**: 4A 완료
- **완료 조건**: 상황에 맞는 안내 문구가 표시됨(제안, 필요 시)
- **테스트 방법**: 데스크톱/모바일 브라우저 양쪽에서 랜딩 → 가입 시도 → 안내 문구까지 전체 흐름 확인
- **DB 작업 여부**: 없음
- **예상 위험**: 낮음
- **커밋 단위**: 1개 커밋

### 5단계 — 데스크톱·모바일·기존/신규 사용자 통합 검증

- **수정 예정 범위**: 없음(코드 변경 없이 검증만)
- **선행 조건**: 0~4D 전체 완료
- **완료 조건**: 데스크톱·모바일 × 기존 사용자·신규 사용자 조합 전체에서 의도한 대로 동작
- **테스트 방법**: (1) 데스크톱+기존 사용자, (2) 데스크톱+신규 사용자(가입 기간 중/후 각각), (3) 모바일+기존 사용자, (4) 모바일+신규 사용자 — 각각 로그인부터 온보딩/차단까지 전체 흐름 확인
- **DB 작업 여부**: 없음
- **예상 위험**: 낮음(검증 전용)
- **커밋 단위**: 없음(검증 중 발견된 문제는 별도 수정 커밋)

> 위 0~5단계(하위 단계 포함 총 10개 작업 단위) 전체는 **이번 문서화 세션에서 구현하지 않는다.** 사용자 확인 후 별도 세션에서 진행한다.

---

## 5-6. 보안 우선 확인

### 출시/가입 개방 전 필수

- `[!]` **모든 owner에게 sua 마크업이 그대로 노출되는 문제** — 다른 사용자 홈에 `@sentbys_a`의 실명/소개문이 노출됨(5-5 0단계로 해결)
- `[!]` **Before User Created Hook 미구현** — 신규 `auth.users` 생성 자체를 서버 측에서 막는 장치가 없다(5-5 4B단계로 해결)
- `[!]` **현재 callback 차단만으로는 auth.users 신규 생성 차단을 보장하지 못함** — `auth-callback.js`의 `signup_open` 검사는 온보딩 진입(가입 3단계 중 ②~③)만 막을 뿐, ①단계(Supabase Auth 계정 생성) 자체는 막지 못한다. 이를 "가입 차단"으로 표현하지 않는다(Concept.md 11번, 10번 모듈 참고)
- `[!]` **complete_onboarding()의 가입 상태 재검사 필요** — 현재 RPC는 `signup_open`/기간을 검증하지 않아, Hook이 없는 상태에서 RPC를 직접 호출하면 가입이 닫혀 있어도 `profiles`가 생성될 수 있다(5-5 4C단계로 해결)
- `[?]` **posts/categories/banners/quote_presets/site_settings/post_contents/daily_visits의 RLS 정책** — migration 파일에 없어 저장소만으로는 검증 불가, Supabase Dashboard에서 직접 확인 필요(26번 모듈)
- `[?]` **SECURITY DEFINER 함수의 search_path** — `complete_onboarding()`은 `SET search_path TO 'public'` 확인됨(안전). `set_post_secret_password`/`get_secret_post_content`/`increment_daily_visit_kst`는 대시보드에서 직접 생성되어 저장소에 원본이 없음 — search_path 설정 여부를 Dashboard에서 직접 확인 필요
- `[x]` **anon/authenticated 권한** — profiles/app_config/home_customize/posts는 column-level GRANT로 정리됨(확인 완료)
- `[?]` **Storage 경로 소유권** — favicons/cursors/banners 모두 `storage.foldername(name)[1]=auth.uid()::text` 방식으로 owner-only 쓰기 확인됨(favicons/cursors는 migration 확인, banners는 정책 내용이 주석 인용으로만 확인되고 실제 정책 SQL은 저장소에 없음 — `[?]`)
- `[?]` **OAuth redirect 허용 목록** — Supabase 대시보드 설정 사항, 저장소에서 확인 불가
- `[x]` **service_role key의 브라우저 노출 금지** — 전체 코드에 service_role 키 없음(확인 완료)
- `[x]` **기존 사용자와 profiles 연결** — `user_id`(FK `auth.users.id`)로 정상 연결
- `[x]` **관리자 인증** — 하드코딩된 admin 계정 없음, Supabase Auth 세션만 사용(확인 완료)
- `[x]` **비밀글 보호** — RPC 기반 검증, 컬럼 직접 노출 차단(906dcc1로 완료)
- `[?]` **데이터 손실 가능성** — 별도 백업 정책 확인 안 됨(DATA 탭의 백업 기능 자체가 미구현)
- `[-]` **멀티유저 소유권 오류** — 쓰기 경로(코드 레벨)는 `user_id` 필터가 일관되게 적용되어 있음을 확인했으나, 일부 테이블의 DB 레벨 RLS가 아직 미확인이라(위 RLS 정책 항목 참고) "완전히 검증됨"으로 표시하지 않는다

### 일반 버그 및 기술부채(순서 미정, backlog)

- MY BANNER 관련 UI 문구가 "공개 노출"을 암시하는 표현을 쓰고 있는지 검토(Q3 결정 반영)
- `RESERVED_SLUGS`가 JS/SQL 두 곳에 수동 이중화 — 단일 소스 불가(빌드 스텝 없음)로 인한 구조적 위험
- 누락된 6개 테이블의 migration 백필(27번 모듈)
- 비밀글 RPC 2종의 원본 SQL을 migration으로 백필
- Core 컴포넌트(Button/Input) 미적용 화면 정리, 주석 최신화
- breakpoint(600px/900px) 불일치 정리
- posts 에디터 저장 버튼의 Core 컴포넌트 전환 여부 결정
- Storage 버킷 파일 크기/mime 제한 없음 — 남용 가능성 낮은 우선순위로 검토

---

## 5-7. 테스트 작성 방식

각 모듈 명세의 "비개발자 테스트" 항목이 기본 형식이다. 공통 원칙:

- **어디에 접속하는지**: 정확한 화면 경로(`/`, `/auth/`, `/onboarding/`, `/admin/`, `/:slug`)를 명시
- **무엇을 누르는지**: 버튼/링크의 실제 라벨 텍스트 기준으로 안내
- **정상 시 화면**: 기대 결과를 구체적으로(어떤 문구, 어떤 화면 전환)
- **비정상 시 화면**: 오류 메시지 문구까지 명시(코드에서 확인한 실제 문구 인용)
- **모바일 확인**: 별도 필요 시에만 표기(대부분의 모듈은 데스크톱 확인으로 충분, 21/30번처럼 모바일 전용 동작이 있는 모듈만 별도 표기)
- **Supabase Dashboard 확인**: Table Editor/Storage/Policies 중 어디를 봐야 하는지 구체적으로
- **SQL 실행이 필요한 경우**: 어떤 SQL Editor에 무엇을 붙여넣는지(현재 문서에서는 5-6의 `[?]` 항목 확인용 조회 SQL이 필요 — 실행 전 반드시 사용자 승인 필요, 이 문서 작성 세션에서는 실행하지 않음)

아직 테스트하지 않은 기능은 "구현 완료"라고 쓰지 않는다(5-1 검증 수준 원칙과 동일).
