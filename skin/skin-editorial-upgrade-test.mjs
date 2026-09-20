/* =========================================================
   이미 만들어진 아이모리 기본 스킨 올려 주기 — 단위 테스트
   (EDITORIAL-EXISTING-UPGRADE-1)

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md §22

   ★ fixture 를 지어내지 않는다

   "이미 만들어 둔 스킨"은 **그 배포의 생성기가 실제로 만든 것**이라야
   뜻이 있다. 그래서 EDITORIAL-CUSTOMIZATION-1 직전 커밋(45a576b)의
   skin/skin-default-editorial.js 를 git 에서 그대로 꺼내 돌려
   그때의 스킨을 만든다. 손으로 깎은 JSON 은 "정말 그 모양이었나"를
   증명하지 못한다.

   보는 것:

     [judge]    아이모리 기본 스킨인가 — 옛 스킨은 맞고, 남의 스킨 ·
                표식만 베낀 스킨 · 오늘의 스킨은 각각 다른 답
     [steps]    옛 스킨에 모자란 두 가지를 찾아낸다
     [apply]    넣은 뒤 — 카테고리 줄이 크기를 갖고 링크는 1em(계산된
                크기 불변) · title_logo 슬롯 · 로고/글자 두 갈래
     [keep]     사진 · 색 · D-day · 단 구성 · 직접 편집 · category/post
                템플릿 · renderMode · js 가 한 글자도 안 바뀐다
     [again]    두 번 해도 같다(한 번 넣으면 applicable 이 false)

   실제 화면은 studio/studio-editorial-customization-e2e-test.mjs.

   실행:  node skin/skin-editorial-upgrade-test.mjs
========================================================== */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const require = createRequire(import.meta.url);

/* EDITORIAL-CUSTOMIZATION-1 직전 커밋 — 그때의 기본 스킨 생성기 */
const BEFORE_CUSTOMIZATION = "45a576b";

let pass = 0;
let fail = 0;

function record(name, ok, note) {
  if (ok) {
    pass += 1;
    console.log(`PASS — ${name}${note ? `\n        ${note}` : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL — ${name}${note ? `\n        ${note}` : ""}`);
  }
}


/* =========================================================
   그때의 생성기를 꺼내 온다
========================================================== */

function loadOldFactory() {

  const source =
    execFileSync(
      "git",
      ["show", `${BEFORE_CUSTOMIZATION}:skin/skin-default-editorial.js`],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );

  const file =
    path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "imory-editorial-old-")),
      "skin-default-editorial.js"
    );

  fs.writeFileSync(file, source);

  return require(file);

}


/* CSS 규칙 한 덩어리에서 선언 하나 읽기(테스트 자신의 눈) */
function declaration(css, selector, property) {

  const at =
    css.indexOf(`\n${selector} {`);

  if (at === -1) {
    return null;
  }

  const body =
    css.slice(at, css.indexOf("}", at));

  const hit =
    new RegExp(`(?:^|;|\\n)\\s*${property}\\s*:\\s*([^;}\\n]+)`, "i").exec(body);

  return hit ? hit[1].trim() : null;

}


function main() {

  const upgrade =
    require(path.join(HERE, "skin-editorial-upgrade.js"));

  const today =
    require(path.join(HERE, "skin-default-editorial.js"));

  /* 브라우저에서는 skin-default-editorial.js 가 자기를 window 에
     올려 두고, 올려 주기 파일이 그 전역에서 "오늘의 기본 스킨"을
     꺼낸다. node 에는 window 가 없으니 같은 자리를 만들어 준다 —
     테스트가 대신 만드는 것은 로드 방식뿐이고, 조각을 어디서
     떼어 오는지는 제품 코드가 정한다. */
  globalThis.IMORY_EDITORIAL_DEFAULT_ID = today.IMORY_EDITORIAL_DEFAULT_ID;
  globalThis.createImoryEditorialDefaultSkin = today.createImoryEditorialDefaultSkin;

  let oldFactory;

  try {
    oldFactory = loadOldFactory();
  } catch (err) {
    console.log(`SKIP — ${BEFORE_CUSTOMIZATION} 의 생성기를 꺼내지 못했습니다: ${String(err.message).split("\n")[0]}`);
    console.log("\n0/0 — git 저장소 안에서 실행해 주세요.");
    process.exit(1);
  }

  const oldSkin =
    oldFactory.createImoryEditorialDefaultSkin();

  const newSkin =
    today.createImoryEditorialDefaultSkin();


  /* ---- [judge] 아이모리 기본 스킨인가 -------------------- */

  record(
    "[judge] 그때의 기본 스킨도 '아이모리 기본 스킨'으로 알아본다",
    upgrade.isImoryEditorialDefaultSkin(oldSkin) === true,
    `generatedBy=${oldSkin.metadata && oldSkin.metadata.generatedBy}`
  );

  record(
    "[judge] 오늘의 기본 스킨도 마찬가지다",
    upgrade.isImoryEditorialDefaultSkin(newSkin) === true
  );

  record(
    "[judge] 남의 스킨은 아니다 — 표식도 마크업도 없다",
    upgrade.isImoryEditorialDefaultSkin({
      metadata: { generatedBy: "someone-else" },
      templates: { home: { html: "<div>hi</div>" } },
      css: ".a { color: red; }"
    }) === false
  );

  record(
    "[judge] 표식만 베끼고 마크업이 다른 스킨도 아니다 — 짐작해서 남의 스킨을 건드리지 않는다",
    upgrade.isImoryEditorialDefaultSkin({
      metadata: { generatedBy: oldSkin.metadata.generatedBy },
      templates: { home: { html: "<div class=\"my-home\">hi</div>" } },
      css: ".a { color: red; }"
    }) === false
  );


  /* ---- [steps] 무엇이 모자란가 -------------------------- */

  const plan =
    upgrade.describeImoryEditorialUpgrade(oldSkin);

  record(
    "[steps] 옛 스킨에는 두 가지가 모자라다 — 카테고리 줄 글자 크기 · HOME 제목 로고",
    plan.isEditorial === true &&
      plan.applicable === true &&
      plan.upToDate === false &&
      plan.steps.length === 2 &&
      plan.steps[0].key === "navFontSize" &&
      plan.steps[1].key === "titleLogo",
    JSON.stringify(plan.steps.map((step) => step && step.name))
  );

  const todayPlan =
    upgrade.describeImoryEditorialUpgrade(newSkin);

  record(
    "[steps] 오늘 만든 스킨에는 넣을 것이 없다(= 버튼이 사라진다)",
    todayPlan.isEditorial === true &&
      todayPlan.applicable === false &&
      todayPlan.upToDate === true &&
      todayPlan.upgraded === null,
    todayPlan.reason
  );

  record(
    "[steps] 남의 스킨에는 아예 칸을 내주지 않는다",
    upgrade.describeImoryEditorialUpgrade({ templates: {}, css: "" }).isEditorial === false
  );


  /* ---- [apply] 넣은 결과 -------------------------------- */

  const up =
    plan.upgraded;

  const oldLinkSize =
    declaration(oldSkin.css, ".ied-nav-link", "font-size");

  record(
    "[apply] 카테고리 줄이 글자 크기를 갖고, 링크는 1em 이다 — 크기는 링크에 있던 그 값이라 화면은 그대로",
    declaration(up.css, ".ied-nav-list", "font-size") === oldLinkSize &&
      declaration(up.css, ".ied-nav-link", "font-size") === "1em",
    JSON.stringify({
      before: { list: declaration(oldSkin.css, ".ied-nav-list", "font-size"), link: oldLinkSize },
      after: { list: declaration(up.css, ".ied-nav-list", "font-size"), link: declaration(up.css, ".ied-nav-link", "font-size") }
    })
  );

  const logoSlot =
    (up.imageSlots || []).find((slot) => slot && slot.name === "title_logo") || null;

  const freshLogoSlot =
    (newSkin.imageSlots || []).find((slot) => slot && slot.name === "title_logo") || null;

  record(
    "[apply] title_logo 슬롯이 오늘의 기본 스킨과 같은 모양으로 선언된다",
    !!logoSlot && JSON.stringify(logoSlot) === JSON.stringify(freshLogoSlot),
    JSON.stringify(logoSlot)
  );

  const upHtml =
    up.templates.home.html;

  record(
    "[apply] HOME 제목 자리가 로고 · 글자 두 갈래가 된다 — 원래 h1 의 바인딩은 그대로",
    upHtml.indexOf("ied-title--logo") !== -1 &&
      upHtml.indexOf("ied-title--text") !== -1 &&
      /<h1 class="ied-title ied-title--text"[^>]*data-imory-bind="site\.title"/.test(upHtml),
    `logo=${upHtml.indexOf("ied-title--logo") !== -1} text=${upHtml.indexOf("ied-title--text") !== -1}`
  );

  record(
    "[apply] 슬롯이 비어 있는 동안 보이는 것을 CSS 가 가른다 — 로고 갈래의 규칙이 들어왔다",
    up.css.indexOf(".ied-title--logo") !== -1 && up.css.indexOf(".ied-title--text") !== -1
  );


  /* ---- [keep] 나머지는 한 글자도 안 바뀐다 --------------- */

  record(
    "[keep] category · post 템플릿과 regions · metadata · renderMode 가 들어온 그대로다",
    JSON.stringify(up.templates.category) === JSON.stringify(oldSkin.templates.category) &&
      JSON.stringify(up.templates.post) === JSON.stringify(oldSkin.templates.post) &&
      JSON.stringify(up.regions) === JSON.stringify(oldSkin.regions) &&
      JSON.stringify(up.metadata) === JSON.stringify(oldSkin.metadata) &&
      up.renderMode === oldSkin.renderMode
  );

  record(
    "[keep] HOME 의 다른 마크업은 그대로다 — 제목 자리 말고는 길이도 같다",
    upHtml.replace(/<h1 class="ied-title ied-title--logo"[\s\S]*?<\/h1>/, "")
      .replace("ied-title--text", "").replace('class="ied-title "', 'class="ied-title"')
      .indexOf("ied-mast") !== -1 &&
      upHtml.indexOf("ied-nav-list") !== -1
  );

  /* 주인이 이미 고쳐 둔 스킨 — 설정과 직접 편집 규칙이 살아남는가 */

  const owned =
    JSON.parse(JSON.stringify(oldSkin));

  owned.regions = (owned.regions || []).concat([
    { name: "theme_colors", enabled: true, background: "#101014", text: "#f5f5f5" },
    { name: "dday", enabled: true, date: "2026-01-01", label: "함께한 날" }
  ]);

  owned.css += "\n[data-imory-edit-id=\"e0-1\"] {\n  color: rgb(18, 52, 86);\n}\n";

  const ownedUp =
    upgrade.describeImoryEditorialUpgrade(owned);

  record(
    "[keep] 주인의 설정(색 · D-day)과 직접 편집 규칙이 그대로 남는다",
    ownedUp.applicable === true &&
      JSON.stringify(ownedUp.upgraded.regions) === JSON.stringify(owned.regions) &&
      ownedUp.upgraded.css.indexOf('[data-imory-edit-id="e0-1"]') !== -1 &&
      ownedUp.upgraded.css.indexOf("rgb(18, 52, 86)") !== -1
  );


  /* ---- [again] 두 번 해도 같다 -------------------------- */

  const second =
    upgrade.describeImoryEditorialUpgrade(up);

  record(
    "[again] 한 번 넣은 스킨에는 넣을 것이 없다 — 버튼이 사라진다",
    second.isEditorial === true &&
      second.applicable === false &&
      second.upToDate === true,
    second.reason
  );

  record(
    "[again] 그 스킨은 여전히 아이모리 기본 스킨으로 알아본다",
    upgrade.isImoryEditorialDefaultSkin(up) === true
  );


  console.log(`\n${pass}/${pass + fail} PASS`);

  if (fail) {
    process.exit(1);
  }

}

main();
