# IMORY SHARE CARD — 글 공유 카드 (X large image)

공개 글 주소를 X(Twitter)에 붙여 넣었을 때 뜨는 카드 한 장
(1200 × 628, `summary_large_image`)과 그 설정 화면의 기준 문서다.

관련 문서
- 표시 공간/화면 전환 계약: [SKIN_SURFACE_AND_TRANSITION_CONTRACT.md](./SKIN_SURFACE_AND_TRANSITION_CONTRACT.md)
- 글 대표 이미지(post_covers)와 프록시: [IMORY_GALLERY1_DESIGN.md](./IMORY_GALLERY1_DESIGN.md) §3-5
- 캐시/배포 버전: [core/lib/build-version.js](./core/lib/build-version.js)

---

## 1. 현재 구현 — 파일

| 파일 | 역할 |
| --- | --- |
| [core/lib/share-card.js](./core/lib/share-card.js) | **카드 레이아웃의 유일한 출처**. 설정 값 정규화 + 카드 HTML 문서 한 장 생성. ES 모듈(브라우저·Workers 양쪽에서 돈다) |
| [admin/settings/admin-share-card.js](./admin/settings/admin-share-card.js) | SETTINGS > SHARE > CARD 화면(사진·오버레이·폰트·저장·실시간 미리보기) |
| [functions/api/og/post.js](./functions/api/og/post.js) | `/api/og/post` 카드 PNG + meta 조회/문자열 생성 |
| [functions/_middleware.js](./functions/_middleware.js) | 공개 글 주소의 HTML 응답에 og/twitter meta 주입 |
| [index.html](./index.html) | 사이트 기본 카드 meta 블록(서버가 이 블록을 교체한다) |
| [images/share-card-default.png](./images/share-card-default.png) | 서비스 기본 카드(1200 × 628) |
| [supabase/migrations/20260913170000_create_user_share_cards_bucket.sql](./supabase/migrations/20260913170000_create_user_share_cards_bucket.sql) | `user-share-cards` 공개 버킷 + 정책 |
| [admin/share-card-e2e-test.mjs](./admin/share-card-e2e-test.mjs) | e2e(포트 8954) — 설정 · 레이아웃 실측 · **실제 Pages Function** 응답 |

---

## 2. SETTINGS 탭 구조

기존 `BANNER` 탭의 이름을 **`SHARE`** 로 바꾸고, 그 안에 내부 탭 두 개를 뒀다.

```
SETTINGS
  PROFILE | HOME | CATEGORY | SHARE | DATA
                              └ BANNER | CARD
```

- `SHARE > BANNER` — **기존 배너 기능 그대로**다. DOM id(`myBanner*`),
  저장 키(`banner_url`), 버킷(`user-banners`), 고정 URL 규칙 모두 바꾸지
  않았다. 바뀐 것은 바깥 탭 이름과 한 겹 더 들어간 위치뿐이다.
- `SHARE > CARD` — 이번 라운드.

바깥 탭의 DOM id는 `bannerTabButton` → `shareTabButton`,
패널은 `bannerSettingsPanel` → `shareSettingsPanel`로 바뀌었다.
sessionStorage에 남아 있던 예전 값 `"banner"`는
`SETTINGS_SECTION_ALIASES`가 `"share"`로 옮겨 읽는다 — 다른 앱에 갔다
돌아온 사람이 첫 탭으로 튀지 않는다. 안쪽 탭도 같은 방식으로
`admin-share-section`에 기억한다.

---

## 3. 설정 저장 — site_settings 한 칸

새 테이블도 새 컬럼도 만들지 않는다. `site_settings(user_id, key, value)`의
`key = 'share_card'` 한 행에 JSON 문자열로 넣는다(`blog_title` ·
`favicon_url` · `hide_memo_entry`와 같은 자리, 같은 RLS).

```json
{
  "image_url": "https://.../user-share-cards/<uid>/<uuid>",
  "overlay": "black",
  "overlay_strength": 55,
  "font": "pretendard",
  "version": "1757800000000"
}
```

- `overlay`: `black` | `white` 외의 값은 `black`으로 되돌린다.
- `overlay_strength`: 0~100 정수로 자른다.
- `font`: `pretendard` | `nanum-myeongjo` — 그 외는 `pretendard`.
- `version`: **save를 누른 시각**. 설정을 바꿀 때만 달라진다.

정규화는 `normalizeShareCardSettings()` 한 곳에서만 한다(화면과 서버가
같은 함수를 쓴다). 값이 없거나 깨졌으면 카드가 안 나오는 대신 기본
모양으로 나온다.

### 기본 카드 사진

- 버킷: **`user-share-cards`**(공개). 경로는 `{user_id}/{uuid}` —
  고를 때마다 새 경로다(FAVICON/CURSOR와 같은 규칙:
  `admin/settings/admin-image-setting.js`).
- 배너 버킷을 쓰지 않는다: 배너는 "주소가 절대 안 바뀌어야" 하고
  카드 사진은 "바뀔 때마다 주소가 달라져야" 한다 — 규칙이 정반대다.
- 올리기 전에 `prepareImoryUploadImage()`가 메타데이터 제거 + 압축을
  한다(모든 업로드 경로 공용).
- 저장이 **성공한 뒤에야** 밀려난 예전 파일을 지운다. 저장이 실패하면
  방금 올린 파일을 그대로 두어 재시도가 가능하다.

---

## 4. 카드 레이아웃 (고정 좌표)

캔버스는 항상 1200 × 628이고 반응형이 없다. 화면에서 작게 보여야 할
때는 **부모가 `transform: scale()`** 로만 줄인다 — 레이아웃이 다시
계산되지 않으므로 미리보기와 실제 카드의 글자 배치가 같다.

```
 y   0   ┌──────────────────────────────── POST 014 ──┐  (top 40, right 64)
         │                                            │
         │              배경 사진 + 오버레이            │
 y 355   │ 기록                                        │
 y 383   │ 글 제목 (최대 2줄 · 46px/1.2 = 110.4px)      │
 y 503   │ @slug · 카테고리              imory.me      │
 y 525   └───────────── 글자 끝 ──────────────────────┘
 y 528   ░░░ X UI 데드존 — 아무 글자도 없음 ░░░
 y 628   └────────────────────────────────────────────┘
```

- 좌우 여백 64px(요구 최소 48px).
- 글자 덩어리의 바닥은 캔버스 바닥에서 **103px** 위다(요구 최소 100px).
- 제목 자리는 사진 구도와 무관하게 **항상 같다**.
- 글자 크기와 `line-height`를 모두 못박아 뒀다 — 브라우저 기본
  `line-height: normal`은 폰트마다 달라서, 그대로 두면 데드존이 폰트
  선택에 따라 흔들린다.
- 두 줄 자르기는 `-webkit-line-clamp: 2`가 한다(글자 수로 자르지
  않는다 — 두 화면이 같은 규칙을 써야 한다).
- 한글은 단어 안에서 끊지 않는다(`word-break: keep-all`).

### 오버레이와 글자색

| 오버레이 | 제목 | 보조 글자 |
| --- | --- | --- |
| BLACK | `#ffffff` | `rgba(255,255,255,0.86)` |
| WHITE | `#333333` (짙은 회색, **순검정 아님**) | `#555555` |

강도는 `--share-card-alpha`(0~1)로 들어가고, 아래에서 위로 걷히는
그라데이션 + 위쪽 약한 비네트 두 겹에 함께 곱해진다.

### 우상단 라벨 — `POST 014`

표시 번호를 따로 저장하는 구조가 없으므로 **글 id를 세 자리로 채워**
쓴다. 이미 주소(`/:slug/post/:id`)에 드러난 값이고, 글을 옮기거나
다른 글을 지워도 달라지지 않는다(카드가 예측 가능해야 한다).

### 배경 우선순위

1. 글 대표 이미지 — `post_covers`가 있으면 `/api/post-cover?post=<id>`
2. 카드 설정의 기본 사진 — `share_card.image_url`
3. 둘 다 없으면 서비스 기본 그라데이션(카드 CSS 안)

1번은 **비공개 버킷**이라 공개 주소가 없다. 헤드리스 브라우저도 다른
방문자와 똑같이 기존 프록시로 받는다 — 그 프록시가 요청 시점의 글
공개 상태를 다시 본다. **대표 이미지를 공개 버킷으로 복사하지 않는다**
(그러면 비밀글로 바꾼 뒤에도 열리는 주소가 생긴다).

---

## 5. 미리보기 = 실제 카드

같은 함수 `buildShareCardHtml()`이 만든 **같은 HTML 문서**를

- 설정 화면은 `iframe srcdoc`에 넣고,
- 서버는 헤드리스 브라우저에 넘겨 스크린샷을 찍는다.

그래서 마크업·CSS·웹폰트가 같다. 두 웹폰트(Pretendard · 나눔명조)
스타일시트를 **항상 둘 다** 링크해서, 폰트를 바꿔도 문서를 다시 만들지
않아도 되고 서버 렌더에서도 고른 폰트가 확실히 로드된다.

색·강도·폰트·글자는 `postMessage({type:"imory-share-card", ...})`로
즉시 바꾼다(문서 재생성 없음 → 깜빡임 없음, 배경 사진 재요청 없음).
문서를 다시 만드는 경우는 처음과 **배경 주소가 바뀔 때**뿐이다.

미리보기 샘플 글: 주인장의 **공개 글** 중 최근 12개에서 대표 이미지가
있는 글을 먼저 고르고, 없으면 가장 최근 공개 글. 공개 글이 하나도
없으면 안전한 예시 제목을 쓴다(비공개/비밀글은 후보에 넣지 않는다).

---

## 6. 실제 X 카드 — 서버가 하는 일

### 6-1. meta 주입

이 사이트는 `_redirects`의 `/* /index.html 200` 때문에 모든 경로가 같은
`index.html`을 받는다. 크롤러는 JS를 실행하지 않으므로 **클라이언트에서
meta를 고치는 방법은 없다.**

그래서 `functions/_middleware.js`가 `next()`로 받은 HTML 응답에서,
경로가 `/:slug/post/:id`이고 200 HTML일 때만 `index.html`의

```html
<!-- imory:share-card-meta -->  …  <!-- /imory:share-card-meta -->
```

블록을 **교체**한다. 뒤에 덧붙이지 않는 이유: `og:title`이 두 번 적히면
어느 쪽을 쓰는지가 크롤러마다 다르다.

주입하는 것:

```
og:type=article · og:site_name · og:url · og:title · og:description
og:image(절대 URL) · og:image:width=1200 · og:image:height=628 · og:image:alt
twitter:card=summary_large_image · twitter:title · twitter:description
twitter:image · twitter:image:alt
```

`twitter:player`·`og:video`·영상 카드 meta는 **넣지 않는다** — 정적 large
image 카드로만 제공해서 X가 영상형 회색 바를 얹을 여지를 만들지 않는다.

본문을 고쳤으므로 원래 응답의 `content-length`/`etag`는 지우고,
`Cache-Control: no-cache`를 명시한다(`_headers`의 no-cache는 `/`와
`/index.html`에만 걸리고 slug 동적 경로까지 덮지 않는다).

글이 아닌 주소·HTML이 아닌 응답·GET이 아닌 요청에는 손대지 않는다.
조회 결과는 성공한 경우에만 Workers Cache에 60초 담아 둔다(방금 공개로
바꾼 사람이 기다리지 않도록 실패는 캐시하지 않는다).

### 6-2. 카드 이미지

```
GET /api/og/post?post=<글 id>&v=<버전>
```

- 글 id 하나로 주인을 거꾸로 찾는다(크롤러가 받아갈 주소를 짧게 유지).
- `visibility !== 'public'`이면 제목도 발췌도 대표 이미지도 **조회하지
  않고** 서비스 기본 카드를 준다.
- 카드 HTML을 만들어 **Cloudflare Browser Rendering REST API**에 넘겨
  1200 × 628 PNG를 받는다.

#### 처리 순서 (고정)

```
1) 캐시 조회            ← 렌더러를 부르기 전
2) 지금 공개인가 확인    ← 캐시 적중과 무관하게 항상 (posts.visibility 한 번)
3) 적중이면 그 바이트 / 아니면 조회 → 렌더 → 저장
```

- 버전이 붙은 주소는 `public, max-age=31536000, immutable`로 주고
  **Workers Cache API에도 넣는다.** 그래서 같은 `post + v`의 반복
  요청은 Browser Rendering을 **다시 부르지 않는다** — 이 엔드포인트에서
  유일하게 비싼 일이 렌더 한 번이다.
- **캐시가 권한 검사를 건너뛰지 않는다.** 적중이어도 2)를 매번 한다.
  공개가 아니면 캐시의 바이트를 내보내지 않고 그 항목을 지운다 —
  `functions/api/post-cover.js`가 잡은 "권한은 매번 다시, 바이트는 다시
  보내지 않는다"와 같은 규칙이고, 비공개로 바꾸는 순간 그 다음 요청부터
  막힌다.
- 2)의 조회가 실패하면 `isPublic = false`가 되어 기본 카드로 내려간다 —
  막히는 쪽으로 틀린다(공개 글이 잠깐 기본 카드로 보이는 것이, 비공개
  글의 카드가 나가는 것보다 낫다).
- **담지 않는 것**: 기본 카드로 내려간 응답(비공개 · 설정 없음 · 렌더
  실패)과 **버전 없는 주소**(`?post=N`만 있는 요청). 담으면 공개로
  바꾼 뒤에도 기본 카드가 계속 나간다. 버전 없는 주소의
  `Cache-Control`은 기본 카드와 같은 `public, max-age=300`이다.
- HEAD 요청도 캐시를 쓰고, 본문 없이 헤더만 준다.

#### 왜 헤드리스 브라우저인가

Workers 런타임에는 canvas도 폰트 래스터라이저도 없다. 한글 제목을
서버에서 그리려면 실제 브라우저가 필요하고, 이 저장소에는 빌드 시스템이
없어 satori/resvg 같은 npm 의존을 번들할 수도 없다. Browser Rendering은
같은 계정 안의 1st-party 서비스이고, **설정 화면과 같은 HTML 문서**를
그대로 렌더하므로 미리보기 일치가 구조적으로 보장된다.

필요한 환경 변수(Pages > Settings > Environment variables):

```
CF_ACCOUNT_ID                Cloudflare account id
CF_BROWSER_RENDERING_TOKEN   Browser Rendering 권한 API 토큰
```

(`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` 이름도 받는다.
`CF_BROWSER_RENDERING_ENDPOINT`는 테스트에서 가짜 렌더러를 끼우는
자리다.)

#### 설정이 없거나 렌더가 실패하면

`/images/share-card-default.png`(1200 × 628)를 `max-age=300`으로 준다.
카드가 깨진 이미지로 뜨는 일은 없고, 환경 변수가 채워지면 5분 안에
실제 카드로 바뀐다. **이 기본 카드에는 글자가 없다** — 브랜드 색
그라데이션 한 장이다.

### 6-3. 버전 (SNS 캐시)

`shareCardVersionToken()`이 아래를 FNV-1a로 섞어 짧은 해시를 만든다.

```
카드 설정 version · 기본 카드 사진 주소 · posts.updated_at · 대표 이미지 유무
```

매 요청마다 timestamp를 붙이지 않는다 — 그러면 SNS가 카드를 매번 다시
받아가고 렌더 비용만 늘어난다. **실제로 바뀔 때만** 주소가 달라진다.

---

## 7. 비밀글 / 비공개 글

- meta: 제목·본문 발췌·대표 이미지가 **응답 어디에도 없다**. 블로그
  제목(공개 값)과 기본 카드 이미지만 들어간다.
- 이미지: 헤드리스 렌더러를 **아예 부르지 않고** 기본 카드를 준다.
- 판정은 RLS에 의존하지 않는다 — anon이 비밀글의 행을 볼 수 있다는
  사실과 무관하게 `visibility === 'public'`을 코드가 직접 확인한다.
- 서버 함수는 Service Role 키를 쓰지 않는다. anon 키만 들고 가고,
  요청자의 쿠키/토큰은 쓰지 않는다(크롤러에게는 세션이 없고, 이
  엔드포인트는 누구에게나 같은 답을 줘야 한다).
- slug와 글 주인이 다르면 "없는 글"로 끝난다.

---

## 8. 테스트

```
node admin/share-card-e2e-test.mjs                # 전부 (87 PASS)
node admin/share-card-e2e-test.mjs --only=meta    # 브라우저 불필요
node admin/share-card-e2e-test.mjs --only=image   # 브라우저 불필요
node admin/share-card-e2e-test.mjs --only=cache   # 브라우저 불필요
node admin/share-card-e2e-test.mjs --only=settings
node admin/share-card-e2e-test.mjs --only=card
node admin/share-card-e2e-test.mjs --only=preview
```

| 절 | 확인 |
| --- | --- |
| `settings` | SHARE 탭 이름 · 안쪽 BANNER/CARD · **기존 배너 기능 그대로** · 저장 전에는 서버에 쓰지 않음 · 사진은 새 경로 업로드 · share_card JSON 저장 · version 갱신 · 재로드 유지 |
| `card` | 1200 × 628 실측 · **바닥 100px 데드존** · 좌우 48px · 긴 제목 2줄 · 배경이 바뀌어도 제목 자리 고정 · BLACK/WHITE 글자색(순검정 아님) · 배경 우선순위(대표 이미지 → 기본 사진 → placeholder) |
| `preview` | 데스크톱/모바일 1200:628 유지 · 가로 넘침 0 · 슬라이더가 문서 재생성 없이 즉시 반영 |
| `meta` | **실제 `_middleware.js` 응답** — summary_large_image · og:image 절대 URL · 1200×628 · 발췌 · twitter:player 없음 · og:title 한 번 · 비밀글/비공개 글의 제목·발췌·대표 이미지 없음 · 글이 아닌 주소는 무변경 |
| `image` | **실제 `api/og/post.js`** — 1200×628 PNG · 렌더러에 넘긴 HTML이 설정 화면과 같은 문서 · 배경이 프록시 주소(버킷/서명 URL 아님) · 비밀글은 렌더 호출 0 · 설정 없음/렌더 실패 시 기본 카드 · 버전은 실제 변경 때만 달라짐 |
| `cache` | 같은 `post + v` 재요청에 **Browser Rendering 호출 0** · `immutable` 응답 · HEAD도 캐시 사용(본문 없음) · **캐시가 권한 검사를 건너뛰지 않음**(비공개로 바꾸면 캐시된 카드가 나가지 않고 항목이 지워지며, 다시 공개로 바꾸면 같은 주소에서 즉시 실제 카드) · 기본 카드와 버전 없는 주소는 담지 않음 · `caches` 없는 런타임에서도 동작 |

`meta`/`image`/`cache` 절은 배포되는 그 파일(`functions/**`)을 node에서
그대로 import해서 돌린다. Supabase만 흉내 내고, Pages Function이 보는
PostgREST는 **anon이 볼 수 있는 것만** 돌려준다(공개 글의
post_contents/post_covers만, private 행은 주지 않는다).

node에는 Workers Cache API(`caches`)가 없으므로 `cache` 절이 Supabase ·
Browser Rendering과 같은 방식으로 최소 구현을 끼운다(`installCacheShim()`).
**실제 Cloudflare edge/Workers Cache 동작 자체는 실배포 확인 항목**이다 —
이 절이 증명하는 것은 "코드가 캐시를 언제 보고, 언제 담고, 언제 무시하는가"다.

---

## 9. 남은 차이 · 확인이 필요한 것

1. **Browser Rendering 환경 변수가 없으면 카드에 글자가 없다.**
   `CF_ACCOUNT_ID` / `CF_BROWSER_RENDERING_TOKEN`을 Pages에 넣어야
   실제 카드가 그려진다. 그때까지는 기본 그라데이션 카드다.
   (mock으로 검증한 것은 "요청 모양과 실패 시 동작"이고, Cloudflare
   응답 자체는 실배포에서 확인해야 한다.)
2. **migration 미적용.** `20260913170000_create_user_share_cards_bucket.sql`
   을 Supabase SQL Editor에 붙여 넣어야 기본 카드 사진 업로드가
   동작한다(버킷이 없으면 업로드가 실패한다). 그 전에도 오버레이·폰트
   설정과 대표 이미지 배경은 동작한다.
3. **줄바꿈 위치의 엔진 차이.** 미리보기는 보는 사람의 브라우저,
   실제 카드는 Chromium 계열 헤드리스다. 같은 CSS·같은 폰트지만
   Safari에서 본 미리보기의 줄바꿈 지점이 1~2글자 다를 수 있다.
   글자 수로 자르지 않고 `line-clamp`에 맡긴 것은 그 차이를 두 화면이
   같은 규칙으로 흡수하게 하려는 선택이다.
4. **홈·카테고리·폴더 주소의 카드는 사이트 기본 카드**다. 글 주소만
   글별 카드를 만든다.
5. **Pages 번들이 `core/lib/share-card.js`를 함께 묶는지**는 실제 배포
   로그에서 확인이 필요하다(Functions 바깥의 상대 import — esbuild가
   따라가는 것이 정상 동작이다).
6. 기본 카드(`images/share-card-default.png`)에 로고/글자가 없다.
   Workers에서 글자를 래스터화할 수단이 없어 브랜드 그라데이션만
   그렸다. 글자가 필요하면 디자인 이미지를 만들어 같은 경로에
   1200 × 628로 갈아 끼우면 된다(코드 변경 없음).
