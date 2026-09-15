/* =========================================================
   SKIN SANDBOX - CONFIG (classic script)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §B-1 / §D-4
   단계: SANDBOX-1 (별도 origin 프레임에 HOME 렌더)

   이 파일은 sandbox 스킨 경로의 **유일한 기능 플래그**이자
   **유일한 origin 상수**다. 다른 파일이 origin 문자열을 직접
   적지 않는다 — 한 곳만 고치면 배포 구성이 바뀌도록.

   ---------------------------------------------------------
   ★ 스위치는 isSandboxSkinEnabled() 하나이고, 두 갈래다.

   (A) production 호스트 — 켜는 방법은 **이 파일을 고쳐 배포하는
       것뿐**이다. 주소창 쿼리도, localStorage도 보지 않는다.

         1) hostname 이 SANDBOX_SKIN_ENABLED_HOSTS 에 있는가
         2) 지금 보고 있는 블로그의 slug(경로 첫 칸)가
            SANDBOX_SKIN_ENABLED_SLUGS 에 있는가

       둘 다 통과해야 true다. 그래서 2026-09-15 현재
       https://imory.me/test1 에서만 켜지고, imory.me 의 다른
       블로그는 ?sandboxSkin=1 을 붙이든 말든 오늘 그대로다.
       (slug 목록이 비면 그 호스트 전체가 꺼진다 — 실수로 전면
        공개되는 방향이 아니라 꺼지는 방향으로 넘어진다.)

   (B) 로컬 개발 호스트(localhost / 127.0.0.1 / [::1]) — 여기서만
       ?sandboxSkin=1 · localStorage["imory.sandboxSkin"]="1" 로
       켠다. e2e 하네스가 쓰는 길이고, 공개 배포에는 이 분기가
       닿지 않는다(판정이 런타임 hostname 기준이므로).

   ★ renderMode 와의 관계

   이 플래그가 켜졌다고 모든 스킨이 프레임에 들어가지 않는다.
   프레임을 쓰는 것은 SkinPackage 가 renderMode:"sandbox" 인
   경우뿐이고(skin/skin-home.js), renderMode 가 없거나 "native"
   인 스킨은 이 파일과 무관하게 오늘과 같은 경로로 그려진다.

   ---------------------------------------------------------
   ★ frame origin

   SANDBOX_SKIN_PRODUCTION_ORIGIN 은 배포된 커스텀 도메인이다.
   비어 있으면 resolveSandboxSkinFrameOrigin()이 ""를 돌려주고,
   host 모듈은 그것을 보고 **iframe을 만들지 않는다**(조용한 폴백).

   로컬 개발에서는 부모와 frame이 **다른 포트**여야 origin이 갈린다
   (같은 localhost라도 포트가 다르면 다른 origin이다). 그 값은
   ?sandboxSkinOrigin= 로 준다 — 단, (B)의 dev 호스트에서만,
   그리고 준 값 자체도 dev 호스트일 때만 받는다.
========================================================== */


/* =========================================================
   상수
========================================================== */

/*
  ★ 확장자가 없다. Cloudflare Pages는 `/foo.html`을 308로 `/foo`에
  보낸다(2026-09-15 배포 실측 — core/lib/skin-sandbox-server.js
  주석에 근거). 정본 주소를 쓰면 iframe이 리다이렉트를 한 번 덜
  탄다. `.html` 주소도 계속 열리기는 한다(308을 거쳐서).
*/

var SANDBOX_SKIN_FRAME_PATH =
  "/skin/sandbox/frame";


/*
  production frame origin.

  2026-09-15: Cloudflare Pages 커스텀 도메인 `skin-frame.imory.me`가
  Active가 되어 값을 채웠다(그 전에는 빈 문자열이었다 — DNS에
  없었으므로).

  ★ 이 값이 채워졌다고 sandbox 경로가 켜지는 것이 아니다.
  스위치는 어디까지나 isSandboxSkinEnabled()이다. 이 상수는
  "플래그가 켜졌을 때 어디로 띄우는가"만 정한다.
*/

var SANDBOX_SKIN_PRODUCTION_ORIGIN =
  "https://skin-frame.imory.me";


/*
  frame 문서가 신뢰할 부모 origin. frame은 **자기가 가진 이 값**만
  쓴다 — 부모가 메시지로 알려 준 값을 쓰지 않는다(공격자가 값을
  심을 수 있는 경로를 만들지 않기 위해서다).
*/

var SANDBOX_SKIN_PRODUCTION_PARENT_ORIGINS =
  [
    "https://imory.me"
  ];


/*
  production에서 플래그를 켤 호스트. 여기 없는 호스트에서는 아래
  slug 목록이 무엇이든 sandbox 경로가 열리지 않는다.
*/

var SANDBOX_SKIN_ENABLED_HOSTS =
  [
    "imory.me"
  ];


/*
  ★ production에서 sandbox 경로를 쓸 블로그 slug(경로 첫 칸).

  2026-09-15: 테스트 계정 test1 하나. https://imory.me/test1 의
  HOME만 프레임을 쓰고, imory.me 의 다른 블로그는 오늘 그대로다.
  (그 slug의 스킨이 renderMode:"sandbox"일 때만이다 — 그 판정은
   skin/skin-home.js 가 한다.)

  ★ 왜 DB 컬럼이 아니라 이 배열인가

  "누가 이 실험을 받는가"는 블로그 주인이 고르는 설정이 아니라
  **배포하는 사람이 고르는 것**이다. 지금 단계에서 사용자 설정으로
  만들면 되돌릴 때도 migration이 필요해진다. 이 배열은 배포 한
  번으로 켜고 끈다.

  비어 있으면 production 전체가 꺼진다(넘어지는 방향이 "꺼짐"이다).
  slug는 소문자로 적는다 — 비교 전에 경로를 소문자로 만든다.
*/

var SANDBOX_SKIN_ENABLED_SLUGS =
  [
    "test1"
  ];


var SANDBOX_SKIN_OPT_IN_QUERY_KEY =
  "sandboxSkin";

var SANDBOX_SKIN_OPT_IN_STORAGE_KEY =
  "imory.sandboxSkin";

var SANDBOX_SKIN_DEV_ORIGIN_QUERY_KEY =
  "sandboxSkinOrigin";


/* =========================================================
   isSandboxSkinDevHost(hostname)

   "로컬 개발 호스트인가". 여기에 해당하지 않는 hostname은
   production 취급이다 — 즉 localhost 신뢰가 배포 번들에
   섞여 나가지 않는다(판정이 런타임 hostname 기준이므로).
========================================================== */

function isSandboxSkinDevHost(hostname) {

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
   isSandboxSkinFlagHost(hostname)

   "이 호스트에서 플래그를 켜는 것이 허용되는가" — 첫 관문.
   여기를 통과한 뒤 production은 slug를, dev 호스트는 opt-in을 본다.
========================================================== */

function isSandboxSkinFlagHost(hostname) {

  if (isSandboxSkinDevHost(hostname)) {
    return true;
  }


  if (typeof hostname !== "string" || !hostname) {
    return false;
  }


  return SANDBOX_SKIN_ENABLED_HOSTS.indexOf(
    hostname.toLowerCase()
  ) !== -1;

}


/* =========================================================
   readSandboxSkinOptIn(win) -> boolean

   ★ 로컬 개발 호스트 전용 관문이다. isSandboxSkinEnabled()는
   dev 호스트일 때만 이 함수를 부른다 — production에서는 쿼리도
   localStorage도 보지 않는다.

   localStorage는 없거나 던질 수 있다(사생활 보호 모드 등) —
   던지면 "opt-in 없음"으로 본다.
========================================================== */

function readSandboxSkinOptIn(win) {

  const w =
    win || (typeof window !== "undefined" ? window : null);

  if (!w || !w.location) {
    return false;
  }


  try {

    const params =
      new URLSearchParams(w.location.search || "");

    if (params.get(SANDBOX_SKIN_OPT_IN_QUERY_KEY) === "1") {
      return true;
    }

  }

  catch (err) {
    /* 주소를 못 읽으면 opt-in 없음 */
  }


  try {

    if (
      w.localStorage &&
      w.localStorage.getItem(SANDBOX_SKIN_OPT_IN_STORAGE_KEY) === "1"
    ) {
      return true;
    }

  }

  catch (err) {
    /* 저장소 접근이 막혀 있으면 opt-in 없음 */
  }


  return false;

}


/* =========================================================
   readSandboxSkinSlug(win) -> "" | "test1"

   지금 문서가 보고 있는 블로그의 slug. 공개 주소가 /:slug,
   /:slug/post/:id 꼴이므로(core/lib/site-path.js) 경로의 첫 칸이
   곧 slug다.

   ★ 왜 getSiteOwnerSlugFromPath()를 부르지 않는가

   그 함수는 classic script 전역이고 RESERVED_SLUGS 로드 순서에
   묶여 있다. 이 파일은 node 단위 테스트에서도 그대로 읽히는
   독립 모듈이라 그 사슬을 끌고 오지 않는다. 여기서 필요한 것은
   "첫 칸이 허용 목록에 있는가" 하나뿐이고, 예약어(admin 등)는
   어차피 목록에 없으므로 결과가 같다.
========================================================== */

function readSandboxSkinSlug(win) {

  const w =
    win || (typeof window !== "undefined" ? window : null);

  if (!w || !w.location || typeof w.location.pathname !== "string") {
    return "";
  }


  const segments =
    w.location.pathname
      .split("/")
      .filter(function (part) { return part !== ""; });


  return (segments[0] || "").toLowerCase();

}


/* =========================================================
   isSandboxSkinEnabledSlug(slug) -> boolean

   목록이 비어 있으면 false다 — "아무 제한 없음"이 아니라
   "아무도 아님"이다.
========================================================== */

function isSandboxSkinEnabledSlug(slug) {

  if (typeof slug !== "string" || !slug) {
    return false;
  }


  return SANDBOX_SKIN_ENABLED_SLUGS.indexOf(
    slug.toLowerCase()
  ) !== -1;

}


/* =========================================================
   isSandboxSkinEnabled(win) -> boolean

   ★ 이 함수 하나가 sandbox 경로 전체의 스위치다.

   production:  호스트 allowlist + slug allowlist (파일을 고쳐야
                바뀐다 — 쿼리·localStorage를 보지 않는다)
   dev 호스트:  ?sandboxSkin=1 · localStorage opt-in
========================================================== */

function isSandboxSkinEnabled(win) {

  const w =
    win || (typeof window !== "undefined" ? window : null);

  if (!w || !w.location) {
    return false;
  }


  if (!isSandboxSkinFlagHost(w.location.hostname)) {
    return false;
  }


  /*
    로컬 개발에서는 하네스가 slug 없는 경로(/skin/...-test.html)에
    있으므로 slug로 가를 수 없다. 대신 명시적 opt-in을 요구한다.
  */

  if (isSandboxSkinDevHost(w.location.hostname)) {
    return readSandboxSkinOptIn(w) === true;
  }


  /*
    ★ production. 여기서부터 opt-in 신호는 아예 읽지 않는다 —
    imory.me 방문자가 주소에 무엇을 붙여도 자기 블로그를 sandbox
    경로로 밀어 넣을 수 없다.
  */

  return isSandboxSkinEnabledSlug(
    readSandboxSkinSlug(w)
  );

}


/* =========================================================
   resolveSandboxSkinFrameOrigin(win) -> "" | "https://..."

   빈 문자열이면 "아직 frame origin이 없다" = sandbox 경로를
   쓰지 않는다. 절대 부모 자신의 origin으로 폴백하지 않는다 —
   그러면 same-origin이 되어 격리가 통째로 사라진다.
========================================================== */

function resolveSandboxSkinFrameOrigin(win) {

  const w =
    win || (typeof window !== "undefined" ? window : null);

  if (!w || !w.location) {
    return "";
  }


  /*
    로컬 개발: 부모와 frame이 다른 포트여야 origin이 갈린다.
    dev 호스트에서만, 그리고 **받는 값도 dev 호스트일 때만**
    받는다. production 문서에서는 이 분기 자체를 타지 않는다.
  */

  if (isSandboxSkinDevHost(w.location.hostname)) {

    let given =
      "";

    try {

      given =
        new URLSearchParams(w.location.search || "")
          .get(SANDBOX_SKIN_DEV_ORIGIN_QUERY_KEY) || "";

    }

    catch (err) {
      given = "";
    }


    if (given) {

      let parsed =
        null;

      try {
        parsed = new URL(given);
      }
      catch (err) {
        parsed = null;
      }


      if (
        parsed &&
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        isSandboxSkinDevHost(parsed.hostname) &&
        parsed.origin !== w.location.origin
      ) {

        return parsed.origin;

      }

    }


    /*
      dev 호스트에서 쓸 만한 dev frame origin이 없으면 여기서 끝낸다.
      production 상수로 흘러가지 않는다 — 로컬 부모가 배포된 frame을
      띄우면 그 frame의 부모 allowlist(= https://imory.me)와 CSP
      frame-ancestors 양쪽에 걸려 조용히 실패할 뿐이고, 원인을 찾기
      어려운 형태로 실패한다. 차라리 "frame origin 없음"이 낫다.
    */

    return "";

  }


  if (typeof SANDBOX_SKIN_PRODUCTION_ORIGIN !== "string") {
    return "";
  }


  if (SANDBOX_SKIN_PRODUCTION_ORIGIN === w.location.origin) {

    /*
      설정 실수 방어: frame origin이 부모와 같아지면 격리가
      없어진다(그 상태에서 allow-same-origin + allow-scripts는
      iframe이 자기 sandbox 속성을 지울 수 있는 위험한 조합이다 —
      설계 문서 §D-4). 그럴 바에는 sandbox 경로를 끈다.
    */

    return "";

  }


  return SANDBOX_SKIN_PRODUCTION_ORIGIN;

}


/* =========================================================
   resolveSandboxSkinParentOrigins(win) -> string[]

   frame 문서가 부른다. "누가 나에게 말을 걸어도 되는가".
========================================================== */

function resolveSandboxSkinParentOrigins(win) {

  const w =
    win || (typeof window !== "undefined" ? window : null);

  if (!w || !w.location) {
    return [];
  }


  if (isSandboxSkinDevHost(w.location.hostname)) {

    /*
      로컬 개발에서만. 부모 포트를 미리 알 수 없으므로
      "dev 호스트의 http(s) origin"을 신뢰한다. 이 분기는
      frame 문서 자신이 dev 호스트일 때만 열린다 — 배포된
      frame origin(skin-frame.imory.me)에서는 아래 production
      목록만 쓴다.
    */

    return [
      "__imory_dev_hosts__"
    ];

  }


  return SANDBOX_SKIN_PRODUCTION_PARENT_ORIGINS.slice();

}


/* =========================================================
   isAllowedSandboxParentOrigin(origin, allowList)

   resolveSandboxSkinParentOrigins()가 돌려준 목록과 대조한다.
   "__imory_dev_hosts__" 토큰은 dev 호스트 origin 전체를 뜻한다.
========================================================== */

function isAllowedSandboxParentOrigin(origin, allowList) {

  if (typeof origin !== "string" || !origin || origin === "null") {
    return false;
  }


  const list =
    Array.isArray(allowList) ? allowList : [];


  for (let i = 0; i < list.length; i += 1) {

    const entry =
      list[i];

    if (entry === "__imory_dev_hosts__") {

      let parsed =
        null;

      try {
        parsed = new URL(origin);
      }
      catch (err) {
        parsed = null;
      }

      if (
        parsed &&
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        isSandboxSkinDevHost(parsed.hostname)
      ) {
        return true;
      }

      continue;

    }


    if (entry === origin) {
      return true;
    }

  }


  return false;

}


/* =========================================================
   buildSandboxSkinFrameUrl(frameOrigin, buildVersion)

   frame 문서 주소. 부모가 쓰는 배포 버전을 그대로 달아 준다 —
   iframe은 부모의 캐시 상태를 물려받지 않으므로(설계 문서 §F#9)
   주소가 버전과 함께 바뀌어야 옛 frame 문서를 물고 있지 않는다.
========================================================== */

function buildSandboxSkinFrameUrl(frameOrigin, buildVersion) {

  if (!frameOrigin) {
    return "";
  }


  const version =
    typeof buildVersion === "string" && buildVersion
      ? buildVersion
      : (
        typeof APP_BUILD_VERSION === "string"
          ? APP_BUILD_VERSION
          : ""
      );


  return (
    frameOrigin +
    SANDBOX_SKIN_FRAME_PATH +
    (version ? "?v=" + encodeURIComponent(version) : "")
  );

}


/* =========================================================
   node(단위 테스트)에서도 같은 파일을 읽을 수 있게
========================================================== */

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SANDBOX_SKIN_FRAME_PATH,
    SANDBOX_SKIN_PRODUCTION_ORIGIN,
    SANDBOX_SKIN_PRODUCTION_PARENT_ORIGINS,
    SANDBOX_SKIN_ENABLED_HOSTS,
    SANDBOX_SKIN_ENABLED_SLUGS,
    isSandboxSkinDevHost,
    isSandboxSkinFlagHost,
    readSandboxSkinOptIn,
    readSandboxSkinSlug,
    isSandboxSkinEnabledSlug,
    isSandboxSkinEnabled,
    resolveSandboxSkinFrameOrigin,
    resolveSandboxSkinParentOrigins,
    isAllowedSandboxParentOrigin,
    buildSandboxSkinFrameUrl
  };

}
