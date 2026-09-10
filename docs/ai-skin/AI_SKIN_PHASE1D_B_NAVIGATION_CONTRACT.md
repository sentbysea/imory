# PHASE 1D-B — Independent Navigation Contract

스킨이 HOME 링크와 post/banner 카테고리 메뉴를 서로 다른 위치에
자유롭게 배치할 수 있도록, 기존 `navigation.categories[]`는 그대로
유지하면서 그 위에 `navigation.home`/`navigation.postCategories[]`/
`navigation.bannerCategories[]`를 추가한 Slice.

관련: [AI_SKIN_PHASE1A_DESIGN.md](AI_SKIN_PHASE1A_DESIGN.md)
(Skin Context v0.1, `navigation` 네임스페이스 원설계),
[AI_SKIN_PHASE1C_PAGE_CONTRACT.md](AI_SKIN_PHASE1C_PAGE_CONTRACT.md)
(HOME/CATEGORY/POST 세 page.type과 base namespace 공유 구조),
[AI_SKIN_PHASE1D_A_LIST_DATA_AUDIT.md](AI_SKIN_PHASE1D_A_LIST_DATA_AUDIT.md)
(직전 Slice, 동일한 "감사 후 최소 계약" 방식론).

---

## 1. 기존 navigation data flow

```
buildBaseSkinContext(ownerId, options, commonData)
  └─ fetchSkinCategories(ownerId)
       select: id, name, type, sort_order
       from public.categories where user_id = ownerId
       order by sort_order asc
  └─ navigation.categories[] 매핑 (skin-context.js)
```

- `navigation`은 `site`/`profile`/`banners`/`images`와 함께
  `buildBaseSkinContext()`가 만드는 **공통(base) namespace**다 —
  page.type(home/category/post)과 무관하게 항상 동일한 함수 하나가
  만든다(`skin-context.js:475-`). 즉 HOME/CATEGORY/POST 세
  builder(`buildHomeSkinContext`/`buildCategorySkinContext`/
  `buildPostSkinContext`)가 전부 이 base context를 스프레드해서
  쓰므로, **navigation 계약을 이 함수 한 곳에서만 바꾸면 세 page.type
  전부에 자동으로 반영된다.**
- **소비자**: 공개 HOME(`skin/skin-home.js` → `buildSkinContext()`,
  `buildHomeSkinContext()`의 하위 호환 별칭), 공개 CATEGORY
  (`skin/skin-category.js` → `buildCategorySkinContext()`), 공개 POST
  (`skin/skin-post.js` → `buildPostSkinContext()`), Studio Preview
  (`studio/studio-preview.js`의 HOME 렌더, `studio/preview/
  preview-navigation.js`의 CATEGORY/POST 렌더) — **다섯 진입점 전부
  같은 `buildBaseSkinContext()` 위에 얹혀 있어 navigation 계약이
  이미 하나로 통일돼 있었다.** Studio 전용 navigation shape는
  존재하지 않는다(8절 요구사항이 조사 시점에 이미 충족돼 있었음).
- **category.type 실제 값**: DB에 `categories` 테이블 CHECK 제약이
  없어(migration 추적 이전부터 존재) enum이 코드 레벨에서만
  강제된다. 실사용 값은 `"post"`/`"banner"` 둘뿐(admin 카테고리
  편집기 `<select>`가 이 두 값만 하드코딩, PHASE1C 1-2절 재확인).
- **banner 카테고리 클릭 시 실제 렌더**: `posts/view/
  posts-view-list.js`의 `openCategoryPage()`가 `category.type ===
  "banner"`이면 Skin CATEGORY 렌더 경로를 아예 타지 않고 legacy
  `renderBannerCategory()`(별도 `banners` 테이블 그리드)로 폴백한다
  (PHASE1C 1-2/5-2절, 이번 Slice에서 변경하지 않음) — 따라서
  `navigation.bannerCategories[].href`가 가리키는 라우트
  (`/:slug/category/:id`)는 오늘도 동일하게 동작하는 기존 라우트이고,
  이번 Slice는 그 링크를 "어디에 배치할지"의 데이터만 추가한다.
- **HOME href 재료**: `core/lib/site-path.js`의 `buildSitePath(slug,
  subPath)`가 이미 slug 기반 HOME 경로(`buildSitePath(slug, "/")`)를
  만들 수 있었다 — `navigation.categories[].href`가 이미 같은 함수의
  `/category/:id` 호출로 만들어지고 있었으므로, HOME도 같은 helper의
  다른 호출로 자연스럽게 확장 가능했다(새 경로 조립 로직 불필요).

---

## 2. Renderer 제약과 결정

`skin/skin-render.js`의 `data-imory-if`/`data-imory-repeat`는
truthy/falsy 판정과 배열 반복만 지원하고, `item.type === 'banner'`
같은 비교식이나 filter는 지원하지 않는다(`applySkinIf`/
`applySkinRepeat`, 비교 연산자 파서 자체가 없음 — 코드 확인, 문서상
PHASE1A_DESIGN.md 4-3절에도 이미 "의도적으로 지원하지 않는다"고
명시돼 있었다). `skin-sanitize.js`의 `data-imory-*` path 검증
정규식(`SKIN_SANITIZE_BIND_PATH_PATTERN`)도 dotted identifier만
허용해 표현식 자체가 저장 단계에서부터 막힌다.

**결정**: 표현식 엔진을 새로 만들지 않고, Skin Context가
`navigation.categories`와 별개로 이미 필터링된 배열
(`navigation.postCategories`/`navigation.bannerCategories`)을
제공한다. Skin은 다음처럼 `data-imory-repeat`를 두 번 쓰기만 하면
type별로 다른 위치에 배치할 수 있다:

```html
<nav class="post-navigation">
  <a data-imory-repeat="navigation.postCategories"
     data-imory-href="item.href"
     data-imory-bind="item.name"></a>
</nav>

<section class="banner-navigation">
  <a data-imory-repeat="navigation.bannerCategories"
     data-imory-href="item.href"
     data-imory-bind="item.name"></a>
</section>
```

이 패턴은 기존 `data-imory-repeat="navigation.categories"` +
`data-imory-href="item.href"` + `data-imory-bind="item.name"`
바인딩 문법을 한 글자도 바꾸지 않는다 — path만 다른 배열을
가리킬 뿐이다.

---

## 3. 확정한 navigation contract

```
navigation.home = {
  name: string,      // site.title과 동일 값(siteTitle 단일 source 재사용)
  href: string,       // buildSitePath(slug, "/") — 실제 공개 HOME 경로
  enabled: boolean    // v1D-B는 항상 true(모든 owner가 HOME을 가짐).
                       // 필드 자체는 미래에 "홈 링크 숨기기" 같은 옵션이
                       // 생겨도 값만 바뀌면 되도록 지금부터 존재.
}

navigation.categories[]        // 기존 그대로, 값/순서/shape 변경 없음
  = { id, name, type, href, itemCount }

navigation.postCategories[]    // categories.filter(type === "post")
navigation.bannerCategories[]  // categories.filter(type === "banner")
  // 두 배열 모두 item shape이 navigation.categories[]와 완전히 동일
  // (id/name/type/href/itemCount) — 실제로 같은 매핑 결과 배열을
  // filter()한 부분집합이라 참조가 아니라 값 자체가 항상 일치한다.
  // sort_order 순서도 원본 그대로 보존.
```

- `name`은 별도 "홈 메뉴 라벨" 컬럼이 DB에 없어(감사 결과 없음)
  새 source를 만들지 않고 `site.title`(이미 `blog_title` →
  `profiles.nickname` → `"Imory"` fallback 체인을 거친 값)을 그대로
  재사용한다. 스킨 저작자가 "HOME" 같은 고정 라벨을 원하면 그냥
  HTML에 직접 쓰면 되므로(바인딩 강제 아님) 이 필드는 필수 사용
  대상이 아니라 선택적 편의 필드다.
- `type`이 `"post"`/`"banner"`가 아닌 미래 값(예: `"gallery"`)이면
  두 필터 배열 어디에도 들어가지 않고 `navigation.categories[]`에만
  남는다 — 새 값이 추가돼도 이 필터 로직이 깨지거나 잘못된 배열에
  섞이지 않는다(안전한 기본 처리, PHASE1A_DESIGN.md 1-7절 "열린
  문자열" 원칙 계승).

---

## 4. NOTICE / GUESTBOOK — 미래 확장 검토(구현 안 함)

실제 NOTICE/GUESTBOOK 기능·route·DB table이 전혀 없으므로 이번
Slice에서 어떤 형태로도 구현하지 않는다(가짜 href/존재하지 않는
페이지 링크/새 route/새 table 전부 금지 원칙 준수).

**확장성 검토**: `navigation` namespace가 이미 "각 항목이 독립된
top-level 필드"(예: `navigation.home`) + "배열 필드"(예:
`navigation.postCategories`) 두 형태를 모두 담고 있으므로, 실제
기능이 생기면 다음 중 하나로 자연스럽게 additive 확장이 가능하다:

- `navigation.notice = { href, enabled }` — NOTICE가 "고정된 단일
  페이지"라면 `navigation.home`과 동일한 shape.
- `navigation.guestbook = { href, enabled }` — 동일한 이유로 동일 shape.

두 경우 모두 기존 필드(`home`/`categories`/`postCategories`/
`bannerCategories`)의 값이나 shape을 전혀 바꾸지 않는 순수 추가라,
지금 이 필드들을 설계에 미리 넣을 필요가 없다(실제 라우트/DB가
생기기 전에는 어떤 값도 정직하게 채울 수 없다 — YAGNI). 이번
Slice는 이 확장이 **막혀있지 않다는 것**만 확인했다.

---

## 5. Custom Links — 검토(구현 안 함)

사용자 지정 링크를 저장하는 DB source(column/table)가 없다.
`navigation.customLinks`를 저장 없이 빈 배열 등으로 임의 추가하는
것은 "안전하게 채울 source가 없는 필드는 만들지 않는다"는 1D-A
감사 원칙(엑서프트/썸네일과 동일 판정)에 위배돼 구현하지 않았다.
필요성만 미래 항목으로 문서화한다: 사용자가 이름/URL 쌍을 등록하는
새 테이블(예: `custom_nav_links(user_id, name, url, sort_order)`) +
관리 UI 신설이 선행돼야 한다.

---

## 6. Backward compatibility

- `navigation.categories[]`는 값/순서/item shape 전부 그대로다 —
  `skin-page-context-test.html`의 기존 assertion(`c.itemCount ===
  null` 등)이 변경 없이 계속 통과한다.
- 기존 generated Skin(`skin-generator.js`가 만든 HTML/CSS)은 여전히
  `data-imory-repeat="navigation.categories"` 하나만 참조하므로
  렌더 결과가 전혀 바뀌지 않는다 — Generator 자체도 수정하지
  않았다(5절 요구사항, 기본 Generator navigation 디자인 재설계는
  이번 범위 밖).
- 새 필드(`home`/`postCategories`/`bannerCategories`)를 참조하지
  않는 기존 published/draft SkinPackage는 다시 저장되거나
  migration되지 않는다 — `buildBaseSkinContext()`가 항상 세 필드를
  추가로 채워 넣긴 하지만, sanitizer가 저장 시점에 이미 dotted
  identifier만 허용하므로 기존 skin.html이 우연히 이 이름들을
  참조하고 있었을 수 없다(신규 namespace 추가는 항상 안전하다는
  PHASE1C 4-3절 논리를 그대로 재적용).

---

## 7. 변경 파일

- [skin/skin-context.js](../../skin/skin-context.js) — `buildBaseSkinContext()`에
  `navigation.home`/`navigation.postCategories`/
  `navigation.bannerCategories` 추가. `siteTitle`을 지역 변수로
  뽑아 `site.title`과 `navigation.home.name`이 동일 source를
  재사용하게 정리. 파일 상단 주석에 이번 Slice 이력 기록.
- [skin/skin-page-context-test.html](../../skin/skin-page-context-test.html) —
  신규 필드에 대한 assertion 9건 추가(HOME href/name/enabled,
  post/banner 필터 정확성, item shape 동일성, 빈 배열 정상 처리,
  다른 owner 혼입 없음, 기존 categories 필드 회귀 없음).
- 이 문서(`AI_SKIN_PHASE1D_B_NAVIGATION_CONTRACT.md`) 신규 작성.

`skin/skin-generator.js`, `skin/skin-render.js`,
`skin/skin-sanitize.js`, DB/RLS/GRANT/RPC/migration, `Concept.md`는
수정하지 않았다.

---

## 8. 테스트 및 회귀 결과

로컬 정적 서버(포트 8934) + Playwright headless Chromium으로 실행:

```
skin/skin-page-context-test.html     — 49 passed, 0 failed (신규 9건 포함)
skin/skin-render-test.html           — 39 passed, 0 failed
skin/skin-css-validate-test.html     — 23 passed, 0 failed
skin/skin-render-security-test.html  — 23 passed, 0 failed
skin/skin-package-normalize-test.html — 12 passed, 0 failed
skin/skin-post-region-test.html      — 17 passed, 0 failed
skin/skin-post-integration-test.html — 20 passed, 0 failed
skin/skin-post-lifecycle-test.html   — 32 passed, 0 failed
skin/skin-generator-test.html        — 24 passed, 0 failed
studio/studio-multipage-test.html    — 16 passed, 0 failed
studio/studio-lifecycle-test.html    — 15 passed, 0 failed
studio/studio-navigation-test.html   — 87 passed, 0 failed
```

전 항목 FAIL 0건. 콘솔에 찍힌 에러 로그(RPC 실패 시뮬레이션,
malformed payload 등)는 각 테스트가 의도적으로 주입한 실패 시나리오
검증용이며 실제 회귀가 아니다(각 페이지 SUMMARY가 이미 0 FAIL로
확인).

`skin/skin-context-test.html`(실제 Supabase 필요, slug 로그인
전제)은 이번 환경에서 네트워크/로그인 없이 실행할 수 없어 생략했다
— 순수 코드 검토로 `assertContextShape()`가 이번에 추가된
`navigation.home`/`postCategories`/`bannerCategories`를 아직
검사하지 않는다는 점만 확인(신규 assertion 추가는 하지 않음, 이
파일은 실 데이터 스모크 전용이라 shape 회귀는 이미
`skin-page-context-test.html`이 담당).

`node --check skin/skin-context.js`로 구문 확인 완료.

---

## 9. Git commit/push 결과

이 문서 작성 시점 기준 아직 커밋하지 않았다(사용자 확인 후 커밋
예정).
