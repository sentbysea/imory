/* =========================================================
   SKIN SETTINGS — 주인이 고르는 스킨 설정 (EDITORIAL-DEFAULT-SKIN-2)

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md

   좌우 영역(skin/skin-sides.js)과 같은 결이다 — **설정**과 **디자인**을
   나눈다.

     설정   주인이 Studio(나중에는 가입 문답)에서 고르는 값
            → SkinPackage.regions 의 이름 붙은 항목
     디자인 그 값을 어떻게 보여 주는가
            → 스킨의 HTML 속성 · CSS custom property · 바인딩

   regions 는 원래부터 모든 경로(Import · Export · Save · Publish · AI ·
   sandbox 봉투)를 그대로 지나가던 배열이다. 좌우 영역이 먼저 그 자리를
   썼고, 이 파일은 같은 배열에 항목 셋을 더한다. 새 최상위 필드는 없다.

     "regions": [
       { "name": "left_sidebar",  "enabled": true },
       { "name": "right_sidebar", "enabled": true, "mobile": false },
       { "name": "theme_colors",
         "colors": { "background": "#ffffff", "text": "#1b2340",
                     "accent": "#1f3a78", "accent2": "#8796b0" } },
       { "name": "home_photos", "layout": "auto" },
       { "name": "dday", "date": "2024-09-21", "label": "since we met" }
     ]

   - 모르는 이름 · 모르는 칸은 읽지 않고 **그대로 보존**한다.
   - 쓰기 함수는 원래 배열을 바꾸지 않고 새 배열을 돌려준다.
   - 설정 항목이 하나도 없는 스킨(= 지금까지의 모든 스킨)이면 렌더
     재료에 `settings` 키가 생기지 않는다 — sandbox 봉투와 Preview
     메시지가 byte 단위로 그대로다.

   ── 1. 색 네 역할 ─────────────────────────────────────────
     background · text · accent(포인트 1) · accent2(포인트 2)
   렌더러가 스킨 루트에 custom property 로 싣는다.

     --imory-color-background  --imory-color-text
     --imory-color-accent      --imory-color-accent-2

   스킨은 `var(--imory-color-text, #1b2340)` 처럼 **기본값과 함께**
   읽는다. 설정이 없으면 기본값이 그려지고, Studio 는 그 기본값을
   처음 색으로 보여 준다(readSkinThemeColorDefaults). 옅은 선 · 흐린
   글자 · 장식은 스킨이 이 넷에서 color-mix 로 만든다 — 비슷한 색
   옵션을 따로 두지 않는다.

   ── 2. HOME 사진 구성 ──────────────────────────────────────
     마크업   data-imory-photos="set"     사진 묶음
              data-imory-photos-item      사진 하나(보통 이미지 슬롯
                                          하나를 data-imory-if 로 감싼 것)
     설정     auto(기본) · empty · hero · pair · triptych
     런타임   묶음에  data-imory-photos-layout = empty|hero|pair|triptych
                      data-imory-photos-count  = 보이는 장 수(0~3)
                      data-imory-photos-filled = 채워진 장 수
              사진에  data-imory-photos-state  = shown|rest|empty
                      data-imory-photos-position = 1|2|3 (shown 일 때)

   auto 는 채워진 장 수로 정한다 — 0 empty · 1 hero · 2 pair · 3 이상
   triptych. 넷 이상이어도 앞의 세 장만 보인다(나머지는 슬롯에 그대로
   남고 rest 로 접힌다 — 지우지 않는다). 직접 고른 구성은 **채워진 장
   수까지만** 적용된다(두 장뿐인데 triptych 를 고르면 pair). empty 를
   고르면 사진이 있어도 글자 표지가 된다.

   ── 3. D-day ───────────────────────────────────────────────
   날짜 하나와 짧은 이름. 렌더러가 `settings.dday` 바인딩을 만든다.

     settings.dday.display   "730" (지난 날, 당일 = 1) · "D-12" (앞날)
     settings.dday.label     주인이 적은 이름
     settings.dday.days      당일을 1 로 센 날 수(앞날이면 0)
     settings.dday.until     앞날까지 남은 날 수(지난 날이면 0)
     settings.dday.isFuture

   날짜 계산은 한국 시간(Asia/Seoul)의 오늘을 쓴다(방문자 집계와 같은
   기준 — site-footer.js getSiteTodayKst). 설정이 없으면 `settings.dday`
   가 null 이라 `data-imory-if="settings.dday"` 로 감싼 자리는 접힌다.
   **가짜 값을 채우지 않는다.**

   ES 모듈이 아니다 — skin-sides.js 처럼 classic script 이고, 노드 단위
   테스트를 위해 module.exports 로도 낸다.
========================================================== */

const SKIN_SETTINGS_REGION_NAMES = {
  colors: "theme_colors",
  photos: "home_photos",
  dday: "dday"
};

const SKIN_THEME_COLOR_ROLES = ["background", "text", "accent", "accent2"];

const SKIN_THEME_COLOR_VARS = {
  background: "--imory-color-background",
  text: "--imory-color-text",
  accent: "--imory-color-accent",
  accent2: "--imory-color-accent-2"
};

const SKIN_HOME_PHOTO_LAYOUTS = ["auto", "empty", "hero", "pair", "triptych"];

/* 보이는 장 수 -> 구성 이름 */
const SKIN_HOME_PHOTO_LAYOUT_BY_COUNT = ["empty", "hero", "pair", "triptych"];

/* 직접 고른 구성 -> 원하는 장 수 */
const SKIN_HOME_PHOTO_WANT = { empty: 0, hero: 1, pair: 2, triptych: 3 };

const SKIN_HOME_PHOTO_MAX = 3;

const SKIN_DDAY_LABEL_MAX = 40;

const SKIN_DDAY_TIME_ZONE = "Asia/Seoul";

/* 마크업 계약 — 저장 경계(skin/skin-sanitize.js)가 여기에 묻는다 */
const SKIN_PHOTOS_ATTR = "data-imory-photos";

const SKIN_PHOTOS_ITEM_ATTR = "data-imory-photos-item";

const SKIN_PHOTOS_ATTRIBUTE_RULES = {
  [SKIN_PHOTOS_ATTR]: ["set"],
  [SKIN_PHOTOS_ITEM_ATTR]: [""]
};

/* 렌더 뒤에 플랫폼이 얹는 상태(표에 없으니 저장되지 않는다) */
const SKIN_PHOTOS_RUNTIME_LAYOUT = "data-imory-photos-layout";
const SKIN_PHOTOS_RUNTIME_COUNT = "data-imory-photos-count";
const SKIN_PHOTOS_RUNTIME_FILLED = "data-imory-photos-filled";
const SKIN_PHOTOS_RUNTIME_STATE = "data-imory-photos-state";
const SKIN_PHOTOS_RUNTIME_POSITION = "data-imory-photos-position";


/* =========================================================
   0. 공용 — regions 항목 찾기 · 바꾸기
========================================================== */

function isSkinSettingsPlainObject(value) {

  return !!value && typeof value === "object" && !Array.isArray(value);

}


/* 이름이 name 인 첫 항목(같은 이름이 둘이면 앞의 것 — skin-sides.js 와 같다) */
function findSkinSettingsEntry(regions, name) {

  if (!Array.isArray(regions)) {
    return null;
  }

  for (let i = 0; i < regions.length; i += 1) {

    const entry = regions[i];

    if (isSkinSettingsPlainObject(entry) && entry.name === name) {
      return entry;
    }

  }

  return null;

}


/*
  replaceSkinSettingsEntry(regions, name, update) -> 새 배열

  update(entry | null) 가 돌려준 값으로 그 이름의 첫 항목을 바꾼다.
  - null 을 돌려주면 그 항목을 뺀다.
  - 없던 항목이면 끝에 더한다.
  - 같은 이름의 뒤 항목은 버린다(읽을 때도 앞의 것만 본다).
  - 다른 항목은 자리 그대로.
*/
function replaceSkinSettingsEntry(regions, name, update) {

  const next = [];

  let written = false;

  (Array.isArray(regions) ? regions : []).forEach((entry) => {

    if (!isSkinSettingsPlainObject(entry) || entry.name !== name) {
      next.push(entry);
      return;
    }

    if (written) {
      return;
    }

    written = true;

    const replaced = update(entry);

    if (replaced) {
      next.push(replaced);
    }

  });

  if (!written) {

    const created = update(null);

    if (created) {
      next.push(created);
    }

  }

  return next;

}


/* 항목에서 칸 하나를 뺀다 — 이름만 남으면 항목째 뺀다 */
function withoutSkinSettingsField(entry, field) {

  const copy = { ...entry };

  delete copy[field];

  return Object.keys(copy).some((key) => key !== "name") ? copy : null;

}


/* =========================================================
   1. 색 네 역할
========================================================== */

/* "#abc" · "#AABBCC" -> "#aabbcc" | null */
function normalizeSkinThemeColor(value) {

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/.test(text)) {
    return text;
  }

  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }

  return null;

}


/* { background?, text?, accent?, accent2? } — 올바른 칸만. 하나도 없으면 null */
function normalizeSkinThemeColors(value) {

  if (!isSkinSettingsPlainObject(value)) {
    return null;
  }

  const colors = {};

  SKIN_THEME_COLOR_ROLES.forEach((role) => {

    const color = normalizeSkinThemeColor(value[role]);

    if (color) {
      colors[role] = color;
    }

  });

  return Object.keys(colors).length ? colors : null;

}


function readSkinThemeColors(regions) {

  const entry = findSkinSettingsEntry(regions, SKIN_SETTINGS_REGION_NAMES.colors);

  return entry ? normalizeSkinThemeColors(entry.colors) : null;

}


/* colors 가 null 이면 설정을 지운다(스킨의 기본색으로 돌아간다) */
function writeSkinThemeColors(regions, colors) {

  const normalized = normalizeSkinThemeColors(colors);

  return replaceSkinSettingsEntry(regions, SKIN_SETTINGS_REGION_NAMES.colors, (entry) => {

    if (!normalized) {
      return entry ? withoutSkinSettingsField(entry, "colors") : null;
    }

    return { ...(entry || { name: SKIN_SETTINGS_REGION_NAMES.colors }), colors: normalized };

  });

}


/*
  readSkinThemeColorDefaults(css) -> { background?, text?, accent?, accent2? }

  스킨이 `var(--imory-color-text, #1b2340)` 로 적어 둔 기본값. 첫 번째
  것을 읽는다. 스킨이 이 변수를 전혀 읽지 않으면 빈 객체 — Studio 는
  그때 색 칸을 잠근다(skinCssUsesThemeColors).
*/
function readSkinThemeColorDefaults(css) {

  const text = String(css || "");

  const defaults = {};

  SKIN_THEME_COLOR_ROLES.forEach((role) => {

    const name = SKIN_THEME_COLOR_VARS[role].replace(/-/g, "\\-");

    const match =
      new RegExp(`var\\(\\s*${name}\\s*,\\s*(#[0-9a-fA-F]{3,6})\\s*\\)`).exec(text);

    const color = match ? normalizeSkinThemeColor(match[1]) : null;

    if (color) {
      defaults[role] = color;
    }

  });

  return defaults;

}


function skinCssUsesThemeColors(css) {

  return /var\(\s*--imory-color-(background|text|accent|accent-2)\b/.test(String(css || ""));

}


/*
  buildSkinThemeColorsCss(colors, scopeClass) -> 규칙 한 줄 | ""

  렌더러가 스킨 <style> 맨 앞에 붙인다. 값은 normalizeSkinThemeColor 를
  지난 #rrggbb 뿐이라 선언을 벗어날 글자가 없다.
*/
function buildSkinThemeColorsCss(colors, scopeClass) {

  const normalized = normalizeSkinThemeColors(colors);

  if (!normalized || typeof scopeClass !== "string" || !/^[A-Za-z0-9_-]+$/.test(scopeClass)) {
    return "";
  }

  const declarations =
    SKIN_THEME_COLOR_ROLES
      .filter((role) => normalized[role])
      .map((role) => `${SKIN_THEME_COLOR_VARS[role]}:${normalized[role]}`)
      .join(";");

  return `.${scopeClass}{${declarations}}`;

}


/* WCAG 상대 휘도 대비 — Studio 경고와 테스트가 같은 함수를 쓴다 */
function skinColorLuminance(hex) {

  const color = normalizeSkinThemeColor(hex);

  if (!color) {
    return null;
  }

  const channel = (i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);

}


function skinColorContrast(a, b) {

  const la = skinColorLuminance(a);

  const lb = skinColorLuminance(b);

  if (la === null || lb === null) {
    return null;
  }

  const hi = Math.max(la, lb);

  const lo = Math.min(la, lb);

  return (hi + 0.05) / (lo + 0.05);

}


/* =========================================================
   2. HOME 사진 구성
========================================================== */

function normalizeSkinHomePhotosLayout(value) {

  const text = typeof value === "string" ? value.trim().toLowerCase() : "";

  return SKIN_HOME_PHOTO_LAYOUTS.indexOf(text) !== -1 ? text : null;

}


/* 항목이 없으면 null(= auto). 값이 틀리면 auto */
function readSkinHomePhotosLayout(regions) {

  const entry = findSkinSettingsEntry(regions, SKIN_SETTINGS_REGION_NAMES.photos);

  if (!entry) {
    return null;
  }

  return normalizeSkinHomePhotosLayout(entry.layout) || "auto";

}


function writeSkinHomePhotosLayout(regions, layout) {

  const normalized = normalizeSkinHomePhotosLayout(layout) || "auto";

  return replaceSkinSettingsEntry(regions, SKIN_SETTINGS_REGION_NAMES.photos, (entry) => ({
    ...(entry || { name: SKIN_SETTINGS_REGION_NAMES.photos }),
    layout: normalized
  }));

}


/*
  decideSkinHomePhotosLayout(requested, filledCount) -> { layout, count }

  count 는 실제로 보일 장 수(0~3).
*/
function decideSkinHomePhotosLayout(requested, filledCount) {

  const filled = Math.max(0, Math.floor(Number(filledCount) || 0));

  const layout = normalizeSkinHomePhotosLayout(requested) || "auto";

  const want =
    layout === "auto"
      ? SKIN_HOME_PHOTO_MAX
      : SKIN_HOME_PHOTO_WANT[layout];

  const count = Math.min(want, filled, SKIN_HOME_PHOTO_MAX);

  return { layout: SKIN_HOME_PHOTO_LAYOUT_BY_COUNT[count], count };

}


function isSkinPhotosAttributeName(name) {

  return Object.prototype.hasOwnProperty.call(SKIN_PHOTOS_ATTRIBUTE_RULES, name);

}


/* 저장할 값 | null(버린다) */
function sanitizeSkinPhotosAttributeValue(name, value) {

  if (!isSkinPhotosAttributeName(name)) {
    return null;
  }

  const normalized = String(value == null ? "" : value).trim().toLowerCase();

  return SKIN_PHOTOS_ATTRIBUTE_RULES[name].indexOf(normalized) !== -1
    ? normalized
    : null;

}


/* Studio 패널 — 이 HTML 에 사진 묶음이 있는가 */
function skinHtmlHasPhotoSet(html) {

  return /data-imory-photos\s*=\s*["']?set\b/i.test(String(html || ""));

}


/* 그 묶음이 쓰는 이미지 슬롯 이름(순서대로) — Studio 가 "지금 몇 장"을 센다 */
function skinHtmlPhotoSlotNames(html) {

  const names = [];

  const text = String(html || "");

  const itemPattern = /<[a-z][^>]*\bdata-imory-photos-item\b[^>]*>/gi;

  let match;

  while ((match = itemPattern.exec(text))) {

    const slot = /data-imory-if\s*=\s*["']images\.([a-z][a-z0-9_]*)["']/i.exec(match[0]);

    if (slot && names.indexOf(slot[1]) === -1) {
      names.push(slot[1]);
    }

  }

  return names;

}


function skinPhotoItemIsFilled(item) {

  if (item.hidden) {
    return false;
  }

  const img =
    item.tagName && item.tagName.toLowerCase() === "img"
      ? item
      : item.querySelector("img");

  return !!(img && (img.getAttribute("src") || "").trim());

}


/*
  compileSkinPhotos(root, requested)

  renderSkin() 이 walk(바인딩 · data-imory-if) **뒤**에 부른다 — 채워진
  사진인지는 data-imory-if 가 슬롯 값을 보고 정한 hidden 으로 안다.
  묶음이 없는 스킨에서는 아무 요소도 건드리지 않는다.
*/
function compileSkinPhotos(root, requested) {

  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }

  const sets = root.querySelectorAll(`[${SKIN_PHOTOS_ATTR}="set"]`);

  Array.prototype.forEach.call(sets, (set) => {

    const items =
      Array.prototype.filter.call(
        set.querySelectorAll(`[${SKIN_PHOTOS_ITEM_ATTR}]`),
        (item) => item.parentElement && item.parentElement.closest(`[${SKIN_PHOTOS_ATTR}="set"]`) === set
      );

    const filled = items.filter(skinPhotoItemIsFilled);

    const decision = decideSkinHomePhotosLayout(requested, filled.length);

    set.setAttribute(SKIN_PHOTOS_RUNTIME_LAYOUT, decision.layout);
    set.setAttribute(SKIN_PHOTOS_RUNTIME_COUNT, String(decision.count));
    set.setAttribute(SKIN_PHOTOS_RUNTIME_FILLED, String(filled.length));

    items.forEach((item) => {

      const at = filled.indexOf(item);

      if (at === -1) {
        item.setAttribute(SKIN_PHOTOS_RUNTIME_STATE, "empty");
        item.removeAttribute(SKIN_PHOTOS_RUNTIME_POSITION);
        return;
      }

      if (at < decision.count) {
        item.setAttribute(SKIN_PHOTOS_RUNTIME_STATE, "shown");
        item.setAttribute(SKIN_PHOTOS_RUNTIME_POSITION, String(at + 1));
        return;
      }

      /* 넷째부터 · 직접 고른 구성보다 많은 사진 — 슬롯은 그대로, HOME 에서만 접는다 */
      item.setAttribute(SKIN_PHOTOS_RUNTIME_STATE, "rest");
      item.removeAttribute(SKIN_PHOTOS_RUNTIME_POSITION);
      item.hidden = true;

    });

  });

}


/* =========================================================
   3. D-day
========================================================== */

/* "YYYY-MM-DD" 가 실제 달력 날짜면 그대로, 아니면 null */
function normalizeSkinDdayDate(value) {

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return null;
  }

  const text = value.trim();

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));

  if (year < 1900 || year > 2200) {
    return null;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return text;

}


/* 제어 문자를 빼고 앞뒤 공백을 자른 뒤 길이 상한 */
function normalizeSkinDdayLabel(value) {

  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SKIN_DDAY_LABEL_MAX);

}


function normalizeSkinDday(value) {

  if (!isSkinSettingsPlainObject(value)) {
    return null;
  }

  const date = normalizeSkinDdayDate(value.date);

  if (!date) {
    return null;
  }

  return { date, label: normalizeSkinDdayLabel(value.label) };

}


/* 항목이 있어도 enabled:false 면 꺼진 것(날짜는 남긴다 — 다시 켜면 그대로) */
function readSkinDday(regions) {

  const entry = findSkinSettingsEntry(regions, SKIN_SETTINGS_REGION_NAMES.dday);

  if (!entry || entry.enabled === false) {
    return null;
  }

  return normalizeSkinDday(entry);

}


/* 저장된 날짜 · 이름(꺼져 있어도) — Studio 입력칸의 처음 값 */
function readSkinDdayDraft(regions) {

  const entry = findSkinSettingsEntry(regions, SKIN_SETTINGS_REGION_NAMES.dday);

  if (!entry) {
    return { enabled: false, date: "", label: "" };
  }

  return {
    enabled: entry.enabled !== false && !!normalizeSkinDdayDate(entry.date),
    date: normalizeSkinDdayDate(entry.date) || "",
    label: normalizeSkinDdayLabel(entry.label)
  };

}


/*
  writeSkinDday(regions, { enabled, date, label })

  - enabled:false 는 항목을 남기고 끈다(날짜를 잊지 않는다).
  - 날짜가 틀리면 쓰지 않는다 — 호출자가 먼저 막는다. 여기서는 날짜
    칸을 빼고 끈다.
*/
function writeSkinDday(regions, value) {

  const input = isSkinSettingsPlainObject(value) ? value : {};

  const date = normalizeSkinDdayDate(input.date);

  const label = normalizeSkinDdayLabel(input.label);

  return replaceSkinSettingsEntry(regions, SKIN_SETTINGS_REGION_NAMES.dday, (entry) => {

    const base = { ...(entry || { name: SKIN_SETTINGS_REGION_NAMES.dday }) };

    delete base.enabled;

    if (date) {
      base.date = date;
    } else {
      delete base.date;
    }

    if (label) {
      base.label = label;
    } else {
      delete base.label;
    }

    if (input.enabled === false || !date) {
      base.enabled = false;
    }

    return base;

  });

}


/* 한국 시간의 오늘 -> "YYYY-MM-DD" */
function skinDdayToday(now) {

  const at = now instanceof Date ? now : new Date();

  try {

    const parts =
      new Intl.DateTimeFormat("en-US", {
        timeZone: SKIN_DDAY_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(at);

    const get = (type) => (parts.find((part) => part.type === type) || {}).value;

    return `${get("year")}-${get("month")}-${get("day")}`;

  } catch (err) {

    /* Intl 시간대가 없는 환경 — UTC+9 로 직접 */
    const shifted = new Date(at.getTime() + 9 * 3600 * 1000);

    return shifted.toISOString().slice(0, 10);

  }

}


/*
  buildSkinDdayContext({ date, label }, now) -> 바인딩 값 | null

  당일을 1일로 센다(한국에서 흔한 "만난 지 N일"). 앞날이면 D-N.
*/
function buildSkinDdayContext(dday, now) {

  const value = normalizeSkinDday(dday);

  if (!value) {
    return null;
  }

  const toUtc = (text) => Date.UTC(Number(text.slice(0, 4)), Number(text.slice(5, 7)) - 1, Number(text.slice(8, 10)));

  const diff = Math.round((toUtc(skinDdayToday(now)) - toUtc(value.date)) / 86400000);

  const isFuture = diff < 0;

  const days = isFuture ? 0 : diff + 1;

  const until = isFuture ? -diff : 0;

  return {
    date: value.date,
    label: value.label,
    days,
    until,
    isFuture,
    isToday: diff === 0,
    display: isFuture ? `D-${until.toLocaleString("en-US")}` : days.toLocaleString("en-US")
  };

}


/* =========================================================
   4. 렌더 재료 — resolveSkinTemplate() 이 싣는 모양

     settings = { colors?, photos?, dday? }

   설정 항목이 하나도 없으면 undefined(키를 만들지 않는다).
========================================================== */

function buildSkinSettingsRenderSetting(skinPackage) {

  const regions = skinPackage && skinPackage.regions;

  const setting = {};

  const colors = readSkinThemeColors(regions);

  if (colors) {
    setting.colors = colors;
  }

  const photos = readSkinHomePhotosLayout(regions);

  if (photos) {
    setting.photos = photos;
  }

  const dday = readSkinDday(regions);

  if (dday) {
    setting.dday = dday.label ? { date: dday.date, label: dday.label } : { date: dday.date };
  }

  return Object.keys(setting).length ? setting : undefined;

}


/*
  프레임/Preview 봉투에서 온 값 — 알려진 칸을 새 리터럴에 옮긴다.
  틀린 칸은 버린다. 남는 것이 없으면 undefined.
*/
function coerceSkinSettingsRenderSetting(value) {

  if (!isSkinSettingsPlainObject(value)) {
    return undefined;
  }

  const setting = {};

  const colors = normalizeSkinThemeColors(value.colors);

  if (colors) {
    setting.colors = colors;
  }

  const photos = normalizeSkinHomePhotosLayout(value.photos);

  if (photos) {
    setting.photos = photos;
  }

  const dday = normalizeSkinDday(value.dday);

  if (dday) {
    setting.dday = dday.label ? { date: dday.date, label: dday.label } : { date: dday.date };
  }

  return Object.keys(setting).length ? setting : undefined;

}


/* renderSkin() 의 `settings.*` 바인딩 — 설정이 없어도 모양은 같다 */
function buildSkinSettingsContext(setting, now) {

  const value = isSkinSettingsPlainObject(setting) ? setting : {};

  return {
    dday: value.dday ? buildSkinDdayContext(value.dday, now) : null,
    photos: {
      layout: normalizeSkinHomePhotosLayout(value.photos) || "auto"
    }
  };

}


/* Studio 패널 — 이 HTML 이 D-day 바인딩을 쓰는가 */
function skinHtmlUsesDday(html) {

  return /data-imory-(if|bind)\s*=\s*["']settings\.dday\b/i.test(String(html || ""));

}


const SKIN_SETTINGS_EXPORTS = {
  SKIN_SETTINGS_REGION_NAMES,
  SKIN_THEME_COLOR_ROLES,
  SKIN_THEME_COLOR_VARS,
  SKIN_HOME_PHOTO_LAYOUTS,
  SKIN_DDAY_LABEL_MAX,
  SKIN_PHOTOS_ATTRIBUTE_RULES,
  findSkinSettingsEntry,
  normalizeSkinThemeColor,
  normalizeSkinThemeColors,
  readSkinThemeColors,
  writeSkinThemeColors,
  readSkinThemeColorDefaults,
  skinCssUsesThemeColors,
  buildSkinThemeColorsCss,
  skinColorLuminance,
  skinColorContrast,
  normalizeSkinHomePhotosLayout,
  readSkinHomePhotosLayout,
  writeSkinHomePhotosLayout,
  decideSkinHomePhotosLayout,
  isSkinPhotosAttributeName,
  sanitizeSkinPhotosAttributeValue,
  skinHtmlHasPhotoSet,
  skinHtmlPhotoSlotNames,
  compileSkinPhotos,
  normalizeSkinDdayDate,
  normalizeSkinDdayLabel,
  readSkinDday,
  readSkinDdayDraft,
  writeSkinDday,
  skinDdayToday,
  buildSkinDdayContext,
  buildSkinSettingsRenderSetting,
  coerceSkinSettingsRenderSetting,
  buildSkinSettingsContext,
  skinHtmlUsesDday
};


if (typeof window !== "undefined") {
  Object.keys(SKIN_SETTINGS_EXPORTS).forEach((key) => {
    window[key] = SKIN_SETTINGS_EXPORTS[key];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SKIN_SETTINGS_EXPORTS;
}
