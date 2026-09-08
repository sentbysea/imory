/* =========================================================
   CORE - BUILD VERSION

   배포 단위 버전 값 하나와, 그 값을 URL에 붙여 자산을 불러오는
   loader 넷. 이 값이 이 프로젝트의 **유일한** 캐시 무효화 원천이다
   — 다른 파일에 문자열을 복사해 적지 않는다.

   새 배포에서 CSS/JS를 고쳤으면 아래 APP_BUILD_VERSION 하나만
   올린다.

   ---------------------------------------------------------
   ★ _headers의 no-cache는 CSS/JS에는 실제로 도달하지 않는다

   저장소의 _headers는 공개 화면 CSS/JS에 Cache-Control: no-cache를
   지정한다. 2026-09-07에 imory.me 응답을 직접 재어 보니 그 규칙이
   브라우저까지 도달하지 않았다:

     _headers에 있는 HTML  (/index.html)          -> no-cache          (DYNAMIC)
     _headers에 없는 HTML  (/admin/index.html)    -> (헤더 없음)        (DYNAMIC)
     _headers에 있는 CSS   (/posts/posts-base.css)-> max-age=14400     (REVALIDATED)
     _headers에 없는 JS    (/skin/skin-render.js) -> public, max-age=14400, must-revalidate

   HTML은 _headers대로 나오고 CSS/JS만 max-age=14400으로 덮인다.
   캐시를 우회하는 쿼리를 붙여 MISS를 강제해도 같다. 즉 _headers는
   정상 배포·적용되고 있고, CDN 쪽에서 **edge에 캐시되는 응답의
   Cache-Control만** 4시간짜리로 다시 쓴다(Cloudflare의 Browser
   Cache TTL / Cache Rules가 하는 일과 같은 모양이지만, 대시보드를
   볼 수 없어 단정하지는 않는다 — 확인할 화면은 CLAUDE.md 참고).

   그래서 **캐시 무효화를 실제로 해내는 장치는 URL의 ?v= 하나뿐**
   이다. _headers의 CSS/JS 규칙은 지워도 그만이지만, CDN 설정이
   고쳐지면 그때는 다시 유효해지므로 의도 표시로 남겨 둔다.

   ---------------------------------------------------------
   ★ 이 파일 자신은 ?t= 로 불러온다 (닭과 달걀)

   이 파일은 자기가 정의하는 값으로 자기 URL을 만들 수 없다. 예전에는
   고정 URL로 걸려 있었고, 위 CDN 규칙 때문에 최대 4시간 동안 옛 버전
   값을 읽었다 — 그러면 그 뒤의 ?v= 가 전부 옛 값이 되어 새 배포가
   통째로 무시된다("새 JS + 옛 CSS"의 진짜 원인).

   그래서 진입 문서들이 이 파일만 `?t=<Date.now()>`로 불러온다.
   Date.now()를 여기저기 뿌리는 것이 아니라 **이 한 파일에만** 쓴다 —
   나머지는 전부 ?v=APP_BUILD_VERSION이다. 진입 문서(HTML)는
   _headers의 no-cache가 실제로 먹히므로 항상 최신이고, 그 문서가
   매번 새 ?t= URL을 만들어 주므로 이미 캐시를 물고 있는 브라우저도
   평범한 새로고침 한 번으로 새 버전 값을 받는다(강력 새로고침이나
   4시간 대기가 필요 없다).

   비용은 페이지 로드마다 2~3KB짜리 요청 하나다.
========================================================== */

const APP_BUILD_VERSION = "2026-09-09-1";


/* =========================================================
   loadVersionedScripts(paths) — classic script
========================================================== */

function loadVersionedScripts(paths) {

  document.write(
    paths
      .map(
        (path) =>
          `<script src="${path}?v=${APP_BUILD_VERSION}"><\/script>`
      )
      .join("")
  );

}


/* =========================================================
   loadVersionedModules(paths) — <script type="module">

   classic script과 달리 모듈은 defer라 문서 파싱이 끝난 뒤에
   실행된다 — 위치를 그대로 두어도 실행 순서는 바뀌지 않는다.
   모듈이 **정적 import로 끌어오는** 파일까지는 이 함수가 닿지
   못한다(import 지정자는 문자열 리터럴이라 ?v=가 붙지 않는다) —
   그건 아래 writeVersionedImportMap()이 담당한다.
========================================================== */

function loadVersionedModules(paths) {

  document.write(
    paths
      .map(
        (path) =>
          `<script type="module" src="${path}?v=${APP_BUILD_VERSION}"><\/script>`
      )
      .join("")
  );

}


/* =========================================================
   loadVersionedStyles(paths)

   ★ 이 함수가 왜 필요한가(실사용자 버그의 실제 원인)

   CSS는 예전에 <link href="./posts/posts-base.css">처럼 버전 없이
   고정 URL로 걸려 있었고, CDN이 max-age=14400을 붙여 내려준다.
   그래서 배포 직후 최대 4시간 동안 "새 JS + 옛 CSS" 조합이
   실기기에서 실행될 수 있었다. JS가 붙이는 클래스의 의미가 CSS에만
   있는 경우(#postArea.post-area--skin-active { padding: 0 } 처럼)
   그 규칙이 통째로 없는 상태가 되어, published Skin의 POST/CATEGORY
   프레임만 legacy 여백(72px/24px, 모바일 68px/22px/86px)을 그대로
   뒤집어쓴 채 HOME보다 좁고 아래로 밀려 보였다 — HOME 쪽 규칙
   (.theme-mount--skin)은 한 배포 앞서 이미 캐시돼 있어 정상이었다.
   재현/확인 절차는 skin/skin-published-frame-e2e-test.mjs 참고.

   <link>를 document.write로 넣으므로 preload scanner의 선발견
   이득은 잃지만, 이 함수는 CSS 섹션이 원래 있던 그 자리(파서가
   그 지점을 지나는 순간)에서 동기적으로 실행되어 같은 순서로
   같은 위치에 삽입한다 — 로드 시작 시점이 사실상 동일하고
   FOUC도 생기지 않는다.
========================================================== */

function loadVersionedStyles(paths) {

  document.write(
    paths
      .map(
        (path) =>
          `<link rel="stylesheet" href="${path}?v=${APP_BUILD_VERSION}">`
      )
      .join("")
  );

}


/* =========================================================
   writeVersionedImportMap(absolutePaths)

   ES 모듈의 **정적 import만으로 도달하는** 파일에 ?v=를 붙인다.

     skin/skin-home.js?v=X   (script src — loader가 붙여 준다)
       └ import "./skin-render.js"        <- 여기서 ?v=가 끊긴다
           └ import "./skin-css-validate.js"

   import 지정자는 문자열 리터럴이라 실행 시점에 고칠 수 없다. 대신
   import map으로 "이 URL을 요청하면 저 URL로 가라"를 문서 차원에서
   지정한다. 상대 지정자("./skin-render.js")도 먼저 절대 URL로
   풀린 뒤 이 표와 대조되므로, 키는 **절대 경로**로 적는다.

   import map은 문서에 하나만 둘 수 있고, 그 문서의 첫 모듈이
   로드되기 전에 삽입되어야 한다 — 그래서 이 파일 바로 다음에
   부른다. 지원하지 않는 아주 오래된 브라우저는 이 표를 무시하고
   예전처럼 버전 없는 URL로 받는다(지금과 같은 동작, 더 나빠지지
   않는다).
========================================================== */

function writeVersionedImportMap(absolutePaths) {

  const imports = {};


  absolutePaths.forEach(
    (path) => {

      imports[path] =
        `${path}?v=${APP_BUILD_VERSION}`;

    }
  );


  document.write(
    `<script type="importmap">${
      JSON.stringify({ imports })
    }<\/script>`
  );

}
