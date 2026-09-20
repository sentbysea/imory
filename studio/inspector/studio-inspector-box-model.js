/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 상자 컨트롤의 값 규칙
   (COMMON-SELECT-BOX-1)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §20

   Select 패널이 색에서 시작하지 않고 **크기 · 자리 · 여백**에서
   시작하도록, 실제 박스를 가진 요소가 쓰는 컨트롤 여덟의 값 규칙을
   모아 둔다. studio-inspector-model.js 의 buildInspectorStylePatch() /
   readInspectorControlValue() 가 모르는 이름을 여기로 넘긴다.

     boxWidth   width · max-width
     boxHeight  height · min-height
     boxPlace   margin-left · margin-right      (상자 위치 + 좌우 간격)
     boxSpace   margin-top · margin-bottom      (위 · 아래 간격)
     boxPad     padding 네 방향
     boxAlign   text-align · justify-content · align-items ·
                justify-items · align-content   (내용 정렬 가로 · 세로)
     boxBorder  border
     boxRadius  border-radius

   ★ 속성을 두 컨트롤이 함께 갖지 않는다

   위 표에서 보듯 한 속성의 주인은 언제나 하나다. 그래서 "상자를
   가운데 두고 글자는 왼쪽" 같은 조합이 서로를 덮지 않는다 —
   상자 위치는 margin 만, 내용 정렬은 align 계열만 건드린다.
   `display` 는 어느 컨트롤도 쓰지 않는다: 숨기기(display:none)와
   싸우지 않기 위해서다. 블록 상자의 세로 정렬은 display 를 flex 로
   바꾸는 대신 `align-content` 한 줄로 한다.

   ★ 왜 !important 인가

   스킨은 제 자리를 대개 특정도 높은 선택자로 정한다
   (`.ied-photos[data-imory-photos-layout="hero"] .ied-caption` =
   0,3,0). 직접 수정 규칙의 선택자는 0,2,0 이라 그대로는 **숫자만
   바뀌고 화면은 그대로**다 — 사용자가 "무효"라고 느끼는 자리다.
   자르기(IMORY_IMAGE_CROP_PRIORITY_DESIGN.md)와 "사진 영역 너비"가
   이미 같은 판단을 했다: 사람이 손으로 정한 크기·자리는 스킨의
   기본값을 이긴다. 색·글꼴 같은 기존 컨트롤은 지금까지의 무게
   그대로 둔다(바뀌면 이미 저장된 스킨의 그림이 달라진다).

   읽을 때는 표식을 떼고 본다 — 예전에 !important 없이 저장된
   값(legacy `padding: 18px`)도 그대로 읽힌다.

   의존(호출 시점): studio/inspector/studio-inspector-model.js
   (inspectorLengthPx · INSPECTOR_COLOR_PATTERN).
========================================================== */


const INSPECTOR_BOX_MAX_LENGTH = 2000;

const INSPECTOR_BOX_MAX_SPACE = 400;

const INSPECTOR_BOX_ALIGN_KEYS = ["start", "center", "end"];

/* 고른 요소가 제 내용을 어떻게 늘어놓고 있는가 -> 가로·세로 정렬이
   실제로 듣는 속성. 화면에서 잰 display 로 정한다(짐작하지 않는다). */
const INSPECTOR_BOX_ALIGN_MODES = {
  block: { x: "text-align", y: "align-content" },
  "flex-row": { x: "justify-content", y: "align-items" },
  "flex-col": { x: "align-items", y: "justify-content" },
  grid: { x: "justify-items", y: "align-items" }
};

const INSPECTOR_BOX_ALIGN_PROPERTIES =
  ["text-align", "justify-content", "align-items", "justify-items", "align-content"];


function inspectorBoxImportant(value) {
  return `${value} !important`;
}


/* 값에서 !important 표식을 떼고 본다 */
function inspectorBoxPlain(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/\s*!\s*important\s*$/i, "")
    .trim();
}


function inspectorBoxPx(value, max) {
  return inspectorLengthPx(value, max || INSPECTOR_BOX_MAX_LENGTH);
}


function inspectorBoxReadPx(value) {

  const plain =
    inspectorBoxPlain(value);

  return /^\d+px$/.test(plain) ? plain.slice(0, -2) : "";

}


function inspectorBoxClear(properties) {

  const patch = {};

  properties.forEach((property) => {
    patch[property] = null;
  });

  return patch;

}


/* =========================================================
   가로 · 세로 정렬의 값

   justify-items 와 align-content 는 start/center/end 를, flex 의
   justify-content/align-items 는 flex-start/center/flex-end 를 쓴다.
   text-align 은 left/center/right 다.
========================================================== */

function inspectorBoxAlignValue(property, key) {

  if (property === "text-align") {
    return { start: "left", center: "center", end: "right" }[key];
  }

  if (property === "justify-items" || property === "align-content") {
    return key;
  }

  return { start: "flex-start", center: "center", end: "flex-end" }[key];

}


function inspectorBoxAlignKey(property, value) {

  const plain =
    inspectorBoxPlain(value);

  if (!plain) {
    return "";
  }

  return (
    INSPECTOR_BOX_ALIGN_KEYS.find(
      (key) => inspectorBoxAlignValue(property, key) === plain
    ) || ""
  );

}


function inspectorBoxAlignMode(mode) {
  return INSPECTOR_BOX_ALIGN_MODES[mode] || INSPECTOR_BOX_ALIGN_MODES.block;
}


/* =========================================================
   buildInspectorBoxStylePatch(control, value)

   반환값은 "이 컨트롤이 소유하는 속성 -> 값(또는 null=제거)" 이다.
   모르는 이름이면 null 을 돌려주어 호출자가 예전 표로 넘어간다.
========================================================== */

function buildInspectorBoxStylePatch(control, value) {

  const object =
    (value !== null && typeof value === "object") ? value : {};

  switch (control) {

    /* 가로 — 자동 · 내용 맞춤 · 부모 폭 맞춤 · 직접 입력 */
    case "boxWidth": {

      const mode =
        object.mode || String(value === null || value === undefined ? "" : value);

      if (mode === "content") {
        return {
          width: inspectorBoxImportant("fit-content"),
          "max-width": inspectorBoxImportant("100%")
        };
      }

      if (mode === "fill") {
        return {
          width: inspectorBoxImportant("100%"),
          "max-width": inspectorBoxImportant("100%")
        };
      }

      if (mode === "fixed") {

        const length =
          inspectorBoxPx(object.px);

        return length
          ? {
              width: inspectorBoxImportant(length),
              /* 좁은 화면에서 가로 넘침이 생기지 않는 것은 이 한
                 줄 덕분이다 — 데스크톱에서 고른 px 가 모바일까지
                 따라가도 칸을 넘지 않는다. */
              "max-width": inspectorBoxImportant("100%")
            }
          : inspectorBoxClear(["width", "max-width"]);

      }

      return inspectorBoxClear(["width", "max-width"]);

    }

    /* 세로 — 자동 · 최소 높이 · 직접 입력 */
    case "boxHeight": {

      const mode =
        object.mode || String(value === null || value === undefined ? "" : value);

      const length =
        inspectorBoxPx(object.px);

      if (mode === "min" && length) {
        return { "min-height": inspectorBoxImportant(length), height: null };
      }

      if (mode === "fixed" && length) {
        return { height: inspectorBoxImportant(length), "min-height": null };
      }

      return inspectorBoxClear(["height", "min-height"]);

    }

    /* 상자 위치 + 좌우 바깥 간격 — 한 컨트롤이 margin 좌우를 갖는다.
       둘을 따로 두면 "가운데(auto)"와 "좌우 간격(px)"이 같은 속성을
       두고 서로를 덮는다. */
    case "boxPlace": {

      const place =
        String(object.place || "");

      const side =
        inspectorBoxPx(object.side, INSPECTOR_BOX_MAX_SPACE);

      const edge =
        side || "0";

      if (place === "left") {
        return {
          "margin-left": inspectorBoxImportant(edge),
          "margin-right": inspectorBoxImportant("auto")
        };
      }

      if (place === "center") {
        return {
          "margin-left": inspectorBoxImportant("auto"),
          "margin-right": inspectorBoxImportant("auto")
        };
      }

      if (place === "right") {
        return {
          "margin-left": inspectorBoxImportant("auto"),
          "margin-right": inspectorBoxImportant(edge)
        };
      }

      return side
        ? {
            "margin-left": inspectorBoxImportant(side),
            "margin-right": inspectorBoxImportant(side)
          }
        : inspectorBoxClear(["margin-left", "margin-right"]);

    }

    /* 위 · 아래 바깥 간격 */
    case "boxSpace": {

      const top =
        inspectorBoxPx(object.top, INSPECTOR_BOX_MAX_SPACE);

      const bottom =
        inspectorBoxPx(object.bottom, INSPECTOR_BOX_MAX_SPACE);

      return {
        "margin-top": top ? inspectorBoxImportant(top) : null,
        "margin-bottom": bottom ? inspectorBoxImportant(bottom) : null
      };

    }

    /* 안쪽 여백 — 언제나 네 방향 longhand 다. 줄임 표기(`padding`)와
       섞으면 어느 쪽이 나중에 적히느냐에 따라 결과가 달라진다. */
    case "boxPad": {

      const patch =
        { padding: null };

      ["top", "right", "bottom", "left"].forEach((side) => {

        const length =
          inspectorBoxPx(object[side], INSPECTOR_BOX_MAX_SPACE);

        patch[`padding-${side}`] =
          length ? inspectorBoxImportant(length) : null;

      });

      return patch;

    }

    /* 내용 정렬 — 가로와 세로를 한 번에 쓴다(속성 주인이 하나) */
    case "boxAlign": {

      const map =
        inspectorBoxAlignMode(object.mode);

      const patch =
        inspectorBoxClear(INSPECTOR_BOX_ALIGN_PROPERTIES);

      if (INSPECTOR_BOX_ALIGN_KEYS.includes(String(object.x))) {
        patch[map.x] = inspectorBoxImportant(inspectorBoxAlignValue(map.x, String(object.x)));
      }

      if (INSPECTOR_BOX_ALIGN_KEYS.includes(String(object.y))) {
        patch[map.y] = inspectorBoxImportant(inspectorBoxAlignValue(map.y, String(object.y)));
      }

      return patch;

    }

    /* 테두리 — 없음 / 있음 / 기본. 색을 따로 고르지 않으면 지금
       글자색을 따른다(currentColor) = Layout 에서 정한 테마색이
       그대로 내려온다. */
    case "boxBorder": {

      if (object.on === false) {
        return { border: inspectorBoxImportant("0") };
      }

      if (object.on !== true) {
        return inspectorBoxClear(["border"]);
      }

      const width =
        inspectorBoxPx(object.width, 40) || "1px";

      const color =
        INSPECTOR_COLOR_PATTERN.test(String(object.color || ""))
          ? String(object.color).toLowerCase()
          : "currentColor";

      return { border: inspectorBoxImportant(`${width} solid ${color}`) };

    }

    case "boxRadius": {

      const length =
        inspectorBoxPx(value, 999);

      return length
        ? { "border-radius": inspectorBoxImportant(length) }
        : inspectorBoxClear(["border-radius"]);

    }

    default:
      return null;

  }

}


/* =========================================================
   지금 선언에서 되읽기 — 폼 prefill 용

   "설정 안 함"은 언제나 빈 문자열이다. 예전에 !important 없이
   저장된 값도 그대로 읽는다(위 inspectorBoxPlain).
========================================================== */

function readInspectorBoxControlValue(control, declarations) {

  const decl =
    declarations || {};

  switch (control) {

    case "boxWidth": {

      const width =
        inspectorBoxPlain(decl.width);

      if (width === "fit-content") {
        return { mode: "content", px: "" };
      }

      if (width === "100%") {
        return { mode: "fill", px: "" };
      }

      const px =
        inspectorBoxReadPx(decl.width);

      return px ? { mode: "fixed", px } : { mode: "", px: "" };

    }

    case "boxHeight": {

      const fixed =
        inspectorBoxReadPx(decl.height);

      if (fixed) {
        return { mode: "fixed", px: fixed };
      }

      const min =
        inspectorBoxReadPx(decl["min-height"]);

      return min ? { mode: "min", px: min } : { mode: "", px: "" };

    }

    case "boxPlace": {

      const left =
        inspectorBoxPlain(decl["margin-left"]);

      const right =
        inspectorBoxPlain(decl["margin-right"]);

      const leftPx =
        inspectorBoxReadPx(decl["margin-left"]);

      const rightPx =
        inspectorBoxReadPx(decl["margin-right"]);

      if (left === "auto" && right === "auto") {
        return { place: "center", side: "" };
      }

      if (right === "auto") {
        return { place: "left", side: leftPx === "0" ? "" : leftPx };
      }

      if (left === "auto") {
        return { place: "right", side: rightPx === "0" ? "" : rightPx };
      }

      return {
        place: "",
        side: (leftPx && leftPx === rightPx) ? leftPx : ""
      };

    }

    case "boxSpace":
      return {
        top: inspectorBoxReadPx(decl["margin-top"]),
        bottom: inspectorBoxReadPx(decl["margin-bottom"])
      };

    case "boxPad": {

      const sides =
        ["top", "right", "bottom", "left"];

      const out = {};

      sides.forEach((side) => {
        out[side] = inspectorBoxReadPx(decl[`padding-${side}`]);
      });

      /* 예전 줄임 표기(`padding: 18px`)도 읽는다 — 이 라운드 이전에
         저장된 스킨의 값이 폼에서 빈칸으로 보이지 않게. */
      if (!sides.some((side) => out[side])) {

        const parts =
          inspectorBoxPlain(decl.padding).split(/\s+/).filter(Boolean);

        const px = (value) =>
          /^\d+px$/.test(value || "") ? value.slice(0, -2) : "";

        if (parts.length === 1) {
          sides.forEach((side) => { out[side] = px(parts[0]); });
        } else if (parts.length === 2) {
          out.top = px(parts[0]);
          out.bottom = px(parts[0]);
          out.right = px(parts[1]);
          out.left = px(parts[1]);
        } else if (parts.length === 3) {
          out.top = px(parts[0]);
          out.right = px(parts[1]);
          out.left = px(parts[1]);
          out.bottom = px(parts[2]);
        } else if (parts.length === 4) {
          out.top = px(parts[0]);
          out.right = px(parts[1]);
          out.bottom = px(parts[2]);
          out.left = px(parts[3]);
        }

      }

      return out;

    }

    case "boxBorder": {

      const border =
        inspectorBoxPlain(decl.border);

      if (!border) {
        return { on: null, width: "", color: "" };
      }

      if (border === "0" || border === "0px" || border === "none") {
        return { on: false, width: "", color: "" };
      }

      const parsed =
        /^(\d+)px\s+solid\s+(.+)$/.exec(border);

      return parsed
        ? {
            on: true,
            width: parsed[1],
            color: INSPECTOR_COLOR_PATTERN.test(parsed[2]) ? parsed[2].toLowerCase() : ""
          }
        : { on: true, width: "", color: "" };

    }

    case "boxRadius":
      return inspectorBoxReadPx(decl["border-radius"]);

    default:
      return undefined;

  }

}


/* 내용 정렬의 지금 값 — 어느 속성에 적혀 있는지는 mode 가 정한다 */
function readInspectorBoxAlign(declarations, mode) {

  const decl =
    declarations || {};

  const map =
    inspectorBoxAlignMode(mode);

  return {
    x: inspectorBoxAlignKey(map.x, decl[map.x]),
    y: inspectorBoxAlignKey(map.y, decl[map.y])
  };

}


if (typeof window !== "undefined") {
  window.buildInspectorBoxStylePatch = buildInspectorBoxStylePatch;
  window.readInspectorBoxControlValue = readInspectorBoxControlValue;
  window.readInspectorBoxAlign = readInspectorBoxAlign;
  window.INSPECTOR_BOX_ALIGN_MODES = INSPECTOR_BOX_ALIGN_MODES;
}
