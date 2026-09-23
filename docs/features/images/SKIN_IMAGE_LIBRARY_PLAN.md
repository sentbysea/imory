> **STUDIO-LAYERS-MEDIA-1(2026-09-23) 에서 바뀐 것** — 이 문서의 "사용
> 중인 이미지는 지울 수 없다"는 더 이상 현행이 아니다. 사용처를 보여 주고
> 확인받은 뒤 **사용처에서 떼고 지운다**(새 RPC
> `delete_skin_image_everywhere` ·
> [supabase/migrations/20260923100000_delete_skin_image_everywhere.sql](../../../supabase/migrations/20260923100000_delete_skin_image_everywhere.sql)
> — **2026-09-23 프로덕션 적용 완료**, 그 파일은 이후 고치지 않는다.
> 뒤이은 **직접 참조 guard** 는 같은 함수를 `create or replace` 로 바꾸는
> follow-up 한 장이다:
> [20260923120000_guard_skin_image_css_references.sql](../../../supabase/migrations/20260923120000_guard_skin_image_css_references.sql) — **미적용**).
> 화면 쪽 변화(상단 Images 버튼 제거 · "자리 하나" 화면)는
> [IMORY_STUDIO_SHELL_DESIGN.md §2-3](../studio/IMORY_STUDIO_SHELL_DESIGN.md) 에 있다.
> 자세한 내용은 이 문서 맨 끝의 **"사용 중인 이미지 삭제(STUDIO-LAYERS-MEDIA-1)"**.

# Skin Image Library v0.1 — 설계 및 구현 계획

작성일: 2026-09-07
상태: v0.1 구현 완료(프런트 + migration 파일). **운영 Supabase 미적용.**

이 문서는 코드를 읽고 확인한 현재 구조와, 그 위에서 실제로 구현한
최소 데이터 모델/흐름을 기록한다. 추측이 아니라 "확인한 사실"과
"그래서 이렇게 정했다"를 구분해서 적는다.

---

## 0. 범위

목표 흐름:

```
Studio IMAGES
  → 이미지 업로드 또는 내 이미지 선택
  → 현재 스킨의 imageSlots에 연결 / 교체 / 비우기
  → HOME/CATEGORY/POST Preview 즉시 반영
  → Save
  → Publish 후 공개 스킨에 반영
```

제외(이번 범위 아님): 크롭/필터, 폴더/태그/검색, 대량 업로드,
외부 URL 입력, AI 연결, Options Schema, 기존 avatar/banner 통합
리팩터링.

---

## 1. 확인한 현재 구조

### 1-1. 테이블 (supabase/migrations/20260904100000_create_skins_skin_versions.sql)

| 테이블 | 키 | 비고 |
| --- | --- | --- |
| `skins` | `id` | 사용자당 `is_active` row 최대 1개(partial unique index). `current_draft_version_id` / `current_published_version_id` 두 포인터가 draft/published의 **유일한** 근거 |
| `skin_versions` | `id` | append-only. `status` 컬럼 없음. RLS GRANT에서 UPDATE/DELETE 자체를 부여하지 않음 |
| `skin_image_slot_values` | `(skin_id, slot_name)` | **`skin_id` 기준 — 버전 개념이 없다.** 그래서 이 테이블에 그대로 쓰면 draft 편집이 곧바로 공개본에 반영된다 |

`skin_image_slot_values`를 **쓰는 애플리케이션 코드는 현재 하나도
없다**(전 저장소 grep 결과: 읽기만 `studio/studio-preview.js:1345`,
`get_published_skin()` RPC. 쓰기는 `supabase/tests/*.sql` 수동 시드
스크립트뿐). 즉 이 테이블은 지금까지 "설계만 있고 UI가 없던" 자리다.

### 1-2. RPC

| RPC | 하는 일 |
| --- | --- |
| `create_skin_with_initial_version(content, schema_version, title)` | skins → skin_versions → draft 포인터 이동 (3단계 원자적) |
| `save_skin_draft_version(skin_id, content, schema_version, label)` | 새 skin_versions row + draft 포인터 이동 |
| `publish_skin(skin_id)` | `current_published_version_id := current_draft_version_id` (새 row 없음) |
| `restore_skin_version(skin_id, source_version_id, label)` | 과거 content 복제한 새 row + draft 포인터 이동 |
| `get_published_skin(user_id)` | anon 유일 통로. published 버전 content + `skin_image_slot_values` 전체를 `imageSlotValues`로 반환 |

### 1-3. 이미지 경로

- Skin Context의 `images.<slotName>`:
  `skin/skin-context.js` `buildSkinImages(imageSlotNames, imageSlotValues)`
  — **`imageSlotNames`(= Skin Package의 `imageSlots[].name`)에 선언된
  슬롯만** 노출한다. 값이 있어도 선언되지 않은 슬롯은 절대 안 나온다.
- `profile.avatarUrl`: `images.profile`을 그대로 재노출
  (`skin/skin-context.js` ~629행). 별도 소스 없음 — 이번에도 안 바꾼다.
- 슬롯 이름 추출: `skin/skin-image-slots.js` `extractImageSlotNames()`
  (공개 렌더 경로와 Studio Preview가 공유).

### 1-4. 기존 Storage/업로드 유틸

| 버킷 | 경로 규칙 | 특징 |
| --- | --- | --- |
| `user-favicons`, `user-cursors` | `{user_id}/favicon` 등 | 고정 경로 + `upsert:true` 덮어쓰기 |
| `user-avatars` | `{user_id}/avatar` | 동일 |

업로드 코드 패턴: `admin/settings/admin-settings-avatar.js`
(`supabaseClient.storage.from(bucket).upload(path, file, {upsert:true, contentType, cacheControl})`).

**이 패턴은 Image Library에 그대로 쓸 수 없다** — 고정 경로 덮어쓰기는
"같은 URL의 내용이 바뀐다"는 뜻이라, 이미 발행된 공개 스킨이 그 URL을
참조하고 있으면 Publish 없이도 공개 화면이 바뀐다. 요구사항
"같은 Storage 경로 덮어쓰기로 기존 공개 이미지가 바뀌지 않는다"에
정면으로 어긋난다.

### 1-5. Save / Publish / normalize / import가 이미지 연결을 다루는 방식

- `skin/skin-package-normalize.js`: html sanitize + css validate만.
  `imageSlots`는 손대지 않고 그대로 통과.
- `skin/skin-package-import.js`: `imageSlots`가 배열이면 그대로,
  아니면 `[]`로 대체. **슬롯 값(연결)은 전혀 다루지 않는다.**
- `studio/studio-preview.js`: mount 시 `loadImageSlotValues(skin.id)`로
  읽어 Context에 넣기만 한다. 쓰기 경로 없음.

정리하면 **"슬롯 구조(공유 가능)"는 이미 잘 분리돼 있고, "슬롯 값
(개인 데이터)"만 버전 개념 없이 떠 있는 상태**다. 이번 작업은 그
값 쪽에 버전 축을 넣는 것이다.

---

## 2. 데이터 모델

### 2-1. 왜 기존 테이블에 그대로 쓰지 않는가

`skin_image_slot_values`는 `skin_id` 기준이라 draft/published 구분이
없다. 여기에 UI를 붙이면:

- 슬롯을 바꾸는 순간 공개본이 바뀐다 (Publish 무의미)
- Publish 시점에 "그 버전이 쓰던 이미지"를 재현할 수 없다
- 과거 버전으로 Restore해도 이미지는 최신 값 하나뿐이다

전부 요구사항 위반이다. 그래서 **버전 축을 가진 새 연결 테이블**을
만든다.

### 2-2. 새 테이블 2개

```
public.skin_images                       -- 사용자별 이미지 라이브러리
  id            uuid pk
  user_id       uuid -> profiles(user_id) on delete cascade
  storage_path  text unique              -- 'skin-images' 버킷 안의 object key
  public_url    text check ~ '^https://'
  original_name text
  mime_type     text check in (png/jpeg/webp/gif)
  byte_size     int  check 0 < n <= 5MB
  created_at    timestamptz

public.skin_version_image_slots          -- "이 버전의 이 슬롯 = 이 이미지"
  version_id uuid -> skin_versions(id) on delete cascade
  slot_name  text check '^[a-z][a-z0-9_]*$'
  image_id   uuid -> skin_images(id) on delete restrict
  created_at timestamptz
  primary key (version_id, slot_name)
```

여기에 더해 `skin_versions`에 컬럼 하나를 추가한다:

```
public.skin_versions
  + uses_image_library boolean not null default false
```

"이 버전이 새 모델로 저장됐는가"를 버전마다 명시적으로 기록한다 —
왜 필요한지는 §4-5.

`skin_image_slot_values`(기존)는 **건드리지 않는다** — 남겨두고
읽기 폴백으로만 쓴다(§4-5).

### 2-3. 이 모델이 요구사항을 만족시키는 방식

| 요구사항 | 어떻게 만족되는가 |
| --- | --- |
| 업로드/슬롯 교체/Save만으로 공개본이 바뀌지 않는다 | 연결은 **`save_skin_draft_version_with_image_slots()`가 만드는 새 버전 row에만** 기록된다. published 포인터가 가리키는 row의 연결은 어떤 경로로도 수정되지 않는다(UPDATE 경로 자체를 안 만든다) |
| Publish 대상 버전에 대응하는 이미지 연결이 함께 공개된다 | `get_published_skin()`이 `current_published_version_id`의 연결만 읽는다. Publish는 포인터만 옮기므로 연결도 자동으로 같이 넘어간다 |
| 같은 Storage 경로 덮어쓰기로 기존 공개 이미지가 바뀌지 않는다 | 업로드 경로가 `{user_id}/{uuid}.{ext}`로 매번 새로 생성된다. `upsert:false` |
| 저장 후 재접속 시 Draft 이미지 연결이 복원된다 | mount 시 `current_draft_version_id`의 연결을 읽는다 |
| 과거 버전이 참조하는 이미지도 삭제 정책에서 고려한다 | `image_id`가 `on delete restrict` — **어떤 버전이든(발행 이력 포함)** 참조 중이면 DB가 삭제를 막는다 |
| 사용 중 이미지 삭제 방지 | 위와 동일. `delete_skin_image()` RPC가 사전에 친절한 메시지로 먼저 거절 |
| Skin에 선언되지 않은 슬롯 연결은 저장하지 않는다 | Save RPC가 `p_content->'imageSlots'`에서 선언된 이름을 뽑아 그 교집합만 insert(나머지는 조용히 버림). 프런트에서도 한 번 더 필터 |
| `imageSlots: []` 및 기존 스킨 호환성 | 선언이 없으면 연결이 0건. 폴백은 **published 버전 하나의 `uses_image_library`**로 판정하므로 기존 발행본은 유지되고, "전부 비움"도 부활하지 않으며, draft 저장이 공개본을 바꾸지도 않는다(§4-5) |

### 2-4. Draft 편집 중의 슬롯 값은 어디 있나

**메모리(working draft)에만 있다.** 기존 Studio 모델과 동일하다 —
Code Apply/Import도 `currentWorkingSkin`만 갱신하고 Save 전까지 DB를
안 건드린다. 슬롯 연결도 `currentWorkingImageSlotValues`에만 반영되고
Save에서 한 번에 기록된다.

그래서 "Save 전에 새로고침하면 슬롯 변경이 날아간다" — 이건 기존
Code Editor와 완전히 같은 동작이고, 요구사항("**저장 후** 재접속 시
Draft 이미지 연결이 복원된다")과도 일치한다. dirty 표시 대상에
슬롯 변경도 포함시켜 사용자가 Save를 잊지 않게 한다.

---

## 3. Storage

- 버킷: `skin-images`, `public = true`
- 경로: `{user_id}/{uuid}.{ext}` — **절대 재사용/덮어쓰기 없음**
- 정책 — **다른 `user-*` 버킷처럼 `for all` 하나로 두지 않는다.**
  `for all`은 UPDATE/DELETE까지 열어주므로, 소유자가 Storage API를
  직접 호출해 (a) 발행된 버전이 참조 중인 파일을 지우거나 (b) 같은
  경로에 upsert로 덮어써서 공개본과 과거 버전을 깨뜨릴 수 있다.
  `delete_skin_image()`의 참조 검사와 FK는 DB row만 지키고 파일은
  지키지 못한다.

  | 작업 | 정책 |
  | --- | --- |
  | INSERT | 자기 폴더면 허용(업로드) |
  | UPDATE | **정책 없음 = 항상 거부** → 같은 경로 덮어쓰기(upsert) 불가. 업로드 경로는 매번 새 uuid라 필요한 적이 없다 |
  | DELETE | 자기 폴더이고 **그 경로를 가리키는 `skin_images` row가 더 이상 없을 때만** 허용 → 모든 삭제가 `delete_skin_image()`(참조 검사 포함)를 반드시 거친다 |
  | SELECT | `anon, authenticated` — 발행된 스킨을 익명 방문자가 봐야 하므로 필수 |

  클라이언트는 이미 "RPC로 row 삭제 → Storage object 삭제" 순서라
  그대로 동작하고, 등록 실패 후 되돌리는 고아 정리도 row가 없으므로
  허용된다.

### 공개 URL 열람 ↔ 비공개 관리의 분리

| 대상 | anon | 소유자 |
| --- | --- | --- |
| Storage object (URL을 아는 경우) | 읽기 O | 읽기 O |
| Storage object 업로드 | X | 자기 폴더만 O |
| Storage object 덮어쓰기(upsert) | X | **X** (UPDATE 정책 없음) |
| Storage object 삭제 | X | 자기 폴더 + `skin_images` row가 없을 때만 O |
| `skin_images` 목록 조회(= 내 이미지 목록) | **X** | 자기 것만 O |
| `skin_version_image_slots` | **X** | 자기 skin 소속만 O |

즉 "URL을 이미 아는 사람은 그 이미지를 볼 수 있다"(공개 블로그이므로
당연)와 "누가 어떤 이미지를 갖고 있는지 목록을 볼 수 있다"는 완전히
분리된다.

---

## 4. RPC 변경/추가

### 4-1. 추가: `save_skin_draft_version_with_image_slots(...)`

기존 `save_skin_draft_version(uuid, jsonb, smallint, text)`는 **한 줄도
바꾸지 않는다**(시그니처를 바꾸면 오버로드가 생겨 PostgREST가 모호해진다).
새 이름의 함수를 추가하고, 그 안에서:

1. 소유권 확인
2. `skin_versions` insert + `current_draft_version_id` 이동 (기존과 동일)
3. `p_content->'imageSlots'`에서 선언된 슬롯 이름 집합을 추출
4. `p_image_slots`(= `{slotName: imageId}` jsonb) 중 **선언된 이름이고
   호출자 소유 이미지인 것만** `skin_version_image_slots`에 insert

전부 하나의 트랜잭션.

### 4-2. 추가: `create_skin_image(...)` / `delete_skin_image(...)`

- `create_skin_image(p_storage_path, p_public_url, p_original_name, p_mime_type, p_byte_size)`
  — 업로드 직후 메타데이터 등록. MIME 화이트리스트/크기 상한/
  **사용자당 개수 상한(100장)** 을 함수 안에서 강제한다(클라이언트
  검증은 UX용일 뿐 신뢰 경계가 아니다).
- `delete_skin_image(p_image_id)` — 참조 중이면 친절한 에러로 거절,
  아니면 row 삭제 후 `storage_path`를 반환한다(클라이언트가 그 경로로
  Storage object를 지운다).

### 4-3. 교체(같은 시그니처 `create or replace`)

- `get_published_skin(uuid)`
  - `current_published_version_id`의 `skin_version_image_slots` →
    `skin_images.public_url`로 `imageSlotValues` 구성
  - 폴백 여부는 **published 버전 하나의
    `skin_versions.uses_image_library`**로만 판정한다(§4-5).
- `restore_skin_version(uuid, uuid, text)`
  - 새 버전 row를 만들 때 **원본 버전의 슬롯 연결과
    `uses_image_library` 플래그를 함께 복제**한다 — 연결만 복제하고
    플래그를 빠뜨리면 "새 모델에서 전부 비운 버전"을 Restore했을 때
    복원본이 도입 이전 버전으로 취급되어 옛 값이 되살아난다

### 4-4. 하지 않는 것

- `create_skin_with_initial_version()`은 그대로 둔다 — 최초 생성
  시점에는 연결할 이미지가 존재할 수 없다.
- 기존 `skin_image_slot_values`에 대한 쓰기 경로는 **끝까지 만들지
  않는다**.


### 4-5. 판정 기준은 왜 "버전 단위"여야 하는가

연결 row 수만으로는 두 상태를 구분할 수 없다:

| 상태 | 연결 | 원하는 동작 |
| --- | --- | --- |
| (a) Image Library 도입 이전 버전 | 0건 | 옛 `skin_image_slot_values`로 폴백 |
| (b) 새 모델에서 의도적으로 전부 비운 버전 | 0건 | 비어 있는 그대로 (옛 값 부활 금지) |

그래서 `skin_versions.uses_image_library` 컬럼으로 **버전마다 명시적으로**
기록한다(default false — 이 migration 이전의 모든 버전은 (a)).

그리고 이 판정은 반드시 **그 버전 하나**를 봐야 한다. "이 skin이 새
모델을 한 번이라도 썼는가"처럼 skin 단위로 보면:

> legacy 이미지를 가진 공개 버전 A가 그대로인데, 새 draft B를 Save하는
> 순간 A의 폴백 조건이 뒤집혀 **공개 화면의 이미지가 Publish 없이
> 사라진다.**

"Save만으로 공개본이 바뀌지 않는다"는 이 기능의 핵심 불변식이 정면으로
깨진다. 그래서:

| 화면 | 판정 기준 |
| --- | --- |
| 공개 화면 (`get_published_skin`) | `current_published_version_id` 버전의 플래그 |
| Studio Preview (`studio-preview.js`) | `current_draft_version_id` 버전의 플래그 |

두 화면이 각자 자기 버전만 보므로 서로 간섭하지 않는다.

추가로 두 곳 모두 "그 버전에 연결이 실제로 있으면 플래그를 볼 것도 없이
새 모델 버전"으로 취급한다 — 연결을 만드는 경로가 Save RPC 하나뿐이라
정상 데이터에서는 플래그도 항상 true지만, 수동 시드처럼 손으로 넣은
row에서도 이미지가 사라지지 않게 방어한다. 이 조건 역시 그 버전
하나만 본다.

---

## 5. 프런트 구조

| 파일 | 책임 |
| --- | --- |
| `studio/images/skin-image-library.js` (신규) | 순수 데이터 계층 — 라이브러리 목록/업로드/삭제/연결 조회. DOM 접촉 없음 |
| `studio/images/images-panel.js` (신규) | IMAGES 패널 UI. 슬롯 목록/썸네일/업로드/연결/비우기/삭제 |
| `studio/images/images-panel.css` (신규) | 위 패널 스타일 |
| `studio/index.html` | IMAGES 버튼 + 패널 마운트 + 스크립트 로드 |
| `studio/studio-preview.js` | working 슬롯 값 보유/변경 API, dirty 반영, Preview 재렌더, Save payload에 슬롯 포함 |
| `studio/studio-write.js` | 새 Save RPC wrapper |

### 파일 형식/크기 제한 (프런트 + DB 이중)

- 허용 MIME: `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- **SVG는 허용하지 않는다** — 스크립트를 품을 수 있어 sanitize 경계
  밖의 실행 경로가 된다
- 파일당 5 MB
- 사용자당 100장

---

## 6. Import / 스킨 교체 시 슬롯 연결 규칙

Import(`studio/editor/import-editor.js` → `applyImportedSkinPackage`)나
Code Apply로 `imageSlots` 선언이 바뀔 수 있다. 규칙:

1. **이름이 그대로 남아 있는 슬롯의 연결은 유지한다.**
2. **새 선언에 없는 슬롯의 연결은 버린다.** (working 상태에서 즉시
   제거되고, Save RPC도 선언 교집합만 기록하므로 이중으로 보장된다)
3. 새로 생긴 슬롯은 비어 있는 상태로 시작한다.
4. Import 자체는 **연결을 절대 가져오지 않는다** — SkinPackage는
   공유 가능한 구조이고 이미지 연결은 개인 데이터라는 기존 분리
   원칙(`AI_SKIN_PHASE1A_DESIGN.md` 2-4절)을 그대로 지킨다.

이 규칙은 이미 저장된 과거 버전에는 소급되지 않는다(각 버전은
자기 연결을 그대로 갖는다).

---

## 7. 고아 파일 / 정리 정책

**이번 작업에서 어떤 정리 작업도 실행하지 않는다.** 정책만 정의한다.

고아가 생기는 경우:
1. 업로드는 성공했는데 `create_skin_image()` 등록이 실패
2. `delete_skin_image()`는 성공했는데 Storage 삭제가 실패

둘 다 "Storage에는 있는데 `skin_images`에는 없는 object"다. 공개
URL을 아는 사람만 접근할 수 있고 어떤 화면에도 나타나지 않는다.

정리 방법(수동, 운영자 판단):

```sql
-- 후보 조회만. 삭제는 하지 않는다.
select o.name, o.created_at, o.metadata->>'size' as size
from storage.objects o
where o.bucket_id = 'skin-images'
  and not exists (
    select 1 from public.skin_images i
    where i.storage_path = o.name
  )
  and o.created_at < now() - interval '7 days';
```

7일 유예를 두는 이유: 방금 업로드했지만 아직 등록 트랜잭션이 안 끝난
파일을 지우지 않기 위해서다.

자동 정리 job/cron은 만들지 않는다.

---

## 8. migration 적용 전 동작

새 테이블/버킷이 없는 상태에서도 **기존 기능은 전부 그대로 동작해야
한다.**

- Studio mount 시 `skin_images`에 가벼운 probe 쿼리를 한 번 던져
  `imageLibraryAvailable` 플래그를 정한다.
- 사용 불가면 IMAGES 버튼은 보이되 눌렀을 때 "아직 준비되지
  않았습니다(migration 필요)" 안내를 띄운다.
- Save는 플래그에 따라 새 RPC / 기존 RPC를 고른다 — 기존 RPC 경로는
  지금과 100% 동일하다.
- 공개 렌더는 `get_published_skin()`이 교체되기 전까지 기존 동작 그대로.

---

## 9. 적용 순서

1. `supabase/migrations/20260907100000_create_skin_image_library.sql`
   을 운영 Supabase에 적용
2. 적용 후 `supabase/tests/20260907_skin_image_library_manual_test.sql`
   의 확인 쿼리로 GRANT/RLS/버킷을 눈으로 확인
3. 프런트 재배포(이미 커밋된 코드는 migration 없이도 안전하다 — §8)
4. Studio에서 IMAGES → 업로드 → 슬롯 연결 → Save → Publish 순으로
   실사용 확인

---

## 10. 이번 v0.1에서 하지 않은 것 (다음 단계 후보)

- 이미지 교체 시 과거 버전이 참조하던 파일의 수명 관리 UI
- 용량 사용량 표시 / 초과 시 안내
- avatar/favicon/banner를 같은 라이브러리로 통합
- 슬롯별 권장 비율(`aspectRatioHint`) 기반 크롭


---

## 사용 중인 이미지 삭제 (STUDIO-LAYERS-MEDIA-1 · 2026-09-23)

### 무엇이 막혀 있었나

연결은 **버전 단위**다(`skin_version_image_slots`). Save 는 새 버전 row 에
연결을 insert 하므로, 한 번이라도 Save 한 이미지는 화면에서 비워도 과거
버전이 계속 참조한다. 그리고 그 참조를 지울 방법이 클라이언트에 없었다 —
그 표는 authenticated 에게 **select 만** grant 돼 있고, 쓰는 RPC 는
`save_skin_draft_version_with_image_slots`(새 버전 insert) 하나뿐이다.
그래서 `delete_skin_image()` 가 영원히 거절했고 Storage 용량도 돌려받을 수
없었다.

### 지금 동작 (현재 구현)

1. 카드의 "삭제"를 누르면 **먼저 사용처를 센다**
   (`skinImageLibrary.usage(imageId)` — 새 RPC 없이 select 로만 읽는다).
   - `published` 지금 공개 중인 버전 · `draft` 마지막으로 저장한 편집본 ·
     `past` 그 밖의 지난 저장본
   - 아직 저장하지 않은 **지금 화면의 연결**은 DB 에 없으므로
     `getStudioImageSlotState()` 에서 따로 센다. 두 수를 합친 것이 "N곳"이다.
2. 0곳이면 한 번 확인하고 기존 `delete_skin_image()` 로 지운다(변화 없음).
3. 1곳 이상이면 어디인지 줄줄이 보여 주고 묻는다 —
   "이 이미지는 스킨의 N곳에서 사용 중입니다 … 사용처에서 이미지를 비우고
   파일을 삭제할까요?" / 버튼은 **취소** · **사용처에서 제거하고 삭제**.
4. 확인하면 `delete_skin_image_everywhere(p_image_id)` 가 **한 트랜잭션**에서
   호출자 소유 버전의 연결을 전부 떼고 `skin_images` row 를 지운 뒤
   `storage_path` 를 돌려준다. 그 다음에야 Storage object 를 지운다.
   지금 화면의 그 자리도 함께 비운다(`setStudioImageSlot(slot, null)`).

### 순서와 실패

| 어디서 실패 | 결과 |
| --- | --- |
| 사용처 세기 | 삭제를 **멈춘다**(무엇을 지우는지 모른 채 지우지 않는다) |
| **직접 참조 guard**(follow-up) | 살아 있는 스킨 코드가 그 주소를 직접 쓰면 **아무것도 지우지 않고** SQLSTATE `IM001` 로 거절한다. 프런트는 "스킨 코드(CSS · HTML)에서 주소로 직접 쓰고 있어요 — 그 자리를 먼저 고치고 저장 · 발행한 뒤에 삭제할 수 있어요"로 바꿔 보여 준다 |
| 참조 제거(RPC) | 파일을 지우지 않는다 — 깨진 URL 이 남지 않는다 |
| Storage 만 실패 | DB 는 이미 지워졌다. 그 사실을 분명히 말하고 **"파일 다시 지우기"** 줄을 띄운다(재시도는 DB 를 다시 만지지 않는다) |
| migration 미적용 배포 | RPC 가 없으므로 **fail closed** — "이 배포에서는 사용 중인 사진을 지울 수 없어요"로 남는다(예전 동작 그대로) |

### 되돌릴 수 없다

Studio 의 ↶ 는 메모리 안의 working draft 기록이라 **지워진 파일을 되살리지
못한다**. 그래서 확인 문구와 성공 메시지에 그 말을 적고, 일반 Undo 로 복원
되는 것처럼 보이지 않게 한다(사용처를 뗀 것 = 슬롯 비우기는 Save 전이면
↶ 로 되돌아가지만 **파일은 이미 없다**).

### 공개본이 조용히 바뀌지 않는가

바뀐다 — 다만 **조용히는 아니다**. 확인 문구가 "공개 중인 스킨 N곳"과
"공개 중인 화면의 그 자리는 비어 보이게 된다"를 먼저 말한다. 그 확인 없이
공개 버전의 연결을 지우는 경로는 없다(RPC 는 프런트의 그 흐름에서만 불린다).

### 남은 차이

- **CSS/HTML 안에 직접 박은 URL**(`url("https://…/skin-images/…")`)은
  어느 표에도 참조 row 가 없어 **"N곳" 에는 여전히 잡히지 않는다**. 대신
  follow-up migration 의 guard 가 삭제를 **거절한다** — 살아 있는 버전
  둘(지금 공개 중 · 지금 편집 중)의 `content` 전체와 옛
  `skin_image_slot_values.image_url` 에서 그 이미지의 `storage_path` 를
  부분 문자열로 찾는다(주소 형태를 열거하지 않으려고 경로 한 조각만 본다).
  그래서 "세어 보여 주기"는 못 해도 **조용히 깨뜨리지는 않는다**.
- 그 guard 는 **지난 저장본은 보지 않는다.** 과거 `content` 는 고쳐 쓸 수
  없으므로(append-only) 막으면 "영영 못 지우는 이미지"가 되살아난다 —
  이 라운드가 없앤 바로 그 막다른 길이다. 지난 버전을 Restore 하면 그
  자리는 깨진 주소로 남고, 사용자가 그 draft 에서 고친다.
- 주소를 퍼센트 인코딩하거나 문자열을 잘라 이어 붙인 CSS 는 부분 문자열
  검색에 걸리지 않는다.
- 아직 저장하지 않은 **working draft** 의 CSS 도 DB 에 없으므로 guard 가
  보지 못한다(저장 뒤에는 편집 중 버전으로 잡힌다).
- 고아 파일(등록 실패로 남은 object) 자동 정리는 여전히 없다(7절).

### 검증

- `node supabase/delete-skin-image-everywhere-migration-test.mjs` — PGlite(실제
  Postgres)에서 **두 migration 을 순서대로 적용한 최종 상태**를 돌린다:
  미사용 삭제 · 참조 있으면 기존 함수 거절 · 모든 버전의 연결 제거 ·
  남의 이미지 거절 · 남의 버전이 참조하면 **전체 롤백** · grant, 그리고
  `[css]` 절 — 공개 중/편집 중 버전의 `url()` · `<img src>` 와 옛 슬롯 값
  URL 은 거절(`IM001`)하고 아무것도 지우지 않으며, 그 참조를 고치면 지워지고,
  지난 저장본만 가리키거나 남의 스킨이 쓰는 주소는 막지 않는다.
  **20260923100000 은 프로덕션 적용 완료 · 20260923120000 은 미적용.**
- `node studio/images/skin-image-library-e2e-test.mjs` — 프런트 흐름
  (`[guard]` · `[delete]` · `[focus]`).
