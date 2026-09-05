# AI SKIN — PHASE 1B 설계 문서 (Skin Studio Foundation)

> 전제: `AI_SKIN_PHASE1A_DESIGN.md`(HOME 렌더 경로, Slice 0~5)가 이미 구현 완료된 상태(`8c7bd83`)에서 시작한다. Slice 0(Draft Write RPC 4종)과 Slice 1(Studio 진입점 + 최초 진입 판별)은 이미 실제 구현/검증까지 끝났다 — 이 문서는 그 이후(Slice 2~)에 대한 **설계**를 다룬다.
> 범위: `IMORY_AI_SKIN_CUSTOMIZE_PLAN.md`의 PHASE 2(Static Skin Engine)와 PHASE 4(Start Questionnaire)를 합쳐, "Studio에서 실제로 Skin을 만들고 Draft까지 저장할 수 있게 하는" 하나의 묶음으로 재구성한다. **아직 하지 않는 것**: OpenAI 연동(PHASE 5), AI 채팅 수정(PHASE 6), Region 선택/부분 편집(PHASE 7), Image Library(PHASE 3), Version History/Restore UI(1B 이후 후속 Slice), 여러 Skin 관리 UI, 전체 사용자 대상 Publish 롤아웃.
>
> **v2 개정**: 최초 버전 대비 (1) Questionnaire 3문항으로 축소, (2) Studio를 "Preview 중심 풀스크린" UX로 전면 재설계, (3) PHASE 1B 완료 범위를 Draft 저장까지로 축소(Publish는 선택적 최소 구현), (4) 여러 Skin/Settings 이관/Carrd 에디터 제거는 방향만 문서화하고 구현 범위에서 제외.
>
> **v4 개정(폐기됨, v5가 뒤집음)**: Questionnaire의 주 진입 경로를 Studio에서 onboarding 마지막 단계로 옮기려 했던 라운드 — v5에서 다시 뒤집혔다(아래).
>
> **v5 개정(이 라운드, 최종)**: 가입 직후 사용자가 가장 먼저 보는 것은 관리자 화면이 아니라 **자기 공개 HOME**이다. `complete_onboarding()` 성공 후 이동 대상만 `/admin/` → `/<slug>` HOME으로 바뀐다(RPC 자체는 무수정, 3절). Questionnaire는 onboarding에 넣지 않고 **Studio 전용**으로 되돌린다(7절) — 대신 본인 HOME에서 active Skin이 없으면 가벼운 꾸미기 유도 popup을 새로 띄워 Studio로 유도한다(4절). 신규 가입자의 공개 HOME이 "Publish 전까지 `home_customize`를 보여준다"는 것도 더 이상 장기 계약으로 문서화하지 않는다 — `home_customize`는 legacy 과도기 데이터일 뿐이고, "Skin 없는 상태"의 진짜 기본 HOME은 후속 Slice에서 새 Skin 시스템 기준으로 별도 설계한다(14절). 18절에 v4→v5 변경 이력을 정리했다.

---

## 0. PHASE 1A 이후 바뀐 전제 — 먼저 짚어야 할 것

(v1과 동일, 변경 없음)

설계를 시작하기 전에, 실제 구현이 `AI_SKIN_PHASE1A_DESIGN.md` 원문에서 한 가지 중요하게 벗어난 지점이 있다. 이걸 모르고 Phase 1B를 설계하면 잘못된 가정 위에 짓게 된다.

**`renderSkin()`은 이제 호출될 때마다 항상 재검증한다 (Slice 3.5 보강).** 원 설계 문서 7-2절은 "css-tree는 저장 시점에만 필요하고 공개 HOME은 로드하지 않는다"고 썼지만, 실제 `skin/skin-render.js`는 `skin-css-validate.js`를 정적 `import`해서 **렌더할 때마다** `validateAndScopeSkinCss()`를 실행한다(공개 HOME 포함). 이유는 주석에 명시되어 있다 — "DB에 저장된 row가 Studio UI를 우회해서 들어왔을 수도 있으니, 저장 시점 검증을 신뢰하지 않고 렌더 시점에 항상 재검증한다."

이게 Phase 1B 설계에 두 가지로 유리하게 작용한다:

1. **Studio Preview는 저장하지 않은 draft(타이핑 중인 코드)를 그대로 `renderSkin()`에 넘겨도 안전하다** — 별도의 "미리보기 전용 약식 검증"을 새로 만들 필요가 없다. 저장 왕복 없이 "입력 → 즉시 미리보기" UX가 그대로 된다(8절).
2. **`renderSkin()`은 호출마다 고유한 CSS scope namespace를 자동 생성한다** — 다만 이번 v2에서는 Desktop/Mobile을 **동일 iframe 안에서 뷰포트 크기만 바꾸는 방식**으로 재설계했으므로(10절), 이 자동 namespace 분리 기능은 "한 문서 안에 여러 인스턴스가 동시에 뜨는" 상황(예: 향후 버전 히스토리 비교)에서만 의미를 가진다 — Phase 1B의 Desktop/Mobile 전환 자체에는 필요 없어졌다(10절에서 상세).

즉 Phase 1B는 렌더러 쪽을 전혀 건드릴 필요가 없다 — **`renderSkin()`/`buildSkinContext()`/sanitizer/validator 넷 다 이미 Studio가 그대로 소비할 수 있는 계약을 갖추고 있다.** 이번 단계는 순수하게 "그 위에 쓰기(write) 흐름 + UI"를 얹는 작업이다.

---

## 1. 현재 Customize/Settings 진입점 현황과 장기 전환 방향

### 1-1. 현재 구조 (조사 결과, 변경 없음)

- 공개 진입점은 없다 — Customize/Settings는 항상 `admin/index.html` 안에서만 접근한다(admin 로그인 필요).
- `admin/index.html`의 `#adminHome` 메뉴: `01 SETTINGS` / `02 QUOTE PRESET` / `03 CUSTOMIZE` / `04 INQUIRY`. `03 CUSTOMIZE` → `admin.js`의 `showCustomizePanel()` → `<iframe src="../customize/editor/index.html">`.
- `01 SETTINGS`는 4개 그룹(`categorySettingsPanel`/`homeSettingsPanel`/`dataSettingsPanel`)으로 나뉘고, `homeSettingsPanel` 안에 **블로그 타이틀 / 파비콘 / 커서 / BGM / MY 배너** 5개 그룹이 들어있다(`admin/index.html` HOME 탭). 각각 `admin/settings/admin-favicon.js`, `admin-my-banner.js`, `admin-settings-save.js`가 개별 처리 — Storage 업로드 로직이 3곳에 복붙되어 있음(`AI_SKIN_AUDIT.md` 1-5절).
- `customize/editor/*`(4637줄 `editor.js`)는 완전히 독립된 document로 iframe 안에서 동작. 보안 경계 아님(단순 document 분리).

### 1-2. 장기 전환 방향 (이번 라운드 결정 — **방향만, Phase 1B 구현 범위 아님**)

이번 대화에서 확정된 제품 방향을 기록해 둔다. **PHASE 1B에서는 아래 이동/삭제를 실제로 구현하지 않는다** — Skin Studio가 안정화된 뒤 별도 Phase(가칭 PHASE 1C 또는 PHASE 1Z 계열)에서 처리한다.

| 항목 | 현재 위치 | 장기 방향 |
|---|---|---|
| 블로그 타이틀 | SETTINGS | **SETTINGS에 유지** — 텍스트 메타데이터 성격(브라우저 탭 제목)이라 "외형 꾸미기"보다 사이트 정체성/설정에 가깝다는 판단 |
| 파비콘 | SETTINGS | CUSTOMIZE(신규 Skin Studio)로 이동 후보 |
| 커서 | SETTINGS | CUSTOMIZE로 이동 후보 |
| BGM | SETTINGS | CUSTOMIZE로 이동 후보 |
| MY 배너 | SETTINGS | CUSTOMIZE로 이동 후보 |
| 기존 Carrd형 `customize/editor/*`(HOME/PROFILE 블록 편집기) | admin `03 CUSTOMIZE` | **Skin Studio가 안정적으로 동작하면 제거** — `AI_SKIN_AUDIT.md` 13-4절이 이미 정해둔 "코드 정리 → 유예 기간 → DB 정리" 순서를 그대로 따른다 |

**이렇게 나누는 근거**: 파비콘/커서/BGM/배너 4개는 전부 "사용자 공개 화면의 표현"에 관여하는 설정이라, 장기적으로는 Skin Package(3절, `imageSlots`나 별도 Skin-level 설정 개념)에 흡수되는 편이 "Skin 하나가 공개 화면 전체 표현을 담당한다"는 플랜 3조 원칙과 일치한다. 반대로 블로그 타이틀은 `site.title`로 Skin Context에 이미 노출되고 있지만(값의 **출처**는 여전히 `site_settings`) 값 자체를 사용자가 입력/변경하는 행위는 디자인이 아니라 사이트 설정이므로 SETTINGS 잔류가 자연스럽다.

이 표는 Phase 1B 착수 여부와 무관한 **참고 로드맵**이다 — 16절 Slice 계획 어디에도 이 이동 작업은 포함되지 않는다.

**Phase 1B와의 관계**: 신규 Skin Studio 진입점은 이 절의 현재 구조와 별개로, 아래 2절 방식(admin 셸 안 새 패널 + iframe)으로 추가한다 — 기존 `03 CUSTOMIZE`/`01 SETTINGS`는 이번 Phase에서 전혀 건드리지 않는다.

---

## 2. 새 Skin Studio를 둘 위치

### 2-1. 최상위 디렉토리: 새로 `studio/`

`skin/`(엔진: context/render/sanitize/validate, UI 없음) vs `customize/renderer`(엔진) + `customize/editor`(UI) 구조를 이미 프로젝트가 쓰고 있다. 같은 원칙을 따르되, **v5에서 Questionnaire의 유일한 위치가 다시 Studio(및 그 트리거인 HOME popup)로 확정되면서** 아래처럼 정리했다(3/4/7절에서 이유 상세):

- `skin/` — 기존 파일은 **건드리지 않는다.** 다만 여기에 `skin-generator.js`(순수 answers→SkinPackage 변환)와 `skin-initializer.js`(그 결과를 검증 후 RPC로 저장하는 시퀀스) **2개를 새로 추가**한다 — 둘 다 UI 없는 순수 Skin 도메인 로직이라 `skin/`이 이미 표방하는 "엔진 레이어" 경계에 그대로 들어맞는다(7절). 지금은 Studio fallback이 유일한 호출자지만, DOM/redirect와 무관하게 분리해 둬야 나중에 다른 진입점이 생겨도 복제 없이 재사용할 수 있다.
- `skin-questionnaire/` (신설, 최상위) — Studio fallback이 쓰는 Questionnaire UI 모듈. `studio/` 밑에 두지 않는 이유는 그대로 유지한다 — "UI지만 Studio 셸의 세부사항은 아닌" 컴포넌트라는 성격이 이후 다른 진입점이 생겨도 흔들리지 않게 하기 위함이다(YAGNI로 지금 두 번째 소비자를 미리 만들지는 않는다, 7-3절).
- `home/` — 신규 `home-skin-prompt.js`(+`.css`) 1개 추가. 본인 HOME + active Skin 없음일 때만 뜨는 꾸미기 유도 popup(4절) — Questionnaire 자체는 포함하지 않고 Studio로 유도만 한다.
- `onboarding/` — **거의 건드리지 않는다.** `onboarding.js`의 성공 리다이렉트 대상 한 줄만 바뀐다(3절) — 새 섹션/스텝 마크업은 추가하지 않는다.
- `studio/` (신설) — Studio 셸 + Studio 전용 쓰기 로직. Slice 1에서 이미 구현된 `studio-state.js`의 "skin 없음" 분기가 Slice 2부터 `skin-questionnaire/`를 실제로 마운트한다.

```
skin/
  (기존 파일 그대로: skin-context.js/skin-render.js/skin-sanitize.js/skin-css-validate.js/skin-home.js)
  skin-generator.js          — NEW. generateInitialSkin(answers) -> SkinPackage (순수 함수, 7-3절)
  skin-initializer.js        — NEW. createInitialSkinFromAnswers(answers) -> Promise<{ skinId }>
                                 (generate→sanitize→validate→create_skin_with_initial_version RPC, 7-3절)

skin-questionnaire/          — NEW. Studio fallback이 쓰는 Questionnaire UI
  questionnaire.js           — mountSkinQuestionnaire(container, { onSubmit }) (7-4절)
  questionnaire.css

home/
  home-skin-prompt.js        — NEW. 본인 HOME + active Skin 없음일 때 뜨는 꾸미기 유도 popup(4절)
  home-skin-prompt.css       — NEW

onboarding/
  onboarding.js               — 성공 리다이렉트 대상만 `/admin/` → `buildSitePath(slug, "/")`로 변경(3절). 그 외 무수정.

studio/
  index.html                 — Studio 셸 (admin iframe이 로드, 11절 풀스크린 Preview 구조) — 구현 완료(Slice 1)
  studio.css                 — 구현 완료(Slice 1)
  studio-state.js            — 현재 skin/draft 상태 로드, 진입 판별(5절) — 구현 완료(Slice 1).
                                 "skin 없음" 분기가 Slice 2부터 skin-questionnaire/를 직접 마운트한다.
  studio-write.js            — RPC 호출 래퍼(save, 8절 — publish는 최소 연결만) — Slice 4
  preview/
    preview-frame.html       — **단일** 프리뷰 문서 (11절 — Desktop/Mobile 겸용, viewport만 전환) — Slice 3
    preview-bridge.js         — 부모↔iframe postMessage 연결 — Slice 3
  editor/
    code-editor.js           — HTML/CSS textarea 기반 단순 modal (12절) — Slice 4
```

`history/`(버전 히스토리/Restore)는 **이번 Phase 1B 파일 구조에서 제외**한다 — 후속 Slice에서 추가할 자리로만 비워둔다(17절 Slice 계획 참고).

이 구조는 나중에 `customize/*` 전체를 삭제해도(`AI_SKIN_AUDIT.md` 13-4절, 1-2절 장기 방향) `studio/`가 `skin/`/`skin-questionnaire/`만 참조하므로 전혀 영향받지 않는다. `home/home-skin-prompt.js`는 `skins` 테이블 존재 여부만 확인할 뿐 `skin/`/`skin-questionnaire/`/`studio/` 어디도 import하지 않는다(4절) — HOME은 Studio로 "유도"만 하고 Questionnaire를 직접 다루지 않으므로 결합이 생기지 않는다.

### 2-2. Admin 진입 방식: iframe embed (기존 패턴 재사용, 변경 없음 — 구현 완료/Slice 1)

`05 SKIN STUDIO` 메뉴를 유지한다(이번 라운드에서 재확인됨). `admin/index.html`에 additive 추가:

```html
<button class="admin-menu-item" id="openSkinStudioButton" type="button">
  <span class="menu-number">05</span>
  <span class="menu-copy"><strong>SKIN STUDIO</strong><small>AI (beta)</small></span>
  <span class="menu-arrow">→</span>
</button>
```

```html
<section class="admin-view" id="skinStudioPanel" hidden>
  <iframe id="skinStudioFrame" src="../studio/index.html" title="SKIN STUDIO"></iframe>
</section>
```

`admin.js`에 `showSkinStudioPanel()`을 기존 `showCustomizePanel()`과 동일한 모양으로 추가. **기존 `03 CUSTOMIZE`/`01 SETTINGS`는 그대로 둔다** — 1-2절 장기 방향은 별도 Phase의 몫.

**결정됨(이번 라운드): `#skinStudioPanel`은 거의 풀스크린으로 구성한다.** 다른 admin 패널(SETTINGS/QUOTE/CUSTOMIZE)이 쓰는 `view-top`(뒤로가기+제목 heading 줄) + 여백 있는 본문 레이아웃을 그대로 따르지 않는다:

- `<iframe id="skinStudioFrame">`이 패널 안에서 **화면 전체**를 차지하도록 admin 공통 헤더/footer/패딩을 전부 숨긴다(`admin-shell.css` `.skin-studio-mode`).
- **admin 바깥쪽 back row(`.skin-studio-top`)는 Studio 모드에서 시각적으로 완전히 숨긴다**(`display:none`) — back 버튼은 이제 `studio/index.html` 안쪽 Top Dock(11-3절)이 담당하고, 클릭 시 `postMessage({type:"studio:back"})`로 이 admin 문서(`admin-session.js`)에 알려 `showAdminHome()`을 호출한다. 바깥쪽 back을 그대로 뒀다면 back 버튼이 이중으로 보였을 것이므로 숨긴 것 — 마크업/JS 자체(`skinStudioBackButton` 등)는 iframe 로드 실패 등을 대비한 안전망으로 그대로 남겨둔다.
- 다른 패널처럼 큰 `<h2>CUSTOMIZE</h2>` 제목 줄이나 설명 텍스트 영역은 만들지 않는다.
- 즉 admin 레벨에는 이제 그 어떤 chrome도 남지 않고, `studio/index.html` iframe이 11절의 풀스크린 Preview UX를 그대로 이어받는 구조다 — admin chrome과 Studio chrome이 이중으로 여백/제목/back 버튼을 쌓지 않는다.

---

## 3. 가입 완료 후 이동 경로 — onboarding은 redirect 한 줄만 변경 (v5 재설계)

### 3-1. 현재 onboarding 흐름 (조사 결과, v4와 동일)

1. **진입 판별은 `auth/auth-callback.js`가 전담한다.** OAuth 콜백 직후 세션을 확인하고, `profiles` row 존재 여부로 딱 세 갈래로 나눈다: 세션 없음 → `/admin/`, 세션 있음 + `profiles` 있음(기존 회원) → 초대 토큰 즉시 폐기 후 자신의 공개 홈(`/<slug>`)으로, 세션 있음 + `profiles` 없음 + `get_signup_availability()` true → `/onboarding/`. **기존 회원은 이 경로를 다시 타지 않는다** — Studio fallback이 필요한 이유(5절)가 바로 이 지점이다.
2. **`onboarding/index.html`은 단일 화면이다.** `.login-box` 하나에 닉네임/슬러그 입력 + "시작하기" 버튼뿐, 여러 단계를 오가는 라우팅/스텝 머신이 없다. `onboarding.js` 최상단의 `guardOnboardingSession()`이 비로그인 방문자만 되돌려보낸다.
3. **제출은 RPC 호출 1번뿐이다.** `onboarding.js`의 제출 핸들러가 `complete_onboarding(p_nickname, p_slug, p_bio=null, p_invite_token)` 하나만 호출하고, 성공하면 `clearStoredInviteToken()` 후 지금은 `window.location.href = "../admin/"`.
4. **`complete_onboarding()`(최신: `20260903200000_fix_onboarding_profile_check_order.sql`)은 단일 트랜잭션 안에서 이 순서로 실행된다**: (1) `auth.uid()` 확인 → (2) `profiles` row 존재 여부로 즉시 거절("profile already exists") → (3) `is_signup_open()`이 false일 때만 초대 토큰을 원자적으로 검증+소비 → (4) 닉네임/슬러그 형식·예약어 검증 → (5) `profiles` INSERT(`onboarding_completed = true` 확정) → (6) `home_customize` INSERT(하드코딩된 기본 Carrd 레이아웃, 14절에서 이 값의 위상을 다시 정리).
5. 함수 본문 어디에도 `skins`/`skin_versions` 참조가 없다 — Skin 도메인과 onboarding 도메인은 이미 DB 레벨에서 완전히 분리되어 있다.
6. 리다이렉트 대상은 지금 신규 회원만 `/admin/`이고 기존 회원(auth-callback.js 분기)은 `/<slug>`다 — **이 비대칭을 이번 라운드에서 없앤다(3-2절).**

### 3-2. 변경 내용 — redirect 대상만 교체

- `onboarding.js`의 성공 분기에서 `window.location.href = "../admin/"`를 `window.location.href = buildSitePath(slug, "/")`로 교체한다 — 제출 핸들러가 이미 로컬 변수로 들고 있는 `slug`를 그대로 재사용하며, `auth-callback.js`의 기존 회원 리다이렉트와 완전히 동일한 헬퍼/패턴이다.
- `onboarding/index.html`에 `core/lib/site-path.js` 스크립트 태그 1개만 추가한다(현재 로드하지 않음 — `auth/index.html`은 이미 로드 중, 같은 패턴 재사용).
- 그 외(입력 검증, RPC 호출, 에러 메시지, invite 토큰 폐기 시점)는 손대지 않는다. **`complete_onboarding()` SQL/RPC 자체도 수정하지 않는다.**
- Questionnaire는 이 문서/이 페이지 어디에도 없다 — Questionnaire의 유일한 위치는 이제 Studio(및 그 트리거인 4절 HOME popup)뿐이다.

---

## 4. 가입 직후/재방문 시 HOME 꾸미기 유도 popup (v5 신규)

### 4-1. 노출 조건 — 무엇을 재사용할 수 있는가

공개 HOME(`index.html`)은 이미 `home/site-owner.js`의 `getSiteOwner()`로 "이 페이지가 누구 것인지"(`ownerId`)를 알고 있지만, **"지금 보는 사람이 그 소유자 본인인지"는 어디에서도 확인하지 않는다** — 공개 HOME은 원래 익명 방문자를 전제로 설계됐기 때문이다. `index.html`은 이미 `core/lib/auth-shared.js`/`supabaseClient`를 전역으로 로드해 두고 있어 새 세션 조회에 별도 스크립트 로드가 필요 없다.

popup은 두 조건이 **모두** 참일 때만 뜬다:
1. **본인 확인** — `supabaseClient.auth.getSession()`의 `session.user.id`가 `getSiteOwner()`의 `ownerId`와 일치(로그아웃 방문자/다른 사람의 HOME은 자동으로 제외 — 17절 테스트 C/G)
2. **Skin 없음** — `skins` 테이블에 `is_active=true` row가 없음(`studio/studio-state.js`와 동일한 owner-RLS 조회 재사용)

### 4-2. 노출 빈도 정책 — 세션당 1회, 새 DB flag 없이

**추천: sessionStorage 기반, "이번 브라우저 세션에서 아직 안 봤으면 보여준다."** 별도 DB 컬럼(`profiles.skin_prompt_dismissed_at` 등)은 이번 Slice에서 만들지 않는다:

- 가입 직후 1회만 보여주고 다시는 안 보여주면, "나중에"를 누른 사용자를 다시 유도할 방법이 없다.
- 매 로드마다 보여주면 Skin 없이 방치되는 기간이 길어질수록 성가신 UI가 된다.
- **sessionStorage 키 하나**(`skinPrompt:dismissed`)로 "이번 세션에서 닫았는지"만 기억하면, 같은 세션(탭 유지) 안에서는 재노출 없이 조용하고, 새 세션(다음 방문)에서는 Skin이 여전히 없는 한 자연스럽게 다시 상기시킨다 — 서버 상태를 하나도 늘리지 않는 가장 단순한 정책이다.
- Skin이 실제로 생기면(4-1의 조건 2 자체가 거짓이 됨) popup은 그 어떤 세션 상태와도 무관하게 영구적으로 멈춘다 — 이게 진짜 "그만 보여줘야 하는" 신호이고, sessionStorage는 그 사이를 메우는 보조 장치일 뿐이다.

### 4-3. UI

- 위치/톤: 기존 signup/home 계열 팝업과 톤을 맞춘 작은 modal — Studio의 "거의 풀스크린"과 분명히 대비되는 가벼운 카드, 큰 onboarding wizard처럼 보이지 않게.
- 문구 고정: `"아직 홈을 꾸미지 않았어요.\n내 취향에 맞는 첫 스킨을 만들어볼까요?"`
- 버튼: `꾸미러 가기` / `나중에`
- `꾸미러 가기` 클릭 시: `sessionStorage.setItem("admin-current-view", "skin-studio")`를 세팅한 뒤 `admin/`으로 이동한다 — `admin.js`가 이미 갖고 있는 `restoreAdminView()`/`admin-current-view` 복원 메커니즘(로그인 후 마지막으로 보던 큰 화면을 그대로 복원하는 기존 기능, Slice 1)을 **그대로 재사용**하는 것뿐이다. admin 쪽에는 새 쿼리 파라미터 처리나 새 진입 로직을 추가하지 않는다.
- `나중에` 클릭 시: popup을 닫고 4-2의 sessionStorage 키만 세팅, 현재 HOME은 그대로 이용.
- Questionnaire는 이 popup 안에 넣지 않는다 — popup은 Studio로의 "유도"만 담당한다.

---

## 5. Studio 진입 시 상태 판별 = Skin 없는 사용자 Fallback (Slice 1 구현 완료, 변경 없음)

```sql
select id, current_draft_version_id, current_published_version_id
from skins
where user_id = auth.uid() and is_active
limit 1;
```

| 결과 | 판정 | Studio 진입 시 동작 |
|---|---|---|
| row 없음 | **skin 없는 사용자** — 4절 popup을 눌러 들어온 신규 가입자든, 기존 가입자/migration 이전 사용자든 전부 이 한 분기로 들어온다 | Questionnaire(7절, 3문항, `skin-questionnaire/` 모듈 — **이 모듈의 유일한 사용처**) 표시 |
| row 있음, `current_draft_version_id` not null | 이미 최소 1개 버전 존재 | Questionnaire 건너뛰고 Studio Editor로, 기존 draft 로드 |
| row 있음, `current_published_version_id` not null | 발행 이력 있음 | 위와 동일(draft 로드) — published 여부는 Save/Publish 버튼 상태 표시에만 쓰임 |

*"skins row가 한 번이라도 생기면 Questionnaire는 다시 뜨지 않는다"*를 유일한 판별 규칙으로 유지한다 — Slice 1과 완전히 동일한 표, 완전히 동일한 `studio/studio-state.js` 분기 로직. Slice 2는 "row 없음" 분기가 지금의 placeholder 텍스트 대신 실제 `mountSkinQuestionnaire()`를 마운트하도록 그 안쪽만 채운다.

---

## 6. Questionnaire 답변을 DB에 저장하는가 — **저장하지 않는다** (변경 없음)

답변은 생성 직후 폐기, `metadata.generatedBy`만 `"deterministic-v1"` 등으로 남긴다.

Q5 자유 입력(원하는 분위기 서술)은 **Phase 1B Questionnaire에 아예 포함하지 않는다**(7절에서 3문항으로 확정). 이 문항은 실제로 자연어를 소비할 주체(OpenAI)가 생길 PHASE 5에서 "원하는 분위기나 참고하고 싶은 느낌을 자유롭게 적어주세요"라는 문구로 그때 추가한다. 지금 미리 물어봐도 deterministic generator가 이 텍스트를 쓸 방법이 없어 사용자에게 "입력했는데 반영 안 됨"이라는 실망을 주므로, 아예 묻지 않는 게 낫다는 판단.

---

## 7. Questionnaire 3문항 + Generator/Initializer — Studio 전용 구조로 재확정 (v5)

### 7-1. 질문 구성 (변경 없음)

| # | 질문 | 선택지 |
|---|---|---|
| Q1 | 레이아웃 | 1단 / 2단 / 3단 |
| Q2 | 전체 분위기 | light / dark |
| Q3 | HOME 스타일 | INTRO / INDEX / PROFILE |

- **INTRO**: 짧은 소개/공지/대표 글이 중심. 카테고리 등 기타 메뉴는 주변부(상단바/사이드 등)에 배치.
- **INDEX**: 카테고리/최근 글 탐색 자체가 중심 — 목록형 화면.
- **PROFILE**: 프로필 이미지/소개가 최상단에 먼저 보이고, 그 아래로 카테고리/글/기타 메뉴가 이어지는 형태.

Density 질문은 없다 — generator 내부에서 항상 `"balanced"` 고정값을 쓴다(사용자에게 노출되지 않는 내부 상수).

각 선택지는 텍스트 radio만이 아니라 아주 단순한 mini wireframe visual을 함께 보여준다(회색 박스/선/원 수준 SVG 또는 CSS, 실제 Skin Preview 수준 렌더링 불필요):

- **Q1(레이아웃)**: 1단/2단/3단 각각을 세로로 나뉜 회색 블록 1~3개로 표현.
- **Q3(HOME 스타일)**: `intro`는 상단 중앙에 작은 사각형(소개 블록) + 그 옆/아래 얇은 선들(주변 메뉴), `index`는 격자 형태로 고르게 배치된 작은 사각형 여러 개, `profile`은 최상단에 원(프로필 이미지 자리) + 그 아래 가로로 긴 사각형들(카테고리/글 목록).
- Q2(전체 분위기)는 배경색이 다른 작은 사각형 스와치 정도로 충분(선택 사항, 텍스트만으로도 무방).

### 7-2. answers 자료구조 (변경 없음)

```js
{
  layoutPreference: "one-column" | "two-column" | "three-column",
  baseAppearance: "light" | "dark",
  homeStyle: "intro" | "index" | "profile"
}
```

### 7-3. Generator/Initializer 위치 — `skin/skin-generator.js` + `skin/skin-initializer.js`

v4는 onboarding도 Questionnaire를 쓴다는 전제로 이 로직을 "onboarding/Studio 공용"이라고 불렀다. v5에서 **onboarding은 Questionnaire를 전혀 쓰지 않게 됐지만**, 파일 위치 결정 자체는 그대로 유지한다 — 애초에 이 로직이 `skin/`의 엔진 레이어 경계와 맞았던 이유는 "onboarding과 공유해서"가 아니라 "DOM 없는 순수 Skin 도메인 로직이고, 미래 AI generator와 교체 가능해야 해서"였기 때문이다. 지금은 Studio fallback이 유일한 호출자이고, **지금 두 번째 소비자를 미리 만들지는 않는다**(YAGNI) — 나중에 새 진입점이 생기면 그때 이 로직을 그대로 재사용하면 된다.

이번 라운드에서 파일을 하나에서 둘로 나눈다(순수 함수와, 부수효과가 있는 시퀀스를 분리):

```js
// skin/skin-generator.js
generateInitialSkin(answers) -> SkinPackage
```
- 순수 함수, DOM/Supabase 접촉 없음. `layoutPreference`로 뼈대(1/2/3단)를, `homeStyle`로 섹션 구성/순서를 결정한다 — `intro`는 소개/공지 블록을 최상단 중앙에 크게 배치하고 카테고리를 주변부로, `index`는 카테고리 목록 + 최근 글 그리드를 중심에, `profile`은 프로필 블록을 최상단 전체 폭으로 두고 그 아래 카테고리/글 목록을 배치한다. 9가지 조합(3×3)을 전부 하드코딩하지 않고 "섹션 블록 문자열 + 순서 배열 재배치 + 레이아웃 그리드 CSS 골격"의 조합으로 구현한다. CSS는 `baseAppearance`에 대응하는 색상 변수 맵 + 고정 `balanced` density 값을 공통 골격에 주입. `imageSlots`는 `homeStyle === "profile"`이면 `profile`(+선택적 `header`) 슬롯 포함, 그 외는 최소 `profile` 슬롯만 optional 포함.

```js
// skin/skin-initializer.js
async function createInitialSkinFromAnswers(answers) -> Promise<{ skinId }>
```
- `generateInitialSkin(answers)` 호출 → `skin-sanitize.js`/`skin-css-validate.js`로 검증(생성기 출력도 예외 없이 이 통과를 거친다, 기존 원칙 유지) → `supabaseClient.rpc("create_skin_with_initial_version", { p_content, p_schema_version, p_title })` 호출 → 성공 시 `{ skinId }` 반환, 실패 시 원래 에러를 그대로 rethrow. **Studio fallback(`studio/studio-state.js`)만 이 함수를 호출한다** — 클라이언트가 `skins`/`skin_versions`를 직접 나눠 insert하는 경로는 어디에도 만들지 않는다.

### 7-4. Questionnaire UI — `skin-questionnaire/` (Studio 전용으로 재확정)

```js
mountSkinQuestionnaire(container, {
  onSubmit: async (answers) => { /* 호출자가 구현, 실패 시 반드시 throw */ }
})
```

계약은 v4와 동일하다 — 다만 **onboarding/HOME popup 어디에도 이 모듈을 mount하지 않는다.** `studio/studio-state.js`의 "skin 없음" 분기 하나만 이 모듈을 소비한다.

- 모듈은 자기 완결적으로 DOM을 그린다(`container.innerHTML`/`createElement`로 Q1~Q3 + wireframe + 제출 버튼을 직접 생성).
- redirect 대상, RPC 호출, 에러 문구 UX는 전혀 모른다 — 오직 답변 상태를 들고 있다가 제출 시 `onSubmit(answers)`를 호출하고 그 Promise만 지켜본다.
- pending 동안 제출 버튼을 비활성화 + "만드는 중..." 표시 → resolve 시 아무 것도 하지 않는다(호스트의 `onSubmit`이 이미 자신의 성공 후처리를 끝낸 뒤에만 resolve하는 게 계약) → reject 시 버튼을 다시 활성화하고 에러 메시지를 인라인으로 보여준다 — **이 재활성화된 버튼 자체가 재시도 UI다.**
- "나중에 하기" 같은 skip 링크는 이 모듈에 없다 — Studio 자체의 `← back` 버튼으로 언제든 나갈 수 있으므로 별도 skip 동선이 필요 없다.

---

## 8. Draft 생성 / 새 version 저장 / Publish DB 쓰기 흐름 (변경 없음)

`AI_SKIN_PHASE1A_DESIGN.md` 2-2/2-3절 흐름표(최초 생성/Draft 저장/Publish/발행 후 첫 편집/Restore)는 그대로 유지한다. `create_skin_with_initial_version()`의 호출부는 Studio fallback 하나뿐이다(7-3절).

**Phase 1B가 이 흐름 중 어디까지를 "완료 조건"으로 요구하느냐**는 9절 완료 범위 참고. **Draft 저장(최초 생성 포함)까지가 Phase 1B의 핵심 완료 조건**이고, **Publish는 개발/테스트 검증용으로 최소 연결만 하면 충분**하다.

---

## 9. RLS만으로 되는 부분 vs RPC가 필요한 부분 (변경 없음)

Slice 0에서 4개 RPC(`create_skin_with_initial_version`/`save_skin_draft_version`/`publish_skin`/`restore_skin_version`) 전부를 만드는 것은 그대로 유지한다. `create_skin_with_initial_version()`의 호출부는 Studio fallback 하나뿐이며 함수 자체(시그니처/본문/GRANT)는 전혀 바뀌지 않는다. `publish_skin`/`restore_skin_version`은 이번 Phase UI에서 전면적으로 노출되지 않을 뿐, DB 레벨 준비는 Slice 0에서 동시에 끝내 둔다.

---

## 10. Studio Preview에 `buildSkinContext()` 연결하는 방법 (변경 없음)

owner 본인 `buildSkinContext()` 직접 호출 / `extractImageSlotNames()` 공용화 / `skin_image_slot_values` 직접 조회 / `renderSkin(...).update(...)`로 실시간 반영 — 그대로 유지한다.

---

## 11. Studio 화면 구조 — 전체 화면이 Preview인 제작 UI (Studio UI 정리 라운드 반영)

### 11-1. 설계 철학

**PHASE 1B에는 아직 AI 채팅이 없으므로 왼쪽 패널을 채울 실질적인 콘텐츠가 없고, 있다 해도 Studio의 핵심 가치는 "실제 내 데이터로 채워진 홈페이지가 지금 어떻게 보이는가"를 계속 눈에 담고 있는 것**이다. 그래서 화면 전체를 Preview가 차지하고, 편집 컨트롤은 전부 그 위에 얹히는 절대배치 overlay로만 존재하는 구조로 구현했다 — `#studioPreviewStage`(iframe이 앉은 자리)는 항상 shell 전체 크기를 그대로 유지하고, 어떤 컨트롤도 그 레이아웃 공간을 나눠 갖지 않는다(11-2절 이하 각 컨트롤 설명 참고).

Studio는 **데스크탑 전용 제작 도구**다(Slice 1에서 이미 구현/검증 완료 — 좁은 화면에서는 `admin-shell.css`가 iframe 대신 `#skinStudioMobileNotice` 안내만 보여준다). 다만 Studio 안에서 **미리보는 대상**(사용자의 공개 홈페이지)의 모바일 버전은 1급 기능으로 다룬다.

### 11-2. 레이아웃 개요

```
┌──────────────────────────────────────────────────────┐
│ (hover/focus 시에만 내려옴) ← back   Save  Code  Settings │ ← Top Dock, 평소엔 화면 위로 숨고 ▾ handle만 보임
│                        DESKTOP | MOBILE                │ ← 상단 중앙, 항상 노출되는 ghost 텍스트 toggle
│                                                        │
│                                                        │
│                   PREVIEW (iframe, 화면 전체)            │
│                                                        │
│                                                        │
│                                                        │
│                            △  ← 하단 중앙, chevron handle
└──────────────────────────────────────────────────────┘
```

핵심 원칙: **어떤 컨트롤도 Preview(iframe)의 레이아웃 공간을 차지하지 않는다.** Top Dock/viewport toggle/AI handle·drawer 전부 `position:absolute`로 `#studioPreviewShell` 위에 겹쳐 그려지고, `#studioPreviewStage`와 그 안의 iframe은 이 shell 전체를 그대로 차지한다(`studio.css`).

### 11-3. 상단 — auto-hide Top Dock(← back / Save / Code / Settings)

- 평소에는 `transform: translateY(-100%)`로 화면 위쪽에 완전히 숨어 있고, 그 자리에는 얇은 `▾` handle(`#studioTopDockHandle`)만 보인다.
- `#studioTopDockZone`(높이 42px의 hit-area 겸 positioning context, 항상 DOM에 존재)에 마우스가 들어오거나(`mouseenter`/`mouseleave`) dock 내부에 keyboard focus가 있을 때(`focusin`/`focusout`) `.is-open` 클래스가 붙어 dock이 내려온다. 순수 CSS `:hover`가 아니라 JS로 여닫는 이유는 "마우스가 멀어지면 350ms 지연 후 숨긴다"는 동작과, focus가 남아 있는 동안은 hover 여부와 무관하게 계속 열려 있어야 하는 요구를 하나의 로직으로 합쳐야 했기 때문이다(`studio-preview.js`의 `updateStudioTopDockVisibility()`).
- 내려왔을 때 담는 컨트롤은 왼쪽 `← back`, 오른쪽 `Save`/`Code`/`Settings` 3개(Phase 1B에서는 셋 다 `disabled` — 실제 기능은 Slice 4/후속 몫, 15절).
- `← back` 클릭 시 실제 화면 전환은 이 문서가 하지 않는다 — `window.parent`로 `{type:"studio:back"}`을 postMessage하면 admin 쪽 `admin-session.js`가 받아 `showAdminHome()`을 호출한다(2-2절에서 admin 바깥 back row를 숨긴 이유가 바로 이 대체 경로다).
- dock이 닫혀 있어도(화면 밖으로 밀려나 있어도) 버튼들은 여전히 DOM/tab 순서에 남아 있다 — `-100%` 이동만으로 뷰포트 밖으로 나가므로 `overflow:hidden` 없이도 시각적으로 사라진다.

### 11-4. 상단 중앙 — `DESKTOP | MOBILE` ghost toggle (dropdown 아님)

- Slice 3 설계 초안의 `▾ Desktop/Mobile` **dropdown은 채택하지 않았다** — 옵션이 단 2개뿐이라 항상 나란히 노출되는 ghost 텍스트 버튼 한 쌍(`DESKTOP` / `MOBILE`, 사이에 얇은 구분선)으로 클릭 한 번에 바로 전환한다. 현재 모드는 굵은 글씨로 표시.
- 이 toggle은 Top Dock과 달리 **항상 보인다**(hover/focus 여닫기 없음) — Preview 위 `position:absolute` overlay라는 점은 동일.
- Preview iframe 자체는 재생성/재로드하지 않는다 — `#studioPreviewStage`에 `.studio-preview-stage--mobile` 클래스를 토글해 iframe/wrap의 CSS 크기만 바꾼다(11-5/11-6절).

### 11-5. Preview 구조 — iframe **1개만** 사용

```
studio/preview/preview-frame.html   ← 이 문서 하나만 존재
```

`studio/index.html`은 이 문서를 로드하는 `<iframe id="studioPreviewFrame">` 하나만 가진다. 부모(`studio-preview.js`)가 `postMessage`로 `{skin, context}`를 보내면(10절), `preview-bridge.js`가 받아서 `renderSkin({container, skin, context, mode:"preview"})`를 호출한다. 왜 iframe 1개 + 폭 전환만으로 `@media`가 정확히 동작하는지의 근거(레이아웃 뷰포트 재평가)는 변경 없음.

### 11-6. Mobile Preview — iframe은 390×844 고정, 좁은 화면은 wrapper `scale()`로만 축소

- Mobile 모드에서 iframe 자신의 CSS 크기(레이아웃 뷰포트)는 **항상 정확히 390×844로 고정**한다 — Skin CSS의 `@media (max-width: 390px)` 등이 실제 기기와 동일하게 평가되려면 iframe의 레이아웃 뷰포트 자체가 이 기준과 어긋나면 안 되기 때문이다.
- Studio 화면(admin iframe 안 가용 공간)이 390×844보다 좁을 때는 **iframe 크기를 줄이는 대신**, 그 iframe을 감싼 `#studioPreviewFrameWrap`에만 `transform: scale()`을 건다 — `transform: scale()`은 레이아웃 박스 크기(따라서 iframe이 인식하는 레이아웃 뷰포트)에 영향을 주지 않고 시각적으로만 축소하므로, "화면엔 작게 보이지만 내부 `@media` 판정은 390px 기준 그대로"가 동시에 성립한다.
- 배율은 `studio-preview.js`의 `updateStudioMobileFrameScale()`이 `#studioPreviewStage`의 실측 크기에서 32px 여백을 뺀 뒤 390×844 대비 비율을 계산해 `--studio-mobile-scale` CSS 변수로 주입한다 — 1을 넘지 않게(큰 화면에서 확대는 하지 않음) 클램프하고, `ResizeObserver`로 admin iframe 크기 변화(창 크기 변화 등)에도 다시 계산한다.

### 11-7. 하단 중앙 — chevron handle + 얕은 AI input drawer shell (Phase 1B는 shell만)

- Slice 설계 초안의 **하단 pill형 `[✎ AI (준비 중)]` 버튼은 채택하지 않았다** — 대신 위쪽만 둥근 작은 사각 tab 모양의 chevron/triangle handle(`△`/`▽`, `#studioAiHandle`) 하나만 하단 중앙에 항상 보인다.
- handle 클릭 시 그 위에 `#studioAiDrawer`(라벨 "어떻게 바꾸고 싶나요?" + textarea 1줄 + 전송 버튼)가 `max-height: 0 → 140px` 전환으로 얕게 펼쳐진다(`transform` 대신 `max-height`를 쓰는 이유는 handle이 항상 drawer 아래쪽에 붙어 있는 flex 흐름을 유지하기 위함, `studio.css` 참고). 다시 클릭하면 접힌다.
- **실제 AI 기능은 아직 없다** — 전송 버튼은 항상 `disabled`이고, textarea도 닫혀 있을 때는 `tabindex="-1"`로 tab 순서에서 빠진다. PHASE 6에서 AI 채팅을 붙일 때 이 shell의 동작만 활성화하면 되도록 자리만 예약해 둔 상태.

### 11-8. 기타 컨트롤 — Save / Code / Settings

- 셋 다 11-3절 Top Dock 안에 위치한다(더 이상 "우측 상단 구석"이 아니라 dock 전체의 오른쪽 그룹).
- **Save**: 현재 draft를 저장(8절, `save_skin_draft_version` RPC). Phase 1B의 핵심 완료 조건. 아직 `disabled`(Slice 4 몫).
- **Code**: HTML/CSS 직접 수정 modal(12절)을 연다. 아직 `disabled`(Slice 4 몫).
- **Settings**: Skin 관련 부가 설정 자리(최소한만). 아직 `disabled`. Publish 버튼은 Phase 1B 어디에도 노출하지 않는다.

---

## 12. 코드 편집기 — 단순 modal (변경 없음)

```
studio/editor/code-editor.js

EDIT SKIN
[HTML textarea] [CSS textarea]
CANCEL / APPLY
```

- `<textarea>` 2개(HTML/CSS) + Apply 버튼이 전부 — IDE 수준 기능은 후순위.
- Apply 클릭 시: 값을 즉시 `skin-sanitize.js`/`skin-css-validate.js`로 검증 → Preview(11절 iframe)에 즉시 반영.
- 실제 저장은 이 modal이 아니라 11-8절의 **Save** 버튼이 담당.

---

## 13. 여러 Skin(Multiple Skins) — 구조는 유지, UI는 숨김 (변경 없음)

`AI_SKIN_PHASE1A_DESIGN.md` 2-1절이 이미 "사용자당 여러 `skins` row 허용 + `is_active` partial unique index로 활성 1개만 강제"라는 구조를 만들어 뒀다. Phase 1B UI는 마치 1인 1스킨인 것처럼 동작하도록 결정한다.

- **Skin** = 서로 다른 디자인 하나(=`skins` row 하나, `is_active`로 "현재 공개 중인 것" 표시)
- **Version** = 같은 Skin의 수정 이력 하나(=`skin_versions` row 하나)

- Studio는 **현재 active skin 1개만** 노출한다.
- DB 쓰기 RPC(9절)도 전부 "현재 active skin 하나"를 전제로 호출된다 — `create_skin_with_initial_version`은 이미 active skin이 있으면 거절하는 로직을 그대로 유지한다. 이 거절이 곧 "중복 submit → active skin 중복 생성 안 됨"의 최종 방어선이다(1차 방어는 7-4절 Questionnaire 모듈의 제출 버튼 비활성화).
- 구조적으로는 이미 다중 Skin을 막지 않는다 — 나중에 UI만 새로 얹으면 된다(`source_skin_id` 컬럼도 이미 준비되어 있음).

---

## 14. Skin 없는 상태의 HOME — `home_customize`는 영구 계약이 아니다 (v5 재정의)

### 14-1. 지금 실제로 일어나는 일 (변경 없음, 재확인)

`current_published_version_id`가 null인 동안(Publish 전까지, 4절/9절) 공개 `/<slug>` 홈은 계속 다음 경로로 렌더된다:

1. `skin/skin-home.js`의 `renderPublishedSkinHome()`이 `get_published_skin(p_user_id)` RPC를 호출한다.
2. `get_published_skin()`은 `current_published_version_id`가 null이면 NULL을 반환한다(정상 상태, 에러 아님) — `current_draft_version_id`는 참조하지 않으므로 draft는 구조적으로 새어나갈 수 없다.
3. `renderPublishedSkinHome()`은 이를 "published Skin 없음"으로 처리해 `false`를 반환한다.
4. `index.html`의 `initHomeRenderer()`가 이 `false`를 받아 **기존 legacy 3-way `home_mode` 분기**로 넘어간다.
5. `complete_onboarding()`은 `profiles.home_mode = 'customize'`로 설정하고 `home_customize`에 하드코딩된 기본 레이아웃을 insert하므로, legacy 분기는 그 레이아웃을 렌더한다.

### 14-2. 이번 라운드에서 바뀌는 것 — 이 경로를 "장기 제품 계약"으로 정의하지 않는다

`home_customize`는 **legacy 과도기 데이터**이고 기존 Carrd Customize와 함께 삭제될 예정이다(1-2/15절). 지금 legacy 분기가 이 데이터를 렌더하는 것은 **사실**이지만, 이걸 "published Skin 없음 → `home_customize` 기본 HOME"이라는 **영구 구조**로 문서화하지 않는다. 새 설계가 이 값에 의존하게 만들면, `home_customize`를 나중에 정리할 때 새 Skin 시스템까지 같이 건드려야 하는 결합이 생긴다.

**앞으로 이 문서와 이후 Slice가 따르는 계약은 다음 두 줄뿐이다**:

- published Skin 있음 → 새 Skin Engine이 렌더
- published Skin 없음 → **아직 Skin이 없는 상태**(그 상태에서 실제로 무엇을 보여줄지는 정의하지 않음)

"아직 Skin이 없는 상태"에 보여줄 실제 기본 Skin/기본 HOME은 **후속 작업에서 새 Skin 시스템 기준으로 별도 설계**한다 — 이번 Slice 2는 기본 Skin 자체를 구현하지 않는다. 지금 남아있는 legacy HOME(`home_customize`/legacy_sua)은 그 설계가 나올 때까지의 **과도기 호환 경로**일 뿐이며, `home/home-skin-prompt.js`(4절)를 포함해 이번 Slice의 어떤 새 코드도 `home_customize`의 존재나 구조를 전제로 만들지 않는다 — 이 모듈이 확인하는 것은 오직 `skins.is_active` row 유무뿐이다(17절 테스트 I).

---

## 15. 기존 Customize/Settings → 새 Studio 전환 방향 (1절과 연결, 최종 정리, 변경 없음)

- **읽기(공개 HOME) 경로는 이미 Phase 1A가 끝냈다** — 변경 없음, Phase 1B는 이 우선순위를 건드리지 않는다.
- **쓰기(편집) 경로**: `05 SKIN STUDIO`(신규)와 `03 CUSTOMIZE`(legacy) + `01 SETTINGS`의 외형 관련 그룹(파비콘/커서/BGM/배너, 1-2절)이 과도기 동안 공존한다.
- **장기 방향(1-2절 재확인, 구현 아님)**: Skin Studio 안정화 → 파비콘/커서/BGM/배너를 CUSTOMIZE(Skin Studio) 쪽으로 이관 → 기존 Carrd `customize/editor/*`와 `home_customize`(14절) 제거 → (`AI_SKIN_AUDIT.md` 13-4절의 코드 정리/유예/DB 정리 순서 재사용).
- Studio 진입 화면에는 "Publish하면 기존 Customize 디자인 대신 이 Skin이 보여집니다"라는 안내 카피가 필요하다 — 다만 Phase 1B는 Publish를 핵심 완료 조건으로 요구하지 않으므로(9절), 이 안내는 Publish 버튼을 실제로 노출하는 시점(Slice 4 또는 후속)에 맞춰 넣으면 된다.

---

## 16. Rollback 전략 (Slice 2 새 파일 갱신)

**모든 Slice는 additive.**

| Slice | 새 파일/DB | 건드리는 기존 파일 | Rollback |
|---|---|---|---|
| 0 | 4개 RPC(migration) | 없음 | `DROP FUNCTION` x4 |
| 1 | `studio/` 골격 + 상태 판별 | `admin/index.html`(메뉴+패널), `admin.js`(전환 함수) | admin 두 파일 추가분 되돌리기 + `studio/` 삭제 — **구현 완료** |
| 2 | `skin/skin-generator.js`, `skin/skin-initializer.js`, `skin-questionnaire/*`, `home/home-skin-prompt.js`(+`.css`) | `onboarding.js`(redirect 대상 한 줄), `onboarding/index.html`(site-path.js 스크립트 태그 1개), `index.html`(popup 로더 연결), `studio/studio-state.js`(fallback 마운트) | 신규 파일 삭제 + 4개 기존 파일 변경분 되돌리기 |
| 3 | Studio Shell(11절 풀스크린 구조) + Preview | 없음 | 신규 파일 삭제 |
| 4 | Code Editor(12절) + Save Draft(+선택적 최소 Publish 연결) | 없음(Slice 0 RPC 소비) | 신규 파일 삭제 |

Phase 1B의 핵심 완료 조건이 Publish가 아니라 **Draft 저장**이므로(9/16절), Slice 4를 넓게 노출해도 사용자의 공개 프로덕션 페이지는 바뀌지 않는다(14절). Slice 2가 onboarding 파일을 건드리게 됐지만 `complete_onboarding()` 자체는 전혀 건드리지 않으므로 그 함수의 보안 검토 이력은 그대로 유효하다(3-2절).

---

## 17. Slice 계획

**목표**: AI 연결 없이, 신규 가입자가 profile/slug onboarding → 자기 `/<slug>` HOME 도착 → (Skin 없으면) 꾸미기 유도 popup → Skin Studio → Questionnaire → initial Skin(draft) 생성까지 끝낼 수 있는 것. 기존 가입자/skin 없는 사용자는 Studio에 직접 들어가도 같은 Questionnaire fallback을 탄다. **Publish/Version History/Restore/여러 Skin 관리/기본 Skin 구현은 이번 범위 밖.**

### Slice 0 — Draft Write RPC 4종 (구현 완료)
- migration 1개: `create_skin_with_initial_version` / `save_skin_draft_version` / `publish_skin` / `restore_skin_version`
- 완료 조건: 4개 함수 각각 소유자 검증/원자성 SQL로 확인 — 확인 완료.

### Slice 1 — Studio 진입점 + 최초 진입 판별 (구현 완료)
- 파일: `studio/index.html`, `studio/studio.css`, `studio/studio-state.js`, `admin/index.html`(메뉴+패널), `admin.js`(전환 함수)
- 완료 조건: skins row 없음/draft만/published 3가지 상태로 Studio 진입 시 5절 표대로 정확히 분기 — 확인 완료.

### Slice 2 — Questionnaire + Generator/Initializer + HOME popup + Onboarding redirect (v5 재설계)

**범위**:
- `skin-questionnaire/questionnaire.js`(+`.css`) — Studio 전용 Questionnaire UI(7-4절)
- `skin/skin-generator.js` + `skin/skin-initializer.js`(7-3절)
- **Studio fallback 연결**: `studio/studio-state.js`의 "skin 없음" 분기가 실제로 `mountSkinQuestionnaire()`를 마운트하도록 교체(5절)
- **onboarding redirect 변경**: `onboarding.js` 성공 시 `/admin/` → `buildSitePath(slug, "/")`(3-2절), `complete_onboarding()` 무수정
- **HOME 꾸미기 유도 popup**: `home/home-skin-prompt.js`(+`.css`), 본인 HOME + active Skin 없음 조건, sessionStorage 기반 노출 정책(4절)
- `create_skin_with_initial_version()` 호출은 오직 `createInitialSkinFromAnswers()` 한 곳에서만(7-3절, 9절)

**아직 하지 않음**:
- 기본 Skin 구현(14절)
- full-screen Preview
- Desktop/Mobile toggle
- Code editor
- Save Draft UI
- Publish UI
- AI/OpenAI
- History/Restore
- 여러 Skin 관리 UI
- `home_customize` 삭제

- 완료 조건: 아래 테스트 매트릭스 A~I 전부 통과.
- Rollback: 신규 파일 삭제 + 4개 기존 파일 변경분 되돌리기(16절)

**테스트 매트릭스**:

| # | 시나리오 | 기대 결과 |
|---|---|---|
| A | 신규 가입: `complete_onboarding` 성공 | `/<slug>` HOME 도착(`/admin/` 아님) |
| B | 본인 HOME + active Skin 없음 | popup 노출, 문구 정확히 "아직 홈을 꾸미지 않았어요.\n내 취향에 맞는 첫 스킨을 만들어볼까요?" |
| C | 로그아웃 방문자 / 다른 사용자의 HOME | popup 미노출 |
| D | `나중에` 클릭 | popup 닫힘, HOME 정상 이용 가능 |
| E | `꾸미러 가기` 클릭 | Skin Studio 진입 → active skin 없음 → Questionnaire 표시 |
| F | Questionnaire 완료 | initial draft Skin 생성 → Studio 재진입 시 Questionnaire 미표시 |
| G | 기존 active Skin 사용자, 자기 HOME 방문 | popup 미노출 |
| H | 기존 onboarding/invite/profile 흐름 | 회귀 없음(`complete_onboarding()` 무수정이므로) |
| I | `home_customize` 의존 여부 점검 | Slice 2의 신규 코드(popup, Questionnaire, generator/initializer) 어디도 `home_customize`를 조회/참조하지 않음을 코드 리뷰로 확인 |

### Slice 3 — 전체화면 Studio Shell + 실데이터 Preview(iframe 1개, Desktop/Mobile 전환)
- 새 파일: `studio/preview/preview-frame.html`, `studio/preview/preview-bridge.js`, Studio 셸 메인 화면(11절 구조)
- 완료 조건: 로그인 계정 실제 데이터로 채워진 Preview가 iframe 1개에 렌더되고, 상단 tab으로 Desktop↔Mobile 전환 시 같은 iframe 안에서 `@media` 규칙이 실제로 재평가됨을 devtools로 확인(11-5절 근거 검증)
- Rollback: 신규 파일만 삭제

### Slice 4 — 단순 Code Editor + Apply + Save Draft (+ 필요 시 최소 Publish 연결)
- 새 파일: `studio/editor/code-editor.js`
- 완료 조건: HTML/CSS 수정(textarea) → Apply(로컬 프리뷰 즉시 반영, 저장 안 됨) → **Save**(새 `skin_versions` row 생성 + draft 포인터 이동 확인) → (선택) Publish 호출 시 포인터 이동 + 공개 `/:slug` 반영 확인 — **PHASE 1B 완료 판정은 Save까지만 필수**
- Rollback: 신규 파일 삭제

**여기서 PHASE 1B 완료.** Version History/Restore, 여러 Skin 관리 UI, Publish 전체 노출, 기본 Skin 구현은 별도 후속 Slice(가칭 Slice 5+)로 넘긴다.

**Slice 3은 Slice 2와 독립(수동 SQL 테스트 skin으로 먼저 검증 가능).**

---

## 18. 이번 라운드에서 결정된 것 / 아직 열려 있는 것

### 결정됨(v2/v3 — 이전 라운드)
- `05 SKIN STUDIO` 메뉴 유지, `studio/` 신설, `skin/` 엔진 무수정 — 이후 `skin/skin-generator.js`/`skin-initializer.js` 2개 추가로 소폭 조정
- SETTINGS의 파비콘/커서/BGM/배너는 장기적으로 CUSTOMIZE로 이관, 블로그 타이틀은 SETTINGS 잔류 — **방향만, Phase 1B 구현 없음**
- Questionnaire 3문항(레이아웃/light-dark/homeStyle), density 삭제(내부 고정값), Q5 자유입력은 PHASE 5로 연기
- Preview는 iframe **1개** + Desktop/Mobile 뷰포트 폭 전환 방식
- Studio는 "전체 화면=Preview" 구조 — 상단 중앙(뷰포트 전환)/하단 중앙(AI 자리 예약, 비활성)/구석(Save·Code·Settings) 최소 컨트롤
- Code Editor는 textarea 2개 + Apply 수준(Monaco급 후순위)
- 여러 Skin은 DB 구조만 유지, UI는 1인 1스킨처럼 노출
- **PHASE 1B 완료 조건은 Draft 저장까지** — Publish는 RPC만 준비, UI 노출/전체 롤아웃은 후속 결정
- `#skinStudioPanel`은 거의 풀스크린, Publish 버튼/UI는 Phase 1B 어디에도 노출하지 않음, Questionnaire 선택지는 mini wireframe 포함

### 폐기됨(v4 → v5, 이번 라운드에서 뒤집힘)
- ~~Questionnaire의 주 진입 경로는 onboarding 마지막 단계~~ → **Studio가 유일한 위치**, onboarding에는 넣지 않는다(3/7절)
- ~~onboarding 성공 시 `/admin/`으로 이동~~ → **`/<slug>` HOME으로 이동**(3-2절)
- ~~신규 가입자의 공개 HOME은 Publish 전까지 `home_customize` 기본 레이아웃을 보여주는 것이 계약~~ → **"아직 Skin이 없는 상태"로만 정의, `home_customize`는 과도기 호환 경로일 뿐 새 설계의 의존 대상이 아님**(14절)

### 결정됨(v5 — 이번 라운드)
- 가입 직후 사용자가 가장 먼저 보는 것은 관리자 화면이 아니라 **자기 공개 HOME**(3절)
- HOME에 본인+Skin없음 조건일 때만 뜨는 가벼운 꾸미기 유도 popup 신설, sessionStorage로만 노출 빈도 제어(4절) — 새 DB flag 없음
- `[꾸미러 가기]`는 admin의 기존 `admin-current-view` 복원 메커니즘을 그대로 재사용해 Studio로 진입시킨다(4-3절) — admin에 새 진입 로직을 추가하지 않는다
- Generator(`skin/skin-generator.js`)와 Initializer(`skin/skin-initializer.js`)를 분리 — 순수 함수와 부수효과 시퀀스를 구분(7-3절)
- Questionnaire/Generator/Initializer는 **Studio fallback만의** 소비자로 재확정 — onboarding/HOME popup에 복제하지 않는다(7절)
- `home_customize`는 legacy 과도기 데이터로 못박고, 새 Skin 없음 상태의 "진짜 기본 HOME"은 후속 Slice에서 별도 설계(14절) — 이번 Slice의 신규 코드는 `home_customize`를 참조하지 않는다

### 아직 열려 있는 것
- 이번 라운드가 다룬 구조적 결정 사항은 전부 확정됨 — Slice 2 착수.
