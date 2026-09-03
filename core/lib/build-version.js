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

const APP_BUILD_VERSION = "2026-09-03-1";


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
