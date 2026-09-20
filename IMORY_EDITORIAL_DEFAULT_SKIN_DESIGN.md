# IMORY EDITORIAL — 아이모리 기본 스킨 (EDITORIAL-DEFAULT-SKIN-2)

가입한 사람이 곧바로 글을 백업할 수 있고, 나중에 자기 사진 · 색 · 좌우 영역으로
꾸밀 수 있는 **공용 기본 스킨 뼈대**. 특정 작품 전용 스킨이 아니다.

이 문서는 "현재 구현" · "앞으로 지킬 원칙" · "남은 차이"(§14)를 나눠 적는다.
좌우 영역(1·2·3단 · 칼럼/패널)의 계약 자체는 [IMORY_SIDES_DESIGN.md](./IMORY_SIDES_DESIGN.md)
가 기준이고, 이 문서는 그 위에 얹은 것만 적는다.

| 무엇 | 어디 |
| --- | --- |
| 기본 스킨(HTML · CSS · 슬롯 · regions 를 만드는 함수) | [skin/skin-default-editorial.js](./skin/skin-default-editorial.js) `createImoryEditorialDefaultSkin` |
| Import 할 수 있는 JSON(같은 함수의 결과) | [skin/test-skins/build-imory-editorial-default-v2.mjs](./skin/test-skins/build-imory-editorial-default-v2.mjs) → `imory-editorial-default-v2.json` |
| 주인의 스킨 설정(색 네 역할 · HOME 사진 구성 · D-day) — 읽기/쓰기 · 저장 경계 · 렌더 런타임 | [skin/skin-settings.js](./skin/skin-settings.js) |
| 모바일에서 좌우 영역 끄기 | [skin/skin-sides.js](./skin/skin-sides.js) `readSkinSidesMobileSetting` / `writeSkinSidesMobileSetting` |
| 렌더 진입 | [skin/skin-template.js](./skin/skin-template.js) `resolveSkinTemplate`(`settings` 키) · [skin/skin-render.js](./skin/skin-render.js) `renderSkin`(색 규칙 · `settings.*` 바인딩 · `compileSkinPhotos`) |
| sandbox 봉투 | [skin/sandbox/skin-sandbox-protocol.js](./skin/sandbox/skin-sandbox-protocol.js) `isSandboxSkinSettings` · host `copySandboxSkinSettings` · frame |
| Studio 첫 스킨 | [skin/skin-initializer.js](./skin/skin-initializer.js) |
| Studio 설정 UI(Layout 패널 아래) | [studio/sides/home-settings-panel.js](./studio/sides/home-settings-panel.js) · `getStudioHomeSettings` / `setStudioHomeSetting`([studio/studio-preview.js](./studio/studio-preview.js)) |
| AI 지시문 | [functions/api/skin-ai.js](./functions/api/skin-ai.js) "Owner settings the skin reads" 절 |
| 단위 테스트 | `node skin/skin-settings-test.mjs` |
| 렌더 E2E | `node skin/skin-editorial-default-e2e-test.mjs` (8978) · [skin/skin-editorial-default-render-harness.html](./skin/skin-editorial-default-render-harness.html) |
| Studio E2E | `node studio/studio-editorial-default-e2e-test.mjs` (8980) |
| 네 화면 일치(Studio native/sandbox · 공개 native/sandbox) · 자르기 · Save/Export/Import/Publish | `node studio/studio-crop-priority-e2e-test.mjs --only=editorial` (8974 + 8975) |

---

## 1. 기존 구조 조사 (2026-09-20, `96798f4` 위)

| 물음 | 실제 |
| --- | --- |
| 기본 스킨이 선택 · 저장되는 곳 | "기본 스킨" 개념이 따로 없었다. 스킨이 하나도 없는 사람이 Studio 를 처음 열면 문답(skin-questionnaire, 3문항) → `generateInitialSkin(answers)`(skin/skin-generator.js, 결정적 생성기) → `create_skin_with_initial_version` RPC 로 **draft** 가 생긴다(skin/skin-initializer.js). 공개는 주인이 Publish 해야 한다. |
| 스킨이 없는 계정의 공개 HOME | `get_published_skin` 이 null → legacy HOME(profiles.home_mode='customize')로 조용히 폴백(skin/skin-home.js Case A). |
| theme token · 사용자 설정을 둘 곳 | 새 최상위 필드를 만들면 Import 후보 조립 · Export allowlist · AI 응답 조립 · sandbox 봉투를 전부 고쳐야 한다. **`regions`** 는 좌우 영역이 이미 "주인 설정" 자리로 쓰고 있고, 모든 경로가 그대로 통과시키며(AI 는 요청의 값을 돌려준다), 모르는 항목을 보존한다. |
| imageSlots 흐름 | `imageSlots[]` 선언 → Studio 슬롯 연결(`currentWorkingImageSlots`) → Context `images.<name>` → `data-imory-src`. 이미지 바꾸기 · 자르기(편집 id 에 붙는 CSS 규칙 + 공개 시 `@layer imory-crop-guard`)가 이 경로를 쓴다. |
| regions 흐름 | `resolveSkinTemplate` 가 `sides` 를 만들어 template 에 싣고 → `renderSkin` → `compileSkinSides`. sandbox 는 봉투 `template.sides`(정확한 모양만)로. |
| 데스크톱/모바일 분기 층 | 스킨 CSS 의 미디어 쿼리가 아니라 플랫폼 런타임(skin-sides.js)이 **폭**으로 칼럼/패널을 정하고 속성(`data-imory-sides-layout`)을 얹는다. |
| native 와 sandbox 가 함께 거치는 경로 | `resolveSkinTemplate()` 의 결과 한 장 → native `renderSkin` / sandbox 는 host 가 봉투로 옮겨 프레임 안의 같은 `renderSkin`. Studio Preview 도 같은 두 갈래. |
| 카테고리 · WRITE · ADMIN binding | `navigation.home/categories/highlights` · `viewer.isOwner/writeHref/adminHref/manageHref`(주인에게만 값) — skin/skin-context.js. |
| D-day · 방문자 위젯 | **둘 다 없었다.** 방문자 수는 `site-footer.js` 가 legacy 화면에 쓰는 `daily_visits` 인데 `user_id` 없이 날짜로만 세는 **플랫폼 전체** 값이라 블로그별 방문자 수가 아니다. |
| 신규 계정에 기본 스킨을 할당하는 흐름 | 위 "Studio 첫 스킨" 하나뿐. 가입(onboarding RPC)은 스킨을 만들지 않는다. |

## 2. `96798f4` 에 이미 있던 것 · 이번에 새로 만든 것

| `96798f4` 에 이미 있던 것(재사용 · 재설계하지 않음) | 이번에 새로 만든 것 |
| --- | --- |
| `regions` 의 `left_sidebar`/`right_sidebar` → 1·2·3단 | 같은 영역 항목의 `mobile` 칸(모바일에서 좌우 영역 끄기) |
| `data-imory-sides*` 틀 · 칼럼/패널 폭 판정 · 패널(포커스 가두기 · Escape · 바깥 · 뒤로가기 · 스크롤 잠금 · 위치 유지) | — (그대로 씀. 기본 스킨은 그 계약의 소비자다) |
| sandbox `IMORY_SIDES_*` 세 메시지 · 부모 스크롤 잠금 | 봉투 `template.sides.mobile`, `template.settings` |
| Studio Layout 패널(1·2·3단, Undo 한 칸) | 같은 패널 **아래**의 HOME 설정 넷(모바일 · HOME 사진 · 색 · D-day) |
| 잡지 표지형 예시 스킨 `imory-editorial-home-v1`(구조 검증용 — 그대로 둔다, e2e 가 그 파일을 잰다) | 실제 기본 스킨 `imory-editorial-default-v2` |
| — | 스킨 설정 계약: 색 네 역할(`--imory-color-*`) · HOME 사진 구성(`data-imory-photos*`) · D-day(`settings.dday.*`) |
| — | Studio 첫 스킨 = 기본 스킨 |

## 3. 결정

- **설정은 `regions` 의 이름 붙은 항목이다**(좌우 영역과 같은 자리 · 같은 규칙).
  새 최상위 필드가 없으므로 Import · Export · Save · Publish · AI 가 코드 수정
  없이 통과시킨다. 모르는 항목 · 칸 · 자리는 보존한다.
- **설정과 디자인을 나눈다.** 설정은 주인이(나중에는 문답이) 고르고, 스킨은
  속성 · custom property · 바인딩으로 읽기만 한다. 특정 스킨의 클래스나 이름에
  기대는 제품 코드는 없다 — 세 계약 모두 다른 스킨도 쓸 수 있는 공용 계약이다.
- 설정 항목이 하나도 없는 스킨(= 지금까지의 모든 스킨)은 렌더 재료에
  `settings` 키가 생기지 않는다. sandbox 봉투 · Preview 메시지가 byte 단위로
  그대로다(단위 `[template]`).

## 4. 계약

### 4-1. 저장 모양

```json
"regions": [
  { "name": "left_sidebar",  "enabled": true },
  { "name": "right_sidebar", "enabled": true, "mobile": false },
  { "name": "theme_colors",
    "colors": { "background": "#ffffff", "text": "#1b2340",
                "accent": "#1f3a78", "accent2": "#8796b0" } },
  { "name": "home_photos", "layout": "auto" },
  { "name": "dday", "date": "2024-09-21", "label": "since we met" }
]
```

| 항목 | 규칙 |
| --- | --- |
| 공통 | 같은 이름이 둘이면 앞의 것. 쓰기는 원래 배열을 바꾸지 않고, 그 이름의 첫 항목만 바꾸며, 다른 항목 · 칸 · 자리는 그대로 |
| `theme_colors.colors` | 네 역할 각각 `#rrggbb`(`#abc` 는 늘려 저장). 틀린 칸은 빠진다. `null` 을 쓰면 `colors` 칸을 지운다(다른 칸이 없으면 항목째) = 스킨 기본색 |
| `home_photos.layout` | `auto`(기본) · `empty` · `hero` · `pair` · `triptych`. 항목이 없으면 auto. 틀린 값은 auto |
| `dday` | `date` 는 실제 달력 날짜 `YYYY-MM-DD`(1900~2200). `label` 은 제어 문자 제거 · 40자. `enabled:false` 는 날짜 · 이름을 **남기고** 끈다 |
| `*_sidebar.mobile` | 정확히 `false` 일 때만 "모바일(패널)에서는 이 영역을 두지 않는다". 켜면 칸을 지운다(기본값을 적지 않는다). 두 영역에 같은 값을 쓴다 |

### 4-2. 색 네 역할

| 역할 | custom property | 기본값(밝게) | 어둡게(문답 dark) |
| --- | --- | --- | --- |
| 배경 | `--imory-color-background` | `#ffffff` | `#11141c` |
| 본문 | `--imory-color-text` | `#1b2340`(짙은 남색 · 순검정 아님) | `#e8ecf5` |
| 포인트 1 | `--imory-color-accent` | `#1f3a78`(짙은 남색) | `#b3c3ea` |
| 포인트 2 | `--imory-color-accent-2` | `#8796b0`(차가운 청회색) | `#5f6d88` |

- 렌더러가 스킨 `<style>` 맨 앞에 `.imory-skin-root-iN{--imory-color-…:#…}` 한 줄을
  붙인다(`buildSkinThemeColorsCss`). 설정이 없으면 한 글자도 붙지 않는다.
- 스킨은 **기본값과 함께** 읽는다: `var(--imory-color-text, #1b2340)`. Studio 는 그
  기본값을 CSS 에서 읽어(`readSkinThemeColorDefaults`) 처음 색으로 보여 준다.
- 옅은 선 · 흐린 글자 · 장식 · 그림자는 스킨이 네 색에서 `color-mix()` 로 만든다
  (기본 스킨: muted = 본문 74% · line = 포인트 2 72% · hair = 포인트 2 40% ·
  wash = 포인트 2 9%). 비슷한 색 옵션을 따로 두지 않는다.
- 대비 실측(렌더 E2E `[palette]`): 밝게/어둡게 모두 본문 ≥ 7 · 포인트 1 ≥ 4.5 ·
  흐린 글자 ≥ 4.5 · 선 ≥ 1.2. 주인이 고른 색은 Studio 가 본문/배경 대비 4.5 미만일
  때 경고한다(막지는 않는다).
- 원화 안의 금색은 사진이라 그대로지만, UI 선 · 별 · 글자에는 금색이 없다.
- `--imory-color`(접미사 없음)는 여전히 하이라이트 카드의 색(`data-imory-color`)이다.

### 4-3. HOME 사진 구성 — Empty · Hero · Pair · Triptych

```html
<section data-imory-photos="set">
  <figure data-imory-photos-item data-imory-if="images.photo_1">
    <img data-imory-src="images.photo_1" alt="">
  </figure>
  … photo_2 · photo_3 · photo_4 …
</section>
```

| 채운 사진 | auto | 직접 고른 값 |
| --- | --- | --- |
| 0 | empty | 무엇이든 empty |
| 1 | hero | hero 이상 → hero |
| 2 | pair | triptych → pair(채운 수까지만) |
| 3 | triptych | 그대로 |
| 4 이상 | triptych(앞의 세 장) | 그대로(세 장까지) |

- `empty` 를 고르면 사진이 있어도 글자 표지다.
- 판정은 `renderSkin` 이 walk(바인딩 · `data-imory-if`) **뒤**, 배치 primitive
  **앞**에서 한다(`compileSkinPhotos`). 채워졌는지는 `data-imory-if` 가 슬롯 값을
  보고 정한 `hidden` + 안의 `<img src>` 로 안다. 앞 슬롯이 비어 있으면 건너뛴다
  (2 · 4번만 → 두 장).
- 런타임(저장되지 않는다 — 표에 없어 sanitize 가 지운다):
  묶음 `data-imory-photos-layout` · `-count`(보이는 장 수) · `-filled`(채운 장 수),
  사진 `data-imory-photos-state="shown|rest|empty"` · `-position="1|2|3"`.
  넷째부터 · 고른 구성보다 많은 사진은 `rest` 로 접힌다 — **슬롯은 지우지 않는다**
  (Images 패널 · Export 에 그대로).
- 사진은 전부 이미지 슬롯이다. CSS 배경으로 숨기지 않는다 — 이미지 바꾸기 ·
  자르기 · 확대 · 위치 · Save · Export/Import 가 여느 슬롯과 같다
  (`--only=editorial` E3~E9 가 photo_2 를 잘라 네 화면에서 잰다).
- 기본 스킨의 모양:
  - **empty** — 사진 자리 대신 별 · "Begin the first page." · 별 달린 선 · 두 줄
    문구 · 아주 옅은 리본(큰 원 두 개의 가장자리). 깨진 이미지 · 회색 상자 없음.
  - **hero** — 세로(3:4) 한 장, 칼럼 폭의 74%, 양옆 작은 별, 아래 얇은 테두리
    상자 안 두 줄 문구.
  - **pair** — 가로(16:10) 두 장 위아래, 사이에 hairline 달린 문구.
  - **triptych** — 가운데(40%, 2:5)가 크고 양옆(29%)이 9% 내려와 받친다. 가운데가
    2% 겹치고 배경색 4px 테두리로 떨어진다. 각 사진 아래 번호 · 낱말(글자는 가운데
    사진에 가리지 않는다 — E2E 가 글자 자리를 잰다).
- **사진 묶음 폭 ≤ 카테고리 줄 폭**: 둘 다 `min(100%, var(--ied-measure))`(380px)
  칼럼 안이다. 320~1440px × 1·2·3단 × 0~3장 전부에서 잰다(`[width]`).

### 4-4. D-day

`settings.*` 는 Context 가 아니라 스킨 설정에서 오는 바인딩 이름공간이다
(`renderSkin` 이 그릴 때 만든다 — 오늘 날짜로 계산되기 때문).

| 경로 | 값 |
| --- | --- |
| `settings.dday` | 설정이 없거나 꺼졌으면 `null` → `data-imory-if="settings.dday"` 가 접는다 |
| `settings.dday.display` | 지난 날 `"730"`(당일 = 1일, 천 단위 쉼표) · 앞날 `"D-12"` |
| `settings.dday.label` | 주인이 적은 이름(비면 `""` → 접힌다) |
| `settings.dday.days` / `.until` / `.isFuture` / `.isToday` / `.date` | 계산 재료 |
| `settings.photos.layout` | 주인이 고른 구성(`auto` 포함) |

오늘은 한국 시간(Asia/Seoul) 기준이다(site-footer.js 의 방문자 집계와 같은 기준).
sandbox 프레임도 같은 함수로 계산한다. **가짜 값을 채우지 않는다.**

### 4-5. 모바일에서 좌우 영역

`mobile:false` 인 쪽은 **패널(좁은 화면)일 때만** 꺼진 영역과 같다 — 상태 `off` ·
`inert` · 여는 버튼 없음 · `data-imory-sides-on` 에서 빠진다(스킨의 "오른쪽이
없으면 본문에 최근 글" 규칙이 그대로 동작한다). 칼럼(넓은 화면)에는 영향이 없고,
칼럼/패널 판정의 폭 계산도 바꾸지 않았다.

봉투: `sides: { left, right, mobile?: { left, right } }` — 끈 쪽이 있을 때만 `mobile`.

### 4-6. 렌더 재료 · sandbox 봉투

```
template.settings = { colors?: {…}, photos?: "…", dday?: { date, label? } }
```

- `buildSkinSettingsRenderSetting(skinPackage)` 이 만든다. 꺼진 D-day 는 싣지 않는다.
- 프로토콜 `isSandboxSkinSettings` 는 정확히 이 모양만 받는다(빈 객체 · 모르는 키 ·
  `#rrggbb` 가 아닌 색 · 모르는 구성 · 날짜 모양 · 41자 이상 이름 → 메시지 거부).
  부모(host · Studio sandbox Preview)와 프레임은 `coerceSkinSettingsRenderSetting`
  으로 알려진 칸만 새 리터럴에 옮긴다.

## 5. 1·2·3단 · 데스크톱 칼럼 · 모바일 패널 (기본 스킨의 값)

계약과 동작은 [IMORY_SIDES_DESIGN.md](./IMORY_SIDES_DESIGN.md) 그대로이고, 기본
스킨은 폭만 정한다.

| 값 | 기본 스킨 |
| --- | --- |
| `--imory-sides-left-width` / `-right-width` | 204px / 228px |
| `--imory-sides-main-min` / `-main-max` | 440px / 620px |
| `--imory-sides-drawer-width` | `min(84vw, 320px)` |
| 칼럼이 되는 폭(틀 = 화면 − 좌우 여백 − 테두리, 하네스 실측) | 2단 707px 이상 · 3단 922px 이상 |

- 결과: 390px 은 1·2·3단 모두 패널 · 768px 은 2단 칼럼/3단 패널 · 1024px 이상은
  3단 칼럼(렌더 E2E `[width]`).
- ★ 이 변수들은 **틀 자신**(`.ied-home`)에 적는다. 플랫폼 기본값이
  `:where([data-imory-sides="frame"])` 로 틀에 붙어 있어서 조상에 적으면 그 기본값에
  가려진다(2026-09-20 실측 — 조상 `.ied` 에 적었더니 560/760/264 로 판정됐다).
- 칼럼일 때 종이(두 겹 테두리)는 **켜진 칸의 합만큼**만(`max-width` = 좌 + 본문 최대
  + 우) — 넓은 화면에서 가운데에 모인다. 패널일 때는 제한하지 않는다(좁혀 두면 폭
  판정이 칼럼으로 돌아오지 못한다).
- 칼럼 사이는 배경 없는 1px 세로 hairline(위아래 22px 띄움). 패널일 때만 배경과
  옆 그림자.
- 모바일 패널일 때 머리(쪽 번호 · 여는 버튼)가 위에 붙는다(sticky) — 내려 읽다가도
  스크롤 위치를 잃지 않고 좌우 영역을 연다.
- 좌우 영역 내용(기본 배치):
  - 왼쪽: Profile · 페어 사진 슬롯 `pair_photo`(3:5) · 소개(`profile.bio`) · 세 낱말 ·
    한 줄 문구.
  - 오른쪽: Categories(Home + 실제 카테고리 + 하이라이트) · D-day(설정이 있을
    때만) · Latest(최근 글이 있을 때만) · 하이라이트 카드(있을 때만) · 한 줄 문구.
  - 위젯이 없으면 그 블록째 접힌다(빈 카드 · 빈 이름표 없음). 1단이거나 모바일에서
    오른쪽을 끈 경우 최근 글은 가운데로 온다.

## 6. 실제 Imory 연결

| 시안 | binding |
| --- | --- |
| 제목 | `site.title` — 두 줄이 되면 둘째 줄부터 기울임(`::first-line` 만 바로 선다) · `text-wrap: balance` · 24~34px |
| 페어명 / 소개 | `profile.bio`(제목 아래 · 왼쪽 영역). 비면 접힌다 |
| HOME · TXT · IMG · HIGHLIGHT | `navigation.home` + `navigation.categories[]` + `navigation.highlights`(따로 링크가 필요할 때만) — 알약 없는 글자 링크, HOME 에 밑줄 · `aria-current` |
| 최근 글 | `home.recentPosts[]` |
| WRITE · ADMIN | `viewer.writeHref` · `viewer.adminHref` — `data-imory-if="viewer.isOwner"` 안. 방문자 DOM 에는 링크가 없다 |
| D-day | `settings.dday.*`(§4-4) |
| 방문자 수 | **없음** — 블로그별 데이터가 없다(§1). 가짜 숫자를 그리지 않는다(§14) |
| 대표 이미지 | `images.photo_1`~`photo_4` · `images.pair_photo` |
| CATEGORY | 목록(`category.posts`) · 갤러리(`category.gallery.cards`) · 폴더(`category.tree`) · 페이지(`category.pagination`) · Write/Edit(`viewer.manageHref`) |
| POST | 제목 · 날짜 · `data-imory-region="post-body"`(본문 · 비밀글 native 폴백은 플랫폼 몫 그대로) |

시안의 개별 문구는 박지 않았다. 사진 캡션 · 빈 표지 문구 · 좌우 영역의 짧은 문구는
스킨 글자라 Studio 에서 두 번 눌러 고친다(단위 테스트가 `FOREVER` · `JIWON` ·
`SUYOUNG` · `old enemy` 가 없음을 확인한다).

## 7. Studio — HOME 설정

Layout 버튼 → 왼쪽 패널(좁은 화면은 시트). 위는 기존 1·2·3단, 아래에 넷.

| 칸 | 동작 |
| --- | --- |
| 모바일 | "좌우 영역을 모바일에서도 버튼으로 열기" 체크. 1단이면 "2단 · 3단을 고르면 적용" 안내 |
| HOME 사진 | 자동 · 사진 없이 · 한 장 · 두 장 · 세 장(radiogroup · 방향키). 아래 "채운 사진 N장 · 지금 보이는 모양: …". 사진은 Images 에서 넣는다 |
| 색 | 배경 · 글자 · 포인트 1 · 포인트 2(네이티브 색 고르기 · 창을 닫을 때 한 번 적용) · 대비 경고 · "스킨 기본색으로" |
| D-day | 보이기 · 날짜(고르면 저절로 켜진다) · 이름(40자) |

- 값 하나를 확정할 때마다 Undo 한 칸 · dirty · Preview 다시 그리기. 같은 값은 기록 0.
- 스킨이 그 설정을 읽지 않으면(사진 묶음 · 색 변수 · D-day 자리 · 좌우 틀이 없으면)
  그 칸이 잠기고 이유가 나온다. 개발자 낱말이 없다.
- Inspector 이름: "HOME 사진 구성" · "D-day 날 수" · "D-day 이름".
- 수동 사진 구성 선택은 이번에 넣었다(후속으로 미루지 않았다).

## 8. 신규 계정 적용 범위

- **Studio 첫 스킨 = 기본 스킨.** 스킨이 하나도 없는 사람이 Studio 를 처음 열어
  문답을 마치면 `createImoryEditorialDefaultSkin(imoryEditorialOptionsFromAnswers(answers))`
  가 draft 가 된다(예전 생성기 `generateInitialSkin` 은 그대로 남아 폴백이다).
  - 1단/2단/3단 → `columns` · light/dark → `appearance`(dark 면 어두운 네 색을 적는다).
  - `homeStyle`(INTRO/INDEX/PROFILE)은 이 스킨이 읽지 않는다 — 다음 단계 문답이 대신한다.
- **기존 사용자의 스킨은 바뀌지 않는다.** 이 경로는 `skins` 행이 없는 사람에게만
  열린다(studio-state.js "first-time").
- 스킨이 없는(Studio 를 연 적 없는) 계정의 **공개 HOME 은 legacy 그대로**다. 공개
  폴백을 기본 스킨으로 바꾸면 Studio 를 안 쓰는 기존 사용자의 HOME 까지 바뀌므로
  이번 범위에서 하지 않았다(§14).

## 9. 다음 단계 — 가입 문답이 바꿀 자리

문답은 **regions 한 배열**만 쓰면 된다. 함수는 전부 skin/skin-settings.js ·
skin/skin-sides.js 에 있다.

| 문답 | 값 | 쓰는 함수 |
| --- | --- | --- |
| 밝은 ↔ 어두운 분위기 | 배경 · 본문 · 포인트 1 · 포인트 2(`IMORY_EDITORIAL_PALETTES` 또는 고른 네 색) | `writeSkinThemeColors(regions, colors)` |
| 단정함 ↔ 풍부함 | 1 · 2 · 3단 | `writeSkinSidesSetting(regions, skinSidesSettingForCount(n))` |
| 사진 중심 ↔ 기록 중심 | 사진 구성(auto · empty …) · 모바일 패널 | `writeSkinHomePhotosLayout` · `writeSkinSidesMobileSetting` |
| 차분함 ↔ 움직임 | motion preset | 아직 설정 칸이 없다 — 사진 묶음의 등장(TRANSITION-1 `fade-slide` 420ms)과 패널 속도(`--imory-sides-duration`)가 스킨에 있다. 설정으로 뺄 때 같은 `regions` 에 `{ "name": "motion", "preset": "calm" }` 같은 항목을 더하면 저장 모양이 바뀌지 않는다 |
| 기념일 | 날짜 · 이름 | `writeSkinDday(regions, { enabled, date, label })` |

## 10. 모션

- 사진 묶음 등장: TRANSITION-1 `fade-slide` · 420ms · smooth · up(공개 화면에서 HOME
  으로 돌아올 때 · Studio 편집 재렌더에서는 재생하지 않는다 — 그 primitive 의 규칙).
- 링크 밑줄 · 글자색 전환 0.2~0.25s. 사진 hover 3px 위로 — `@media (hover: hover)` 안
  (손끝 기기 전제 없음).
- 패널 slide 는 플랫폼(320ms).
- `prefers-reduced-motion: reduce` 에서 위 전부 0(렌더 E2E `[reduced]`).
- 인트로 영상 · 전체 화면 대문 전환은 없다.

## 11. 반응형 · 스크롤

- 확인 폭 320 · 390 · 768 · 1024 · 1280 · 1440 — 가로 넘침 0 · 제목 ≤ 34px · 사진 ≤
  카테고리 줄 폭 · 긴 제목/긴 카테고리에서 글자가 상자를 넘지 않는다.
- 내용이 적으면 종이가 한 화면(`min-height: clamp(520px, 100vh − 여백, 1400px)`),
  많거나 화면이 낮으면 그냥 스크롤한다. 글 · 기능을 숨기거나 줄이지 않는다.
- `vh` 는 전부 px 상한이 있는 `clamp()` 안이다(sandbox 프레임에서 vh = 프레임 높이 —
  상한이 없으면 서로를 키운다. 단위 테스트가 줄마다 확인).
- 스킨 자체 스크롤은 없다(공개 HOME 은 `#themeMount`, Studio Preview 는 문서가
  스크롤한다 — 기존 계약 그대로).
- CSS 초기화는 `.ied :where(p, …)` — 한 클래스짜리 규칙(여백 · 링크 색)이 초기화에
  지지 않게(2026-09-20 실측: `.ied p` 로 두었더니 머리의 "HOME" 이 오른쪽으로 가지
  않았다).

## 12. 시안과 실제 구현의 차이

| 시안 | 구현 | 이유 |
| --- | --- | --- |
| "FOREVER, / MY FOE" 두 줄 | 블로그 제목 그대로, 두 줄이 되면 둘째 줄부터 기울임 | 제목을 쪼갤 바인딩이 없다. `::first-line` + `text-wrap: balance` 로 같은 효과 |
| 사진 캡션(영원은, 오래된 적의…) · RIVAL/SECRET/ALWAYS | 중립 기본 문구(고칠 수 있는 스킨 글자) | 작품 문구를 박지 않는다 |
| VISITORS 24,917 | 없음 | 블로그별 방문자 데이터가 없다. 가짜 숫자 금지 |
| Didot 계열 글꼴 | 시스템 serif 스택(Didot · Bodoni 72 … Times New Roman) | 스킨 CSS 는 외부 글꼴을 들일 수 없다(`@import`/외부 url 차단) |
| 리본 장식 | 큰 원 두 개의 옅은 가장자리 | SVG · 배경 이미지를 쓰지 않는 CSS 도형 |
| 3단 왼쪽 영역 위 "PROFILE" 사진 | 이미지 슬롯 `pair_photo`(비면 접힌다) | 사진은 전부 슬롯 |

## 13. 테스트 기록 (2026-09-20)

| 무엇 | 결과 |
| --- | --- |
| `node skin/skin-settings-test.mjs` | 81/81 |
| `skin/skin-editorial-default-e2e-test.mjs` chromium / webkit | 184/184 · 184/184 |
| `studio/studio-editorial-default-e2e-test.mjs` chromium / webkit | 52/52 · 52/52 |
| `studio/studio-crop-priority-e2e-test.mjs --only=editorial` chromium / webkit | 12/12 · 12/12(webkit 첫 회 1건 — 프레임 폭이 자리 잡기 전에 읽은 것. 읽기를 "두 번 같을 때까지"로 고친 뒤 반복 통과) |

회귀는 [docs/TESTS.md](./docs/TESTS.md) 표의 각 행과 커밋 메시지를 본다.

## 14. 남은 차이

- **방문자 수 위젯** — 블로그별 집계가 없다(`daily_visits` 는 플랫폼 전체 · 날짜만).
  만들려면 `(user_id, visit_date)` 테이블 + 세는 RPC(봇 · 새로고침 중복 방지) +
  Context 값이 필요하다. 이번에는 자리도 그리지 않았다.
- **스킨이 없는 계정의 공개 HOME** — legacy 그대로(§8). 기본 스킨이 보이려면 주인이
  Studio 를 한 번 열어 첫 스킨을 만들고 Publish 해야 한다. 가입 때 draft/published 를
  만드는 것은 onboarding RPC 변경(migration)이 필요하다.
- **좌우 영역 내용의 순서 · 위치 편집 UI** — 없다(IMORY_SIDES_DESIGN.md §12 와 같은
  상태). 기본 배치는 스킨 HTML 이고, 순서는 Code/AI 로 바꾼다. 기존 Dock · region
  편집 기능은 좌우 영역 안의 블록을 다루지 않는다.
- **motion preset 설정** — §9 의 자리만 있다.
- **sandbox 프레임 안의 sticky 머리** — 프레임 문서는 스크롤하지 않아 효과가 없다
  (IMORY_SIDES_DESIGN.md §14 와 같은 한계).
- **iOS Safari 실기기** — Playwright WebKit 으로만 보았다.
- **실제 원화로의 수동 확인** — 사용자가 원화를 보내지 않아 하지 않았다. 테스트는
  실행 때 만드는 색 SVG · PNG 로만 했고 원화는 저장소 · 프로덕션 어디에도 없다.

---

# EDITORIAL-CUSTOMIZATION-1 — 기본 스킨을 사용자가 직접 고치는 길 (2026-09-20)

`45a576b` 을 실제 계정에서 써 보고 나온 네 가지. **디자인을 바꾸는
라운드가 아니라, 지금 디자인을 주인이 손으로 조절할 수 있게 하는
라운드**다.

## 15. Layout 패널의 세로 스크롤

왼쪽 패널의 내용(1·2·3단 + HOME 설정 다섯)이 화면보다 길어지면 아래쪽
설정(색 · D-day)에 손이 닿지 않았다. 원인은 한 줄이다 —
`.studio-left-panel-section[data-left-panel-mode="select"]` 만
`overflow-y: auto` 를 갖고 있었고, `layout` 모드에는 그 규칙이 없었다.
Images/Dock 은 안쪽에 자기 스크롤 상자를 따로 갖고 있어서 문제가 없었다.

고친 것: Select 와 Layout 이 같은 규칙 한 벌을 쓴다
(`studio/studio-shell.css`). 스크롤하는 것은 그 section 하나뿐이라
Studio 문서도 Preview 도 함께 밀리지 않고(측정: `docScrollTop` ·
프레임 `scrollY` 가 0), 스크롤바를 숨기지 않는다. 좁은 화면에서는
MOBILE-SHEET-1 의 세 단계가 그대로다 — 단계가 상자 높이를 정하고
안쪽이 스크롤한다. 키보드가 열리면 `--studio-sheet-keyboard` 가 시트
아래 끝을 올리고, 그 안에서 마지막 설정까지 닿는다.

## 16. "사진 영역 너비" — 자리의 폭과 사진의 확대를 가른다

### 무엇이 잘못돼 있었나

스킨은 사진 자리를 흔히 이렇게 그린다.

```css
.ied-photo       { width: 74%; }          /* 폭을 정하는 상자 */
.ied-photo-frame { display: block; aspect-ratio: 3 / 4; }
.ied-photo-img   { width: 100%; height: 100%; }
```

이 상태에서 Inspector 의 `너비(px)` 는 **사진 자신**에 규칙을 썼다.
확정 규칙에는 늘 `max-width: 100%` 가 함께 들어가고 그 100% 는 부모
상자의 폭이므로, 숫자만 커지고 화면은 그대로였다. 안내 문구까지
"230px 이면 꽉 차요" 라고 그 사실을 설명하고 있었다 — 사용자가 "무효"
라고 느낀 자리다.

### 어떻게 갈랐나

| 이름 | 무엇을 바꾸나 | 대상 |
| --- | --- | --- |
| **사진 영역 너비** | 사진이 놓이는 자리(바깥 여백 · 테두리 포함)의 폭 | 폭을 정하는 **바깥 상자** |
| **자르기 · 확대** | 그 자리 안에서 사진을 얼마나 크게 볼지 · 구도 | 사진(기존 crop 그대로) |

같은 일을 하는 칸이 둘이 되지 않게, 폼에는 **한 벌만** 나온다. 바깥
상자가 있으면 이름이 "사진 영역 너비" 이고, 없으면(로고처럼 제 크기를
가진 사진) 예전 그대로 "너비" 다.

### 어느 상자가 주인인가 (짐작하지 않고 잰다)

`studio/preview/preview-bridge.js` `inspectorSizeOwnerOf()` 가 iframe
안에서 사진부터 위로 올라가며 "제 부모를 가로로 가득 채우는가" 를
묻는다. 가득 채우고 있으면 그 폭은 제 것이 아니므로 한 칸 더 올라가고,
더 이상 가득 채우지 않는 첫 요소가 주인이다. 멈추는 자리:

- 사진이 둘 이상 든 상자(사진 묶음 전체다)
- `data-imory-region`(플랫폼이 채우는 자리)
- 식별자가 없는 요소 · 스킨 루트 · 네 칸을 넘는 깊이
- **제 폭도 없으면서 사진 말고 다른 글자도 담은 칸** — 좁히면 사진이
  아니라 구역 전체가 좁아진다. 사진의 캡션은 여기 걸리지 않는다:
  캡션을 가진 칸은 대개 제 폭(`74%` 등)을 갖고 있어 앞 조건에서 이미
  주인으로 뽑힌다.

자른 사진에는 쓰지 않는다 — 그때 폭의 주인은 자르기 프레임이고, 그
판정은 `inspectorFrameElementOf()` 가 이미 한다.

### 왜 여기만 `!important` 인가

사진의 자리를 정하는 스킨 규칙은 특정도가 높다
(`.ied-photos[data-imory-photos-layout="hero"] .ied-photo` = 0,3,0).
직접 수정 규칙의 선택자는 0,2,0 이라 그대로는 또 "숫자만 바뀐다" 가
된다. 자르기가 같은 문제를 `!important` 로 푼 것과 같은 판단이다
(IMORY_IMAGE_CROP_PRIORITY_DESIGN.md) — **사용자가 손으로 정한 크기는
스킨의 기본값을 이긴다.** `max-width: 100%` 에도 함께 붙여 "그래서
넘친다" 가 생기지 않게 한다. AI 와 Code 는 이 규칙 자체를 지우거나
고칠 수 있으므로 막다른 길이 아니다.

### 조작 넷이 한 값이다

슬라이더 · 숫자칸 · **좌우 손잡이**(`w` · `e`, 사진 영역일 때만 나오는
세로 알약) · 모서리 손잡이가 전부
`previewStudioInspectorSize()` / `commitStudioInspectorSize()` 두 함수를
지난다. 좌우 손잡이는 가로 한 축만 바꾼다(세로 흔들림이 폭을 흔들지
않는다). 드래그 한 번 = Undo 한 칸.

- `기본` — 스킨이 정한 폭으로 되돌린다(규칙을 지운다).
- `콘텐츠 폭에 맞추기` — px 가 아니라 `width: 100%` 다. 모바일과
  데스크톱에 같은 px 를 못 박지 않는다.
- 슬라이더 상한 = 그 자리를 담고 있는 칸의 안쪽 폭(= HOME 가운데
  칼럼). 그보다 큰 값은 `max-width: 100%` 에 눌려 같은 그림이다.

## 17. 카테고리 줄의 글자 크기

`kind === "container"` 도 `typography` 를 갖는다 — 영역의 `글자색` 과
같은 결이다(안에 든 글자 전체에 걸린다). 폼은 **숫자 + 슬라이더 한 줄**
(`numberRange`)이고, 슬라이더를 끄는 동안은 저장 없이 Preview 에만
비친다(선언 임시 반영 — 통과하는 속성 이름은
`studio/studio-preview.js` 의 `INSPECTOR_PREVIEW_STYLE_PROPERTIES`
목록뿐이다).

기본 스킨은 그 값을 **줄 하나**가 받도록 바꿨다 —
`.ied-nav-list { font-size: 11.5px }` · `.ied-nav-link { font-size: 1em }`.
그래서 줄을 골라 크기를 바꾸면 HOME · TXT · IMG · BANNER · HIGHLIGHT 가
함께 커지고 줄어든다. 줄은 `flex-wrap: wrap` 이라 커지면 접히고 가로
스크롤이 생기지 않는다(320 · 390 · 1280px 에서 넘침 0 을 잰다).

**범위** — 직접 편집은 언제나 그 페이지의 template 하나에 쓴다. HOME
에서 고친 크기는 HOME 의 줄에만 적용되고, CATEGORY · POST 의 같은 줄은
그 화면에서 따로 고른다(세 template 모두 같은 구조라 같은 컨트롤이
그대로 나온다).

## 18. HOME 제목 로고

새 이미지 슬롯 **`title_logo`** 하나다. 모드를 따로 저장하지 않는다 —
**슬롯이 비면 글자 제목, 채우면 로고**다. 그래서 "이미지 모드인데
이미지가 없어 깨진 아이콘이 뜬다" 가 생길 수 없고, 로고를 지우면 글자
제목이 곧바로 돌아온다. 저장 구조도 늘지 않는다(여느 이미지 슬롯과
똑같이 `skin_image_slot_values`).

```html
<h1 class="ied-title ied-title--logo" data-imory-if="images.title_logo">
  <img class="ied-logo-img" data-imory-src="images.title_logo" alt="">
  <span class="ied-sr" data-imory-bind="site.title"></span>
</h1>
<h1 class="ied-title ied-title--text" data-imory-bind="site.title"></h1>
```

```css
.ied-title--logo:not([hidden]) ~ .ied-title--text { display: none; }
.ied-logo-img { width: auto; height: auto; max-width: min(100%, 320px); object-fit: contain; }
```

- `:has()` 를 쓰지 않는다 — 형제 선택자면 충분하다.
- 읽어 주는 이름은 **실제 블로그 제목**이다(`.ied-sr` 가 화면에서만
  숨는다). `data-imory-alt` 같은 새 바인딩을 만들지 않았다.
- 투명 PNG 의 배경을 그대로 둔다 — 강제 자르기도 `cover` 도 없다.
- 폭은 제 것(`width: auto`)이라 Inspector 의 `너비(px)` 가 로고에 바로
  걸린다(높이는 비율대로). 좁아지면 `max-width` 가 받는다.

**찾아가는 길** — Layout 패널의 HOME 설정에 `HOME 제목` 칸이 생겼다.
지금이 글자인지 로고인지 말해 주고, `로고 고르기` 가 Images 를
`HOME 제목 로고` 슬롯을 고른 채로 연다. `로고 지우기` 는 슬롯을 비운다
(= 글자 제목으로 복귀, Undo 한 칸).

## 19. 저장 구조 (새 최상위 필드 없음)

| 무엇 | 어디에 |
| --- | --- |
| 사진 영역 너비 · 카테고리 글자 크기 | 직접 편집 CSS 규칙(`[data-imory-edit-id="X"][data-imory-edit-id="X"]`) |
| 로고 이미지 | 이미지 슬롯 `title_logo` |
| 색 · 사진 구성 · D-day · 모바일 | `regions`(EDITORIAL-DEFAULT-SKIN-2 그대로) |

Studio 전용 임시 CSS 는 없다. 공개 화면은 같은 SkinPackage 를 같은
`renderSkin()` 에 넣어 같은 결과를 그린다 — 이 라운드는 공개 렌더를 한
줄도 바꾸지 않았고, 그 사실을 실제 렌더로 잰다
(`studio/studio-editorial-customization-e2e-test.mjs` `[public]`).

기존 스킨에는 아무 것도 끼워 넣지 않는다. 슬롯 · 줄 글자 크기 구조는
기본 스킨의 HTML/CSS 안에만 있고, 공통 Inspector 의 프레임 너비 판정은
"사진이 제 폭을 갖고 있으면 지금까지와 똑같다" 로 시작한다.

## 20. 테스트 기록 (2026-09-20)

| 무엇 | 결과 |
| --- | --- |
| `studio/studio-editorial-customization-e2e-test.mjs` chromium / webkit | 80/80 · 80/80 |
| `node skin/skin-settings-test.mjs` | 83/83 |
| `skin/skin-editorial-default-e2e-test.mjs` chromium / webkit | 184/184 · 184/184 |
| `studio/studio-editorial-default-e2e-test.mjs` chromium / webkit | 52/52 · 52/52 |
| `studio/studio-crop-priority-e2e-test.mjs`(전체) | 52/52 |
| `studio/studio-direct-edit-e2e-test.mjs` | 37/37 |
| `studio/studio-crop-e2e-test.mjs` | 104/104 |
| `studio/studio-direct-ux-e2e-test.mjs` | 58/58 |
| `studio/studio-shell-e2e-test.mjs` chromium / webkit | 61/61 · 61/61 |
| `studio/studio-mobile-sheet-e2e-test.mjs` chromium / webkit | 48/48 · 48/48 |
| `studio/studio-sides-e2e-test.mjs` chromium / webkit | 40/40 · 40/40 |
| `studio/studio-sandbox-select-parity-e2e-test.mjs` | 71/71 |
| `studio/studio-sandbox-preview-e2e-test.mjs` | 181/181(첫 회 1건 flaky — 재실행 통과) |
| `studio/studio-selected-ai-e2e-test.mjs` | 109/109 |
| `studio/studio-import-css-image-e2e-test.mjs` | 55/55 |
| `studio/studio-file-ux-e2e-test.mjs` | 42/42 |
| `studio/images/skin-image-library-e2e-test.mjs` | 95/95 |
| `studio/dock/studio-dock-panel-e2e-test.mjs` | 88/88 |
| `studio/studio-layout-e2e-test.mjs` · `studio-transition-e2e-test.mjs` | 50/50 · 32/32 |
| `studio/studio-ai-panel-e2e-test.mjs` | 142/142 |
| `studio/studio-highlight-preview-e2e-test.mjs` | 21/21 |
| `node skin/skin-layout-test.mjs` · `skin-transition-test.mjs` · `skin-sides-test.mjs` · `skin/sandbox/skin-sandbox-unit-test.mjs` | 55 · 231 · 55 · 278 |

**원래부터 실패하던 것**(이 라운드 전 `45a576b` 에서도 같다 — worktree
로 대조):

- `studio/studio-inspector-e2e-test.mjs` `route` 절이 timeout 으로 멈춘다
  (Preview 의 CATEGORY 이동). 그 절을 뺀 나머지 절은 전부 통과한다.
- `studio/studio-ai-panel-layout-e2e-test.mjs` 87/90.

## 21. 남은 차이 (EDITORIAL-CUSTOMIZATION-1)

- **sandbox 프레임 안에서는 사진 영역 너비도 잠긴다.** 크기 · 자르기와
  같은 이유다(IMORY_SANDBOX_SKIN_DESIGN.md §S — 프레임은 실측값을
  올려보내지 않는다). 공개/Studio 의 **렌더 결과**는 같고, 잠기는 것은
  프레임 안에서의 편집뿐이다.
- **카테고리 줄 글자 크기의 범위는 template 하나다**(§17). "세 화면에
  한 번에" 는 새 계약(스킨 설정 또는 공용 토큰)이 필요하다.
- **다른 스킨의 높은 특정도** — 사진 영역 너비는 `!important` 로
  이기지만, 카테고리 글자 크기(`font-size`)는 보통 규칙이라 스킨이 더
  높은 특정도로 자식에 크기를 못 박아 두면 이기지 못한다. 기본 스킨은
  그래서 링크를 `1em` 으로 둔다.
- **실기기(iOS Safari)** — Playwright WebKit 으로만 보았다.
- **실제 원화 · 실제 로고 PNG** — 테스트는 실행 때 만드는 색 SVG 를
  쓴다. 사용자가 올릴 투명 PNG 로의 확인은 배포 뒤 주인이 한다.

---

## 22. 이미 만들어진 스킨 올려 주기 (EDITORIAL-EXISTING-UPGRADE-1)

**무엇이 문제였나.** §17(카테고리 줄 글자 크기)과 §18(HOME 제목 로고)이 더한
것은 Studio 의 코드가 아니라 **그 스킨의 구조**에 들어 있다 — `.ied-nav-list`
가 크기를 갖고 `.ied-nav-link` 가 `1em` 으로 물려받는 CSS, 그리고 `title_logo`
이미지 슬롯과 제목 자리의 로고/글자 두 갈래. 그래서 37dee90 **뒤에 새로 만든**
스킨에만 기능이 있고, 그 전에 만들어 둔 스킨에서는 Layout 패널의 그 칸이 잠긴
채로 남는다. 전체 JSON 을 다시 Import 하면 사진 · 색 · D-day · 단 구성 ·
직접 편집이 전부 날아간다.

**현재 구현.** Studio 의 HOME 설정 맨 위에 "스킨 업데이트" 한 칸이 선다.
채울 것이 없으면 **칸 자체가 없다** — 평소에는 보이지 않는다.

**판정(임의의 사용자 스킨에는 절대 적용하지 않는다).** 네 가지가 모두 맞을
때만 아이모리 기본 스킨으로 본다 — `metadata.generatedBy` 가
`imory-editorial-default-v2` · HOME html 에 표식 넷
(`ied ied-page--home` · `ied-sheet ied-home` · `ied-mast` · `ied-nav-list`) ·
CSS 에 `--ied-bg: var(--imory-color-background` · `.ied-nav-list` 와
`.ied-nav-link` 규칙. 하나라도 어긋나면 "여기서 올려 줄 수 없어요"로 끝난다.

**무엇을 넣을지는 짓지 않는다.** `createImoryEditorialDefaultSkin()` 이 만든
**오늘의 기본 스킨**에서 그 조각(로고 마크업 · 로고 CSS 절 · `title_logo`
슬롯)을 떼어 쓴다. 같은 문자열을 두 곳에 적어 두면 한쪽만 고쳐지는 날이 온다.

**화면은 한 픽셀도 바뀌지 않는다.** 카테고리 줄 단계는 링크에 있던 크기를
**그대로 줄로 옮기고** 링크를 `1em` 으로 바꾼다(계산된 크기가 같다). 로고
단계는 슬롯이 비어 있는 동안 지금까지와 똑같이 글자 제목을 보여 준다.

**무엇을 건드리지 않는가.** `templates` 를 갈아끼우지 않는다 — HOME 의 `html`
한 칸과 `css` · `imageSlots` 만 바뀌고 `category` · `post` · `regions`(사진 ·
색 · D-day · 단 구성) · `metadata` · `renderMode` · `js` 는 들어온 그대로
나간다. 원래 `<h1>` 의 속성은 직접 편집 식별자까지 한 글자도 안 바뀐다.

**되돌리기 · 두 번 누르기.** 적용은 Studio 의 Import 와 **같은 한 걸음**이다
(`applyImportedSkinPackage`) — 기록 한 칸 · dirty · Preview 다시 그리기 ·
슬롯 정리가 이미 있는 길을 그대로 타고, 상단 ↶ 한 번이면 손대기 전으로
돌아온다. DB 에는 손대지 않는다(실제 기록은 Save 가 할 때뿐이다). 각 단계는
"이미 있는가"를 먼저 물으므로 한 번 넣으면 칸이 사라진다.

**반쯤 고친 스킨을 만들지 않는다.** 넣을 조각이 없거나 제목 자리를 못 찾으면
그 단계는 없는 것으로 두고, 이유를 사람 말로 돌려준다.

**파일.** `skin/skin-editorial-upgrade.js`(`describeImoryEditorialUpgrade` —
순수 함수) · `studio/studio-preview.js`(`getStudioEditorialUpgrade` /
`applyStudioEditorialUpgrade`) · `studio/sides/home-settings-panel.js`(칸).

**테스트.** `node skin/skin-editorial-upgrade-test.mjs` — fixture 를 지어내지
않고 **45a576b(EDITORIAL-CUSTOMIZATION-1 직전 커밋)의 생성기를 git 에서 꺼내**
그때의 스킨을 만들어 돌린다(판정 · 두 단계 · 넣은 결과 · 주인의 설정과 직접
편집 보존 · 두 번 해도 같음).
