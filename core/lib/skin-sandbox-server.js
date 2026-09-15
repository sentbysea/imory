/* =========================================================
   SKIN SANDBOX - SERVER RULES (ES 모듈, Pages Function에서 import)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §D-4 / §F#10
   단계: SANDBOX-0

   functions/_middleware.js가 쓰는 순수 함수 모음이다. 여기에
   함수를 두는 이유가 두 가지 있다.

     1) functions/ 아래의 .js 파일은 **그 자체로 라우트가 된다**
        (functions/api/og/post.js -> /api/og/post). 헬퍼를 거기
        두면 원하지 않는 공개 엔드포인트가 하나 생긴다.
        core/lib/share-card.js를 functions/api/og/post.js가
        import하는 선례를 그대로 따른다.
     2) e2e가 **배포되는 그 함수 그대로** 돌릴 수 있다.

   ---------------------------------------------------------
   ★ 이 파일이 지키는 보안 계약 두 줄

     - sandbox origin에서는 **앱이 뜨지 않는다**. frame 문서와 그
       문서가 쓰는 스크립트 넷만 200이고 나머지는 전부 404다.
     - 메인 origin(imory.me)에서는 **frame 문서가 열리지 않는다**.

   이것이 왜 보안 장치인가: iframe에 주는
   `sandbox="allow-scripts allow-same-origin"`의 안전성은 전적으로
   "frame 문서의 origin이 부모와 실제로 다르다"에 달려 있다.
   두 호스트가 같은 파일 트리를 서빙하는 Cloudflare Pages에서는
   그 전제가 기본값으로 성립하지 않는다 — 여기서 만들어야 한다.

   ★ 실측 (2026-09-15)
     curl https://imory.me/skin/sandbox/frame.html
       -> 200 text/html   (_redirects의 SPA fallback이 index.html을 준다)
     즉 이 분기가 없으면 배포 즉시 메인 origin에서도 frame 경로가
     열린다. 아래 isSandboxFramePath()가 그것을 404로 막는다.
========================================================== */


/* =========================================================
   상수
========================================================== */

export const IMORY_MAIN_HOST =
  "imory.me";


/* =========================================================
   ★ frame 문서의 경로가 둘인 이유 — Cloudflare Pages의
     "HTML URL handling" (2026-09-15 배포 실측)

   Pages는 `/foo.html` 요청을 **308로 `/foo`에 리다이렉트**한다.
   실측:

     GET https://imory.me/admin/index.html
       -> 308 Permanent Redirect, Location: /admin/

   그래서 저장소에 `skin/sandbox/frame.html`이 있어도 실제로
   200 본문이 나오는 정본 주소는 확장자 없는 `/skin/sandbox/frame`
   이다. 처음 배포에서 frame 문서만 404였던 원인이 이것이다 —
   `next()`가 308을 돌려줬는데 handleSandboxHost가 "200이 아니면
   404"로 접어 버렸다. 로컬 테스트 서버는 파일을 그대로 줬기 때문에
   이 차이를 못 잡았다(지금은 e2e가 Pages와 같이 308을 흉내낸다).

   그래서:
     - 정본(iframe src가 쓰는 주소)  : /skin/sandbox/frame
     - 확장자 형태(308로 위로 보냄)  : /skin/sandbox/frame.html
   **둘 다** sandbox origin에서 허용하고, **둘 다** 메인 origin에서
   막는다. 하나만 막으면 막지 않은 쪽으로 frame 문서가 부모와 같은
   origin에 열린다.
========================================================== */

export const SANDBOX_FRAME_PATH =
  "/skin/sandbox/frame";


export const SANDBOX_FRAME_PATH_WITH_EXTENSION =
  "/skin/sandbox/frame.html";


/*
  sandbox origin에서 **나갈 수 있는 경로 전부**.
  allowlist다 — 새 파일이 필요하면 여기에 적어야 한다.
  (frame 문서가 실제로 로드하는 것과 정확히 일치해야 한다.)
*/

export const SANDBOX_ALLOWED_PATHS = [
  SANDBOX_FRAME_PATH,
  SANDBOX_FRAME_PATH_WITH_EXTENSION,
  "/core/lib/build-version.js",
  "/skin/sandbox/skin-sandbox-config.js",
  "/skin/sandbox/skin-sandbox-protocol.js",
  "/skin/sandbox/skin-sandbox-context.js",
  "/skin/sandbox/skin-sandbox-frame.js",

  /* =====================================================
     SANDBOX-1 — 렌더러. 공개 화면과 **같은 파일**이다.

     frame 문서가 skin/skin-render.js(ES 모듈)를 정적 import하고,
     그것이 다시 skin-css-validate.js와 core/content-width.js를
     끌어온다. sanitizeSkinHTML()/isSafeSkinUrl()은 classic
     script(skin/skin-sanitize.js)가 전역으로 준다.

     ★ 여기 적힌 것이 sandbox origin에서 나갈 수 있는 **전부**다.
       앱(index.html)·인증·supabase client·관리자·Studio는 여전히
       404다. 새 파일이 필요하면 이 목록에 적어야 한다 —
       "그냥 되던데"가 생기지 않게.
  ====================================================== */

  "/skin/skin-sanitize.js",
  "/skin/skin-render.js",
  "/skin/skin-css-validate.js",
  "/core/content-width.js",
  "/core/content-width.css"
];


/* =========================================================
   SANDBOX-1 — frame 문서가 실제로 필요로 하는 바깥 출처

   ★ script: css-tree 하나뿐이다.
     skin/skin-css-validate.js가 CSS 파서를 CDN에서 정적 import한다
     (그 파일 상단에 정확한 패키지/버전/URL이 적혀 있다). CSP 경로는
     **그 파일 하나**로 못박는다 — 호스트 전체를 여는 것이 아니라
     정확히 그 URL만 허용한다(CSP 경로는 `/`로 끝나지 않으면 정확히
     일치해야 한다).

     이것을 피하려면 CSS 검증을 건너뛰거나 부모가 대신 해야 하는데,
     둘 다 이번 라운드의 금지 항목이다(렌더러 검증 우회 금지).

   ★ img/font: 지금 HOME이 실제로 쓰는 출처만 연다.
     - 프로필 사진 / 배너 / imageSlot 값 -> Supabase Storage
     - /api/post-cover -> 메인 origin(= parentOrigins)
     - data: / blob: -> 에디터가 만든 인라인 이미지
     https: 전체를 열지 않는다. 지금 스킨 CSS는 임의의 https 이미지와
     웹폰트를 쓸 수 있으므로(skin/skin-sanitize.js isSafeSkinUrl),
     그런 스킨을 sandbox로 그리면 **그 이미지/폰트만** 빠진 채
     나온다 — 알고 남기는 차이다(설계 문서 §F#6 / 남은 차이).
     넓히려면 SANDBOX_SKIN_MEDIA_ORIGINS 환경변수에 출처를 적는다.

   ★ connect-src는 계속 'none'이다. 이 라운드에서도 열지 않는다.
========================================================== */

export const SANDBOX_CSS_PARSER_URL =
  "https://cdn.jsdelivr.net/npm/@eslint/css-tree@4.1.0/dist/csstree.esm.js";


/*
  core/lib/supabase-client.js의 SUPABASE_URL과 같은 값이다. 서버
  코드는 그 classic script를 import할 수 없어(전역 선언 파일이다)
  여기 적는다 — 프로젝트 URL이 바뀌면 두 곳을 함께 고친다.
*/

export const SANDBOX_SUPABASE_ORIGIN =
  "https://vtwcuvouyipohfonfukj.supabase.co";


/*
  production의 frame origin 호스트. 비어 있는 것이 기본값이다 —
  2026-09-15 실측으로 skin-frame.imory.me는 DNS에 존재하지 않는다
  (NXDOMAIN). 사람이 Cloudflare에서 커스텀 도메인을 붙인 뒤
  환경변수 SANDBOX_SKIN_HOST로 넣는다.

  비어 있는 동안 이 코드가 하는 일은 "메인 origin에서 frame.html을
  404로 막는다" 하나뿐이다 — 즉 지금 배포해도 새로 열리는 문이 없다.
*/

export const SANDBOX_SKIN_HOST_DEFAULT =
  "";


/* =========================================================
   resolveSandboxServerConfig(env)

   env로 배포별 값을 주입한다(로컬 e2e는 포트가 붙은 호스트를 쓴다).

     SANDBOX_SKIN_HOST            "skin-frame.imory.me" | "localhost:8958"
     SANDBOX_SKIN_PARENT_ORIGINS  공백으로 나눈 목록
     IMORY_EXTRA_HOSTS            공백으로 나눈 추가 메인 호스트
========================================================== */

export function resolveSandboxServerConfig(env) {

  const source =
    env || {};


  const split =
    (value) =>
      typeof value === "string" && value.trim()
        ? value.trim().split(/\s+/)
        : [];


  const givenSandboxHost =
    (
      typeof source.SANDBOX_SKIN_HOST === "string"
        ? source.SANDBOX_SKIN_HOST.trim()
        : ""
    ) || SANDBOX_SKIN_HOST_DEFAULT;


  /* =========================================================
     ★ 오설정 안전장치 — sandbox 호스트가 메인 호스트일 수 없다

     classifyImoryHost()는 sandbox를 **먼저** 본다(로컬 개발에서
     부모와 frame이 같은 hostname에 포트만 다르기 때문). 그래서
     누가 SANDBOX_SKIN_HOST를 "imory.me"로 잘못 넣으면 메인
     사이트 전체가 sandbox allowlist(5개 경로) 밖으로 밀려 404가
     된다 — 환경변수 오타 하나로 서비스가 통째로 죽는다.

     그런 값은 **없는 것으로 친다.** 그러면 최악이라도
     "sandbox 경로가 안 열린다"에서 끝나고, 메인은 오늘 그대로다.
     (환경변수를 **빼먹은** 경우도 같은 방향으로 안전하다 —
      sandbox 호스트가 없어져 frame origin 쪽이 404가 될 뿐이다.)
  ========================================================== */

  const sandboxHost =
    givenSandboxHost.toLowerCase() === IMORY_MAIN_HOST
      ? ""
      : givenSandboxHost;


  return {

    sandboxHost,

    parentOrigins:
      split(source.SANDBOX_SKIN_PARENT_ORIGINS).length
        ? split(source.SANDBOX_SKIN_PARENT_ORIGINS)
        : ["https://" + IMORY_MAIN_HOST],

    extraMainHosts:
      split(source.IMORY_EXTRA_HOSTS),

    /*
      SANDBOX-1 — img-src/font-src에 더할 출처(공백 구분). 비워 두면
      기본값(Supabase Storage + 부모 origin)만 쓴다. 위
      SANDBOX_SUPABASE_ORIGIN 주석 참고.
    */
    mediaOrigins:
      split(source.SANDBOX_SKIN_MEDIA_ORIGINS)

  };

}


/* =========================================================
   resolveSandboxMediaOrigins(config)

   img-src / font-src에 들어갈 출처 목록. 중복을 없애고 순서를
   고정한다(응답 헤더가 요청마다 달라지지 않게 — nonce만 달라야
   한다).
========================================================== */

export function resolveSandboxMediaOrigins(config) {

  const cfg =
    config || resolveSandboxServerConfig(null);


  const list =
    [SANDBOX_SUPABASE_ORIGIN]
      .concat(Array.isArray(cfg.parentOrigins) ? cfg.parentOrigins : [])
      .concat(Array.isArray(cfg.mediaOrigins) ? cfg.mediaOrigins : []);


  const seen =
    [];

  for (let i = 0; i < list.length; i += 1) {

    const value =
      typeof list[i] === "string" ? list[i].trim() : "";

    if (!value || seen.indexOf(value) !== -1) {
      continue;
    }

    seen.push(value);

  }


  return seen;

}


/* =========================================================
   isLocalDevHost(hostname)
========================================================== */

export function isLocalDevHost(hostname) {

  if (typeof hostname !== "string" || !hostname) {
    return false;
  }


  const host =
    hostname.toLowerCase();


  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );

}


/* =========================================================
   classifyImoryHost(url, config) -> "sandbox"|"pages-dev"|"main"|"unknown"

   ★ 판정 순서가 중요하다. sandbox를 **먼저** 본다 — 로컬 개발에서
     부모와 frame이 같은 hostname("localhost")에 포트만 다르기
     때문이다. 그래서 대조 대상은 hostname이 아니라 url.host
     (host:port)다. production에서는 443이라 포트가 붙지 않으므로
     그대로 "skin-frame.imory.me"와 일치한다.

   ★ "unknown"은 404다 (요구사항: 예상하지 않은 Host 헤더는 거부).
     Cloudflare Pages 프로젝트에 커스텀 도메인을 더 붙이면 그
     호스트도 여기에 적어야 한다(IMORY_EXTRA_HOSTS).
     ↳ 배포 전에 사람이 확인해야 하는 항목이다.
========================================================== */

export function classifyImoryHost(url, config) {

  const cfg =
    config || resolveSandboxServerConfig(null);

  const host =
    (url.host || "").toLowerCase();

  const hostname =
    (url.hostname || "").toLowerCase();


  if (cfg.sandboxHost && host === cfg.sandboxHost.toLowerCase()) {
    return "sandbox";
  }


  if (hostname.endsWith(".pages.dev")) {
    return "pages-dev";
  }


  if (hostname === IMORY_MAIN_HOST) {
    return "main";
  }


  if (isLocalDevHost(hostname)) {
    return "main";
  }


  for (let i = 0; i < cfg.extraMainHosts.length; i += 1) {

    if (host === cfg.extraMainHosts[i].toLowerCase()) {
      return "main";
    }

  }


  return "unknown";

}


/* =========================================================
   경로 판정
========================================================== */

export function isSandboxFramePath(pathname) {

  return (
    pathname === SANDBOX_FRAME_PATH ||
    pathname === SANDBOX_FRAME_PATH_WITH_EXTENSION
  );

}


export function isSandboxAllowedPath(pathname) {

  return SANDBOX_ALLOWED_PATHS.indexOf(pathname) !== -1;

}


/* =========================================================
   createSandboxNonce()

   요청마다 새로 만든다. 그래서 frame 문서 응답은 캐시하면 안 된다
   (아래 sandboxFrameHeaders가 no-store를 건다).
========================================================== */

export function createSandboxNonce() {

  const bytes =
    new Uint8Array(16);

  crypto.getRandomValues(bytes);


  let binary =
    "";

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }


  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

}


/* =========================================================
   injectSandboxNonce(html, nonce)

   frame.html의 **속성 없는** 인라인 블록에만 nonce를 끼운다.
   `<script src=...>`처럼 속성이 있는 태그는 건드리지 않는다
   (그건 script-src 'self'가 허용한다).

   frame.html 상단 주석에 "인라인 블록은 속성 없이 적어야 한다"고
   적어 두었다. 어기면 nonce가 안 들어가고 CSP가 그 블록을 막아
   프레임이 뜨지 않는다 — 조용히 약해지는 대신 요란하게 깨진다.
========================================================== */

export function injectSandboxNonce(html, nonce) {

  if (typeof html !== "string") {
    return html;
  }


  return html
    .replace(/<script>/g, '<script nonce="' + nonce + '">')
    .replace(/<style>/g, '<style nonce="' + nonce + '">');

}


/* =========================================================
   buildSandboxCsp(nonce, config)

   ★ SANDBOX-1. renderSkin()이 프레임 안으로 들어오면서 세 칸이
     넓어졌다. 어느 칸도 'unsafe-inline'/'unsafe-eval'로 열지 않았다.

   ① style-src — 'unsafe-inline' 대신 **nonce**로 해결했다.

     renderSkin()은 스킨 CSS를 document.createElement("style")로
     만들어 붙인다. 동적으로 만든 <style>도 style-src의 적용
     대상이다(2026-09-15 chromium 실측: nonce 없는 동적 <style>은
     적용되지 않고 "Applying inline style violates ..." 위반이
     난다). SANDBOX-0의 이 자리 주석은 "렌더러는 nonce를 모르므로
     'unsafe-inline'이 필요해진다"고 적었는데, 실제로는
     renderSkin()에 **선택 인자 styleNonce 하나**를 더하는 것으로
     끝났다(skin/skin-render.js). 넘기지 않는 기존 호출자의
     결과는 한 byte도 바뀌지 않는다.

     같은 실측에서 element.style.setProperty() 같은 **CSSOM 쓰기는
     막히지 않는다**는 것도 확인했다 — core/content-width.js의 폭
     계약이 프레임 안에서도 그대로 동작한다.

     ★ SANDBOX-3.1 (2026-09-15) — 이 자리에 원래 "setAttribute
     ("style", ...)는 막히지만 우리 코드 경로에 그런 호출이 없다"고
     적혀 있었다. SANDBOX-2가 POST 본문을 프레임에 넣으면서
     정확히 그 호출을 더했고(그리고 innerHTML 안의 style= 도),
     그때부터 본문의 Quote Preset 서식이 통째로 빠지고 있었다.

     **고친 방향은 CSP를 넓히는 것이 아니다.** style-src-attr에
     'unsafe-inline'을 더하면 두 엔진 모두 살아나지만(실측), 그
     순간 이 문서에 도달한 **모든** style 속성이 임의 CSS로
     적용된다 — 이 프레임이 존재하는 이유와 정면으로 어긋난다.

     대신 부모가 그 선언들을 검증해 **stylesheet 텍스트 하나**로
     바꿔 보내고, 프레임이 자기 nonce를 단 <style>에 넣는다
     (posts/style/posts-body-style-extract.js — 속성/값 allowlist,
      url()·image-set()·cross-fade() 계열은 통과하지 못한다).
     그래서 이 style-src 줄은 한 글자도 바뀌지 않았다.
     자세한 근거: IMORY_SANDBOX_SKIN_DESIGN.md §M.

     'self'가 함께 있는 이유: renderSkin()이
     core/content-width.css를 <link>로 건다.

   ② script-src — CSS 파서 하나. 호스트가 아니라 **그 URL**만.

     skin/skin-css-validate.js가 css-tree를 CDN에서 정적
     import한다(그 파일 상단에 패키지/버전/URL이 적혀 있다).
     CSS 검증을 건너뛰거나 부모가 대신 하는 것은 이번 라운드의
     금지 항목이라, 그 한 파일을 정확한 경로로 허용한다
     (CSP 경로는 슬래시로 끝나지 않으면 정확히 일치해야 한다).

     import map은 document.write로 만들어지는 **parser-inserted
     인라인 script**라 CSP 검사를 그대로 받는다 — frame.html이
     자기 nonce를 읽어 그 태그에 달아 준다(해시도 'unsafe-inline'도
     쓰지 않는다).

   ③ img-src / font-src — https: 전체가 아니라 **지금 쓰는 출처만**.

     HOME이 실제로 부르는 그림은 프로필/배너/imageSlot(Supabase
     Storage)과 /api/post-cover(메인 origin)뿐이고, 에디터가 만든
     data:/blob:이 더해진다. 목록은 resolveSandboxMediaOrigins()에
     있다.

     ★ 남은 차이: 스킨 CSS는 임의의 https 이미지·웹폰트를 쓸 수
       있다(skin/skin-sanitize.js isSafeSkinUrl은 https면 통과시킨다).
       그런 스킨을 sandbox로 그리면 그 그림/폰트만 빠진 채 나온다.
       알고 남기는 차이이고, 외부 자유 이미지·웹폰트 정책은 이후
       단계에서 명시적으로 정한다(설계 문서 §F#6).

   TODO(SANDBOX-5) — 저자 JS / 3D:
     - script-src 에 blob:  (저자 JS를 Blob URL ES 모듈로 주입)
     - GLB(3D 모델)는 보통 fetch()로 받는다 -> connect-src를 열어야
       한다. connect-src 'none'은 "iframe이 데이터를 어디로도 못
       보낸다"를 지탱하는 조항이라 **가장 늦게, 가장 좁게** 연다
       (예: 자산 전용 서브도메인 하나만). 지금 열지 않는다.
     - <model>/<canvas>/<video> 태그는 오늘 sanitizer가 통째로
       제거한다. 태그 allowlist 완화는 CSP와 별개의 결정이다
       (설계 문서 §F#7).
========================================================== */

export function buildSandboxCsp(nonce, config) {

  /*
    두 번째 인자는 SANDBOX-0에서 parentOrigins 배열이었다. 배열을
    그대로 주는 호출자도 계속 받는다 — frame-ancestors만 필요한
    경우가 있고, 그때 media 출처는 기본값을 쓴다.
  */

  const cfg =
    Array.isArray(config)
      ? { parentOrigins: config, mediaOrigins: [] }
      : (config || {});


  const parentOrigins =
    Array.isArray(cfg.parentOrigins) ? cfg.parentOrigins : [];


  const ancestors =
    parentOrigins.length
      ? parentOrigins.join(" ")
      : "'none'";


  const media =
    resolveSandboxMediaOrigins(cfg).join(" ");


  return [

    "default-src 'none'",

    /* frame.html의 인라인 부트스트랩 + import map + /skin/**의 허용
       목록 + CSS 파서 하나(위 주석 ②) */
    "script-src 'self' 'nonce-" + nonce + "' " + SANDBOX_CSS_PARSER_URL,

    /* frame.html의 인라인 <style> + renderSkin()의 동적 <style>(둘 다
       nonce) + core/content-width.css(<link>, 그래서 'self') */
    "style-src 'self' 'nonce-" + nonce + "'",

    /* 프로필·배너·imageSlot·대표 이미지. https: 전체가 아니다(위 ③) */
    "img-src data: blob: " + media,

    /* 웹폰트 — 지금은 self/data: 뿐이다(위 ③의 남은 차이) */
    "font-src 'self' data:",

    "media-src 'none'",

    /* ★ iframe이 데이터를 어디로도 못 보낸다. 유출 경로를 부모와의
       메시지 채널 하나로 좁히는 핵심 조항이다.

       배포 실측(2026-09-15): Cloudflare가 이 함수가 돌려준 HTML에
       Web Analytics beacon(`/cdn-cgi/.../beacon.min.js`)을 **나중에**
       끼워 넣는다. 스크립트 자체는 same-origin이라 'self'로 받지만,
       그 beacon이 `/cdn-cgi/rum`으로 보내려는 요청은 이 조항에
       막힌다 — 프레임 콘솔에 CSP 위반이 한 줄 남는다.
       그 한 줄은 고장이 아니라 이 조항이 일하고 있다는 증거다.
       분석을 살리자고 connect-src를 열지 않는다. */
    "connect-src 'none'",

    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",

    "form-action 'none'",
    "base-uri 'none'",

    /* ★ 남이 자기 사이트에 이 문서를 끼울 수 없다.
       X-Frame-Options 대신 이것을 쓴다(더 정밀하다). */
    "frame-ancestors " + ancestors,

    /*
      부모가 iframe에 거는 sandbox 속성과 같은 값을 헤더로도 건다.
      누가 이 문서를 최상위 탭으로 직접 열어도 같은 제약을 받는다.
      (allow-same-origin이 필요한 이유는
       skin/sandbox/skin-sandbox-host.js 상단 주석 참고.)
    */
    "sandbox allow-scripts allow-same-origin"

  ].join("; ");

}


/* =========================================================
   응답 헬퍼
========================================================== */

export function sandboxNotFoundResponse() {

  return new Response(
    "not found",
    {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );

}


export function sandboxFrameHeaders(baseHeaders, nonce, config) {

  const headers =
    new Headers(baseHeaders || {});

  /* config는 resolveSandboxServerConfig()의 결과다. SANDBOX-0에서는
     parentOrigins 배열이었고, buildSandboxCsp()가 둘 다 받는다. */

  headers.set(
    "Content-Security-Policy",
    buildSandboxCsp(nonce, config)
  );

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  headers.set(
    "Referrer-Policy",
    "no-referrer"
  );

  /*
    nonce가 요청마다 바뀌므로 이 문서는 캐시하면 안 된다.
    (자산은 여전히 ?v=APP_BUILD_VERSION으로 캐시된다.)
  */

  headers.set(
    "Cache-Control",
    "no-store"
  );

  headers.delete("content-length");
  headers.delete("etag");


  return headers;

}
