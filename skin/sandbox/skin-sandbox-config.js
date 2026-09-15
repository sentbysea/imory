/* =========================================================
   SKIN SANDBOX - CONFIG (classic script)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §B-1 / §D-4
   단계: SANDBOX-0 (빈 프레임 + origin 격리 검증)

   이 파일은 sandbox 스킨 경로의 **유일한 기능 플래그**이자
   **유일한 origin 상수**다. 다른 파일이 origin 문자열을 직접
   적지 않는다 — 한 곳만 고치면 배포 구성이 바뀌도록.

   ---------------------------------------------------------
   ★ 기본값은 OFF다. 그리고 URL만으로는 공개 사용자에게 켜지지
     않는다.

   isSandboxSkinEnabled()는 두 관문을 **모두** 통과해야 true다:

     1) 지금 문서의 hostname이 "켜도 되는 호스트"인가
        - 로컬 개발 호스트(localhost / 127.0.0.1 / [::1])
        - 또는 SANDBOX_SKIN_ENABLED_HOSTS 에 사람이 직접 적어 넣은 호스트
          (지금은 빈 배열 = 어떤 production 호스트에서도 켜지지 않는다)
     2) 그 호스트에서 명시적 opt-in 신호가 있는가
        - ?sandboxSkin=1  또는  localStorage["imory.sandboxSkin"] === "1"

   (2)만 있고 (1)이 없으면 false다. 그래서 imory.me 방문자가
   주소창에 ?sandboxSkin=1 을 붙여도 아무 일도 일어나지 않는다.
   production에서 켜려면 **이 파일을 고쳐 배포**해야 한다 —
   그것이 "명시적인 내부 설정"이다.

   ---------------------------------------------------------
   ★ frame origin

   SANDBOX_SKIN_PRODUCTION_ORIGIN 은 지금 빈 문자열이다. 2026-09-15
   실측으로 skin-frame.imory.me 는 DNS에 존재하지 않는다(NXDOMAIN).
   사람이 Cloudflare에서 커스텀 도메인을 붙인 뒤 이 값을 채운다.
   비어 있는 동안 resolveSandboxSkinFrameOrigin()은 ""를 돌려주고,
   host 모듈은 그것을 보고 **iframe을 만들지 않는다**(조용한 폴백).

   로컬 개발에서는 부모와 frame이 **다른 포트**여야 origin이 갈린다
   (같은 localhost라도 포트가 다르면 다른 origin이다). 그 값은
   ?sandboxSkinOrigin= 로 준다 — 단, (1)의 dev 호스트에서만,
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
  스위치는 어디까지나 isSandboxSkinEnabled()이고, 그 함수는
  hostname부터 본다 — SANDBOX_SKIN_ENABLED_HOSTS가 비어 있는 한
  imory.me에서는 계속 false다. 이 상수는 "플래그가 켜졌을 때 어디로
  띄우는가"만 정한다.
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
  production에서 플래그를 켤 호스트. 비어 있는 것이 기본이고,
  비어 있는 한 어떤 공개 방문자도 sandbox 경로를 켤 수 없다.
*/

var SANDBOX_SKIN_ENABLED_HOSTS =
  [];


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

   "이 호스트에서 플래그를 켜는 것이 허용되는가" — (1)번 관문.
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

   (2)번 관문. 호출하는 쪽이 (1)을 먼저 통과시킨 뒤에만 부른다.
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
   isSandboxSkinEnabled(win) -> boolean

   ★ 이 함수 하나가 sandbox 경로 전체의 스위치다.
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


  return readSandboxSkinOptIn(w) === true;

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
    isSandboxSkinDevHost,
    isSandboxSkinFlagHost,
    readSandboxSkinOptIn,
    isSandboxSkinEnabled,
    resolveSandboxSkinFrameOrigin,
    resolveSandboxSkinParentOrigins,
    isAllowedSandboxParentOrigin,
    buildSandboxSkinFrameUrl
  };

}
