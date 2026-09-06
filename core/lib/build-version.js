/* =========================================================
   CORE - BUILD VERSION

   인증/공개 홈 부트스트랩 핵심 스크립트(core/lib/supabase-client.js,
   core/lib/reserved-slugs.js, core/lib/site-path.js,
   core/lib/auth-shared.js, core/lib/invite-token.js,
   home/site-owner.js)의 캐시를
   무효화하기 위한 배포 단위 버전 값. index.html/auth/index.html의
   loadVersionedScripts() 호출이 이 값을 읽어 위 스크립트들을
   <script src="...?v=APP_BUILD_VERSION">로 불러온다.

   새 배포 때마다 아래 문자열 하나만 올리면 된다 — 이 값을 다른
   파일에 따로 복사해 적지 않는다. 요청마다 바뀌는 Date.now()
   방식은 쓰지 않는다(posts/sua 쪽 기존 cache-buster와는 별개이며
   그쪽은 이 작업에서 건드리지 않는다).

   이 파일 자체는 지금 버전 관리되지 않은 채(고정 src) 로드된다
   — 그래서 이 파일이 브라우저에 이미 캐시돼 있으면 새 버전 값이
   그 클라이언트에는 조금 늦게 반영될 수 있다. 그래도 지금까지는
   대상 5개 파일 전부가 무조건 무기한 캐시될 수 있었던 것에 비하면
   개선이다.
========================================================== */

const APP_BUILD_VERSION = "2026-09-07-1";


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
   loadVersionedStyles(paths)

   ★ 이 함수가 왜 필요한가(실사용자 버그의 실제 원인)

   공개 홈의 스크립트는 전부 캐시가 무효화된다 — core/lib/*.js와
   home/site-owner.js는 위 loadVersionedScripts()의 ?v=,
   posts.html과 posts/** 스크립트는 index.html의 ?v=Date.now()를
   쓴다. 그런데 CSS는 지금까지 <link href="./posts/posts-base.css">
   처럼 버전 없이 고정 URL로 걸려 있었고, Cloudflare가 이 파일들에
   Cache-Control: public, max-age=14400을 붙여 내려준다.

   그래서 배포 직후 최대 4시간 동안 "새 JS + 옛 CSS" 조합이
   실기기에서 실행될 수 있다. JS가 붙이는 클래스의 의미가 CSS에만
   있는 경우(#postArea.post-area--skin-active { padding: 0 } 처럼)
   그 규칙이 통째로 없는 상태가 되어, published Skin의 POST/CATEGORY
   프레임만 legacy 여백(72px/24px, 모바일 68px/22px/86px)을 그대로
   뒤집어쓴 채 HOME보다 좁고 아래로 밀려 보였다 — HOME 쪽 규칙
   (.theme-mount--skin)은 한 배포 앞서 이미 캐시돼 있어 정상이었다.
   재현/확인 절차는 skin/skin-published-frame-e2e-test.mjs 참고.

   CSS도 스크립트와 동일하게 ?v=APP_BUILD_VERSION으로 건다. 위
   버전 값을 한 번 올리면 URL 자체가 바뀌므로 이미 캐시를 물고 있는
   기기도 즉시 새 CSS를 받는다. 앞으로 이 값을 깜빡 잊고 안 올려도
   같은 문제가 재발하지 않도록, _headers에서 공개 홈 CSS에
   Cache-Control: no-cache(= 쓰기 전에 재검증)를 함께 지정한다 —
   두 장치가 서로를 보완한다.

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
