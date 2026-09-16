/* =========================================================
   imory-sandbox-screens-v1.json 만들기 (SANDBOX-5B)

   production 에서 관측한 것을 재현하는 regression fixture:

     HOME    #viewerArea > #themeMount > iframe
     CATEGORY/GALLERY/BANNER/HIGHLIGHTS
             #postArea > #postContainer > #postList > iframe
     POST    #postArea > #postContainer > #postSkinContainer > iframe

   화면을 옮겨도 옛 자리의 iframe 이 남아 **둘 다 실행 중**이던
   버그를 e2e 가 숫자로 잡을 수 있어야 한다. 그래서 이 스킨은
   SANDBOX-5A 의 저자 JS fixture(imory-sandbox-authorjs-v1.json)
   위에 "이 realm 이 살아 있다"를 **프레임 밖에서 셀 수 있는 자리**
   에 적는 코드를 얹는다.

   그 자리는 프레임 origin 의 localStorage 다:

     imory.screens.log = {
       starts       실행된 realm 의 수(이 origin 에서 누적)
       ticks        { realm id -> 박동 수 } — **살아 있는 realm 마다**
       lastTickPage 마지막으로 박동한 realm 의 화면 이름
       cleanups     pagehide 에서 onCleanup 이 돈 횟수
       cleaned      그때의 화면 이름들
     }

   판정법(skin/sandbox/skin-sandbox-e2e-test.mjs 의 [screens]):

     ① 지금 화면의 프레임에서 ticks 를 {} 로 비운다
     ② 잠시 기다린다
     ③ ticks 의 **키 개수**를 센다 = 그 사이 박동한 realm 의 수

   1 이면 돌고 있는 realm 은 하나뿐이다. 옛 화면의 프레임이 남아
   있으면 2 가 된다 — 가려져 있어도, 화면에 아무것도 그리지
   않아도 잡힌다. 누적 계수기가 아니라 **누가 뛰었는가**를 세므로
   측정 창의 길이에도, 프레임이 언제 만들어졌는지에도 좌우되지
   않는다.

   실행:  node skin/test-skins/build-sandbox-screens-v1.mjs
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const base = JSON.parse(
  fs.readFileSync(path.join(HERE, "imory-sandbox-authorjs-v1.json"), "utf8")
);

const EXTRA_JS = `

/* =========================================================
   SANDBOX-5B — "이 realm 이 아직 살아 있다"를 프레임 밖에서
   셀 수 있는 자리에 적는다.

   프레임 안의 data-* 표식만으로는 **없어진 프레임**을 잴 수 없다
   (없어진 realm 에는 물어볼 수 없으니까). 그래서 이 origin 의
   localStorage 에 공용 계수기를 둔다 — 여기에 적히는 숫자는
   "지금 이 origin 에서 돌고 있는 모든 realm 의 합"이다.
========================================================== */

(function () {

  var api =
    window.imorySkin;

  var root =
    api && api.root
      ? api.root
      : document.getElementById("sandboxFrameRoot");

  if (!root) {
    return;
  }


  var KEY =
    "imory.screens.log";

  var read = function () {

    try {
      return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {};
    }

    catch (err) {
      return {};
    }

  };

  var write = function (value) {

    try {
      window.localStorage.setItem(KEY, JSON.stringify(value));
      return true;
    }

    catch (err) {
      return false;
    }

  };


  var page =
    api && typeof api.pageType === "string" ? api.pageType : "";


  /* 이 realm 의 이름표. 같은 값이 두 번 나오지 않으면 충분하다 */

  var realmId =
    "r" + Math.random().toString(36).slice(2) + "-" + Date.now();


  /* --- 시작했다 ----------------------------------------- */

  var log =
    read();

  log.starts =
    (log.starts || 0) + 1;

  log.lastStart =
    page;

  var stored =
    write(log);


  /*
    이 realm 이 **시작할 때 본** 값. 부모(e2e)가 읽는다 —
    "내가 열리기 전에 청소가 몇 번 돌았는가".
  */

  root.setAttribute("data-imory-screens-store", stored ? "1" : "0");
  root.setAttribute("data-imory-screens-starts", String(log.starts));
  root.setAttribute("data-imory-screens-cleanups", String(log.cleanups || 0));
  root.setAttribute("data-imory-screens-cleaned", String(log.cleaned || ""));
  root.setAttribute("data-imory-screens-page", page);
  root.setAttribute("data-imory-screens-realm", realmId);


  /* --- 심장박동 ----------------------------------------- */

  var beats =
    0;

  var timer =
    window.setInterval(function () {

      beats += 1;

      var now = read();

      if (!now.ticks || typeof now.ticks !== "object") {
        now.ticks = {};
      }

      now.ticks[realmId] = (now.ticks[realmId] || 0) + 1;
      now.lastTickPage = page;

      write(now);

      root.setAttribute("data-imory-screens-beats", String(beats));

    }, 100);


  /* --- 프레임이 사라지기 직전 --------------------------- */

  if (api && typeof api.onCleanup === "function") {

    api.onCleanup(function () {

      window.clearInterval(timer);

      var now = read();

      now.cleanups = (now.cleanups || 0) + 1;
      now.cleaned = (now.cleaned ? now.cleaned + "," : "") + page;

      write(now);

    });

  }

}());
`;

const out = {
  ...base,
  js: base.js + EXTRA_JS,
  metadata: {
    ...(base.metadata || {}),
    name: "Imory Sandbox Screens (SANDBOX-5B regression)",
    description:
      "화면을 옮길 때 옛 자리의 sandbox 프레임이 남아 함께 실행되던 것을 잡는 fixture. " +
      "프레임 origin 의 localStorage 에 realm 공용 심장박동과 cleanup 기록을 남긴다."
  }
};

fs.writeFileSync(
  path.join(HERE, "imory-sandbox-screens-v1.json"),
  JSON.stringify(out, null, 2) + "\n"
);

console.log(
  "wrote imory-sandbox-screens-v1.json (js " + out.js.length + " chars)"
);
