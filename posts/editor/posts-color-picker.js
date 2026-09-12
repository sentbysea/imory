/* =========================================================
   POSTS - EDITOR: 색 고르기 팝오버 (HIGHLIGHT · POINT COLOR ·
   강조선 공용)

   ★ 무엇을 고쳤나 (요구사항 1)

     예전에는 <input type="color"> 하나로 색을 골랐다. 그건 OS/
     브라우저가 띄우는 창이라

       - 스펙트럼에서 색을 한 번 누르면 그대로 창이 닫혀서 이어서
         조정할 수 없었고(모바일 특히),
       - 창이 뜨는 순간 본문 선택이 풀리거나 포커스가 옮겨갔고,
       - change가 뜰 때마다 applyEditorHighlight가 undo 스냅샷을
         찍어서 드래그 한 번에 undo가 수십 칸 쌓였고,
       - "취소하고 원래대로"라는 길이 아예 없었다.

     그래서 우리가 직접 그리는 팝오버로 바꾼다. 이 파일은 색을
     고르는 일만 하고, 그 색을 본문에 어떻게 바르는지는 전혀
     모른다(호출부가 콜백으로 넘긴다).

   ★ 닫히는 길은 셋, 그중 확정은 하나뿐이다

       Apply        확정. 지금 색 그대로 둔다.
       Cancel       열기 전 상태로 되돌린다.
       바깥 클릭    Cancel과 완전히 같다.
       Escape       Cancel과 완전히 같다.

     "고르다 만 색이 슬그머니 저장되는" 일이 없다.

   ★ 선택 영역을 잃지 않는다

     팝오버 안에서 누르는 모든 곳이 pointerdown에서
     preventDefault()를 건다 — 본문의 선택이 풀리지도, 포커스가
     옮겨가지도 않는다. 값을 직접 타이핑하는 hex 칸만 예외이고,
     그 칸은 포커스를 받아도 호출부가 들고 있는 savedEditorRange로
     매번 같은 자리에 칠한다.

   classic script. 다른 파일에 의존하지 않는다.
========================================================== */


/* =========================================================
   색 변환
========================================================== */

function imoryColorClampHex(
  value,
  fallback
) {

  const text =
    String(
      value ||
      ""
    ).trim();


  if (
    /^#[0-9a-fA-F]{6}$/.test(
      text
    )
  ) {

    return text.toLowerCase();

  }


  if (
    /^#[0-9a-fA-F]{3}$/.test(
      text
    )
  ) {

    return (
      "#" +
      text
        .slice(1)
        .split("")
        .map(
          ch =>
            ch + ch
        )
        .join("")
        .toLowerCase()
    );

  }


  return fallback ||
    "#000000";

}


function imoryColorHexToHsv(
  hex
) {

  const safe =
    imoryColorClampHex(
      hex,
      "#000000"
    );


  const r =
    parseInt(
      safe.slice(1, 3),
      16
    ) / 255;

  const g =
    parseInt(
      safe.slice(3, 5),
      16
    ) / 255;

  const b =
    parseInt(
      safe.slice(5, 7),
      16
    ) / 255;


  const max =
    Math.max(r, g, b);

  const min =
    Math.min(r, g, b);


  const delta =
    max - min;


  let hue =
    0;


  if (delta !== 0) {

    if (max === r) {

      hue =
        60 *
        (
          (
            (g - b) /
            delta
          ) % 6
        );

    }

    else if (max === g) {

      hue =
        60 *
        (
          (b - r) / delta +
          2
        );

    }

    else {

      hue =
        60 *
        (
          (r - g) / delta +
          4
        );

    }

  }


  if (hue < 0) {

    hue += 360;

  }


  return {

    h: hue,

    s:
      max === 0
        ? 0
        : delta / max,

    v: max

  };

}


function imoryColorHsvToHex(
  h,
  s,
  v
) {

  const c =
    v * s;


  const x =
    c *
    (
      1 -
      Math.abs(
        (
          (h / 60) % 2
        ) - 1
      )
    );


  const m =
    v - c;


  let parts =
    [0, 0, 0];


  if (h < 60) {
    parts = [c, x, 0];
  }

  else if (h < 120) {
    parts = [x, c, 0];
  }

  else if (h < 180) {
    parts = [0, c, x];
  }

  else if (h < 240) {
    parts = [0, x, c];
  }

  else if (h < 300) {
    parts = [x, 0, c];
  }

  else {
    parts = [c, 0, x];
  }


  return (
    "#" +
    parts
      .map(
        part => {

          const value =
            Math.round(
              (
                part + m
              ) * 255
            );


          return Math.min(
            255,
            Math.max(
              0,
              value
            )
          )
            .toString(16)
            .padStart(2, "0");

        }
      )
      .join("")
  );

}



/* =========================================================
   상태
========================================================== */

let imoryColorPickerRoot =
  null;

let imoryColorPickerSession =
  null;


/*
  최근에 확정한 색. 다음에 열 때 아래쪽 스와치 줄에 나온다 —
  같은 색을 여러 군데 칠할 때 매번 다시 고르지 않아도 된다.
*/

let imoryColorPickerRecent =
  [];


const IMORY_COLOR_PICKER_RECENT_MAX =
  8;



/* =========================================================
   팝오버 만들기 (한 번만)
========================================================== */

function ensureImoryColorPicker() {

  if (imoryColorPickerRoot) {

    return imoryColorPickerRoot;

  }


  const root =
    document.createElement(
      "div"
    );


  root.className =
    "imory-color-picker";


  root.setAttribute(
    "role",
    "dialog"
  );


  root.hidden =
    true;


  root.innerHTML =
    `
      <div class="imory-color-picker-field" data-role="field">
        <div class="imory-color-picker-field-white"></div>
        <div class="imory-color-picker-field-black"></div>
        <span class="imory-color-picker-field-thumb" data-role="field-thumb"></span>
      </div>

      <input
        class="imory-color-picker-hue imory-range imory-range--hue"
        data-role="hue"
        type="range"
        min="0"
        max="360"
        step="1"
        aria-label="hue"
      >

      <div class="imory-color-picker-readout">

        <span class="imory-color-picker-chip" data-role="chip"></span>

        <input
          class="imory-color-picker-hex"
          data-role="hex"
          type="text"
          spellcheck="false"
          autocomplete="off"
          maxlength="7"
          aria-label="hex"
        >

      </div>

      <div class="imory-color-picker-swatches" data-role="swatches"></div>

      <div class="imory-color-picker-actions">

        <button
          class="imory-color-picker-button"
          data-role="remove"
          type="button"
          hidden
        >remove</button>

        <span class="imory-color-picker-spacer"></span>

        <button
          class="imory-color-picker-button"
          data-role="cancel"
          type="button"
        >cancel</button>

        <button
          class="imory-color-picker-button is-primary"
          data-role="apply"
          type="button"
        >apply</button>

      </div>
    `;


  document.body.appendChild(
    root
  );


  imoryColorPickerRoot =
    root;


  bindImoryColorPicker(
    root
  );


  return root;

}


function imoryColorPickerPart(
  role
) {

  return imoryColorPickerRoot
    ?.querySelector(
      `[data-role="${role}"]`
    );

}



/* =========================================================
   값 갱신
========================================================== */

function setImoryColorPickerValue(
  hex,
  options = {}
) {

  if (!imoryColorPickerSession) {
    return;
  }


  const safe =
    imoryColorClampHex(
      hex,
      imoryColorPickerSession.color
    );


  imoryColorPickerSession.color =
    safe;


  const hsv =
    imoryColorHexToHsv(
      safe
    );


  /*
    ★ 회색/검정/흰색은 hue를 되돌릴 수 없다(s나 v가 0이면 hue
    정보가 사라진다). 그럴 때는 사용자가 마지막으로 잡고 있던
    hue를 그대로 유지해야 사각형 안에서 색이 튀지 않는다.
  */

  if (
    hsv.s > 0 &&
    hsv.v > 0
  ) {

    imoryColorPickerSession.hue =
      hsv.h;

  }


  imoryColorPickerSession.saturation =
    hsv.s;

  imoryColorPickerSession.value =
    hsv.v;


  syncImoryColorPickerUI(
    options
  );


  if (
    imoryColorPickerSession.onPreview
  ) {

    imoryColorPickerSession.onPreview(
      safe
    );

  }

}


function syncImoryColorPickerUI(
  options = {}
) {

  if (!imoryColorPickerSession) {
    return;
  }


  const session =
    imoryColorPickerSession;


  const field =
    imoryColorPickerPart(
      "field"
    );


  if (field) {

    field.style.backgroundColor =
      imoryColorHsvToHex(
        session.hue,
        1,
        1
      );

  }


  const thumb =
    imoryColorPickerPart(
      "field-thumb"
    );


  if (thumb) {

    thumb.style.left =
      `${session.saturation * 100}%`;


    thumb.style.top =
      `${(1 - session.value) * 100}%`;


    thumb.style.backgroundColor =
      session.color;

  }


  const hue =
    imoryColorPickerPart(
      "hue"
    );


  if (
    hue &&
    options.skipHue !== true
  ) {

    hue.value =
      String(
        Math.round(
          session.hue
        )
      );

  }


  const chip =
    imoryColorPickerPart(
      "chip"
    );


  if (chip) {

    chip.style.backgroundColor =
      session.color;

  }


  const hex =
    imoryColorPickerPart(
      "hex"
    );


  if (
    hex &&
    options.skipHex !== true
  ) {

    hex.value =
      session.color;

  }

}


function renderImoryColorPickerSwatches() {

  const host =
    imoryColorPickerPart(
      "swatches"
    );


  if (
    !host ||
    !imoryColorPickerSession
  ) {
    return;
  }


  host.replaceChildren();


  const list =
    [];


  const push =
    color => {

      const safe =
        imoryColorClampHex(
          color,
          ""
        );


      if (
        /^#[0-9a-f]{6}$/.test(
          safe
        ) &&
        !list.includes(safe)
      ) {

        list.push(
          safe
        );

      }

    };


  /* 프리셋 기본값이 언제나 맨 앞 */

  push(
    imoryColorPickerSession.presetColor
  );


  imoryColorPickerRecent.forEach(
    push
  );


  list
    .slice(
      0,
      IMORY_COLOR_PICKER_RECENT_MAX + 1
    )
    .forEach(
      color => {

        const swatch =
          document.createElement(
            "button"
          );


        swatch.type =
          "button";


        swatch.className =
          "imory-color-picker-swatch";


        swatch.style.backgroundColor =
          color;


        swatch.title =
          color;


        swatch.addEventListener(
          "click",
          () => {

            setImoryColorPickerValue(
              color
            );

          }
        );


        host.appendChild(
          swatch
        );

      }
    );

}



/* =========================================================
   입력 묶기
========================================================== */

function bindImoryColorPicker(
  root
) {

  /*
    ★ 팝오버 안에서 일어나는 pointerdown은 전부 기본 동작을
    막는다 — 본문의 선택이 풀리거나 포커스가 옮겨가지 않게.
    직접 타이핑하는 hex 칸만 예외다.
  */

  root.addEventListener(
    "pointerdown",
    event => {

      const isTextInput =
        event.target
          ?.getAttribute
          ?.("type") === "text";


      if (!isTextInput) {

        event.preventDefault();

      }


      event.stopPropagation();

    }
  );


  const field =
    root.querySelector(
      '[data-role="field"]'
    );


  const pickFromField =
    event => {

      const rect =
        field.getBoundingClientRect();


      const x =
        Math.min(
          1,
          Math.max(
            0,
            (
              event.clientX -
              rect.left
            ) / Math.max(1, rect.width)
          )
        );


      const y =
        Math.min(
          1,
          Math.max(
            0,
            (
              event.clientY -
              rect.top
            ) / Math.max(1, rect.height)
          )
        );


      if (!imoryColorPickerSession) {
        return;
      }


      setImoryColorPickerValue(
        imoryColorHsvToHex(
          imoryColorPickerSession.hue,
          x,
          1 - y
        )
      );

    };


  /*
    ★ 드래그가 끝날 때까지 창은 열려 있고, 그동안의 모든 색
    변화는 undo에 쌓이지 않는다(호출부의 onPreview가 스냅샷을
    찍지 않는 경로를 쓴다). 손가락을 놓아도 닫히지 않는다 —
    닫는 길은 Apply/Cancel/바깥클릭/Escape뿐이다.
  */

  field?.addEventListener(
    "pointerdown",
    event => {

      field.setPointerCapture?.(
        event.pointerId
      );


      pickFromField(
        event
      );

    }
  );


  field?.addEventListener(
    "pointermove",
    event => {

      if (
        event.buttons === 0
      ) {
        return;
      }


      pickFromField(
        event
      );

    }
  );


  const hue =
    root.querySelector(
      '[data-role="hue"]'
    );


  hue?.addEventListener(
    "input",
    () => {

      if (!imoryColorPickerSession) {
        return;
      }


      imoryColorPickerSession.hue =
        Number(
          hue.value
        ) ||
        0;


      setImoryColorPickerValue(
        imoryColorHsvToHex(
          imoryColorPickerSession.hue,
          imoryColorPickerSession.saturation,
          imoryColorPickerSession.value
        ),
        {
          skipHue: true
        }
      );

    }
  );


  const hex =
    root.querySelector(
      '[data-role="hex"]'
    );


  hex?.addEventListener(
    "input",
    () => {

      const text =
        String(
          hex.value ||
          ""
        ).trim();


      if (
        !/^#?[0-9a-fA-F]{6}$/.test(
          text
        ) &&
        !/^#?[0-9a-fA-F]{3}$/.test(
          text
        )
      ) {

        return;

      }


      setImoryColorPickerValue(
        text.startsWith("#")
          ? text
          : `#${text}`,
        {
          skipHex: true
        }
      );

    }
  );


  root
    .querySelector(
      '[data-role="apply"]'
    )
    ?.addEventListener(
      "click",
      () => {

        closeImoryColorPicker(
          "apply"
        );

      }
    );


  root
    .querySelector(
      '[data-role="cancel"]'
    )
    ?.addEventListener(
      "click",
      () => {

        closeImoryColorPicker(
          "cancel"
        );

      }
    );


  root
    .querySelector(
      '[data-role="remove"]'
    )
    ?.addEventListener(
      "click",
      () => {

        closeImoryColorPicker(
          "remove"
        );

      }
    );

}


/*
  바깥 클릭 / Escape — 둘 다 Cancel과 같다.

  capture 단계에서 듣는다: 팝오버 밖에서 일어난 pointerdown을
  다른 핸들러(예: 본문의 선택 처리)보다 먼저 보고 되돌려야,
  "취소했는데 그 사이 선택이 바뀌어 엉뚱한 자리가 남는" 일이
  없다.
*/

document.addEventListener(
  "pointerdown",
  event => {

    if (
      !imoryColorPickerSession ||
      !imoryColorPickerRoot
    ) {
      return;
    }


    if (
      imoryColorPickerRoot.contains(
        event.target
      )
    ) {
      return;
    }


    if (
      imoryColorPickerSession.anchor
        ?.contains?.(
          event.target
        )
    ) {
      return;
    }


    closeImoryColorPicker(
      "cancel"
    );

  },
  true
);


document.addEventListener(
  "keydown",
  event => {

    if (!imoryColorPickerSession) {
      return;
    }


    if (
      event.key === "Escape"
    ) {

      event.preventDefault();


      closeImoryColorPicker(
        "cancel"
      );

    }


    else if (
      event.key === "Enter" &&
      event.target
        ?.getAttribute
        ?.("type") === "text"
    ) {

      event.preventDefault();


      closeImoryColorPicker(
        "apply"
      );

    }

  },
  true
);



/* =========================================================
   열고 닫기
========================================================== */

/*
  options

    anchor        팝오버를 붙일 기준 요소(버튼)
    color         지금 색
    presetColor   프리셋 기본값(스와치 맨 앞에 고정)
    onPreview     (hex) => void   — 드래그 중 실시간 미리보기.
                  ★ 여기서는 undo 스냅샷을 찍지 않는다.
    onApply       (hex) => void   — 확정
    onCancel      () => void      — 열기 전 상태로 복원
    onRemove      () => void      — 서식 자체를 없앤다(선택)
    removeLabel   remove 버튼 라벨
*/

function openImoryColorPicker(
  options = {}
) {

  /*
    이미 열려 있으면 먼저 조용히 취소하고 새로 연다 — 두 세션이
    겹쳐서 서로의 복원을 덮어쓰지 않게.
  */

  if (imoryColorPickerSession) {

    closeImoryColorPicker(
      "cancel"
    );

  }


  const root =
    ensureImoryColorPicker();


  const startColor =
    imoryColorClampHex(
      options.color,
      "#000000"
    );


  imoryColorPickerSession =
    {

      anchor:
        options.anchor ||
        null,

      color:
        startColor,

      startColor,

      presetColor:
        options.presetColor ||
        startColor,

      hue: 0,

      saturation: 0,

      value: 0,

      onPreview:
        options.onPreview ||
        null,

      onApply:
        options.onApply ||
        null,

      onCancel:
        options.onCancel ||
        null,

      onRemove:
        options.onRemove ||
        null

    };


  const hsv =
    imoryColorHexToHsv(
      startColor
    );


  imoryColorPickerSession.hue =
    hsv.h;

  imoryColorPickerSession.saturation =
    hsv.s;

  imoryColorPickerSession.value =
    hsv.v;


  const remove =
    imoryColorPickerPart(
      "remove"
    );


  if (remove) {

    remove.hidden =
      !options.onRemove;


    remove.textContent =
      options.removeLabel ||
      "remove";

  }


  root.hidden =
    false;


  renderImoryColorPickerSwatches();


  syncImoryColorPickerUI();


  positionImoryColorPicker(
    options.anchor
  );

}


function positionImoryColorPicker(
  anchor
) {

  const root =
    imoryColorPickerRoot;


  if (!root) {
    return;
  }


  const gap =
    8;


  const size =
    root.getBoundingClientRect();


  const rect =
    anchor
      ?.getBoundingClientRect?.() ||
    {
      top: window.innerHeight / 2,
      bottom: window.innerHeight / 2,
      left: window.innerWidth / 2,
      width: 0
    };


  let top =
    rect.bottom + gap;


  if (
    top + size.height >
    window.innerHeight - gap
  ) {

    top =
      Math.max(
        gap,
        rect.top - size.height - gap
      );

  }


  let left =
    rect.left +
    rect.width / 2 -
    size.width / 2;


  left =
    Math.max(
      gap,
      Math.min(
        left,
        window.innerWidth -
          size.width -
          gap
      )
    );


  root.style.top =
    `${top}px`;


  root.style.left =
    `${left}px`;

}


function rememberImoryColorPickerColor(
  color
) {

  const safe =
    imoryColorClampHex(
      color,
      ""
    );


  if (
    !/^#[0-9a-f]{6}$/.test(
      safe
    )
  ) {
    return;
  }


  imoryColorPickerRecent =
    [
      safe,
      ...imoryColorPickerRecent.filter(
        item =>
          item !== safe
      )
    ]
      .slice(
        0,
        IMORY_COLOR_PICKER_RECENT_MAX
      );

}


function closeImoryColorPicker(
  reason
) {

  const session =
    imoryColorPickerSession;


  if (!session) {
    return;
  }


  /*
    ★ 먼저 세션을 비운다. 아래 콜백이 본문을 고치면서
    selectionchange 등을 일으키는데, 그때 이 팝오버가 아직
    "열린 것"으로 보이면 바깥 클릭 핸들러가 다시 들어온다.
  */

  imoryColorPickerSession =
    null;


  if (imoryColorPickerRoot) {

    imoryColorPickerRoot.hidden =
      true;

  }


  if (
    reason === "apply"
  ) {

    rememberImoryColorPickerColor(
      session.color
    );


    session.onApply?.(
      session.color
    );

  }


  else if (
    reason === "remove"
  ) {

    session.onRemove?.();

  }


  else {

    session.onCancel?.();

  }

}


function isImoryColorPickerOpen() {

  return Boolean(
    imoryColorPickerSession
  );

}
