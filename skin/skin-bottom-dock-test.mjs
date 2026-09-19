/* =========================================================
   BOTTOM-DOCK-1 단위 테스트 — 브라우저 없이

     node skin/skin-bottom-dock-test.mjs

   보는 것은 skin/skin-bottom-dock.js 의 **판정 규칙**이다:
   저장되는 설정의 모양(무엇을 받아들이고 무엇을 거부하는가)과,
   그 설정 + Context 로 템플릿이 받는 재료가 어떻게 만들어지는가.

   DOM 이 필요한 것(자리 · 접기 · 전환 · 클릭)은 여기 없다 —
   그건 skin/skin-bottom-dock-e2e-test.mjs 의 몫이다.
========================================================== */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require =
  createRequire(import.meta.url);

/* TRANSITION-1 — 브라우저에서는 skin-transition.js 가 같은 realm 에
   먼저 실려 dock 의 transition 을 정규화한다. node 에서도 같은
   조건을 만든다(전역 함수로 노출). */
const transitionModule =
  require(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "skin-transition.js"
    )
  );

globalThis.validateSkinTransitionInput =
  transitionModule.validateSkinTransitionInput;

const dock =
  require(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "skin-bottom-dock.js"
    )
  );

const {
  normalizeSkinBottomDock,
  resolveSkinBottomDock,
  buildSkinDockContext,
  resolveSkinDockTemplate,
  getDefaultSkinDockTemplate,
  SKIN_DOCK_MAX_ITEMS
} = dock;


let passed = 0;
let failed = 0;

function check(name, condition, detail) {

  if (condition) {
    passed += 1;
    return;
  }

  failed += 1;
  console.error(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);

}

function section(title) {
  console.log(`\n[${title}]`);
}


/* 공통 재료 — 실제 Context 가 주는 모양만 최소로 흉내 낸다 */

function makeContext(overrides = {}) {

  return {
    site: { title: "블로그", slug: "me" },
    navigation: {
      home: { name: "HOME", href: "/me/" },
      highlights: { name: "발췌", href: "/me/highlights" },
      categories: [
        { id: "7", name: "글", href: "/me/category/1", type: "post" },
        { id: "9", name: "사진", href: "/me/category/2", type: "gallery" }
      ],
      galleryCategories: [
        { id: "9", name: "사진", href: "/me/category/2", type: "gallery" }
      ],
      bannerCategories: []
    },
    viewer: {
      isOwner: false,
      writeHref: null,
      adminHref: null,
      manageHref: null
    },
    images: { dockHeart: "https://cdn.example.com/heart.png" },
    ...overrides
  };

}

function ownerContext() {

  return makeContext({
    viewer: {
      isOwner: true,
      writeHref: "/me/category/1?write=1",
      adminHref: "/admin",
      manageHref: null
    }
  });

}

function item(overrides = {}) {

  return {
    id: "home",
    label: "home",
    visual: { type: "icon", value: "home" },
    action: { type: "navigate", target: "home" },
    ...overrides
  };

}


/* =========================================================
   1. 설정의 모양
========================================================== */

section("normalize — 받아들이는 것");

{
  const r = normalizeSkinBottomDock(undefined);
  check("필드가 없으면 dock 이 없는 것이지 오류가 아니다", r.ok && r.dock === null);
}

{
  const r = normalizeSkinBottomDock({ items: [item()] });

  check("기본값 — position auto", r.ok && r.dock.position === "auto");
  check("기본값 — transition fade(공용 전환 primitive 한 벌)", r.ok && r.dock.transition.type === "fade" && r.dock.transition.duration === 200);
  check("기본값 — defaultState expanded", r.ok && r.dock.defaultState === "expanded");
  check("기본값 — visible true", r.ok && r.dock.visible === true);
  check("기본값 — collapsible false(명시해야 켜진다)", r.ok && r.dock.collapsible === false);
  check("기본값 — trigger 가 반드시 생긴다", r.ok && !!r.dock.trigger && typeof r.dock.trigger.value === "string");
}

{
  const r = normalizeSkinBottomDock({
    visible: true,
    position: "sticky",
    collapsible: true,
    defaultState: "collapsed",
    transition: "fade-slide",
    trigger: { type: "emoji", value: "♡", label: "메뉴" },
    items: [
      item(),
      item({ id: "gal", visual: { type: "emoji", value: "📷" }, action: { type: "navigate", target: "gallery" } }),
      item({ id: "pair", visual: { type: "image", value: "https://cdn.example.com/a.png" }, action: { type: "open", target: "panel:pair" } }),
      item({ id: "share", visual: { type: "text", value: "공유" }, action: { type: "action", target: "share" } })
    ]
  });

  check("여섯 설정이 그대로 보존된다", r.ok &&
    r.dock.position === "sticky" &&
    r.dock.collapsible === true &&
    r.dock.defaultState === "collapsed" &&
    r.dock.transition.type === "fade-slide", JSON.stringify(r));

  check("네 종류의 visual/action 이 통과한다", r.ok && r.dock.items.length === 4);

  check("open 타깃은 항상 panel: 접두사로 정규화된다",
    r.ok && r.dock.items[2].action.target === "panel:pair");
}

{
  const r = normalizeSkinBottomDock({
    items: [item({ action: { type: "open", target: "pair" } })]
  });

  check("접두사 없이 적은 open 타깃도 panel: 로 맞춰진다",
    r.ok && r.dock.items[0].action.target === "panel:pair");
}

{
  const r = normalizeSkinBottomDock({
    items: [item({ action: { type: "navigate", target: "path:/me/about" } })]
  });

  check("path: 타깃은 블로그 안의 경로 하나를 받는다", r.ok, JSON.stringify(r));
}


section("normalize — 거부하는 것 (조용히 버리지 않는다)");

const rejects = [
  ["최상위가 객체가 아니면", "nope"],
  ["모르는 position", { position: "floating", items: [] }],
  ["모르는 transition", { transition: "bounce", items: [] }],
  ["모르는 defaultState", { defaultState: "half", items: [] }],
  ["items 가 배열이 아니면", { items: {} }],
  ["항목 id 가 없으면", { items: [{ visual: { type: "icon", value: "home" }, action: { type: "navigate", target: "home" } }] }],
  ["항목 id 중복", { items: [item(), item()] }],
  ["모르는 visual.type", { items: [item({ visual: { type: "lottie", value: "x" } })] }],
  ["아이콘 토큰 형태가 틀리면", { items: [item({ visual: { type: "icon", value: "Home Icon" } })] }],
  ["모르는 action.type", { items: [item({ action: { type: "launch", target: "home" } })] }],
  ["모르는 navigate 타깃", { items: [item({ action: { type: "navigate", target: "pair" } })] }],
  ["제품에 없는 action 타깃(search)", { items: [item({ action: { type: "action", target: "search" } })] }],
  ["모르는 audience", { items: [item({ audience: "friends" })] }]
];

rejects.forEach(([name, value]) => {

  const r = normalizeSkinBottomDock(value);

  check(name + " 거부", r.ok === false && typeof r.message === "string" && r.message.length > 0,
    JSON.stringify(r));

});

{
  /* 외부 주소는 이미지에도 못 쓴다 — https 만 */
  const cases = [
    "http://cdn.example.com/a.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "//cdn.example.com/a.png"
  ];

  cases.forEach((url) => {

    const r = normalizeSkinBottomDock({
      items: [item({ visual: { type: "image", value: url } })]
    });

    check(`이미지 주소 거부: ${url}`, r.ok === false);

  });
}

{
  const cases = [
    "path:about",           /* 앞의 / 없음 */
    "path://evil.example",  /* protocol-relative */
    "path:/../admin",       /* traversal */
    "path:/a//b"
  ];

  cases.forEach((target) => {

    const r = normalizeSkinBottomDock({
      items: [item({ action: { type: "navigate", target } })]
    });

    check(`path 타깃 거부: ${target}`, r.ok === false);

  });
}

{
  const many =
    Array.from(
      { length: SKIN_DOCK_MAX_ITEMS + 1 },
      (_, i) => item({ id: `i${i}` })
    );

  const r = normalizeSkinBottomDock({ items: many });

  check(`항목 ${SKIN_DOCK_MAX_ITEMS}개 초과 거부`, r.ok === false);
}

{
  const r = normalizeSkinBottomDock({ items: [item({ id: "x", foo: "bar" })] });

  check("모르는 항목 키는 결과에 남지 않는다",
    r.ok && !Object.prototype.hasOwnProperty.call(r.dock.items[0], "foo"));
}


/* =========================================================
   2. 렌더가 쓰는 관대한 문
========================================================== */

section("resolve — 이상하면 dock 없음(화면은 깨지지 않는다)");

check("모양이 틀린 설정은 null", resolveSkinBottomDock({ bottomDock: { position: "nope" } }) === null);
check("visible:false 는 null", resolveSkinBottomDock({ bottomDock: { visible: false, items: [item()] } }) === null);
check("설정이 없으면 null", resolveSkinBottomDock({}) === null);
check("정상 설정은 객체", !!resolveSkinBottomDock({ bottomDock: { items: [item()] } }));


/* =========================================================
   3. 템플릿이 받는 재료
========================================================== */

section("context — 주소는 플랫폼이 만든다");

{
  const config =
    normalizeSkinBottomDock({
      items: [
        item({ id: "home", action: { type: "navigate", target: "home" } }),
        item({ id: "hl", action: { type: "navigate", target: "highlights" } }),
        item({ id: "gal", action: { type: "navigate", target: "gallery" } }),
        item({ id: "cat", action: { type: "navigate", target: "category:7" } })
      ]
    }).dock;

  const ctx =
    buildSkinDockContext(config, makeContext());

  const byId =
    Object.fromEntries(ctx.items.map((i) => [i.id, i]));

  check("home 주소", byId.home.href === "/me/");
  check("highlights 주소", byId.hl.href === "/me/highlights");
  check("gallery 는 첫 갤러리 카테고리", byId.gal.href === "/me/category/2");
  check("category:<id> 는 그 카테고리", byId.cat.href === "/me/category/1");

  check("스킨은 카테고리 id 를 받지 않는다",
    !Object.prototype.hasOwnProperty.call(byId.cat, "categoryId"));
}

{
  const config =
    normalizeSkinBottomDock({
      items: [item({ id: "cat", action: { type: "navigate", target: "category:999" } })]
    }).dock;

  const ctx =
    buildSkinDockContext(config, makeContext());

  check("없는 카테고리를 가리키는 항목은 빠진다(빈 껍데기를 남기지 않는다)",
    ctx.items.length === 0 && ctx.hasDock === false);
}


section("context — 방문자와 주인장");

{
  const config =
    normalizeSkinBottomDock({
      items: [
        item({ id: "home" }),
        item({ id: "write", audience: "owner", action: { type: "action", target: "write" } }),
        item({ id: "admin", audience: "owner", action: { type: "action", target: "admin" } }),
        item({ id: "hello", audience: "visitor", action: { type: "open", target: "panel:hello" } })
      ]
    }).dock;

  const visitor =
    buildSkinDockContext(config, makeContext());

  const owner =
    buildSkinDockContext(config, ownerContext());

  check("방문자에게 주인장 항목의 **재료 자체가** 없다",
    visitor.items.map((i) => i.id).join(",") === "home,hello",
    visitor.items.map((i) => i.id).join(","));

  check("주인장에게는 방문자 전용 항목이 없다",
    owner.items.map((i) => i.id).join(",") === "home,write,admin",
    owner.items.map((i) => i.id).join(","));

  check("주인장 항목의 주소는 Context 가 이미 만든 것",
    owner.items[1].href === "/me/category/1?write=1");
}

{
  /* audience 를 안 적어도 주소가 없으면 빠진다 — 방문자의 write */
  const config =
    normalizeSkinBottomDock({
      items: [item({ id: "write", action: { type: "action", target: "write" } })]
    }).dock;

  check("주소를 만들 수 없는 항목은 audience 와 무관하게 빠진다",
    buildSkinDockContext(config, makeContext()).items.length === 0);
}


section("context — data-imory-if 가 바로 쓸 수 있는 모양");

{
  const config =
    normalizeSkinBottomDock({
      collapsible: true,
      defaultState: "collapsed",
      trigger: { type: "emoji", value: "♡" },
      items: [
        item({ id: "a", visual: { type: "icon", value: "camera" } }),
        item({ id: "b", label: "", visual: { type: "asset", value: "dockHeart" }, action: { type: "open", target: "panel:p" } }),
        item({ id: "c", visual: { type: "emoji", value: "🌸" }, action: { type: "action", target: "top" } })
      ]
    }).dock;

  const ctx =
    buildSkinDockContext(config, makeContext());

  check("아이콘은 kind 토큰으로 나간다", ctx.items[0].visual.iconKind === "camera");
  check("아이콘에는 글자가 없다", ctx.items[0].visual.text === "");
  check("슬롯 이름은 실제 이미지 주소로 풀린다",
    ctx.items[1].visual.imageUrl === "https://cdn.example.com/heart.png");
  check("이모지는 글자로 나간다", ctx.items[2].visual.text === "🌸");

  check("종류마다 boolean 이 미리 발급된다(비교 연산이 없으므로)",
    ctx.items[0].visual.isIcon === true &&
    ctx.items[1].visual.isImage === true &&
    ctx.items[2].visual.isEmoji === true);

  check("라벨 없는 항목에도 읽히는 이름이 있다", ctx.items[1].accessibleLabel === "b");
  check("접힌 채로 시작하는지 미리 계산돼 있다", ctx.isCollapsedByDefault === true);
  check("open 항목은 패널 이름을 갖는다", ctx.items[1].panelId === "p");
  check("주소 없는 동작도 항목으로 남는다", ctx.items[2].hasHref === false && ctx.items[2].isAction === true);
}

{
  const config =
    normalizeSkinBottomDock({ items: [item({ id: "home" })] }).dock;

  const ctx =
    buildSkinDockContext(config, makeContext(), { currentHref: "/me/" });

  check("지금 보고 있는 화면의 항목은 isActive", ctx.items[0].isActive === true);

  const other =
    buildSkinDockContext(config, makeContext(), { currentHref: "/me/category/1" });

  check("다른 화면이면 isActive 가 아니다", other.items[0].isActive === false);
}


/* =========================================================
   4. template 선택
========================================================== */

section("template");

{
  const fallback =
    resolveSkinDockTemplate({ css: ".a{color:red}" });

  check("templates.dock 이 없으면 플랫폼 기본 template",
    fallback.html === getDefaultSkinDockTemplate().html);

  check("기본 template 을 쓸 때도 스킨의 공용 CSS 가 먼저 온다",
    fallback.css.startsWith(".a{color:red}"));

  check("기본 template 은 두 자리를 표시해 둔다",
    fallback.html.includes('data-imory-dock="trigger"') &&
    fallback.html.includes('data-imory-dock="items"'));

  check("기본 template 은 항목을 반복한다",
    fallback.html.includes('data-imory-repeat="dock.items"'));
}

{
  const own =
    resolveSkinDockTemplate({
      css: ".a{}",
      templates: { dock: { html: "<nav class='d'></nav>" } }
    });

  check("스킨이 그린 dock 이 이긴다", own.html === "<nav class='d'></nav>");
  check("그때 CSS 는 스킨의 공용 CSS 그대로", own.css === ".a{}");
}


/* =========================================================
   아이모리 아이콘 — Studio 가 고르는 목록과 공개 화면이 그리는 그림

   목록(SKIN_DOCK_IMORY_ICONS)은 skin-bottom-dock.js, 그림은
   skin-dock-icons.css 에 있다. 두 파일을 **실제로 읽어** 양방향으로
   대조한다 — 하나만 고치면 "고를 수는 있는데 안 보이는" 아이콘이나
   "그려 두고 못 고르는" 아이콘이 생긴다.
========================================================== */

section("icons");

{
  const fs = await import("node:fs");

  const here =
    path.dirname(fileURLToPath(import.meta.url));

  const css =
    fs.readFileSync(path.join(here, "skin-dock-icons.css"), "utf8");

  const drawn =
    new Set(
      Array.from(css.matchAll(/\[data-imory-dock-icon="([a-z0-9-]+)"\]/g))
        .map((m) => m[1])
    );

  const listed =
    dock.SKIN_DOCK_IMORY_ICONS.map((icon) => icon.token);

  const missingDrawing =
    listed.filter((token) => !drawn.has(token));

  const missingChoice =
    Array.from(drawn).filter((token) => listed.indexOf(token) === -1);

  check("목록의 아이콘마다 그림이 있다", missingDrawing.length === 0, missingDrawing.join(","));
  check("그림마다 목록에 이름이 있다", missingChoice.length === 0, missingChoice.join(","));

  check(
    "요청된 기본 아이콘이 전부 있다(home·folder·heart·star·image·book·edit·profile·menu)",
    ["home", "folder", "heart", "star", "image", "book", "edit", "profile", "menu"]
      .every((token) => listed.indexOf(token) !== -1)
  );

  check(
    "Studio 가 처음 채우는 dock 의 아이콘(home·quote·top)도 그려진다",
    ["home", "quote", "top"].every((token) => drawn.has(token))
  );

  check(
    "목록의 토큰은 data-kind 로 나갈 수 있는 형태다",
    listed.every((token) => /^[a-z][a-z0-9-]{0,31}$/.test(token))
  );

  check(
    "목록의 이름은 사용자에게 보일 한국어 라벨을 갖는다(토큰을 보여 주지 않는다)",
    dock.SKIN_DOCK_IMORY_ICONS.every((icon) => icon.label && icon.label !== icon.token)
  );

  check(
    "그림은 외부 요청이 아니라 data: 주소다",
    !/url\(\s*["']?https?:/i.test(css)
  );

  check(
    "사용자에게 보이는 표시 방식은 넷이다(asset/svg 는 저장값으로만)",
    JSON.stringify(dock.SKIN_DOCK_USER_VISUAL_TYPES) ===
      JSON.stringify(["icon", "emoji", "text", "image"]) &&
    dock.SKIN_DOCK_VISUAL_TYPES.indexOf("asset") !== -1 &&
    dock.SKIN_DOCK_VISUAL_TYPES.indexOf("svg") !== -1
  );

  check(
    "옛 asset/svg 표시도 여전히 정규화를 통과한다(저장 데이터 호환)",
    normalizeSkinBottomDock({
      items: [
        { id: "a", visual: { type: "asset", value: "logo" }, action: { type: "navigate", target: "home" } },
        { id: "b", visual: { type: "svg", value: "https://example.com/a.svg" }, action: { type: "navigate", target: "home" } }
      ]
    }).ok
  );

  check(
    "기본 template 의 열기 버튼은 이미지 주소도 그릴 자리를 갖는다",
    getDefaultSkinDockTemplate().html.includes('data-imory-src="dock.trigger.imageUrl"')
  );
}


/* =========================================================
========================================================== */

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);

process.exit(failed === 0 ? 0 : 1);
