/* =========================================================
   POSTS - DATE

   posts.js에서 분리됨.
   다른 파일에 의존하지 않는 순수 함수들.
========================================================== */

/* =========================================================
   VISIBILITY

   제목 앞에 붙이는 자물쇠/비공개 아이콘. public은 아무것도
   안 붙음.

   이모지를 그냥 텍스트로 이어붙이면 이모지 자체의 줄높이가
   본문 글자보다 커서, 목록에서 비밀글/비공개 글만 유독
   세로로 도드라져 보였다(줄바꿈 높이가 늘어남) — 그래서
   문자열이 아니라 별도 span으로 넣고 CSS(post-visibility-icon)
   에서 폰트 크기를 줄여서 맞춘다.
========================================================== */

function applyPostVisibilityTitle(
  titleElement,
  visibility,
  titleText
) {

  if (
    !titleElement
  ) {
    return;
  }


  titleElement.textContent =
    "";


  const icon =
    visibility ===
    "secret"
      ? "🔒"
      : visibility ===
        "private"
        ? "🙈"
        : "";


  if (icon) {

    const iconSpan =
      document.createElement(
        "span"
      );


    iconSpan.className =
      "post-visibility-icon";


    iconSpan.textContent =
      icon;


    titleElement.appendChild(
      iconSpan
    );

  }


  titleElement.appendChild(
    document.createTextNode(
      titleText ||
      "untitled"
    )
  );

}



/* =========================================================
   DATE
========================================================== */

function formatPostListDate(
  dateString
) {

  if (!dateString) {
    return "";
  }


  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Seoul",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    )
      .formatToParts(
        new Date(
          dateString
        )
      );


  const month =
    parts.find(
      part =>
        part.type === "month"
    )?.value || "";


  const day =
    parts.find(
      part =>
        part.type === "day"
    )?.value || "";


  return `${month}.${day}`;

}


function formatPostDetailDate(
  dateString
) {

  if (!dateString) {
    return "";
  }


  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Seoul",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false
      }
    )
      .formatToParts(
        new Date(
          dateString
        )
      );


  const getPart =
    type =>
      parts.find(
        part =>
          part.type === type
      )?.value || "";


  return (
    `${getPart("year")}.`
    +
    `${getPart("month")}.`
    +
    `${getPart("day")} `
    +
    `${getPart("hour")}:`
    +
    `${getPart("minute")}`
  );

}


/* =========================================================
   HTML 모드 — 바깥 코드 울타리 벗기기 (요구사항 9)

   ★ 무엇이 문제였나

     AI가 만들어 준 HTML을 그대로 붙여 넣으면 앞뒤에 마크다운
     코드 울타리가 따라온다.

       ```html
       <div style="...">…</div>
       ```

     HTML 모드는 저장된 글자를 그대로 innerHTML에 넣으므로, 그
     백틱 세 개가 **화면에 글자로** 나온다(첨부 사진 4).

   ★ 무엇만 벗기는가

     글 전체가 **하나의 울타리로 감싸져 있을 때** 그 여는 줄과
     닫는 줄만 없앤다. 여는 줄의 언어 표기(html, HTML, xml …)도
     그 줄의 일부라 함께 사라진다. 앞뒤의 빈 줄·공백은 울타리를
     찾기 전에 걷어낸다.

     안쪽 내용은 손대지 않는다 — HTML 안에 들어 있는 백틱,
     따옴표, `code` 같은 글자는 그대로 남는다. "백틱 세 개를
     전부 지운다" 같은 전역 치환은 쓰지 않는다.

   ★ 한 번만 벗긴다

     정규식이 글 전체를 한 번에 맞춰 보고, 맞으면 한 겹만
     벗긴다. 반복하지 않으므로 안쪽 내용이 또 울타리처럼 생겼어도
     더 깎이지 않는다.

   ★ 저장된 데이터는 고치지 않는다

     이 함수는 **그릴 때** 부른다(공개 본문 · HTML 이미지 저장).
     DB의 글자는 그대로 두므로 기존 글을 일괄로 덮어쓸 필요가
     없고, 같은 원본에서 매번 한 겹만 벗기니 몇 번을 다시 그려도
     결과가 같다.

     편집창의 HTML 칸에는 저장된 그대로 보여준다 — 사용자가
     무엇이 저장돼 있는지 볼 수 있어야 하고, 여기서 값을 바꾸면
     "열기만 했는데 내용이 달라지는" 일이 된다.

   ★ 일반 글(richtext)과 복사 상자에는 쓰지 않는다

     일반 글의 백틱은 사용자가 쓴 글자이고, 복사 상자의 내용은
     "입력한 그대로 복사"가 계약이다. 이 함수를 부르는 자리는
     HTML 모드 렌더 경로뿐이다.
========================================================== */

/*
  여는 울타리 = 줄 맨 앞의 ``` 또는 ~~~ (세 개 이상) + 언어 표기
  + 줄바꿈. 닫는 울타리 = 같은 문자로 된 줄 하나.

  여는 쪽과 닫는 쪽이 **같은 문자**여야 한다(``` 로 열고 ~~~ 로
  닫는 것은 울타리가 아니다).
*/

const POST_HTML_OUTER_FENCE_PATTERN =
  /^(`{3,}|~{3,})[ \t]*[A-Za-z0-9#+._-]*[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*\1[ \t]*$/;


function stripOuterHtmlCodeFence(
  content
) {

  if (
    typeof content !== "string"
  ) {

    return content;

  }


  const trimmed =
    content.trim();


  const match =
    POST_HTML_OUTER_FENCE_PATTERN.exec(
      trimmed
    );


  if (!match) {

    return content;

  }


  /*
    ★ 글 전체가 **하나의** 울타리일 때만 벗긴다.

    정규식의 끝 고정($) 때문에, 울타리 블록이 둘 이상 나란히 있는
    글에서는 "첫 번째 여는 줄"과 "마지막 닫는 줄"이 짝지어진다.
    그대로 벗기면 가운데에 있던 울타리들이 글자로 드러나면서
    오히려 더 지저분해진다.

    그래서 벗겨낸 안쪽에 같은 표시의 울타리 줄이 하나라도 남아
    있으면 감싼 것이 아니라고 보고 원본을 그대로 돌려준다.
    "감쌌는지 확실할 때만 손댄다" 쪽이 안전하다 — 놓친 울타리는
    눈에 보이지만, 잘못 벗긴 내용은 되돌릴 수 없다.
  */

  const innerFence =
    new RegExp(
      "^[ \\t]*" +
      match[1][0] +
      "{3,}",
      "m"
    );


  if (
    innerFence.test(
      match[2]
    )
  ) {

    return content;

  }


  return match[2];

}
