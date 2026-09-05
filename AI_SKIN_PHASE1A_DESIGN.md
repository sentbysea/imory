# AI SKIN — PHASE 1A 설계 문서

> 전제: `AI_SKIN_AUDIT.md` 13절의 결정을 따른다 — 기존 `home_customize`/block-JSON/Carrd Customize와 **완전히 독립적인** 새 AI Skin 구조를 설계한다. 이 문서는 설계만 다룬다. **코드/DB는 아직 변경하지 않았다.**
> 참고: `IMORY_AI_SKIN_CUSTOMIZE_PLAN.md`(제품 방향), `AI_SKIN_AUDIT.md`(기존 아키텍처 조사 + 13절 정리 계획).

---

## 1. Skin Context v0.1

Skin은 Supabase의 실제 컬럼명에 절대 의존하지 않는다. 아래 표의 필드명은 **Imory 앱 코드 안의 Context 빌더 함수**가 실제 쿼리 결과를 조립해서 만드는 값이며, DB 컬럼명과 우연히 같아 보이는 것(`nickname` 등)도 빌더가 명시적으로 매핑한 결과일 뿐 직접 노출이 아니다. DB 스키마가 바뀌어도 빌더 함수만 고치면 되고 기존에 저장된 Skin(html/css)은 전혀 영향받지 않는다.

v0.1은 **HOME에서 필요한 최소 필드만** 다룬다. LIST/POST 계약은 이번 범위에 없다(9절 참고).

### 1-1. `site`

| 필드 | 타입 | nullable | source DB | 공개 가능 | 용도 |
|---|---|---|---|---|---|
| `site.title` | string | 아니오 (fallback 있음) | `site_settings.value` (key=`blog_title`) → 없으면 `profiles.nickname`으로 fallback | 예 | 브라우저 탭 제목, 헤더 로고 텍스트 |
| `site.slug` | string | 아니오 | `profiles.slug` | 예 | 내부 링크 재구성용(직접 노출보다는 `navigation.categories[].href` 등에 이미 조립되어 들어감) |
| `site.faviconUrl` | string \| null | 예 | `site_settings.value` (key=`favicon_url`) | 예 | 파비콘(HOME 템플릿에서 직접 쓸 일은 적지만 계약 일관성을 위해 포함) |
| `site.description` | string \| null | 예 | 현재 없음 — v0.1은 항상 `null` | 예 | 메타 설명/부제 텍스트 자리(향후 `site_settings`에 키 추가 시 채워짐, 필드는 지금부터 존재) |
| `site.language` | string | 아니오 | 저장값 없음, 고정 기본값 `"ko"` | 예 | `lang` 속성 등 국제화 대응 자리(현재는 상수) |

### 1-2. `profile`

| 필드 | 타입 | nullable | source DB | 공개 가능 | 용도 |
|---|---|---|---|---|---|
| `profile.nickname` | string | 아니오 | `profiles.nickname` | 예 | 표시 이름 |
| `profile.bio` | string \| null | 예 | `profiles.bio` | 예 | 자기소개 텍스트 |
| `profile.avatarUrl` | string \| null | 예 | 없음 — Skin Image Slot(`images.profile`, 3절) 해석 결과를 그대로 재노출 | 예 | 프로필 사진. 현재 별도의 "프로필 이미지 업로드" 기능이 앱에 없으므로(감사 결과), raw DB 컬럼이 아니라 이미지 슬롯 해석값을 그대로 반영 — `images.profile`과 값은 같지만 템플릿 작성 편의를 위해 `profile.avatarUrl`로도 노출 |

### 1-3. `navigation`

| 필드 | 타입 | nullable | source DB | 공개 가능 | 용도 |
|---|---|---|---|---|---|
| `navigation.categories` | array (빈 배열 가능) | 아니오 | `categories` (`id`, `name`, `type`) + `posts`/`banners` 개수 집계 | 예 | 카테고리 메뉴/리스트 진입점 렌더링 |
| `navigation.categories[].id` | string | 아니오 | `categories.id` (문자열로 변환) | 예 | 반복 렌더링 시 key, 내부적으로만 사용 — 절대 raw DB PK 타입/의미로 취급하지 않음(불투명 문자열) |
| `navigation.categories[].name` | string | 아니오 | `categories.name` | 예 | 메뉴 라벨 |
| `navigation.categories[].type` | string | 아니오 | `categories.type` | 예 | 아래 "확장성" 참고 |
| `navigation.categories[].href` | string | 아니오 | 앱이 `core/lib/site-path.js`로 조립 | 예 | 내부 링크. Skin은 URL 구조를 몰라도 됨 |
| `navigation.categories[].itemCount` | number \| null | 예 | `posts`/`banners` 개수 집계(무거우면 v0.1에서 생략 가능 — 선택 필드) | 예 | "N개의 글" 같은 보조 텍스트(선택적으로만 사용) |

**`type` 확장성**: 현재 실사용 값은 `"post"`, `"banner"`뿐이지만, 이 필드는 **닫힌 enum이 아니라 열린 문자열**로 계약한다. 렌더러는 `type` 값 자체에 대해 아무 것도 강제하지 않으므로, 나중에 `"gallery"`, `"card"` 같은 새 타입이 DB에 추가돼도 Skin Context 계약(필드 이름/모양)은 변경이 필요 없다.

**주의(v0.1 바인딩 문법의 한계)**: 4절의 `data-imory-if`는 단순 truthy/falsy 판정만 지원하고 `type === "banner"` 같은 **값 비교는 지원하지 않는다**(4-3절). 따라서 "카테고리 `type`에 따라 서로 다른 마크업을 조건부로 렌더링"하는 것은 v0.1 바인딩 문법으로 표현할 수 없다 — v0.1의 `navigation.categories` 반복 렌더링은 `type`과 무관하게 항상 동일한 마크업(이름 + 링크)으로 그려지며, `type`은 Context에 값으로 담겨 있을 뿐 지금 당장 분기에 쓸 수 있는 필드는 아니다. 그럼에도 이 필드를 열린 문자열로 설계해 두는 이유는 계약 자체의 확장성 때문이다: (a) 새 타입이 추가돼도 Context 계약은 안 바뀌고, (b) 그 타입을 모르는 기존 Skin도 "이름 + 링크"라는 최소 렌더링은 계속 보장되며(깨지지 않음), (c) 타입별 조건부 렌더링이 실제로 필요해지는 시점에 `data-imory-if-eq` 같은 제한적 비교 속성을 **additive하게** 추가하면 된다(v0.1에서는 만들지 않음, 4-3절).

### 1-4. `home`

| 필드 | 타입 | nullable | source DB | 공개 가능 | 용도 |
|---|---|---|---|---|---|
| `home.recentPosts` | array (빈 배열 가능) | 아니오 | `posts`(`id, title, created_at, visibility, category_id`) 최신순 제한 조회 | 예 | HOME의 "최근 글" 영역 |
| `home.recentPosts[].id` | string | 아니오 | `posts.id` | 예 | 반복 key + 링크 조립용 |
| `home.recentPosts[].title` | string | 아니오 | `posts.title` — **이미 마스킹 처리된 값**(기존 `applyPostVisibilityTitle` 로직을 Context 빌더가 그대로 재사용해 secret 글 제목을 가림) | 예 | 목록 텍스트. Skin은 visibility 로직을 전혀 몰라도 됨 |
| `home.recentPosts[].href` | string | 아니오 | 앱이 조립 | 예 | 내부 링크 |
| `home.recentPosts[].publishedAt` | string (ISO 8601) | 아니오 | `posts.created_at` | 예 | 날짜 표기 |
| `home.recentPosts[].categoryName` | string \| null | 예 | `categories.name` join | 예 | 선택적 보조 텍스트 |

**의도적으로 뺀 것**: `home.recentPosts[].excerpt`(본문 일부 미리보기)는 v0.1에서 넣지 않는다 — 본문 콘텐츠는 `post_contents`를 별도로 조회해야 하고, secret/private 판단이 title보다 훨씬 민감하다(감사 결과 secret 글은 RPC 통과 전엔 본문 자체를 서버가 안 준다). HOME 단계에서 본문 발췌를 다루는 순간 보호 경계 설계(8절, POST 단계 몫)를 먼저 손대야 하므로 v0.1 범위 밖으로 명시적으로 제외한다.

**개수 제한**: v0.1은 `home.recentPosts`를 Context 빌더가 조회 시점에 **최대 5개로 고정 LIMIT**한다 — Skin Package는 이 개수를 전혀 제어하지 못한다(Skin이 쿼리 파라미터에 영향을 줄 수 있는 통로를 만들지 않기 위한 원칙적 결정). 사용자가 개수를 조절하고 싶어지면 Skin Context 필드가 아니라 별도의 "Skin 설정" 개념으로 추가한다 — Context 계약 자체(1절)는 건드리지 않는다.

### 1-5. `banners`

| 필드 | 타입 | nullable | source DB | 공개 가능 | 용도 |
|---|---|---|---|---|---|
| `banners.items` | array (빈 배열 가능) | 아니오 | `banners`(`id, image_url, category_id` 등, `type='banner'`인 카테고리 소속) | 예 | 배너 영역 렌더링 |
| `banners.items[].id` | string | 아니오 | `banners.id` | 예 | 반복 key |
| `banners.items[].imageUrl` | string | 아니오 | `banners.image_url`(이미 public URL) | 예 | 이미지 소스 |
| `banners.items[].href` | string \| null | 예 | 앱이 조립(연결된 카테고리/글이 있을 때만) | 예 | 클릭 시 이동 |
| `banners.items[].alt` | string \| null | 예 | 없으면 `null` — Skin이 자체 기본 alt를 채움 | 예 | 접근성 |

### 1-6. `images`

| 필드 | 타입 | nullable | source DB | 공개 가능 | 용도 |
|---|---|---|---|---|---|
| `images.<slotName>` | string \| null | 예 (슬롯별) | `skin_image_slot_values`(2절) — 슬롯 이름은 **고정 목록이 아니라 해당 Skin Version의 `imageSlots` 정의에 따라 동적으로 결정** | 예 | Skin이 정의한 이미지 자리마다 실제 URL을 채움 |

`images`는 다른 namespace와 달리 **키가 고정되어 있지 않은 맵**이다 — 어떤 슬롯 이름이 존재하는지는 렌더링하려는 Skin Version의 `imageSlots` 배열(3절)이 결정하고, Context 빌더는 그 목록을 받아 해당 슬롯들만 채워서 돌려준다. `profile`, `header`, `background`는 여러 Skin이 공통으로 쓸 법한 "잘 알려진 이름"으로 관례화할 수 있지만, DB나 렌더러 레벨에서 강제되는 고정 enum은 아니다.

### 1-7. 확장을 막지 않는 구조인가

- **Namespace 추가는 항상 additive다.** 지금 6개(`site`/`profile`/`navigation`/`home`/`banners`/`images`) 외에 나중에 `list.*`, `post.*` 같은 새 namespace를 추가해도 기존 Skin이 참조하는 필드는 그대로 남아있으므로 깨지지 않는다.
- **`navigation.categories[].type`처럼 닫힌 enum 대신 열린 문자열을 쓰는 원칙**을 다른 확장 가능 필드에도 동일하게 적용한다(예: 향후 `home.recentPosts[].contentType` 같은 필드가 생겨도 동일 원칙).
- **`images.*`가 고정 키가 아니라 동적 맵**인 것도 같은 이유 — 새 Skin이 새 슬롯 이름을 도입해도 스키마 변경이 필요 없다.
- **필드 하나가 없을 수 있다는 것 자체가 정상 상태**로 설계되어 있다(예: `site.description`은 지금 항상 `null`) — "없으면 에러"가 아니라 "없으면 조용히 빈 값"이 기본 동작이므로, 데이터 소스가 나중에 채워지기 시작해도 기존 Skin이 깨질 일이 없다.
- LIST/POST 계약을 지금 만들지 않는 것 자체도 확장성 보존이다 — HOME 전용 6개 namespace만 먼저 확정하고, LIST/POST가 필요로 할 `list.*`/`post.*`는 그 단계에서 별도로 설계해 추가한다(9절, `AI_SKIN_AUDIT.md` 7절의 LIST/POST 비대칭 문제와 연결).

---

## 2. Skin 데이터 모델

### 2-1. `skins`

사용자가 가진 하나의 "Skin 인스턴스"(향후 여러 개/클론을 염두에 둔 구조, v0.1은 사용자당 활성 Skin 1개 원칙).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid, FK → `profiles.user_id` | 소유자 |
| `title` | text | 사용자가 보는 Skin 이름(예: "My Skin") |
| `source_skin_id` | uuid, FK → `skins.id`, nullable | 클론 계보(향후 Skin Gallery용, v0.1은 항상 `null`) |
| `is_active` | boolean, default `true` | 이 Skin이 현재 공개 사이트를 제어하는지. **사용자는 여러 개의 `skins` row를 가질 수 있다** — v0.1 UI가 하나만 노출하더라도 DB 구조는 처음부터 다중 보유를 막지 않는다(`unique(user_id)`로 Skin 자체를 1개로 제한하지 않는다). 대신 `is_active=true`인 row가 사용자당 최대 1개가 되도록 **partial unique index**(`user_id` 컬럼에 `where is_active` 조건, 2-3절 참고)를 두는 방향을 우선 검토한다 |
| `current_draft_version_id` | uuid, FK → `skin_versions.id`, nullable | 현재 작업 중인 초안이 가리키는 버전 |
| `current_published_version_id` | uuid, FK → `skin_versions.id`, nullable | 현재 공개된 버전. `null`이면 "아직 발행한 적 없음" |
| `created_at`, `updated_at` | timestamptz | |

### 2-2. `skin_versions`

Skin의 실제 콘텐츠(Skin Package, 3절)를 담는 append-only에 가까운 이력 테이블.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid, PK | |
| `skin_id` | uuid, FK → `skins.id` | |
| `schema_version` | smallint | Skin Package `schemaVersion`과 동일 값(빠른 필터링용으로 컬럼 분리) |
| `content` | jsonb | Skin Package 전체(3절) — `html`/`css`/`imageSlots`/`regions`/`metadata` |
| `label` | text, nullable | 버전 히스토리 UI용 사람이 읽는 라벨(예: "AI 초안 3") |
| `created_by` | uuid, FK → `auth.users.id` | 이 버전을 만든 행위자(항상 소유자 본인 — AI가 대신 만들어도 사용자 세션으로 저장됨) |
| `created_at` | timestamptz | |

**상태(status) 컬럼을 따로 두지 않는다.** "이 row가 draft인지 published인지"는 `skin_versions` 자체의 컬럼이 아니라, `skins.current_draft_version_id`/`current_published_version_id`가 이 row의 `id`를 가리키는지로 판단한다 — **포인터가 유일한 근거(source of truth)**이며, row 자체에 중복된 상태 플래그를 두지 않아 드리프트(포인터와 상태 컬럼이 서로 어긋나는 상황) 가능성을 원천 차단한다. 같은 row가 동시에 draft이자 published일 수도 있다(발행 직후, 아직 편집 전 상태 — 아래 흐름 참고).

**draft/publish/restore 흐름**:
- 초안 편집(AI 응답 적용, 코드 직접 수정 적용 등 "저장할 만한 변경")마다 **새 `skin_versions` row를 만들고** `skins.current_draft_version_id`를 그 새 row로 옮긴다. 이전 draft row는 그대로 이력에 남는다(자동으로 버전 히스토리가 됨, 별도 이력 테이블 불필요).
- **발행(Publish)**: `UPDATE skins SET current_published_version_id = current_draft_version_id`. 새 row를 만들지 않는다 — 이 시점엔 같은 `skin_versions` row가 draft이자 published다.
- 발행 **직후 첫 편집**은 (draft와 published가 같은 row를 가리키는 상태이므로) 그 내용을 복제한 **새 row**를 만들고 `current_draft_version_id`만 그 새 row로 옮긴다 — 이후 draft와 published가 다시 갈라진다. 일반적인 draft/publish UX(발행 후 편집 시작 = 발행본을 베이스로 한 새 초안)와 동일.
- **복원(Restore)**: 과거 `skin_versions` row 하나를 골라 그 `content`를 그대로 복제한 **새 row**를 만들고 `current_draft_version_id`를 옮긴다. 과거 row의 `id`로 포인터를 되돌리지 않는다 — 히스토리 목록이 항상 "시간순으로 단조 증가"하도록 유지해 버전 UI 구현이 단순해진다(마치 git revert처럼, git reset처럼 하지 않음).
- **보존 개수(플랜 29조 "최근 약 10개")**: v0.1은 별도 pruning 로직을 만들지 않는다(row를 무제한 보존해도 스키마상 문제 없음, 사용자 수/버전 수가 적은 이번 단계에서는 과도한 최적화). 나중에 운영 데이터가 쌓이면 정리 배치/트리거를 별도로 추가하면 된다 — 지금 결정할 필요 없음.

### 2-3. `current_draft_version_id` / `current_published_version_id` 포인터 방식이 적절한가

**적절하다고 판단, 채택.** 검토한 대안과 비교:

| | 포인터 방식(채택) | `skin_versions.status` enum + partial unique index |
|---|---|---|
| "현재 published가 뭔지" 조회 | `skins` 1행 조회로 즉시 획득 | `skin_versions`에서 `status='published'` 필터(인덱스 있으면 비슷하게 빠름) |
| 발행 동작 | `skins` 1행 UPDATE, 원자적 | 이전 published row의 status를 내리고 새 row를 올리는 2단계, 트랜잭션 필요 |
| 무결성 위험 | 포인터가 가리키는 row가 삭제되면 댕글링(다만 이 설계에서는 row를 삭제하지 않으므로 실질 위험 낮음) | "정확히 1개만 published"라는 불변식을 partial unique index로 강제해야 함(위반 시 INSERT 실패로 드러남 — 이것도 나쁘지 않은 안전장치) |
| 이 프로젝트의 기존 관례와의 정합성 | `home_customize`가 "1 user_id = 1 row = 현재 상태" 패턴을 이미 쓰고 있음(`AI_SKIN_AUDIT.md` 1-4/1-6절) — 포인터 방식이 이 프로젝트의 기존 사고방식과 더 가까움 | 이 프로젝트에 선례 없음 |

결론: 포인터 방식을 채택하되, `skins.current_draft_version_id`/`current_published_version_id`는 **둘 다 `on delete restrict`**(또는 애초에 `skin_versions` row를 삭제하는 기능 자체를 v0.1에 만들지 않음)로 댕글링 포인터 위험을 원천 차단한다. `skins`와 `skin_versions`가 서로를 참조하는 순환 FK가 되므로, row 생성 순서는 **(1) `skins` row를 두 포인터 모두 `null`로 먼저 생성 → (2) 첫 `skin_versions` row 생성(`skin_id`로 1을 참조) → (3) `skins.current_draft_version_id`를 2로 UPDATE**의 3단계를 지킨다.

### 2-4. `skin_image_slot_values` — 이미지 슬롯 값은 별도 테이블

플랜 25~27조의 핵심 원칙(개인 이미지는 Skin Package에 포함되지 않아야 클론/공유가 안전하다)을 지키려면, "이 Skin이 `profile`이라는 슬롯을 갖고 있다"(구조, `skin_versions.content.imageSlots`에 저장, 공유 가능)와 "이 사용자가 `profile` 슬롯에 실제로 어떤 이미지를 넣었는지"(개인 데이터, 공유 불가)를 물리적으로 분리된 테이블에 저장해야 한다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `skin_id` | uuid, FK → `skins.id` | PK 일부 |
| `slot_name` | text | PK 일부. Skin Version의 `imageSlots[].name`과 매칭 |
| `image_url` | text | 실제 이미지 URL |
| `updated_at` | timestamptz | |

PK는 `(skin_id, slot_name)`. **`skin_version_id`가 아니라 `skin_id`에 연결**하는 이유: 슬롯에 어떤 이미지를 골랐는지는 초안이 바뀌거나 발행해도(슬롯 이름 자체가 안 바뀌는 한) 유지되어야 한다 — 매 버전마다 이미지를 다시 고르게 하면 사용성이 나쁘다.

`image_url`이 아니라 향후 Image Library(Phase 3, 이번 범위 아님)가 생기면 `image_id`(FK)로 바꾸거나 컬럼을 추가하는 확장이 가능하도록, 지금은 기존 favicon/banner/cursor와 동일하게 **URL 문자열 직접 저장** 방식을 채택한다(Image Library를 먼저 만들어야 한다는 선행 의존성을 피하기 위함 — 12절 "하지 않을 것"과 일치).

### 2-5. Regions는 별도 테이블이 필요 없다

`regions`는 항상 특정 `skin_versions.content.html`과 짝을 이루는 구조적 메타데이터(HTML 안의 어떤 부분이 "프로필 영역"인지 등, Phase 7 부분 편집용)이므로, Skin Package jsonb 안의 `regions` 필드(3절)만으로 충분하다. 별도 `skin_regions` 테이블은 만들지 않는다.

### 2-6. 소유자 접근 (RLS — 구조만, SQL은 Slice 0에서 작성)

`skins`/`skin_versions`/`skin_image_slot_values` 셋 다 **RLS 활성화 + 소유자 전용 정책만** 둔다. 세 테이블 어디에도 공개(anon) SELECT 정책을 만들지 않는다 — 이유는 2-7절.

- `skins`: `using (auth.uid() = user_id)` — 소유자 전체 CRUD.
- `skin_versions`: `skin_id`로 `skins`를 조인해 소유자를 확인하는 정책(`exists (select 1 from skins s where s.id = skin_versions.skin_id and s.user_id = auth.uid())`). 단, **GRANT 자체를 SELECT/INSERT까지만 허용하고 UPDATE/DELETE는 아예 부여하지 않는다** — "row는 append-only로 취급, 수정 대신 새 row + 포인터 이동"이라는 2-2절 설계 원칙을 정책(policy) 수준이 아니라 **권한(grant) 수준에서 구조적으로 강제**한다(정책을 깜빡 잘못 써도 GRANT가 없으면 애초에 UPDATE/DELETE 자체가 불가능).
- `skin_image_slot_values`: `skin_versions`와 동일하게 `skin_id` → `skins` 조인 기반 소유자 정책. 이 테이블은 슬롯 값을 교체/삭제하는 게 정상 동작이므로 SELECT/INSERT/UPDATE/DELETE 전부 허용.

세 테이블 모두 **anon에는 아무 권한도 주지 않는다**(`revoke all ... from anon` — `home_customize`가 써온 `using(true)` 전체 공개 패턴을 여기서는 쓰지 않는다). `admin_users`/`invite_links`가 이미 쓰고 있는 "RLS 켜짐 + 필요한 만큼만 GRANT, 특권/공개 접근은 SECURITY DEFINER RPC로만" 패턴(`AI_SKIN_AUDIT.md` 1-4절)을 그대로 따른다.

### 2-7. 공개 접근 — RPC 기반 Public Read Contract

이 프로젝트는 Cloudflare Pages + 브라우저 JS + Supabase 구조로, 공개 HOME을 렌더링하는 주체가 신뢰된 백엔드 프로세스가 아니라 **방문자의 브라우저 JS 자신**이다(`home/site-owner.js`가 이미 이 방식으로 동작 — 클라이언트가 직접 `supabaseClient.from(...)`을 호출하고 RLS가 경계를 강제하며, 별도의 상시 실행 서버는 없다). 따라서 앞선 초안에서 썼던 "Context 빌더(서버/앱 코드)를 통해서만 노출"이라는 표현은 부정확했다 — 실제로는 **DB 레벨에서 공개 읽기 경로 자체를 하나로 좁혀야** 안전하다.

**결정**: 공개 방문자는 `skins`/`skin_versions`/`skin_image_slot_values`를 직접 조회하지 않는다(2-6절대로 anon에는 애초에 아무 권한도 없다). 대신 **단일 SECURITY DEFINER RPC** 하나만 공개 읽기 통로로 둔다.

```
public.get_published_skin(p_user_id uuid) returns jsonb
```

- **입력**: 대상 사용자의 `user_id`. slug→user_id 변환은 기존 `home/site-owner.js`의 `getSiteOwner()`가 이미 하고 있으므로 이 RPC가 slug를 다시 파싱하지 않는다(책임 중복 방지 — 기존 `home_customize` 조회가 이미 "owner resolve → ownerId로 콘텐츠 조회"라는 2단계 흐름을 쓰고 있는 것과 동일).
- **동작**(의사코드 수준 — 실제 SQL은 Slice 0에서 작성):
  1. `skins`에서 `user_id = p_user_id and is_active` 인 row를 찾는다. 없으면 `null` 반환.
  2. `current_published_version_id`가 `null`이면(아직 발행 이력 없음) `null` 반환 — **`current_draft_version_id`는 이 함수 본문 어디에서도 참조하지 않는다**(draft를 들여다볼 방법 자체가 이 함수 안에 없음).
  3. `current_published_version_id`로 `skin_versions.content`(Skin Package 전체)를 가져온다.
  4. 같은 `skin_id`의 `skin_image_slot_values`를 전부 모아 `{ slotName: imageUrl }` 맵으로 만든다.
  5. `{ "skin": <skin_versions.content>, "schemaVersion": ..., "imageSlotValues": { ... } }` 형태의 jsonb 하나로 합쳐 반환.
- **비활성 Skin과 draft는 이 RPC의 반환값에 절대 등장하지 않는다** — 함수 본문이 `is_active`와 `current_published_version_id`만 따라가므로 구조적으로 보장된다(다른 방식으로 우회할 조회 경로 자체가 없음).
- **권한 하드닝**: `AI_SKIN_AUDIT.md` 8절이 지적한 이 프로젝트의 기존 함정(스키마 레벨 기본 권한 때문에 새 함수가 `anon`에 암묵적 `EXECUTE`를 받는 경우가 있었음, `20260903190000_harden_operator_rpc_grants.sql`에서 실제로 발견/수정됨)을 반복하지 않는다 — 함수 생성 직후 `revoke execute ... from public;` 후 `grant execute ... to anon, authenticated;`를 명시적으로 실행한다(이 RPC는 `get_invite_status`처럼 anon 접근이 의도된 설계이므로 `anon`에서 별도로 `revoke`할 필요는 없다 — public에서만 회수하고 anon/authenticated에 명시 grant).
- **소유자(Studio) 쪽 읽기는 이 RPC를 쓰지 않는다** — 소유자는 2-6절의 일반 owner RLS로 `skins`/`skin_versions`/`skin_image_slot_values`를 직접 읽고 쓴다(자신의 draft를 봐야 하므로 애초에 이 RPC로는 불가능하고 그럴 필요도 없다).

이로써 9절(HOME 적용 구조)의 "published skin resolve" 단계는 정확히 다음처럼 구체화된다: `owner resolve(기존)` → `supabaseClient.rpc('get_published_skin', { p_user_id: owner.ownerId })` 단일 호출 → 결과가 `null`이면 10절 fallback(기존 3-way 분기) → 있으면 `{skin, imageSlotValues}`를 Skin Context 조립에 사용.

---

## 3. Skin Package 구조

```json
{
  "schemaVersion": 1,
  "html": "<article class=\"...\">...</article>",
  "css": ".imory-skin-root .profile-block { ... }",
  "imageSlots": [
    { "name": "profile", "label": "프로필 사진", "required": false, "aspectRatioHint": "1:1" },
    { "name": "header", "label": "상단 배경 이미지", "required": false, "aspectRatioHint": "16:9" }
  ],
  "regions": [
    { "id": "profile-block", "label": "프로필 영역" },
    { "id": "recent-posts", "label": "최근 글" }
  ],
  "metadata": {
    "title": "심플 다이어리",
    "generatedBy": "ai",
    "supports": { "home": true, "list": false, "post": false },
    "requiredContext": ["site.title", "profile.nickname", "navigation.categories", "home.recentPosts"]
  }
}
```

| 필드 | 필수 | 역할 |
|---|---|---|
| `schemaVersion` | 필수 | Skin Package 포맷 버전(정수). **정책**: 이 렌더러가 모르는(더 높은) 버전 → **best-effort 부분 렌더를 시도하지 않고** 즉시 렌더 거부 + fallback(10절) — 모르는 스키마를 "일단 그려보는" 시도는 하지 않는다. 이 렌더러가 아는(더 낮은/과거) 버전 → 명시적인 마이그레이션 함수 체인(`migrateV1toV2()` 등)을 통과시켜 최신으로 끌어올린 뒤 렌더하며, 마이그레이션 체인 자체가 실패해도 곧장 fallback(부분 렌더 시도 없음). `validate-layout.js`가 저질렀던 "버전이 다르면 통째로 빈 레이아웃으로 초기화" 실수(`AI_SKIN_AUDIT.md` 6절 위험요소 4번)를 반복하지 않는다. |
| `html` | 필수 | 4절 바인딩 문법이 포함된 템플릿. **저장 시점에 이미 6절 새니타이저를 통과한 정규화된 형태**만 저장한다 — 원본 AI 응답 원문은 별도 보관하지 않는다(재수정 시 항상 새로 생성/검증되므로 원문 보존의 실익이 없음). |
| `css` | 필수(빈 문자열 허용) | **저장 시점에 이미 7절 검증 + 스코프 처리가 끝난 최종 CSS**만 저장한다. 렌더링할 때마다 파싱/스코프를 반복하지 않기 위한 결정 — "이미 안전이 보장된 문자열"이라는 게 저장된 값의 의미다. |
| `imageSlots` | 필수(빈 배열 허용) | 이 Skin이 필요로 하는 이미지 자리의 **구조 정의만**. 개인이 실제로 고른 이미지 URL은 여기 없다(2-4절 `skin_image_slot_values`에 별도 저장) — 이게 클론/공유 시 개인 이미지가 안 딸려가는 이유(플랜 26조). |
| `regions` | 필수(빈 배열 허용) | Phase 7(부분 선택 편집)을 위한 메타데이터. v0.1은 비어 있어도 되지만 필드 자체는 스키마에 존재해야 나중에 스키마 마이그레이션 없이 채울 수 있다. |
| `metadata` | 필수 | 이름/생성 방식/지원 화면(`home`/`list`/`post`)/이 Skin이 요구하는 Context 필드 목록(`requiredContext`). `requiredContext`는 렌더 전에 "Context가 실제로 이 필드들을 채워줄 수 있는지" 사전 점검하는 데 쓸 수 있다(10절 fallback과 연결). |

**개인 데이터와 구조의 분리**: Skin Package(위 JSON 전체)는 원칙적으로 개인 데이터를 전혀 담지 않는다 — `html`은 4절 바인딩 문법(자리표시자)만 담고, 실제 `profiles`/`posts`/이미지 URL은 전부 렌더 시점에 Context로 주입된다. 이것이 "USE THIS SKIN" 복제(향후 기능) 시 `skin_versions.content`를 그대로 새 사용자의 새 `skins`/`skin_versions` row로 복사해도 안전한 이유다 — 복사되는 것은 항상 구조뿐이다.

---

## 4. HTML Template / Skin Context Binding 방식

### 4-1. 후보 비교

| 후보 | 반복/조건 | XSS 안전성 | 구현 복잡도 | 비고 |
|---|---|---|---|---|
| A. `{{profile.nickname}}` 문자열 치환 | 확장 문법(`{{#each}}` 등) 필요 → 사실상 미니 템플릿 엔진 | **직접 이스케이프해야 함** — 안 하면 사용자 데이터(nickname/bio 등)에 포함된 문자열이 그대로 HTML로 해석될 위험 | 반복/조건까지 지원하려면 파서 필요 | AI가 가장 익숙한 문법이지만 안전성을 구현자가 매번 챙겨야 함 |
| B. `data-imory-bind`/`data-imory-repeat`/`data-imory-if` 속성 | DOM 템플릿 클로닝으로 자연스럽게 지원 | **원천적으로 안전** — `element.textContent = value`만 쓰므로 스크립트 삽입 불가 | 파서 불필요, DOM API(`querySelectorAll`/`cloneNode`/`textContent`)만으로 구현 | 유효한 HTML로 계속 남아있어 브라우저가 즉시 파싱해도 안 깨짐 |
| C. Custom Element(`<imory-bind path="...">`) | B와 유사 | B와 동일 | `customElements.define` 필요 — "Imory가 제공하는 런타임 JS"라는 점에서 B와 본질적으로 같은 수준이지만 새 태그 이름을 하나 더 학습시켜야 함 | B 대비 이점 없음 |
| D. 외부 템플릿 엔진(Handlebars 등) 도입 | 이미 완성된 문법 | Handlebars의 `{{{triple}}}`(이스케이프 해제)처럼 **위험한 탈출구가 문법에 내장**되어 있음 — 기술적 강제가 아니라 프롬프트로만 막아야 함 | 외부 의존성 추가, "지나치게 복잡하지 않을 것" 조건과 상충 | 과함 |

### 4-2. 추천: **B(`data-imory-*` 속성 기반)**

이유:
- **텍스트는 항상 `textContent`로만 주입** — HTML 이스케이프를 구현자가 신경 쓸 필요가 원천적으로 없다(`innerHTML`을 쓰지 않는 한 스크립트 삽입 불가). `render-layout.js`의 텍스트 블록이 이미 같은 원칙(`textContent`)을 쓰고 있어 이 프로젝트의 기존 안전 관례와도 일치한다(`AI_SKIN_AUDIT.md` 1-1/4절).
- 값이 없을 때도 자리표시자 문자열이 그대로 노출되는 사고(예: `{{profile.nickname}}`이라는 문자열이 화면에 그대로 찍히는 흔한 버그)가 구조적으로 발생하지 않는다.
- 파서가 필요 없다 — DOM API만으로 구현 가능해 "지나치게 복잡하지 않을 것" 조건을 만족.

### 4-3. v0.1 바인딩 속성 화이트리스트 (5개, additive 확장 전제)

| 속성 | 대상 | 동작 |
|---|---|---|
| `data-imory-bind="path"` | 아무 요소 | `element.textContent = resolve(path)` |
| `data-imory-src="path"` | `img` 등 | `element.src = resolve(path)` — 단, URL 스킴 검증(6절) 통과분만. 실패 시 10절 fallback |
| `data-imory-href="path"` | `a` | `element.href = resolve(path)` — 동일하게 URL 검증 |
| `data-imory-repeat="path"` | 아무 요소(반복 템플릿) | `path`가 가리키는 배열 길이만큼 이 요소를 `cloneNode(true)`, 각 클론 내부에서는 `item.*` 상대 경로로 원소 필드 참조 |
| `data-imory-if="path"` | 아무 요소 | `resolve(path)`가 falsy(빈 배열/`null`/`undefined`/`""`/`false`)면 `hidden` 처리, truthy면 표시 |

이 5개 외의 `data-imory-*` 속성은 v0.1에서 정의하지 않는다 — 필요해지면 화이트리스트에 항목만 추가하는 additive 확장으로, 기존에 저장된 Skin은 영향받지 않는다.

**`data-imory-if`는 v0.1에서 truthy/falsy 판정만 지원한다.** `path`가 가리키는 값이 존재하고 비어있지 않은지만 보며, 그 값을 특정 문자열/숫자와 비교하는 기능(`type === "banner"` 등 값 비교)은 **의도적으로 지원하지 않는다**. PHASE 1A는 expression language나 비교 연산자를 추가하지 않는다 — category `type`별로 다른 마크업을 조건부 렌더링하는 것은 이번 범위 밖이다(1-3절). 실제 필요가 생기면 `data-imory-if-eq="path:value"`류의 제한적 비교 속성을 이 화이트리스트에 additive하게 추가하는 것을 검토한다(지금 만들지 않음).

---

## 5. Static Skin Renderer 계약

```js
renderSkin({ container, skin, context, mode }) -> { update(nextSkin, nextContext), destroy() }
```

| 인자 | 의미 |
|---|---|
| `container` | 마운트할 DOM 엘리먼트. `container.ownerDocument`로 동작하는 document-agnostic 설계(`render-layout.js`의 검증된 패턴 계승 — iframe 안이든 부모 문서든 그대로 동작) |
| `skin` | **이미 sanitize/validate를 통과한** Skin Package. 렌더러는 재검증하지 않는다 — 검증은 별도 단계(6~7절)의 책임이고, 렌더러는 "이미 안전하다고 확인된 것을 그린다"는 책임만 가진다 |
| `context` | Skin Context 객체(1절) |
| `mode` | `"view"` \| `"edit"` \| `"preview"` — v0.1은 `"view"`만 실사용하지만 시그니처는 `render-layout.js`의 mode 파라미터 선례를 계승해 남겨둔다(향후 Region 하이라이트를 `"edit"`에서만 켜는 식의 자연스러운 확장 지점) |

**반환값 `update`/`destroy`가 필요한가 — 필요하다고 판단.**
- `update(nextSkin, nextContext)`: Skin Studio 채팅 편집(향후 Phase 6)에서 매 응답마다 프리뷰를 다시 그리는 UX가 필요하고, `render-layout.js`가 이미 이 계약으로 그 역할을 증명해왔다(재사용 가치 있는 패턴, `AI_SKIN_AUDIT.md` 13-3절).
- `destroy()`: 삽입한 `<style>` 요소 제거 등 정리. v0.1 Static Skin에는 사용자 JS/이벤트 리스너가 없으므로 정리할 게 많지 않지만, 프리뷰를 반복해서 다시 그릴 때 `<style>`이 누적되지 않게 하려면 반드시 필요.

**내부 동작(요약)**:
1. `container` 안에 루트 래퍼 `<div class="imory-skin-root" data-skin-root>` 생성(또는 `update` 시 재사용).
2. `skin.css`(이미 스코프 완료된 최종본, 3절)를 `<style>` 태그로 삽입.
3. `skin.html`을 `DOMParser`(또는 `<template>`)로 파싱해 루트 래퍼에 주입.
4. 4절의 5개 `data-imory-*` 속성을 순회하며 `context`로 해석·주입.
5. `update()` 호출 시 1~4를 다시 수행 — v0.1은 diff 최적화 없이 매번 재구성(`render-layout.js`도 유사한 방식이었으므로 선례와 일치, 최적화는 필요해지면 나중에).

**Preview와 공개 HOME은 완전히 동일한 함수를 사용**한다 — 공개 HOME은 `renderSkin({container: themeMount, skin: publishedSkin, context, mode:"view"})`, Studio 프리뷰는 `renderSkin({container: previewMount, skin: draftSkin, context: previewContext, mode:"preview"})`. 함수 코드는 한 곳, `mode`만 다르다(`render-layout.js`가 이미 증명한 원칙, `AI_SKIN_AUDIT.md` 1-1절 그대로 계승).

---

## 6. HTML Sanitizer

새 파일 `skin/skin-sanitize.js`(가칭)에서 구현. `posts-sanitize.js`의 **접근 방식**(화이트리스트만 남기고 나머지는 제거)만 참고하고, 대상 태그/속성 집합은 Skin 전용으로 새로 정의한다.

### 6-1. 허용 태그

- 구조: `div`, `section`, `article`, `header`, `footer`, `nav`, `main`, `aside`, `figure`, `figcaption`
- 텍스트: `h1`~`h6`, `p`, `span`, `br`, `hr`
- 서식: `b`, `strong`, `i`, `em`, `u`, `small`, `mark`, `blockquote`, `cite`, `sub`, `sup`
- 리스트: `ul`, `ol`, `li`, `dl`, `dt`, `dd`
- 링크/미디어: `a`, `img`
- CSS-only 인터랙션(플랜 8조가 명시적으로 허용): `details`, `summary`
- v0.1 미포함(필요해지면 추후 검토): `table` 계열, 인라인 `svg`

### 6-2. 명시적 금지 태그 — **자식 승격 없이 태그+내용 전체 삭제**

`posts-sanitize.js`는 알 수 없는 태그를 만나면 자식만 남기고 껍데기를 벗기지만(unwrap), 아래 태그는 **내용까지 통째로 제거**해야 한다(예: `<script>` 내부 텍스트가 그대로 노출되면 안 됨):

`script`, `iframe`, `object`, `embed`, `applet`, `link`, `meta`, `base`, `form`, `input`, `button`, `select`, `textarea`, `video`, `audio`, `source`, `track`, `canvas`, `svg`(v0.1 배제), `style`(인라인 `<style>` 태그 금지 — 스타일은 반드시 `css` 필드 파이프라인만 통과해야 하므로, HTML 안에 `<style>`을 허용하면 7절 검증을 우회하는 구멍이 생긴다), `noscript`, `template`

### 6-3. 허용 속성 (태그 무관 공통)

`class`, `lang`, `dir`, `title`, `alt`(img), `href`(a, URL 검증 통과분만), `src`(img, URL 검증 통과분만), `data-imory-bind`/`data-imory-src`/`data-imory-href`/`data-imory-repeat`/`data-imory-if`(4절 5종), `aria-*`, `role`

**`id` 속성은 v0.1에서 전면 금지한다.** Region 식별이 필요하면 `metadata.regions[].id` ↔ 별도의 `data-imory-region` 속성(향후 도입, v0.1 범위 아님)으로 관리하는 편이 안전하다 — `id`를 허용하면 문서 전역 네임스페이스 충돌이나 (POST 단계에서) `#postDetailContent` 같은 보호 대상 id를 흉내 내는 시도까지 막아야 하는 부담이 생긴다.

### 6-4. 명시적 금지 속성 — 전량 제거

`on*`(모든 인라인 이벤트 핸들러, 접두어 매칭으로 일괄 차단), `style`(인라인 스타일 — CSS 파이프라인 우회 방지), `srcdoc`, `formaction`, `xlink:href`, `autofocus`, `contenteditable`, `draggable`, `tabindex`(v0.1 배제)

### 6-5. URL 검증 정책 (`href`/`src` 공통)

- **허용**: `https:` 스킴, 그리고 스킴 없는 내부 상대경로(`navigation.categories[].href` 등 Context가 조립해서 바인딩을 통해 들어오는 값 — AI가 직접 하드코딩한 상대경로 문자열도 `URL` 파서로 실제 스킴을 판별해 위험 스킴 위장이 아님을 확인한 뒤 허용).
- **금지**: `javascript:`, `data:`(이미지 base64 악용/피싱 방지 — 향후 필요해지면 별도 재검토), `vbscript:`, `file:`, `blob:`
- `mailto:`/`tel:`은 위험도는 낮지만 v0.1 범위 최소화 원칙에 따라 **일단 불허**, 필요해지면 화이트리스트에 추가.

### 6-6. 이미지 처리

`img.src`는 `data-imory-src` 바인딩을 쓰는 것을 **권장**하되(플랜 23조 취지), AI가 정적 `https` URL을 직접 넣는 것 자체를 sanitizer가 기술적으로 막지는 않는다 — "이미지 슬롯을 써야 한다"는 강제는 sanitizer가 아니라 AI 프롬프트/품질 가이드의 몫(플랜 45조와 동일한 층위 구분). `alt` 없는 `img`는 경고만 하고 차단하지 않는다(접근성 권장 사항, 차단 사유 아님).

---

## 7. CSS Parser / Scoping / Validator

### 7-1. 후보 비교

| 후보 | 스코프 | 검증(위험 CSS 차단) | @import/@media/@supports/keyframes | CDN | 크기 | 라이선스 | 판정 |
|---|---|---|---|---|---|---|---|
| 정규식 기반 selector rewrite | 가능하지만 취약 | 없음 | 정규식으로는 신뢹성 있게 처리 어려움 | - | - | - | **명시적으로 배제**(요청 사항) |
| **css-tree**(github.com/csstree/csstree, ESLint 조직이 이어받아 관리 — github.com/eslint/csstree) | AST 기반 — Rule마다 Selector를 순회해 프로그래밍적으로 접두어 삽입, 콤마 다중 셀렉터도 개별 처리 가능 | **가능** — 진짜 CSS 문법 파서라 Atrule/Declaration 노드 단위로 `@import` 제거, 위험 `url()` 스킴 차단, 위험 프로퍼티(`-moz-binding` 등) 차단을 같은 트리 순회에서 함께 처리 | 전부 AST 노드로 표현되므로 재귀적으로 동일 처리 가능 | npm `css-tree`, package.json에 `unpkg`/`jsdelivr` 필드로 ESM(`dist/csstree.esm.js`)·IIFE 번들 공식 제공 | 파서+워커+제너레이터 합쳐 중간 규모(모듈 단위로 필요한 것만 import 가능) | MIT | **채택** |
| **stylis**(styled-components/emotion 실사용) | **내장 기능** — `serialize(compile(".imory-skin-root", css), stringify)`로 네임스페이스 스코프를 바로 얻음, nesting/vendor prefix/@media/@keyframes 기본 지원 | **없음** — 컴파일러이지 검증기가 아님, 위험한 `url(javascript:...)`/`@import` 차단 기능 자체가 없어 별도 검증 패스가 반드시 필요 | 기본 지원(전처리기 목적) | npm/unpkg/jsdelivr | 매우 작음(약 3~4KB) | MIT | 스코프만 필요하다면 좋은 선택이지만, **검증까지 함께 필요**한 이번 요구사항에서는 단독으로 부족 — 별도 검증기(=css-tree)와 병행해야 해서 아키텍처가 오히려 복잡해짐 |
| PostCSS 생태계 | 강력, 플러그인 풍부 | 플러그인으로 가능 | 지원 | Node 빌드 파이프라인 전제 설계 — 브라우저 CDN 단독 로드가 번거로움 | 큼(생태계 전체 기준) | MIT | "no build system, CDN script" 전제와 마찰 커서 배제 |
| CSSOM(구형) | 제한적 | 직접 구현 필요 | 제한적 | 있음 | 작음 | MIT | 유지보수 정체, css-tree 대비 이점 없어 배제 |

### 7-2. 추천: **css-tree 단독 채택**

- 스코프+검증+at-rule 처리+custom property 처리까지 **한 라이브러리의 한 파이프라인**(파싱 → AST 순회 → 변형 → `generate()`로 재직렬화)으로 전부 처리 가능 — stylis+별도 검증기 조합보다 아키텍처가 단순하고, 이 프로젝트가 이미 "검증기는 하나로 통일"하는 패턴(`validate-layout.js`)을 갖고 있는 것과도 일관됨.
- 진짜 CSS 문법 기반 AST라 "정규식 기반 selector rewrite는 쓰지 않는다"는 요구를 정확히 만족.
- `package.json`에 `unpkg`/`jsdelivr` 필드가 공식으로 있어 CDN 배포가 패키지 차원에서 지원됨 — 이 프로젝트가 이미 jsdelivr로 `@supabase/supabase-js`를 로드하는 것과 동일한 방식.
- ESLint 조직이 관리를 이어받아 유지보수 신뢰도가 준수.
- **로드 위치가 공개 페이지에 부담을 주지 않는다** — 3절 결정("css는 저장 시점에 이미 스코프 완료된 최종본만 저장")에 따라, css-tree는 **저장(발행) 시점에만** 필요하다. 즉 어드민/Skin Studio 페이지에서만 로드하면 되고, 공개 HOME은 이미 스코프된 CSS 문자열을 `<style>`에 그대로 삽입하기만 하면 되므로 이 라이브러리를 아예 로드할 필요가 없다.
- ESM 번들이 기본이라 `<script type="module">`로 로드해야 하는데, 이 코드베이스는 대부분 classic script지만 `index.html`이 이미 `@google/model-viewer`를 `type="module"`로 로드하는 선례가 있어(완전히 새로운 패턴 도입이 아님) 도입 마찰이 크지 않다.

**패키지 확정은 구현 시점(Slice 3)에 한다**: 현재 원 저장소 `css-tree`(github.com/csstree/csstree)와 ESLint 조직이 이어받은 포크 `@eslint/css-tree`가 별도 npm 패키지로 공존한다 — Slice 3 구현 직전에 두 패키지의 최신 상태(유지보수 활성도, API 동일 여부)를 다시 확인해 **둘 중 하나로 명확히 고정**한다. **CDN 경로는 반드시 exact version을 pin**하고(`https://cdn.jsdelivr.net/npm/css-tree@X.Y.Z/...` 형태), `@latest`나 버전 생략 경로는 production에 쓰지 않는다 — 이 원칙은 이후 이 프로젝트에 추가되는 모든 CDN 의존성에 동일하게 적용한다(css-tree는 Slice 0에서는 전혀 쓰이지 않으므로 지금 결정할 필요는 없다).

### 7-3. 처리 정책

- **강제 스코프**: 모든 Rule의 셀렉터 앞에 `.imory-skin-root ` 접두어를 프로그래밍적으로 삽입.
- **Global selector(`:root`/`html`/`body`) 처리**: 거부하지 않고 **자동으로 `.imory-skin-root`로 치환**한다 — 에러로 막아 AI가 재시도해야 하는 것보다, 의도를 최대한 살려 자동 교정하는 편이 UX상 낫다(10절 fallback 철학 "실패보다 최선의 결과"와 동일 원칙).
- **Broad selector(`*`, `div`, `span`, `p`) 정책**: 완전 차단하지 않는다(디자인 자유도 보존). 스코프 접두어가 강제로 붙으므로(`.imory-skin-root div { ... }`) 스코프 밖으로는 물리적으로 못 나간다 — 이게 1차 방어선. `!important`도 차단하지 않는다(스코프가 걸려있어 시스템 UI에는 어차피 도달 불가).
- **`@import`**: 완전 제거(외부 리소스를 통한 우회 방지).
- **`@media`/`@supports`/`@keyframes`**: 허용, 내부도 재귀적으로 동일 처리(내부 Rule에도 스코프 적용, 내부 `url()`도 동일 검증).
- **CSS custom property(`--*`)**: 허용 — 값 자체가 실행 가능한 코드가 아니므로 위험 낮음.
- **`url()`**: 스킴 검증(6-5절과 동일 정책 — `https:`만 허용, `javascript:`/`data:`/`vbscript:` 등 차단). 위험 프로퍼티(`-moz-binding`, `behavior`, `expression()` — 레거시 IE 전용이지만 방어적으로 차단)는 선언 자체를 제거.
- **Protected selector 차단(8절 선행 설계)**: 컴파일된 셀렉터 문자열에 향후 POST 보호 대상(`#postDetailContent`, `.post-detail-content` 등)이 포함되면 그 Rule 전체를 제거 — v0.1(HOME 전용)에는 실질적 위험이 없지만, 검증기 자체를 POST 단계까지 재사용할 것을 고려해 지금부터 이 규칙을 넣어두는 것을 권장.

---

## 8. Protected Content 정책 (POST 단계 선행 설계)

### 8-1. 단순 selector blacklist만으로 충분한가 — **불충분**

- CSS는 문자열로 직접 대상을 지목하지 않고도 조상-자손 콤비네이터로 간접적으로 넓게 겨눌 수 있다(예: `.imory-skin-root div div div { ... }`) — POST 단계에서 본문 컨테이너가 실제로 스킨 루트 **안**에 위치하게 되면, 이런 넓은 셀렉터가 의도치 않게 본문에도 적용될 수 있다.
- 진짜 안전한 방법은 blacklist가 아니라 **구조적 격리**다.

### 8-2. 권장: 2단 방어

1. **Selector-level 차단(1차, 이미 7-3절에 포함)**: css-tree 검증 단계에서 컴파일된 셀렉터 문자열에 보호 대상(`#postDetailContent`, `.post-detail-content`, 그 하위에서 실제 쓰이는 `.post-dialogue`/`.post-action`/`.post-inline-*`)이 포함된 Rule을 제거. 명시적 시도/실수 대부분을 걸러내지만 완전한 방어는 아니다.
2. **렌더링 순서에 의한 구조적 격리(2차, 핵심 방어)**: **"Skin CSS 적용 → 본문 렌더 → 본문 인라인 스타일을 항상 마지막에 강제 재적용"**이라는 순서를 POST 단계 설계의 원칙으로 못박는다. 이건 새로 발명할 필요가 없다 — `posts-style-render.js`가 **이미 이 방식으로 프로덕션에서 검증**되어 있다(`#postDetailContent`에 preset 값을 매번 인라인 스타일로 다시 씌움, `AI_SKIN_AUDIT.md` 1-3절). 인라인 스타일이 CSS 우선순위상 항상 이기므로, 설령 1차 방어를 우회하는 셀렉터가 뚫려도 `font-family`/`color`/`font-size`/`line-height` 등 인라인으로 강제되는 속성은 최종적으로 항상 원복된다.

### 8-3. 결론

blacklist는 필요하지만 충분하지 않다. **본문 인라인 스타일 강제 재적용이라는 이미 검증된 패턴을 POST 단계에서도 반드시 유지**하는 것이 실질적인 핵심 방어선이며, `background`/`border`/`padding`/`margin` 등 인라인으로 커버되지 않는 속성까지 막으려면 POST 단계에서 추가로 "본문 컨테이너에 대해 상속 리셋을 강제하는 보호 스타일시트를 Skin CSS 뒤에 항상 한 번 더 적용" 하는 방안을 함께 설계해야 한다(구체 구현은 POST 단계 몫, 원칙만 지금 못박아 둔다).

### 8-4. 이 2단 방어는 완전한 격리가 아니다 — 명시적 한계

selector 차단(1차)과 Quote Preset 인라인 스타일 재적용(2차) **둘 다 완전한 격리를 보장하지 않는다.** 특히 `background`/`border`/`padding`/`margin`처럼 Quote Preset의 인라인 스타일 재적용이 애초에 복구하지 않는 속성은, 두 방어선 어느 쪽으로도 근본적으로 보호되지 않는다 — 1차는 명시적 시도를 걸러낼 뿐 우회 가능하고(8-1절), 2차는 애초에 그 속성들을 다루지 않는다.

**POST Skin을 실제 구현하는 단계(예: PHASE 1C)에서 별도의 구조적 보호 방식(8-3절이 제안한 "본문 컨테이너 상속 리셋 스타일시트" 등)을 반드시 확정해야 한다.** 지금(PHASE 1A, HOME 전용)은 이 문제를 의도적으로 미해결 상태로 남겨둔다 — POST 단계에 도달하기 전까지는 스킨 루트 안에 `#postDetailContent`가 실제로 존재하는 상황 자체가 생기지 않으므로 실질적인 위험 노출이 없고, 이 미해결 상태 때문에 PHASE 1A(HOME) 구현을 지연시키지 않는다.

---

## 9. HOME 적용 구조

```
slug (getSiteOwnerSlugFromPath, 기존 그대로)
  → owner resolve (home/site-owner.js:getSiteOwner(), 기존 그대로 — 변경 없음)
  → [신규] published skin resolve:
       supabaseClient.rpc('get_published_skin', { p_user_id: owner.ownerId }) 단일 호출(2-7절)
       → null이면(스킨 없음 / 아직 미발행 / 비활성) → 기존 initHomeRenderer() 3-way 분기로 폴백(10절)
       → 있으면 { skin, imageSlotValues } 확보
  → [신규] Skin Context 생성 (skin/skin-context.js, 1절 6개 namespace)
  → [신규] renderSkin({ container: themeMount, skin, context, mode: "view" })
```

### 9-1. 삽입 지점

`index.html`의 `initHomeRenderer()` **앞에** 새 분기를 하나 추가한다: *"이 사용자에게 published 상태인 새 `skins` row가 있으면 새 렌더러로, 없으면 기존 `initHomeRenderer()`(legacy_sua/customize/notice 3-way)를 그대로 호출한다."*

`profiles.home_mode`에 새 enum 값을 추가하는 방식은 **채택하지 않는다** — 그 대신 "새 `skins` published row의 존재 여부"만으로 우선순위를 가른다. 이렇게 하면:
- 이번 단계에서 `profiles.home_mode` 관련 migration이 전혀 필요 없다(DB 변경 최소화, `AI_SKIN_AUDIT.md` 13절 원칙과 일치).
- 기존 `legacy_sua`/`customize` 사용자는 100% 기존 그대로 동작(회귀 위험 없음).
- 새 시스템은 테스트 계정 한둘에만 수동으로 `skins`/`skin_versions` row를 넣어 병행 검증 가능(11절 Slice 4).
- 나중에(`AI_SKIN_AUDIT.md` 13-4절 DB 정리 단계) 모든 사용자가 전환되면 `home_mode` 컬럼 자체를 걷어낸다.

### 9-2. 새 파일 구조

기존 `customize/`와 완전히 분리된 새 최상위 디렉토리 `skin/`을 제안한다(13절 "기존 코드와 독립" 원칙과 직결 — 나중에 `customize/`를 통째로 삭제해도 새 코드는 전혀 영향받지 않음):

- `skin/skin-context.js` — Context 빌더(1절)
- `skin/skin-render.js` — `renderSkin()`(5절)
- `skin/skin-sanitize.js` — HTML sanitizer(6절)
- `skin/skin-css-validate.js` — CSS 검증/스코프, css-tree 기반(7절) — **저장 시점 전용**, 공개 HOME에는 로드하지 않음
- `skin/skin-fallback.js` — fallback 처리(10절), Imory 기본 skin 하드코딩 포함

`index.html`에는 최소한의 훅만 추가한다(스크립트 로드 라인 + 분기 조건 하나) — 기존 `renderCustomizeHome()`/`loadSuaTheme()`/`initHomeRenderer()` 내부 로직은 한 줄도 건드리지 않는다.

---

## 10. Fallback

| 상황 | 동작 |
|---|---|
| Skin 없음(`skins` row 자체가 없음) | 기존 `initHomeRenderer()` 3-way 분기로 그대로 폴백 — 새 시스템 미적용 사용자와 동일하게 취급, 별도 에러 화면 없음 |
| published version 없음(`current_published_version_id`가 `null` — draft만 있음) | 공개 방문자에게는 위와 동일하게 **기존 3-way 분기로 폴백**(새 시스템이 개입하지 않은 것처럼). Studio 프리뷰(소유자 본인 화면)는 이 규칙과 무관하게 draft를 그대로 보여준다 |
| HTML validation 실패 | 원칙상 저장 시점에 이미 걸러져 발행될 수 없어야 함. 그래도 런타임 파싱 실패가 발생하면 → Imory 기본 fallback skin(플랜 15조가 명시한 "AI 생성 실패 시 반드시 존재해야 하는 fallback")으로 렌더 + 콘솔/로그 경고 |
| CSS validation 실패 | HTML은 그대로 렌더하고 **CSS만 빈 문자열로 대체** — 레이아웃이 무너진 채로라도 콘텐츠 노출이 완전 실패 화면보다 낫다는 판단 |
| schema version 불일치 | 상위(모르는 미래) 버전 → **best-effort 부분 렌더 시도 없이 곧장** Imory 기본 fallback skin. 하위(아는 과거) 버전 → 마이그레이션 함수 체인으로 최신화 후 정상 렌더, 체인 자체가 실패해도 곧장 fallback(3절 정책과 동일) |
| context 일부 데이터 없음(카테고리 0개 등) | `data-imory-if`가 자연스럽게 해당 블록을 숨김(4절 바인딩 설계가 원래 이 상황을 위한 것) — 에러 아님, 정상적인 빈 상태 |
| image slot 비어 있음 | Imory 기본 placeholder 이미지로 대체(플랜 27조 "Preview에는 placeholder를 표시한다" 원칙을 공개 HOME에도 동일 적용) — 완전히 숨기는 것보다 레이아웃 안정성이 낫다는 판단 |

---

## 11. PHASE 1A 구현 순서 (계획만 — 아직 실행하지 않음)

목표: **AI/OpenAI 연결 없이, 정적 테스트 Skin 하나가 HOME에서 정상 렌더**되는 것까지(Slice 0~4). Slice 5는 안정성 보강.

### Slice 0 — DB 스키마 마련

- **새 파일**: `supabase/migrations/{ts}_create_skins_skin_versions.sql`(테이블 3종), `supabase/migrations/{ts}_rls_skins_skin_versions.sql`(RLS + GRANT, 2-6절), `supabase/migrations/{ts}_add_get_published_skin_rpc.sql`(공개 read RPC, 2-7절) — 프로젝트 관례상 CREATE/RLS/RPC를 별도 파일로 분리한 전례(`20260830132600`/`20260830140000` 페어, `20260903150000`+`20260903180000` 페어)를 따름
- **변경 파일**: 없음
- **완료 조건**: 로컬/스테이징 Supabase에 마이그레이션 3개 적용 성공, 수동 SQL로 (a) 소유자 CRUD 정상 동작, (b) `skin_versions` UPDATE/DELETE가 GRANT 자체가 없어 거절됨(append-only 강제), (c) 다른 로그인 사용자에게 남의 skin이 RLS로 안 보임, (d) `get_published_skin()`이 draft/비활성 상태에서는 항상 `null`을 반환하고 발행 후에만 값을 반환함을 확인
- **테스트 방법**: `supabase/tests/` 관례(`20260903_invites_manual_test.sql`)를 따라 role 흉내(`set_config('request.jwt.claims', ...)` + `set local role`) 기반 수동 테스트 SQL 작성, 전부 `begin ... rollback`으로 감싸 실제 데이터 비영향
- **rollback**: 순수 additive(신규 테이블/함수만 추가) — `DROP TABLE`/`DROP FUNCTION`으로 완전 가역, 기존 스키마/데이터 영향 없음

### Slice 1 — Skin Context 빌더

- **새 파일**: `skin/skin-context.js`
- **변경 파일**: 없음
- **완료 조건**: `buildSkinContext(ownerId)` 호출 시 1절 스키마에 맞는 객체가 실제 DB 데이터로 채워져 반환됨
- **테스트 방법**: 임시 테스트 페이지(`skin/skin-context-test.html`, `renderer-test.html` 관례 계승)에서 콘솔 출력 수동 확인
- **rollback**: 신규 파일 삭제만으로 완전 가역

### Slice 2 — 정적 테스트 Skin + Sanitizer + Renderer 최소 구현

- **새 파일**: `skin/skin-sanitize.js`, `skin/skin-render.js`, `skin/test-skins/static-test-skin.json`(4절 바인딩 문법을 실제로 쓴 간단한 HOME 템플릿 하드코딩)
- **변경 파일**: 없음
- **완료 조건**: 테스트 페이지에서 `renderSkin({container, skin: staticTestSkin, context: mockContext, mode:"view"})` 호출 시 실제로 레이아웃이 그려짐(텍스트 바인딩, 반복, 조건 각 최소 1개씩 확인)
- **테스트 방법**: 수동 브라우저 확인 + `mockContext`를 여러 형태(카테고리 0개, null 값 포함)로 바꿔가며 10절 케이스 일부 선행 검증
- **rollback**: 신규 파일만, 완전 가역

### Slice 3 — CSS 검증/스코프(css-tree 도입)

- **새 파일**: `skin/skin-css-validate.js`
- **변경 파일**: 없음(css-tree CDN `<script type="module">`은 테스트 페이지에만 임시 추가 — 이 시점엔 아직 Studio UI가 없음)
- **완료 조건**: 악의적 CSS 샘플(`@import`, `url(javascript:...)` 등)을 넣으면 스코프된 안전한 CSS만 결과로 나오는 것을 확인
- **테스트 방법**: `skin/skin-css-validate-test.html`에 위험 케이스 배열을 두고 콘솔 assert
- **rollback**: 신규 파일 + 테스트 페이지 삭제로 완전 가역

### Slice 4 — HOME 진입점 연결 (기존 파일을 처음 건드리는 단계)

- **변경 파일**: `index.html`(`initHomeRenderer()` 호출 직전에 9-1절 분기 추가 + Slice 1~3 스크립트 로드 라인 추가)
- **새 파일**: 없음
- **완료 조건**: 테스트 계정 1개에 수동 SQL로 `skins`/`skin_versions` row를 넣으면 그 계정의 `/:slug`에서 새 렌더러가 그려지고, 다른 계정(legacy_sua 1개, customize 1개)은 기존과 동일하게 동작
- **테스트 방법**: 스테이징에서 실제 방문 확인(신규 경로) + 회귀 확인(기존 두 경로)
- **rollback**: `index.html`에 추가한 분기 조건/로드 라인만 되돌리면 완전 가역 — 기존 로직은 한 줄도 안 바꿨으므로

### Slice 5 — Fallback 구현

- **새 파일**: `skin/skin-fallback.js`(Imory 기본 fallback skin 하드코딩 포함)
- **변경 파일**: 없음(Slice 4의 분기에서 fallback 호출 연결)
- **완료 조건**: 10절의 7가지 케이스를 각각 인위적으로 재현(`current_published_version_id`를 잘못된 값으로 바꿔보는 등)해 화면이 깨지지 않고 표대로 동작하는지 확인
- **테스트 방법**: 수동 재현 + 체크리스트
- **rollback**: 신규 파일 삭제 + Slice 4의 호출 라인 제거

**참고**: Slice 1~3은 서로 독립적이라 순서를 바꾸거나 병렬 진행해도 무방하다. 기존 코드를 처음 건드리는 지점은 Slice 4 하나뿐이며, 그마저도 "추가"만 하고 "수정"은 하지 않는다.

---

## 12. PHASE 1A에서 하지 않을 것

- OpenAI API 연동
- AI 채팅 UI
- Start Questionnaire
- Image Library 구현(`skin_image_slot_values`는 URL 문자열 직접 저장 방식으로 미리 대비만 해둠, 2-4절)
- LIST Skin 적용(Skin Context/렌더러 모두 HOME 전용, 9절)
- POST Skin 적용(8절은 설계만 선행, 구현 아님)
- Claude API / BYOK
- Skin Gallery(`skins.source_skin_id` 컬럼만 미리 준비, 2-1절)
- 기존 `customize/*` 코드 삭제
- 기존 `home_customize`/`profiles.home_mode` 삭제 또는 변경

---

## 요약

### 1) 추천 아키텍처 요약

`skins`(사용자당 다중 보유 가능, `is_active` partial unique index로 활성 1개만 강제, 포인터 기반 draft/publish) + `skin_versions`(append-only 이력, 상태 컬럼 없이 포인터가 유일한 근거, GRANT 레벨에서 UPDATE/DELETE 자체를 막아 append-only를 구조적으로 강제) + `skin_image_slot_values`(개인 이미지, Skin Package와 분리 저장) → **공개 읽기는 테이블 직접 노출이 아니라 단일 SECURITY DEFINER RPC `get_published_skin`으로만**(draft/비활성은 이 함수 어디에서도 참조되지 않음, 2-7절) → Skin Context(6개 namespace, additive·열린 enum 설계) → Skin Package(jsonb: html/css/imageSlots/regions/metadata, schemaVersion 불일치는 best-effort 없이 즉시 fallback) → `data-imory-*` 속성 바인딩(파서 불필요, `textContent`/`src`/`href` 대입만이라 XSS 원천 차단, truthy 전용 조건문) → `skin/skin-sanitize.js`(HTML 화이트리스트) + `skin/skin-css-validate.js`(css-tree 기반, 파싱+검증+스코프+직렬화를 한 파이프라인) → `renderSkin()`(프리뷰/공개 동일 함수, `render-layout.js` 계약 계승) → `index.html`에 최소 침습적 분기 하나로 삽입 → 7가지 상황에 대한 명시적 fallback. 기존 `customize/*`·`home_customize`·`profiles.home_mode`는 이번 단계에서 전혀 건드리지 않는다.

### 2) 남은 제품 결정 사항 — 이번 라운드에서 확정됨

- 사용자당 여러 Skin 허용, `is_active` partial unique index로 "활성 Skin은 사용자당 최대 1개"만 강제(`unique(user_id)`로 Skin 자체를 제한하지 않음, 2-1절)
- `schemaVersion` 상위 불일치는 best-effort 부분 렌더 없이 즉시 fallback(3, 10절)
- `id` 속성 금지 유지(6-3절)
- `mailto:`/`tel:` v0.1 불허 유지(6-5절)
- `home.recentPosts`는 앱이 최대 5개로 고정, Skin Package가 개수를 제어하지 않음(1-4절)
- `data-imory-if`는 truthy/falsy 전용, 값 비교 없음 — type별 분기는 v0.1 범위 밖(1-3, 4-3절)
- 공개 읽기는 테이블 직접 노출이 아니라 단일 RPC `get_published_skin`으로만(2-7절)

**아직 남아있는 것**:
- css-tree vs `@eslint/css-tree` 최종 패키지 선택(Slice 3 구현 직전 재확인, 7-2절)
- Slice 0 실제 SQL 작성 시 partial unique index/RPC의 정확한 문법(설계는 끝났고 실제 SQL은 Slice 0 구현 산출물)
- POST 단계(PHASE 1C 등)의 구조적 보호 방식(8-4절, 지금 확정하지 않음 — HOME 구현을 지연시키지 않기 위해 의도적으로 미룸)

### 3) PHASE 1A 구현 착수 가능 여부

**가능.** Slice 0~4는 의존성이 명확하고 각 단계가 독립적으로 rollback 가능해 안전하게 시작할 수 있다. 기존 코드를 건드리는 지점은 Slice 4의 `index.html` 분기 추가 하나뿐이며, 그것도 추가만 하고 기존 로직은 수정하지 않는다.

### 4) 구현 전 사용자가 직접 결정해야 할 것

이번 라운드로 실질적으로 해소됨. 남은 건:
- css-tree 도입 최종 승인(이번 설계에서 제안하는 첫 신규 외부 라이브러리) — Slice 3 시점에 재확인
- `skin/` 최상위 디렉토리 신설 동의(레포 구조 변경)
- Slice 0(migration)을 실제로 언제 스테이징/프로덕션에 적용할지 일정
