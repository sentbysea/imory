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
  "/skin/sandbox/skin-sandbox-frame.js"
];


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
      split(source.IMORY_EXTRA_HOSTS)

  };

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
   buildSandboxCsp(nonce, parentOrigins)

   ★ SANDBOX-0의 초안이다. 빈 프레임을 띄우는 데 필요한 것만 연다.

   TODO(SANDBOX-1) — renderSkin()이 들어오면 필요해지는 것:
     - style-src 에 'unsafe-inline'
       renderSkin()은 스킨 CSS를 document.createElement("style")로
       만들어 붙인다. 동적으로 만든 <style> 요소도 style-src의
       적용 대상이라 nonce 없이는 막힌다. 그 요소에 nonce를 달
       방법이 없으므로(렌더러는 nonce를 모른다) 'unsafe-inline'이
       필요해진다. **메인 origin에 그런 CSP를 줄 수는 없다 —
       이것이 별도 sandbox origin이 필요한 이유 그 자체다.**
     - img-src  에 https: data: blob:      (스킨 이미지 · imageSlot)
     - font-src 에 https: data:            (스킨 웹폰트)
       오늘 skin/skin-sanitize.js의 isSafeSkinUrl()이 이미 https만
       허용하므로 호스트 allowlist는 하지 않는다(하면 기존 스킨이
       깨진다 — 설계 문서 §F#6).
     - script-src 에 인라인 허용 하나(import map)
       ES 모듈(skin-render.js)을 들이면 <script type="importmap">
       인라인 블록이 생긴다. nonce로 덮을 수 있으면 nonce로 덮고,
       안 되면 그 블록만 해시로 허용한다. 'unsafe-inline'으로 열지
       않는다.

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

export function buildSandboxCsp(nonce, parentOrigins) {

  const ancestors =
    Array.isArray(parentOrigins) && parentOrigins.length
      ? parentOrigins.join(" ")
      : "'none'";


  return [

    "default-src 'none'",

    /* frame.html의 인라인 부트스트랩 + /skin/sandbox/*.js */
    "script-src 'self' 'nonce-" + nonce + "'",

    /* frame.html의 인라인 <style> 하나. TODO(SANDBOX-1) 위 주석 */
    "style-src 'nonce-" + nonce + "'",

    /* TODO(SANDBOX-1): 스킨 이미지 -> https: data: blob: */
    "img-src 'none'",

    /* TODO(SANDBOX-1): 스킨 웹폰트 -> https: data: */
    "font-src 'none'",

    "media-src 'none'",

    /* ★ iframe이 데이터를 어디로도 못 보낸다. 유출 경로를 부모와의
       메시지 채널 하나로 좁히는 핵심 조항이다. */
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


export function sandboxFrameHeaders(baseHeaders, nonce, parentOrigins) {

  const headers =
    new Headers(baseHeaders || {});

  headers.set(
    "Content-Security-Policy",
    buildSandboxCsp(nonce, parentOrigins)
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
