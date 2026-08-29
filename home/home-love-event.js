/* =========================================================
   HOME - 하트 3D / LOVE EVENT

   script.js에서 분리됨.

   musicButton(상단 고정 버튼 스크롤 숨김에서 참조)과
   bgmVideoId/bgmPlaying/playBgm(하트 드래그 종료 시 BGM
   자동재생에서 참조)은 home-bgm.js에 있음 — 이 파일보다
   먼저 로드되어야 함.

   openProfile()은 이 파일의 pointerup 리스너 안에서
   호출되지만 실제 정의는 home-profile.js에 있음. 클릭 시점
   (모든 스크립트 로드가 끝난 뒤)에만 호출되므로 이 파일이
   home-profile.js보다 먼저 로드돼도 문제없음(index.html
   순서 참고).

   menuButton/menuPanel 요소 선언은 원래 이 파일의 "요소"
   블록과 함께 있었지만, 실제 메뉴 열기/닫기 동작은
   home-profile.js로 옮겼음(메뉴+프로필을 한 파일로 묶음).
   두 요소는 여기서 선언되는 전역 상수이며 home-profile.js가
   이 파일보다 나중에 로드되므로 그대로 참조 가능함.
========================================================== */

/* =========================================================
   기본 설정
========================================================== */

const INERTIA_STRENGTH =
  0.9;

const INERTIA_FRICTION =
  0.90;


/* =========================================================
   요소
========================================================== */

const menuButton =
  document.getElementById(
    "menuButton"
  );

const menuPanel =
  document.getElementById(
    "menuPanel"
  );

const viewerArea =
  document.getElementById(
    "viewerArea"
  );

const heartViewer =
  document.getElementById(
    "heartViewer"
  );

const heartGroup =
  document.getElementById(
    "heartGroup"
  );

const heartStage =
  document.getElementById(
    "heartStage"
  );

const page1 =
  document.getElementById(
    "profilePage1"
  );

const page2 =
  document.getElementById(
    "profilePage2"
  );

const moreButton =
  document.getElementById(
    "moreButton"
  );

const backButton =
  document.getElementById(
    "backButton"
  );


/* 100회전 이벤트 요소 */

const loveEvent =
  document.getElementById(
    "loveEvent"
  );

const loveRain =
  document.getElementById(
    "loveRain"
  );


/* =========================================================
   상단 고정 버튼(메뉴/음악) 스크롤 시 숨김

   글을 읽을 때 텍스트를 가리지 않도록 아래로 스크롤하면
   숨기고, 위로 스크롤하거나 맨 위 근처로 오면 다시 보여준다.
   posts.js도 글 읽기 화면(#postArea)의 자체 스크롤에서
   이 함수를 그대로 호출한다(전역 함수로 공유).
========================================================== */

let lastFixedButtonScrollTop =
  0;

function updateFixedButtonsOnScroll(
  scrollTop
) {

  const scrollingDown =
    scrollTop >
    lastFixedButtonScrollTop;

  const pastThreshold =
    scrollTop > 24;

  const shouldHide =
    scrollingDown &&
    pastThreshold;


  menuButton?.classList.toggle(
    "is-scroll-hidden",
    shouldHide
  );

  musicButton?.classList.toggle(
    "is-scroll-hidden",
    shouldHide
  );


  lastFixedButtonScrollTop =
    scrollTop;

}


window.addEventListener(
  "scroll",
  () => {

    updateFixedButtonsOnScroll(
      window.scrollY
    );

  },
  {
    passive: true
  }
);


/* =========================================================
   LOVE EVENT
========================================================== */

const LOVE_TURNS_REQUIRED =
  5;


const FULL_TURN =
  Math.PI * 2;


/*
  사용자가 직접 돌린 양만 저장.

  자동회전은 카운트하지 않음.
*/

let accumulatedUserRotation =
  0;

let rotationTrackingFrame =
  null;

let lastTrackedTheta =
  null;

let loveEventTriggered =
  false;


/* =========================================================
   각도 차이 보정
========================================================== */

function normalizeAngleDelta(
  delta
) {

  while (
    delta > Math.PI
  ) {

    delta -=
      FULL_TURN;

  }


  while (
    delta < -Math.PI
  ) {

    delta +=
      FULL_TURN;

  }


  return delta;

}


/* =========================================================
   100회전 확인
========================================================== */

function checkLoveEvent() {

  if (loveEventTriggered) {
    return;
  }


  const completedTurns =
    accumulatedUserRotation
    /
    FULL_TURN;


  if (
    completedTurns <
    LOVE_TURNS_REQUIRED
  ) {
    return;
  }


  loveEventTriggered =
    true;


  accumulatedUserRotation =
    0;


  triggerLoveEvent();


  window.setTimeout(
    () => {

      loveEventTriggered =
        false;

    },

    5500
  );

}


/* =========================================================
   회전량 추적 시작
========================================================== */

function startRotationTracking() {

  stopRotationTracking();


  const orbit =
    heartViewer
      .getCameraOrbit();


  lastTrackedTheta =
    orbit.theta;


  function trackRotation() {

    const currentOrbit =
      heartViewer
        .getCameraOrbit();


    const currentTheta =
      currentOrbit.theta;


    if (
      lastTrackedTheta
      !== null
    ) {

      const delta =
        normalizeAngleDelta(
          currentTheta
          -
          lastTrackedTheta
        );


      accumulatedUserRotation +=
        Math.abs(delta);


      checkLoveEvent();

    }


    lastTrackedTheta =
      currentTheta;


    rotationTrackingFrame =
      requestAnimationFrame(
        trackRotation
      );

  }


  rotationTrackingFrame =
    requestAnimationFrame(
      trackRotation
    );

}


/* =========================================================
   회전량 추적 종료
========================================================== */

function stopRotationTracking() {

  if (
    rotationTrackingFrame
  ) {

    cancelAnimationFrame(
      rotationTrackingFrame
    );

    rotationTrackingFrame =
      null;

  }


  lastTrackedTheta =
    null;

}


/* =========================================================
   하트비 하나 만들기
========================================================== */

function createLoveDrop() {

  if (!loveRain) {
    return;
  }


  const drop =
    document.createElement(
      "span"
    );


  drop.className =
    "love-drop";


  const isRibbon =
    Math.random() < 0.30;


  drop.textContent =
    isRibbon
      ? "୨୧"
      : "♡";


  const size =
    8
    +
    Math.random() * 10;


  const finalSize =
    isRibbon
      ? size * 0.84
      : size;


  drop.style.fontSize =
    `${finalSize}px`;


  drop.style.left =
    `${Math.random() * 100}%`;


  const duration =
    1.8
    +
    Math.random() * 1.4;


  drop.style.animationDuration =
    `${duration}s`;


  const delay =
    Math.random() * 1.2;


  drop.style.animationDelay =
    `${delay}s`;


  drop.style.opacity =
    `${
      0.5
      +
      Math.random() * 0.4
    }`;


  const drift =
    -30
    +
    Math.random() * 60;


  drop.style.setProperty(
    "--love-drift",
    `${drift}px`
  );


  const rotation =
    -18
    +
    Math.random() * 36;


  drop.style.setProperty(
    "--love-rotate",
    `${rotation}deg`
  );


  loveRain.appendChild(
    drop
  );


  window.setTimeout(
    () => {

      drop.remove();

    },

    (
      duration
      +
      delay
      +
      0.5
    )
    *
    1000
  );

}


/* =========================================================
   LOVE EVENT 실행
========================================================== */

function triggerLoveEvent() {

  if (
    !loveEvent ||
    !loveRain
  ) {
    return;
  }


  const loveMessages = [
    "spun with love.ᐟ",
    "caught you spinning.ᐟ",
    "look what you started.ᐟ",
    "a little love found you.ᐟ",
    "love was here.ᐟ",
    "something sweet happened.ᐟ"
  ];


  const loveMessage =
    document.getElementById(
      "loveMessage"
    );


  if (loveMessage) {

    const randomMessage =
      loveMessages[
        Math.floor(
          Math.random() *
          loveMessages.length
        )
      ];

    loveMessage.textContent =
      randomMessage;

  }


  loveEvent.classList.add(
    "show"
  );


  loveEvent.setAttribute(
    "aria-hidden",
    "false"
  );


  const DROP_COUNT =
    38;


  for (
    let i = 0;
    i < DROP_COUNT;
    i += 1
  ) {

    createLoveDrop();

  }


  window.setTimeout(
    () => {

      loveEvent.classList.remove(
        "show"
      );


      loveEvent.setAttribute(
        "aria-hidden",
        "true"
      );

    },

    5200
  );

}


/* =========================================================
   드래그 상태
========================================================== */

let startX = 0;
let startY = 0;

let lastX = 0;
let lastTime = 0;

let velocityX = 0;

let moved = false;
let profileOpen = false;

let inertiaFrame = null;


/* =========================================================
   관성 정지
========================================================== */

function stopInertia() {

  if (!inertiaFrame) {
    return;
  }


  cancelAnimationFrame(
    inertiaFrame
  );


  inertiaFrame =
    null;

}


/* =========================================================
   드래그 시작
========================================================== */

heartViewer.addEventListener(
  "pointerdown",
  (event) => {

    stopInertia();


    startRotationTracking();


    heartViewer.autoRotate =
      false;


    startX =
      event.clientX;

    startY =
      event.clientY;

    lastX =
      event.clientX;

    lastTime =
      performance.now();

    velocityX =
      0;

    moved =
      false;

  }
);


/* =========================================================
   드래그 중
========================================================== */

heartViewer.addEventListener(
  "pointermove",
  (event) => {

    const distanceX =
      Math.abs(
        event.clientX
        -
        startX
      );


    const distanceY =
      Math.abs(
        event.clientY
        -
        startY
      );


    if (
      distanceX > 8 ||
      distanceY > 8
    ) {

      moved =
        true;

    }


    const now =
      performance.now();


    const deltaTime =
      Math.max(
        1,
        now - lastTime
      );


    const deltaX =
      event.clientX
      -
      lastX;


    velocityX =
      deltaX
      /
      deltaTime;


    lastX =
      event.clientX;


    lastTime =
      now;

  }
);


/* =========================================================
   드래그 종료
========================================================== */

heartViewer.addEventListener(
  "pointerup",
  () => {

    if (!moved) {

      stopRotationTracking();


      if (
        bgmVideoId &&
        !bgmPlaying
      ) {

        playBgm();

      }


      openProfile();


      return;
    }


    startInertia();

  }
);


/* 손가락 이벤트 취소 */

heartViewer.addEventListener(
  "pointercancel",
  () => {

    stopRotationTracking();

    if (!profileOpen) {

      heartViewer.autoRotate =
        true;

    }

  }
);


/* =========================================================
   관성 회전
========================================================== */

function startInertia() {

  stopInertia();


  let speed =
    velocityX
    *
    INERTIA_STRENGTH;


  function inertia() {

    if (
      Math.abs(speed)
      <
      0.0005
    ) {

      inertiaFrame =
        null;


      stopRotationTracking();


      if (!profileOpen) {

        heartViewer.autoRotate =
          true;

      }


      return;
    }


    const orbit =
      heartViewer
        .getCameraOrbit();


    const nextTheta =
      orbit.theta
      -
      speed;


    heartViewer.cameraOrbit =
      `${nextTheta}rad ${orbit.phi}rad ${orbit.radius}m`;


    speed *=
      INERTIA_FRICTION;


    inertiaFrame =
      requestAnimationFrame(
        inertia
      );

  }


  inertiaFrame =
    requestAnimationFrame(
      inertia
    );

}


/* =========================================================
   하트 재질
========================================================== */

heartViewer.addEventListener(
  "load",
  () => {

    const materials =
      heartViewer.model.materials;


    materials.forEach(
      (material) => {

        material
          .pbrMetallicRoughness
          .setBaseColorFactor([
            1.0,
            0.72,
            0.82,
            1.0
          ]);


        material
          .pbrMetallicRoughness
          .setMetallicFactor(
            0
          );


        material
          .pbrMetallicRoughness
          .setRoughnessFactor(
            0.14
          );

      }
    );

  }
);
