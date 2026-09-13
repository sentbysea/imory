/* =========================================================
   CATEGORY TYPES — 카테고리 타입과 페이지네이션 공용 상수
   (HIGHLIGHT-2)

   기준 문서: IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md §1 / §9

   왜 이 파일이 있는가
   ------------------
   "블로그당 하나만 둘 수 있는 타입"이 세 곳에 각각 적혀 있으면
   언젠가 서로 달라진다 — 관리 화면의 option 목록, Skin Context 의
   판정, 그리고 DB 의 partial unique index. DB 는 신뢰 경계이므로
   목록을 옮겨 올 수 없지만, **프런트 쪽 두 곳은 이 파일 하나만
   보게** 할 수 있다. DB predicate 와 이 파일의 목록이 같은지는
   supabase/highlight2-migration-test.mjs 의 [contract] 절이 두
   파일의 글자를 직접 비교해 확인한다.

   ★ 'memo' 는 여기 없다
   본문에서 고른 문장 + 그 위의 짧은 주석의 공식 이름은 highlight 다.
   'memo' 라는 이름은 나중에 사용자가 하이라이트와 무관하게 직접
   짧은 글을 쓰는 별개 콘텐츠 타입을 위해 비워 둔다. 아직 존재하지
   않는 타입('memo', 'guest')을 미리 목록에 넣지 않는다 — 넣는
   순간 그 값을 가진 행이 먼저 생겨 버린다.

   ★ 페이지 번호 계산도 여기 있다
   post 와 gallery 가 같은 계산기를 쓴다(요구사항 9). 로마 숫자
   변환을 스킨이나 관리 화면이 각자 구현하지 않게, 최종 label 을
   만드는 함수도 이 파일에 둔다 — Skin Context 는 완성된 label 만
   내보낸다.

   classic script. 의존 없음. 함수/상수 선언이 그대로 전역에
   노출된다(이 저장소의 다른 core/lib/*.js 와 같은 방식).
========================================================== */


/* 지금 존재하는 카테고리 타입 전부. 관리 화면 드롭다운의 순서이기도 하다. */

const CATEGORY_TYPES =
  ["post", "gallery", "banner", "highlight"];


/*
  블로그당 하나만 둘 수 있는 타입.

  DB 쪽 짝: categories_singleton_type_idx
  (supabase/migrations/20260913160000_*.sql)

  나중에 'guest' 가 생기면 여기에 한 줄, 그리고 그 index 를
  다시 만드는 후속 migration 한 줄이면 된다.
*/

const SINGLETON_CATEGORY_TYPES =
  ["banner", "highlight"];


/* 관리 화면과 안내 문구에 쓰는 한국어 이름 */

const CATEGORY_TYPE_LABELS =
  {
    post: "글",
    gallery: "갤러리",
    banner: "배너",
    highlight: "하이라이트"
  };


/* 글이 들어갈 수 있는 타입 — 타입 변경 시 목적지 후보이기도 하다 */

const POST_BEARING_CATEGORY_TYPES =
  ["post", "gallery"];


function normalizeCategoryType(
  value
) {

  const type =
    String(value || "").trim();


  return (
    CATEGORY_TYPES.includes(type)
      ? type
      : "post"
  );

}


function isSingletonCategoryType(
  value
) {

  return SINGLETON_CATEGORY_TYPES.includes(
    normalizeCategoryType(value)
  );

}


function isPostBearingCategoryType(
  value
) {

  return POST_BEARING_CATEGORY_TYPES.includes(
    normalizeCategoryType(value)
  );

}


function categoryTypeLabel(
  value
) {

  const type =
    normalizeCategoryType(value);


  return (
    CATEGORY_TYPE_LABELS[type] ||
    type
  );

}


/* =========================================================
   페이지네이션 공용 계약 (요구사항 9)
========================================================== */

const PAGINATION_STYLES =
  ["decimal", "roman_lower"];


const PAGINATION_STYLE_LABELS =
  {
    decimal: "숫자 (1 2 3)",
    roman_lower: "로마자 (i ii iii)"
  };


const PAGINATION_DEFAULT_STYLE =
  "decimal";


const PAGINATION_DEFAULT_WINDOW_SIZE =
  7;


/*
  DB 의 categories_pagination_window_size_check 와 같은 범위.
  1 이면 "현재 페이지 하나만", 25 는 화면에 줄바꿈 없이 담기는
  현실적인 상한이다.
*/

const PAGINATION_MIN_WINDOW_SIZE =
  1;

const PAGINATION_MAX_WINDOW_SIZE =
  25;


/* DB 의 categories_page_size_check 와 같은 범위 */

const CATEGORY_MIN_PAGE_SIZE =
  1;

const CATEGORY_MAX_PAGE_SIZE =
  100;


const CATEGORY_DEFAULT_PAGE_SIZE =
  12;


/* 관리 화면 드롭다운이 권하는 값들 — 제약이 아니라 편의다 */

const CATEGORY_PAGE_SIZE_CHOICES =
  [5, 6, 10, 12, 15, 18, 20, 24, 30, 50];


function normalizePaginationStyle(
  value
) {

  const style =
    String(value || "").trim();


  return (
    PAGINATION_STYLES.includes(style)
      ? style
      : PAGINATION_DEFAULT_STYLE
  );

}


function normalizePaginationWindowSize(
  value
) {

  const size =
    Math.floor(Number(value));


  if (!Number.isFinite(size)) {

    return PAGINATION_DEFAULT_WINDOW_SIZE;

  }


  return Math.min(
    PAGINATION_MAX_WINDOW_SIZE,
    Math.max(PAGINATION_MIN_WINDOW_SIZE, size)
  );

}


function normalizeCategoryPageSize(
  value
) {

  const size =
    Math.floor(Number(value));


  if (!Number.isFinite(size)) {

    return CATEGORY_DEFAULT_PAGE_SIZE;

  }


  return Math.min(
    CATEGORY_MAX_PAGE_SIZE,
    Math.max(CATEGORY_MIN_PAGE_SIZE, size)
  );

}


/* =========================================================
   formatPaginationLabel(number, style) -> string

   스킨은 로마 숫자를 계산하지 않는다 — 플랫폼이 완성된 글자를
   Context 에 넣어 준다(요구사항 9).

   로마자는 소문자만 쓴다(i ii iii ... ). 1..3999 밖의 값은
   변환식이 없으므로 숫자 그대로 둔다 — page_size 상한(100)과
   현실적인 글 수에서 닿을 수 없는 범위지만, 화면이 빈칸이
   되는 것보다 숫자가 나오는 편이 낫다.
========================================================== */

const ROMAN_NUMERAL_STEPS =
  [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"]
  ];


function toLowerRomanNumeral(
  value
) {

  let remaining =
    Math.floor(Number(value));


  if (
    !Number.isFinite(remaining) ||
    remaining < 1 ||
    remaining > 3999
  ) {

    return String(value);

  }


  let out =
    "";


  for (const [amount, glyph] of ROMAN_NUMERAL_STEPS) {

    while (remaining >= amount) {

      out += glyph;

      remaining -= amount;

    }

  }


  return out;

}


function formatPaginationLabel(
  number,
  style
) {

  return (
    normalizePaginationStyle(style) === "roman_lower"
      ? toLowerRomanNumeral(number)
      : String(number)
  );

}


/* =========================================================
   buildPaginationWindow(currentPage, totalPages, windowSize)
     -> { pages: number[], hasLeadingEllipsis, hasTrailingEllipsis }

   "한 번에 표시할 페이지 번호 개수"를 지금 페이지 주변으로
   잘라 낸다. 처음·중간·마지막에서 각각 창이 붙어 다니지 않고
   **끝에 닿으면 멈춘다** — 1페이지에서 [1..7], 마지막에서
   [n-6..n] 이 되어 늘 같은 개수가 나온다.

   totalPages 가 windowSize 보다 작으면 전부 낸다(잘린 쪽 표시 없음).
========================================================== */

function buildPaginationWindow(
  currentPage,
  totalPages,
  windowSize
) {

  const total =
    Math.max(1, Math.floor(Number(totalPages) || 1));

  const size =
    Math.min(
      total,
      normalizePaginationWindowSize(windowSize)
    );

  const page =
    Math.min(
      Math.max(1, Math.floor(Number(currentPage) || 1)),
      total
    );


  /* 지금 페이지를 가운데 두고 시작점을 잡은 뒤 양 끝으로 밀어 넣는다 */

  let start =
    page - Math.floor((size - 1) / 2);

  if (start < 1) {

    start = 1;

  }

  if (start + size - 1 > total) {

    start = total - size + 1;

  }


  const pages =
    [];

  for (let n = start; n <= start + size - 1; n += 1) {

    pages.push(n);

  }


  return {

    pages,

    hasLeadingEllipsis:
      start > 1,

    hasTrailingEllipsis:
      start + size - 1 < total

  };

}


if (typeof window !== "undefined") {

  window.CATEGORY_TYPES = CATEGORY_TYPES;
  window.SINGLETON_CATEGORY_TYPES = SINGLETON_CATEGORY_TYPES;
  window.CATEGORY_TYPE_LABELS = CATEGORY_TYPE_LABELS;
  window.POST_BEARING_CATEGORY_TYPES = POST_BEARING_CATEGORY_TYPES;

  window.normalizeCategoryType = normalizeCategoryType;
  window.isSingletonCategoryType = isSingletonCategoryType;
  window.isPostBearingCategoryType = isPostBearingCategoryType;
  window.categoryTypeLabel = categoryTypeLabel;

  window.PAGINATION_STYLES = PAGINATION_STYLES;
  window.PAGINATION_STYLE_LABELS = PAGINATION_STYLE_LABELS;
  window.PAGINATION_DEFAULT_WINDOW_SIZE = PAGINATION_DEFAULT_WINDOW_SIZE;
  window.CATEGORY_PAGE_SIZE_CHOICES = CATEGORY_PAGE_SIZE_CHOICES;
  window.CATEGORY_DEFAULT_PAGE_SIZE = CATEGORY_DEFAULT_PAGE_SIZE;

  window.normalizePaginationStyle = normalizePaginationStyle;
  window.normalizePaginationWindowSize = normalizePaginationWindowSize;
  window.normalizeCategoryPageSize = normalizeCategoryPageSize;
  window.formatPaginationLabel = formatPaginationLabel;
  window.buildPaginationWindow = buildPaginationWindow;

}
