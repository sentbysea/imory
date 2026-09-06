# Imory Concept

> 관련 문서: [Design.md](./Design.md) · [ToDo.md](./ToDo.md)
>
> 이 문서는 2026-09-05 기준 저장소(`main` 브랜치)를 기준으로 정리한다.
> 표시 기준: **사실**(현재 코드에서 확인됨) / **계획**(방향은 확정되었으나 아직 미구현) / **확인 필요**(코드·문서만으로 결론 내리기 어려움).

---

JavaScript 파일은 가능하면 1000줄 내외로 유지한다.

1000줄을 크게 넘기기 시작하면 책임 분리가 가능한지 우선 검토한다.

단, 기능 응집도를 깨면서 억지로 분리하지 않는다.

---

## 1. 프로젝트 한 줄 설명

Imory는 사용자가 자신만의 개인 홈페이지를 꾸미고, 글과 기록을 카테고리별로 보관하며, 마음에 드는 문장을 Quote Preset으로 꾸며 이미지로 내보낼 수 있는 **개인 홈페이지 + 기록 아카이브** 서비스다.

---

## 2. 프로젝트가 해결하려는 문제

- 기억하고 싶은 글·문장·기록이 여러 메모/앱에 흩어져 있고, 보기 좋게 정리하거나 공유하기 어렵다.
- 개인화된 개인 홈페이지와 정돈된 아카이빙을 동시에 만족시키는 서비스가 마땅치 않다.
- 마음에 드는 문장을 예쁜 이미지로 만들어 공유하려면 별도 디자인 툴이 필요하다.
- 일반적인 홈페이지 제작 도구는 자유도가 높지만 사용자가 직접 HTML/CSS 구조를 이해해야 하거나, 반대로 간단한 블로그 서비스는 디자인 자유도가 낮다.

**계획**: Imory는 정해진 Skin Contract 안에서 AI가 HTML/CSS를 생성·수정할 수 있도록 해, 사용자가 직접 복잡한 코드를 작성하지 않아도 높은 디자인 자유도를 얻는 방향으로 발전한다.

---

## 3. 주요 사용자

- 자신의 기록을 카테고리별로 정리·보관하고 싶은 개인 사용자
- 문장/대화를 꾸며 이미지로 공유하고 싶은 사용자
- 자신만의 주소를 가진 개인 홈페이지를 갖고 싶은 사용자
- 기본 템플릿보다 자유롭게 홈페이지를 꾸미고 싶지만 직접 웹 개발을 하기에는 부담을 느끼는 사용자

---

## 4. 핵심 사용자 경험

1. Google 계정으로 로그인

2. 신규 사용자는 닉네임/슬러그를 정해 온보딩 완료
   - `imory.me/<slug>` 형태의 개인 주소 획득

3. 온보딩 완료 후 자신의 공개 HOME으로 이동

4. 글을 카테고리별로 작성·조회하고, 필요하면 비밀글로 보호

5. 마음에 드는 문장을 Quote Preset으로 꾸며 이미지로 내보내기
   - 다운로드
   - 클립보드 복사
   - OS 공유

6. 자신의 홈페이지를 Skin Studio에서 꾸미기
   - 최초 Skin이 없으면 간단한 Questionnaire로 초기 Skin 생성
   - 실제 사용자 데이터가 들어간 HOME Preview 확인
   - Desktop / Mobile Preview 전환
   - HTML/CSS 직접 수정
   - Apply로 저장 전 Preview 확인
   - Save로 Draft 저장

7. **계획**: 하나의 Skin으로 HOME뿐 아니라 CATEGORY / POST LIST / POST VIEWER까지 일관된 디자인 적용

8. **계획**: 멀티페이지 Skin 계약이 안정된 뒤 자연어 AI로 Skin 생성·수정

---

## 5. 핵심 기능

| 기능 | 상태 |
|---|---|
| Google 로그인 / 세션 관리 | 코드상 구현 완료 |
| 온보딩(닉네임·슬러그 설정) | 코드상 구현 완료 |
| 글 작성/조회/수정/삭제, 카테고리 분류 | 코드상 구현 완료 |
| 비밀글(비밀번호 보호) | 코드상 구현 완료 |
| Quote Preset(CRUD, 실시간 프리뷰, "사용 중" 지정) | 코드상 구현 완료 |
| 발췌 이미지 내보내기(캡처/다운로드/클립보드/공유) | 코드상 구현 완료 |
| 글 카테고리 | 코드상 구현 완료 |
| 배너 카테고리(친구/사이트 링크 모음) | 코드상 구현 완료 |
| Settings(파비콘·커서·BGM·블로그 타이틀·MY BANNER 정보 저장) | 코드상 구현 완료 |
| 기존 블록형 HOME Customize | Legacy / 과도기 기능 |
| Skin / Skin Version DB 구조 | 구현 완료 |
| Published Skin HOME 렌더 | 구현 완료 |
| Skin HTML sanitizer / CSS validator + scoping | 구현 완료 |
| Skin Context / Binding Engine | 구현 완료 |
| Skin Studio 진입 / Questionnaire / 초기 Draft 생성 | 구현 완료 |
| Skin Studio 실데이터 Preview | 구현 완료 |
| Desktop / Mobile Preview | 구현 완료 |
| Skin Studio Code Editor / Apply / Save Draft | 구현 완료 |
| Multi-page Skin Context(HOME / CATEGORY / POST) | 기반 구현 완료 |
| Multi-page SkinPackage templates | 기반 구현 완료 |
| CATEGORY에 Published Skin 적용 | 구현 예정 |
| Studio CATEGORY Preview | 구현 예정 |
| POST VIEWER에 Published Skin 적용 | 구현 예정 |
| Studio POST Preview | 구현 예정 |
| AI Skin 생성 / 자연어 수정 | 구현 예정 |
| Image Library | 구현 예정 |
| Version History / Restore UI | 구현 예정 |
| 여러 Skin 관리 UI | 구현 예정 |

> "코드상 구현 완료"는 프론트→DB/RPC 경로가 코드 추적으로 확인되었다는 뜻이며, 모든 기능이 실제 배포 환경에서 사용자 검증까지 끝났다는 뜻은 아니다. 상세 검증 상태는 [ToDo.md](./ToDo.md)에서 관리한다.

---

## 6. 서비스의 공개 영역과 로그인 영역

### 공개 영역

비로그인 상태에서도 접근 가능한 영역:

- `/`
- `/:slug`
- `/:slug/category/:id`
- `/:slug/post/:id`

`/:slug`는 사용자별 공개 HOME이다.

### 로그인 영역

- `/auth/`
  - OAuth callback 처리용
- `/onboarding/`
  - 신규 사용자 최초 1회
- `/admin/`
  - 글 / Quote Preset / Settings / Skin Studio 등 자신의 데이터를 관리하는 영역

---

## 7. 사용자별 개인 홈페이지 개념

**사실**: `profiles.slug`가 각 사용자의 공개 주소(`imory.me/<slug>`)를 결정한다.

공개 홈페이지의 데이터는 slug를 통해 owner를 식별한 뒤 해당 사용자의 데이터만 조회한다.

다만 **클라이언트의 `user_id` 필터 자체는 보안 장벽이 아니다.**

실제 데이터 보호는 다음과 같은 서버/DB 경계가 담당한다.

- RLS(Row Level Security)
- column-level GRANT
- SECURITY DEFINER RPC

테이블별 최신 보안 검증 상태는 별도 migration / 보안 점검 / ToDo를 기준으로 관리한다.

### 공개 HOME의 현재 렌더 원칙

**사실**:

- active + published Skin이 있으면 새 Skin Renderer가 HOME을 렌더한다.
- Published Skin이 없거나 새 Skin 렌더가 적용되지 않는 상태에서는 기존 legacy HOME 경로로 fallback한다.
- Draft Skin은 공개 HOME에 자동 노출되지 않는다.

Skin 편집 상태와 실제 공개 상태는 분리한다.

```text
current_draft_version_id
→ Studio에서 작업 중인 버전

current_published_version_id
→ 실제 공개 페이지에서 사용하는 버전

사실: Skin은 사용자별 skins와 append-only skin_versions 구조로 관리된다.

현재 Studio UI에서는 active Skin 하나만 다루지만, DB 구조는 사용자당 여러 Skin을 가질 수 있도록 설계되어 있다.

계획: HOME에 먼저 적용된 Skin 시스템을 CATEGORY / POST LIST / POST VIEWER까지 확장해, 하나의 Skin이 사용자의 공개 홈페이지 전체 디자인 언어를 담당하게 한다.

8. 기록·글·Quote Preset·발췌 기능의 관계
**글(posts)**이 기록의 기본 단위이며 카테고리에 속한다.
글에는 필요에 따라 Quote Preset을 적용할 수 있다.
Quote Preset은 문장/대화 표현의 스타일을 담당한다.
폰트
색
배경
비율
문장 표현 형식 등
발췌 프리뷰는 이미지로 내보낼 수 있다.
다운로드
클립보드
공유시트

즉:

글 작성
→ 카테고리 분류
→ 필요 시 Quote Preset 적용
→ 발췌 프리뷰
→ 이미지 내보내기
9. Skin / 커스터마이징 개념
9-1. 기존 Customize

사실: 기존 customize/editor/에는 텍스트·이미지·컨테이너·버튼 등 블록을 배치하는 Carrd형 HOME 편집기가 존재한다.

이 시스템과 home_customize 데이터는 현재 새 Skin 시스템으로 넘어가는 동안 유지되는 legacy 과도기 경로다.

home_customize를 새 Skin 시스템의 장기 데이터 계약이나 신규 사용자의 영구 기본 HOME으로 간주하지 않는다.

새 Skin Studio가 안정화된 뒤 기존 Customize와 관련 데이터는 단계적으로 정리할 예정이다.

새 기능은 가능한 한 home_customize에 새로운 의존성을 추가하지 않는다.

9-2. 새 Skin 시스템

사실: 새 Skin은 사용자의 공개 홈페이지 표현을 HTML/CSS 기반으로 정의한다.

현재 SkinPackage의 기본 구조는 다음과 같다.

{
  schemaVersion: 1,

  templates: {
    home: { html, css? },
    category: { html, css? },
    post: { html, css? }
  },

  css,
  imageSlots,
  regions,
  metadata,

  html // 기존 HOME-only Skin 하위 호환용
}

templates.home, templates.category, templates.post는 모두 optional이다.

현재 v0.1에서는 페이지별 독립 CSS를 운영하지 않고 SkinPackage top-level의 공통 css 하나를 사용한다.

기존 HOME-only Skin도 계속 지원한다.

HOME template 선택 우선순위:

templates.home
→ 없으면 legacy html

CATEGORY / POST는 해당 template이 없으면 HOME용 html을 억지로 재사용하지 않는다.

해당 화면용 template이 없는 Skin은 그 페이지를 지원하지 않는 것으로 처리한다.

9-3. Skin과 Version
Skin
하나의 디자인 단위
skins row
Skin Version
같은 Skin의 수정 이력
skin_versions row
append-only
Draft
Studio에서 현재 작업 중인 버전
Published
실제 공개 페이지에서 사용하는 버전

Skin과 Version은 같은 개념이 아니다.

9-4. Skin Studio

사실: Skin Studio는 관리자 영역 안에서 사용하는 데스크톱용 제작 도구다.

현재 구현된 기능:

Skin 없는 사용자 Questionnaire
deterministic initial Skin 생성
실제 사용자 데이터 기반 Preview
Desktop / Mobile Preview
HTML/CSS Code Editor
Apply
Save Draft
dirty 상태 관리
미저장 상태 Back 경고

Apply와 Save는 분리되어 있다.

Code 수정
→ Apply
→ Preview에만 반영
→ DB 저장 안 됨

Save
→ 새 skin_versions row 생성
→ current_draft_version_id 이동

Apply 후 Save하지 않고 페이지를 다시 불러오면 저장되지 않은 변경은 유지되지 않는다.

9-5. Skin 보안 원칙

사용자 Skin은 신뢰된 HTML/CSS로 간주하지 않는다.

HTML은 sanitizer를 통과한다.

CSS는 parser 기반 validation / selector scoping을 거친다.

DB에 저장된 Skin도 UI를 우회해 생성되었을 가능성이 있으므로, 실제 렌더 시 다시 검증한다.

사용자 Skin JavaScript는 허용하지 않는다.

Skin은 HTML/CSS 중심으로 구성한다.

10. Multi-page Skin

Imory의 Skin은 HOME 하나만 꾸미는 기능이 아니라, 최종적으로 사용자의 공개 홈페이지 전체 표현을 담당한다.

Skin 적용 범위는 단계적으로 확장한다.

HOME
CATEGORY / POST LIST
POST VIEWER

각 화면은 하나의 Skin 디자인 언어와 공통 CSS를 공유하되 페이지별 template을 사용한다.

templates.home
templates.category
templates.post
10-1. Skin Context

Skin template은 DB row 자체를 직접 받지 않는다.

렌더러가 안전하게 가공한 Skin Context만 사용한다.

공통 데이터 예:

site.*
profile.*
navigation.*
images.*
banners.*

현재 화면 종류는:

page.type

으로 구분한다.

home
category
post

페이지별 데이터는 별도 namespace를 사용한다.

home.*
category.*
post.*

예:

home.recentPosts

category.id
category.name
category.type
category.posts

post.id
post.title
post.publishedAt
post.categoryName

본문이나 비밀번호 hash 등 민감하거나 Skin이 소유할 필요가 없는 데이터는 Context에 노출하지 않는다.

10-2. Binding Contract

현재 Skin HTML이 사용할 수 있는 기본 binding 문법은 다음과 같다.

data-imory-bind
data-imory-href
data-imory-src
data-imory-repeat
data-imory-if
bind
textContent binding
href
링크
src
이미지
repeat
배열 반복
if
truthy / falsy 조건

현재 nested repeat는 지원하지 않는다.

data-imory-if는 일반 JavaScript 비교식을 실행하는 문법이 아니다.

AI Skin도 향후 이 Binding Contract 안에서만 데이터를 사용한다.

10-3. CATEGORY

CATEGORY는 우선 post 타입부터 Skin을 지원한다.

현재/예정 카테고리 타입:

post
banner
gallery (예정)

초기 멀티페이지 Skin 단계에서는 post형 CATEGORY부터 연결한다.

banner, 향후 gallery, pagination 등은 실제 기능을 구현하는 시점에 Binding Contract를 확장한다.

처음부터 모든 카테고리를 하나의 범용 collection 모델로 과도하게 추상화하지 않는다.

category.type은 향후 확장 지점으로 유지한다.

10-4. POST VIEWER 보호 원칙

POST VIEWER에서 Skin은 페이지의 외부 layout/chrome을 담당한다.

예:

전체 레이아웃
header
navigation
글 제목
카테고리
날짜 등 metadata
본문 전후 UI
footer

실제 글 본문은 Skin의 일반 text binding으로 직접 노출하지 않는다.

즉 다음 같은 구조는 사용하지 않는다.

<div data-imory-bind="post.content"></div>

글 본문 내용과 Quote Preset 표현은 별도의 보호 영역에서 기존 Post / Quote 렌더러가 담당한다.

기본 원칙:

Skin
├─ page layout
├─ title / meta
├─ navigation
│
├─ protected post body
│   └─ Post / Quote Preset Renderer
│
└─ footer

Skin이 실제 본문 내용이나 Quote Preset 내부 DOM 구조를 임의로 교체하는 구조는 사용하지 않는다.

계획: protected post-body의 실제 region 계약은 POST Skin 통합 단계에서 설계·구현한다.

현재 SkinPackage.regions는 존재하지만 실제 region binding은 아직 구현되어 있지 않다.

10-5. Fallback 원칙

해당 페이지용 Skin template이 없다고 해서 공개 페이지 자체가 깨지면 안 된다.

기본 원칙:

Skin 지원 가능
→ Skin Renderer

Skin 없음 / 해당 template 없음 / 지원 안 함
→ 기존 화면으로 fallback

기존 HOME-only Skin도 계속 사용할 수 있어야 한다.

10-6. AI와의 관계

AI Skin 생성·수정은 HOME-only 상태에서 먼저 붙이지 않는다.

HOME / CATEGORY / POST의 Binding Contract와 실제 렌더 경로가 안정된 뒤 AI를 연결한다.

AI가 Imory 내부 DOM 구조를 임의로 추측하는 것이 아니라:

SkinPackage
+
Skin Context
+
Binding Contract

를 기준으로 HTML/CSS를 생성하도록 한다.

11. 이미지와 Skin

계획: Skin에서 사용자가 직접 업로드한 이미지는 Skin 코드와 분리해서 관리한다.

Skin 공유 시 개인 이미지가 함께 복제되는 구조를 피하기 위해, 실제 이미지 값과 Skin 구조를 분리한다.

기본 개념:

Skin
→ 어떤 이미지 슬롯이 필요한지 정의

사용자
→ 각 슬롯에 실제 이미지 지정

현재 imageSlots 구조와 별도 slot value 저장 구조가 준비되어 있다.

향후 Image Library / 이미지 슬롯 편집 UI를 추가할 예정이다.

12. 멀티유저 운영 원칙
사용자별 공개 주소와 콘텐츠 데이터는 owner(user_id) 기준으로 분리한다.
DB 레벨 데이터 격리는 RLS / GRANT / SECURITY DEFINER RPC를 기준으로 관리한다.
기존 sua용 legacy HOME과 home_customize 경로는 새 Skin 시스템으로 전환하는 동안 유지하는 호환 경로다.
새 기능은 home_customize나 legacy_sua 구조에 새로운 의존성을 추가하지 않는다.
신규 공개 디자인 시스템의 기준은 skins / skin_versions / SkinPackage다.
현재 Studio UI는 active Skin 하나만 보여주지만 DB 구조는 여러 Skin을 지원할 수 있도록 유지한다.
일반 사용자와 별도의 관리자 역할을 두지 않는다.
로그인한 사용자가 자신의 콘텐츠와 Skin을 관리한다.

운영자 전용 서비스 관리 기능은 일반 사용자 Admin과 별개의 운영 도구로 관리할 수 있다.

13. 신규 가입

Imory의 사용자 생성은 다음 단계로 구분한다.

Supabase Auth 사용자 생성
Imory profile 생성 및 onboarding 완료
Imory 서비스 이용

기존 사용자는 profile이 존재하므로 신규 가입 가능 시간과 관계없이 로그인할 수 있어야 한다.

신규 사용자는 가입 가능 여부 또는 유효한 invite 조건을 통과한 뒤 onboarding을 완료한다.

현재 방향

가입 가능 여부 판단은 클라이언트 화면 하나에만 의존하지 않는다.

서버 측 Hook / RPC 등 우회하기 어려운 경계를 사용한다.

onboarding 완료 후 사용자는 /admin/이 아니라 자신의 공개 HOME으로 이동한다.

/<slug>

Skin이 없는 본인 HOME에서는 Studio로 이동할 수 있는 가벼운 꾸미기 안내를 제공한다.

Questionnaire 자체는 onboarding에 포함하지 않고 Skin Studio에서만 사용한다.

14. 현재 구현된 Skin 범위

현재까지 새 Skin 시스템은 다음 단계까지 구현되어 있다.

데이터 / 보안 기반
skins
skin_versions
image slot value 구조
owner RLS
Published Skin 조회 RPC
Draft 저장 RPC
Publish RPC
Restore RPC
Skin Engine
Skin Context
HTML sanitizer
CSS validator
CSS selector scoping
Binding Engine
Published HOME Skin 렌더
기존 Skin backward compatibility
Studio
Skin Studio 진입
Skin 존재 여부 판별
Questionnaire
deterministic initial Skin
실제 데이터 Preview
Desktop / Mobile Preview
Code Editor
Apply
Save Draft
dirty state
unsaved Back guard
Multi-page 기반
HOME Context
CATEGORY Context
POST Context
page.type
templates.home
templates.category
templates.post
template resolver
multi-page SkinPackage normalize / sanitize
Code Editor에서 미편집 template 보존
DB/RPC 변경 없이 templates 전체 저장

현재 실제 공개 Skin 렌더가 연결된 화면은 HOME이다.

CATEGORY / POST는 Context와 SkinPackage 기반은 준비됐지만 실제 공개 route 통합은 후속 단계다.

15. 앞으로 구현할 범위

현재 Skin 시스템의 우선순위는 다음과 같다.

post형 CATEGORY / POST LIST에 Published Skin 연결
Studio에서 CATEGORY Preview 지원
POST VIEWER의 protected post-body 경계 설계 및 구현
POST VIEWER에 Published Skin 연결
Studio에서 POST Preview 지원
HOME / CATEGORY / POST 전체 Skin 렌더 회귀 검증
banner category의 Skin 계약 확장
gallery category 추가 시 Binding Contract 확장
pagination이 필요해지는 시점에 목록 interaction 계약 설계
Image Library / Image Slot 편집 UI
AI Skin Generation
자연어 → Skin 생성
확정된 Binding Contract 안에서 HTML/CSS 생성
AI Skin Editing
자연어 수정
전체 수정
향후 부분 수정
Preview Element Selection / Region 기반 부분 편집
Version History / Restore UI
여러 Skin 관리 UI
새 Skin 시스템 안정화 이후 legacy Customize / home_customize 정리
Settings의 외형 관련 기능을 Skin Studio 쪽으로 이관할지 단계적으로 검토
파비콘
커서
BGM
MY BANNER 관련 표현 기능

AI를 HOME-only 상태에서 먼저 연결하지 않는다.

HOME / CATEGORY / POST의 데이터 계약과 렌더 경로가 안정된 뒤 AI를 연결한다.

16. 현재 단계에서 미래 기능을 다 구현하지 않는 원칙

Imory Skin Contract는 확장 가능하게 설계하되 미래 기능을 한 번에 모두 구현하지 않는다.

현재 계획되어 있는 예:

banner Skin
gallery
pagination
guestbook
notice
Image Library
여러 Skin
Version History
AI 부분 수정

이 기능들은 실제 구현 시점에 기존 Contract를 깨뜨리지 않는 방식으로 추가한다.

초기 단계에서 미래의 모든 화면을 하나의 범용 데이터 구조로 추상화하지 않는다.

필요한 기능이 생길 때 Contract를 버전 호환 가능한 방식으로 확장하는 것을 우선한다.

17. 이번 프로젝트에서 하지 않을 것
React / Vue / Next.js 등 프레임워크 전환
Node.js 등 별도 상시 백엔드 서버 신설
MariaDB 등 다른 DB로 전환
하드코딩된 관리자 계정
사용자 Skin JavaScript 허용
AI가 임의의 DB query나 Supabase 접근 코드를 Skin에 생성하게 하는 것
Skin이 비밀글 비밀번호 hash나 비공개 본문 데이터에 직접 접근하는 구조
Skin이 Quote Preset 본문 내부 DOM을 마음대로 소유·변형하는 구조
미래 기능을 이유로 지금 모든 화면을 범용 collection 구조 하나로 강제 추상화하는 것
legacy_sua를 일반 사용자가 선택할 수 있는 공용 Skin으로 만드는 것
18. 비기능 요구사항
모바일 지원

공개 홈페이지는 모바일을 1급 환경으로 지원한다.

Skin Studio 자체는 데스크톱 제작 도구로 운영할 수 있으나, Studio에서 모바일 홈페이지 Preview를 반드시 지원한다.

접근성
keyboard focus
focus-visible
기본 semantic HTML
이미지 alt
modal focus 흐름

등을 가능한 범위에서 유지한다.

전면적인 접근성 감사는 별도 단계에서 수행한다.

성능

대량의 글/이미지가 존재해도 공개 HOME / CATEGORY / POST의 초기 렌더가 지나치게 무거워지지 않도록 한다.

향후 pagination 또는 lazy loading이 필요해지는 시점에 실제 사용량을 기준으로 도입한다.

보안
RLS
column-level GRANT
SECURITY DEFINER RPC
Skin HTML sanitizer
CSS validator/scoper
client-side raw DB row 비노출

을 조합한다.

DB에 저장된 Skin도 신뢰된 데이터라고 가정하지 않는다.

사용자별 데이터 분리

애플리케이션의 owner 스코핑과 DB RLS를 함께 사용한다.

Skin Context에는 렌더에 필요한 최소 정보만 제공한다.

예:

허용:
post.title
post.publishedAt
category.name

금지:
secret_password_hash
raw secret content
사용자 인증 토큰
기존 데이터 보호

새 Skin 시스템으로 전환하는 동안 기존 사용자의 HOME / 글 / 카테고리 / 설정이 깨지지 않도록 additive migration과 fallback을 우선한다.

19. 프로젝트 용어 정리
용어	뜻
slug	사용자별 공개 주소 식별자(imory.me/<slug>)
owner	특정 slug / 공개 페이지의 데이터 소유 사용자
HOME	/:slug 사용자 공개 홈페이지
CATEGORY	/:slug/category/:id 카테고리 / 글 목록 화면
POST VIEWER	/:slug/post/:id 개별 글 화면
Quote Preset	글/발췌 문장의 표현 스타일을 정의하는 프리셋
발췌 프리뷰	Quote Preset이 적용된 이미지 내보내기 전 미리보기
온보딩	최초 가입 시 닉네임·슬러그를 설정해 Imory profile을 만드는 절차
Skin	사용자의 공개 홈페이지 디자인을 정의하는 HTML/CSS 기반 디자인 단위
SkinPackage	Skin의 template, CSS, imageSlots, metadata 등을 담는 저장 단위
Skin Version	하나의 Skin에 대한 append-only 수정 이력
Draft	Studio에서 편집·저장되었지만 현재 공개 버전과 반드시 같지는 않은 Skin Version
Published Skin	사용자의 공개 홈페이지에서 실제로 사용하는 Skin Version
Skin Studio	Questionnaire, Preview, Code Editor, Apply, Save 등을 제공하는 Skin 제작 화면
Skin Context	Skin template에 제공되는 안전하게 가공된 사용자/사이트/페이지 데이터
Binding Contract	Skin HTML이 Skin Context를 참조하는 공식 규칙
templates.home	HOME 화면용 Skin HTML template
templates.category	CATEGORY / POST LIST 화면용 Skin HTML template
templates.post	POST VIEWER 화면용 Skin HTML template
protected post body	Skin이 직접 소유하지 않고 Post / Quote Preset 렌더러가 담당하는 글 본문 영역
Skin Image Slot	Skin이 필요로 하는 사용자 이미지 자리
active Skin	현재 사용자가 편집/운영 대상으로 선택한 Skin
home_customize	기존 블록형 Customize가 사용하던 legacy HOME 데이터
home_mode	기존 HOME 렌더 방식 구분에 사용되던 legacy / 과도기 상태값
legacy_sua	기존 sua HOME을 보존하기 위한 legacy 렌더 경로
배너 카테고리	글 목록 대신 링크/배너 목록을 보여주는 categories.type='banner' 카테고리
MY BANNER	다른 사이트 운영자가 내 사이트를 링크할 때 사용할 수 있도록 저장하는 배너 이미지/URL