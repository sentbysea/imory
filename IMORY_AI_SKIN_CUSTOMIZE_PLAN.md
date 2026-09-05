# IMORY AI SKIN CUSTOMIZE — PRODUCT & IMPLEMENTATION PLAN

## 0. 문서 목적

이 문서는 Imory의 기존 Carrd형 Customize 기능을 대체할 **AI 기반 Skin Customize 시스템**의 제품 방향, 기술 원칙, 구현 범위 및 단계별 개발 계획을 정의한다.

이 문서는 단순 아이디어 문서가 아니다.

앞으로 Imory Customize 관련 기능을 구현하거나 수정할 때 **최상위 기준 문서**로 사용한다.

기존 구현과 충돌할 경우 무작정 새 구조로 교체하지 말고, 현재 코드를 먼저 조사한 뒤 이 문서의 방향에 맞게 단계적으로 마이그레이션한다.

---

# 1. 핵심 방향

기존 Customize는 Carrd와 비슷한 페이지 빌더 방식이었다.

사용자가 직접 다음 작업을 수행하는 구조였다.

* 요소 추가
* 요소 이동
* 크기 변경
* 텍스트 추가
* 이미지 배치
* 컨테이너 배치
* 개별 스타일 조절

이 방식은 자유도가 높지만 다음 문제가 있다.

* 사용자가 처음 접했을 때 무엇을 만들어야 할지 막연하다.
* 원하는 결과를 얻기 위해 많은 수작업이 필요하다.
* 디자인 경험이 없는 사용자의 결과물 품질 편차가 크다.
* 반응형 레이아웃까지 직접 설계하기 어렵다.
* 드래그/리사이즈/레이어/모바일 보정 등 구현 복잡도가 매우 높다.
* Imory가 자체적으로 완전한 웹사이트 빌더를 구현해야 하는 문제가 생긴다.

따라서 Customize의 핵심 개념을 다음과 같이 변경한다.

> 사용자가 직접 홈페이지를 조립하는 Page Builder가 아니라,
> AI와 대화하면서 자신의 Imory Skin을 제작하는 Skin Studio.

사용자는 자연어로 원하는 모습을 설명한다.

AI는 Imory가 제공하는 데이터와 Skin 규격을 기반으로 HTML/CSS를 제작한다.

사용자는 실제 자신의 데이터를 넣은 Preview를 즉시 확인하면서 반복 수정한다.

---

# 2. 최종 사용자 경험

전체 흐름은 다음과 같다.

```text
Customize 최초 진입
        ↓
Start Questionnaire
        ↓
AI Initial Skin Generation
        ↓
Customize Studio
        ↓
AI와 대화
        ↓
Live Preview
        ↓
부분 선택 수정 / 직접 코드 수정 / 이미지 변경
        ↓
SAVE
        ↓
사용자 홈페이지 적용
```

사용자에게 코딩 지식을 요구하지 않는다.

다만 고급 사용자는 AI가 생성한 HTML/CSS를 직접 수정할 수 있다.

---

# 3. Skin 적용 범위

Skin은 단순 Home 디자인이 아니다.

하나의 Skin이 사용자 공개 홈페이지의 전체 표현을 담당한다.

대상:

1. HOME
2. CATEGORY / POST LIST
3. POST VIEWER

즉 사용자는 하나의 일관된 홈페이지 디자인을 만든다.

예:

```text
imory.me/{slug}

HOME
```

```text
imory.me/{slug}/category/{category}

LIST
```

```text
imory.me/{slug}/post/{post}

POST
```

실제 URL 구조는 현재 프로젝트 구조를 먼저 조사한 뒤 결정하며,
위 URL을 그대로 구현하라는 의미는 아니다.

중요한 것은 HOME / LIST / POST가 별도의 Customize 프로젝트가 아니라
**하나의 Skin System에 포함된다는 것**이다.

---

# 4. Skin 영향을 받지 않는 영역

다음 영역에는 사용자 Skin을 적용하지 않는다.

* Admin
* Settings
* 글 작성 Editor
* Quote Preset Editor
* 운영자 Dashboard
* 로그인 / 가입 UI
* Imory System UI

관리자 영역은 항상 Imory 자체 디자인 시스템을 사용한다.

사용자 Skin과 System UI를 연결하지 않는다.

---

# 5. 가장 중요한 데이터 원칙

AI는 Supabase를 직접 다루지 않는다.

AI에게 다음 권한을 절대 제공하지 않는다.

* Supabase Client
* DB Query
* 사용자 인증 정보
* Service Role
* Access Token
* Storage 관리 권한
* 사용자 데이터 직접 요청

구조는 항상 다음과 같다.

```text
Supabase
   ↓
Imory Application
   ↓
정제된 Skin Data
   ↓
Skin Renderer
```

AI는 **표현 방법만 결정한다.**

---

# 6. Skin에서 사용할 수 있는 데이터

Skin API / Skin Context를 별도로 정의한다.

예시 개념:

```text
site
profile
categories
posts
banners
images
navigation
```

예:

```text
site.title
site.description

profile.nickname
profile.bio
profile.image

categories[]

posts[]

banners[]

images.*
```

실제 필드명은 현재 DB 및 렌더링 구조를 조사한 뒤 설계한다.

AI가 DB column 이름에 직접 의존하도록 만들지 않는다.

즉 다음처럼 하지 않는다.

```text
profiles.nickname
categories.user_id
posts.visibility
```

대신 Skin 전용 데이터 모델을 제공한다.

이렇게 해야 향후 DB 구조가 변경되어도 기존 Skin이 깨지지 않는다.

---

# 7. 레이아웃 자유도

Skin의 DOM 구조를 고정하지 않는다.

AI는 동일한 Imory 데이터를 여러 방식으로 표현할 수 있다.

예:

### Skin A

```text
PROFILE

DIARY
LOG
ETC

최근 글
```

### Skin B

```text
☰

            PROFILE

            RECENT POSTS
```

### Skin C

```text
[DIARY] [MEMO] [BANNER]

        HEADER IMAGE

        ABOUT
```

카테고리는 반드시 navbar여야 하는 것이 아니다.

가능한 표현 예:

* 상단 메뉴
* 좌측 메뉴
* 우측 메뉴
* grid 버튼
* 홈 화면 링크
* 카드
* `<details>` 기반 토글
* 항상 펼쳐진 목록
* 모바일 전용 메뉴

등을 허용한다.

즉 Imory는 데이터와 기능을 제공하고,
Skin은 그 표현 방식을 결정한다.

---

# 8. JavaScript 정책

사용자 Skin에서는 JavaScript를 허용하지 않는다.

절대 허용하지 않는 항목:

```text
<script>
javascript:
inline JS handler
onclick
onload
onerror
iframe
embed
object
외부 JavaScript
module script
```

AI에게도 JavaScript를 생성하지 말라고 명확하게 지시한다.

Skin v1의 기술 범위:

```text
HTML
CSS
```

두 가지뿐이다.

가능한 인터랙션은 HTML/CSS 기본 기능을 활용한다.

예:

```html
<details>
<summary>
CSS :hover
CSS :focus
CSS checkbox patterns
```

향후 D-day / Calendar 등 동적 기능이 필요할 경우 사용자 JS를 허용하지 않고,
**Imory Official Widget API**를 별도로 설계한다.

---

# 9. POST VIEWER 보호 규칙

POST 화면의 전체 레이아웃은 Skin에서 변경할 수 있다.

예:

* 제목 위치
* 작성일 위치
* 전체 폭
* 본문 주변 여백
* 배경
* 본문 컨테이너 디자인
* navigation 위치

그러나 **글 본문 자체는 Skin에서 변형할 수 없다.**

특히 Quote Preset으로 렌더링된 데이터는 반드시 기존 지정 결과 그대로 표시되어야 한다.

Skin은 Quote Preset의 내부 HTML / formatting / 의미 구조를 변경해서는 안 된다.

개념적으로:

```html
<article class="skin-post-body">
    [IMORY CONTROLLED POST CONTENT]
</article>
```

Skin은 외부 container styling만 담당한다.

본문 내부 표현은 Imory Viewer / Quote Preset Renderer가 담당한다.

---

# 10. AI Provider — v1

초기 버전에서는 OpenAI GPT 계열 모델 하나만 지원한다.

구조:

```text
Browser
   ↓
Imory Server Function
   ↓
OpenAI API
   ↓
Imory Server Function
   ↓
Browser
```

브라우저에서 OpenAI API를 직접 호출하지 않는다.

OpenAI API credential은 다음 위치에 절대 저장하지 않는다.

* client JavaScript
* HTML
* GitHub repository
* 공개 config
* 일반 사용자 DB table

서버 환경 Secret에서만 관리한다.

현재 Imory의 서버 구조 및 Supabase Edge Functions 사용 여부를 먼저 조사하여 적합한 서버 실행 환경을 선택한다.

---

# 11. 향후 Claude BYOK

v1 구현 범위가 아니다.

향후 Provider Architecture는 확장 가능하게 만든다.

예:

```text
AIProvider
 ├ OpenAIProvider
 └ ClaudeProvider
```

향후 사용자 설정에서:

```text
AI Provider

● Imory AI
○ Claude API
```

형태로 확장 가능해야 한다.

Claude 사용 시 개인 사용자가 자신의 API Key를 연결하는 BYOK 구조를 고려한다.

단, 지금부터 Claude API 구현을 하지 않는다.

v1은 OpenAI만 구현한다.

---

# 12. AI 비용 보호

Imory가 제공하는 OpenAI 호출에는 반드시 사용량 제한 구조가 존재해야 한다.

v1부터 고려할 항목:

* 로그인 사용자만 AI Customize 사용
* 사용자별 rate limit
* 일정 기간 요청 횟수 제한
* 최대 input 크기
* 최대 output 크기
* 동일 요청 반복 방지
* 서버 측 logging
* API 오류 처리

구체적인 무료 제공량이나 일일 횟수는 구현 단계에서 별도로 결정한다.

중요한 것은 AI API endpoint를 무제한 공개하지 않는 것이다.

---

# 13. Customize 최초 진입

최초 진입 시 빈 Skin이나 고정 Default Skin을 바로 보여주지 않는다.

사용자가 간단한 질문에 답하면,
그 결과를 기반으로 **Initial Skin을 AI가 생성**한다.

이를 Start Questionnaire라고 한다.

질문 수는 약 3~5개를 목표로 한다.

질문을 지나치게 세분화하지 않는다.

---

# 14. Start Questionnaire v1

## Question 1 — Layout

가장 먼저 전체 구조를 선택한다.

시각적인 미리보기를 제공한다.

예:

```text
1단
콘텐츠 중심
모바일과 비슷한 단순 구조

2단
프로필 / 메뉴 + 콘텐츠
개인 홈페이지에 적합한 균형형

3단
메뉴 / 콘텐츠 / 부가정보
정보량이 많은 홈페이지에 적합
```

각 옵션은 텍스트만 보여주지 않고
간단한 wireframe preview를 함께 제공한다.

사용자가 Layout을 선택해도 AI가 반드시 그 구조를 그대로 유지해야 하는 것은 아니다.

이 선택은 **초기 생성의 강한 preference**로 전달한다.

---

## Question 2 — Base Appearance

예:

```text
○ Light
○ Dark
○ 직접 선택
```

직접 선택 시 background 또는 대표 색상을 고를 수 있다.

---

## Question 3 — Main Focus

첫 화면에서 무엇을 가장 강조할 것인지 선택한다.

예:

```text
○ Profile
○ Recent Posts
○ Categories
○ Main Image
○ Balanced
```

---

## Question 4 — Density / Style

예:

```text
○ 여백이 많은 단순한 디자인
○ 적당히 정보가 보이는 디자인
○ 작은 요소가 많은 개인 홈페이지 느낌
```

필요 여부는 실제 초기 UI를 만들어본 뒤 판단한다.

---

## Question 5 — Free Prompt

마지막에는 자유 입력을 제공한다.

예:

```text
원하는 모습을 자유롭게 설명해주세요.

[ 오래된 개인 홈페이지 같은 느낌인데
  너무 복잡하지 않았으면 좋겠어요. ]
```

선택 입력이다.

---

# 15. Initial Skin Generation

Questionnaire 결과는 다음처럼 AI 요청으로 변환한다.

```text
layoutPreference: two-column
baseAppearance: light
focus: profile
density: balanced

userPrompt:
"오래된 개인 홈페이지 같은 느낌인데
너무 복잡하지 않았으면 좋겠어요."
```

이 데이터 + Imory Skin Specification + 현재 사용자의 Preview용 데이터를 기반으로 초기 Skin을 생성한다.

결과가 성공하면 Customize Studio로 이동한다.

AI 생성 실패 시 빈 화면을 만들지 않는다.

반드시 Imory fallback skin이 존재해야 한다.

---

# 16. Customize Studio 기본 UI

데스크톱 기본 구조:

```text
┌─────────────────────┬────────────────────────────┐
│                     │                            │
│ AI CHAT             │ LIVE PREVIEW               │
│                     │                            │
│ 사용자 요청          │ 실제 사용자 데이터          │
│ AI 응답              │                            │
│                     │                            │
│                     │                            │
│                     │                            │
│ [message...]        │                            │
│                     │                            │
├─────────────────────┤                            │
│ History / Advanced  │ [DESKTOP] [MOBILE]         │
│            [SAVE]   │                            │
└─────────────────────┴────────────────────────────┘
```

실제 스타일은 현재 Imory Admin UI에 맞게 설계한다.

기존 Carrd Customize UI를 그대로 유지하지 않는다.

---

# 17. Live Preview

Preview에는 fake content가 아니라 가능하면 현재 사용자의 실제 데이터를 사용한다.

예:

* 실제 nickname
* 실제 profile image
* 실제 categories
* 실제 posts metadata
* 실제 banners

단 secret/private 데이터가 Preview 렌더러 또는 AI input을 통해 부적절하게 노출되지 않도록 데이터 범위를 구분한다.

Preview는 실제 공개 홈페이지 렌더러와 최대한 동일한 Skin Renderer를 사용한다.

별도의 Preview-only 렌더링 로직을 만들지 않는 방향을 우선한다.

---

# 18. Desktop / Mobile

반응형 대응은 Skin의 필수 요구사항이다.

Preview 상단 또는 하단에 다음 전환 기능을 제공한다.

```text
DESKTOP
MOBILE
```

AI가 생성하는 CSS는 반드시 모바일 레이아웃을 포함해야 한다.

Skin Specification에 공식 breakpoint 또는 responsive rule을 정의한다.

AI Prompt에 다음 원칙을 명시한다.

> Desktop 디자인만 생성하지 않는다.
> 모든 Skin은 모바일 환경에서도 사용 가능해야 한다.

가능하다면 Skin validation 과정에서 모바일 관련 CSS 존재 여부도 검사한다.

---

# 19. AI Chat Modification

Initial Skin 이후에는 사용자가 자연어로 Skin을 수정한다.

예:

```text
"프로필을 오른쪽으로 옮겨줘."

"카테고리 글씨를 더 작게."

"전체적으로 여백을 늘려줘."

"모바일에서는 한 열로 보여줘."

"카테고리를 버튼 형태로 바꿔줘."
```

AI는 매번 새 홈페이지를 처음부터 생성해서는 안 된다.

**현재 Skin을 수정하는 방식**을 기본으로 한다.

불필요한 영역까지 다시 작성하지 않도록 한다.

---

# 20. Preview Element Selection

매우 중요한 기능이다.

사용자는 Preview의 특정 요소를 클릭하여
해당 영역만 선택할 수 있다.

예:

```text
[Profile 영역 클릭]

PROFILE
────────────
AI로 수정
이미지 변경
직접 수정
```

선택 가능한 요소의 예:

* profile
* category navigation
* recent posts
* post list
* header
* banner section
* footer
* decoration
* image slot

이 기능을 위해 Skin 내부 주요 영역에 안정적인 식별 체계가 필요하다.

예:

```text
data-imory-region
```

구체적인 구현 방식은 기존 renderer 조사 후 결정한다.

---

# 21. Partial AI Modification

요소를 선택한 상태에서 사용자가:

```text
"사진을 더 작게 하고 테두리는 없애줘."
```

라고 요청하면 전체 Skin을 AI에게 다시 만들게 하지 않는다.

가능하면 다음만 AI context에 전달한다.

* 선택한 region
* 관련 HTML
* 관련 CSS
* 필요한 Skin Specification
* 사용자 요청

그리고 해당 부분만 수정한다.

목적:

* 응답 속도 개선
* token 감소
* 다른 영역의 예상치 못한 변경 방지
* 결과 안정성 향상

전체 수정과 부분 수정은 별도의 요청 모드로 설계한다.

---

# 22. 직접 코드 수정

고급 사용자에게 HTML/CSS 직접 수정 기능을 제공한다.

기본 UI에서 지나치게 강조하지 않는다.

예:

```text
Advanced
└ Edit Skin Code
```

선택 시 modal 또는 대형 editor panel을 연다.

예:

```text
EDIT SKIN

[HTML] [CSS]

(code editor)

CANCEL
APPLY
```

HOME/LIST/POST HTML을 물리적으로 별도 저장할지,
공통 template + route별 region 방식으로 관리할지는
Skin Architecture 설계 단계에서 판단한다.

처음부터 UI tab 구조에 맞춰 데이터 구조를 강제로 결정하지 않는다.

코드를 수정하는 동안 Preview에 임시 반영하는 기능을 고려한다.

APPLY 전에는 실제 저장본을 변경하지 않는다.

---

# 23. 이미지 시스템

Skin 안에 개인 이미지 URL을 직접 하드코딩하는 것을 기본 방식으로 사용하지 않는다.

Imory Image Library / Image Slot 시스템을 만든다.

사용자가 이미지를 업로드하면:

```text
사용자 Device
        ↓
Imory Upload
        ↓
Supabase Storage
        ↓
Imory Image Record
        ↓
Skin Image Slot
```

구조를 사용한다.

---

# 24. Image Library

Customize 내부에서 재사용 가능한 Image Picker를 제공한다.

예:

```text
SELECT IMAGE

[ + UPLOAD ]

MY IMAGES

[img] [img] [img]
[img] [img] [img]

SELECT
```

가능하면 기존 Imory의 Storage upload utility를 재사용한다.

별도의 업로드 시스템을 중복 구현하지 않는다.

---

# 25. Image Slot

Skin은 가능하면 실제 URL이 아니라 의미 있는 image slot을 참조한다.

예:

```text
profile
header
background
custom_01
custom_02
```

개념 예:

```html
<img data-imory-image="profile">
```

실제 syntax는 Skin Renderer 설계 과정에서 결정한다.

렌더링 시 Imory가 해당 slot에 연결된 Storage URL을 삽입한다.

---

# 26. Image Slot의 장점

사용자가 이미지를 교체해도 Skin 코드를 변경할 필요가 없다.

또한 Skin 공유 시 개인 이미지가 따라가지 않는다.

예:

Skin A:

```text
required images

profile
header
```

사용자 B가 Skin A를 설치하면 자신의 Image Library에서:

```text
profile → B의 프로필 사진
header → B의 헤더 사진
```

을 선택한다.

원 제작자의 개인 이미지를 복사하지 않는다.

---

# 27. Skin에 새로운 이미지가 필요할 때

AI가 Skin을 수정하면서 새로운 image slot이 필요할 수 있다.

예:

사용자:

```text
"맨 위에 큰 사진 하나 넣어줘."
```

AI 결과:

```text
new image slot: hero
```

Preview에는 placeholder를 표시한다.

사용자가 placeholder를 클릭하면 Image Picker를 열어 이미지를 등록한다.

즉 AI는 사용자가 업로드하지 않은 이미지를 임의로 인터넷에서 가져오지 않는다.

---

# 28. Decoration Policy

AI가 데이터와 관계없는 장식 요소를 만드는 것을 허용한다.

예:

* ♡
* 작은 텍스트
* 선
* 박스
* CSS pattern
* ornamental header
* CSS shape

다만 이 기능을 주요 제품 기능으로 별도 강조할 필요는 없다.

사용자가 요청할 경우 자연스럽게 허용하는 정도로 취급한다.

외부 executable content는 계속 금지한다.

---

# 29. Skin Version History

전체 AI 채팅 로그를 영구적인 핵심 데이터로 삼지 않는다.

Skin 자체의 version을 관리한다.

최소 구조:

```text
current published skin

working draft

recent versions
```

최근 약 10개의 주요 버전을 복원할 수 있는 구조를 목표로 한다.

정확한 숫자는 구현 단계에서 변경 가능하다.

사용자는:

```text
Undo
Restore Version
```

할 수 있어야 한다.

AI가 잘못 수정해도 이전 Skin으로 돌아갈 수 있어야 한다.

---

# 30. Draft와 Published Skin

작업 중인 Skin과 실제 홈페이지 Skin을 분리한다.

```text
DRAFT
사용자가 Customize에서 작업 중인 상태

PUBLISHED
실제 홈페이지 방문자가 보는 상태
```

AI 요청이나 직접 코드 수정만으로 실제 공개 홈페이지가 즉시 변경되지 않는다.

사용자가 명시적으로 SAVE / PUBLISH 했을 때 Published Skin을 변경한다.

---

# 31. Skin Validation

AI가 생성한 결과를 그대로 신뢰하지 않는다.

저장 또는 Preview 전에 sanitizer / validator를 통과시킨다.

검사 항목:

* script 제거
* JS event attribute 제거
* iframe 제거
* object 제거
* embed 제거
* javascript: URL 차단
* 허용하지 않은 위험 태그 제거
* HTML syntax 검사
* CSS syntax 최소 검사
* 과도한 외부 resource 검사
* Skin data contract 검사

가능하면 AI에게 재생성을 요청하기 전에 서버 또는 클라이언트 validator로 즉시 감지한다.

---

# 32. CSS 정책

Skin CSS는 Imory Admin / System UI에 영향을 줄 수 없어야 한다.

CSS scope를 격리한다.

예:

```text
Skin Root
   ↓
Skin CSS
```

Preview 또한 격리한다.

현재 구조에 따라 sandbox iframe 또는 별도 rendering boundary를 조사한다.

목적:

* Skin CSS가 Admin을 깨뜨리지 않음
* Admin CSS가 Skin을 깨뜨리지 않음
* 다른 사용자의 Skin과 충돌하지 않음

---

# 33. Skin Sharing — 방향

향후 Skin 공유 기능을 지원한다.

이는 단순한 “HTML/CSS 코드 복붙 공유”가 아니다.

**Skin Package 설치 방식**으로 만든다.

---

# 34. Skin Gallery 개념

예:

```text
Simple Diary
by @user

[ PREVIEW ]

Supports
Home
List
Post
Banner

Required Images
Profile
Header

[ USE THIS SKIN ]
```

사용자가 `USE THIS SKIN`을 누르면 해당 Skin을 자신의 계정으로 가져온다.

---

# 35. Skin 설치 방식

Skin 설치는 reference 방식보다 **clone/copy 방식**을 기본으로 한다.

즉:

```text
원본 Skin
   ↓
COPY
   ↓
사용자의 Skin
```

원 작성자가 이후 Skin을 수정해도
이미 설치한 다른 사용자의 홈페이지가 자동으로 변경되지 않는다.

사용자는 복제된 Skin을 AI로 다시 자유롭게 수정할 수 있다.

---

# 36. 공유 Skin에 포함되는 것

포함 가능:

* HTML template
* CSS
* Skin metadata
* layout information
* image slot definitions
* supported region definitions
* version
* author attribution

포함하지 않는 것:

* 원 작성자의 posts
* categories 내용
* private data
* profile data
* 실제 개인 이미지
* Supabase URL에 종속된 개인정보
* API credentials

---

# 37. Skin Package를 처음부터 고려하는 이유

Skin Gallery 자체는 v1 필수 구현 범위가 아니다.

그러나 현재 Skin 저장 구조가 향후 공유를 막지 않도록 설계해야 한다.

Skin을 단순히 사용자의 `home_customize` 안에 거대한 HTML 문자열 하나로만 저장해서
나중에 분리하기 어려운 구조를 피한다.

현재 `home_customize` 구조를 먼저 조사하여 migration 방향을 제안한다.

---

# 38. 기존 Carrd Customize 처리 원칙

기존 Carrd형 Customize 코드를 무조건 삭제하지 않는다.

먼저 현재 구현을 조사한다.

특히 다음을 확인한다.

* Preview Renderer
* Preview data loading
* home_customize
* save logic
* responsive preview
* image upload
* existing blocks
* user-specific configuration
* route integration
* CSS isolation
* draft/publish 여부

재사용 가능한 기능은 새로운 AI Skin Studio로 가져온다.

재사용 가치가 없는 Page Builder UI만 단계적으로 제거한다.

---

# 39. 구현 전에 반드시 조사할 것

Claude는 실제 구현을 시작하기 전에 현재 repository를 조사하고
다음 내용에 대한 보고서를 작성해야 한다.

## A. Customize

* 현재 Customize 관련 모든 파일
* entry point
* state 관리
* rendering 구조
* save 구조
* block system
* preview 구조

## B. Public Home

* 사용자 홈 renderer
* category renderer
* post list renderer
* post viewer renderer
* route 처리

## C. Supabase

* home_customize schema
* profiles
* site_settings
* categories
* posts
* banners
* Storage bucket
* RLS

## D. Images

* 현재 이미지 upload utility
* banner upload
* profile image
* storage path convention

## E. Quote

* Post Viewer와 Quote Preset Renderer 연결 구조
* Skin에서 절대 침범해서는 안 될 영역

## F. Design Tokens

* 현재 Imory System token
* 사용자 theme 관련 token
* Skin과 System token의 경계

---

# 40. 구현 순서

한 번에 전체를 만들지 않는다.

다음 Phase 순서를 따른다.

---

## PHASE 0 — Existing Architecture Audit

코드 수정 금지.

현재 구조 분석만 수행한다.

결과물:

```text
AI_SKIN_AUDIT.md
```

내용:

* 재사용 가능한 코드
* 제거 대상
* 위험 요소
* DB migration 필요 여부
* Renderer 구조
* 구현 추천 구조

---

## PHASE 1 — Skin Data Contract

AI 없이 먼저 만든다.

목표:

```text
Imory Data
   ↓
Skin Context
   ↓
Skin Renderer
```

Skin이 Supabase 구조와 직접 연결되지 않게 한다.

완료 조건:

* HOME 렌더 가능
* LIST 렌더 가능
* POST 렌더 가능
* Quote content 보존
* 사용자별 데이터 정상 표시

---

## PHASE 2 — Static Skin Engine

AI를 아직 붙이지 않는다.

미리 작성한 HTML/CSS Skin을 저장하고 적용할 수 있게 한다.

목표:

```text
HTML + CSS
↓
validate
↓
preview
↓
publish
```

완료 조건:

* JS 차단
* Preview
* Desktop/Mobile
* Draft/Publish
* Home/List/Post 적용

---

## PHASE 3 — Image Library / Image Slots

이미지 업로드와 Skin image slot을 구현한다.

완료 조건:

* Upload
* Select
* Replace
* Placeholder
* Storage mapping
* Skin code 수정 없이 이미지 교체

---

## PHASE 4 — Start Questionnaire

Customize 최초 진입 UX 구현.

아직 AI 호출을 fake/mock 결과로 테스트해도 된다.

완료 조건:

* 3~5개 질문
* 1/2/3 column preview
* color
* focus
* optional prompt
* 결과 객체 생성

---

## PHASE 5 — OpenAI Server Integration

OpenAI API를 서버 경유 방식으로 연결한다.

완료 조건:

* secret client 미노출
* auth
* rate limit
* validation
* error handling
* initial skin generation

---

## PHASE 6 — AI Chat Modification

현재 Skin을 AI로 수정할 수 있게 한다.

완료 조건:

* conversational modify
* Preview refresh
* Draft preservation
* 실패 시 이전 version 유지

---

## PHASE 7 — Region Selection / Partial AI Editing

Preview 요소 선택 기능 구현.

완료 조건:

* region highlight
* selected context
* partial AI edit
* unrelated region preservation

---

## PHASE 8 — Advanced Code Editor

HTML/CSS 직접 수정 modal 구현.

완료 조건:

* HTML/CSS edit
* Preview
* validation
* Cancel
* Apply

---

## PHASE 9 — Version History

완료 조건:

* recent versions
* restore
* draft/published separation
* AI 실패 복구

---

## PHASE 10 — Skin Package Foundation

당장 Gallery UI를 만들 필요는 없다.

하지만 Skin을 export/copy 가능한 논리적 단위로 정리한다.

향후:

```text
Skin Gallery
USE THIS SKIN
```

기능을 붙일 수 있어야 한다.

---

# 41. v1에서 하지 않는 것

Scope가 계속 확장되는 것을 막기 위해 명시한다.

v1에서 구현하지 않는다.

* 사용자 JavaScript
* 자유 Widget JavaScript
* D-day custom script
* Calendar custom script
* iframe widget
* external script
* Claude API
* Gemini API
* AI image generation
* Admin skinning
* System UI auto skin sync
* 실시간 collaborative editing
* 완성형 Skin Marketplace
* 판매/결제
* 지나치게 복잡한 visual drag editor

---

# 42. Skin Specification 별도 문서

이 계획서 구현 중 다음 문서를 별도로 만든다.

```text
IMORY_SKIN_SPEC.md
```

여기에는 AI와 인간 모두가 읽을 수 있는 Skin 규격을 작성한다.

예:

* available data
* allowed HTML
* forbidden HTML
* CSS rules
* region definition
* image slots
* responsive requirements
* Home requirements
* List requirements
* Post requirements
* Quote content rules

이 문서는 향후 외부 ChatGPT / Claude / Gemini에게 사용자가 직접 붙여넣어
Imory Skin 코드를 제작할 때도 사용할 수 있어야 한다.

즉 내부 AI용 비밀 Prompt와 Skin Specification을 완전히 같은 것으로 만들지 않는다.

Skin Specification은 공개 가능한 규격을 목표로 한다.

---

# 43. AI System Prompt 별도 관리

OpenAI에게 전달하는 system instruction도 코드에 여기저기 작성하지 않는다.

예:

```text
ai/skin-system-prompt
```

또는 이에 준하는 중앙 관리 구조를 사용한다.

내용에는:

* Imory Skin Spec
* 출력 계약
* JS 금지
* 모바일 필수
* Quote content 보호
* 현재 Skin 최소 변경 원칙
* 유효 HTML/CSS 요구

등이 포함된다.

---

# 44. AI Output Contract

AI에게 장문의 설명문 + 코드블록을 반환하게 하지 않는다.

가능하면 구조화된 결과를 요구한다.

개념 예:

```json
{
  "html": "...",
  "css": "...",
  "imageSlots": [],
  "regions": [],
  "summary": "..."
}
```

실제 OpenAI structured output 사용 여부는 구현 시 현재 API 사양을 확인한 뒤 결정한다.

AI 응답 parser가 Markdown 코드블록 포맷에 의존하지 않도록 한다.

---

# 45. 품질 기준

AI가 “동작하는 코드”만 만들어서는 안 된다.

Skin System Prompt / Specification에는 기본적인 디자인 품질 가이드를 포함한다.

예:

* 일관된 spacing
* 과도하게 많은 font size 사용 금지
* 불필요한 decoration 남용 금지
* 적절한 content width
* 모바일 overflow 금지
* 긴 제목 대응
* 긴 category 이름 대응
* 이미지 비율 대응
* 기본적인 readability
* 충분한 contrast
* 한국어 line wrapping 고려

이 가이드는 특정 미적 스타일을 강제하기 위한 것이 아니다.

낮은 품질의 기본 결과물을 방지하는 guardrail이다.

---

# 46. 가장 중요한 제품 원칙

Imory는 AI Website Builder가 아니다.

Imory는 사용자의 기록 데이터를 관리하는 서비스이며,
Skin은 그 기록을 개인 홈페이지 형태로 표현하기 위한 레이어이다.

따라서 우선순위는 항상:

```text
DATA SAFETY
↓
CONTENT INTEGRITY
↓
SKIN STABILITY
↓
CUSTOMIZATION FREEDOM
```

순서다.

자유도를 위해 사용자 데이터 안정성을 희생하지 않는다.

---

# 47. 최종 목표

사용자는 기술 지식 없이 다음처럼 말할 수 있어야 한다.

```text
"옛날 개인 홈페이지처럼 만들어줘.
왼쪽에 프로필이 있고,
카테고리는 위에 작게,
글 목록은 날짜와 제목만 보여줘."
```

몇 초 뒤 실제 자신의 데이터를 넣은 결과를 Preview한다.

그리고:

```text
"프로필 사진 좀 더 작게."
```

또는 Preview에서 Profile을 클릭해:

```text
"이 부분만 가운데 정렬해줘."
```

라고 수정한다.

필요하다면 이미지를 업로드한다.

모바일 화면도 확인한다.

마지막으로 SAVE한다.

그 순간:

```text
HOME
CATEGORY LIST
POST VIEWER
```

전체가 하나의 일관된 사용자 Skin으로 공개된다.

이 경험이 Imory Customize의 최종 제품 방향이다.
