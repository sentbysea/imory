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
