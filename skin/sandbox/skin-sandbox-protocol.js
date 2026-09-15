/* =========================================================
   SKIN SANDBOX - PROTOCOL (classic script, 의존 없음)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §D-2
   단계: SANDBOX-0 — 허용 메시지는 **두 개뿐**이다.

     frame  -> parent   IMORY_FRAME_READY  { contract: 1 }
     parent -> frame    IMORY_FRAME_ACK    { contract: 1 }

   (설계 문서 §D-2는 SANDBOX-1의 같은 신호를 IMORY_READY로 적고
    있다. 이 라운드의 지시문이 IMORY_FRAME_READY/ACK를 쓰므로
    그 이름을 정본으로 삼는다 — SANDBOX-1에서 문서 쪽을 맞춘다.)

   ---------------------------------------------------------
   ★ 왜 한 파일인가

   부모 문서와 frame 문서는 서로 다른 origin의 서로 다른 browsing
   context다 — 전역을 공유하지 않는다. 그래서 **같은 파일을 양쪽에
   각각 로드**한다. 검증 로직을 복붙하면 두 쪽이 서서히 달라지고,
   달라지는 쪽이 늘 느슨한 쪽이다. 이 패턴은 저장소에 선례가 있다
   (studio/inspector/studio-inspector-model.js를 Studio와
    preview-frame.html이 각각 로드한다).

   ★ 검증 순서 (실패하면 그 자리에서 끝, 조용히)

     1. event.origin 이 기대한 origin과 **정확히** 같은가
     2. event.source 가 기대한 window와 같은가
     3. data.imory === 1  (다른 라이브러리 noise 1차 차단)
     4. data.type 이 이번 라운드가 아는 두 개 중 하나인가
     5. 방향이 맞는가 (parent가 IMORY_FRAME_ACK을 받지 않는다)
     6. seq 가 정수인가
     7. payload가 plain object이고 **알려진 키만** 있는가

   ★ 알려진 키만 읽는다 / 알려진 키만 만든다

   payload를 `{...data.payload}`로 받지 않는다. 모르는 키가 하나라도
   있으면 거부한다(reject-unknown-keys). 나중에 필드가 늘어도
   "조용히 흘러 들어오는" 경로가 생기지 않는다 —
   skin/skin-package-import.js가 SkinPackage에 쓰는 원칙과 같다.

   ★ 실패는 조용하다

   검증에 걸린 메시지에 응답하지 않는다. 화면에도 쓰지 않는다.
   프로빙하는 쪽에 "무엇이 틀렸는지"를 알려 주지 않기 위해서다
   (호출자가 진단이 필요하면 돌려받은 reason을 자기 로그에만 쓴다).
========================================================== */


var SANDBOX_MESSAGE_ENVELOPE = 1;

var SANDBOX_MESSAGE_CONTRACT = 1;


var SANDBOX_MESSAGE_TYPES = {
  FRAME_READY: "IMORY_FRAME_READY",
  FRAME_ACK: "IMORY_FRAME_ACK"
};


/*
  type -> { direction, keys }

  direction 은 "이 메시지를 받을 자격이 있는 쪽"이다.
    "to-parent" : frame 이 보내고 parent 가 받는다
    "to-frame"  : parent 가 보내고 frame 이 받는다
*/

var SANDBOX_MESSAGE_SPEC = {

  IMORY_FRAME_READY: {
    direction: "to-parent",
    keys: ["contract"]
  },

  IMORY_FRAME_ACK: {
    direction: "to-frame",
    keys: ["contract"]
  }

};


/* =========================================================
   isPlainSandboxObject(value)

   배열·null·Date·window 프록시 따위를 걸러 낸다. cross-origin
   메시지는 structured clone을 거쳐 오므로 프로토타입이 이쪽
   realm의 Object.prototype이다 — 그 점을 이용해 판정한다.
========================================================== */

function isPlainSandboxObject(value) {

  if (!value || typeof value !== "object") {
    return false;
  }


  if (Array.isArray(value)) {
    return false;
  }


  const proto =
    Object.getPrototypeOf(value);


  return proto === Object.prototype || proto === null;

}


/* =========================================================
   hasOnlyKnownSandboxKeys(payload, keys)
========================================================== */

function hasOnlyKnownSandboxKeys(payload, keys) {

  const own =
    Object.keys(payload);


  for (let i = 0; i < own.length; i += 1) {

    if (keys.indexOf(own[i]) === -1) {
      return false;
    }

  }


  return true;

}


/* =========================================================
   buildSandboxMessage(type, payload, seq)

   봉투를 만든다. 모르는 type이면 null(보내지 않는다).
   payload도 **알려진 키만** 새 리터럴에 담는다 — 보내는 쪽에서도
   실수로 무엇을 흘리지 않기 위해서다.
========================================================== */

function buildSandboxMessage(type, payload, seq) {

  const spec =
    SANDBOX_MESSAGE_SPEC[type];

  if (!spec) {
    return null;
  }


  const source =
    isPlainSandboxObject(payload) ? payload : {};

  const clean =
    {};


  for (let i = 0; i < spec.keys.length; i += 1) {

    const key =
      spec.keys[i];

    if (Object.prototype.hasOwnProperty.call(source, key)) {
      clean[key] = source[key];
    }

  }


  if (clean.contract === undefined) {
    clean.contract = SANDBOX_MESSAGE_CONTRACT;
  }


  return {
    imory: SANDBOX_MESSAGE_ENVELOPE,
    type: type,
    seq: Number.isInteger(seq) && seq >= 1 ? seq : 1,
    payload: clean
  };

}


/* =========================================================
   validateSandboxMessage(event, expect) -> result

   expect = {
     originAllowList : string[]   // 허용 origin (정확 일치)
     source          : Window     // 기대한 window (있으면 대조)
     direction       : "to-parent" | "to-frame"
     isOriginAllowed : (origin, allowList) => boolean   // 선택
   }

   result = { ok: true,  type, seq, payload }
          | { ok: false, reason }

   reason 값(진단용, 상대에게 돌려주지 않는다):
     "no-event" "bad-origin" "bad-source" "bad-envelope"
     "unknown-type" "wrong-direction" "bad-seq"
     "bad-payload" "unknown-payload-key" "bad-contract"
========================================================== */

function validateSandboxMessage(event, expect) {

  if (!event || typeof event !== "object") {
    return { ok: false, reason: "no-event" };
  }


  const rules =
    expect || {};


  /* --- 1. origin --------------------------------------- */

  const allowList =
    Array.isArray(rules.originAllowList) ? rules.originAllowList : [];

  const originOk =
    typeof rules.isOriginAllowed === "function"
      ? rules.isOriginAllowed(event.origin, allowList) === true
      : (
        typeof event.origin === "string" &&
        event.origin !== "" &&
        event.origin !== "null" &&
        allowList.indexOf(event.origin) !== -1
      );

  if (!originOk) {
    return { ok: false, reason: "bad-origin" };
  }


  /* --- 2. source ---------------------------------------- */

  /*
    같은 origin에서 온 **다른 window**(예: 공격자가 연 팝업, 또는
    같은 부모가 띄운 두 번째 iframe)를 걸러 낸다. origin만 보면
    이것을 못 잡는다.
  */

  if (rules.source && event.source !== rules.source) {
    return { ok: false, reason: "bad-source" };
  }


  /* --- 3. 봉투 ------------------------------------------ */

  const data =
    event.data;

  if (!isPlainSandboxObject(data)) {
    return { ok: false, reason: "bad-envelope" };
  }

  if (data.imory !== SANDBOX_MESSAGE_ENVELOPE) {
    return { ok: false, reason: "bad-envelope" };
  }

  if (typeof data.type !== "string") {
    return { ok: false, reason: "bad-envelope" };
  }


  /* --- 4. type ------------------------------------------ */

  const spec =
    SANDBOX_MESSAGE_SPEC[data.type];

  if (!spec) {
    return { ok: false, reason: "unknown-type" };
  }


  /* --- 5. 방향 ------------------------------------------ */

  if (rules.direction && spec.direction !== rules.direction) {
    return { ok: false, reason: "wrong-direction" };
  }


  /* --- 6. seq ------------------------------------------- */

  if (!Number.isInteger(data.seq) || data.seq < 1) {
    return { ok: false, reason: "bad-seq" };
  }


  /* --- 7. payload --------------------------------------- */

  if (!isPlainSandboxObject(data.payload)) {
    return { ok: false, reason: "bad-payload" };
  }

  if (!hasOnlyKnownSandboxKeys(data.payload, spec.keys)) {
    return { ok: false, reason: "unknown-payload-key" };
  }

  if (data.payload.contract !== SANDBOX_MESSAGE_CONTRACT) {
    return { ok: false, reason: "bad-contract" };
  }


  /* 알려진 키만 새 리터럴로 옮겨 돌려준다 */

  return {
    ok: true,
    type: data.type,
    seq: data.seq,
    payload: {
      contract: data.payload.contract
    }
  };

}


/* =========================================================
   node(단위 테스트)에서도 같은 파일을 읽을 수 있게
========================================================== */

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SANDBOX_MESSAGE_ENVELOPE,
    SANDBOX_MESSAGE_CONTRACT,
    SANDBOX_MESSAGE_TYPES,
    SANDBOX_MESSAGE_SPEC,
    isPlainSandboxObject,
    hasOnlyKnownSandboxKeys,
    buildSandboxMessage,
    validateSandboxMessage
  };

}
