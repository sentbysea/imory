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
     **OS 기본 색상 선택기**를 쓴다 — `imoryColorPickerMode()`.

     이 팝오버는 제거하지 않았다. 데스크톱의 기본이자, 기본
     피커를 쓸 수 없을 때의 대안으로 그대로 남아 있다.
     자세한 내용은 IMORY_EDITOR_DECOR_DESIGN.md §10-9.

   ★ 그 다음 — 색 고르기가 두 단계가 되었다 (요구사항 2)

     색 견본을 누르면 먼저 **프리셋 색 목록**이 뜨고
     (openImoryColorMenu, 이 파일 맨 아래), 거기서 색을 바로
     고르거나 "직접 선택"으로 이 팝오버 / OS 기본 피커로 넘어간다.

     그 직접 선택은 **진짜 보이는 <input type="color">**다. 예전에
     화면 밖에 숨겨 두고 `input.click()`으로 열던 칸은 없앴다 —
     숨겨진 칸에 대한 프로그램 클릭을 사용자 제스처로 보지 않는
     브라우저에서 창이 뜨지 않았고, 그 실패를 우리 코드가 알아챌
     방법도 없어서 "눌러도 아무 일도 일어나지 않는" 상태로
     끝났다. 자세한 내용은 이 파일 맨 아래 §1단계.

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
  ★ 예전의 숨은 <input type="color">는 없앴다 (요구사항 2)

    컨트롤 옆 화면 밖에 <input type="color">를 하나 숨겨 두고
    코드로 `input.click()` 해서 OS 창을 열던 길이 있었다. 그
    호출은 예외를 던지지 않으므로 우리 코드는 언제나 "열었다"고
    판단했지만, 숨겨진 칸에 대한 프로그램 클릭을 사용자 제스처로
    보지 않는 브라우저에서는 창이 뜨지 않았다 — 눌러도 아무 일도
    일어나지 않고 끝나는 버그의 원인이었다.

    지금은 프리셋 색 목록 안의 직접 선택이 **진짜 보이는**
    <input type="color">다(아래 renderImoryColorMenuCustom).
    사용자의 손가락이 그 칸에 직접 닿으므로 프로그램 클릭이
    필요 없고, OS 창이 열리는 것은 브라우저의 기본 동작이다.
*/


/* =========================================================
   1단계 — 프리셋 색 목록 (요구사항 2)

   ★ 무엇이 바뀌었나

     예전에는 H/P/L 견본을 누르면 곧장 색을 "고르는" 단계로
     갔다 — 데스크톱은 커스텀 팝오버, 손가락 기기는 OS 기본
     피커였다.

     그런데 실제로 자주 하는 일은 "쓰던 색 중 하나를 다시
     고르는 것"이다. 그래서 누르면 먼저 **색 목록**이 뜨고,
     거기서 바로 고르거나, 목록 안의 직접 선택 컨트롤로
     넘어가게 했다.

   ★ 그리고 눌러도 아무것도 열리지 않던 것을 고쳤다

     예전 경로는 화면 밖에 숨겨 둔 <input type="color">를
     코드로 `input.click()` 해서 OS 창을 열었다. 그 호출은
     예외를 던지지 않으므로 우리 코드는 언제나 "열었다"고
     판단했지만, 실제로는 창이 뜨지 않는 경우가 있었다 —
     숨겨진 칸에 대한 프로그램 클릭을 사용자 제스처로 보지
     않는 브라우저가 있다. 그래서 눌러도 아무 일도 일어나지
     않고 끝났다.

     지금은 목록 안의 "직접 선택"이 **진짜 보이는
     <input type="color">** 그 자체다. 사용자의 손가락이 그
     칸에 직접 닿으므로 프로그램 클릭이 필요 없고, OS 창이
     열리는 것은 브라우저의 기본 동작이다.

     기본 피커를 아예 쓸 수 없는 환경(<input type="color">
     미지원)에서는 그 자리에 평범한 버튼을 그리고 커스텀
     팝오버로 잇는다 — **감지 가능한 실패**에서 아무 반응 없이
     끝나지 않는다. 창이 열렸는지 자체는 어떤 브라우저도
     알려주지 않으므로, 칸이 포커스도 받지 못하고 값 변화도
     없는 채로 잠깐이 지나면 그것도 실패로 보고 커스텀
     팝오버를 연다(아래 watchdog).

   ★ 본문 선택을 잃지 않는다

     목록 안에서 누르는 모든 곳이 pointerdown에서
     preventDefault를 건다 — 단 하나, 직접 선택 칸만 빼고.
     그 칸은 포커스를 받아야 OS 창이 열리기 때문이다. 대신
     포커스가 넘어가기 **전에**(같은 pointerdown에서) 지금
     색을 한 번 발라 자리를 만들어 둔다. 그 뒤의 색 변화는
     만들어 둔 자리의 색만 바꾸므로 본문 구조도 문서 선택도
     건드리지 않는다 — 조정 중에 DOM이 다시 만들어지거나
     selectionchange가 반복되지 않는다.
========================================================== */

/*
  목록에 늘 나오는 색. 서비스의 담백한 톤에 맞춘 한 벌이고,
  맨 앞에는 이 컨트롤의 Quote Preset 기본값이 따로 붙는다.
*/

const IMORY_COLOR_MENU_PALETTE =
  [
    "#f4dce6",
    "#ee9fbd",
    "#f6e0c8",
    "#e8dcc8",
    "#d6e7d8",
    "#9fc6b0",
    "#cfe0f0",
    "#5c7cfa",
    "#ded6ee",
    "#8a8a8a",
    "#333333"
  ];


let imoryColorMenuRoot =
  null;

let imoryColorMenuSession =
  null;


function imoryColorMenuPart(
  role
) {

  return imoryColorMenuRoot
    ?.querySelector(
      `[data-role="${role}"]`
    );

}


function closeImoryColorMenu() {

  if (imoryColorMenuRoot) {

    imoryColorMenuRoot.hidden =
      true;

  }


  imoryColorMenuSession =
    null;

}


function isImoryColorMenuOpen() {

  return Boolean(
    imoryColorMenuRoot &&
    !imoryColorMenuRoot.hidden
  );

}


function ensureImoryColorMenu() {

  if (imoryColorMenuRoot) {

    return imoryColorMenuRoot;

  }


  const root =
    document.createElement(
      "div"
    );


  root.className =
    "imory-color-menu";


  root.setAttribute(
    "role",
    "dialog"
  );


  root.setAttribute(
    "aria-label",
    "색 고르기"
  );


  root.hidden =
    true;


  root.innerHTML =
    `
      <div class="imory-color-menu-swatches" data-role="swatches"></div>

      <div class="imory-color-menu-actions">

        <span class="imory-color-menu-custom" data-role="custom"></span>

        <span class="imory-color-menu-spacer"></span>

        <button
          class="imory-color-menu-button"
          data-role="remove"
          type="button"
          hidden
        ></button>

      </div>
    `;


  document.body.appendChild(
    root
  );


  imoryColorMenuRoot =
    root;


  /*
    목록 안을 누를 때 본문 선택을 지킨다 — 직접 선택 칸만
    예외다(포커스를 받아야 OS 창이 열린다).
  */

  root.addEventListener(
    "pointerdown",
    event => {

      if (
        event.target?.closest?.(
          ".imory-color-menu-custom-input"
        )
      ) {

        return;

      }


      event.preventDefault();

    }
  );


  return root;

}


/*
  목록에 그릴 색을 모은다 — 프리셋 기본값이 맨 앞, 그다음
  최근에 확정한 색, 그다음 기본 팔레트. 중복은 없앤다.
*/

function imoryColorMenuColors(
  presetColor
) {

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


  push(
    presetColor
  );


  imoryColorPickerRecent.forEach(
    push
  );


  IMORY_COLOR_MENU_PALETTE.forEach(
    push
  );


  return list;

}


function renderImoryColorMenuSwatches() {

  const host =
    imoryColorMenuPart(
      "swatches"
    );


  if (
    !host ||
    !imoryColorMenuSession
  ) {

    return;

  }


  host.replaceChildren();


  imoryColorMenuColors(
    imoryColorMenuSession.presetColor
  )
    .forEach(
      (
        color,
        index
      ) => {

        const swatch =
          document.createElement(
            "button"
          );


        swatch.type =
          "button";


        swatch.className =
          "imory-color-menu-swatch";


        swatch.style.backgroundColor =
          color;


        swatch.title =
          index === 0
            ? `${color} (프리셋 기본값)`
            : color;


        swatch.setAttribute(
          "aria-label",
          swatch.title
        );


        if (
          color ===
          imoryColorMenuSession.color
        ) {

          swatch.dataset.current =
            "true";

        }


        /*
          bindImoryTapButton과 같은 이유로 pointerup에서 실행한다 —
          WebKit은 터치에서 pointerdown을 막으면 click을 만들지
          않는다(이 파일 머리말의 실측표).
        */

        bindImoryTapButton(
          swatch,
          {

            onFire:
              () => {

                const session =
                  imoryColorMenuSession;


                if (!session) {

                  return;

                }


                closeImoryColorMenu();


                session.onPickPreset?.(
                  color
                );

              }

          }
        );


        host.appendChild(
          swatch
        );

      }
    );

}


/*
  직접 선택 컨트롤.

    기본 피커를 쓸 수 있으면  → 진짜 <input type="color">
    쓸 수 없으면              → 커스텀 팝오버를 여는 버튼

  어느 쪽이든 누르면 반드시 무엇인가 열린다.
*/

function renderImoryColorMenuCustom() {

  const host =
    imoryColorMenuPart(
      "custom"
    );


  if (
    !host ||
    !imoryColorMenuSession
  ) {

    return;

  }


  host.replaceChildren();


  const session =
    imoryColorMenuSession;


  const useNative =
    imoryColorPickerMode() ===
    "native";


  if (!useNative) {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";


    button.className =
      "imory-color-menu-button imory-color-menu-custom-button";


    button.textContent =
      "직접 선택";


    bindImoryTapButton(
      button,
      {

        onFire:
          () => {

            closeImoryColorMenu();


            session.onCustom?.();

          }

      }
    );


    host.appendChild(
      button
    );


    return;

  }


  /*
    ★ 진짜 <input type="color">다 — 코드가 대신 눌러 주는 숨은
    칸이 아니다. 사용자의 손가락이 여기 직접 닿으므로 OS 창이
    열리는 것은 브라우저의 기본 동작이고, "프로그램 클릭이
    제스처로 인정되지 않아 아무것도 안 열리는" 경우가 없다.
  */

  const input =
    document.createElement(
      "input"
    );


  input.type =
    "color";


  input.className =
    "imory-color-menu-custom-input";


  input.value =
    imoryColorClampHex(
      session.color,
      "#000000"
    );


  input.setAttribute(
    "aria-label",
    "직접 색 고르기"
  );


  input.title =
    "직접 색 고르기";


  /*
    ★ 이 칸이 "직접 선택"이라는 것을 글자로 말해 준다.

    브라우저가 그리는 <input type="color">는 그냥 색 네모라, 위
    스와치들과 생김새가 같아서 "여기를 누르면 색을 직접 고를 수
    있다"가 드러나지 않는다. 누르는 자리는 어디까지나 칸 자체이므로
    이 글자는 포인터를 받지 않는다(CSS의 pointer-events: none) —
    라벨을 눌러 칸을 대신 활성화하면 다시 프로그램 클릭이 되고,
    그것이 바로 창이 열리지 않던 경로다.
  */

  const label =
    document.createElement(
      "span"
    );


  label.className =
    "imory-color-menu-custom-label";


  label.textContent =
    "custom";


  label.setAttribute(
    "aria-hidden",
    "true"
  );


  let started =
    false;

  let sawSignal =
    false;


  /*
    창이 열리기 **전에** 자리를 만든다 — 아직 본문 선택이
    살아 있는 지금이 마지막 기회다. 여기서 실패하면(바를 자리를
    못 찾으면) 직접 선택 자체를 포기하고 안내만 남긴다.
  */

  const begin =
    () => {

      if (started) {

        return true;

      }


      started =
        true;


      return session.onCustomBegin?.() !==
        false;

    };


  input.addEventListener(
    "pointerdown",
    () => {

      begin();

    }
  );


  /* 키보드로 여는 길(Tab → Enter/Space)도 같은 자리를 만든다 */

  input.addEventListener(
    "click",
    () => {

      begin();

    }
  );


  input.addEventListener(
    "focus",
    () => {

      sawSignal =
        true;

    }
  );


  input.addEventListener(
    "input",
    () => {

      sawSignal =
        true;


      session.onCustomPreview?.(
        imoryColorClampHex(
          input.value,
          session.color
        )
      );

    }
  );


  /*
    change  OS 창을 닫으며 확정했을 때.
    blur    change가 오지 않는 환경을 위한 보험.

    둘 중 먼저 오는 하나만 처리된다.
  */

  let finished =
    false;


  const finish =
    () => {

      if (
        finished ||
        !started
      ) {

        return;

      }


      finished =
        true;


      closeImoryColorMenu();


      session.onCustomApply?.(
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


  /*
    ★ watchdog — 감지 가능한 실패만 잡는다 (요구사항 2)

    OS 창이 실제로 떴는지 알려주는 브라우저는 없다. 다만 창이
    뜨면 이 칸이 포커스를 받거나 값이 바뀐다 — 잠깐이 지나도록
    그 둘 중 아무것도 없고 포커스도 여기 없으면, 아무 일도
    일어나지 않은 것으로 보고 보존해 둔 커스텀 팝오버를 연다.

    반대로 창이 열려 있으면 sawSignal이나 activeElement 중
    하나는 반드시 참이라, 이 길로 들어와 팝오버가 창 위에
    겹쳐 뜨는 일은 없다.
  */

  input.addEventListener(
    "pointerup",
    () => {

      window.setTimeout(
        () => {

          if (
            finished ||
            sawSignal ||
            document.activeElement === input
          ) {

            return;

          }


          finished =
            true;


          closeImoryColorMenu();


          session.onCustomFallback?.();

        },
        700
      );

    }
  );


  host.appendChild(
    input
  );


  host.appendChild(
    label
  );

}


function positionImoryColorMenu(
  anchor
) {

  const root =
    imoryColorMenuRoot;


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


/*
  options

    anchor           색 견본 버튼
    color            지금 색
    presetColor      프리셋 기본값(목록 맨 앞)
    removeLabel      걷어내기 버튼의 글자(없으면 버튼을 숨긴다)

    onPickPreset(color)    목록에서 색을 골랐다 — 그 자리에서 확정
    onCustomBegin()        직접 선택 창이 열리기 직전(자리 만들기).
                           false를 돌려주면 바를 자리가 없다는 뜻
    onCustomPreview(color) 창을 연 채 색이 바뀔 때마다
    onCustomApply(color)   창이 닫히며 확정될 때 한 번
    onCustomFallback()     기본 피커가 열리지 않았다 — 커스텀 팝오버로
    onCustom()             기본 피커를 아예 쓸 수 없는 환경의 직접 선택
    onRemove()             이 서식만 걷어내기
*/

function openImoryColorMenu(
  options = {}
) {

  const root =
    ensureImoryColorMenu();


  imoryColorMenuSession =
    {

      anchor:
        options.anchor ||
        null,

      color:
        imoryColorClampHex(
          options.color,
          "#000000"
        ),

      presetColor:
        options.presetColor,

      onPickPreset:
        options.onPickPreset ||
        null,

      onCustomBegin:
        options.onCustomBegin ||
        null,

      onCustomPreview:
        options.onCustomPreview ||
        null,

      onCustomApply:
        options.onCustomApply ||
        null,

      onCustomFallback:
        options.onCustomFallback ||
        null,

      onCustom:
        options.onCustom ||
        null,

      onRemove:
        options.onRemove ||
        null

    };


  renderImoryColorMenuSwatches();


  renderImoryColorMenuCustom();


  const remove =
    imoryColorMenuPart(
      "remove"
    );


  if (remove) {

    remove.hidden =
      !options.onRemove;


    remove.textContent =
      options.removeLabel ||
      "clear";

  }


  bindImoryColorMenuRemove();


  root.hidden =
    false;


  positionImoryColorMenu(
    options.anchor
  );

}


/*
  걷어내기 버튼 — 목록을 만들 때 한 번만 건다(내용은 바뀌어도
  이 버튼은 그대로다).
*/

function bindImoryColorMenuRemove() {

  const remove =
    imoryColorMenuPart(
      "remove"
    );


  if (
    !remove ||
    remove.imoryBound
  ) {

    return;

  }


  remove.imoryBound =
    true;


  bindImoryTapButton(
    remove,
    {

      onFire:
        () => {

          const session =
            imoryColorMenuSession;


          if (!session) {

            return;

          }


          closeImoryColorMenu();


          session.onRemove?.();

        }

    }
  );

}


/*
  바깥을 누르거나 Escape를 누르면 닫는다 — 아무것도 바꾸지
  않았으므로 undo 기록에도 아무 흔적이 남지 않는다.
*/

document.addEventListener(
  "pointerdown",
  event => {

    if (
      !isImoryColorMenuOpen()
    ) {

      return;

    }


    if (
      imoryColorMenuRoot.contains(
        event.target
      )
    ) {

      return;

    }


    /* 방금 이 목록을 연 버튼을 다시 누른 경우도 닫기다 */

    closeImoryColorMenu();

  },
  true
);


document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape" &&
      isImoryColorMenuOpen()
    ) {

      closeImoryColorMenu();

    }

  }
);
