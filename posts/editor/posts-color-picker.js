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

     그래서 우리가 직접 그리는 팝오버로 바꿨다. 이 파일은 색을
     고르는 일만 하고, 그 색을 본문에 어떻게 바르는지는 전혀
     모른다(호출부가 콜백으로 넘긴다).

   ★ 그 뒤 — 기본 피커가 다시 기본값이 되었다 (이 파일 아래쪽)

     위 네 가지는 전부 **기본 피커 탓이 아니었다**. 색이 바뀔
     때마다 우리 코드가 contenteditable을 다시 만들고 문서 선택을
     갈아끼운 탓이다(그리고 `restoreEditorSelection()`이 자리가
     같아도 선택을 다시 설정해 selectionchange가 초당 1만 번 넘게
     돌았다). 그 둘을 고친 뒤로는, 손가락이 주 입력인 기기에서
     **OS 기본 색상 선택기**를 쓴다 —
     `imoryColorPickerMode()` / `openImoryNativeColorPicker()`.

     이 팝오버는 제거하지 않았다. 데스크톱의 기본이자, 기본
     피커를 쓸 수 없을 때의 대안으로 그대로 남아 있다.
     자세한 내용은 IMORY_EDITOR_DECOR_DESIGN.md §10-9.

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
   pointerdown을 막은 버튼을 누를 수 있게 (공용)

   ★ 문제

     본문의 선택을 지키려면 툴바 버튼은 pointerdown에서
     preventDefault()를 걸어야 한다 — 그러지 않으면 버튼이
     포커스를 가져가면서 contenteditable의 선택이 풀린다.

     그런데 WebKit은 **터치**에서 그 preventDefault를 "이
     제스처의 합성 마우스 이벤트를 만들지 말라"로 해석해서,
     뒤따르는 click을 아예 만들지 않는다. Chromium은 만든다.
     Playwright 실측(390×844, hasTouch):

       webkit  /touch  pointerdown(prevented), pointerup
       webkit  /mouse  pointerdown(prevented), pointerup, click
       chromium/touch  pointerdown(prevented), pointerup, click
       chromium/mouse  pointerdown(prevented), pointerup, click

     그래서 "선택을 지키는 버튼"이 아이폰에서 눌리지 않았다.

   ★ 해법

     pointerup으로 실행하고, 키보드(Tab → Enter/Space)를 위해
     click도 함께 듣되 같은 누름이 두 번 처리되지 않게 막는다.
     누른 버튼에서 떼야 실행된다 — 누르고 밖으로 끌어서 놓으면
     아무 일도 없는, 버튼의 평범한 동작 그대로다.

   -> onDown  포인터가 닿는 순간(선택을 붙잡는 자리)
      onFire  실제 실행
========================================================== */

function bindImoryTapButton(
  element,
  {
    onDown,
    onFire
  }
) {

  if (!element) {
    return;
  }


  let pressed =
    false;

  let swallowClickUntil =
    0;


  element.addEventListener(
    "pointerdown",
    event => {

      event.preventDefault();


      pressed =
        true;


      onDown?.(
        event
      );

    }
  );


  element.addEventListener(
    "pointerup",
    event => {

      if (!pressed) {
        return;
      }


      pressed =
        false;


      /*
        버튼 밖에서 손을 뗐으면 실행하지 않는다.
      */

      if (
        !element.contains(
          event.target
        ) &&
        event.target !== element
      ) {

        return;

      }


      swallowClickUntil =
        Date.now() + 700;


      onFire(
        event
      );

    }
  );


  element.addEventListener(
    "pointercancel",
    () => {

      pressed =
        false;

    }
  );


  element.addEventListener(
    "click",
    event => {

      if (
        Date.now() < swallowClickUntil
      ) {

        swallowClickUntil =
          0;


        return;

      }


      onFire(
        event
      );

    }
  );

}


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


  /* =========================================================
     Apply / Cancel / remove

     ★ 왜 click이 아니라 pointerup인가 (실측)

       바로 위의 root pointerdown 핸들러가 preventDefault()를
       건다(본문 선택을 지키기 위해서다). WebKit은 **터치**에서
       그 preventDefault를 "이 제스처의 합성 마우스 이벤트를
       만들지 말라"로 해석해서, 뒤따르는 click을 아예 만들지
       않는다. Chromium은 만든다. 실측:

         webkit  /touch  pointerdown(prevented), pointerup
         webkit  /mouse  pointerdown(prevented), pointerup, click
         chromium/touch  pointerdown(prevented), pointerup, click
         chromium/mouse  pointerdown(prevented), pointerup, click

       그래서 아이폰에서는 apply/cancel이 눌리지 않았고 창도
       닫히지 않았다(바깥 클릭 감지는 팝오버 안을 건너뛰므로).
       mock 테스트가 chromium이라 이 차이를 못 잡았다.

     ★ pointerup만으로 끝내지 않는 이유

       키보드(Tab → Enter/Space)는 pointer 이벤트를 내지 않고
       click만 낸다. 그래서 둘 다 듣되, 같은 누름이 두 번
       처리되지 않게 pointerup이 처리한 직후의 click 한 번은
       흘려보낸다.

     ★ 누른 버튼에서 떼야 실행된다

       pointerdown 때의 버튼과 pointerup 때의 버튼이 같을 때만
       동작한다 — 누르고 밖으로 끌어서 놓으면 취소되는, 버튼의
       평범한 동작 그대로다.
  ========================================================= */

  let pressedRole =
    null;

  let swallowClickUntil =
    0;


  const roleAt =
    target =>
      target
        ?.closest?.(
          '[data-role="apply"],' +
          '[data-role="cancel"],' +
          '[data-role="remove"]'
        )
        ?.getAttribute(
          "data-role"
        ) ||
      null;


  root.addEventListener(
    "pointerdown",
    event => {

      pressedRole =
        roleAt(
          event.target
        );

    }
  );


  root.addEventListener(
    "pointerup",
    event => {

      const role =
        roleAt(
          event.target
        );


      const pressed =
        pressedRole;


      pressedRole =
        null;


      if (
        !role ||
        role !== pressed
      ) {
        return;
      }


      swallowClickUntil =
        Date.now() + 700;


      closeImoryColorPicker(
        role
      );

    }
  );


  /*
    포인터가 팝오버 밖에서 떨어지면 "누른 상태"를 푼다 — 다음
    누름이 엉뚱하게 이어지지 않게.
  */

  root.addEventListener(
    "pointercancel",
    () => {

      pressedRole =
        null;

    }
  );


  root.addEventListener(
    "click",
    event => {

      const role =
        roleAt(
          event.target
        );


      if (!role) {
        return;
      }


      /* 방금 pointerup이 처리한 그 누름이면 흘려보낸다 */

      if (
        Date.now() < swallowClickUntil
      ) {

        swallowClickUntil =
          0;


        return;

      }


      closeImoryColorPicker(
        role
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


/* =========================================================
   기본(OS) 색상 선택기 — <input type="color">

   ★ 왜 다시 꺼내는가

     사용자의 우선순위는 둘이다.

       1. 아이폰이 띄우는 **기본 색상 선택기**를 쓰는 것
       2. 색을 조정하는 동안 앱 때문에 그 창이 닫히지 않는 것

     예전에 기본 피커를 버린 이유는 "한 번 고르면 창이 닫힌다 ·
     본문 선택이 풀린다 · undo가 수십 칸 쌓인다"였다. 그런데 그
     셋은 전부 **기본 피커 탓이 아니었다**. 색이 바뀔 때마다
     우리 코드가 contenteditable을 통째로 다시 만들고 문서 선택을
     두 번 갈아끼운 탓이다(posts/editor/format/posts-editor-highlight.js
     §live에 무엇이 벌어졌는지 적어 두었다).

     그 원인을 고친 뒤라, 기본 피커는 다음 조건에서 성립한다.

       - 피커를 여는 순간 **선택이 아직 살아 있을 때** 지금 색을
         한 번 바른다(씨앗). 여기까지가 DOM·선택을 건드리는 전부다.
       - 그 뒤의 input 이벤트는 만들어 둔 span의 색만 바꾼다.
         본문 구조도 선택도 건드리지 않으므로 OS 창이 닫힐 이유가
         없다.
       - undo 스냅샷은 여는 순간 한 번만 찍는다 — 조정 전체가
         undo 한 칸이다.

   ★ 기본 피커에 없는 것: Cancel

     OS 창에는 "취소하고 원래대로"가 없다. 그래서 기본 피커에서는
     **Undo 한 번**이 그 자리를 대신한다(위의 스냅샷 하나).
     이것이 커스텀 팝오버와의 유일한 의도된 차이다.

   ★ 어느 쪽을 쓰는가

     window.IMORY_COLOR_PICKER_MODE로 강제할 수 있고(native /
     custom), 정하지 않으면 **손가락이 주 입력**인 기기에서만
     기본 피커를 쓴다. 데스크톱은 지금까지처럼 커스텀 팝오버다 —
     거기서는 Apply/Cancel이 있는 편이 낫고, 기본 피커가 별도
     창으로 떠서 화면을 가리는 문제도 없다.
========================================================== */

function imoryNativeColorPickerSupported() {

  try {

    const probe =
      document.createElement(
        "input"
      );


    probe.setAttribute(
      "type",
      "color"
    );


    return probe.type === "color";

  }

  catch (error) {

    return false;

  }

}


function imoryTouchPrimaryDevice() {

  try {

    if (
      typeof window.matchMedia !== "function"
    ) {

      return false;

    }


    return (
      window.matchMedia(
        "(pointer: coarse)"
      ).matches &&
      (
        navigator.maxTouchPoints ||
        0
      ) > 0
    );

  }

  catch (error) {

    return false;

  }

}


function imoryColorPickerMode() {

  const forced =
    typeof window !== "undefined"
      ? window.IMORY_COLOR_PICKER_MODE
      : null;


  if (
    forced === "native" ||
    forced === "custom"
  ) {

    return forced;

  }


  return (
    imoryNativeColorPickerSupported() &&
    imoryTouchPrimaryDevice()
  )
    ? "native"
    : "custom";

}


/*
  컨트롤 하나에 붙는 숨은 <input type="color">. 버튼 안에 넣을 수
  없어서(중첩 불가) 바로 옆에 두고 프로그램으로 연다 — 여는 호출이
  실제 탭(pointerup) 안에서 일어나므로 사용자 제스처 안이다.

  display:none / visibility:hidden은 쓰지 않는다. 그러면 활성화
  자체가 막히는 브라우저가 있다. 보이지 않게만 한다.
*/

const IMORY_NATIVE_COLOR_INPUT_CLASS =
  "imory-native-color-input";


/* 지금 열려 있는 기본 피커의 입력칸(없으면 null) */

let imoryNativeColorPickerActive =
  null;


function ensureImoryNativeColorInput(
  control
) {

  if (
    control.imoryNativeColorInput
  ) {

    return control.imoryNativeColorInput;

  }


  const input =
    document.createElement(
      "input"
    );


  input.type =
    "color";


  input.className =
    IMORY_NATIVE_COLOR_INPUT_CLASS;


  /*
    키보드 순서에는 넣지 않는다 — 누르는 자리는 어디까지나
    라벨이 붙은 버튼이고, 이 칸은 그 버튼이 여는 창일 뿐이다.
  */

  input.tabIndex =
    -1;


  input.setAttribute(
    "aria-hidden",
    "true"
  );


  (
    control.parentNode ||
    document.body
  ).insertBefore(
    input,
    control
  );


  input.addEventListener(
    "input",
    () => {

      const session =
        input.imoryColorSession;


      if (!session) {
        return;
      }


      session.onPreview?.(
        imoryColorClampHex(
          input.value,
          session.color
        )
      );

    }
  );


  /*
    change  OS 창을 닫으며 확정했을 때.
    blur    change가 오지 않는 환경을 위한 보험 — 둘 중 먼저
            오는 하나만 처리된다(세션을 비우므로).
  */

  const finish =
    () => {

      const session =
        input.imoryColorSession;


      if (!session) {
        return;
      }


      input.imoryColorSession =
        null;


      if (
        imoryNativeColorPickerActive === input
      ) {

        imoryNativeColorPickerActive =
          null;

      }


      session.onApply?.(
        imoryColorClampHex(
          input.value,
          session.color
        )
      );

    };


  input.addEventListener(
    "change",
    finish
  );


  input.addEventListener(
    "blur",
    finish
  );


  control.imoryNativeColorInput =
    input;


  return input;

}


/*
  options

    anchor     컬러 컨트롤 버튼
    color      지금 색
    onPreview  (hex) => void  — 창을 열어 둔 채 색이 바뀔 때마다
    onApply    (hex) => void  — 창이 닫히며 확정될 때 한 번
*/

function openImoryNativeColorPicker(
  options = {}
) {

  const control =
    options.anchor;


  if (!control) {

    return false;

  }


  const input =
    ensureImoryNativeColorInput(
      control
    );


  const color =
    imoryColorClampHex(
      options.color,
      "#000000"
    );


  input.value =
    color;


  input.imoryColorSession =
    {

      color,

      onPreview:
        options.onPreview ||
        null,

      onApply:
        options.onApply ||
        null

    };


  imoryNativeColorPickerActive =
    input;


  try {

    input.click();

  }

  catch (error) {

    input.imoryColorSession =
      null;


    imoryNativeColorPickerActive =
      null;


    return false;

  }


  return true;

}


function isImoryNativeColorPickerOpen() {

  return Boolean(
    imoryNativeColorPickerActive &&
    imoryNativeColorPickerActive.imoryColorSession
  );

}
