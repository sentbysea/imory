# 본문 사진 — post/gallery 공통 에디터

관련 문서: [IMORY_GALLERY1_DESIGN.md](./IMORY_GALLERY1_DESIGN.md) (카테고리
갤러리 표시 · post_covers · `?page=N`) · [CLAUDE.md](./CLAUDE.md)

---

## 1. 이 라운드가 바꾼 것

GALLERY-1은 갤러리 글을 **사진 목록**으로 다뤘다. 갤러리 카테고리를 고르면
본문 편집 영역이 통째로 사라지고 전용 업로드 패널이 대신 떴으며, 저장 RPC가
사진 목록으로 본문 HTML을 만들어 `post_contents`에 덮어썼다.

그래서 갤러리 글에는 **글을 쓸 수 없었다**. 사진 사이에 문단을 넣어도 저장할
때마다 사라졌다.

이번 라운드는 타입 구분(`categories.type` = `post` / `gallery` / `banner`)은
그대로 두고, **본문 편집만 하나로 합쳤다.**

| | 이전 | 지금 |
| --- | --- | --- |
| 본문 편집 | post = 리치텍스트 / gallery = 사진 목록 | **둘 다 같은 리치텍스트 에디터** |
| 사진 넣기 | gallery 전용 패널 | 툴바 `PHOTO > 사진` (POINT COLOR 옆), 커서 자리 |
| 대표 이미지 | 별도 `COVER` 업로드 칸 | **본문 사진 중 하나를 '대표'로** |
| 본문 저장 | gallery는 RPC가 자동 생성 | 편집한 그대로 |
| `content_type` | gallery는 `html` | 둘 다 `richtext` |
| 발췌 버튼 | HTML 모드에서만 숨김 | HTML 모드 **또는 gallery**에서 숨김 |

banner 작성 UI는 이번 대상이 아니다 — 그대로다.

---

## 2. 계약 — 본문 안의 사진

사진은 본문 HTML에 **식별자 하나**로만 들어간다.

```html
<img src="/api/post-cover?image=<uuid>" alt="" data-imory-image="<uuid>" loading="lazy">
```

정화기(`posts/posts-sanitize.js`)가 이 모양을 강제한다. 저장/표시 어느 쪽이든
`<img>`를 만나면:

1. `data-imory-image`, 없으면 `src`의 `?image=` 에서 uuid를 읽는다
2. 못 읽으면 **통째로 버린다**
3. 읽었으면 `<img>`를 **새로 만들고** `src`는 그 uuid로 다시 짓는다

읽는 쪽 함수는 `getPostBodyImageId()` / `buildPostBodyImageUrl()` /
`listPostBodyImageIds()` / `stripPostBodyImages()` 넷이다.

### 왜 주소를 그대로 믿지 않는가

파일은 비공개 버킷에 있고 공개 주소가 없다. 바이트는 `/api/post-cover`로만
나가고, 그 요청마다 서버가 글의 현재 공개 상태와 요청자를 확인한다
(`functions/api/post-cover.js`). 본문에 남는 것이 "어느 사진인가"뿐이면:

- 남이 쓴 HTML(HTML 모드 글, 붙여넣은 본문)이 외부 주소를 본문 이미지로 끼워
  넣을 수 없다 — 외부 주소는 uuid가 없어 버려진다.
- 아직 안 올린 파일의 `blob:` 미리보기가 DB에 들어갈 수 없다 — 저장 시점에
  정식 주소로 다시 지어진다.

### 대표 사진은 본문에 없다

"이 글의 대표 사진"은 `post_gallery_images.is_primary` 행이 갖는다. 본문
HTML에는 그 표시도, 편집용 컨트롤도 들어가지 않는다. 그래서 공개 본문·저장되는
HTML·발췌 결과에 편집 흔적이 새어나갈 **자리가 구조적으로 없다**.

편집 화면에서 대표 표시는 `<img>`의 `post-editor-image-primary` class인데,
정화기가 img를 새로 만들기 때문에 저장되는 HTML로는 따라가지 않는다.

---

## 3. 편집 상태는 DOM이 갖는다

`posts/editor/posts-body-images.js`.

어느 사진이 / 어느 순서로 / 어느 것이 대표인지는 전부 `#postEditorContent`
안의 `<img>`가 갖는다.

| 무엇 | 어디 |
| --- | --- |
| 순서 | 본문에 나온 순서 → 그대로 `position` |
| 대표 | `img.post-editor-image-primary` |
| 식별자 | `data-imory-image` |

별도 사진 목록 상태를 두지 않는다. undo는 `innerHTML` 스냅샷을 되돌리는
방식이라(`posts-editor-undo.js`), 목록을 따로 두면 undo 뒤에 둘이 어긋난다.
DOM 하나로 두면 삽입·삭제·대표 지정이 **자동으로 함께** 되돌아간다.

곁에 두는 것은 두 개의 Map뿐이다.

- `postBodyImagePending` — uuid → `{ file, objectUrl }`. 아직 안 올린 파일.
  폼을 닫을 때까지 지우지 않는다 — undo로 되살아난 `<img>`도 같은 uuid로 파일을
  찾아야 한다.
- `postBodyImageSaved` — uuid → `{ storage_path, mime_type, byte_size }`.
  저장 RPC가 이 글의 사진 집합을 통째로 교체하므로, 이미 저장된 사진도 행 전체를
  다시 넘겨야 한다. **파일을 다시 올리지 않기 위한** 값이다.

### 커서 자리와 모바일

`사진` 버튼은 `pointerdown`에서 caret을 붙잡고(`postBodyImageInsertRange`),
`preventDefault()`로 포커스를 훔치지 않는다. 파일 선택창은 편집 영역의 선택을
가져가고 모바일에서는 앱이 잠깐 배경으로 내려가 복원되지 않으므로, "고른 뒤"가
아니라 **"고르러 가기 전"** 에 저장해야 한다.

여러 장을 고르면 고른 순서대로 그 자리에 이어서 들어가고, caret은 마지막 사진
뒤에 놓인다 — 이어서 타이핑하면 사진 **다음** 글이 된다.

### 대표 선택 컨트롤

본문 사진을 누르면 그 사진 오른쪽 위에 `대표` 토글이 뜬다
(`#postEditorImageControl`). contenteditable **밖의** 요소이고 좌표만 사진에
맞춘다. 편집 영역 밖으로 나가지 않게 좌우로 끌어당긴다 — 세로로 긴 사진이나
모바일 폭에서 버튼이 잘려 못 누르는 일이 없어야 한다.

한 글에 명시적 대표는 최대 한 장이다(DB에도 `post_id` 단위 unique partial
index가 있다). 지정하지 않으면 본문의 첫 번째 사진이 대표가 된다 — 그 판정은
플랫폼이 스킨 데이터를 만들 때 한다(§5).

---

## 4. 저장 순서

`posts/editor/posts-save.js` → `savePostContentAndSecret()`.

```
1. savePostBodyImages(postId)
     본문의 <img>를 순서대로 모은다
     아직 안 올린 것만 {user_id}/{uuid}.{ext}에 올린다 (upsert:false)
     save_own_gallery_images(postId, rows)  — 사진 집합 통째 교체
     RPC가 돌려준 고아 경로만 Storage에서 지운다
2. upsert_own_post_content(postId, content, ooc)
3. set_post_secret_password (secret + 새 비밀번호일 때만)
```

**사진이 먼저**인 이유: 뒤이어 저장되는 본문이 가리키는 사진이 전부 실재하게
된다. 반대 순서면 사진 저장이 실패했을 때 본문이 없는 사진을 가리킨 채 남는다.

실패하면 이번에 올린 파일만 지우고 글 저장을 멈춘다. 기존 사진 행도 파일도
`post_covers`도 건드리지 않는다.

사진이 한 장도 없었고 지금도 없으면 **왕복 자체를 하지 않는다** — 사진을 쓰지
않는 평범한 글이 이 기능 때문에 느려지지 않게.

### 고아 파일만 지운다

`save_own_gallery_images`가 돌려주는 것은 "이 글에서 밀려났고, **다른 글의 사진
행도 어떤 `post_covers` 행도** 더 이상 참조하지 않는" 경로뿐이다. 그래서 편집
중 사진을 지우고 저장해도 아직 저장된 다른 글이나 예전 COVER가 깨지지 않는다.

### 파일은 저장을 눌러야 올라간다

고르는 순간에는 `blob:` 미리보기만 만든다. 작성을 취소하면 Storage에 임시
파일이 남지 않는다.

---

## 5. 공개 화면 — 대표 이미지 결정

`skin/skin-context.js`의 `buildSkinGalleryCards()`.

```
thumbnailUrl =
    비밀글이면            → 카테고리 공통 대체 이미지 / 잠금 카드
    명시 대표(is_primary) → 그 사진
    아니면 본문 첫 사진   → photos[0]
    그것도 없으면          → 예전 post_covers
```

본문 사진(`photoMap`)은 이제 **gallery뿐 아니라 post 카테고리에서도** 읽는다 —
COVER 업로드 칸이 사라졌으므로, 갤러리로 표시되는 post 카테고리의 썸네일도
여기서 나와야 한다.

스킨 계약(`category.gallery.cards[]`)은 그대로다: `thumbnailUrl` ·
`hasThumbnail` · `isPlaceholder` · `images[]` · `imageCount` 등.
**갤러리를 아는 스킨은 아무것도 바꾸지 않아도 새 대표 이미지를 받는다.**

---

## 6. 기존 데이터 호환

지우는 것은 UI뿐이고, 데이터는 하나도 지우지 않는다.

### `post_covers` (예전 COVER)

행도 파일도 그대로 둔다. 저장 경로가 더 이상 그 테이블을 건드리지 않을 뿐이다.
본문에 사진이 없는 글은 지금까지처럼 그 사진을 썸네일로 쓴다(§5의 마지막
fallback). `get_own_post_cover_paths`는 여전히 `post_covers`와
`post_gallery_images`를 함께 보므로 글을 지우면 둘 다 정리된다.

`posts/editor/posts-cover-image.js`에는 UI가 없어지고 **버킷 이름 · 허용 형식 ·
업로드 경로 규칙 · 삭제 정리 헬퍼**만 남았다. 본문 사진도 같은 버킷·같은 경로
규칙을 쓴다.

### 예전 갤러리 글 (자동 생성 본문 + `content_type='html'`)

데이터는 고치지 않고 **여는 방식**만 바꾼다.
`posts/view/posts-view-editor-load.js`의 `isLegacyGeneratedGalleryBody`가

```
^(?:\s*<p>\s*<img src="/api/post-cover\?image=<uuid>" alt="">\s*</p>\s*)+$
```

에 정확히 맞는 본문만 리치텍스트로 연다. 사진도 순서도 대표 지정도 그대로
복원되고, 그 위에 글을 덧쓸 수 있다. 사람이 직접 쓴 HTML 글은 이 모양과
일치하지 않으므로 지금까지처럼 HTML 모드로 열린다.

되돌릴 일이 생겨도 원본 데이터가 남아 있다.

### 예전 리치텍스트 글

영향 없다. 정화기가 `<img>`를 **추가로** 허용했을 뿐 기존 허용 목록은 그대로다.

---

## 7. 발췌(PREVIEW / export / copy)

발췌는 본문 사진을 **글과 같은 순서로** 함께 그린다. (이전 라운드에서는
`stripPostBodyImages()`로 걷어냈다 — 그 함수는 없어졌다.)

### 7.1 사진을 먼저 정지 raster로 굳힌다

`posts/preview/posts-preview-images.js`.

`preparePostBodyImagesForPreview(html)`이 본문에 나온 식별자
(`listPostBodyImageIds()`)를 전부 읽어 **data: URL 하나로 굳혀** 캐시에 담는다.
페이지 나누기(`renderEditorPreviewPages()`)는 그 뒤에 **동기로만** 돌므로,
높이가 나중에 바뀌어 이미 나눈 페이지가 어긋날 자리가 없다.

주소를 그대로 `<img src>`로 두지 않는 이유는 셋이다.

1. **캡처가 다시 불러온다.** html2canvas는 문서를 숨겨진 iframe으로 복제한 뒤
   그 안에서 이미지를 다시 읽는다. `/api/post-cover`는 요청마다 권한을 확인하는
   접근 경계라(§2), 캡처 도중 권한이 바뀌면 캡처본에서만 사진이 조용히 빠진다.
2. **아직 저장하지 않은 사진.** `postBodyImagePending`의 File을 그대로 쓰므로
   발췌를 위해 글을 강제로 저장하거나 공개하지 않는다.
3. **움직이는 이미지.** `createImageBitmap(blob)`은 스펙상 애니메이션 이미지의
   default image(= 첫 프레임)를 준다. 그 한 프레임을 굳혀서 PREVIEW와
   export/copy가 **항상 같은 프레임**을 쓴다.

data: URL이라 캔버스가 오염되지 않아 export가 taint로 실패할 자리도 없다.
굳힌 raster는 최대 변 2000px로 제한한다(사진 한 장 5MB × 여러 장이면 모바일
메모리가 위험하다). 캐시는 폼을 닫을 때 `resetPostBodyImages()`가 비운다.

### 7.2 배치와 페이지 나누기

- 너비는 **그 페이지의 실제 본문 너비**(`content.clientWidth`)까지, 가운데 정렬.
  `clientWidth`를 쓰는 이유는 화면 미리보기의 확대/축소 transform이 섞이면
  안 되기 때문이다.
- `width`/`height`를 둘 다 원본 비율대로 픽셀로 못박는다 — 자르거나 늘이지
  않는다.
- 글과 사진 사이 간격은 프리셋의 문단 간격(없으면 본문 글자 크기의 0.75배).
- 한 장을 두 페이지로 쪼개지 않는다. 남은 자리에 안 들어가면 통째로 다음
  페이지로 옮기고, 새 페이지에도 안 들어가면 비율을 지켜 줄인다. 줄일 폭은
  "실제로 넘치는지"를 재서 이분 탐색으로 찾으므로 여백·제목·출처가 차지하는
  자리가 자동으로 빠진다.
- **AUTO 높이**에서는 페이지가 콘텐츠만큼 늘어나 넘치지 않으므로, 옮기기도
  줄이기도 일어나지 않는다(고정 높이 규칙을 AUTO에 적용하지 않는다).
- 명시적 PAGE BREAK는 그대로다.

### 7.3 PREVIEW · export · copy는 같은 DOM을 캡처한다

셋 다 `.post-editor-preview-page`를 그대로 찍으므로 페이지 구성이 갈라질 자리가
없다. 갈라질 수 있는 것은 "그 페이지가 최신 사진을 담고 있는가"뿐이라,
`ensurePreviewImagesReadyForExport()`가 캡처 직전에 한 번 맞춘다.

- 못 읽은 사진이 하나라도 있으면 **throw** 한다 — 사진을 조용히 빼고 성공
  처리하지 않는다. PREVIEW에는 같은 자리를 차지하는 자리표시자가 남고 안내가
  뜬다. 실패는 캐시하지 않으므로 **버튼을 다시 누르는 것이 곧 재시도**다.
- 모바일 클립보드는 사용자 제스처 유효 시간이 있으므로, 이 대기를
  `ClipboardItem`에 넘기는 Promise **안에서** 한다(기존 구조 그대로).

### 7.4 곁다리로 고친 것 — 캡처 좌표

html2canvas에 `windowWidth`(=520)를 못박고 있었다. 복제 문서는 그 크기의
iframe에서 다시 레이아웃되는데 자르는 좌표는 **라이브 페이지에서 잰 값**이라,
데스크톱(1280)에서는 프리뷰 페이지가 문서 왼쪽 약 390px 자리인데 복제본에서는
0px 근처로 옮겨가 **export가 통째로 흰 이미지**가 됐다. 폭을 못박을 이유도 없다
(페이지 박스가 CSS에서 520px 고정이다). 오히려 좁은 창으로 바꾸면 복제본이
모바일 media query를 타서 PREVIEW와 다르게 그려진다. 지금은 자를 크기
(`width`/`height`)만 주고 레이아웃은 라이브와 같은 창에 맡긴다
(`posts/export/posts-preview-export-capture.js`).

### 7.5 버튼

버튼 자체는 `syncEditorExcerptControls()`가 정한다:

| | PREVIEW | export | copy | cancel | save |
| --- | --- | --- | --- | --- | --- |
| post (richtext) | O | O | O | O | O |
| gallery | — | — | — | O | O |
| HTML 모드 | — | — | — | O | O |

여기서 말하는 `copy`는 **발췌 이미지 복사** 버튼이다 — 본문 글자를 선택해
복사하는 브라우저 기본 동작과는 관계가 없다.

---

## 8. Migration

`supabase/migrations/20260912100000_post_body_images.sql`.

`save_own_gallery_images()`에서 `post_contents` 자동 생성 구문 **한 덩어리만**
뺀다. 테이블·RLS/GRANT·대표 unique 인덱스·소유권 검사·`storage_path` 검증·고아
경로 반환은 전부 그대로다. 함수 이름도 그대로 둔다 — 이름을 바꾸면 배포 중간
상태에서 옛 클라이언트가 없는 함수를 부른다.

`supabase/tests/gallery-content-test.mjs`(PGlite)가 이 migration을 두 번
적용하고, 사진을 저장해도 본문이 그대로인지와 빈 목록 저장(마지막 사진 제거)이
고아 경로를 돌려주는지를 검사한다.

---

## 9. 남은 차이

- **발췌 사진의 크기·정렬·자르기 UI** — 없다. 본문 너비에 맞춰 가운데 정렬이
  전부다(§7.2).
- **굳히는 raster의 상한** — 최대 변 2000px이다(§7.1). EXPORT WIDTH를 2000
  이상으로 올리면 사진만 그 상한까지만 선명하다.
- **발췌 안에서 사진 순서 바꾸기** — 없다. 본문 순서가 그대로 발췌 순서다.
- **사진 순서 바꾸기(드래그)** — 없다. 본문에서 잘라내어 다시 넣는 방식이다.
- **alt 텍스트 편집** — 저장은 되지만(정화기가 200자까지 보존) UI가 없다.
- **본문 사진 크기 조절/자르기** — Skin Studio의 이미지 자르기
  (`AI_SKIN_PHASE_AI6D_IMAGE_CROP.md`)는 스킨 템플릿 안의 이미지 얘기다. 글
  본문 사진에는 해당 UI가 없다.
- **`upsert_own_post_content` 실패 시** — 사진 행과 파일은 이미 저장돼 있고
  본문만 옛 내용이다. 다시 저장하면 맞춰진다. 그 사이 새 사진 행은 본문이
  가리키지 않는 상태로 남는다(파일은 살아 있고 접근 경계는 그대로).
- **다른 글의 사진을 HTML 모드로 참조한 경우** — 사진 행은 글 하나에 매달려
  있다(`post_gallery_images.post_id`). HTML 모드로 다른 글의 `?image=` 주소를
  직접 적어 넣으면 화면에는 나오지만(그 글의 공개 상태로 판정된다) **참조로는
  세어지지 않는다** — 원래 글에서 그 사진을 지우면 이 참조가 깨진다. 리치텍스트
  편집에서는 만들 수 없는 상태다(붙여넣기는 글자만 남기고, 모르는 식별자는
  저장 직전에 본문에서 걷어낸다).
