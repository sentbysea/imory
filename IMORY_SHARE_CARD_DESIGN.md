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
| [admin/settings/admin-share-card.js](./admin/settings/admin-share-card.js) | SETTINGS > SHARE > CARD 화면(미리보기·기본 사진·위치 조정 모달·오버레이 색/강도·폰트/제목 크기·카드 라벨·저장) |
| [functions/api/og/post.js](./functions/api/og/post.js) | `/api/og/post` 카드 PNG + meta 조회/문자열 생성 |
| [functions/_middleware.js](./functions/_middleware.js) | 공개 글 주소의 HTML 응답에 og/twitter meta 주입 |
| [index.html](./index.html) | 사이트 기본 카드 meta 블록(서버가 이 블록을 교체한다) |
| [images/share-card-default.png](./images/share-card-default.png) | 서비스 기본 카드(1200 × 628) |
| [supabase/migrations/20260913170000_create_user_share_cards_bucket.sql](./supabase/migrations/20260913170000_create_user_share_cards_bucket.sql) | `user-share-cards` 공개 버킷 + 정책 |
| [supabase/migrations/20260913180000_add_posts_share_label_seq.sql](./supabase/migrations/20260913180000_add_posts_share_label_seq.sql) | `posts.share_label_seq` — 자동 라벨 번호를 게시 시점에 굳힌다(§4-3) |
| [admin/share-card-e2e-test.mjs](./admin/share-card-e2e-test.mjs) | e2e(포트 8954) — 설정 · 레이아웃 실측 · **실제 Pages Function** 응답 |
| [supabase/share-label-seq-migration-test.mjs](./supabase/share-label-seq-migration-test.mjs) | **실제 Postgres(PGlite)** 로 위 migration 실행 — backfill · 번호 고정 · 트리거 순서 · GRANT |

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

카드 설정은 새 테이블도 새 컬럼도 만들지 않는다.
`site_settings(user_id, key, value)`의 `key = 'share_card'` 한 행에 JSON
문자열로 넣는다(`blog_title` · `favicon_url` · `hide_memo_entry`와 같은
자리, 같은 RLS).

(자동 라벨의 **번호**만 예외로 `posts.share_label_seq` 컬럼을 쓴다 —
아래 §4-3.)

```json
{
  "image_url": "https://.../user-share-cards/<uid>/<uuid>",
  "image_position_x": 50,
  "image_position_y": 50,
  "overlay_color": "#000000",
  "overlay_strength": 55,
  "font": "pretendard",
  "title_size": 46,
  "card_label": "",
  "frame": "none",
  "version": "1757800000000"
}
```

- `overlay_color`: `#rrggbb`. 이 색의 밝기로 카드 안 글자색이 정해진다
  (§4-2). 값이 깨졌으면 `#000000`.
- `overlay_strength`: 0~100 정수로 자른다.
- `font`: `pretendard` | `nanum-myeongjo` — 그 외는 `pretendard`.
- `title_size`: **제목만**의 크기(px). 32~72로 자른다 — 그 바깥은
  카드 레이아웃이 깨진다(§4-1).
- `image_position_x` / `image_position_y`: 기본 카드 사진의 구도
  (0~100%). 카드의 `background-position`과 위치 조정 모달의
  `object-position`이 **같은 값**을 쓴다.
- `card_label`: 우상단 글자. 비우면 자동 라벨(§4-3). 24자로 자른다.
- `frame`: 지금은 `none`만 그린다(§4-4).
- `version`: **save를 누른 시각**. 설정을 바꿀 때만 달라진다.

정규화는 `normalizeShareCardSettings()` 한 곳에서만 한다(화면과 서버가
같은 함수를 쓴다). 값이 없거나 깨졌으면 카드가 안 나오는 대신 기본
모양으로 나온다.

### 예전 값과의 호환

컬러 피커 이전에는 `overlay: "black" | "white"` 두 개뿐이었다.
`overlay_color`가 없으면 그 값을 `#000000` / `#ffffff`로 옮겨 읽는다 —
**저장을 한 번도 다시 하지 않아도** 예전 카드가 그대로 나온다. 새로
저장할 때는 `overlay_color`만 쓴다.

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
- 새 사진을 고르면 구도는 가운데(50/50)로 돌아간다 — 예전 사진의
  구도를 물려받으면 엉뚱한 자리가 잘린다.

---

## 3-1. SETTINGS > SHARE > CARD 화면 순서

```
SHARE CARD                                       x large image
┌───────────────────────────────────────────────────────────┐
│ PREVIEW  (1200 × 628, 실제 카드와 같은 문서)                │
└───────────────────────────────────────────────────────────┘
가장 최근 공개 글로 보여줍니다.            ☐ 기본 사진 미리보기

기본 사진                        [ change ] [ edit ] [ remove ]
글에 대표 이미지가 있으면 그 사진을 쓰고, 없을 때만 이 사진을 씁니다.

오버레이   [■]  ──────●────────────   58%
폰트       [Pretendard ▾]   제목 크기  [ 52 ] px
카드 라벨  [ 비우면 카테고리 · 001            ]

                                                      [ save ]
```

- **PREVIEW가 맨 위다.** 아래 모든 설정이 저장 전에도 즉시 반영된다.
- 기본 사진에 작은 썸네일 상자를 두지 않는다 — 어떤 사진인지는 위
  미리보기가 실제 카드 모양으로 보여준다. `edit` · `remove`는 기본
  사진이 없으면 잠겨 있다.
- **오버레이 색 + 강도**가 한 줄, **폰트 + 제목 크기**가 한 줄이다.
  390px에서도 같은 줄에 들어간다(e2e `preview` 절이 잰다).
- 네모 컬러 피커(`.quote-color-input`)와 네모 숫자 칸
  (`.quote-number-input`)은 Quote Preset 화면의 것을 **그대로** 쓴다
  (`admin/admin-quote.css`). 이 화면에서는 폭만 맞춘다.
- 사진 위치·라벨·색·크기 전부 **draft**다. `save`를 눌러야 서버에
  간다. 사진 파일만 예외로 고르는 순간 새 경로에 올라간다(주소가
  있어야 미리보기에 보인다).

### 기본 사진 미리보기 토글

최신 글에 대표 이미지가 있으면 미리보기 배경을 그 사진이 차지해서
기본 사진의 구도 변경이 화면에 전혀 보이지 않는다. 그래서:

- 위치 조정 모달이 열려 있는 동안에는 미리보기가 **기본 사진**으로
  바뀐다.
- 모달에서 `save`를 누르면 결과를 볼 수 있게 `기본 사진 미리보기`
  토글이 켜진 채로 닫힌다.
- 이 토글은 **저장되지 않는다**(화면을 다시 열면 꺼져 있다). 기본
  사진과 대표 이미지가 둘 다 있을 때만 나온다.

### 사진 위치 조정 모달 (`edit`)

- 원본 파일은 손대지 않는다. 자르거나 다시 올리지 않는다.
- 모달 안에 **정확히 1200 : 628 비율의 프레임**이 있고, 그 안에서
  사진을 끌어 구도를 정한다.
- 프레임은 카드와 같은 규칙으로 사진을 담는다 —
  카드는 `background-size: cover` + `background-position`,
  모달은 `object-fit: cover` + `object-position`. 그래서 **여기서
  보이는 자리가 카드에서 보이는 자리**이고, 자르기 좌표를 따로
  계산하지 않는다.
- 드래그는 pointer 이벤트 하나로 마우스와 터치를 함께 받는다.
  프레임에 `touch-action: none`이 걸려 있어 모바일에서 화면 스크롤로
  가로채이지 않는다.
- 끌린 거리 → 퍼센트 환산: 사진은 프레임보다 한 축이 크고(cover),
  그 **넘치는 만큼**이 0%~100%가 움직일 수 있는 전부다. 포인터가
  `dx`만큼 움직이면 위치는 `dx / 넘치는 폭 × 100`만큼 반대로 간다 —
  끄는 대로 사진이 따라온다. 넘침이 0인 축(비율이 딱 맞는 사진)은
  움직이지 않는다.
- 우하단 `save`로 적용, `cancel` · `Escape` · 바깥 클릭으로 취소.
  취소하면 끌던 구도를 버리고 직전 값으로 돌아간다.
- **이 모달의 `save`는 서버에 쓰지 않는다.** draft만 바뀌고, 설정
  화면의 `save`에서 `image_position_x/y`로 함께 저장된다.

### 구도는 기본 사진에만 적용된다

글 대표 이미지(`post_covers`)가 배경일 때는 항상 가운데(50% 50%)다.
그 사진은 글이 스스로 고른 것이고, 카드 설정과 함께 움직이면 글마다
구도가 어긋난다. 판정은 `shareCardBackgroundPosition()` 한 곳에서
한다("지금 깔린 배경이 기본 카드 사진인가").

---

## 4. 카드 레이아웃 (고정 좌표)

캔버스는 항상 1200 × 628이고 반응형이 없다. 화면에서 작게 보여야 할
때는 **부모가 `transform: scale()`** 로만 줄인다 — 레이아웃이 다시
계산되지 않으므로 미리보기와 실제 카드의 글자 배치가 같다.

```
 y   0   ┌───────────────────────────────── 기록 · 034 ──┐  (top 40, right 64)
         │                                              │
         │              배경 사진 + 오버레이              │
         │                                              │
 y 403   │ 글 제목 (최대 2줄 · 46px/1.2 = 110.4px)        │
 y 513   │                                  imory.me    │
         ├──────────── 글자 끝(바닥에서 115px) ──────────┤
 y 528   ░░░ X 검은 링크 바 데드존 — 아무 글자도 없음 ░░░
 y 628   └──────────────────────────────────────────────┘
```

### 4-1. 카드 위의 글자는 셋뿐이다

| 자리 | 내용 |
| --- | --- |
| 좌하단 | **글 제목** |
| 우하단 | `imory.me` (도메인) |
| 우상단 | **카드 라벨**(사용자 지정 · 없으면 자동) |

제목 위 카테고리 라벨과 제목 아래 `@slug · 카테고리` 메타 줄은
**없앴다.** X가 카드 아래 검은 링크 바에 블로그 제목을 이미 얹기
때문에(§6-1) 같은 정보가 두 번 보였다.

- 좌우 여백 64px(요구 최소 48px).
- 글자 덩어리의 바닥은 캔버스 바닥에서 **115px** 위다 —
  데드존(100px)을 넘지 않으면서, 예전(103px)처럼 과하게 띄우지도
  않는다(요구 110~120px).
- 제목 자리는 사진 구도와 무관하게 **항상 같다**.
- 제목 크기는 사용자 설정(32~72px)이지만 `line-height` 배수(1.2)와
  두 줄 제한은 고정이다. 그래서 어떤 크기에서도 덩어리의 **바닥**은
  같은 자리이고, 커질 때 위로만 자란다(72px 두 줄 = 172.8px →
  y 340에서 시작, 라벨을 침범하지 않는다).
- 글자 크기와 `line-height`를 모두 못박아 뒀다 — 브라우저 기본
  `line-height: normal`은 폰트마다 달라서, 그대로 두면 데드존이 폰트
  선택에 따라 흔들린다.
- 두 줄 자르기는 `-webkit-line-clamp: 2`가 한다(글자 수로 자르지
  않는다 — 두 화면이 같은 규칙을 써야 한다).
- 한글은 단어 안에서 끊지 않는다(`word-break: keep-all`).

### 4-2. 오버레이 색과 글자색

오버레이 색은 사용자가 컬러 피커로 고른 `#rrggbb` 하나다. 카드 안
글자색은 **그 색의 밝기에서 자동으로** 나온다 —
`shareCardOverlayPalette()` 한 곳에서만 판정한다.

```
밝기 = (0.299R + 0.587G + 0.114B) / 255
```

| 밝기 | 제목 | 보조 글자(라벨 · 도메인) |
| --- | --- | --- |
| ≤ 0.6 (어두운 오버레이) | `#ffffff` | `rgba(255,255,255,0.86)` |
| > 0.6 (밝은 오버레이) | `#333333` (짙은 회색, **순검정 아님**) | `#555555` |

강도는 `--share-card-alpha`(0~1)로 들어가고, 아래에서 위로 걷히는
그라데이션 + 위쪽 약한 비네트 두 겹에 함께 곱해진다.

미리보기가 슬라이더를 끌 때는 문서를 다시 만들지 않고
`postMessage`로 값만 보낸다. 그때 **색 판정은 부모가 하고 결과
(palette)를 실어 보낸다** — 같은 규칙이 카드 문서 안에 한 벌 더
적히지 않게 하려는 것이다.

### 4-3. 우상단 카드 라벨

**사용자가 `CARD LABEL`에 적으면 그 문구 그대로**다
(`ARCHIVE` · `SUMMER 2028` · `LOG 034`). 24자로 자른다.

비워 두면 자동 라벨을 만든다:

```
카테고리 · 001        (2028 · 034 · MUSIC · 003)
```

- 이름은 글이 실제로 들어 있는 **가장 안쪽 컨테이너**다 — 폴더 안의
  글이면 폴더 이름, 아니면 카테고리 이름.
- 번호는 그 컨테이너 안에서 공개된 글을 **`created_at` 오름차순**으로
  센 순번을 세 자리로 채운 것이다. 사용자 지정 목록 정렬
  (`sort_order`)은 쓰지 않는다.
- 이름도 번호도 없으면 라벨은 빈 문자열이고, 카드에 **그리지
  않는다**(`.share-card-label:empty { display: none }`).

#### 번호를 왜 컬럼에 굳히나 — `posts.share_label_seq`

요청할 때마다 세면 **이미 세상에 나간 카드의 번호가 뒤바뀐다**:

> 003번 글을 공유한 다음 001번 글을 지우면, 그 카드를 다시 받아가는
> 크롤러에게는 같은 글이 002가 된다.

그래서 **게시 시점의 순번을 한 번 계산해서 굳힌다.**

- 컬럼: `posts.share_label_seq`
  (`supabase/migrations/20260913180000_add_posts_share_label_seq.sql`)
- 기존 공개 글은 migration이 **한 번만** backfill한다
  (컨테이너별 `created_at` asc, 동률은 `id` asc로 tie-break).
- 그 뒤로는 BEFORE 트리거가 채운다: 공개 글에 번호가 없으면
  컨테이너의 `max + 1`. 비공개로 돌려도 지우지 않는다(다시 공개하면
  같은 번호여야 한다). 다른 폴더/카테고리로 옮기면 그쪽 번호 공간의
  맨 끝을 새로 받는다.
- 트리거 이름은 `posts_sync_share_label_seq_trg`다. 같은 테이블의
  BEFORE 트리거는 이름 알파벳순으로 도는데,
  `posts_sync_folder_and_sort_order_trg`(f)가 먼저 돌아야 한다 —
  그 트리거가 "카테고리를 바꾸면 `folder_id`를 null로 되돌리는" 일을
  하고, 이쪽은 **확정된 컨테이너**를 보고 번호를 매겨야 한다.
- GRANT는 SELECT에만 준다. 값을 채우는 것은 트리거뿐이다
  (`sort_order`와 같은 규칙).

#### migration이 아직 없는 배포

`share_label_seq`를 고른 select는 PostgREST가 통째로 400으로 거절한다.
그때는 **컬럼 없이 한 번 더** 물어보고,

- 서버는 "같은 컨테이너의 공개 글 중 이 글보다 먼저 쓰인 것"을 세서
  임시 번호를 만든다(앞 글이 지워지면 달라지는 값 — 정상 경로가
  아니다),
- 설정 화면은 번호를 비운다(라벨이 `기록`처럼 이름만 남는다).

카드가 통째로 안 나오는 것보다 낫다는 판단이다.

### 4-4. 프레임 — 지금은 `none`만

`frame` 값은 이미 저장 · 정규화 · 카드 마크업(`data-frame`)까지
실려 다닌다. 실제 그림은 `shareCardFrameCss()` 한 함수 안의 분기이고,
지금은 `none`(아무것도 안 그림)뿐이다.

나중 후보: `border` · `polaroid` · `camera`. 새 프레임을 더할 때
고치는 곳은 **`core/lib/share-card.js` 한 곳**이다 — 프레임이 글자
자리를 밀어야 하면 같은 블록에서 `.share-card-block` ·
`.share-card-domain` 좌표를 함께 옮긴다. 설정 화면 코드도 서버
코드도 손대지 않는다.

### 4-5. 배경 우선순위

1. 글 대표 이미지 — `post_covers`가 있으면 `/api/post-cover?post=<id>`
2. 카드 설정의 기본 사진 — `share_card.image_url`
   (이때만 `image_position_x/y` 구도가 적용된다)
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

색·강도·폰트·제목 크기·글자·사진 구도는
`postMessage({type:"imory-share-card", ...})`로 즉시 바꾼다(문서 재생성
없음 → 깜빡임 없음, 배경 사진 재요청 없음). 문서를 다시 만드는 경우는
처음과 **배경 주소가 바뀔 때**뿐이다.

그 메시지에는 **이미 계산된 값**만 실린다 — 오버레이 색에서 나온
글자색(`shareCardOverlayPalette()`)과 배경 구도
(`shareCardBackgroundPosition()`)를 부모가 계산해서 보낸다. 같은 규칙이
카드 문서 안에 한 벌 더 적히지 않게 하려는 것이다.

미리보기 샘플 글: 주인장의 **공개 글** 중 최근 12개에서 대표 이미지가
있는 글을 먼저 고르고, 없으면 가장 최근 공개 글. 공개 글이 하나도
없으면 안전한 예시 제목을 쓴다(비공개/비밀글은 후보에 넣지 않는다).
그 글의 폴더/카테고리 이름과 `share_label_seq`가 자동 라벨에 쓰인다 —
공개 화면과 **같은 resolveShareCardLabel()** 를 지난다.

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

#### 조회 캐시는 60초 — 단, 카드 설정은 매번 다시 읽는다

meta 조회 결과는 Workers Cache에 60초 담는다(같은 글의 연속 요청).
그런데 **카드 설정만은 적중해도 다시 읽는다**(질의 하나,
`loadShareCardSettings`). 설정을 저장하자마자 링크를 붙여 넣었을 때
그 사이 크롤러가 받아가는 `og:image`가 아직 옛 `v`이면, 크롤러는 그
한 번을 자기 쪽에 오래 담아 두므로 그 트윗이 옛 카드로 굳는다.
카드 라벨도 설정값이므로 함께 다시 만든다.

#### og:title 과 twitter:title 이 다르다

X 앱은 카드 **아래에** 자기 검은 반투명 바를 얹고 거기에
`twitter:title`을 쓴다. 그 바의 자리와 디자인은 우리가 제어할 수 없다.
그래서 역할을 나눈다:

| 어디 | 무엇 |
| --- | --- |
| 카드 이미지 안 (좌하단) | **글 제목** |
| X 검은 링크 바 | **블로그 제목만** |
| 카드 우하단 | `imory.me` |

- `og:title` = **실제 글 제목** 그대로(`|` 같은 구분자도 붙이지
  않는다). 페이스북/카카오·검색엔진이 글을 식별하는 값이고, 그쪽에는
  우리가 제어하지 못하는 링크 바가 없다.
- `twitter:title` = **`site_settings.blog_title` 만.** 글 제목 · slug ·
  카테고리 · 구분자가 하나도 들어가지 않는다 — 들어가면 카드 안의 글
  제목과 같은 말이 두 번 보인다.
- 블로그 제목이 비어 있으면 `imory.me`로 대체한다
  (`SHARE_CARD_SITE_TITLE_FALLBACK`).
- 공개 글이 아니면 둘 다 블로그 제목이다(글 제목이 새지 않는다).

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

`/images/share-card-default.png`(1200 × 628)를 준다. 카드가 깨진
이미지로 뜨는 일은 없다. **이 기본 카드에는 글자가 없다** — 브랜드 색
그라데이션 한 장이다.

| 갈래 | `Cache-Control` | 왜 |
| --- | --- | --- |
| 비공개 · 비밀글 | `public, max-age=300` | 공개로 되돌리면 5분 안에 바뀐다 |
| 렌더 실패 · 설정 없음 · 조회 실패 | `no-store` | **다음 요청이 다시 그려야 한다** (아래) |

#### 렌더 실패는 굳지 않는다 (2026-09-13)

실측: 같은 공개 글의 카드를 연달아 새 버전으로 부르면 **세 번에 한 번쯤**
기본 그라데이션이 나왔다. 그 실패는 1초 안에 돌아온다 — 타임아웃이 아니라
Browser Rendering이 즉시 돌려준 오류다(한도 초과 등). 같은 조건에서
Supabase 읽기는 25/25 정상이었고 저장된 기본 사진 주소도 200이었다.

이것이 "설정 미리보기에는 사진이 보이는데 트윗 카드는 기본 그라데이션"의
정체였다. 크롤러는 글을 올린 **그 순간 한 번** 긁어간다. 그 한 번이
실패에 걸리면, 주소에 버전이 박혀 있어(immutable) 그 트윗의 카드는 계속
기본 그라데이션이다.

- 일시적 실패(fetch 실패 · 408 · 425 · 429 · 5xx)는 **최대 3번까지 다시
  시도한다**(250ms · 750ms 간격). 설정 없음(`not-configured`)과 4xx는
  다시 해도 같으므로 바로 포기한다.
- 재시도에는 **15초 상한**이 있다. 측정된 실패는 1초 안에 돌아오므로
  세 번이 2초도 안 걸린다. 반대로 렌더가 느려서 실패하는 경우라면 다시
  해도 느릴 것이고, 그동안 크롤러를 붙잡고 있는 것이 기본 카드를 빨리
  주는 것보다 나쁘다.
- 그래도 실패하면 그 응답은 **캐시하지 않는다**(`no-store` + Workers
  Cache에 담지 않음). 같은 주소의 다음 요청이 진짜 카드를 받는다.

#### 왜 기본 카드인지 응답이 말한다

네 갈래가 전부 같은 PNG를 같은 헤더로 돌려주던 것을 고쳤다. `curl -I`
한 번으로 원인이 보인다.

```
X-Imory-Share-Card: render | cache
                  | fallback:not-public | fallback:no-owner | fallback:no-post
                  | fallback:not-configured | fallback:render-429 | fallback:fetch-failed
X-Imory-Share-Card-Background: ok | none | missing-404 | unreachable
X-Imory-Share-Card-Attempts:   1 | 2 | 3
```

배경 확인(`probeShareCardBackground`)은 렌더와 **동시에** 보내는 HEAD
한 번이라 카드가 늦어지지 않고, 결과는 헤더와 캐시 판단에만 쓴다.
CSS `background-image`에는 `onerror`가 없어서, 사진 주소가 죽으면 카드는
조용히 "그라데이션 + 글자"가 된다 — 그 경우와 "사진을 설정하지 않았다"를
구분할 방법이 이 헤더다.

**사진이 닿지 않은 채로 그려진 카드는 굳히지 않는다**: `max-age=300`으로
주고 Workers Cache에도 담지 않는다. 1년 immutable로 굳히면 사진이
돌아와도 그 주소는 영영 사진 없는 카드다.

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
node admin/share-card-e2e-test.mjs                # 전부 (165 PASS)
node admin/share-card-e2e-test.mjs --only=meta    # 브라우저 불필요
node admin/share-card-e2e-test.mjs --only=image   # 브라우저 불필요
node admin/share-card-e2e-test.mjs --only=cache   # 브라우저 불필요
node admin/share-card-e2e-test.mjs --only=settings
node admin/share-card-e2e-test.mjs --only=card
node admin/share-card-e2e-test.mjs --only=crop
node admin/share-card-e2e-test.mjs --only=preview
node admin/share-card-e2e-test.mjs --only=photo    # 진짜 사진 + 진짜 렌더

node supabase/share-label-seq-migration-test.mjs  # 실제 Postgres(PGlite)
```

`IMORY_SHARE_SHOT=<디렉터리>`를 주면 판정 대신 **눈으로 볼 PNG**를
남긴다(모바일/데스크톱 설정 화면 · 위치 조정 모달 · 실제 1200 × 628
카드 두 장).

| 절 | 확인 |
| --- | --- |
| `settings` | SHARE 탭 이름 · 안쪽 BANNER/CARD · **기존 배너 기능 그대로** · **PREVIEW가 맨 위** · BLACK/WHITE 버튼 없음 + 네모 컬러 피커 · 저장 전에는 서버에 쓰지 않음 · 사진은 새 경로 업로드 · 썸네일 상자 없음 · 기본 사진이 없으면 edit/remove 잠김 · share_card JSON(색·강도·폰트·제목 크기·라벨·구도·frame) 저장 · version 갱신 · 재로드 유지 · **share_label_seq 컬럼이 없는 배포에서도 화면이 뜬다** |
| `card` | 1200 × 628 실측 · **기준선이 바닥에서 110~120px**(데드존 100px 보장) · 좌우 48px · 긴 제목 2줄 · **TXT 자리(카테고리 라벨)와 `@slug · 카테고리` 메타 줄이 없다** · 카드 위 글자는 제목·라벨·도메인 셋뿐 · **자동 라벨 `카테고리 · 001`** · 폴더 안의 글은 폴더 이름 · **CARD LABEL을 적으면 그 문구, 비우면 자동** · 제목 크기만 커지고 기준선 고정 + 범위 클램프 · 오버레이 색의 밝기가 글자색을 정함(순검정 아님) · 배경이 바뀌어도 제목 자리 고정 · 배경 우선순위(대표 이미지 → 기본 사진 → placeholder) |
| `crop` | **사진 위치 조정 모달** — 1200:628 프레임 · `object-fit: cover` · `touch-action: none` · 편집 중 미리보기가 기본 사진으로 전환 · **끄는 대로 구도가 움직임**(pointer 이벤트) · **모달의 위치 = 카드 배경의 위치** · cancel은 끌던 구도를 버림 · 모달 save만으로는 서버에 쓰지 않음 · 설정 save에서 `image_position_x/y`로 저장 |
| `preview` | 데스크톱/모바일 1200:628 유지 · 가로 넘침 0 · **오버레이(색+강도)와 폰트(폰트+제목 크기)가 390px에서도 한 줄** · 슬라이더가 문서 재생성 없이 즉시 반영 |
| `meta` | **실제 `_middleware.js` 응답** — summary_large_image · og:image 절대 URL · 1200×628 · 발췌 · twitter:player 없음 · og:title 한 번 · **`og:title` = 글 제목 / `twitter:title` = 블로그 제목만**(글 제목·slug·카테고리·`|` 없음) · 블로그 제목이 비면 `imory.me` · 비밀글/비공개 글의 제목·발췌·대표 이미지 없음 · 글이 아닌 주소는 무변경 |
| `image` | **실제 `api/og/post.js`** — 1200×628 PNG · 렌더러에 넘긴 HTML이 설정 화면과 같은 문서(색·글자색·제목 크기·frame) · **기본 사진의 `image_position_x/y`가 그대로 들어가고 설정 화면과 같은 함수에서 나옴** · 글 대표 이미지는 가운데 · 자동/사용자 지정 라벨 · **slug·카테고리 메타 줄 없음** · 빈 라벨은 그리지 않음 · **share_label_seq 컬럼이 없어도 카드가 그려짐** · 배경이 프록시 주소(버킷/서명 URL 아님) · 비밀글은 렌더 호출 0 · 설정 없음/렌더 실패 시 기본 카드 · 버전은 실제 변경 때만 달라짐 |
| `photo` | ★ **저장한 기본 사진이 실제 카드에 그려지는가** — 1×1 mock이 아니라 **진짜 사진**(1200 × 1256, 위 초록/아래 파랑)을 HTTP로 서빙하고, 넘어온 카드 HTML을 **진짜 브라우저로 그려서** 나온 PNG를 디코드해 **찍힌 픽셀**로 판정한다. 저장 전에는 `saved`로 표시하지 않음(저장 성공 뒤에만) · **새로고침 뒤 미리보기 배경이 저장된 그 주소 그대로**(blob:/data: 아니고, 실제로 1200×1256을 돌려주는 주소) · 서버가 **같은 사용자의 같은 `share_card` 행**을 읽음 · 대표 이미지 없는 글의 카드 배경이 그 사진(그라데이션 아님) · 헤드리스 브라우저가 그 주소를 실제로 받아 감 · `image_position_y`가 찍힌 픽셀을 바꿈 · **대표 이미지가 있으면 그쪽이 이김** · 사진이 하나도 없을 때만 그라데이션 · **일시적 렌더 실패(429)는 재시도해서 진짜 카드** · 계속 실패하면 이유를 헤더로 말하고 `no-store` · 4xx는 재시도 없음 · **실패한 주소의 다음 요청이 진짜 카드를 받음(영영 굳지 않음)** · 사진을 바꾸면 `og:image`의 `v`가 바뀌고 새 주소는 예전 캐시를 쓰지 않음 · 닿지 않는 사진 주소는 `missing-404`로 말하고 immutable로 굳히지 않음 |
| `cache` | 같은 `post + v` 재요청에 **Browser Rendering 호출 0** · `immutable` 응답 · HEAD도 캐시 사용(본문 없음) · **캐시가 권한 검사를 건너뛰지 않음**(비공개로 바꾸면 캐시된 카드가 나가지 않고 항목이 지워지며, 다시 공개로 바꾸면 같은 주소에서 즉시 실제 카드) · 기본 카드와 버전 없는 주소는 담지 않음 · `caches` 없는 런타임에서도 동작 |

`meta`/`image`/`cache` 절은 배포되는 그 파일(`functions/**`)을 node에서
그대로 import해서 돌린다. Supabase만 흉내 내고, Pages Function이 보는
PostgREST는 **anon이 볼 수 있는 것만** 돌려준다(공개 글의
post_contents/post_covers만, private 행은 주지 않는다).

node에는 Workers Cache API(`caches`)가 없으므로 `cache` 절이 Supabase ·
Browser Rendering과 같은 방식으로 최소 구현을 끼운다(`installCacheShim()`).
**실제 Cloudflare edge/Workers Cache 동작 자체는 실배포 확인 항목**이다 —
이 절이 증명하는 것은 "코드가 캐시를 언제 보고, 언제 담고, 언제 무시하는가"다.

### migration 검증 (PGlite)

`supabase/share-label-seq-migration-test.mjs`는 **실제 Postgres 엔진**에
`20260913180000_add_posts_share_label_seq.sql`을 그대로 실행한다(기존
folder/sort_order migration도 함께 올려서 **트리거 실행 순서**를 잰다).

| 절 | 확인 |
| --- | --- |
| `backfill` | 컨테이너별 `created_at` asc로 1·2·3 · 공개가 아닌 글은 없음 · 폴더는 자기 번호 공간 · 사용자별 독립 · **재실행해도 값 불변** |
| `assign` | 새 공개 글은 `max + 1` · 비공개로 쓰면 번호 없음 · **공개로 바꾸는 순간** 부여 · 클라이언트가 보낸 값 무시 |
| `frozen` | ★ **앞 글을 지워도 · 비공개로 돌려도 번호가 바뀌지 않는다** |
| `move` | 폴더/카테고리를 옮기면 그쪽 맨 끝을 새로 받는다(겹치지 않음) |
| `order` | `posts_sync_folder_and_sort_order_trg`가 먼저 돈다 |
| `grant` | anon/authenticated는 SELECT만 |

---

## 9. 남은 차이 · 확인이 필요한 것

1. **Browser Rendering 환경 변수 — 적용됨**(2026-09-13, 사용자가
   Pages에 입력). `CF_ACCOUNT_ID` / `CF_BROWSER_RENDERING_TOKEN`이
   없으면 카드는 글자 없는 기본 그라데이션으로 나간다. 환경 변수는
   **새 배포부터** 적용되므로, 넣은 뒤 한 번 더 배포해야 한다.

   저장소에서 검증한 것은 "요청 모양과 실패 시 동작"(mock)까지다 —
   Cloudflare가 실제로 돌려주는 PNG는 배포 뒤 눈으로 확인해야 한다.

1-1. **렌더러가 왜 가끔 실패하는지는 Cloudflare 쪽에서 봐야 한다**
   (2026-09-13 실측: 같은 공개 글을 새 버전으로 연달아 부르면 세 번에
   한 번쯤 실패, 실패는 1초 안에 돌아옴 → 타임아웃이 아니라 즉시 오류).
   저장소 코드가 할 수 있는 것은 다시 시도하고, 실패를 굳히지 않고,
   이유를 헤더에 적는 것까지다(§6-2). **어떤 상태 코드인지**는 배포
   뒤 이 한 줄로 확인한다:

   ```
   curl -sI "https://imory.me/api/og/post?post=<공개 글 id>&v=probe$(date +%s)" \
     | grep -i x-imory-share-card
   ```

   `fallback:render-429`면 Browser Rendering 한도다(Cloudflare 대시보드
   → Workers & Pages → Browser Rendering의 사용량/한도). `render-5xx`면
   그쪽 일시 장애다. 어느 쪽이든 재시도가 흡수하는 범위를 넘으면
   한도를 올리는 것이 답이고, 저장소에서 더 좁힐 수 없다.
2. **버킷 migration — 적용됨**(2026-09-13, 사용자가 Supabase SQL
   Editor에서 실행). `20260913170000_create_user_share_cards_bucket.sql`.
   버킷이 없으면 기본 카드 사진 업로드만 실패하고, 오버레이·폰트
   설정과 대표 이미지 배경은 그 전에도 동작한다.
2-1. **`share_label_seq` migration — 적용됨**(2026-09-13, 사용자가
   Supabase SQL Editor에서 실행).
   `20260913180000_add_posts_share_label_seq.sql`.

   저장소에서 검증한 것은 PGlite(실제 Postgres 엔진) 실행까지다 —
   **프로덕션 데이터의 backfill 결과**(기존 공개 글이 컨테이너별로
   1·2·3 …을 받았는가)는 실제 카드에서 눈으로 확인할 항목이다.

   적용 전에도 카드는 정상으로 나왔다(§4-3 "migration이 아직 없는
   배포"). 그 길은 컬럼이 없는 배포를 위해 그대로 남겨 둔다.

   ### 배포 확인 방법 (2026-09-13 기준)

   `_redirects`의 `/* /index.html 200` 때문에 **HTTP 200은 아무
   의미가 없다** — 없는 경로도 index.html을 200으로 돌려준다. 그래서
   `Content-Type`으로 판정한다:

   ```
   curl -sI https://imory.me/core/lib/share-card.js      -> text/javascript 여야 함
   curl -sI https://imory.me/images/share-card-default.png -> image/png 여야 함
   curl -sI "https://imory.me/api/og/post?post=<공개 글 id>" -> image/png 여야 함
   ```

   `text/html`이 나오면 그 파일이 아직 배포되지 않은 것이다(SPA
   fallback을 받고 있다). 이 확인은 `reference_imory_deploy_verification`
   과 같은 규칙이다.
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
7. **프레임(`border` · `polaroid` · `camera`)은 아직 없다.** 설정
   정규화 · 마크업(`data-frame`) · CSS 분기 자리만 만들어 뒀고
   (§4-4), 지금 그려지는 것은 `none`뿐이다. 화면에는 프레임을 고르는
   UI가 없다 — 값은 항상 `none`으로 저장된다.
8. **실제 X에서의 검은 링크 바 모양은 실기기 확인 항목이다.**
   저장소에서 보장하는 것은 `twitter:title`에 블로그 제목만 들어간다는
   것까지다(§6-1). X가 그 바를 어떻게 그리는지는 X의 UI다.
