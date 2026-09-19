/* =========================================================
   SKIN PACKAGE IMAGES — 이미지 슬롯 정규화 (IMPORT-CSS-IMAGE-1)

   SkinPackage 가 Studio 로 들어오는 모든 입구(Import · Code 적용 ·
   AI 전체 · AI 선택 요소)가 sanitize **전에** 한 번 부른다
   (skin/skin-package-import.js runSkinPackageContentPipeline).
   "HTML 이 가리키는 이미지 자리"와 "imageSlots 선언"을 서로 맞춘다.

   ★ 하는 일
   1) 선언 정리 — 이름 없는 항목은 버리고, 같은 이름이 둘이면 하나로
      합친다(앞의 것이 이기고 빈 칸만 뒤의 것으로 채운다).
   2) 이름 규칙 — 슬롯 이름은 DB 규칙 `^[a-z][a-z0-9_]*$`(50자)를
      따라야 한다(supabase/migrations/20260907100000_create_skin_image_library.sql
      skin_version_image_slots.slot_name). 어기는 이름(`heroPhoto`)은
      저장할 때 check 제약에 걸려 Save 전체가 실패하므로, 선언과 HTML
      의 `images.<이름>` 을 **함께** `hero_photo` 로 바꾼다.
   3) 빠진 선언 복구 — HTML 에 `images.xxx` 가 있는데 imageSlots 에
      없으면 슬롯을 만든다. 없으면 공개 화면에서 그 자리가 영영
      비어 있다(buildSkinImages 는 선언된 슬롯만 노출한다).
   4) AI 첨부 이미지 — AI 가 `<img src="imory-attachment:N">` 을
      쓴 자리를 `data-imory-src="images.<슬롯>"` 으로 바꾸고 슬롯을
      만든다. 어느 첨부(N)가 어느 슬롯인지는 report.attachmentSlots
      로 돌려준다 — 실제 업로드와 연결은 AI 패널이 한다
      (studio/ai/studio-ai-panel.js). 같은 첨부를 두 자리에 쓰면 슬롯도
      하나다.

   ★ 하지 않는 일
   - 평범한 `<img src="https://…">`(아이콘·장식·외부 사진)는 건드리지
     않는다. 외부 주소의 그림을 Imory 저장소로 몰래 복사하지 않는다.
   - data: 주소 그림은 sanitizer 가 지운다 — 사진 슬롯으로 오인하지
     않는다.
   - CSS background-image 는 슬롯으로 바꾸지 않는다. 엔진에 "배경
     슬롯"이 없다(style 속성은 sanitizer 가, CSS 의 images.* 는 해석기가
     없다). AI 에게는 첨부 사진을 <img> 층으로 두라고 시킨다
     (functions/api/skin-ai.js 참고 이미지 규칙).

   DOMParser 로만 읽는다 — 리소스를 불러오지 않는다(skin-sanitize.js
   sanitizeSkinHTML 주석과 같은 이유). 바뀐 template 만 다시 직렬화하고,
   안 바뀐 template 은 **입력 문자열 그대로** 돌려준다.

   classic script — window.normalizeSkinPackageImageSlots /
   window.describeSkinImageAspectRatio 로 노출된다. 의존 없음.
========================================================== */

const SKIN_IMAGE_SLOT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;

const SKIN_IMAGE_SLOT_NAME_MAX = 50;

/* AI 에게 알려 주는 첨부 이미지 자리표시자. 번호는 1부터. */
const SKIN_ATTACHMENT_SRC_PATTERN = /^\s*imory-attachment:(\d{1,2})?\s*$/i;

const SKIN_IMAGE_SLOT_TEMPLATE_ORDER =
  ["home", "category", "post", "banner", "folder", "highlights", "memos", "dock"];

const SKIN_IMAGE_BIND_ATTRS =
  ["data-imory-src", "data-imory-if", "data-imory-bind"];

/*
  이름 짓기 표 — class · aria-label · alt 의 낱말과 조상 요소(최대
  네 단계)의 class 를 본다. 역할(role)과 종류(photo/image)를 따로
  찾아 `hero_photo` 처럼 붙인다. 역할을 못 찾으면 `photo`, 그것도
  없으면 `image_1` 식의 번호.
*/
const SKIN_IMAGE_SLOT_ROLES = [
  { role: "profile", words: ["profile", "avatar"], label: "프로필" },
  { role: "logo", words: ["logo", "brand", "emblem"], label: "로고" },
  { role: "hero", words: ["hero", "visual", "masthead", "jumbotron", "keyvisual", "kv", "main"], label: "메인" },
  { role: "cover", words: ["cover"], label: "커버" },
  { role: "banner", words: ["banner"], label: "배너" },
  { role: "gallery", words: ["gallery"], label: "갤러리" },
  { role: "background", words: ["background", "bg", "backdrop"], label: "배경" },
  { role: "thumbnail", words: ["thumb", "thumbnail"], label: "썸네일" },
  { role: "header", words: ["header"], label: "헤더" }
];

const SKIN_IMAGE_SLOT_PHOTO_WORDS =
  ["photo", "picture", "pic", "portrait", "photograph"];

const SKIN_IMAGE_SLOT_ANCESTOR_DEPTH = 4;


function splitSkinImageSlotWords(text) {

  return String(text || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

}


/* `heroPhoto` / `Hero-Photo` / `2nd image` -> `hero_photo` / `image_2nd_image` */
function toSkinImageSlotName(raw) {

  const words =
    splitSkinImageSlotWords(raw);

  let name =
    words.join("_");

  if (!name) {
    return "";
  }

  if (!/^[a-z]/.test(name)) {
    name = "image_" + name;
  }

  return name.slice(0, SKIN_IMAGE_SLOT_NAME_MAX).replace(/_+$/, "");

}


function isValidSkinImageSlotName(name) {
  return typeof name === "string" && SKIN_IMAGE_SLOT_NAME_PATTERN.test(name);
}


/*
  첨부 사진의 가로/세로 픽셀 -> "3:4" 같은 힌트. 흔한 비율에 3% 안으로
  가까우면 그 이름을, 아니면 소수 한 자리 비율("1.3:1")을 쓴다.
*/
const SKIN_IMAGE_COMMON_RATIOS = [
  [1, 1], [4, 3], [3, 4], [3, 2], [2, 3], [16, 9], [9, 16], [2, 1], [1, 2], [21, 9], [5, 4], [4, 5], [3, 1]
];

function describeSkinImageAspectRatio(width, height) {

  const w = Number(width);
  const h = Number(height);

  if (!(w > 0) || !(h > 0)) {
    return "";
  }

  const ratio = w / h;

  for (const [a, b] of SKIN_IMAGE_COMMON_RATIOS) {
    if (Math.abs(ratio - a / b) / (a / b) <= 0.03) {
      return `${a}:${b}`;
    }
  }

  return ratio >= 1
    ? `${Math.round(ratio * 10) / 10}:1`
    : `1:${Math.round((1 / ratio) * 10) / 10}`;

}


function collectSkinImageSlotHints(img) {

  const own = []
    .concat(splitSkinImageSlotWords(img.getAttribute("class")))
    .concat(splitSkinImageSlotWords(img.getAttribute("aria-label")))
    .concat(splitSkinImageSlotWords(img.getAttribute("alt")));

  const levels = [own];

  let parent = img.parentElement;

  for (let depth = 0; parent && depth < SKIN_IMAGE_SLOT_ANCESTOR_DEPTH; depth += 1) {

    levels.push(
      []
        .concat(splitSkinImageSlotWords(parent.getAttribute("class")))
        .concat(splitSkinImageSlotWords(parent.getAttribute("aria-label")))
    );

    parent = parent.parentElement;

  }

  return levels;

}


function inferSkinImageSlotIdentity(img) {

  const levels =
    collectSkinImageSlotHints(img);

  let role = null;
  let isPhoto = false;

  for (const words of levels) {

    if (!isPhoto && words.some((word) => SKIN_IMAGE_SLOT_PHOTO_WORDS.indexOf(word) !== -1)) {
      isPhoto = true;
    }

    if (!role) {
      role =
        SKIN_IMAGE_SLOT_ROLES.find((entry) =>
          words.some((word) => entry.words.indexOf(word) !== -1)
        ) || null;
    }

  }

  const alt =
    String(img.getAttribute("alt") || "").trim();

  const kindName = isPhoto ? "photo" : "image";
  const kindLabel = isPhoto ? "사진" : "이미지";

  if (role) {
    return {
      base: `${role.role}_${kindName}`,
      label: alt && alt.length <= 40 ? alt : `${role.label} ${kindLabel}`
    };
  }

  if (isPhoto) {
    return { base: "photo", label: alt && alt.length <= 40 ? alt : "사진" };
  }

  return { base: null, label: alt && alt.length <= 40 ? alt : "" };

}


function uniqueSkinImageSlotName(base, taken) {

  if (!taken.has(base)) {
    return base;
  }

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}_${n}`.slice(0, SKIN_IMAGE_SLOT_NAME_MAX);
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return base;

}


function nextNumberedSkinImageSlotName(taken) {

  for (let n = 1; n < 1000; n += 1) {
    const candidate = `image_${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return "image_x";

}


function copySkinImageSlotDeclaration(entry, name) {

  const copy = {};

  Object.keys(entry).forEach((key) => {
    if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
      copy[key] = entry[key];
    }
  });

  copy.name = name;

  return copy;

}


/* =========================================================
   normalizeSkinPackageImageSlots(input, options) -> result

   input = {
     templates: { home: "<html>", ... },   페이지별 HTML 문자열
     legacyHtml: string | undefined,        templates 없는 옛 스킨의 html
     imageSlots: any                        원래 imageSlots 값
   }
   options = {
     attachments: [{ aspectRatioHint? }]    이번 AI 요청에 붙인 첨부
                                            (없으면 빈 배열 — Import 등)
   }

   result = {
     templates, legacyHtml, imageSlots,
     changed,   무엇이든 바뀌었는가
     report: {
       createdSlots:     [{ name, label, source: "binding"|"attachment" }]
       mergedSlots:      [name]              중복 선언을 합친 이름
       renamedSlots:     [{ from, to }]
       droppedSlots:     number              이름이 없어 버린 선언 수
       attachmentSlots:  [{ slot, attachmentIndex }]  (0부터)
       missingAttachments: [{ slot, attachmentIndex }] 첨부가 없는 자리
       emptySlots:       [name]              이번에 만든 슬롯 중 연결할
                                             그림이 없는 것
     }
   }
========================================================== */

function normalizeSkinPackageImageSlots(input, options) {

  const source =
    input || {};

  const attachments =
    (options && Array.isArray(options.attachments)) ? options.attachments : [];

  const report = {
    createdSlots: [],
    mergedSlots: [],
    renamedSlots: [],
    droppedSlots: 0,
    attachmentSlots: [],
    missingAttachments: [],
    emptySlots: []
  };

  /* ---------- 1) 선언 정리 ---------- */

  const declared = [];
  const declaredByName = new Map();
  const renameMap = new Map();
  let declarationsChanged = !Array.isArray(source.imageSlots) && source.imageSlots !== undefined;

  (Array.isArray(source.imageSlots) ? source.imageSlots : []).forEach((entry) => {

    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.name !== "string" || !entry.name.trim()) {
      report.droppedSlots += 1;
      declarationsChanged = true;
      return;
    }

    let name = entry.name.trim();

    if (!isValidSkinImageSlotName(name)) {

      const fixed = toSkinImageSlotName(name);

      if (!fixed) {
        report.droppedSlots += 1;
        declarationsChanged = true;
        return;
      }

      renameMap.set(name, fixed);
      report.renamedSlots.push({ from: name, to: fixed });
      name = fixed;
      declarationsChanged = true;

    }

    const existing = declaredByName.get(name);

    if (existing) {

      ["label", "aspectRatioHint"].forEach((key) => {
        if ((existing[key] === undefined || existing[key] === "") && typeof entry[key] === "string" && entry[key]) {
          existing[key] = entry[key];
        }
      });

      if (entry.required === true) {
        existing.required = true;
      }

      if (report.mergedSlots.indexOf(name) === -1) {
        report.mergedSlots.push(name);
      }

      declarationsChanged = true;
      return;

    }

    const copy = copySkinImageSlotDeclaration(entry, name);

    if (copy.name !== entry.name) {
      declarationsChanged = true;
    }

    declared.push(copy);
    declaredByName.set(name, copy);

  });

  const taken =
    new Set(declared.map((slot) => slot.name));

  /* ---------- 2) HTML ---------- */

  const templatesIn =
    source.templates || {};

  const templatesOut = {};

  const htmlEntries = [];

  SKIN_IMAGE_SLOT_TEMPLATE_ORDER.forEach((pageType) => {
    if (typeof templatesIn[pageType] === "string") {
      htmlEntries.push({ key: pageType, html: templatesIn[pageType] });
    }
  });

  Object.keys(templatesIn).forEach((pageType) => {
    if (SKIN_IMAGE_SLOT_TEMPLATE_ORDER.indexOf(pageType) === -1 && typeof templatesIn[pageType] === "string") {
      htmlEntries.push({ key: pageType, html: templatesIn[pageType] });
    }
  });

  if (typeof source.legacyHtml === "string") {
    htmlEntries.push({ key: "__legacy__", html: source.legacyHtml });
  }

  const boundSlots = new Map(); /* 선언이 없는 `images.x` -> 처음 만난 <img> */
  const attachmentSlotByIndex = new Map();
  let nextUnnumberedAttachment = 0;
  let htmlChanged = false;

  const createSlot = (fields) => {
    const slot = { name: fields.name, label: fields.label || fields.name, required: !!fields.required };
    if (fields.aspectRatioHint) {
      slot.aspectRatioHint = fields.aspectRatioHint;
    }
    declared.push(slot);
    declaredByName.set(slot.name, slot);
    taken.add(slot.name);
    return slot;
  };

  const resolveBoundName = (path) => {

    const match = /^images\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(path);

    if (!match) {
      return null;
    }

    const original = match[1];

    if (renameMap.has(original)) {
      return { original, name: renameMap.get(original) };
    }

    if (isValidSkinImageSlotName(original)) {
      return { original, name: original };
    }

    const fixed = uniqueSkinImageSlotName(toSkinImageSlotName(original), taken);

    renameMap.set(original, fixed);
    taken.add(fixed);
    report.renamedSlots.push({ from: original, to: fixed });

    return { original, name: fixed };

  };

  /*
    두 번 돈다 — 먼저 **모든** template 의 images.* 바인딩을 모아
    이름을 차지해 두고, 그 다음에 첨부 자리표시자에 새 이름을 준다.
    한 번에 돌면 HOME 의 첨부가 `hero_photo` 를 가져간 뒤 CATEGORY 의
    `images.hero_photo` 바인딩과 뜻하지 않게 한 슬롯으로 묶인다.
  */
  const documents = htmlEntries.map((entry) => ({
    key: entry.key,
    html: entry.html,
    doc: new DOMParser().parseFromString(entry.html, "text/html"),
    changed: false
  }));

  documents.forEach((entry) => {

    const doc = entry.doc;

    /* a) images.* 바인딩 이름 맞추기 */
    doc.body.querySelectorAll("*").forEach((el) => {

      SKIN_IMAGE_BIND_ATTRS.forEach((attr) => {

        if (!el.hasAttribute(attr)) {
          return;
        }

        const resolved = resolveBoundName(String(el.getAttribute(attr)).trim());

        if (!resolved) {
          return;
        }

        if (resolved.name !== resolved.original) {
          el.setAttribute(attr, `images.${resolved.name}`);
          entry.changed = true;
        }

        taken.add(resolved.name);

        if (!declaredByName.has(resolved.name)) {

          const current = boundSlots.get(resolved.name);

          /* 이름을 지을 때는 <img> 쪽 단서가 더 낫다 */
          if (current === undefined || (current === null && el.tagName.toLowerCase() === "img")) {
            boundSlots.set(resolved.name, el.tagName.toLowerCase() === "img" ? el : null);
          }

        }

      });

    });

  });

  documents.forEach((entry) => {

    /* b) 첨부 이미지 자리표시자 */
    entry.doc.body.querySelectorAll("img[src]").forEach((img) => {

      const match = SKIN_ATTACHMENT_SRC_PATTERN.exec(img.getAttribute("src") || "");

      if (!match) {
        return;
      }

      let attachmentIndex;

      if (match[1] !== undefined) {
        attachmentIndex = Math.max(0, parseInt(match[1], 10) - 1);
      } else {
        while (attachmentSlotByIndex.has(nextUnnumberedAttachment)) {
          nextUnnumberedAttachment += 1;
        }
        attachmentIndex = nextUnnumberedAttachment;
      }

      let slotName = attachmentSlotByIndex.get(attachmentIndex);

      /* 이미 images.x 를 가리키던 <img> 에 첨부를 붙였다면 그 슬롯을 쓴다 */
      const existingBinding =
        resolveBoundName(String(img.getAttribute("data-imory-src") || "").trim());

      if (!slotName && existingBinding) {
        slotName = existingBinding.name;
        boundSlots.delete(slotName);
      }

      if (!slotName) {

        const identity = inferSkinImageSlotIdentity(img);
        const hint = attachments[attachmentIndex] && attachments[attachmentIndex].aspectRatioHint;

        const name =
          identity.base
            ? uniqueSkinImageSlotName(identity.base, taken)
            : nextNumberedSkinImageSlotName(taken);

        createSlot({
          name,
          label: identity.label || `이미지 ${attachmentIndex + 1}`,
          required: true,
          aspectRatioHint: typeof hint === "string" ? hint : ""
        });

        report.createdSlots.push({ name, label: declaredByName.get(name).label, source: "attachment" });

        slotName = name;

      } else if (!declaredByName.has(slotName)) {

        const identity = inferSkinImageSlotIdentity(img);
        createSlot({ name: slotName, label: identity.label || slotName, required: true });
        report.createdSlots.push({ name: slotName, label: declaredByName.get(slotName).label, source: "attachment" });

      }

      if (!attachmentSlotByIndex.has(attachmentIndex)) {

        attachmentSlotByIndex.set(attachmentIndex, slotName);

        if (attachmentIndex < attachments.length) {
          report.attachmentSlots.push({ slot: slotName, attachmentIndex });
        } else {
          report.missingAttachments.push({ slot: slotName, attachmentIndex });
        }

      }

      img.removeAttribute("src");
      img.setAttribute("data-imory-src", `images.${slotName}`);

      if (!img.hasAttribute("data-imory-if")) {
        img.setAttribute("data-imory-if", `images.${slotName}`);
      }

      entry.changed = true;

    });

  });

  const processed = documents.map((entry) => {

    if (entry.changed) {
      htmlChanged = true;
    }

    return { key: entry.key, html: entry.changed ? entry.doc.body.innerHTML : entry.html };

  });

  /* ---------- 3) 선언이 빠진 바인딩 ---------- */

  boundSlots.forEach((img, name) => {

    if (declaredByName.has(name)) {
      return;
    }

    const identity = img ? inferSkinImageSlotIdentity(img) : { label: "" };

    createSlot({ name, label: identity.label || name, required: false });

    report.createdSlots.push({ name, label: declaredByName.get(name).label, source: "binding" });

  });

  const linked =
    new Set(report.attachmentSlots.map((entry) => entry.slot));

  report.emptySlots =
    report.createdSlots
      .map((entry) => entry.name)
      .filter((name) => !linked.has(name));

  processed.forEach((entry) => {
    if (entry.key === "__legacy__") {
      return;
    }
    templatesOut[entry.key] = entry.html;
  });

  const legacy =
    processed.find((entry) => entry.key === "__legacy__");

  return {
    templates: templatesOut,
    legacyHtml: legacy ? legacy.html : source.legacyHtml,
    imageSlots: declared,
    changed: htmlChanged || declarationsChanged || report.createdSlots.length > 0,
    report
  };

}


/*
  사람이 읽을 안내 문장 — Import 창 · Code 적용 · AI 결과가 같은
  문장을 쓴다.
*/
function describeSkinImageSlotReport(report) {

  const lines = [];

  if (!report) {
    return lines;
  }

  report.renamedSlots.forEach((entry) => {
    lines.push(`이미지 슬롯 이름 ${entry.from}을(를) 저장할 수 있는 이름 ${entry.to}(으)로 바꿨습니다.`);
  });

  if (report.mergedSlots.length) {
    lines.push(`같은 이름으로 두 번 선언된 이미지 슬롯을 하나로 합쳤습니다: ${report.mergedSlots.join(", ")}`);
  }

  if (report.droppedSlots) {
    lines.push(`이름이 없는 imageSlots 항목 ${report.droppedSlots}개를 뺐습니다.`);
  }

  report.createdSlots.forEach((entry) => {
    if (entry.source === "binding") {
      lines.push(`HTML이 쓰는 images.${entry.name}에 슬롯 선언이 없어 "${entry.label}" 슬롯을 만들었습니다.`);
    }
  });

  if (report.emptySlots.length) {
    lines.push(`비어 있는 이미지 슬롯: ${report.emptySlots.join(", ")} — Images 패널에서 이미지를 넣어 주세요.`);
  }

  return lines;

}


if (typeof window !== "undefined") {
  window.normalizeSkinPackageImageSlots = normalizeSkinPackageImageSlots;
  window.describeSkinImageAspectRatio = describeSkinImageAspectRatio;
  window.describeSkinImageSlotReport = describeSkinImageSlotReport;
  window.isValidSkinImageSlotName = isValidSkinImageSlotName;
}
