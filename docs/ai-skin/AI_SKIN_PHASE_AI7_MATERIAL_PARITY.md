# PHASE AI-7 — Skin / Studio / Public 재료 일치

> 이 문서는 이 라운드의 **기록**이다. 앞 라운드의 계약을 바꾼 지점은 "바뀐 것"에
> 모아 두었고, 디자이너가 읽을 최신 계약은
> [SKIN_DESIGNER_CONTRACT.md](../contracts/SKIN_DESIGNER_CONTRACT.md)에 있다.

## 0. 무엇을 고쳤나

실제 사용자 스킨에서 드러난 다섯 가지 어긋남이 출발점이다.

1. 공개 사이트 사이드바에는 사용자가 이름 붙인 HIGHLIGHT 카테고리(`MEMOS`)가
   보이는데 Studio HOME에서는 빠져 보였다.
2. 관리 화면에 있는 카테고리 루트 글이, 페이지네이션을 켠 공개 CATEGORY에서만
   사라졌다(폴더만 남았다).
3. 카테고리 아이콘이 순서(`nth-child`)와 글자(`▤`)로 그려져 있어 화면마다,
   재정렬마다 어긋났다.
4. `metadata.supports.highlights=true`인데 `templates.highlights`가 없는
   패키지가 만들어질 수 있었다.
5. 하이라이트 화면 template이 링크/버튼만 있는 채로 만들어질 수 있었다.
6. HOME의 하이라이트 자리가 "하이라이트 보기" 버튼 하나로 퉁쳐져 있었다 —
   발췌문을 HOME에 직접 놓을 재료가 아예 없었다(4-1절).

---

## 1. 새 바인딩 두 종 (renderer + sanitizer)

근거: [skin/skin-render.js](../../skin/skin-render.js),
[skin/skin-sanitize.js](../../skin/skin-sanitize.js)

| directive | 결과 | 왜 |
| --- | --- | --- |
| `data-imory-kind="path"` | 같은 요소에 `data-kind="<토큰>"` | CSS가 **종류**로 분기할 수 있게. 토큰은 `^[a-z][a-z0-9-]{0,31}$`만 통과해 attribute selector에 그대로 들어가도 안전하다. |
| `data-imory-color="path"` | 같은 요소에 `--imory-color: #rrggbb` | 항목마다 다른 색을 쓰는 **유일한** 길. `style` 속성은 sanitizer가 전면 금지하므로 스킨이 스스로 할 수 없다. 값은 `#rgb`/`#rrggbb`만 받는다. |

둘 다 `SKIN_SANITIZE_BIND_ATTRS`에 들어가 기존 5종과 **같은 규칙**(dotted path
검사)으로 저장된다. 지시 속성과 결과 속성의 이름이 다른 것은 `src`/`href`와 같은
설계다 — 같은 DOM을 다시 렌더해도 경로가 값으로 덮어써지지 않는다.

### 1-1. `time` 태그 허용

같은 파일에서 허용 태그에 `time` 하나를 더했다. 그 전에는 허용 목록에 없어
sanitizer가 껍데기를 벗기면서 **바인딩 속성까지 함께 지웠고**, 그래서
`<time data-imory-bind="item.publishedAtLabel">`로 쓴 날짜가 플랫폼 기본
template·생성기·실제 사용자 스킨 어디에서도 나오지 않았다. 이미 그렇게 쓰고
있던 스킨들은 재저장 없이 그대로 날짜가 나온다.

---

## 2. typed navigation material

근거: [skin/skin-context.js](../../skin/skin-context.js)
`resolveSkinNavIconKind()`

`navigation.categories[]` / `postCategories[]` / … 의 각 항목과
`navigation.home` / `navigation.highlights`에 `iconKind`가 추가됐다.

```
post → "document"   gallery → "image"   highlight → "quote"   banner → "link"
그 외(미래 타입) → "document"
```

`type`(제품의 카테고리 타입)은 그대로 두고 `iconKind`를 **따로** 낸다. 카테고리
타입이 나중에 하나 더 늘어도 기존 스킨의 아이콘이 사라지지 않게 하기 위해서다.

`navigation.highlights`에는 `type: "highlight"` / `iconKind: "quote"`도 함께
나간다 — 카테고리 목록으로 그리든 이 링크로 그리든 같은 아이콘을 쓸 수 있어야
한다.

기본 생성 스킨([skin/skin-generator.js](../../skin/skin-generator.js))은 이제
`data-imory-kind="item.iconKind"` + `[data-kind="..."]::before` 순수 CSS 도형으로
아이콘을 그린다. `nth-child`도 glyph도 쓰지 않는다.

---

## 3. 루트 글이 사라지지 않게 — `category.showPostsList`

근거: [skin/skin-context.js](../../skin/skin-context.js),
[skin/skin-template.js](../../skin/skin-template.js)
`skinTemplateUsesRootPostList()`

### 3-1. 문제

페이지네이션이 켜지면 `category.tree`는 **폴더 노드만** 갖는다(루트 글은
`category.posts`로만 온다). 폴더 트리만 그리는 스킨에서는 그 순간 루트 글이
공개 화면에서만 사라진다.

### 3-2. 두 갈래 처리

**(a) 스킨이 `category.posts`를 그린다면** — `category.showPostsList`를
가드로 준다. 정의는 `paginationActive || !hasFolders`이고, 이 값 하나로 네 경우
모두 같은 글이 정확히 한 번 나온다.

| | 안 나눔 | 나눔 |
|---|---|---|
| 폴더 없음 | 트리 없음 / 목록 O | 트리 없음 / 목록 O |
| 폴더 있음 | 트리 O(루트 글 포함) / 목록 없음 | 트리 O(폴더만) / 목록 O |

**(b) 스킨이 `category.posts`를 아예 안 그린다면** — 플랫폼이 **페이지 나누기를
켜지 않는다**. `buildCategorySkinContext`의 `paginationActive` 조건에
`options.supportsRootPostList !== false`가 더해졌고, 호출자
([skin/skin-category.js](../../skin/skin-category.js),
[studio/preview/preview-navigation.js](../../studio/preview/preview-navigation.js))가
`skinTemplateUsesRootPostList()`로 판정해 넘긴다. 갤러리·페이지네이션 때와 같은
"그 재료를 실제로 그리는 스킨에서만 켠다" 규칙의 세 번째 적용이다.

`undefined`(옛 호출자)는 "판정하지 않았다"로 다루고 조건을 적용하지 않는다.

---

## 4. 하이라이트 카드의 원문 위치와 색

근거: [skin/skin-context.js](../../skin/skin-context.js)
`buildHighlightsSkinContext()`,
[posts/view/posts-view-highlight-store.js](../../posts/view/posts-view-highlight-store.js)

카드에 다음이 추가됐다.

- `sourcePathLabel` — `"TXT > 2002 > 1"`(카테고리 > 폴더 > 글 제목). 빈 칸은
  빠진다. 제목은 **마스킹된 제목**이다.
- `sourcePathSegments` / `folderName` / `folderNamePath`
- `hasNoPostLink` — `postHref`가 null일 때 true(`data-imory-if`는 부정을
  표현할 수 없다)

폴더 이름은 `post_folders`를 사용자 단위로 한 번 더 읽어서 붙인다
(`fetchSkinOwnerFolders`). 실패하면 빈 배열이고 위치 표시가
`"카테고리 > 글 제목"`으로 짧아질 뿐 카드 목록은 그대로 나간다.

글의 폴더 id는 하이라이트 목록 조회에 `posts.folder_id`를 한 컬럼 더해서
받는다. 카드 Context가 이미 내보내는 `folderId`(= 하이라이트 화면의 폴더,
원본 카테고리)와 섞이지 않게 store 쪽 이름은 **`postFolderId`** 다.

플랫폼 기본 하이라이트 template
([skin/skin-template.js](../../skin/skin-template.js)
`getDefaultHighlightsTemplate()`)도 이제 `data-imory-color="item.color"`로
카드 강조선을 그 하이라이트의 색과 잇고, 원문 위치를 `sourcePathLabel`로 그린다.

Studio의 샘플 카드
([studio/preview/preview-navigation.js](../../studio/preview/preview-navigation.js))도
**같은 shape**으로 맞췄다(폴더 안의 글 한 장 포함).

---

## 4-1. HOME에 놓는 발췌 카드 — `home.highlights`

근거: [skin/skin-context.js](../../skin/skin-context.js)
`buildHomeSkinContext()` · `createSkinHighlightCardBuilder()` ·
`fetchSkinHomeHighlights()`,
[skin/skin-template.js](../../skin/skin-template.js)
`skinTemplateUsesHomeHighlights()`

### 문제

HOME의 하이라이트 자리에 스킨이 놓을 수 있는 것은 `navigation.highlights.href`
링크뿐이었다. 그래서 실제 사용자 스킨의 HOME에는 "하이라이트 보기" 버튼 하나만
있고, 정작 **발췌문 자체**는 HOME 어디에도 나올 수 없었다.

### 계약

`home.highlights`가 생겼다.

| 키 | 뜻 |
| --- | --- |
| `cards[]` | 최신순 최대 5장. **하이라이트 화면의 카드와 같은 `item.*`** |
| `featured[]` | 그중 맨 앞 한 장만 담은 배열 |
| `card` | 그 한 장(객체). 없으면 `null` |
| `hasCard` / `count` / `isEmpty` / `hasError` | 자리 판정용 |

`featured`를 따로 두는 이유는 순서 의존 장식을 안 쓰고 한 장만 그리기 위해서다
— `:nth-child(n+2){display:none}`는 목록 길이가 바뀌는 순간 어긋나고, 이 라운드가
아이콘에서 걷어낸 것과 같은 종류의 실수다.

### 카드 조립은 한 곳에만 둔다

`buildHighlightsSkinContext()` 안에 있던 `buildCard`/`folderNamePath`/
`folderKeyOf`를 모듈 수준의 **`createSkinHighlightCardBuilder({ slug,
categoryById, postFolders })`** 로 꺼냈다. HOME과 하이라이트 화면이 같은 함수를
부른다 — 조립이 두 벌이면 한쪽에만 필드가 늘거나 `sourcePathLabel`의 모양이
갈라지는데, 스킨 입장에서는 "같은 `item.*`인데 화면마다 다르다"라 가장 알아채기
어렵다.

### 조회는 HOME에서 따로 한다

`loadHighlightCards()`(posts/view/posts-view-highlight-store.js)는 **글 화면
묶음과 함께 나중에 로드**된다(`index.html`의 `loadPostsModule`). HOME은 그 묶음을
부르지 않으므로 거기서는 그 함수가 없다. 그래서 HOME만
`fetchSkinHomeHighlights()`로 직접 묻는다 — 같은 테이블·같은 RLS이고, 다른 점은
둘뿐이다: `posts.updated_at`을 읽지 않고(HOME 카드에는 위치 확인 표시가 없다),
개수를 처음부터 `limit`으로 자른다.

### 그릴 스킨에서만 조회한다

이 재료는 조회를 두 번 더 부른다(`post_highlights` + `post_folders`). 갤러리/
페이지네이션과 같은 방식으로, HOME template이 `home.highlights`를 실제로 그릴
때만 켠다 — `skinTemplateUsesHomeHighlights()`의 판정을
`skin/skin-home.js`가 `options.supportsHomeHighlights`로 넘긴다. **Studio
Preview는 이 값을 넘기지 않아 항상 조회한다** — 편집 중에 마크업을 막 붙인
순간에도 재료가 와 있어야 하기 때문이다(다시 열어야 보이면 고장으로 읽힌다).

### 하이라이트가 0건일 때

공개 화면은 `hasCard: false`라 자리가 통째로 접힌다. Studio Preview는 하이라이트
화면과 **같은 샘플 카드**를 끼운다
(`buildStudioHomeHighlightSampleContext()`) — 읽기에 성공했는데 0건일 때만이고,
`hasError`면 절대 끼우지 않는다.

기본 생성 스킨([skin/skin-generator.js](../../skin/skin-generator.js))의 HOME도
이제 이 자리를 갖는다(`.skin-home-highlight`, `featured` repeat +
`data-imory-color`).

---

## 5. 검증 — `auditSkinPackageMaterials()`

근거: [skin/skin-template.js](../../skin/skin-template.js)

Import([skin/skin-package-import.js](../../skin/skin-package-import.js) → 결과에
`warnings[]`)와 Save([studio/studio-preview.js](../../studio/studio-preview.js) →
토스트/콘솔)가 **같은 함수**를 쓴다. 네 가지를 경고한다.

1. `supports.highlights`(또는 레거시 `supports.memos`)가 true인데 실제
   `templates.highlights`/`templates.memos`가 없음
2. CATEGORY가 `category.pagination`은 그리는데 `category.posts`를 안 그림
3. 카테고리 메뉴 반복(`navigation.*`) 안의 클래스에 `nth-child` 규칙이 걸려 있음
4. Studio 미리보기 전용 샘플 문구가 template에 박혀 있음
   (목록의 소유자는 Preview 쪽이다 — `window.STUDIO_HIGHLIGHT_SAMPLE_TEXTS`)

**거부하지 않는다.** 이미 저장된 스킨을 다시 가져올 수 없게 만들면 안 되고,
일부는 의도한 선택일 수 있다. 판정은 전부 마크업/CSS 자체를 보고 하며,
`metadata.supports`는 여전히 신뢰 경계가 아니라 "작성자가 그렇게 주장했다"는
입력일 뿐이다(어긋남을 알리는 데만 쓴다).

---

## 6. AI 경로

근거: [functions/api/skin-ai.js](../../functions/api/skin-ai.js)

### 6-1. 버그 — 하이라이트 template이 결과에서 사라졌다

`buildSkinAiResultPackage()`에 `highlights` 분기가 없어서, 모델이 무엇을
돌려주든 결과 SkinPackage에 `templates.highlights`가 담기지 않았다. 스킨이 이미
갖고 있던 하이라이트 화면 디자인이 **AI 수정 한 번에 플랫폼 기본 template으로
되돌아갔고**, 모델이 새로 그려 준 카드 목록도 저장되지 않았다. banner/folder와
같은 한 방향 관대함(모델이 null을 주면 현재 것을 유지, 새로 만들었으면 받는다)을
그대로 적용했다.

이름은 언제나 canonical `highlights`다 — 입력 단계
(`normalizeSkinAiInputPackage`)가 옛 이름 `memos`를 이미 바꿔 놓는다.

### 6-2. 시스템 프롬프트에 더한 것

- `data-imory-kind` / `data-imory-color` 사용법
- `item.iconKind` 네 값과 **순서·glyph 기반 아이콘 금지**
- `category.showPostsList`와 "트리를 그리면 목록도 그린다" 규칙, 그리고
  `category.pagination`만 그리고 `category.posts`를 안 그리면 페이지 나누기가
  꺼진다는 사실
- `navigation.highlights.name`을 반드시 바인딩할 것(사용자가 붙인 이름이다)
- canonical은 `highlights`, `memos`/`memo-tools`는 호환 alias일 뿐
- 하이라이트 카드의 여덟 재료와 "링크/버튼만 있는 template은 하이라이트 화면이
  아니다"
- `supports`만 선언하고 실제 template을 빼먹지 말 것
- 허용 태그 목록에 `time`

---

## 7. 테스트

`node skin/skin-material-parity-e2e-test.mjs` (포트 8956) — chromium 58 검사 PASS.

같은 SkinPackage와 **같은 행**을 공개 화면과 Studio Preview
(`studio-lifecycle-scenario.html?scenario=k`)에 주고 두 화면을 비교한다.
절: `sidebar` / `icons` / `roots` / `highlights` / `homehighlight` / `legacy` /
`audit` (`--only=`에 쉼표로 여러 개를 줄 수 있다).

`homehighlight` 절은 HOME의 발췌 카드가 공개 화면과 Studio에서 같은 재료·같은
모양인지, 한 장만 나오는지(`featured`), 강조선 색이 그 하이라이트의 색인지,
`highlight-tools` 슬롯이 HOME에 생기지 않는지, 0건일 때 공개는 접히고 Studio는
샘플을 보이는지, 390px에서 가로 넘침이 없는지를 본다.

### 7-1. 하네스 쪽에서 함께 고친 것

- scenario 목록에 **scenario k**를 더했다(스킨·테이블을 e2e가
  `window.__scenarioParitySkinPackage` / `window.__scenarioParityTables`로
  실어 준다 — scenario g/t와 같은 패턴).
- 하네스가 `posts/view/posts-view-highlight-store.js`를 로드하지 않아
  Preview 하이라이트 화면이 ReferenceError로 죽었다. production
  (`studio/index.html`)과 같은 자리에 넣었다.
- in-memory mock의 `eq`/`in`이 `===`였다. PostgREST는 조건을 URL 쿼리로 받아
  언제나 문자열 대 문자열로 비교하므로, id를 프로덕션과 같은 숫자로 담은
  fixture에서 라우트가 넘긴 `"1"`과 매칭되지 않아 "이 카테고리를 찾을 수
  없습니다"가 났다. 문자열 비교로 맞췄다(문자열 id를 쓰는 기존 scenario는
  결과가 달라지지 않는다).

---

## 8. 남은 차이

- **`category.showPostsList`는 새 스킨을 위한 재료다.** 이미 저장된 폴더 전용
  스킨은 이 값을 모르므로, 그쪽에서는 3-2(b)의 "페이지 나누기를 켜지 않는다"가
  실제 안전망이다. 그 스킨들이 페이지 기능을 쓰려면 template에
  `category.posts` 블록을 더해야 한다 — 플랫폼이 남의 마크업을 고치지 않는다.
- **`auditSkinPackageMaterials()`의 nth-child 판정은 휴리스틱이다.** 카테고리
  반복 안의 클래스가 selector에 함께 등장할 때만 경고하므로, 아주 일반적인
  선택자(`li:nth-child(2)` 처럼 클래스가 없는 규칙)는 잡지 못한다. 잡지 못하는
  쪽으로 틀리게 두었다 — 멀쩡한 스킨에 잘못된 경고를 붙이는 쪽이 더 나쁘다.
- 하이라이트 카드의 원문 위치를 **링크 조각별로** 그리고 싶은 스킨
  (`카테고리`만 링크, `폴더`만 링크 …)은 아직 표현할 수 없다.
  `sourcePathSegments`는 글자 배열이고 조각마다의 href는 없다.
