/* =========================================================
   STUDIO HOME CANVAS VENDOR — Moveable · Selecto 지연 로더
   (HOME-CANVAS-VENDOR-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §13
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN) §8-1

   ── 이 파일이 하는 것 / 하지 않는 것 ────────────────────
   한다:   저장소에 고정해 둔 UMD 두 개를 **부를 때만** 받아 오고,
           두 생성자가 실제로 생겼는지 확인해 돌려준다.
   안 한다: 자동 호출 · Canvas 요소와의 연결 · 선택 · 드래그 ·
           크기 · 회전 · Inspector · Undo · 메시지. 이 파일은
           리스너도, DOM 도, 인스턴스도 하나 만들지 않는다.
           실제 연결은 HOME-CANVAS-SELECT-1 의 일이다.

   ★ 이 파일을 로드하는 것만으로는 아무 요청도 생기지 않는다.
     전역 함수 하나가 정의될 뿐이고, UMD 두 파일은
     ensureHomeCanvasEditorVendors() 를 **부른 뒤에야** 받는다.
     그래서 Studio 를 열기만 한 사람에게도 300KB 가 붙지 않는다.

   ── 왜 CDN 이 아니라 저장소인가 ─────────────────────────
   posts/manage/posts-folder-sortable.js 는 SortableJS 를 jsDelivr 에서
   받는다. 여기서는 그러지 않는다 — Spike 의 판정(로드맵 §8-1)이
   **Moveable 0.53.0 의 `cspNonce` 가 작동하지만 deprecated** 라는
   것이었고, 그 옵션이 조용히 사라지면 sandbox 프레임 안에서 핸들이
   CSP 에 막힌다. CDN 주소의 고정 버전은 남의 저장소가 바꿀 수 있는
   약속이지만, 저장소 안의 바이트는 우리가 고정한다. 해시까지
   studio/vendor/home-canvas/README.md 에 적고 테스트가 검사한다.

   ── 왜 loadVersionedScripts() 를 쓰지 않는가 ────────────
   core/lib/build-version.js 의 loader 넷은 전부 document.write 다 —
   문서를 **파싱하는 동안에만** 쓸 수 있고, 로드가 끝난 뒤에 부르면
   문서를 통째로 덮어쓴다. 이 파일은 사람이 캔버스 편집을 켠 뒤에
   불리므로 그 넷 중 하나를 쓸 수 없다.

   그래서 같은 일을 동적 <script> 로 한다 — 붙이는 주소는 똑같이
   `?v=${APP_BUILD_VERSION}` 이고, 값은 여기에 복사해 적지 않고
   그 파일의 전역에서 읽는다(CLAUDE.md §4). 고정 URL <script src>
   를 어떤 HTML 에도 만들지 않는다.

   ── 주소를 절대 경로로 적는 이유 ────────────────────────
   같은 파일을 나중에 두 realm 이 읽는다 — Studio 문서(`/studio/`)와
   sandbox 프레임(`/skin/sandbox/frame`). 상대 경로는 두 곳에서 다른
   곳을 가리키므로 절대 경로 하나로 적는다. sandbox origin 에서 이
   두 주소가 나갈 수 있도록 core/lib/skin-sandbox-server.js 의
   SANDBOX_ALLOWED_PATHS 에 **정확히 이 두 경로**가 올라가 있다.
========================================================== */


/* =========================================================
   고정된 두 파일

   버전을 파일 이름에 적는다 — 주소가 바뀌지 않으면 버전이 바뀐
   것을 아무도 눈치채지 못한다. `global` 은 추측이 아니라 UMD
   wrapper 를 실제로 읽어 확인한 이름이다(둘 다 `(…self).<이름>=`).
========================================================== */

const HOME_CANVAS_VENDORS = [
  {
    key: "Moveable",
    version: "0.53.0",
    path: "/studio/vendor/home-canvas/moveable-0.53.0.min.js"
  },
  {
    key: "Selecto",
    version: "1.26.3",
    path: "/studio/vendor/home-canvas/selecto-1.26.3.min.js"
  }
];


/* =========================================================
   문서 하나당 파일 하나당 Promise 하나

   classic script 의 최상위 const 는 그 문서 안에서 실제로 공유된다
   (Inspector 파일 분리 라운드에서 확인했다) — window 로 올릴 필요가
   없다. 문서가 다르면(Studio 문서 / 프레임) 각자 자기 표를 갖고,
   그게 맞다. 서로 다른 realm 은 전역도 다르기 때문이다.
========================================================== */

const homeCanvasVendorLoads = new Map();


let homeCanvasVendorAllPromise = null;


/* 저장소 규칙: 주소에 ?v=APP_BUILD_VERSION.
   값은 여기에 적지 않고 build-version.js 의 전역에서 읽는다. */
function homeCanvasVendorUrl(path) {

  const version =
    typeof APP_BUILD_VERSION === "string" && APP_BUILD_VERSION
      ? APP_BUILD_VERSION
      : "";


  return version
    ? `${path}?v=${encodeURIComponent(version)}`
    : path;

}


/* =========================================================
   loadOneHomeCanvasVendor(entry)

   한 파일에 대해 "요청은 한 번"을 지킨다. 이미 전역이 있으면
   요청조차 만들지 않는다 — 같은 문서에서 다른 경로로 이미 로드된
   경우(프레임이 먼저 받아 둔 경우)를 위한 관문이다.

   실패한 Promise 는 표에 남기지 않는다. 네트워크가 한 번 끊겼다고
   그 문서에서 영영 다시 시도할 수 없게 만들 이유가 없다.
========================================================== */

function loadOneHomeCanvasVendor(entry) {

  if (typeof window[entry.key] === "function") {

    return Promise.resolve(window[entry.key]);

  }


  const cached =
    homeCanvasVendorLoads.get(entry.key);

  if (cached) {

    return cached;

  }


  const url =
    homeCanvasVendorUrl(entry.path);


  const loading =
    new Promise(
      (resolve, reject) => {

        const script =
          document.createElement("script");


        script.src =
          url;


        script.async =
          false;


        script.addEventListener(
          "load",
          () => {

            /* 파일은 왔는데 전역이 없다 = 우리가 아는 그 파일이
               아니다. 200 인 SPA fallback HTML 을 성공으로 보지
               않으려는 것과 같은 이유다. */
            if (typeof window[entry.key] !== "function") {

              reject(
                new Error(
                  `HOME Canvas vendor 로드 실패: ${entry.path} ` +
                  `(응답은 받았지만 전역 ${entry.key} 가 없다 — ` +
                  `파일이 그 UMD 가 맞는지 확인)`
                )
              );

              return;

            }


            resolve(window[entry.key]);

          }
        );


        script.addEventListener(
          "error",
          () => {

            reject(
              new Error(
                `HOME Canvas vendor 로드 실패: ${entry.path} ` +
                `(${url} 를 받지 못했다)`
              )
            );

          }
        );


        document.head.appendChild(script);

      }
    );


  homeCanvasVendorLoads.set(entry.key, loading);


  loading.catch(
    () => {

      /* 다음 호출이 다시 시도할 수 있게 표에서 뺀다. 성공한
         Promise 만 표에 남으므로 "성공 뒤에는 요청 0" 이다. */
      if (homeCanvasVendorLoads.get(entry.key) === loading) {

        homeCanvasVendorLoads.delete(entry.key);

      }

    }
  );


  return loading;

}


/* =========================================================
   ensureHomeCanvasEditorVendors()

   → Promise<{ Moveable, Selecto }>

   같은 문서에서 몇 번을 불러도 각 UMD 는 한 번만 받는다. 동시에
   여러 번 불러도 **같은 Promise** 를 돌려준다. 하나라도 실패하면
   어떤 파일이 실패했는지 적힌 Error 로 거절한다.

   ★ 생성자에 `cspNonce` 를 넘기는 것은 **부르는 쪽의 몫**이다.
     두 라이브러리는 런타임에 <style> 을 만들어 붙이는데 sandbox
     프레임의 CSP 는 style-src 'self' 'nonce-…' 라 nonce 가 없으면
     그 style 이 통째로 막힌다(Moveable 은 핸들이 붕괴한다).
     Moveable 0.53.0 의 `cspNonce` 는 **작동하지만 deprecated** 다 —
     그래서 버전을 고정하고 회귀 테스트로 못박는다
     (studio/studio-home-canvas-vendor-e2e-test.mjs).
========================================================== */

function ensureHomeCanvasEditorVendors() {

  if (homeCanvasVendorAllPromise) {

    return homeCanvasVendorAllPromise;

  }


  const all =
    Promise.all(
      HOME_CANVAS_VENDORS.map(loadOneHomeCanvasVendor)
    ).then(
      (ctors) => {

        const result = {};


        HOME_CANVAS_VENDORS.forEach(
          (entry, index) => {

            result[entry.key] = ctors[index];

          }
        );


        return result;

      }
    );


  homeCanvasVendorAllPromise = all;


  all.catch(
    () => {

      if (homeCanvasVendorAllPromise === all) {

        homeCanvasVendorAllPromise = null;

      }

    }
  );


  return all;

}


/* 읽기 전용 — 테스트와 문서가 "무엇이 고정돼 있는가"를 이 표
   하나에서 본다. 값을 복사해 적는 곳을 만들지 않는다. */
function homeCanvasVendorManifest() {

  return HOME_CANVAS_VENDORS.map(
    (entry) => ({
      key: entry.key,
      version: entry.version,
      path: entry.path,
      url: homeCanvasVendorUrl(entry.path)
    })
  );

}


window.ensureHomeCanvasEditorVendors =
  ensureHomeCanvasEditorVendors;


window.homeCanvasVendorManifest =
  homeCanvasVendorManifest;
