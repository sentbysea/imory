/* =========================================================
   POSTS - STYLE: 본문 레이아웃 공용 계산

   기준 문서: IMORY_QUOTE_PRESET_RENDER_AUDIT.md

   Quote Preset 미리보기 · 에디터 PREVIEW · export · 발행된
   글 본문이 **같은 값에서 같은 모양**이 되도록, 네 화면이
   공유하는 계산만 모아 둔 파일이다. 전부 인자로만 동작하고
   전역 상태를 읽지 않는다 — admin(관리 패널)과 index(글쓰기/
   보기) 양쪽 문서에서 그대로 로드할 수 있어야 하기 때문이다.

   내용:
     - 저장된 settings 정규화(normalizePostStyleSettings)
     - 본문 글꼴/색/행간/줄바꿈 적용(applyPostBodyStyles)
     - 문단 간격 적용(applyPostParagraphSpacing)

   classic script. 최상위 선언이 같은 전역 렉시컬 환경을
   공유한다(posts/editor/posts-refs.js 주석 참고).
========================================================== */


/* =========================================================
   페이지 레이아웃 폭

   화면 폭과 무관하게 항상 이 값으로 레이아웃하고, 좁은
   화면에서는 통째로 transform: scale()로 축소해서 보여준다
   — 표시 배율과 레이아웃 계산은 서로를 참조하지 않는다.
========================================================== */

const POST_PAGE_LAYOUT_WIDTH =
  520;


/* =========================================================
   값 읽기 — "명시적으로 저장된 0"과 "누락"의 구분

   ★ 예전에는 세 화면이 전부 `Number(x) || fallback` 으로
   값을 읽었다. 그러면 사용자가 일부러 저장한 0이 fallback으로
   되살아난다. 빈 값/undefined/NaN만 누락으로 보고, 0은
   0으로 쓴다.
========================================================== */

function postStyleNumber(
  value,
  fallback
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return fallback;

  }


  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;

}


function postStyleText(
  value,
  fallback
) {

  const text =
    typeof value === "string"
      ? value.trim()
      : "";


  return text === ""
    ? fallback
    : text;

}


/* =========================================================
   정규화 — 누락된 legacy 설정의 기본값

   ★ 기본값은 "폼에 적힌 값"이 아니라 **지금 발행된 본문과
   에디터 PREVIEW가 실제로 그리던 값**을 그대로 옮긴 것이다
   (IMORY_QUOTE_PRESET_RENDER_AUDIT.md §4 (E)). 키가 빠진
   옛 프리셋에서 화면마다 다른 값을 쓰던 자리를 여기 하나로
   모은다 — 폼 되채우기(applyQuoteSettings)도 이 값을 쓰므로,
   폼에 보이는 값 · 두 미리보기 · 발행 본문이 항상 같다.

   ★ 알 수 없는 필드는 그대로 들고 다닌다. 저장(collect)이
   이 객체를 밑바탕으로 쓰기 때문에, 이 화면이 모르는 옛/새
   필드가 저장 한 번으로 사라지지 않는다.
========================================================== */

const POST_STYLE_DEFAULTS =
  {

    /* CANVAS — preview/export 전용(발행 본문은 참조하지 않음) */

    ratio: "1:1",
    ratioWidth: 4,
    ratioHeight: 5,
    exportWidth: 1080,
    background: "#ffffff",
    padding: 0,
    verticalPadding: 0,
    horizontalPadding: 0,


    /* TITLE */

    titleEnabled: true,
    titleColor: "#222222",
    titleSize: 24,
    titleWeight: "400",
    titleAlign: "left",
    titleLetterSpacing: 0,
    titleSpacing: 0,


    /* BODY */

    bodyFont: "pretendard",
    bodyColor: "#555555",
    highlightColor: "#f4dce6",
    pointColor: "#5c7cfa",


    /*
      형광펜 높이 — 글자 크기에 대한 비율(%).

      100 = 예전 그대로 글자 상자를 가득 채운다. 낮추면 글자
      **아래쪽**에만 얇게 깔린다. 키가 빠진 옛 프리셋은 100으로
      읽혀서 지금 발행된 글의 모양이 그대로 유지된다
      (posts/style/posts-body-decor.js).
    */

    highlightHeight: 100,


    /*
      강조선(문단 왼쪽 세로선) — 에디터에서 수동으로 걸 때의
      기본 색/굵기. 개별 문단이 자기 색을 지정하지 않았으면
      이 값을 따른다.
    */

    bodyRuleColor: "#ee9fbd",
    bodyRuleWidth: 3,


    /*
      선과 글자 사이의 거리(px).

      ★ 값이 없는 옛 프리셋은 12로 읽힌다 — 예전에 상수 하나로
      박혀 있던 그 값이다(posts/style/posts-body-decor.js의
      POST_RULE_GAP). 그래서 이 옵션이 생겨도 이미 발행된 글의
      모양은 한 픽셀도 달라지지 않는다.
    */

    bodyRuleGap: 12,
    bodySize: 16,
    bodyWeight: "400",
    lineHeight: 1.9,
    letterSpacing: 0,
    paragraphSpacing: 0,
    bodyAlign: "left",
    verticalAlign: "top",
    lineBreak: "keep",
    indent: 0,


    /* ACTION / DIALOGUE */

    actionColor: "#888888",
    actionWeight: "400",
    actionItalic: false,

    dialogueColor: "#333333",
    dialogueWeight: "500",
    dialogueItalic: false,


    /*
      대사 문단에 강조선을 자동으로 붙일지.

      ★ 기본값은 false다 — 새 옵션이 켜진 채로 들어오면 이미
      저장된 모든 프리셋의 외형이 한 번에 바뀐다. 켜면 기존
      대사 판별 기준(replaceDialogueTextNode의 따옴표 규칙)에
      걸리는 문단에 자동으로 붙는다.
    */

    dialogueRuleEnabled: false,
    dialogueRuleColor: "#ee9fbd",
    dialogueRuleWidth: 3,
    dialogueRuleGap: 12,


    /* SOURCE */

    sourceText: "",
    sourceEnabled: true,
    sourceColor: "#999999",
    sourceSize: 11,
    sourceWeight: "300",
    sourceAlign: "right",
    sourceSpacing: 0,
    sourceBottomOffset: 0,


    /* SOURCE 강조선 — 출처 문구 왼쪽 세로선 */

    sourceRuleEnabled: false,
    sourceRuleColor: "#ee9fbd",
    sourceRuleWidth: 3,
    sourceRuleGap: 12,


    /* CANVAS 배경 이미지 — preview/export 전용 */

    /*
      ★ 공개 URL을 그대로 저장한다(blob:/data: 같은 임시 주소가
      아니다). 업로드 경로와 권한은 admin/quote/admin-quote-background.js
      머리말 참고 — 다른 세션/다른 기기에서 열어도 같은 그림이 뜬다.
    */

    backgroundImageUrl: "",


    /*
      확대 배율. 1 = "캔버스를 빈틈없이 덮는 최소 크기"(= cover).

      ★ 1보다 작아질 수 있다(0.5까지). 그러면 사진이 캔버스보다
      작아져서 둘레에 바탕이 드러나고, 그 자리는 배경색으로
      채워진다 — 예전의 "언제나 빈틈없이 덮는다"는 규칙은
      철회됐다(posts/style/posts-canvas-background.js 머리말).

      폼의 슬라이더는 50~150%지만, 그보다 큰 값이 저장된 옛
      프리셋은 **로드만으로 깎이지 않는다** — 슬라이더의 최대치를
      그 값까지 늘려서 있는 그대로 보여준다
      (admin/quote/admin-quote-apply-preset.js).
    */

    backgroundImageScale: 1,


    /*
      이미지 크기 고정.

      끄면(기본) 예전처럼 페이지 크기에 맞춰 cover로 덮는다 —
      페이지가 높아지면 사진도 함께 커진다.

      켜면 사진의 표시 너비를 **캔버스 너비에 대한 비율**로 잡는다
      (backgroundImageWidthRatio). 같은 캔버스 너비라면 페이지
      높이가 달라져도 사진 속 사물의 크기가 똑같다 — 1200×912와
      1200×2160 발췌에서 같은 크기로 나오고, 늘어난 만큼은 배경색
      바탕이 넓어질 뿐이다.

      ★ 기본값은 false다. 이미 저장된 프리셋을 이 옵션이 생겼다는
      이유만으로 켜지 않는다.
    */

    backgroundImageFixedSize: false,


    /*
      고정일 때의 표시 너비 ÷ 캔버스 너비. backgroundImageScale이
      여기에 곱해지므로 확대 슬라이더는 두 모드에서 같은 뜻을
      유지한다. 옵션을 켜는 순간 지금 그려진 크기 그대로가 되도록
      이 값을 잡는다(admin/quote/admin-quote-background.js).
    */

    backgroundImageWidthRatio: 1,


    /*
      사진에서 보여주고 싶은 중심 — **원본 이미지 기준의 정규화
      좌표**(0~1)다. 픽셀 이동량이 아니라 이 값을 저장하기 때문에,
      캔버스 비율/크기가 달라져도 같은 자리가 가운데로 온다
      (posts/style/posts-canvas-background.js).
    */

    backgroundImageFocusX: 0.5,
    backgroundImageFocusY: 0.5,


    /* 배경에만 걸리는 흐림(px) — 글자는 흐려지지 않는다 */

    backgroundImageBlur: 0,


    /* 이미지 위에 덮는 색과 농도(0~1) */

    backgroundOverlayColor: "#000000",
    backgroundOverlayOpacity: 0

  };


const POST_STYLE_TEXT_KEYS =
  [
    "ratio",
    "background",
    "titleColor",
    "titleWeight",
    "titleAlign",
    "bodyFont",
    "bodyColor",
    "highlightColor",
    "pointColor",
    "bodyWeight",
    "bodyAlign",
    "verticalAlign",
    "lineBreak",
    "actionColor",
    "actionWeight",
    "dialogueColor",
    "dialogueWeight",
    "sourceColor",
    "sourceWeight",
    "sourceAlign",

    "bodyRuleColor",
    "dialogueRuleColor",
    "sourceRuleColor",

    "backgroundOverlayColor"
  ];


const POST_STYLE_NUMBER_KEYS =
  [
    "ratioWidth",
    "ratioHeight",
    "exportWidth",
    "padding",
    "verticalPadding",
    "horizontalPadding",
    "titleSize",
    "titleLetterSpacing",
    "titleSpacing",
    "bodySize",
    "lineHeight",
    "letterSpacing",
    "paragraphSpacing",
    "indent",
    "sourceSize",
    "sourceSpacing",
    "sourceBottomOffset",

    "highlightHeight",

    "bodyRuleWidth",
    "dialogueRuleWidth",
    "sourceRuleWidth",

    "bodyRuleGap",
    "dialogueRuleGap",
    "sourceRuleGap",

    "backgroundImageScale",
    "backgroundImageWidthRatio",
    "backgroundImageFocusX",
    "backgroundImageFocusY",
    "backgroundImageBlur",
    "backgroundOverlayOpacity"
  ];


const POST_STYLE_BOOLEAN_KEYS =
  [
    "titleEnabled",
    "actionItalic",
    "dialogueItalic",
    "sourceEnabled",

    "dialogueRuleEnabled",
    "sourceRuleEnabled",

    "backgroundImageFixedSize"
  ];


function normalizePostStyleSettings(
  raw
) {

  const source =
    raw &&
    typeof raw === "object"
      ? raw
      : {};


  /*
    이미 정규화된 객체가 다시 들어오는 경로가 많다(페이지
    한 장마다 호출됨) — 두 번 돌려도 결과가 같아야 하고,
    비용이 또 들어서도 안 된다.
  */

  if (
    source.__postStyleNormalized ===
    true
  ) {

    return source;

  }


  const normalized =
    {
      ...source
    };


  POST_STYLE_TEXT_KEYS
    .forEach(
      key => {

        normalized[key] =
          postStyleText(
            source[key],
            POST_STYLE_DEFAULTS[key]
          );

      }
    );


  POST_STYLE_NUMBER_KEYS
    .forEach(
      key => {

        normalized[key] =
          postStyleNumber(
            source[key],
            POST_STYLE_DEFAULTS[key]
          );

      }
    );


  /* 참/거짓 — 명시적 false를 누락으로 보지 않는다 */

  POST_STYLE_BOOLEAN_KEYS
    .forEach(
      key => {

        normalized[key] =
          typeof source[key] === "boolean"
            ? source[key]
            : POST_STYLE_DEFAULTS[key];

      }
    );


  /*
    배경 이미지 주소는 "빈 문자열 = 배경 없음"이 유효한 값이다 —
    POST_STYLE_TEXT_KEYS(빈 값을 기본값으로 되돌림)에 넣으면 안 된다.
  */

  normalized.backgroundImageUrl =
    typeof source.backgroundImageUrl === "string"
      ? source.backgroundImageUrl.trim()
      : POST_STYLE_DEFAULTS.backgroundImageUrl;


  /* 빈 문자열도 사용자가 고른 값이다(출처 문구 비우기) */

  normalized.sourceText =
    typeof source.sourceText === "string"
      ? source.sourceText
      : POST_STYLE_DEFAULTS.sourceText;


  Object.defineProperty(
    normalized,
    "__postStyleNormalized",
    {
      value: true,
      enumerable: false
    }
  );


  return normalized;

}



/* =========================================================
   BODY STYLE
========================================================== */

function applyPostBodyStyles(
  container,
  settings = {}
) {

  if (!container) {
    return;
  }


  const resolved =
    normalizePostStyleSettings(
      settings
    );


  /*
    본문 폰트 선택(admin-quote BODY 섹션의 FONT). 항상
    인라인으로 직접 지정 — html2canvas 캡처(발췌 export)
    때 상속만 되어 있으면 못 읽고 시스템 명조체로 깨지는
    문제가 있었음.
  */

  container.style.fontFamily =
    resolved.bodyFont ===
    "nanummyeongjo"
      ? '"Nanum Myeongjo", serif'
      : '"Pretendard", sans-serif';


  container.style.color =
    resolved.bodyColor;


  /*
    ★ 예전에는 최소 13px로 강제했었는데, 그러면 사용자가
    admin-quote에서 일부러 작게(예: 9px) 설정해도 무시되고
    항상 13px로 나왔다. 설정값을 그대로 쓴다.
  */

  container.style.fontSize =
    `${resolved.bodySize}px`;


  container.style.fontWeight =
    String(
      resolved.bodyWeight
    );


  container.style.lineHeight =
    String(
      resolved.lineHeight
    );


  container.style.letterSpacing =
    `${resolved.letterSpacing}px`;


  container.style.textAlign =
    resolved.bodyAlign;


  applyPostLineBreakMode(
    container,
    resolved
  );

}


/*
  ★ lineBreak 세 모드의 의도(2026-09-12 재확인)

    keep  어절을 지킨다 — word-break: keep-all.
          한글 어절이 줄 끝에서 잘리지 않는다. 기본값.
    word  브라우저 기본 UAX#14 규칙 — word-break: normal.
          한글은 글자 단위로 자연스럽게 넘어간다.
    char  글자 단위로 강제로 끊는다 — word-break: break-all.

  overflow-wrap은 세 모드 모두 break-word로 통일한다.
  ★ 예전에는 Quote Preset 미리보기만 char에서 anywhere를
  썼다(감사 §4 (G)). anywhere는 구형 모바일 Safari 지원이
  불안정하고, break-all이 이미 글자 단위로 끊으므로 anywhere가
  더 해주는 일이 없다 — 양쪽을 break-word로 맞춘다.
*/

function applyPostLineBreakMode(
  container,
  settings = {}
) {

  if (!container) {
    return;
  }


  const mode =
    normalizePostStyleSettings(
      settings
    ).lineBreak;


  if (
    mode === "char"
  ) {

    container.style.wordBreak =
      "break-all";

  }


  else if (
    mode === "word"
  ) {

    container.style.wordBreak =
      "normal";

  }


  else {

    container.style.wordBreak =
      "keep-all";

  }


  container.style.overflowWrap =
    "break-word";

}



/* =========================================================
   문단 간격

   ★ 왜 <br>에 height를 주면 안 되는가

     이 에디터는 Enter를 눌러도 <div>/<p>가 아니라 <br>만
     만든다. 그래서 "연속된 <br> 두 개"가 문단 경계다. 예전
     구현은 그 두 번째 <br>에 display:block; height:Npx를
     박았는데, <br>은 레이아웃 엔진이 "줄바꿈 전용 인라인
     객체"로 다루기 때문에 display/height가 **적용되지
     않는다**(Chromium·WebKit 모두 확인 —
     IMORY_QUOTE_PRESET_RENDER_AUDIT.md §2.3). 마크업에는
     정확히 들어가는데 화면에는 늘 "빈 줄 한 개"(= 줄 높이
     하나)로만 보였고, 설정값을 0으로 줄이든 40으로 키우든
     간격이 그대로였다. 발행된 글 본문도 같은 함수를 쓰므로
     같은 증상이었다.

   ★ 지금 방식

     문단 경계(연속 <br> 두 개)를 **높이를 가진 빈 블록**
     하나로 바꾼다. 블록이므로 height가 실제 레이아웃에
     반영되고, 문단 사이 간격이 정확히

       (윗 문단 마지막 줄 높이) + paragraphSpacing

     이 된다 — Quote Preset 미리보기가 <p>의 margin-bottom으로
     내던 간격과 같은 정의다.

   ★ 네 가지를 구분한다

     일반 줄바꿈        <br> 한 개        그대로 둔다
     문단 구분          <br> 두 개        간격 블록 하나
     의도적 연속 빈 줄  <br> 세 개 이상   간격 블록 + 남은 <br>
                                          (= 빈 줄이 그만큼 남는다)
     PAGE break         .post-editor-page-break  건드리지 않는다

   ★ 인라인 서식 보존

     굵게/기울임/형광펜/강조색 span **안에서** 문단이 나뉘는
     경우도 있으므로 모든 깊이를 훑되, <br>만 바꾸고 조상
     요소는 그대로 둔다 — 서식 span이 잘리거나 사라지지 않는다.
     사진(<img>) 앞뒤의 문단 경계도 같은 규칙으로 처리된다.

   ★ 저장된 본문은 건드리지 않는다

     이 함수는 렌더링 단계에서만 동작한다. DB의 본문 HTML은
     예전 그대로 "<br><br>"이고, 여기서 만든 간격 블록은
     화면(과 발췌 캡처)에만 존재한다.
========================================================== */

const POST_PARAGRAPH_GAP_CLASS =
  "post-body-paragraph-gap";


function isPostParagraphGapNode(
  node
) {

  return (
    node?.nodeType ===
      Node.ELEMENT_NODE &&
    node.classList
      ?.contains(
        POST_PARAGRAPH_GAP_CLASS
      ) ===
      true
  );

}


function createPostParagraphGap(
  spacing
) {

  const gap =
    document.createElement(
      "span"
    );


  gap.className =
    POST_PARAGRAPH_GAP_CLASS;


  gap.setAttribute(
    "aria-hidden",
    "true"
  );


  /*
    인라인 span을 display:block으로 — <br>과 달리 블록
    박스는 height가 실제로 먹는다. 줄 높이가 끼어들지
    않도록 font-size/line-height도 0으로 죽인다.
  */

  gap.style.display =
    "block";


  gap.style.height =
    `${Math.max(0, spacing)}px`;


  gap.style.fontSize =
    "0";


  gap.style.lineHeight =
    "0";


  return gap;

}


function applyPostParagraphSpacing(
  container,
  settings = {}
) {

  if (!container) {
    return;
  }


  const spacing =
    Math.max(
      0,
      normalizePostStyleSettings(
        settings
      ).paragraphSpacing
    );


  /*
    먼저 이전 렌더가 남겨둔 간격 블록을 걷어낸다 — 같은
    컨테이너를 여러 번 그리는 경로에서 간격이 겹쳐 쌓이지
    않게.
  */

  container
    .querySelectorAll(
      `.${POST_PARAGRAPH_GAP_CLASS}`
    )
    .forEach(
      node => {

        node.remove();

      }
    );


  const visit =
    parent => {

      /*
        자식 목록을 먼저 복사해 두고 바꾼다 — 순회 도중
        DOM이 바뀌어도 안전하다.
      */

      const children =
        Array.from(
          parent.childNodes
        );


      let index =
        0;


      while (
        index < children.length
      ) {

        const node =
          children[index];


        if (
          node.nodeName !== "BR"
        ) {

          if (
            node.nodeType ===
            Node.ELEMENT_NODE
          ) {

            visit(
              node
            );

          }


          index += 1;


          continue;

        }


        /*
          연속된 <br> 런의 길이를 센다.
        */

        let runEnd =
          index;


        while (
          runEnd + 1 < children.length &&
          children[runEnd + 1].nodeName === "BR"
        ) {

          runEnd += 1;

        }


        if (
          runEnd - index + 1 < 2
        ) {

          /* 일반 줄바꿈 — 그대로 둔다 */

          index = runEnd + 1;


          continue;

        }


        /*
          문단 경계: 앞 두 개를 간격 블록 하나로 바꾼다.
          남은 <br>은 그대로 둬서 "의도적인 연속 빈 줄"이
          그 수만큼 남는다.
        */

        parent.insertBefore(
          createPostParagraphGap(
            spacing
          ),
          children[index]
        );


        children[index].remove();

        children[index + 1].remove();


        index = runEnd + 1;

      }

    };


  visit(
    container
  );

}
